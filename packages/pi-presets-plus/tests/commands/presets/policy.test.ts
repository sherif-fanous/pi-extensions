/**
 * Covers the `/presets policy` report: which presets it lists as allowed
 * or prohibited, how it resolves the default, and how it leaves
 * `config.json` untouched.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  formatPolicy,
  runPolicy,
} from "../../../src/commands/presets/policy.js";
import type {
  CompiledPolicyMatcher,
  CompiledPolicyRule,
} from "../../../src/store/policy.js";
import type { LoadedPreset } from "../../../src/types.js";
import {
  createFakeContext,
  createMarkerTheme,
  createTempConfigDirs,
  type TempConfigDirs,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, describe, expect, it, vi } from "vitest";

const workName: CompiledPolicyMatcher = {
  field: "name",
  pattern: "^work-",
  regex: /^work-/,
};
const personalProvider: CompiledPolicyMatcher = {
  field: "provider",
  pattern: "personal",
  regex: /personal/,
};
const rules: readonly CompiledPolicyRule[] = [
  {
    allow: [workName],
    default: workName,
    index: 0,
    match: "^/work/",
    matchRegex: /^\/work\//,
    prohibit: [personalProvider],
  },
];
const presets: readonly LoadedPreset[] = [
  preset("work-opus", "anthropic"),
  preset("work-personal", "personal"),
  preset("other", "anthropic"),
];

let dirs: TempConfigDirs | undefined;

afterEach(async () => {
  await dirs?.cleanup();
  dirs = undefined;
});

describe("formatPolicy", () => {
  it("reports mixed outcomes and a single resolved default", () => {
    expect(formatPolicy("/work/project", presets, rules)).toBe(
      [
        "Presets Plus Policy",
        "  Directory:          /work/project",
        "  Allowed presets:    work-opus",
        "  Prohibited presets: work-personal, other",
        "  Default preset:     work-opus",
      ].join("\n"),
    );
  });

  it("lists several permitted default matches in preset order", () => {
    const multipleDefaultRules = [
      rule({ allow: [], default: workName, prohibit: [] }),
    ];
    const orderedPresets = [
      preset("work-sonnet", "anthropic"),
      preset("work-opus", "anthropic"),
      preset("other", "anthropic"),
    ];

    expect(
      formatPolicy("/work/project", orderedPresets, multipleDefaultRules),
    ).toBe(
      [
        "Presets Plus Policy",
        "  Directory:          /work/project",
        "  Allowed presets:    work-sonnet, work-opus, other",
        "  Prohibited presets: none",
        "  Default preset:     work-sonnet",
        "  Default matches:    work-sonnet, work-opus",
      ].join("\n"),
    );
  });

  it("excludes prohibited presets from default matches", () => {
    const prohibitedDefaultRules = [
      rule({ allow: [], default: workName, prohibit: [personalProvider] }),
    ];
    const orderedPresets = [
      preset("work-sonnet", "anthropic"),
      preset("work-personal", "personal"),
      preset("work-opus", "anthropic"),
    ];

    expect(
      formatPolicy("/work/project", orderedPresets, prohibitedDefaultRules),
    ).toBe(
      [
        "Presets Plus Policy",
        "  Directory:          /work/project",
        "  Allowed presets:    work-sonnet, work-opus",
        "  Prohibited presets: work-personal",
        "  Default preset:     work-sonnet",
        "  Default matches:    work-sonnet, work-opus",
      ].join("\n"),
    );
  });

  it("reports all usable presets allowed", () => {
    const allAllowedRules = [
      rule({ allow: [], default: undefined, prohibit: [] }),
    ];

    expect(formatPolicy("/work/project", presets, allAllowedRules)).toBe(
      [
        "Presets Plus Policy",
        "  Directory:          /work/project",
        "  Allowed presets:    work-opus, work-personal, other",
        "  Prohibited presets: none",
        "  Default preset:     none",
      ].join("\n"),
    );
  });

  it("reports every usable preset prohibited", () => {
    const allProhibitedRules = [
      rule({ allow: [], default: undefined, prohibit: [matchAll()] }),
    ];

    expect(formatPolicy("/work/project", presets, allProhibitedRules)).toBe(
      [
        "Presets Plus Policy",
        "  Directory:          /work/project",
        "  Allowed presets:    none",
        "  Prohibited presets: work-opus, work-personal, other",
        "  Default preset:     none",
      ].join("\n"),
    );
  });

  it("omits unavailable and shadowed presets", () => {
    const annotated: readonly LoadedPreset[] = [
      preset("usable", "anthropic"),
      { ...preset("unavailable", "anthropic"), unavailable: "no-key" },
      { ...preset("shadowed", "anthropic"), shadowed: true },
    ];

    expect(
      formatPolicy("/work/project", annotated, [
        rule({ allow: [], default: undefined, prohibit: [] }),
      ]),
    ).toBe(
      [
        "Presets Plus Policy",
        "  Directory:          /work/project",
        "  Allowed presets:    usable",
        "  Prohibited presets: none",
        "  Default preset:     none",
      ].join("\n"),
    );
  });

  it("collapses an unresolvable default to none", () => {
    const unresolvableRules = [
      rule({ allow: [], default: workName, prohibit: [workName] }),
    ];

    expect(formatPolicy("/work/project", presets, unresolvableRules)).toBe(
      [
        "Presets Plus Policy",
        "  Directory:          /work/project",
        "  Allowed presets:    other",
        "  Prohibited presets: work-opus, work-personal",
        "  Default preset:     none",
      ].join("\n"),
    );
  });

  it("states when no rules match", () => {
    expect(formatPolicy("/personal", presets, rules)).toBe(
      "Presets Plus Policy\n  No preset policy applies to /personal.",
    );
  });
});

describe("runPolicy", () => {
  it("delivers one styled report with its warnings and does not modify config.json", async () => {
    dirs = await createTempConfigDirs();

    const path = join(dirs.agentDir, "presets-plus", "config.json");
    const original = `${JSON.stringify({ policy: { rules: [{ allow: {}, match: "work" }] }, version: 2 }, null, 2)}\n`;
    const notify = vi.fn();

    await dirs.writeText(path, original);

    await runPolicy(
      createFakeContext({
        cwd: "/work/project",
        mode: "print",
        ui: { notify, theme: createMarkerTheme() },
      }),
      { appendEntry: vi.fn() },
    );

    expect(await readFile(path, "utf-8")).toBe(original);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("Warnings:"),
      "warning",
    );

    expect(notify.mock.calls[0]?.[0]).toContain(
      "<accent><b>Presets Plus Policy</b></accent>",
    );

    expect(notify.mock.calls[0]?.[0]).toContain(
      "  <muted>Directory:</muted>          /work/project",
    );
  });
});

function matchAll(): CompiledPolicyMatcher {
  return { field: "name", pattern: ".*", regex: /.*/ };
}

function preset(name: string, provider: string): LoadedPreset {
  return { model: "model", name, provider, scope: "user" };
}

function rule(
  overrides: Pick<CompiledPolicyRule, "allow" | "default" | "prohibit">,
): CompiledPolicyRule {
  return {
    allow: overrides.allow,
    ...(overrides.default ? { default: overrides.default } : {}),
    index: 0,
    match: "^/work/",
    matchRegex: /^\/work\//,
    prohibit: overrides.prohibit,
  };
}
