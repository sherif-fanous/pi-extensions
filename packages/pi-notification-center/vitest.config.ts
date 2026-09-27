/**
 * Vitest configuration for pi-notification-center.
 *
 * Owns test discovery and environment settings. Test files live under
 * `tests/` with the `*.test.ts` suffix and pick up the strict TypeScript
 * settings from `tsconfig.json` through Vite's built-in TS transform, so
 * no separate build step is required.
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
