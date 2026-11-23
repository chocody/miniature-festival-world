import { defineConfig, devices } from "@playwright/test";

/** E2E port: E2E_PORT when set (parallel worktrees need distinct ports), else 3100. */
function e2ePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return 3100;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) {
    throw new Error(`E2E_PORT must be an integer 1024–65535, got ${JSON.stringify(raw)}`);
  }
  return n;
}

const PORT = e2ePort(process.env.E2E_PORT);
/** Pre-installed Chromium (cloud sessions); unset in CI, which installs its own browser. */
const CHROMIUM_PATH = process.env.PW_CHROMIUM_PATH?.trim() || undefined;
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          ...(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {}),
          // Software WebGL so 3D features work in headless CI without a GPU.
          args: [
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
            "--ignore-gpu-blocklist",
          ],
        },
      },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    timeout: 240_000,
  },
});
