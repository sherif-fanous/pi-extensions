import { loadConfig, type ConfigFs } from "../src/config.js";
import { CONFIG_RANGES, DEFAULT_CONFIG } from "../src/types.js";
import { describe, expect, it } from "vitest";

describe("loadConfig", () => {
  it("uses every default and stays silent when the file is absent", () => {
    const result = loadConfig("/agent", missingFs());

    expect(result.config).toEqual(DEFAULT_CONFIG);
    expect(result.warnings).toEqual([]);
  });

  it("applies valid overrides for every supported field", () => {
    const result = loadConfig(
      "/agent",
      contentsFs(
        JSON.stringify({
          maxToastsVisible: 2,
          toast: { maxLines: 2, timeout: 250, width: 80 },
        }),
      ),
    );

    expect(result.config).toEqual({
      maxToastsVisible: 2,
      toast: { maxLines: 2, timeout: 250, width: 80 },
    });
    expect(result.warnings).toEqual([]);
  });

  it("reads and validates every documented setting", () => {
    // Guards the loader against a setting that gains a documented range
    // but is never read, which would ignore the user's value in silence.
    for (const [path, range] of Object.entries(CONFIG_RANGES)) {
      const belowRange = range.min - 1;
      const document = path.startsWith("toast.")
        ? { toast: { [path.slice("toast.".length)]: belowRange } }
        : { [path]: belowRange };
      // The warning has to name the default of the field it is about. The
      // loader reaches that value through a leaf key it derives from the
      // dotted path, so a warning can name the wrong field's default
      // while every count and field name still looks right.
      const fallback = path.startsWith("toast.")
        ? DEFAULT_CONFIG.toast[
            path.slice("toast.".length) as keyof typeof DEFAULT_CONFIG.toast
          ]
        : DEFAULT_CONFIG.maxToastsVisible;

      const result = loadConfig("/agent", contentsFs(JSON.stringify(document)));

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain(`"${path}"`);
      expect(result.warnings[0]).toContain(`default value ${String(fallback)}`);
    }
  });

  it("ignores unknown keys without complaining", () => {
    const result = loadConfig(
      "/agent",
      contentsFs(
        JSON.stringify({
          position: "bottom-left",
          toast: { style: "rounded", width: 30 },
        }),
      ),
    );

    expect(result.config).toEqual({
      maxToastsVisible: DEFAULT_CONFIG.maxToastsVisible,
      toast: { ...DEFAULT_CONFIG.toast, width: 30 },
    });
    expect(result.warnings).toEqual([]);
  });

  it("keeps valid fields and defaults each invalid one", () => {
    const result = loadConfig(
      "/agent",
      contentsFs(
        JSON.stringify({
          maxToastsVisible: 99,
          toast: { timeout: 5000, width: "wide" },
        }),
      ),
    );

    expect(result.config).toEqual({
      maxToastsVisible: DEFAULT_CONFIG.maxToastsVisible,
      toast: { ...DEFAULT_CONFIG.toast, timeout: 5000 },
    });
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.join(" ")).toContain("maxToastsVisible");
    expect(result.warnings.join(" ")).toContain("toast.width");
  });

  it("rejects non-integer and out-of-range numbers", () => {
    const result = loadConfig(
      "/agent",
      contentsFs(
        JSON.stringify({
          // A fraction inside the 250 through 60000 range, so only the
          // integer check can reject it. A fraction below the minimum
          // would be caught by the range check alone.
          maxToastsVisible: 0,
          toast: { timeout: 300.5, width: 19 },
        }),
      ),
    );

    expect(result.config).toEqual(DEFAULT_CONFIG);
    expect(result.warnings).toHaveLength(3);
  });

  it("reports a non-object toast section once and keeps toast defaults", () => {
    const result = loadConfig(
      "/agent",
      contentsFs(JSON.stringify({ maxToastsVisible: 2, toast: "wide" })),
    );

    expect(result.config).toEqual({
      maxToastsVisible: 2,
      toast: { ...DEFAULT_CONFIG.toast },
    });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('"toast" must be a JSON object');
  });

  it("reports malformed JSON once and uses all defaults", () => {
    const result = loadConfig("/agent", contentsFs("{ not json"));

    expect(result.config).toEqual(DEFAULT_CONFIG);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("not valid JSON");
  });

  it("reports a non-object document once and uses all defaults", () => {
    const result = loadConfig("/agent", contentsFs("[1, 2, 3]"));

    expect(result.config).toEqual(DEFAULT_CONFIG);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("must be a JSON object");
  });

  it("reports an unreadable file rather than treating it as absent", () => {
    const result = loadConfig("/agent", {
      readFileSync: () => {
        throw Object.assign(new Error("denied"), { code: "EACCES" });
      },
    });

    expect(result.config).toEqual(DEFAULT_CONFIG);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("could not be read");
  });
});

function contentsFs(contents: string): ConfigFs {
  return { readFileSync: () => contents };
}

function missingFs(): ConfigFs {
  return {
    readFileSync: () => {
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    },
  };
}
