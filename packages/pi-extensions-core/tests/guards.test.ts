import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { isNotFoundError, isRecord } from "../src/index.js";
import { describe, expect, it } from "vitest";

describe("isRecord", () => {
  it("accepts a plain object", () => {
    expect(isRecord({ version: 1 })).toBe(true);
  });

  it("rejects an array", () => {
    expect(isRecord([1, 2])).toBe(false);
  });

  it("rejects null", () => {
    expect(isRecord(null)).toBe(false);
  });

  it("rejects a primitive", () => {
    expect(isRecord("text")).toBe(false);
  });

  it("accepts a class instance", () => {
    expect(isRecord(new Map())).toBe(true);
  });
});

describe("isNotFoundError", () => {
  it("accepts the error from reading a missing file", async () => {
    const error: unknown = await readFile(join(tmpdir(), randomUUID())).catch(
      (readError: unknown) => readError,
    );

    expect(isNotFoundError(error)).toBe(true);
  });

  it("rejects an error with another code", () => {
    const error = Object.assign(new Error("permission denied"), {
      code: "EACCES",
    });

    expect(isNotFoundError(error)).toBe(false);
  });

  it("accepts a plain object with the ENOENT code", () => {
    expect(isNotFoundError({ code: "ENOENT" })).toBe(true);
  });

  it("rejects a string", () => {
    expect(isNotFoundError("ENOENT")).toBe(false);
  });

  it("rejects null", () => {
    expect(isNotFoundError(null)).toBe(false);
  });
});
