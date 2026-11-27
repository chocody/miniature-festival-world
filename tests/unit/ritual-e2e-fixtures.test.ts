// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEVICE_OWNER_TOKEN_STORAGE_KEY } from "@/config/ownership.config";
import { RELEASE_SCENE_WATCHDOG_MS } from "@/config/ritual.config";
import { E2E_OWNER_TOKEN_STORAGE_KEY, E2E_RELEASE_TO_WORLD_TIMEOUT_MS } from "../e2e/fixtures/ritualRoutes";

describe("ritual e2e fixtures", () => {
  it("duplicate the real storage key", () => {
    expect(E2E_OWNER_TOKEN_STORAGE_KEY).toBe(DEVICE_OWNER_TOKEN_STORAGE_KEY);
  });

  it("wait longer for the world after a release than the app's scene watchdog", () => {
    expect(E2E_RELEASE_TO_WORLD_TIMEOUT_MS).toBeGreaterThan(RELEASE_SCENE_WATCHDOG_MS);
  });
});
