// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ZONE_NAV_COPY } from "@/components/ui/ZoneNavigator";
import * as literals from "../e2e/fixtures/endlessRiver";

describe("endless-river e2e literals (MFW-58)", () => {
  it("match the app copy", () => {
    for (const [z, n] of [
      [1, 3],
      [2, 3],
      [1, 1],
    ]) {
      expect(literals.E2E_ZONE_LABEL(z, n)).toBe(ZONE_NAV_COPY.zoneLabel(z, n));
    }
    expect(literals.E2E_NEXT_ZONE_NAME).toBe(ZONE_NAV_COPY.downstream);
    expect(literals.E2E_PREVIOUS_ZONE_NAME).toBe(ZONE_NAV_COPY.upstream);
  });
});
