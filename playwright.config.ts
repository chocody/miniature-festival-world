import { defineConfig, devices } from "@playwright/test";
import { ACTIVE_EVENT_OVERRIDE_ENV } from "./src/config/activeEvent.config";
import type { FestivalEventId } from "./src/config/events/types";

export interface E2eEventProject {
  /** Playwright project name; also the CI shard label (`--project=<name>`). */
  readonly name: string;
  /** Pinned on this project's server as ACTIVE_EVENT_OVERRIDE_ENV. */
  readonly eventId: FestivalEventId;
  /** Glob (Playwright prefixes "**\/"); null = the default suite: every spec no other row claims. */
  readonly testMatch: string | null;
}

/** Row 0 is the Loy suite and owns the build; add a festival by appending a row (17.3: new-year). */
export const E2E_EVENT_PROJECTS: readonly E2eEventProject[] = [
  { name: "chromium", eventId: "loy_krathong", testMatch: null },
  { name: "christmas", eventId: "christmas", testMatch: "christmas-*.spec.ts" },
];

/** Port of row i = E2E port + i × stride (3100 → 3200). Clear of the QA ports 3150–3199 (loop-ticket). */
export const E2E_PROJECT_PORT_STRIDE = 100;
export const E2E_WEB_SERVER_TIMEOUT_MS = 240_000;

const DEFAULT_E2E_PORT = 3100;
const MIN_PORT = 1024;
const MAX_PORT = 65535;
const MAX_BASE_PORT = MAX_PORT - (E2E_EVENT_PROJECTS.length - 1) * E2E_PROJECT_PORT_STRIDE;

/** E2E port: E2E_PORT when set (parallel worktrees need distinct ports), else 3100. */
function e2ePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_E2E_PORT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < MIN_PORT || n > MAX_BASE_PORT) {
    throw new Error(`E2E_PORT must be an integer ${MIN_PORT}–${MAX_BASE_PORT}, got ${JSON.stringify(raw)}`);
  }
  return n;
}

const BASE_PORT = e2ePort(process.env.E2E_PORT);
/** Pre-installed Chromium (cloud sessions); unset in CI, which installs its own browser. */
const CHROMIUM_PATH = process.env.PW_CHROMIUM_PATH?.trim() || undefined;
const isCI = !!process.env.CI;

const portOf = (index: number): number => BASE_PORT + index * E2E_PROJECT_PORT_STRIDE;
const urlOf = (index: number): string => `http://localhost:${portOf(index)}`;

const desktopChrome = {
  ...devices["Desktop Chrome"],
  launchOptions: {
    ...(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {}),
    // Software WebGL so 3D features work in headless CI without a GPU.
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  },
};

const claimedGlobs = E2E_EVENT_PROJECTS.flatMap((p) => (p.testMatch === null ? [] : [p.testMatch]));

export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    // Record a trace only on the first retry: recording on every attempt costs time on the 2-vCPU CI runner (MFW-1). Retries
    // exist only on CI (retries: 1), so a local run records no trace.
    trace: "on-first-retry",
  },
  projects: E2E_EVENT_PROJECTS.map((row, i) => ({
    name: row.name,
    use: { ...desktopChrome, baseURL: urlOf(i) },
    ...(row.testMatch === null ? { testIgnore: claimedGlobs } : { testMatch: row.testMatch }),
  })),
  // Playwright 1.65 starts webServer entries one after another in array order (one plugin-setup task per entry, awaited
  // in order). That is why entries after 0 can skip the build: entry 0 has finished `pnpm build` before they start.
  webServer: E2E_EVENT_PROJECTS.map((row, i) => ({
    command: i === 0 ? `pnpm build && pnpm start -p ${portOf(i)}` : `pnpm start -p ${portOf(i)}`,
    url: urlOf(i),
    reuseExistingServer: !isCI,
    timeout: E2E_WEB_SERVER_TIMEOUT_MS,
    // Playwright merges env over process.env, so a shell that exports the override never leaks into another entry.
    env: { [ACTIVE_EVENT_OVERRIDE_ENV]: row.eventId },
  })),
});
