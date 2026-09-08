import { detectAppearanceViaOsc11Background } from "../src/detectors/terminal/osc-11.js";
import { DEFAULT_TERMINAL_QUERY_TIMEOUT_MS } from "../src/detectors/terminal/query.js";
import type {
  ExtensionContext,
  TerminalInputHandler,
} from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test.each([
  { color: "f/f/f", expected: "light" },
  { color: "0/0/0", expected: "dark" },
  { color: "8/8/8", expected: "light" },
  { color: "7/7/7", expected: "dark" },
  { color: "ff/ff/ff", expected: "light" },
  { color: "00/00/00", expected: "dark" },
  { color: "80/80/80", expected: "light" },
  { color: "7f/7f/7f", expected: "dark" },
  { color: "fff/fff/fff", expected: "light" },
  { color: "000/000/000", expected: "dark" },
  { color: "ffff/ffff/ffff", expected: "light" },
  { color: "0000/0000/0000", expected: "dark" },
  { color: "F/ffff/FF", expected: "light" },
  { color: "f/0/0", expected: "dark" },
  { color: "0/f/0", expected: "light" },
])(
  "classifies $color as $expected with either terminator",
  async ({ color, expected }) => {
    for (const terminator of ["\x07", "\x1b\\"]) {
      const query = startQuery();

      expect(query.deliver(`\x1b]11;rgb:${color}${terminator}`)).toEqual({
        consume: true,
      });
      expect(await query.result).toBe(expected);
      expect(query.unsubscribe).toHaveBeenCalledOnce();
    }
  },
);

test.each([
  "f/f",
  "f/f/f/f",
  "/f/f",
  "f//f",
  "f/f/",
  "fffff/f/f",
  "f/f/fffff",
  "gg/ff/ff",
  "ff/ff/fz",
])("ignores malformed color %s without consuming input", async (color) => {
  vi.useFakeTimers();

  const query = startQuery();

  expect(query.deliver(`\x1b]11;rgb:${color}\x07`)).toBeUndefined();
  expect(query.unsubscribe).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(DEFAULT_TERMINAL_QUERY_TIMEOUT_MS);

  expect(await query.result).toBe("unknown");
  expect(query.unsubscribe).toHaveBeenCalledOnce();
});

test("can receive a valid reply after unrelated or malformed input", async () => {
  const query = startQuery();

  expect(query.deliver("unrelated input")).toBeUndefined();
  expect(query.deliver("\x1b]11;rgb:f/f/f/f\x07")).toBeUndefined();
  expect(query.deliver("\x1b]11;rgb:f/f/f\x07")).toEqual({ consume: true });
  expect(await query.result).toBe("light");
  expect(query.unsubscribe).toHaveBeenCalledOnce();
});

function startQuery() {
  let handler: TerminalInputHandler | undefined;
  const unsubscribe = vi.fn();
  const ctx = {
    hasUI: true,
    mode: "tui",
    ui: {
      onTerminalInput: (listener: TerminalInputHandler) => {
        handler = listener;

        return unsubscribe;
      },
    },
  } as unknown as ExtensionContext;
  const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const result = detectAppearanceViaOsc11Background(ctx);

  expect(write).toHaveBeenCalledWith("\x1b]11;?\x1b\\");

  return { deliver: (data: string) => handler?.(data), result, unsubscribe };
}
