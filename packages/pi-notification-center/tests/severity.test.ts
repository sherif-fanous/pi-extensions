import { SEVERITIES } from "../src/types.js";
import {
  CARD_SEVERITY_LABELS,
  ROW_SEVERITY_LABELS,
  SEVERITY_COLORS,
  SEVERITY_LABEL_WIDTH,
} from "../src/ui/severity.js";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";

describe("severity presentation", () => {
  it("maps each severity to its theme color", () => {
    expect(SEVERITY_COLORS).toEqual({
      error: "error",
      info: "accent",
      warning: "warning",
    });
  });

  it("uses fixed-width labels so rows align", () => {
    expect(ROW_SEVERITY_LABELS).toEqual({
      error: "ERROR",
      info: "INFO",
      warning: "WARN",
    });
  });

  it("spells labels out on cards, where nothing has to align", () => {
    expect(CARD_SEVERITY_LABELS).toEqual({
      error: "Error",
      info: "Info",
      warning: "Warning",
    });
  });

  it("covers every severity on both surfaces", () => {
    const severities = [...SEVERITIES].sort();

    expect(Object.keys(ROW_SEVERITY_LABELS).sort()).toEqual(severities);
    expect(Object.keys(CARD_SEVERITY_LABELS).sort()).toEqual(severities);
    expect(Object.keys(SEVERITY_COLORS).sort()).toEqual(severities);
  });

  // A row label edited without its width would silently misalign the
  // column, because the row builder pads to this number rather than
  // measuring.
  it("reserves exactly the columns the widest row label needs", () => {
    const widest = Math.max(
      ...Object.values(ROW_SEVERITY_LABELS).map((label) => visibleWidth(label)),
    );

    expect(SEVERITY_LABEL_WIDTH).toBe(widest);
  });
});
