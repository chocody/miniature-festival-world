// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEVICE_OWNER_TOKEN_STORAGE_KEY } from "@/config/ownership.config";
import { E2E_OWNER_TOKEN_STORAGE_KEY } from "../e2e/fixtures/ritualRoutes";

describe("ritual e2e fixtures", () => {
  it("duplicate the real storage key", () => {
    expect(E2E_OWNER_TOKEN_STORAGE_KEY).toBe(DEVICE_OWNER_TOKEN_STORAGE_KEY);
  });
});
