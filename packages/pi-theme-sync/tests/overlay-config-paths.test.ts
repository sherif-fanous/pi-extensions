import { promises as fs } from "node:fs";
import path from "node:path";

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test, vi } from "vitest";

type OverlayFactory = Parameters<ExtensionCommandContext["ui"]["custom"]>[0];

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
        expect(rendered).toContain(`Global (${global})`);
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
      expect(rendered).toContain(`Global (${globalPreferred})`);
    });

    const writeSpy = vi.spyOn(fs, "writeFile").mockResolvedValue();

    vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
    overlay.handleInput?.("\r");
    await vi.waitFor(() =>
      expect(writeSpy).toHaveBeenCalledExactlyOnceWith(
        projectPreferred,
        `${JSON.stringify({ themes: { light: "dark" } }, null, 2)}\n`,
        "utf8",
      ),
    );
  });
});

test("reports path resolution errors and permits retry without losing edits", async () => {
  await withOverlay(new Set(), async (overlay) => {
    for (const event of ["\r", "\x1b[B", "\r"]) {
      overlay.handleInput?.(event);
    }

    vi.mocked(fs.readFile).mockRejectedValueOnce(
      Object.assign(new Error("permission denied"), { code: "EACCES" }),
    );
    overlay.handleInput?.("\x13");
    await vi.waitFor(() =>
      expect(overlay.render(240).join("\n")).toContain(
        "Error resolving config paths: permission denied",
      ),
    );
    overlay.handleInput?.("\x13");
    await vi.waitFor(() =>
      expect(overlay.render(240).join("\n")).toContain("Write Config To"),
    );

    const writeSpy = vi.spyOn(fs, "writeFile").mockResolvedValue();

    vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
    overlay.handleInput?.("\r");
    await vi.waitFor(() =>
      expect(writeSpy).toHaveBeenCalledExactlyOnceWith(
        projectPreferred,
        `${JSON.stringify({ themes: { light: "dark" } }, null, 2)}\n`,
        "utf8",
      ),
    );
  });
});

async function withOverlay(
  files: Set<string>,
  exercise: (overlay: Awaited<ReturnType<OverlayFactory>>) => Promise<void>,
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
  const custom = async (factory: OverlayFactory) => {
    const overlay = await factory(
      { requestRender: vi.fn() } as unknown as Parameters<OverlayFactory>[0],
      {
        bold: (text: string) => text,
        fg: (_color: string, text: string) => text,
      } as unknown as Parameters<OverlayFactory>[1],
      {} as Parameters<OverlayFactory>[2],
      vi.fn(),
    );

    try {
      await exercise(overlay);
    } finally {
      overlay.dispose?.();
    }
  };
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
