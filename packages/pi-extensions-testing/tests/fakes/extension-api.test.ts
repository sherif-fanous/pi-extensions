/**
 * Covers how the fake `ExtensionAPI` dispatches events and records appended
 * entries and registered tools.
 */

import { createFakeContext, createFakePi } from "../../src/index.js";
import { createLsToolDefinition } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

const SESSION_START = { reason: "startup", type: "session_start" } as const;

describe("createFakePi", () => {
  it("awaits each handler of the event in registration order and returns their results", async () => {
    const { emit, pi } = createFakePi();
    const calls: string[] = [];

    pi.on("session_before_switch", async () => {
      await Promise.resolve();
      calls.push("first");

      return { cancel: true };
    });

    pi.on("session_start", () => {
      calls.push("other event");
    });

    pi.on("session_before_switch", () => {
      calls.push("second");
    });

    await expect(
      emit(
        { reason: "new", type: "session_before_switch" },
        createFakeContext(),
      ),
    ).resolves.toEqual([{ cancel: true }, undefined]);
    expect(calls).toEqual(["first", "second"]);
  });

  it("stops calling a handler once it is unsubscribed", async () => {
    const { emit, pi } = createFakePi();
    const calls: string[] = [];
    const unsubscribe = pi.on("session_start", () => {
      calls.push("unsubscribed");
    });

    pi.on("session_start", () => {
      calls.push("kept");
    });
    unsubscribe();
    await emit(SESSION_START, createFakeContext());

    expect(calls).toEqual(["kept"]);
  });

  it("records an appended entry and also passes it to a replacement appendEntry", () => {
    const forwarded: [string, unknown][] = [];
    const fake = createFakePi({
      appendEntry: (customType, data) => {
        forwarded.push([customType, data]);
      },
    });

    fake.pi.appendEntry("test:entry", { body: "text" });

    expect(fake.appendedEntries).toEqual([
      { customType: "test:entry", data: { body: "text" } },
    ]);
    expect(forwarded).toEqual([["test:entry", { body: "text" }]]);
  });

  it("records a registered tool under its name", () => {
    const fake = createFakePi();
    const tool = createLsToolDefinition("/project");

    fake.pi.registerTool(tool);

    expect(fake.tools.get("ls")).toBe(tool);
  });
});
