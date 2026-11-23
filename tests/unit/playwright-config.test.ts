// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

async function load() {
  vi.resetModules();
  return (await import("../../playwright.config")).default;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

function launchOptions(cfg: Awaited<ReturnType<typeof load>>) {
  return cfg.projects?.[0].use?.launchOptions as { executablePath?: string; args?: string[] };
}

describe("playwright.config", () => {
  it("keeps the defaults when E2E_PORT and PW_CHROMIUM_PATH are unset", async () => {
    vi.stubEnv("E2E_PORT", "");
    vi.stubEnv("PW_CHROMIUM_PATH", "");
    const cfg = await load();
    expect(cfg.use?.baseURL).toBe("http://localhost:3100");
    const web = cfg.webServer as { command: string; url: string };
    expect(web.command).toBe("pnpm build && pnpm start -p 3100");
    expect(web.url).toBe("http://localhost:3100");
    const lo = launchOptions(cfg);
    expect(lo.executablePath).toBeUndefined();
    expect(lo.args).toEqual(["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]);
  });

  it("uses E2E_PORT and PW_CHROMIUM_PATH when set", async () => {
    vi.stubEnv("E2E_PORT", "3123");
    vi.stubEnv("PW_CHROMIUM_PATH", "/x/chrome");
    const cfg = await load();
    expect(cfg.use?.baseURL).toBe("http://localhost:3123");
    const web = cfg.webServer as { command: string; url: string };
    expect(web.command).toBe("pnpm build && pnpm start -p 3123");
    expect(web.url).toBe("http://localhost:3123");
    expect(launchOptions(cfg).executablePath).toBe("/x/chrome");
  });

  it.each(["abc", "0", "70000", "80"])("rejects an invalid E2E_PORT %s", async (bad) => {
    vi.stubEnv("E2E_PORT", bad);
    await expect(load()).rejects.toThrow(/E2E_PORT/);
  });
});
