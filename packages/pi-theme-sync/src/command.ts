import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  DynamicBorder,
  getSelectListTheme,
} from "@earendil-works/pi-coding-agent";
import {
  Container,
  Key,
  type SelectItem,
  SelectList,
  Spacer,
  Text,
  matchesKey,
} from "@earendil-works/pi-tui";
import {
  CONFIG_PATHS,
  POLL_INTERVAL_MIN_MS,
  isValidPollIntervalMs,
  loadConfig,
  writeConfigValue,
} from "./config.js";
import type { ThemeSyncRuntime } from "./runtime.js";
import type { ConfigScope, ConfigSource } from "./types.js";

type ConfigMessageSeverity = "success" | "error" | "warning";

type ConfigValueId =
  | "themes.light"
  | "themes.dark"
  | "detection.pollIntervalMs"
  | "isSyncActive";

type DraftConfig = Record<ConfigValueId, string>;

type ThemeSyncOverlayMode =
  | { kind: "menu" }
  | {
      kind: "config";
      message?: string;
      messageSeverity?: ConfigMessageSeverity;
    }
  | { kind: "status" }
  | { kind: "themeSelect"; fieldId: "themes.light" | "themes.dark" }
  | { kind: "syncSelect" }
  | { kind: "pollIntervalEdit"; value: string; error?: string }
  | { kind: "writeTarget" };

export async function openThemeSyncOverlay(
  runtime: ThemeSyncRuntime,
  ctx: ExtensionCommandContext,
): Promise<void> {
  if (!requireUI(ctx, "/theme-sync")) {
    return;
  }

  const loadedConfig = await loadConfig(ctx);
  const runtimeConfigSources = loadedConfig.runtimeConfigSources;

  const currentStateDraft: DraftConfig = {
    "themes.light": loadedConfig.runtimeConfig.themes.light,
    "themes.dark": loadedConfig.runtimeConfig.themes.dark,
    "detection.pollIntervalMs": String(
      loadedConfig.runtimeConfig.detection.pollIntervalMs,
    ),
    isSyncActive: loadedConfig.runtimeConfig.isSyncActive
      ? "active"
      : "inactive",
  };
  const desiredStateDraft: DraftConfig = { ...currentStateDraft };

  const selectTheme = getSelectListTheme();
  const themeNames = ctx.ui.getAllThemes().map((item) => item.name);

  let activeSelectList: SelectList | undefined;
  let mode: ThemeSyncOverlayMode = { kind: "menu" };
  let theme: ExtensionCommandContext["ui"]["theme"];

  let doneFn: () => void;
  let tui: { requestRender: () => void };

  const rootContainer = new Container();

  function buildMenuSelectList(done: () => void): SelectList {
    const items: SelectItem[] = [
      { value: "config", label: "Config" },
      { value: "status", label: "Status" },
    ];
    const list = new SelectList(items, items.length, selectTheme);

    list.onCancel = () => done();

    list.onSelect = (item) => {
      if (item.value === "config") {
        setMode({ kind: "config" });
      } else {
        setMode({ kind: "status" });
      }
    };

    return list;
  }

  function buildConfigSelectList(): SelectList {
    const items = [
      {
        value: "themes.light",
        label: "Light Mode Theme",
        description: `${desiredStateDraft["themes.light"]} [${formatSource(runtimeConfigSources.themes.light)}]`,
      },
      {
        value: "themes.dark",
        label: "Dark Mode Theme",
        description: `${desiredStateDraft["themes.dark"]} [${formatSource(runtimeConfigSources.themes.dark)}]`,
      },
      {
        value: "detection.pollIntervalMs",
        label: "Polling Interval",
        description: `${desiredStateDraft["detection.pollIntervalMs"]}ms [${formatSource(runtimeConfigSources.detection.pollIntervalMs)}]`,
      },
      {
        value: "isSyncActive",
        label: "Sync Status",
        description: `${desiredStateDraft.isSyncActive} [${formatSource(runtimeConfigSources.isSyncActive)}]`,
      },
    ];
    const list = new SelectList(items, items.length, selectTheme);

    list.onCancel = () => setMode({ kind: "menu" });

    list.onSelect = (item) => {
      switch (item.value) {
        case "themes.light":
          setMode({ kind: "themeSelect", fieldId: "themes.light" });

          break;
        case "themes.dark":
          setMode({ kind: "themeSelect", fieldId: "themes.dark" });

          break;
        case "detection.pollIntervalMs":
          setMode({
            kind: "pollIntervalEdit",
            value: desiredStateDraft["detection.pollIntervalMs"],
          });

          break;
        case "isSyncActive":
          setMode({ kind: "syncSelect" });

          break;
      }
    };

    return list;
  }

  function buildThemeSelectList(
    fieldId: "themes.light" | "themes.dark",
  ): SelectList {
    const items: SelectItem[] = themeNames.map((name) => ({
      value: name,
      label: name,
    }));
    const list = new SelectList(items, Math.min(items.length, 15), selectTheme);

    const currentValue = desiredStateDraft[fieldId];
    const currentIndex = themeNames.indexOf(currentValue);

    if (currentIndex >= 0) {
      list.setSelectedIndex(currentIndex);
    }

    list.onCancel = () => setMode({ kind: "config" });

    list.onSelect = (item) => {
      desiredStateDraft[fieldId] = item.value;

      setMode({ kind: "config" });
    };

    return list;
  }

  function buildSyncSelectList(): SelectList {
    const items: SelectItem[] = [
      { value: "active", label: "active" },
      { value: "inactive", label: "inactive" },
    ];
    const list = new SelectList(items, items.length, selectTheme);

    const currentIndex = desiredStateDraft.isSyncActive === "active" ? 0 : 1;

    list.setSelectedIndex(currentIndex);

    list.onCancel = () => setMode({ kind: "config" });

    list.onSelect = (item) => {
      desiredStateDraft.isSyncActive = item.value;

      setMode({ kind: "config" });
    };

    return list;
  }

  function buildWriteTargetSelectList(): SelectList {
    const items: SelectItem[] = [
      {
        value: "project",
        label: `Project (${CONFIG_PATHS.project(ctx.cwd)})`,
      },
      { value: "global", label: `Global (${CONFIG_PATHS.global})` },
    ];
    const list = new SelectList(items, items.length, selectTheme);

    list.onCancel = () => setMode({ kind: "config" });

    list.onSelect = (item) => {
      const scope = item.value as ConfigScope;

      void save(scope);
    };

    return list;
  }

  function handleInput(data: string): void {
    if (matchesKey(data, Key.ctrl("c"))) {
      doneFn();

      return;
    }

    switch (mode.kind) {
      case "menu":
        if (matchesKey(data, Key.escape)) {
          doneFn();

          return;
        }

        activeSelectList?.handleInput(data);
        tui.requestRender();

        return;
      case "config":
        if (matchesKey(data, Key.ctrl("s"))) {
          setMode({ kind: "writeTarget" });

          return;
        }

        if (matchesKey(data, Key.ctrl("r"))) {
          doneFn();
          void ctx.reload();

          return;
        }

        activeSelectList?.handleInput(data);
        tui.requestRender();

        return;
      case "themeSelect":
      case "syncSelect":
      case "writeTarget":
        activeSelectList?.handleInput(data);
        tui.requestRender();

        return;
      case "pollIntervalEdit":
        if (matchesKey(data, Key.enter)) {
          const parsed = Number(mode.value);

          if (!isValidPollIntervalMs(parsed)) {
            setMode({
              kind: "pollIntervalEdit",
              value: mode.value,
              error: `Polling interval must be a number >= ${POLL_INTERVAL_MIN_MS}.`,
            });

            return;
          }

          desiredStateDraft["detection.pollIntervalMs"] = String(
            Math.floor(parsed),
          );
          setMode({ kind: "config" });

          return;
        }

        if (matchesKey(data, Key.backspace)) {
          setMode({
            kind: "pollIntervalEdit",
            value: mode.value.slice(0, -1),
            error: undefined,
          });

          return;
        }

        if (matchesKey(data, Key.escape)) {
          setMode({ kind: "config" });

          return;
        }

        if (data.length === 1 && /[0-9]/.test(data)) {
          setMode({
            kind: "pollIntervalEdit",
            value: mode.value + data,
            error: undefined,
          });
        }

        return;
      case "status":
        if (matchesKey(data, Key.escape)) {
          setMode({ kind: "menu" });
        }

        tui.requestRender();

        return;
    }
  }

  function rebuild(): void {
    rootContainer.clear();
    activeSelectList = undefined;

    const borderFn = (text: string) => theme.fg("accent", text);

    function buildListOverlay(
      title: string,
      list: SelectList,
      hint: string,
      message?: { text: string; severity?: ConfigMessageSeverity },
    ): void {
      rootContainer.addChild(new DynamicBorder(borderFn));
      rootContainer.addChild(new Spacer(1));
      rootContainer.addChild(
        new Text(theme.fg("accent", theme.bold(title)), 1, 0),
      );
      rootContainer.addChild(new Spacer(1));
      rootContainer.addChild(list);

      if (message) {
        rootContainer.addChild(new Spacer(1));
        rootContainer.addChild(
          new Text(theme.fg(message.severity ?? "warning", message.text), 1, 0),
        );
      }

      rootContainer.addChild(new Spacer(1));
      rootContainer.addChild(new Text(theme.fg("dim", hint), 1, 0));
      rootContainer.addChild(new DynamicBorder(borderFn));
    }

    switch (mode.kind) {
      case "menu": {
        const list = buildMenuSelectList(doneFn);

        activeSelectList = list;

        buildListOverlay(
          "Theme Sync",
          list,
          "↑↓ navigate • Enter open • Ctrl+C / Esc quit",
        );

        break;
      }

      case "config": {
        const list = buildConfigSelectList();

        activeSelectList = list;

        buildListOverlay(
          "Theme Sync Config",
          list,
          "↑↓ move • Enter edit • Ctrl+S save • Ctrl+R reload • Esc back • Ctrl+C quit",
          mode.message
            ? { text: mode.message, severity: mode.messageSeverity }
            : undefined,
        );

        break;
      }

      case "themeSelect": {
        const title =
          mode.fieldId === "themes.light"
            ? "Light Mode Theme"
            : "Dark Mode Theme";
        const list = buildThemeSelectList(mode.fieldId);

        activeSelectList = list;

        buildListOverlay(
          title,
          list,
          "↑↓ navigate • Enter select • Esc back • Ctrl+C quit",
        );

        break;
      }

      case "syncSelect": {
        const list = buildSyncSelectList();

        activeSelectList = list;

        buildListOverlay(
          "Sync Status",
          list,
          "↑↓ navigate • Enter select • Esc back • Ctrl+C quit",
        );

        break;
      }

      case "pollIntervalEdit": {
        rootContainer.addChild(new DynamicBorder(borderFn));
        rootContainer.addChild(new Spacer(1));
        rootContainer.addChild(
          new Text(theme.fg("accent", theme.bold("Polling Interval")), 1, 0),
        );
        rootContainer.addChild(new Spacer(1));
        rootContainer.addChild(
          new Text(`Enter milliseconds (>= ${POLL_INTERVAL_MIN_MS})`, 1, 0),
        );
        rootContainer.addChild(new Spacer(1));
        rootContainer.addChild(
          new Text(`${theme.fg("accent", "> ")}${mode.value}`, 1, 0),
        );

        if (mode.error) {
          rootContainer.addChild(new Spacer(1));
          rootContainer.addChild(
            new Text(theme.fg("warning", mode.error), 1, 0),
          );
        }

        rootContainer.addChild(new Spacer(1));
        rootContainer.addChild(
          new Text(
            theme.fg(
              "dim",
              "Type digits • Enter confirm • Backspace delete • Esc back • Ctrl+C quit",
            ),
            1,
            0,
          ),
        );
        rootContainer.addChild(new DynamicBorder(borderFn));

        break;
      }

      case "writeTarget": {
        const list = buildWriteTargetSelectList();

        activeSelectList = list;

        buildListOverlay(
          "Write Config To",
          list,
          "↑↓ navigate • Enter save • Esc back • Ctrl+C quit",
        );

        break;
      }

      case "status": {
        const status = runtime.getStatus(ctx);

        const statusLines = [
          `Appearance:          ${status.currentAppearance}`,
          `Applied Theme:       ${status.appliedTheme}`,
          `Desired Theme:       ${status.desiredTheme ?? "n/a"}`,
          `Sync Active:         ${status.syncStatus === "active" ? "yes" : "no"}`,
          `Detection Strategy:  ${status.detectionStrategy}`,
          `Available Detectors: ${status.availableDetectors.join(", ") || "none"}`,
          `Polling Interval:    ${status.pollIntervalMs}ms`,
          `Last Update:         ${status.lastUpdateAt ? new Date(status.lastUpdateAt).toLocaleString() : "never"}`,
          `Last Event:          ${status.lastEvent}`,
        ];

        rootContainer.addChild(new DynamicBorder(borderFn));
        rootContainer.addChild(new Spacer(1));
        rootContainer.addChild(
          new Text(theme.fg("accent", theme.bold("Theme Sync Status")), 1, 0),
        );
        rootContainer.addChild(new Spacer(1));
        rootContainer.addChild(new Text(statusLines.join("\n"), 1, 0));

        if (status.warnings.length > 0) {
          const warningLines = [
            "Warnings:",
            ...status.warnings.map((warning) => `  - ${warning}`),
          ];

          rootContainer.addChild(new Spacer(1));
          rootContainer.addChild(
            new Text(theme.fg("warning", warningLines.join("\n")), 1, 0),
          );
        }

        rootContainer.addChild(new Spacer(1));
        rootContainer.addChild(
          new Text(theme.fg("dim", "Esc back • Ctrl+C quit"), 1, 0),
        );
        rootContainer.addChild(new DynamicBorder(borderFn));

        break;
      }
    }
  }

  async function save(scope: ConfigScope): Promise<void> {
    const updates: Array<[ConfigValueId, string | boolean | number]> = [];

    if (
      desiredStateDraft["themes.light"] !== currentStateDraft["themes.light"]
    ) {
      updates.push(["themes.light", desiredStateDraft["themes.light"]]);
    }

    if (desiredStateDraft["themes.dark"] !== currentStateDraft["themes.dark"]) {
      updates.push(["themes.dark", desiredStateDraft["themes.dark"]]);
    }

    if (
      desiredStateDraft["detection.pollIntervalMs"] !==
      currentStateDraft["detection.pollIntervalMs"]
    ) {
      updates.push([
        "detection.pollIntervalMs",
        Number(desiredStateDraft["detection.pollIntervalMs"]),
      ]);
    }

    if (desiredStateDraft.isSyncActive !== currentStateDraft.isSyncActive) {
      updates.push([
        "isSyncActive",
        desiredStateDraft.isSyncActive === "active",
      ]);
    }

    setMode({
      kind: "config",
      message: "Saving...",
      messageSeverity: "warning",
    });

    try {
      for (const [key, value] of updates) {
        await writeConfigValue(scope, ctx.cwd, key, value);
      }

      currentStateDraft["themes.light"] = desiredStateDraft["themes.light"];
      currentStateDraft["themes.dark"] = desiredStateDraft["themes.dark"];
      currentStateDraft["detection.pollIntervalMs"] =
        desiredStateDraft["detection.pollIntervalMs"];
      currentStateDraft.isSyncActive = desiredStateDraft.isSyncActive;

      setMode({
        kind: "config",
        message:
          updates.length === 0
            ? "No changes to save."
            : `Saved ${updates.length} changed setting(s) to ${scope === "project" ? "Project" : "Global"}.`,
        messageSeverity: updates.length === 0 ? "warning" : "success",
      });
    } catch (error) {
      setMode({
        kind: "config",
        message: `Error saving config: ${(error as Error).message}`,
        messageSeverity: "error",
      });
    }
  }

  function setMode(nextMode: ThemeSyncOverlayMode): void {
    mode = nextMode;

    rebuild();
    tui?.requestRender();
  }

  await ctx.ui.custom<void>(
    (tuiHandle, themeRef, _kb, done) => {
      tui = tuiHandle;
      theme = themeRef;
      doneFn = done;

      rebuild();

      return {
        dispose(): void {
          rootContainer.clear();
        },

        handleInput(data: string): void {
          handleInput(data);
        },

        invalidate(): void {
          rootContainer.invalidate();

          rebuild();
        },

        render(width: number): string[] {
          return rootContainer.render(width);
        },
      };
    },
    {
      overlay: true,
      overlayOptions: {
        anchor: "center",
        margin: 1,
        maxHeight: "90%",
        width: 78,
      },
    },
  );
}

function formatSource(source: ConfigSource): string {
  switch (source) {
    case "project":
      return "Project";
    case "global":
      return "Global";
    case "default":
      return "Default";
  }
}

function requireUI(ctx: ExtensionCommandContext, commandName: string): boolean {
  if (ctx.hasUI) {
    return true;
  }

  ctx.ui.notify(`UI support is required for ${commandName}`, "error");

  return false;
}
