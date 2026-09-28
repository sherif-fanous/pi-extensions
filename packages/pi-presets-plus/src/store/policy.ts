/**
 * Compiles the user-global preset access policy's patterns and evaluates
 * them against the working directory to decide which presets a directory
 * permits and which one it defaults to.
 */
import type { LoadedPreset } from "../types.js";
import { isRecord } from "@sherif-fanous/pi-extensions-core";

/**
 * A compiled policy section: its usable rules, and a warning for each part
 * it skipped.
 */
export interface CompiledPolicy extends PolicyRules {
  readonly warnings: readonly string[];
}

/** One allow, prohibit, or default pattern with its regex compiled. */
export interface CompiledPolicyMatcher {
  readonly field: PolicyMatcherField;
  readonly pattern: string;
  readonly regex: RegExp;
}

/**
 * One policy rule with every pattern compiled. `index` is the rule's
 * position in the file, which breaks ties between equally specific rules.
 */
export interface CompiledPolicyRule {
  readonly allow: readonly CompiledPolicyMatcher[];
  readonly default?: CompiledPolicyMatcher;
  readonly index: number;
  readonly match: string;
  readonly matchRegex: RegExp;
  readonly prohibit: readonly CompiledPolicyMatcher[];
}

/** A rule whose `match` pattern accepted the cwd, and how much it matched. */
export interface MatchedPolicyRule {
  readonly matchLength: number;
  readonly rule: CompiledPolicyRule;
}

/** The compiled rules of a policy, without the warnings compiling produced. */
export interface PolicyRules {
  readonly rules: readonly CompiledPolicyRule[];
}

/**
 * Outcome of resolving a directory default: no matching rule asks for one,
 * one or more usable, permitted presets match, or none do. A resolved
 * default lists its candidates in merged order, and the first one wins.
 */
export type PolicyDefaultResult =
  | {
      readonly kind: "none";
      readonly matchedRules: readonly MatchedPolicyRule[];
    }
  | {
      readonly kind: "resolved";
      readonly candidates: readonly [LoadedPreset, ...LoadedPreset[]];
      readonly matchedRules: readonly MatchedPolicyRule[];
      readonly winner: MatchedPolicyRule;
    }
  | {
      readonly kind: "unresolvable";
      readonly matchedRules: readonly MatchedPolicyRule[];
      readonly winner: MatchedPolicyRule;
    };

/** Preset field a matcher tests. `"model"` tests `provider/model`. */
export type PolicyMatcherField = "model" | "name" | "provider";

/**
 * Compile the user file's `policy` section, skipping each invalid rule or
 * matcher with a warning. An absent section compiles to no rules; one that
 * is not an object with a `rules` array compiles to no rules and one
 * warning.
 */
export function compilePolicy(section: unknown, path: string): CompiledPolicy {
  if (section === undefined) return { rules: [], warnings: [] };

  if (!isRecord(section) || !Array.isArray(section.rules)) {
    return {
      rules: [],
      warnings: [
        `The config file ${path} has an invalid "policy" section; expected an object with a "rules" array.`,
      ],
    };
  }

  const rawRules: readonly unknown[] = section.rules;
  const warnings: string[] = [];
  const rules: CompiledPolicyRule[] = [];

  for (let index = 0; index < rawRules.length; index++) {
    const candidate = rawRules[index];

    if (!isRecord(candidate) || typeof candidate.match !== "string") {
      warnings.push(
        `Skipped policy rule ${index + 1} in ${path}: "match" must be a string.`,
      );

      continue;
    }

    const matchRegex = compileRegex(candidate.match);

    if (!matchRegex) {
      warnings.push(
        `Skipped policy rule ${index + 1} in ${path}: match pattern ${JSON.stringify(candidate.match)} is invalid.`,
      );

      continue;
    }

    const allow = compileMatcherList(
      candidate.allow,
      "allow",
      index,
      path,
      warnings,
    );
    const prohibit = compileMatcherList(
      candidate.prohibit,
      "prohibit",
      index,
      path,
      warnings,
    );
    const defaultMatcher = compileOptionalMatcher(
      candidate.default,
      "default",
      index,
      path,
      warnings,
    );

    rules.push({
      allow,
      ...(defaultMatcher ? { default: defaultMatcher } : {}),
      index,
      match: candidate.match,
      matchRegex,
      prohibit,
    });
  }

  return { rules, warnings };
}

/**
 * Return whether the matched rules permit a preset.
 *
 * Allow entries union across the rules, so a rule set with no allow entry
 * permits everything, and a single prohibit match rejects the preset.
 */
export function isPermitted(
  preset: Pick<LoadedPreset, "model" | "name" | "provider">,
  matchedRules: readonly MatchedPolicyRule[],
): boolean {
  const allow = matchedRules.flatMap(({ rule }) => rule.allow);
  const prohibit = matchedRules.flatMap(({ rule }) => rule.prohibit);

  return (
    (allow.length === 0 ||
      allow.some((matcher) => matchesPreset(preset, matcher))) &&
    !prohibit.some((matcher) => matchesPreset(preset, matcher))
  );
}

/** Return whether a compiled matcher accepts a preset. */
export function matchesPreset(
  preset: Pick<LoadedPreset, "model" | "name" | "provider">,
  matcher: CompiledPolicyMatcher,
): boolean {
  const value =
    matcher.field === "model"
      ? `${preset.provider}/${preset.model}`
      : preset[matcher.field];

  return matcher.regex.test(value);
}

/** Return cwd-matching rules and the substring length consumed by each regex. */
export function resolveMatchingRules(
  cwd: string,
  rules: readonly CompiledPolicyRule[],
): MatchedPolicyRule[] {
  const matched: MatchedPolicyRule[] = [];

  for (const rule of rules) {
    const result = rule.matchRegex.exec(cwd);

    if (result) matched.push({ matchLength: result[0].length, rule });
  }

  return matched;
}

/** Resolve the applicable permitted default from an already-ordered preset list. */
export function resolvePolicyDefault(
  cwd: string,
  presets: readonly LoadedPreset[],
  rules: readonly CompiledPolicyRule[],
): PolicyDefaultResult {
  const matchedRules = resolveMatchingRules(cwd, rules);
  const defaultRules = matchedRules.filter(({ rule }) => rule.default);

  if (defaultRules.length === 0) return { kind: "none", matchedRules };

  const winner = defaultRules.reduce((best, candidate) =>
    candidate.matchLength > best.matchLength ? candidate : best,
  );
  const defaultMatcher = winner.rule.default;

  if (!defaultMatcher) return { kind: "none", matchedRules };

  const [preset, ...rest] = presets.filter(
    (candidate) =>
      !candidate.shadowed &&
      !candidate.unavailable &&
      isPermitted(candidate, matchedRules) &&
      matchesPreset(candidate, defaultMatcher),
  );

  return preset
    ? { kind: "resolved", candidates: [preset, ...rest], matchedRules, winner }
    : { kind: "unresolvable", matchedRules, winner };
}

/** Compile one matcher, or warn and return undefined when it is invalid. */
function compileMatcher(
  candidate: unknown,
  section: string,
  ruleIndex: number,
  path: string,
  warnings: string[],
): CompiledPolicyMatcher | undefined {
  if (!isRecord(candidate) || typeof candidate.pattern !== "string") {
    warnings.push(
      `Skipped the ${section} matcher in policy rule ${ruleIndex + 1} of ${path}: "pattern" must be a string.`,
    );

    return undefined;
  }

  const field = candidate.field ?? "name";

  if (field !== "name" && field !== "provider" && field !== "model") {
    warnings.push(
      `Skipped ${section} pattern ${JSON.stringify(candidate.pattern)} in policy rule ${ruleIndex + 1} of ${path}: field ${JSON.stringify(field)} is not supported.`,
    );

    return undefined;
  }

  const regex = compileRegex(candidate.pattern);

  if (!regex) {
    warnings.push(
      `Skipped the ${section} matcher in policy rule ${ruleIndex + 1} of ${path}: pattern ${JSON.stringify(candidate.pattern)} is invalid.`,
    );

    return undefined;
  }

  return { field, pattern: candidate.pattern, regex };
}

function compileMatcherList(
  candidate: unknown,
  section: "allow" | "prohibit",
  ruleIndex: number,
  path: string,
  warnings: string[],
): CompiledPolicyMatcher[] {
  if (candidate === undefined) return [];

  if (!Array.isArray(candidate)) {
    warnings.push(
      `Ignored "${section}" in policy rule ${ruleIndex + 1} of ${path}: the value must be an array.`,
    );

    return [];
  }

  return candidate.flatMap((matcher) => {
    const compiled = compileMatcher(
      matcher,
      section,
      ruleIndex,
      path,
      warnings,
    );

    return compiled ? [compiled] : [];
  });
}

function compileOptionalMatcher(
  candidate: unknown,
  section: "default",
  ruleIndex: number,
  path: string,
  warnings: string[],
): CompiledPolicyMatcher | undefined {
  if (candidate === undefined) return undefined;

  return compileMatcher(candidate, section, ruleIndex, path, warnings);
}

/** Compile a pattern, returning undefined instead of throwing on bad input. */
function compileRegex(pattern: string): RegExp | undefined {
  try {
    return new RegExp(pattern);
  } catch {
    return undefined;
  }
}
