import {
  fitLines,
  frameLine,
  frameSegment,
  padToWidth,
  wrapToWidth,
} from "../src/ui/frame.js";
import { visibleWidth } from "@earendil-works/pi-tui";
import { expect, test } from "vitest";

test("frame helpers keep exact widths for styled and wide text", () => {
  const styled = "\x1b[31m界界界\x1b[0m";
  const line = frameLine(styled, 8);

  expect(visibleWidth(line)).toBe(8);
  expect(line.startsWith("│")).toBe(true);
  expect(line.endsWith("│")).toBe(true);
  expect(visibleWidth(padToWidth("界", 4))).toBe(4);
  expect(frameSegment("┌", "─", "┐", 5)).toBe("┌───┐");
});

test("frame helpers degrade safely at narrow widths", () => {
  expect(frameLine("long", 1)).toBe("│");
  expect(frameSegment("┌", "─", "┐", 2)).toBe("┌┐");
  expect(fitLines(["too long"], 3)).toEqual(["too"]);
});

test("ANSI-safe wrapping keeps every line within its width", () => {
  const lines = wrapToWidth("\x1b[33mone two 界界界 three\x1b[0m", 8);

  expect(lines.length).toBeGreaterThan(1);
  expect(lines.every((line) => visibleWidth(line) <= 8)).toBe(true);
});
