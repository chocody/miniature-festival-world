// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isServerActiveEvent, resolveServerActiveEvent } from "./activeEvent";

const TIMES = [
  Date.parse("2026-11-24T10:00:00+07:00"),
  Date.parse("2026-11-25T12:00:00+07:00"),
  Date.parse("2026-12-22T12:00:00+07:00"),
  Date.parse("2027-04-12T12:00:00+07:00"),
  Date.parse("2030-01-01T00:00:00+07:00"),
  Number.NaN,
];

describe("server active event resolver", () => {
  it("the override forces Loy Krathong whatever the date", () => {
    for (const t of TIMES) {
      expect(resolveServerActiveEvent(t)).toEqual({ kind: "active", eventId: "loy_krathong", source: "override" });
      expect(isServerActiveEvent("loy_krathong", t)).toBe(true);
      expect(isServerActiveEvent("christmas", t)).toBe(false);
    }
  });
});
