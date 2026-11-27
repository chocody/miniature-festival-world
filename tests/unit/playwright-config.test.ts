// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isEventEnabled } from "../../src/config/featureFlags.config";
import { FESTIVAL_EVENT_IDS } from "../../src/config/events/types";

async function loadModule() {
  vi.resetModules();
  return import("../../playwright.config");
}
async function load() {
  return (await loadModule()).default;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

type Cfg = Awaited<ReturnType<typeof load>>;
type Launch = { executablePath?: string; args?: string[] };
const SWIFT = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];

function launchOptions(cfg: Cfg, i: number): Launch {
  return cfg.projects?.[i].use?.launchOptions as Launch;
}
function servers(cfg: Cfg) {
  return cfg.webServer as {
    command: string;
    url: string;
    timeout: number;
    reuseExistingServer: boolean;
    env: Record<string, string>;
  }[];
}
function baseUrls(cfg: Cfg): (string | undefined)[] {
  return (cfg.projects ?? []).map((p) => p.use?.baseURL);
}

describe("playwright.config", () => {
  it("PC1: keeps the defaults when E2E_PORT and PW_CHROMIUM_PATH are unset", async () => {
    vi.stubEnv("E2E_PORT", "");
    vi.stubEnv("PW_CHROMIUM_PATH", "");
    vi.stubEnv("CI", "");
    const cfg = await load();
    expect(cfg.projects?.map((p) => p.name)).toEqual(["chromium", "christmas"]);
    expect(baseUrls(cfg)).toEqual(["http://localhost:3100", "http://localhost:3200"]);
    const web = servers(cfg);
    expect(web[0].command).toBe("pnpm build && pnpm start -p 3100");
    expect(web[1].command).toBe("pnpm start -p 3200");
    expect(web.map((w) => w.url)).toEqual(baseUrls(cfg));
    for (const w of web) {
      expect(w.timeout).toBe(240_000);
      expect(w.reuseExistingServer).toBe(true);
    }
    for (const i of [0, 1]) {
      expect(launchOptions(cfg, i).executablePath).toBeUndefined();
      expect(launchOptions(cfg, i).args).toEqual(SWIFT);
    }
  });

  it("PC2: uses E2E_PORT and PW_CHROMIUM_PATH when set", async () => {
    vi.stubEnv("E2E_PORT", "3123");
    vi.stubEnv("PW_CHROMIUM_PATH", "/x/chrome");
    const cfg = await load();
    expect(baseUrls(cfg)).toEqual(["http://localhost:3123", "http://localhost:3223"]);
    const web = servers(cfg);
    expect(web[0].command).toBe("pnpm build && pnpm start -p 3123");
    expect(web[1].command).toBe("pnpm start -p 3223");
    expect(launchOptions(cfg, 0).executablePath).toBe("/x/chrome");
    expect(launchOptions(cfg, 1).executablePath).toBe("/x/chrome");
  });

  it("PC3: pins the event on each server and never leaks the shell value", async () => {
    const expected = [{ MFW_ACTIVE_EVENT_OVERRIDE: "loy_krathong" }, { MFW_ACTIVE_EVENT_OVERRIDE: "christmas" }];
    expect(servers(await load()).map((w) => w.env)).toEqual(expected);
    vi.stubEnv("MFW_ACTIVE_EVENT_OVERRIDE", "christmas");
    expect(servers(await load()).map((w) => w.env)).toEqual(expected);
  });

  it("PC4: every spec file belongs to exactly one project", async () => {
    const cfg = await load();
    const christmas = cfg.projects?.find((p) => p.name === "christmas");
    const loy = cfg.projects?.find((p) => p.name === "chromium");
    expect(christmas?.testMatch).toBe("christmas-*.spec.ts");
    expect(loy?.testMatch).toBeUndefined();
    expect(loy?.testIgnore).toEqual(["christmas-*.spec.ts"]);
    const files = readdirSync(join(__dirname, "../e2e")).filter((f) => f.endsWith(".spec.ts"));
    expect(files.some((f) => f.startsWith("christmas-"))).toBe(true);
    const re = /^christmas-.*\.spec\.ts$/;
    for (const f of files) expect(f.startsWith("christmas-")).toBe(re.test(f));
  });

  it.each(["abc", "0", "70000", "80", "65436"])("PC5: rejects an invalid E2E_PORT %s", async (bad) => {
    vi.stubEnv("E2E_PORT", bad);
    await expect(load()).rejects.toThrow(/E2E_PORT/);
  });

  it("PC5: accepts the highest base port", async () => {
    vi.stubEnv("E2E_PORT", "65435");
    expect(baseUrls(await load())[1]).toBe("http://localhost:65535");
  });

  it("PC6: the table and the config agree", async () => {
    vi.stubEnv("E2E_PORT", "");
    vi.stubEnv("CI", "");
    const { default: cfg, E2E_EVENT_PROJECTS } = await loadModule();
    const web = servers(cfg);
    expect(cfg.projects?.length).toBe(E2E_EVENT_PROJECTS.length);
    expect(web.length).toBe(E2E_EVENT_PROJECTS.length);
    expect(new Set(cfg.projects?.map((p) => p.name)).size).toBe(web.length);
    expect(new Set(web.map((w) => w.url)).size).toBe(web.length);
    web.forEach((w, i) => expect(w.command.includes("pnpm build")).toBe(i === 0));
    vi.stubEnv("CI", "1");
    for (const w of servers(await load())) expect(w.reuseExistingServer).toBe(false);
  });

  it("PC7: every project event exists and is enabled", async () => {
    const { E2E_EVENT_PROJECTS } = await loadModule();
    for (const row of E2E_EVENT_PROJECTS) {
      expect(FESTIVAL_EVENT_IDS).toContain(row.eventId);
      expect(isEventEnabled(row.eventId)).toBe(true);
    }
  });

  it("PC8: ci.yml and docs/ci.md list every claimed project", async () => {
    const { E2E_EVENT_PROJECTS } = await loadModule();
    const root = join(__dirname, "../..");
    const yml = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
    const doc = readFileSync(join(root, "docs/ci.md"), "utf8");
    for (const row of E2E_EVENT_PROJECTS.filter((r) => r.testMatch !== null)) {
      expect(yml).toContain(`--project=${row.name}"`);
      expect(doc).toContain(`\`e2e (${row.name})\``);
    }
    expect(yml).toContain("--project=chromium --shard=1/2");
    expect(yml).toContain("--shard=2/2");
  });
});
