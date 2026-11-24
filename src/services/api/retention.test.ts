// @vitest-environment node
import { describe, expect, it } from "vitest";
import { RETENTION_DAYS_AFTER_FESTIVAL_END } from "@/config/retention.config";
import { computeCreationExpiresAt } from "./retention";

describe("computeCreationExpiresAt", () => {
  it("is festival end + 30 days", () => {
    expect(computeCreationExpiresAt("loy_krathong")?.toISOString()).toBe("2026-12-24T17:00:00.000Z");
  });
  it("is null without an end date", () => {
    expect(computeCreationExpiresAt("christmas")).toBeNull();
  });
  it("retention is 30 days", () => {
    expect(RETENTION_DAYS_AFTER_FESTIVAL_END).toBe(30);
  });
});
