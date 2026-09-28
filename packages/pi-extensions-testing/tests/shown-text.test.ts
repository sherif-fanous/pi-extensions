/**
 * Covers the shown-text recorder's stand-ins and each rule of
 * `findShownTextViolations`, including text the standard allows.
 */

import {
  createShownTextRecorder,
  findShownTextViolations,
} from "../src/index.js";
import type {
  ExtensionAPI,
  ExtensionUIContext,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

const RTK = { displayName: "RTK", slug: "rtk" } as const;
const THEME_SYNC = { displayName: "Theme Sync", slug: "theme-sync" } as const;

describe("createShownTextRecorder", () => {
  it("records what each stand-in shows and the keys it uses", async () => {
    const shown = createShownTextRecorder({
      choose: (_title, options) => options[1],
    });
    // The stand-ins fit Pi's own signatures, so fakes need no casts.
    const ui: Pick<
      ExtensionUIContext,
      "notify" | "select" | "setStatus" | "setWidget"
    > = shown;
    const pi: Pick<ExtensionAPI, "appendEntry"> = shown;

    ui.notify("RTK command rewriting enabled.", "info");
    ui.setStatus("rtk", "RTK ✓");
    pi.appendEntry("rtk:status-report", { body: "RTK Status" });
    pi.appendEntry("rtk:state", { enabled: true });
    ui.setWidget("rtk:hint", ["Hint line"]);
    await shown.recordCommand({
      description: "Turn RTK command rewriting on or off",
      getArgumentCompletions: () => [
        { description: "Show RTK status", label: "status", value: "status" },
      ],
    });

    await expect(
      ui.select("RTK (enabled)", ["Enable", "Disable"]),
    ).resolves.toBe("Disable");

    expect(shown.texts).toEqual([
      { surface: "notification", text: "RTK command rewriting enabled." },
      { surface: "status", text: "RTK ✓" },
      { surface: "report", text: "RTK Status" },
      { surface: "text", text: "Hint line" },
      { surface: "description", text: "Turn RTK command rewriting on or off" },
      { surface: "select", text: "RTK (enabled)" },
      { surface: "select", text: "Enable" },
      { surface: "select", text: "Disable" },
    ]);

    expect(shown.keys).toEqual([
      { key: "rtk", kind: "status" },
      { key: "rtk:status-report", kind: "entry" },
      { key: "rtk:state", kind: "entry" },
      { key: "rtk:hint", kind: "widget" },
    ]);

    expect(shown.completions).toEqual([
      { description: "Show RTK status", label: "status", value: "status" },
    ]);
  });
});

describe("findShownTextViolations", () => {
  it("accepts text that follows the standard", () => {
    const shown = createShownTextRecorder();

    shown.notify("Saved 1 changed setting to User.");
    shown.notify(
      'Theme Sync: 1 warning\n- Unknown subcommand "foo". Try /theme-sync or /theme-sync status.',
    );

    shown.notify(
      "Could not read configuration at /home/me/pi-theme-sync/.pi/theme-sync/settings.json: denied. Ignored the file.",
    );

    shown.notify(
      "Install it with pi install npm:@sherif-fanous/pi-theme-sync.",
    );
    shown.record("text", "The rtk binary was not found. Use !RTK_DISABLED=1.");
    shown.record("description", "Configure Theme Sync or show its status");
    shown.appendEntry("theme-sync:status-report", {
      body: [
        "Theme Sync Status",
        "  Applied theme:  dark",
        "  Pi version:     1.0",
        "  OSC 11 support: yes",
        "  Theme Sync active: yes",
        "  - list item: value",
        "Warnings:",
        "  - Configuration Path: ignored",
      ].join("\n"),
    });
    shown.setStatus("theme-sync", undefined);
    shown.setWidget("theme-sync:tui-handle", undefined);

    expect(findShownTextViolations(shown, THEME_SYNC)).toEqual([]);
  });

  it.each([
    ["pi-rtk enabled.", "names the package pi-rtk instead of its display name"],
    [
      "Pi Presets Plus failed.",
      "writes Pi Presets Plus instead of the display name alone",
    ],
    ["Configure theme sync.", "writes theme sync instead of Theme Sync"],
    ["Rtk is on.", "writes Rtk instead of RTK"],
    ["Saved 2 setting(s).", "writes a plural as (s)"],
    [
      "RTK enabled for this session",
      "is one line that does not end in a full stop",
    ],
  ])("flags the notification %j", (text, problem) => {
    const shown = createShownTextRecorder();

    shown.notify(text);

    expect(findShownTextViolations(shown, RTK)).toEqual([
      `notification ${JSON.stringify(text)}: ${problem}`,
    ]);
  });

  it.each([
    ["show RTK status", "does not start with a capital"],
    ["Show RTK status.", "ends with a period"],
    ["S".repeat(61), "is longer than 60 characters"],
  ])("flags the description %j", (text, problem) => {
    const shown = createShownTextRecorder();

    shown.record("description", text);

    expect(findShownTextViolations(shown, RTK)).toEqual([
      `description ${JSON.stringify(text)}: ${problem}`,
    ]);
  });

  it("flags a completion without a description or with a lowercase one", async () => {
    const shown = createShownTextRecorder();

    await shown.recordCommand({
      getArgumentCompletions: () => [
        { label: "enable", value: "enable" },
        { description: "show status", label: "status", value: "status" },
      ],
    });

    expect(findShownTextViolations(shown, RTK)).toEqual([
      'completion "enable": has no description',
      'completion "status": does not start with a capital',
    ]);
  });

  it("flags a report heading without the display name and Title Case labels", () => {
    const shown = createShownTextRecorder();
    const body = "Preset Status\n  Sync Active: yes\n  last update: never";

    shown.appendEntry("theme-sync:status-report", { body });

    expect(findShownTextViolations(shown, THEME_SYNC)).toEqual([
      `report ${JSON.stringify(body)}: heading "Preset Status" is not "Theme Sync <Thing>" in Title Case`,
      `report ${JSON.stringify(body)}: label "Sync Active:" is not in sentence case`,
      `report ${JSON.stringify(body)}: label "last update:" is not in sentence case`,
    ]);
  });

  it("flags keys outside the extension's namespace", () => {
    const shown = createShownTextRecorder();

    shown.setStatus("pi-rtk", undefined);
    shown.setWidget("pi-rtk-handle", undefined);
    shown.appendEntry("rtk:Status Report");
    shown.appendEntry("rtk");

    expect(findShownTextViolations(shown, RTK)).toEqual([
      'status key "pi-rtk": is not the bare slug rtk',
      'widget key "pi-rtk-handle": is not rtk:<thing>',
      'entry key "rtk:Status Report": is not rtk:<thing>',
      'entry key "rtk": is not rtk:<thing>',
    ]);
  });
});
