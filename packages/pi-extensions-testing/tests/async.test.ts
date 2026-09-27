import { flushPromises } from "../src/index.js";
import { expect, it } from "vitest";

it("flushPromises lets a continuation that awaits twice complete", async () => {
  let completed = false;

  void (async () => {
    await Promise.resolve();
    await Promise.resolve();
    completed = true;
  })();

  expect(completed).toBe(false);

  await flushPromises();

  expect(completed).toBe(true);
});
