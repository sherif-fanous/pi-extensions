/**
 * Vitest configuration for pi-theme-sync: the shared workspace preset in
 * `vitest.config.base.ts` at the repository root, plus a setup file.
 *
 * `tests/helpers/agent-dir-setup.ts` gives every test file an empty agent
 * directory, so a session start in a test never migrates the real User
 * configuration.
 */

import baseConfig from "../../vitest.config.base.js";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      setupFiles: ["tests/helpers/agent-dir-setup.ts"],
    },
  }),
);
