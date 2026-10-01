/**
 * Fake appearance detectors and a session context, for driving the runtime
 * through its detector seam.
 */

import type {
  PollingDetector,
  SubscriptionDetector,
} from "../../src/detectors/index.js";
import type { Appearance } from "../../src/types.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  createFakeContext,
  createPlainTheme,
} from "@sherif-fanous/pi-extensions-testing";
import { vi, type Mock } from "vitest";

/** A polling detector whose `detect` mock answers `appearance` until a test changes it. */
export type FakePollingDetector = PollingDetector & {
  readonly detect: Mock<PollingDetector["detect"]>;
};

/** A session context that records the themes the runtime applies. */
export type FakeRuntimeContext = ExtensionContext & {
  readonly appliedThemes: string[];
};

/** A subscription detector with mocks for its probe and cleanup, and a way to send it reports. */
export type FakeSubscriptionDetector = SubscriptionDetector & {
  readonly isSupported: Mock<SubscriptionDetector["isSupported"]>;
  /**
   * Send an appearance report to the last listener subscribed, even after
   * `unsubscribe`, so tests reach the runtime's own guards.
   */
  readonly report: (appearance: Appearance) => void;
  readonly subscribe: Mock<SubscriptionDetector["subscribe"]>;
  readonly unsubscribe: Mock<() => void>;
};

/**
 * Build a print-mode session context with the `light` and `dark` themes,
 * where `setTheme` switches `ui.theme` and records the name.
 */
export function createRuntimeContext(): FakeRuntimeContext {
  const appliedThemes: string[] = [];
  const theme = Object.assign(createPlainTheme(), { name: "initial" });
  const ctx = createFakeContext({
    cwd: "/unused-runtime-test",
    mode: "print",
    ui: {
      getAllThemes: () => [
        { name: "light", path: undefined },
        { name: "dark", path: undefined },
      ],
      notify: vi.fn(),
      setTheme: (themeName: string) => {
        appliedThemes.push(themeName);
        theme.name = themeName;

        return { success: true };
      },
      theme,
    },
  });

  return Object.assign(ctx, { appliedThemes });
}

/** Build a polling detector that answers `appearance`. */
export function fakePollingDetector(
  label: string,
  appearance: Appearance = "unknown",
): FakePollingDetector {
  return {
    detect: vi.fn<PollingDetector["detect"]>().mockResolvedValue(appearance),
    label,
  };
}

/** Build a supported subscription detector. */
export function fakeSubscriptionDetector(
  label = "Terminal Color Scheme (subscription)",
): FakeSubscriptionDetector {
  let listener: ((appearance: Appearance) => void) | undefined;
  const unsubscribe = vi.fn<() => void>();

  return {
    isSupported: vi
      .fn<SubscriptionDetector["isSupported"]>()
      .mockResolvedValue(true),
    label,
    report: (appearance) => listener?.(appearance),
    stoppedWarning:
      "Terminal color-scheme notifications stopped arriving. Switched to polling.",
    subscribe: vi.fn<SubscriptionDetector["subscribe"]>(
      (_context, onAppearance) => {
        listener = onAppearance;

        return unsubscribe;
      },
    ),
    unsubscribe,
  };
}
