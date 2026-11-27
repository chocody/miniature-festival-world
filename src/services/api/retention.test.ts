// @vitest-environment node
import { describe, expect, it } from "vitest";
import { christmasConfig } from "@/config/events/christmas.config";
import { FESTIVAL_ENDS_AT, RETENTION_DAYS_AFTER_FESTIVAL_END } from "@/config/retention.config";
import { computeCreationExpiresAt } from "./retention";

describe("computeCreationExpiresAt", () => {
  it("is festival end + 30 days", () => {
    expect(computeCreationExpiresAt("loy_krathong")?.toISOString()).toBe("2026-12-24T17:00:00.000Z");
  });
  it("RT1 christmas is the window end + 30 days", () => {
    expect(computeCreationExpiresAt("christmas")?.toISOString()).toBe("2027-01-25T17:00:00.000Z");
  });
  it("RT2 is null without an end date", () => {
    expect(computeCreationExpiresAt("new_year")).toBeNull();
  });
  it("RT3 christmas end date equals the last date window end", () => {
    expect(FESTIVAL_ENDS_AT.christmas).toBe("2026-12-27T00:00:00+07:00");
    expect(FESTIVAL_ENDS_AT.christmas).toBe(christmasConfig.dateWindows[christmasConfig.dateWindows.length - 1]!.endsAt);
  });
  it("retention is 30 days", () => {
    expect(RETENTION_DAYS_AFTER_FESTIVAL_END).toBe(30);
  });
});
