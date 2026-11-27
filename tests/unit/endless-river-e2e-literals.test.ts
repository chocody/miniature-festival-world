// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ZONE_NAV_COPY } from "@/config/zoneNav.config";
import * as literals from "../e2e/fixtures/endlessRiver";

describe("endless-river e2e literals (MFW-58)", () => {
  it("match the app copy", () => {
    expect(literals.E2E_NEXT_ZONE_NAME).toBe(ZONE_NAV_COPY.downstream);
    expect(literals.E2E_PREVIOUS_ZONE_NAME).toBe(ZONE_NAV_COPY.upstream);
  });
});
