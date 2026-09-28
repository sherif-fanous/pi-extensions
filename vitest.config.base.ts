/**
 * Shared Vitest configuration for every package in the workspace.
 *
 * Each package's `vitest.config.ts` re-exports this file, or merges its own
 * additions into it. Test files live under the package's `tests/` directory
 * with the `*.test.ts` suffix and pick up the strict TypeScript settings
 * through Vite's built-in TS transform, so no separate build step is required.
 *
 * `globals: false` keeps every test file importing `describe` / `it`
 * explicitly, matching the strict-import style used across the project.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
  },
});
