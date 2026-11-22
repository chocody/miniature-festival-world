import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
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
