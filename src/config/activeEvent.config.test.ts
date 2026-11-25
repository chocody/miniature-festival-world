import { describe, expect, it } from "vitest";
import { ACTIVE_EVENT_OVERRIDE } from "./activeEvent.config";
import { isEventEnabled } from "./featureFlags.config";

describe("active event override", () => {
  it("the private-test override is Loy Krathong", () => {
    expect(ACTIVE_EVENT_OVERRIDE).toBe("loy_krathong");
  });

  it("the override is null or a built (flag-enabled) event", () => {
    expect(ACTIVE_EVENT_OVERRIDE === null || isEventEnabled(ACTIVE_EVENT_OVERRIDE)).toBe(true);
  });
});
