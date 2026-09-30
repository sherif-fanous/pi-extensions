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
 *
 * In GitHub Actions, Vitest keeps its annotations on failing lines but writes
 * no job summary: the root `mise run check` writes one table for every
 * package instead of one unnamed report each.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    ...(process.env.GITHUB_ACTIONS === "true" && {
      reporters: [
        "default",
        ["github-actions", { jobSummary: { enabled: false } }],
      ],
    }),
  },
});
