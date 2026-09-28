/**
 * Covers compiling the user access policy, including matcher validation,
 * permission decisions, and default selection for a directory.
 */
import {
  compilePolicy,
  isPermitted,
  matchesPreset,
  resolveMatchingRules,
  resolvePolicyDefault,
} from "../../src/store/policy.js";
import type { LoadedPreset } from "../../src/types.js";
import { describe, expect, it } from "vitest";

const PATH = "/agent/presets-plus/config.json";

function preset(name: string, extra: Partial<LoadedPreset> = {}): LoadedPreset {
  return {
    model: "claude-opus-4-8",
    name,
    provider: "anthropic",
    scope: "user",
    ...extra,
  };
}

/** Compile `rules` as a user file's `policy.rules` and return the rules. */
function rulesOf(rules: readonly unknown[]) {
  return compilePolicy({ rules }, PATH).rules;
}

describe("compilePolicy", () => {
  it.each([
    ["an absent section", undefined, [], []],
    ["empty rules", { rules: [] }, [], []],
    [
      "a section that is not an object",
      "work",
      [],
      [
        `The config file ${PATH} has an invalid "policy" section; expected an object with a "rules" array.`,
      ],
    ],
    [
      "a section without a rules array",
      { rules: {} },
      [],
      [
        `The config file ${PATH} has an invalid "policy" section; expected an object with a "rules" array.`,
      ],
    ],
    [
      "a rule without a string match",
      { rules: [{ match: 1 }, { match: "work" }] },
      ["work"],
      [`Skipped policy rule 1 in ${PATH}: "match" must be a string.`],
    ],
    [
      "a rule with an invalid match pattern",
      { rules: [{ match: "[" }, { match: "work" }] },
      ["work"],
      [`Skipped policy rule 1 in ${PATH}: match pattern "[" is invalid.`],
    ],
    [
      "an allow value that is not an array",
      { rules: [{ allow: { pattern: "a" }, match: "work" }] },
      ["work"],
      [
        `Ignored "allow" in policy rule 1 of ${PATH}: the value must be an array.`,
      ],
    ],
    [
      "a matcher without a string pattern",
      { rules: [{ match: "work", prohibit: [{ field: "name" }] }] },
      ["work"],
      [
        `Skipped the prohibit matcher in policy rule 1 of ${PATH}: "pattern" must be a string.`,
      ],
    ],
    [
      "a matcher with an unsupported field",
      { rules: [{ default: { field: "tools", pattern: "a" }, match: "work" }] },
      ["work"],
      [
        `Skipped default pattern "a" in policy rule 1 of ${PATH}: field "tools" is not supported.`,
      ],
    ],
    [
      "a matcher with an invalid pattern",
      { rules: [{ allow: [{ pattern: "[" }], match: "work" }] },
      ["work"],
      [
        `Skipped the allow matcher in policy rule 1 of ${PATH}: pattern "[" is invalid.`,
      ],
    ],
  ])(
    "compiles %s, keeping the usable rules",
    (_label, section, matches, warnings) => {
      const result = compilePolicy(section, PATH);

      expect(result.rules.map((rule) => rule.match)).toEqual(matches);
      expect(result.warnings).toEqual(warnings);
    },
  );

  it("skips only an invalid matcher and defaults fields to name", () => {
    const result = compilePolicy(
      {
        rules: [
          {
            allow: [{ pattern: "[" }, { pattern: "apple" }],
            default: { pattern: "opus" },
            match: "work",
            prohibit: [{ field: "provider", pattern: "openai" }],
          },
        ],
      },
      PATH,
    );
    const rule = result.rules[0];

    expect(rule?.allow).toHaveLength(1);
    expect(rule?.allow[0]?.field).toBe("name");
    expect(rule?.default?.field).toBe("name");
    expect(rule?.prohibit[0]?.field).toBe("provider");
    expect(result.warnings).toHaveLength(1);
  });
});

describe("policy matching and permissions", () => {
  it("uses raw regex semantics for name, provider, and combined model", () => {
    const policyRules = rulesOf([
      {
        allow: [
          { pattern: "apple" },
          { pattern: "^ifanous-$" },
          { field: "provider", pattern: "apple-genai" },
          { field: "model", pattern: "^anthropic/" },
        ],
        match: "project",
      },
    ]);

    const rule = policyRules[0];

    expect(rule).toBeDefined();
    if (!rule) return;

    const [nameSubstring, anchored, provider, model] = rule.allow;

    if (!nameSubstring || !anchored || !provider || !model) {
      throw new Error("Expected four compiled policy matchers.");
    }

    expect(matchesPreset(preset("apple-claude"), nameSubstring)).toBe(true);
    expect(matchesPreset(preset("apple-ifanous-test"), anchored)).toBe(false);
    expect(
      matchesPreset(
        preset("other", { provider: "apple-genai-anthropic" }),
        provider,
      ),
    ).toBe(true);
    expect(matchesPreset(preset("other"), model)).toBe(true);
  });

  it("unions matching rules, treats allow as a whitelist, and lets prohibit win", () => {
    const policyRules = rulesOf([
      {
        allow: [{ pattern: "^apple-" }],
        match: "work",
        prohibit: [{ pattern: "sonnet" }],
      },
      { match: "apple", prohibit: [{ pattern: "^virtasant-" }] },
    ]);

    const none = resolveMatchingRules("/personal", policyRules);
    const matched = resolveMatchingRules("/work/apple/project", policyRules);

    expect(isPermitted(preset("anything"), none)).toBe(true);
    expect(isPermitted(preset("ifanous-codex"), matched)).toBe(false);
    expect(isPermitted(preset("apple-opus"), matched)).toBe(true);
    expect(isPermitted(preset("apple-sonnet"), matched)).toBe(false);
    expect(isPermitted(preset("virtasant-model"), matched)).toBe(false);
  });
});

describe("resolvePolicyDefault", () => {
  it("uses longest match, then file order, then existing preset order", () => {
    const policyRules = rulesOf([
      { default: { pattern: "^apple-opus" }, match: "^/work/" },
      { default: { pattern: "^apple-opus-4-8$" }, match: "^/work/apple/" },
    ]);

    const result = resolvePolicyDefault(
      "/work/apple/project",
      [preset("apple-opus-4-7"), preset("apple-opus-4-8")],
      policyRules,
    );

    expect(result.kind).toBe("resolved");
    if (result.kind !== "resolved") return;
    expect(result.candidates.map(({ name }) => name)).toEqual([
      "apple-opus-4-8",
    ]);
    expect(result.winner.rule.index).toBe(1);
  });

  it("uses the first rule on equal spans", () => {
    const policyRules = rulesOf([
      { default: { pattern: "^first$" }, match: "work" },
      { default: { pattern: "^second$" }, match: "work" },
    ]);

    const result = resolvePolicyDefault(
      "/work",
      [preset("first"), preset("second")],
      policyRules,
    );

    expect(result.kind).toBe("resolved");
    if (result.kind !== "resolved") return;
    expect(result.candidates[0].name).toBe("first");
    expect(result.winner.rule.index).toBe(0);
  });

  it("lists several default candidates in preset order", () => {
    const policyRules = rulesOf([
      { default: { pattern: "opus" }, match: "work" },
    ]);

    const result = resolvePolicyDefault(
      "/work",
      [preset("second-opus"), preset("first-opus"), preset("other")],
      policyRules,
    );

    expect(result.kind).toBe("resolved");
    if (result.kind !== "resolved") return;
    expect(result.candidates.map(({ name }) => name)).toEqual([
      "second-opus",
      "first-opus",
    ]);
  });

  it("excludes prohibited, shadowed, and unavailable candidates", () => {
    const policyRules = rulesOf([
      {
        default: { pattern: "opus" },
        match: "work",
        prohibit: [{ pattern: "blocked" }],
      },
    ]);

    const result = resolvePolicyDefault(
      "/work",
      [
        preset("blocked-opus"),
        preset("shadowed-opus", { shadowed: true }),
        preset("unavailable-opus", { unavailable: "no-key" }),
        preset("allowed-opus"),
      ],
      policyRules,
    );

    expect(result.kind).toBe("resolved");

    if (result.kind === "resolved") {
      expect(result.candidates.map(({ name }) => name)).toEqual([
        "allowed-opus",
      ]);
    }
  });

  it("distinguishes no configured default from an unresolvable one", () => {
    const noDefault = resolvePolicyDefault(
      "/work",
      [],
      rulesOf([{ match: "work" }]),
    );

    expect(noDefault.kind).toBe("none");

    const unavailable = resolvePolicyDefault(
      "/work",
      [],
      rulesOf([{ default: { pattern: "missing" }, match: "work" }]),
    );

    expect(unavailable.kind).toBe("unresolvable");
  });
});
