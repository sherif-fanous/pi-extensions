import { promises as fs } from "node:fs";
import path from "node:path";

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  createFakeCustom,
  type CustomComponent,
} from "@sherif-fanous/pi-extensions-testing";
import { afterEach, expect, test, vi } from "vitest";

const projectDirectory = "/unused-overlay-project";
const agentDirectory = "/unused-custom-agent";
const projectPreferred = path.join(
  projectDirectory,
  ".pi",
  "theme-sync",
  "settings.json",
);
const projectLegacy = path.join(projectDirectory, ".pi", "theme-sync.json");
const globalPreferred = path.join(
  agentDirectory,
  "theme-sync",
  "settings.json",
);
const globalLegacy = path.join(agentDirectory, "theme-sync.json");

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@earendil-works/pi-coding-agent")>()),
  getSelectListTheme: () => ({
    selectedPrefix: (text: string) => text,
    selectedText: (text: string) => text,
    description: (text: string) => text,
    scrollInfo: (text: string) => text,
    noMatch: (text: string) => text,
  }),
}));

vi.mock("@sherif-fanous/pi-extensions-core", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@sherif-fanous/pi-extensions-core")>();

  return { ...actual, writeJsonFile: vi.fn(actual.writeJsonFile) };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

test.each([
  {
    name: "missing",
    files: [],
    project: projectPreferred,
    global: globalPreferred,
  },
  {
    name: "preferred",
    files: [projectPreferred, globalPreferred],
    project: projectPreferred,
    global: globalPreferred,
  },
  {
    name: "legacy",
    files: [projectLegacy, globalLegacy],
    project: projectLegacy,
    global: globalLegacy,
  },
  {
    name: "both",
    files: [projectPreferred, projectLegacy, globalPreferred, globalLegacy],
    project: projectPreferred,
    global: globalPreferred,
  },
  {
    name: "mixed",
    files: [projectLegacy, globalPreferred],
    project: projectLegacy,
    global: globalPreferred,
  },
])(
  "shows resolved $name paths using the global override",
  async ({ files, project, global }) => {
    await withOverlay(new Set(files), async (overlay) => {
      overlay.handleInput?.("\x13");
      await vi.waitFor(() => {
        const rendered = overlay.render(240).join("\n");

        expect(rendered).toContain(`Project (${project})`);
        expect(rendered).toContain(`User (${global})`);
      });
    });
  },
);

test("refreshes paths when reopening after migration and retains pending edits", async () => {
  const files = new Set([projectLegacy, globalLegacy]);

  await withOverlay(files, async (overlay) => {
    for (const event of ["\r", "\x1b[B", "\r", "\x13"]) {
      overlay.handleInput?.(event);
    }

    await vi.waitFor(() =>
      expect(overlay.render(240).join("\n")).toContain(
        `Project (${projectLegacy})`,
      ),
    );
    overlay.handleInput?.("\x1b");
    files.add(projectPreferred);
    files.delete(globalLegacy);
    overlay.handleInput?.("\x13");
    await vi.waitFor(() => {
      const rendered = overlay.render(240).join("\n");

      expect(rendered).toContain(`Project (${projectPreferred})`);
      expect(rendered).toContain(`User (${globalPreferred})`);
    });

    const { writeJsonFile } = await import("@sherif-fanous/pi-extensions-core");
    const writeSpy = vi.mocked(writeJsonFile).mockResolvedValue();

    overlay.handleInput?.("\r");
    await vi.waitFor(() =>
      expect(writeSpy).toHaveBeenCalledExactlyOnceWith(projectPreferred, {
        themes: { light: "dark" },
      }),
    );
  });
});

test("keeps an unreadable preferred file selected, refuses to save over it, and permits retry without losing edits", async () => {
  await withOverlay(new Set([projectLegacy]), async (overlay) => {
    for (const event of ["\r", "\x1b[B", "\r"]) {
      overlay.handleInput?.(event);
    }

    const permissionDenied = Object.assign(new Error("permission denied"), {
      code: "EACCES",
    });

    vi.mocked(fs.readFile).mockRejectedValueOnce(permissionDenied);
    overlay.handleInput?.("\x13");
    await vi.waitFor(() =>
      expect(overlay.render(240).join("\n")).toContain(
        `Project (${projectPreferred})`,
      ),
    );

    const { writeJsonFile } = await import("@sherif-fanous/pi-extensions-core");
    // Earlier tests in this file leave calls on the shared module mock.
    const writeSpy = vi.mocked(writeJsonFile).mockClear().mockResolvedValue();

    vi.mocked(fs.readFile).mockRejectedValueOnce(permissionDenied);
    overlay.handleInput?.("\r");
    await vi.waitFor(() =>
      expect(overlay.render(240).join("\n")).toContain(
        "must be readable and contain a valid JSON object.",
      ),
    );
    expect(writeSpy).not.toHaveBeenCalled();

    overlay.handleInput?.("\x13");
    await vi.waitFor(() =>
      expect(overlay.render(240).join("\n")).toContain(
        `Project (${projectLegacy})`,
      ),
    );
    overlay.handleInput?.("\r");
    await vi.waitFor(() =>
      expect(writeSpy).toHaveBeenCalledExactlyOnceWith(projectLegacy, {
        themes: { light: "dark" },
      }),
    );
  });
});

async function withOverlay(
  files: Set<string>,
  exercise: (overlay: CustomComponent) => Promise<void>,
): Promise<void> {
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDirectory);
  vi.resetModules();
  vi.spyOn(fs, "readFile").mockImplementation((filePath) => {
    if (typeof filePath === "string" && files.has(filePath)) {
      return Promise.resolve("{}");
    }

    return Promise.reject(
      Object.assign(new Error("Missing test config"), { code: "ENOENT" }),
    );
  });

  const { openThemeSyncOverlay } = await import("../src/command.js");
  const { createThemeSyncRuntime } = await import("../src/runtime.js");
  const custom = createFakeCustom({
    onMount: async (overlay, done) => {
      try {
        await exercise(overlay);
      } finally {
        done(undefined);
      }
    },
  });
  const reload = vi.fn();
  const ctx = {
    cwd: projectDirectory,
    mode: "tui",
    reload,
    ui: {
      custom,
      getAllThemes: () => [{ name: "light" }, { name: "dark" }],
      notify: vi.fn(),
    },
  } as unknown as ExtensionCommandContext;

  await openThemeSyncOverlay(createThemeSyncRuntime(), ctx);
  expect(reload).not.toHaveBeenCalled();
}
