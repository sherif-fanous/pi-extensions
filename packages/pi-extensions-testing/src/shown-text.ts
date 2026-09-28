/**
 * Records the text an extension shows the user and checks it against the
 * family's text and naming standard (the "Text and naming" section of the
 * repository's AGENTS.md).
 *
 * A package's test plugs the recorder's stand-ins into its own fake
 * context and `ExtensionAPI`, runs the main paths of its commands, and
 * asserts that {@link findShownTextViolations} returns no violations.
 */

import type { AutocompleteItem } from "@earendil-works/pi-tui";

/** The command registration fields {@link ShownTextRecorder.recordCommand} reads. */
export interface RecordableCommand {
  readonly description?: string;
  readonly getArgumentCompletions?: (
    argumentPrefix: string,
  ) => AutocompleteItem[] | null | Promise<AutocompleteItem[] | null>;
}

/** One internal key the extension used. */
export interface RecordedKey {
  readonly key: string;
  readonly kind: RecordedKeyKind;
}

/** One text the extension showed, and where. */
export interface ShownText {
  readonly surface: ShownSurface;
  readonly text: string;
}

/**
 * Stand-ins for the Pi surfaces that show text, which record everything
 * they receive.
 *
 * Every member is a plain function, so it can be placed directly on a
 * fake `ctx.ui` or `ExtensionAPI`.
 */
export interface ShownTextRecorder {
  /** Stand-in for `pi.appendEntry`: records the entry type, and `data.body` when it is text. */
  readonly appendEntry: (customType: string, data?: unknown) => void;
  /** Completions a command offered for an empty argument, from {@link ShownTextRecorder.recordCommand}. */
  readonly completions: AutocompleteItem[];
  /** Every internal key used, in order. */
  readonly keys: RecordedKey[];
  /** Stand-in for `ctx.ui.notify`. */
  readonly notify: (
    message: string,
    type?: "error" | "info" | "warning",
  ) => void;
  /** Record text shown on a surface no stand-in covers. */
  readonly record: (surface: ShownSurface, text: string) => void;
  /**
   * Record a command's description and the completions it offers for an
   * empty argument. Pass the options given to `pi.registerCommand`.
   */
  readonly recordCommand: (command: RecordableCommand) => Promise<void>;
  /** Stand-in for `ctx.ui.select`: records the title and options, then answers with `choose`. */
  readonly select: (
    title: string,
    options: readonly string[],
  ) => Promise<string | undefined>;
  /** Stand-in for `ctx.ui.setStatus`. */
  readonly setStatus: (key: string, text: string | undefined) => void;
  /** Stand-in for `ctx.ui.setWidget`: records the key, and the lines when content is text. */
  readonly setWidget: (key: string, content: unknown) => void;
  /** Every text shown, in order. */
  readonly texts: ShownText[];
}

/** The extension a violation check applies the standard for. */
export interface ShownTextStandard {
  /** Display name, such as `Presets Plus`. */
  readonly displayName: string;
  /** Words allowed to be capitalized inside a report label, besides display names and `Pi`. */
  readonly properNouns?: readonly string[];
  /** Folder name without `pi-`, such as `presets-plus`, which prefixes internal keys. */
  readonly slug: string;
}

/** Kind of internal key an extension registered or wrote under. */
export type RecordedKeyKind = "entry" | "status" | "widget";

/** Where a recorded text appeared. */
export type ShownSurface =
  /** A command or flag description, checked as a slash-menu description. */
  | "description"
  /** A `ctx.ui.notify` message. */
  | "notification"
  /** The `body` of a transcript entry, checked as a command report. */
  | "report"
  /** A `ctx.ui.select` title or option. */
  | "select"
  /** A footer status from `ctx.ui.setStatus`. */
  | "status"
  /** Any other text, such as widget lines or rendered overlay lines. */
  | "text";

/** Longest command, flag, or completion description the standard allows. */
const DESCRIPTION_MAX_LENGTH = 60;
const DISPLAY_NAMES = [
  "Notification Center",
  "Presets Plus",
  "RTK",
  "Session Slice",
  "Theme Sync",
] as const;
/** A package name in prose; a `/` or `.` before it marks a path or install spec. */
const PACKAGE_NAME_PATTERN =
  /(?<![\w./\\@-])pi-(?:notification-center|presets-plus|rtk|session-slice|theme-sync)(?![\w-])/gu;
const PI_PREFIX_PATTERN =
  /\bPi (?:Notification Center|Presets Plus|RTK|Session Slice|Theme Sync)\b/giu;
/** `rtk` in lowercase is the executable, so only other casings are checked. */
const MISCASED_RTK_PATTERN = /\b(?!RTK\b|rtk\b)[Rr][Tt][Kk]\b/gu;

/**
 * Create a recorder whose `select` answers with `choose(title, options)`,
 * or `undefined` (the user cancelled) when `choose` is absent.
 */
export function createShownTextRecorder({
  choose,
}: {
  choose?: (title: string, options: readonly string[]) => string | undefined;
} = {}): ShownTextRecorder {
  const completions: AutocompleteItem[] = [];
  const keys: RecordedKey[] = [];
  const texts: ShownText[] = [];
  const record = (surface: ShownSurface, text: string): void => {
    texts.push({ surface, text });
  };

  return {
    appendEntry: (customType, data) => {
      keys.push({ key: customType, kind: "entry" });

      if (isReport(data)) record("report", data.body);
    },
    completions,
    keys,
    notify: (message) => {
      record("notification", message);
    },
    record,
    recordCommand: async ({ description, getArgumentCompletions }) => {
      if (description !== undefined) record("description", description);

      completions.push(...((await getArgumentCompletions?.("")) ?? []));
    },
    select: (title, options) => {
      record("select", title);

      for (const option of options) record("select", option);

      return Promise.resolve(choose?.(title, options));
    },
    setStatus: (key, text) => {
      keys.push({ key, kind: "status" });

      if (text !== undefined) record("status", text);
    },
    setWidget: (key, content) => {
      keys.push({ key, kind: "widget" });

      if (Array.isArray(content)) {
        for (const line of content) {
          if (typeof line === "string") record("text", line);
        }
      }
    },
    texts,
  };
}

/**
 * Check everything a recorder captured against the text and naming
 * standard, returning one readable line per violation, or an empty list.
 *
 * Every text must name the family's extensions by display name only: no
 * `pi-<slug>` package name outside a path, no `Pi <Display Name>`, no
 * other casing of a display name, and no `(s)` plural. A one-line
 * notification must end in `.`, `!`, or `?`. A description (command,
 * flag, or completion) must start with a capital, have no trailing
 * period, and be at most 60 characters; every completion must have one.
 * A report's heading must be `<Display Name> <Thing>` in Title Case, and
 * each label before its `Warnings:` line must be in sentence case. The
 * footer status key must be the bare slug and every other key
 * `<slug>:<thing>`.
 */
export function findShownTextViolations(
  recorder: Pick<ShownTextRecorder, "completions" | "keys" | "texts">,
  standard: ShownTextStandard,
): string[] {
  const violations: string[] = [];

  for (const { surface, text } of recorder.texts) {
    const problems = [
      ...namingProblems(text),
      ...(surface === "description" ? descriptionProblems(text) : []),
      ...(surface === "notification" ? notificationProblems(text) : []),
      ...(surface === "report" ? reportProblems(text, standard) : []),
    ];

    for (const problem of problems) {
      violations.push(`${surface} ${JSON.stringify(text)}: ${problem}`);
    }
  }

  for (const { description, label } of recorder.completions) {
    const problems =
      description === undefined
        ? ["has no description"]
        : [...namingProblems(description), ...descriptionProblems(description)];

    for (const problem of problems) {
      violations.push(`completion ${JSON.stringify(label)}: ${problem}`);
    }
  }

  for (const { key, kind } of recorder.keys) {
    const problem = keyProblem(key, kind, standard.slug);

    if (problem)
      violations.push(`${kind} key ${JSON.stringify(key)}: ${problem}`);
  }

  return violations;
}

function descriptionProblems(text: string): string[] {
  return [
    ...(/^\p{Lu}/u.test(text) ? [] : ["does not start with a capital"]),
    ...(text.endsWith(".") ? ["ends with a period"] : []),
    ...(text.length > DESCRIPTION_MAX_LENGTH
      ? [`is longer than ${String(DESCRIPTION_MAX_LENGTH)} characters`]
      : []),
  ];
}

function isReport(data: unknown): data is { body: string } {
  return (
    typeof data === "object" &&
    data !== null &&
    "body" in data &&
    typeof data.body === "string"
  );
}

function keyProblem(
  key: string,
  kind: RecordedKeyKind,
  slug: string,
): string | undefined {
  if (kind === "status") {
    return key === slug ? undefined : `is not the bare slug ${slug}`;
  }

  const [namespace, thing, ...rest] = key.split(":");

  return namespace === slug &&
    rest.length === 0 &&
    thing !== undefined &&
    /^[a-z\d]+(?:-[a-z\d]+)*$/u.test(thing)
    ? undefined
    : `is not ${slug}:<thing>`;
}

function namingProblems(text: string): string[] {
  const problems: string[] = [];

  for (const [match] of text.matchAll(PACKAGE_NAME_PATTERN)) {
    problems.push(`names the package ${match} instead of its display name`);
  }

  for (const [match] of text.matchAll(PI_PREFIX_PATTERN)) {
    problems.push(`writes ${match} instead of the display name alone`);
  }

  for (const name of DISPLAY_NAMES) {
    const pattern =
      name === "RTK"
        ? MISCASED_RTK_PATTERN
        : new RegExp(`\\b${name}\\b`, "giu");

    for (const [match] of text.matchAll(pattern)) {
      if (match !== name) problems.push(`writes ${match} instead of ${name}`);
    }
  }

  if (text.includes("(s)")) problems.push("writes a plural as (s)");

  return problems;
}

function notificationProblems(text: string): string[] {
  if (text.includes("\n") || /[!.?]$/u.test(text)) return [];

  return ["is one line that does not end in a full stop"];
}

function reportProblems(text: string, standard: ShownTextStandard): string[] {
  const [heading = "", ...lines] = text.split("\n");
  const problems: string[] = [];
  const thing = heading.startsWith(`${standard.displayName} `)
    ? heading.slice(standard.displayName.length + 1)
    : undefined;

  if (thing === undefined || !/^\p{Lu}\S*(?: \p{Lu}\S*)*$/u.test(thing)) {
    problems.push(
      `heading ${JSON.stringify(heading)} is not "${standard.displayName} <Thing>" in Title Case`,
    );
  }

  const allowed = [...DISPLAY_NAMES, "Pi", ...(standard.properNouns ?? [])];

  for (const line of lines) {
    if (line === "Warnings:") break;

    // A label ends at the first colon followed by whitespace or the line
    // end, as in core's styleReport; list items are not labels.
    const label = /^(?!\s*- )\s*([^:]+):(?:\s|$)/u.exec(line)?.[1];

    if (label === undefined) continue;

    // An allowed noun becomes one capital letter, which passes both checks.
    const words = allowed
      .reduce((rest, noun) => rest.replaceAll(noun, "X"), label)
      .split(" ");
    const [first = "", ...others] = words;

    if (
      !/^\p{Lu}/u.test(first) ||
      others.some((word) => /^\p{Lu}\p{Ll}/u.test(word))
    ) {
      problems.push(
        `label ${JSON.stringify(`${label}:`)} is not in sentence case`,
      );
    }
  }

  return problems;
}
