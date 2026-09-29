/**
 * Drives the `ctx.ui.custom` overlay that lets the user browse, filter,
 * edit, and activate presets.
 */
import type { ActivationOutcome } from "../activation/activate.js";
import { detectDriftReasons } from "../activation/drift.js";
import type { ActivePresetSession } from "../activation/session.js";
import { EXTENSION_NAME } from "../extension-name.js";
import type { HotkeyRegistry } from "../hotkey-registry.js";
import { samePresetIdentity } from "../preset-identity.js";
import { loadPresetsConfig } from "../store/api.js";
import type { LoadedPreset } from "../types.js";
import { formatActionError } from "./action-error.js";
import type { ScopeFilter } from "./filter.js";
import { openInfoDialog } from "./info-dialog.js";
import {
  ACTIVATE_LABEL,
  ACTIVATION_FAILED_TITLE,
  BACK_LABEL,
  CLOSE_LABEL,
  CURSOR_LABEL,
  FILTER_LABEL,
  MOVE_LABEL,
  PAGE_LABEL,
  REORDER_LABEL,
  SCOPE_LABEL,
} from "./labels.js";
import { withHiddenOverlay } from "./overlay-host.js";
import {
  PICKER_ACTIONS,
  PickerCommands,
  type PickerCommandHost,
} from "./picker-commands.js";
import {
  layoutPickerViewport,
  pickerFallbackPageSize,
  pickerListLineBudget,
} from "./picker-layout.js";
import {
  cycleScope as cyclePickerScope,
  initialPickerState,
  loadedPresetKey,
  moveSelection as movePickerSelection,
  preserveSelectionOrFirst as preservePickerSelectionOrFirst,
  selectedPreset as selectedPickerPreset,
  selectedPresetKey as selectedPickerPresetKey,
  setFocusMode as setPickerFocusMode,
  visiblePresets as visiblePickerPresets,
  type PickerFocusMode,
  type PickerState,
} from "./picker-state.js";
import { formatScopeName, presetCard } from "./widgets.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionUIContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import {
  decodeKittyPrintable,
  Input,
  Key,
  matchesKey,
  sliceByColumn,
  truncateToWidth,
  visibleWidth,
  type Component,
  type Focusable,
  type KeybindingsManager,
  type OverlayHandle,
  type Terminal,
} from "@earendil-works/pi-tui";
import {
  emptyStateLines,
  frameBodyWidth,
  frameLine,
  frameSegment,
  frameTop,
  keyHint,
  listPosition,
  matchSelectAction,
  overlayOptions,
  padToWidth,
  wrapKeyHints,
  type ListMove,
} from "@sherif-fanous/pi-extensions-core";

/** Everything the picker needs from its caller to open. */
export interface PickerOptions {
  inheritedTools?: readonly string[];
  /**
   * Activation callback. An `applied` outcome closes the picker, and a
   * `refused` one keeps it open and shows the reason in a dialog.
   */
  onActivate(preset: LoadedPreset): Promise<ActivationOutcome>;
  hotkeys: HotkeyRegistry;
  pi?: ExtensionAPI;
  session: ActivePresetSession;
}

/** Outcome of a closed picker, naming the preset it activated. */
export interface PickerResult {
  activated?: LoadedPreset;
}

/** Rendered card lines plus the viewport they were laid out against. */
interface RenderListResult {
  readonly lines: string[];
  readonly pageSize: number;
  /** `(n/m)` when not every visible preset fits, else `undefined`. */
  readonly position: string | undefined;
  readonly scrollOffset: number;
}

class PresetPickerComponent implements Component, Focusable, PickerCommandHost {
  private _focused = false;
  private state: PickerState;
  private readonly filterInput = new Input();
  private cachedVisible?: { key: string; presets: readonly LoadedPreset[] };
  private overlayHandle: OverlayHandle | undefined;
  private balanceOpeningViewport = false;
  private renderedPageSize: number | undefined;
  private resolved = false;
  /** Busy line shown in place of the footer hints while an action runs. */
  private busyMessage: string | undefined;
  private readonly commands: PickerCommands = new PickerCommands(this);
  /**
   * Memoized drift reasons for the currently-active preset.
   *
   * `refreshPresets` clears the cache, so `detectDriftReasons` does not
   * re-run on every keystroke or scroll. The picker lives inside a single
   * agent turn, so the snapshot the reasons compare against cannot change
   * between renders.
   */
  private driftReasonsCache:
    { reasons: readonly string[]; signature: string } | undefined;

  constructor(
    private allPresets: LoadedPreset[],
    readonly ctx: ExtensionCommandContext,
    readonly pi: ExtensionAPI | undefined,
    readonly ui: Pick<ExtensionUIContext, "notify">,
    readonly theme: Theme,
    private readonly keybindings: KeybindingsManager,
    private readonly terminal: Pick<Terminal, "rows">,
    private inheritedTools: readonly string[],
    readonly hotkeys: HotkeyRegistry,
    readonly session: ActivePresetSession,
    readonly onActivate: (preset: LoadedPreset) => Promise<ActivationOutcome>,
    private readonly done: (result: PickerResult | undefined) => void,
    private readonly requestRender: () => void,
  ) {
    const active = session.current();

    this.state = preservePickerSelectionOrFirst(
      initialPickerState(),
      this.allPresets,
      "",
      active ? loadedPresetKey(active) : undefined,
      this.pageSize,
    );
    // A non-zero opening selection means the active preset was found below
    // the first card, which is the only case balancing changes.
    this.balanceOpeningViewport = this.state.selectedIndex > 0;
  }

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
    this.syncFilterFocus();
  }

  handleInput(input: string): void {
    if (this.busyMessage !== undefined) return;

    this.dispatchInput(input);
    // One render request per key dispatch shows the result of every
    // synchronous mutator without each path opting in. Async paths request
    // their own render, where this trailing request is a no-op.
    this.requestRender();
  }

  private dispatchInput(input: string): void {
    // Kitty CSI-u normalization keeps the `===` comparisons below correct
    // when a terminal wraps a plain printable key in a CSI-u sequence.
    const printable = decodeKittyPrintable(input);
    const normalized = printable ?? input;

    if (this.state.focusMode === "filter") {
      this.handleFilterInput(input);

      return;
    }

    const selectAction = matchSelectAction(this.keybindings, input);

    switch (selectAction) {
      case "cancel":
        this.finish(undefined);

        return;

      case "confirm": {
        const preset = this.currentSelection();

        if (preset) {
          this.runAction(`Activating "${preset.name}"…`, () =>
            this.activateSelection(),
          );
        }

        return;
      }

      case "down":
      case "pageDown":
      case "pageUp":
      case "up":
        this.moveSelection(selectAction);

        return;
      case undefined:
        break;
    }

    if (matchesKey(input, Key.left)) {
      this.cycleScope(-1);
    } else if (matchesKey(input, Key.right)) {
      this.cycleScope(1);
    } else if (matchesKey(input, Key.ctrl(Key.up))) {
      this.runAction("Reordering presets…", () => this.commands.reorder(-1));
    } else if (matchesKey(input, Key.ctrl(Key.down))) {
      this.runAction("Reordering presets…", () => this.commands.reorder(1));
    } else if (normalized === "/") {
      this.setFocusMode("filter");
    } else {
      // Dispatching over PICKER_ACTIONS keeps this chain and the footer
      // hint reading from the one registry.
      const action = PICKER_ACTIONS.find(
        (candidate) => candidate.key === normalized,
      );

      if (action) this.runAction(action.busy, () => action.run(this.commands));
    }
  }

  /**
   * Run an async action, ignoring input and showing `busy` in the footer
   * until it settles.
   */
  private runAction(busy: string, action: () => Promise<void>): void {
    this.busyMessage = busy;

    void (async () => {
      try {
        await action();
      } catch (error) {
        this.ui.notify(formatActionError(error), "error");
      } finally {
        this.busyMessage = undefined;
        this.requestRender();
      }
    })();
  }

  invalidate(): void {}

  setOverlayHandle(handle: OverlayHandle): void {
    this.overlayHandle = handle;
  }

  render(width: number): string[] {
    const bodyWidth = frameBodyWidth(width);
    const footerLines =
      this.busyMessage === undefined
        ? wrapKeyHints(this.footerHints(), bodyWidth)
        : [this.busyMessage];
    const list = this.renderList(bodyWidth, footerLines.length);
    const row = (content: string): string =>
      frameLine(` ${padToWidth(content, bodyWidth)} `, width, this.theme);
    const rule = frameSegment("├", "┤", width, this.theme);
    const scope = `Scope: ${formatScopeFilter(this.state.scopeFilter)}`;

    this.renderedPageSize = list.pageSize > 0 ? list.pageSize : undefined;

    if (list.scrollOffset !== this.state.scrollOffset) {
      this.state = { ...this.state, scrollOffset: list.scrollOffset };
    }

    return [
      frameTop(
        EXTENSION_NAME,
        width,
        this.theme,
        this.theme.fg(
          "muted",
          list.position === undefined ? scope : `${scope} · ${list.position}`,
        ),
      ),
      row(this.renderActiveStatusContent(bodyWidth)),
      row(this.renderFilterContent(bodyWidth)),
      rule,
      ...list.lines.map(row),
      rule,
      ...footerLines.map((line) => row(this.theme.fg("dim", line))),
      frameSegment("└", "┘", width, this.theme),
    ];
  }

  private async activateSelection(): Promise<void> {
    const preset = selectedPickerPreset(
      this.state,
      this.allPresets,
      this.filterInput.getValue(),
    );

    if (!preset) return;

    const outcome = await this.runWithHiddenOverlay(async () => {
      const activation = await this.onActivate(preset);

      if (activation.kind === "refused") {
        await openInfoDialog(this.ctx, {
          body: this.theme.fg("error", activation.reason),
          title: ACTIVATION_FAILED_TITLE,
        });
      }

      return activation;
    });

    if (outcome.kind === "applied") this.finish({ activated: preset });
  }

  private cycleScope(direction: -1 | 1): void {
    this.state = cyclePickerScope(
      this.state,
      this.allPresets,
      this.filterInput.getValue(),
      direction,
      this.pageSize,
    );
    this.invalidateVisible();
  }

  /** {@link PickerCommandHost} member. */
  currentSelection(): LoadedPreset | undefined {
    return selectedPickerPreset(
      this.state,
      this.allPresets,
      this.filterInput.getValue(),
    );
  }

  /**
   * Look up the drift reasons for the active preset, reusing the cache.
   *
   * The cache key is the active identity (`scope:name:dirty`), so a tools
   * toggle or a scope change invalidates it while a filter keystroke or a
   * page scroll does not. The compared snapshot lives on
   * `active.declared`, so the lookup does no disk I/O.
   */
  private computeDriftReasons(
    active: NonNullable<ReturnType<ActivePresetSession["current"]>>,
    pi: ExtensionAPI,
  ): readonly string[] {
    const signature = `${active.scope}:${active.name}:${active.dirty ? "1" : "0"}`;

    if (this.driftReasonsCache?.signature === signature) {
      return this.driftReasonsCache.reasons;
    }

    const reasons = detectDriftReasons(active.declared, pi, this.ctx);

    this.driftReasonsCache = { reasons, signature };

    return reasons;
  }

  /** {@link PickerCommandHost} member. */
  getAllPresets(): readonly LoadedPreset[] {
    return this.allPresets;
  }

  /** {@link PickerCommandHost} member. */
  async runWithHiddenOverlay<T>(fn: () => Promise<T>): Promise<T> {
    return withHiddenOverlay(this.overlayHandle, this.requestRender, fn);
  }

  /** {@link PickerCommandHost} member. */
  async refreshPresets(selectionKey?: string): Promise<void> {
    // Load warnings show at session start and on /presets reload, so a
    // refresh does not repeat them.
    const { presets } = await loadPresetsConfig(this.ctx);

    this.allPresets = presets;
    this.inheritedTools = this.pi?.getActiveTools() ?? this.inheritedTools;
    this.invalidateVisible();
    this.driftReasonsCache = undefined;
    this.state = preservePickerSelectionOrFirst(
      this.state,
      this.allPresets,
      this.filterInput.getValue(),
      selectionKey ??
        selectedPickerPresetKey(
          this.state,
          this.allPresets,
          this.filterInput.getValue(),
        ),
      this.pageSize,
    );
    this.requestRender();
  }

  /**
   * {@link PickerCommandHost} member.
   *
   * Idempotent, so a rapid second Enter cannot resolve the picker twice.
   */
  finish(result: PickerResult | undefined): void {
    if (this.resolved) return;
    this.resolved = true;
    this.done(result);
  }

  private handleFilterInput(input: string): void {
    const selectAction = matchSelectAction(this.keybindings, input);

    switch (selectAction) {
      case "cancel":
      case "confirm":
        this.setFocusMode("list");

        return;
      // Navigation keys stay live in filter mode so the user can type and
      // then move without going back to the list first.
      case "down":
      case "pageDown":
      case "pageUp":
      case "up":
        this.moveSelection(selectAction);

        return;
      case undefined:
        break;
    }

    const previousQuery = this.filterInput.getValue();
    const previousSelection = selectedPickerPresetKey(
      this.state,
      this.allPresets,
      previousQuery,
    );

    this.filterInput.handleInput(input);

    if (this.filterInput.getValue() !== previousQuery) {
      this.invalidateVisible();
      this.state = preservePickerSelectionOrFirst(
        this.state,
        this.allPresets,
        this.filterInput.getValue(),
        previousSelection,
        this.pageSize,
      );
    }
  }

  private invalidateVisible(): void {
    this.cachedVisible = undefined;
  }

  private moveSelection(move: ListMove): void {
    this.state = movePickerSelection(
      this.state,
      this.allPresets,
      this.filterInput.getValue(),
      move,
      this.pageSize,
    );
  }

  /**
   * Page size in cards, learned from the last variable-height layout pass.
   * The fallback keeps navigation usable before the first render.
   */
  private get pageSize(): number {
    return this.renderedPageSize ?? pickerFallbackPageSize(this.terminal.rows);
  }

  private renderFilterContent(width: number): string {
    const label = this.theme.fg("muted", "Filter: ");
    const inputWidth = labelledContentWidth(width, label);
    const query = this.filterInput.getValue();

    if (this.state.focusMode !== "filter" && query.length === 0) {
      return `${label}${this.theme.fg("dim", "Type to filter.")}`;
    }

    const inputLine = this.filterInput.render(inputWidth)[0] ?? "";

    return `${label}${inputLine}`;
  }

  private renderActiveStatusContent(width: number): string {
    const label = this.theme.fg("muted", "Active: ");
    const contentWidth = labelledContentWidth(width, label);
    const active = this.session.current();

    // A preset may legally be named `none`, so the sentinel renders in
    // `dim` to read as an absence marker.
    if (!active) {
      const sentinel = this.theme.fg(
        "dim",
        middleEllipsize("none", contentWidth),
      );

      return `${label}${sentinel}`;
    }

    // The dimmed scope suffix identifies the active preset as precisely as
    // the in-list dot, which matches on name and scope together.
    const scopeSuffix = ` (${formatScopeName(active.scope)})`;
    const nameWidth = Math.max(1, contentWidth - visibleWidth(scopeSuffix));
    const name = middleEllipsize(active.name, nameWidth);

    return `${label}${name}${this.theme.fg("dim", scopeSuffix)}`;
  }

  /**
   * Key hints for the current focus mode, in footer order. Keys that need
   * a selected preset are left out while no preset is visible.
   */
  private footerHints(): (string | undefined)[] {
    const { keybindings } = this;
    const hasSelection = this.visiblePresets().length > 0;
    const movement = hasSelection
      ? [
          keyHint(
            keybindings,
            ["tui.select.up", "tui.select.down"],
            MOVE_LABEL,
          ),
          keyHint(
            keybindings,
            ["tui.select.pageUp", "tui.select.pageDown"],
            PAGE_LABEL,
          ),
        ]
      : [];

    if (this.state.focusMode === "filter") {
      return [
        ...movement,
        `←/→ ${CURSOR_LABEL}`,
        keyHint(
          keybindings,
          ["tui.select.confirm", "tui.select.cancel"],
          BACK_LABEL,
        ),
      ];
    }

    return [
      ...movement,
      `←/→ ${SCOPE_LABEL}`,
      ...(hasSelection
        ? [keyHint(keybindings, "tui.select.confirm", ACTIVATE_LABEL)]
        : []),
      ...PICKER_ACTIONS.filter(
        (action) => hasSelection || !action.needsSelection,
      ).map((action) => `${action.key} ${action.label}`),
      ...(hasSelection ? [`Ctrl+↑/↓ ${REORDER_LABEL}`] : []),
      `/ ${FILTER_LABEL}`,
      keyHint(keybindings, "tui.select.cancel", CLOSE_LABEL),
    ];
  }

  private renderList(width: number, footerLineCount: number): RenderListResult {
    const visiblePresets = this.visiblePresets();
    // Consume the opening hint before any early return, so a first frame
    // with no matches cannot leave it armed for a later render.
    const balanced = this.balanceOpeningViewport;

    this.balanceOpeningViewport = false;

    if (visiblePresets.length === 0) {
      const message =
        this.allPresets.length === 0
          ? "No presets yet. Press n to create one."
          : "No presets match this filter.";

      return {
        lines: emptyStateLines(message, width, this.theme),
        pageSize: 0,
        position: undefined,
        scrollOffset: this.state.scrollOffset,
      };
    }

    const active = this.session.current();
    const cardLinesByIndex = new Map<number, readonly string[]>();
    const cardHeightAt = (absoluteIndex: number): number => {
      const cachedLines = cardLinesByIndex.get(absoluteIndex);

      if (cachedLines) return cachedLines.length;

      const preset = visiblePresets[absoluteIndex];

      if (!preset) return 0;

      const isActive = samePresetIdentity(active, preset);
      const driftReasons =
        isActive && active?.dirty && this.pi
          ? this.computeDriftReasons(active, this.pi)
          : undefined;
      const card = presetCard(preset, this.theme, {
        active: isActive,
        ...(isActive && active?.dirty ? { dirty: true } : {}),
        ...(driftReasons ? { driftReasons } : {}),
        inheritedTools: this.inheritedTools,
        selected: absoluteIndex === this.state.selectedIndex,
        showShadowed: this.state.scopeFilter === "all",
      });
      const cardLines = card.render(width);

      cardLinesByIndex.set(absoluteIndex, cardLines);

      return cardLines.length;
    };
    const layout = layoutPickerViewport(
      visiblePresets.length,
      this.state.selectedIndex,
      this.state.scrollOffset,
      pickerListLineBudget(this.terminal.rows, footerLineCount),
      cardHeightAt,
      balanced,
    );

    const lines: string[] = [];

    for (let index = layout.startIndex; index < layout.endIndex; index++) {
      if (index > layout.startIndex) lines.push("");

      lines.push(...(cardLinesByIndex.get(index) ?? []));
    }

    return {
      lines,
      pageSize: layout.pageSize,
      position:
        layout.pageSize < visiblePresets.length
          ? listPosition(this.state.selectedIndex, visiblePresets.length)
          : undefined,
      scrollOffset: layout.scrollOffset,
    };
  }

  private setFocusMode(focusMode: PickerFocusMode): void {
    this.state = setPickerFocusMode(this.state, focusMode);
    this.syncFilterFocus();
  }

  private syncFilterFocus(): void {
    this.filterInput.focused =
      this._focused && this.state.focusMode === "filter";
  }

  private visiblePresets(): readonly LoadedPreset[] {
    const cacheKey = `${this.state.scopeFilter}|${this.filterInput.getValue()}`;

    if (this.cachedVisible?.key === cacheKey) {
      return this.cachedVisible.presets;
    }

    const presets = visiblePickerPresets(
      this.state,
      this.allPresets,
      this.filterInput.getValue(),
    );

    this.cachedVisible = { key: cacheKey, presets };

    return presets;
  }
}

/** Open the preset picker and resolve once the user closes it. */
export async function openPicker(
  ctx: ExtensionCommandContext,
  options: PickerOptions,
): Promise<PickerResult | undefined> {
  // Load warnings show at session start and on /presets reload, so opening
  // the picker does not repeat them.
  const { presets } = await loadPresetsConfig(ctx);
  const inheritedTools = options.inheritedTools ?? [];
  let currentPicker: PresetPickerComponent | undefined;

  return ctx.ui.custom<PickerResult | undefined>(
    (tui, theme, keybindings, done) => {
      const picker = new PresetPickerComponent(
        presets,
        ctx,
        options.pi,
        ctx.ui,
        theme,
        keybindings,
        tui.terminal,
        inheritedTools,
        options.hotkeys,
        options.session,
        (preset) => options.onActivate(preset),
        done,
        () => tui.requestRender(),
      );

      currentPicker = picker;

      return picker;
    },
    {
      onHandle: (handle) => currentPicker?.setOverlayHandle(handle),
      overlay: true,
      overlayOptions: overlayOptions("main"),
    },
  );
}

function formatScopeFilter(scopeFilter: ScopeFilter): string {
  switch (scopeFilter) {
    case "all":
      return "All";
    case "user":
      return "User only";
    case "project":
      return "Project only";
  }
}

/**
 * Visible columns left for a labelled chrome row's value once the label
 * is reserved from the `width` of the frame body.
 *
 * `visibleWidth` strips ANSI, so callers pass the already-themed label,
 * the same string the rendered row concatenates, to keep this measurement
 * aligned with what the frame later pads against. The result is clamped
 * to 1 so an over-wide label degrades to a single value column instead of
 * a negative budget.
 */
function labelledContentWidth(width: number, label: string): number {
  return Math.max(1, width - visibleWidth(label));
}

/**
 * Truncate `text` in the middle to fit `width` visible columns, keeping the
 * leading and trailing portions around a single `…`.
 *
 * Text that already fits comes back unchanged, and the result never exceeds
 * `width`. The prefix takes the larger half of the remaining budget and the
 * suffix the smaller, so the start of the name survives, and both sides cut
 * on grapheme-cluster boundaries so neither half splits a glyph.
 */
function middleEllipsize(text: string, width: number): string {
  const textWidth = visibleWidth(text);

  if (textWidth <= width) return text;

  if (width <= 1) return truncateToWidth(text, width, "…");

  const ellipsis = "…";
  const sideBudget = width - visibleWidth(ellipsis);
  const prefixWidth = Math.ceil(sideBudget / 2);
  const suffixWidth = Math.floor(sideBudget / 2);
  const prefix = truncateToWidth(text, prefixWidth, "");
  const suffix = sliceByColumn(
    text,
    textWidth - suffixWidth,
    suffixWidth,
    true,
  );

  return `${prefix}${ellipsis}${suffix}`;
}
