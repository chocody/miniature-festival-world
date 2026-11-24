// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseZoneQuery } from "./zoneQuery";

const parse = (qs: string) => parseZoneQuery(new URLSearchParams(qs));

describe("parseZoneQuery", () => {
  it("accepts valid queries", () => {
    expect(parse("event=loy_krathong&zone=1")).toEqual({ ok: true, query: { eventId: "loy_krathong", zoneId: 1 } });
    expect(parse("event=loy_krathong&zone=2147483647").ok).toBe(true);
    expect(parse("event=christmas&zone=1").ok).toBe(true);
    expect(parse("event=loy_krathong&zone=1&foo=1").ok).toBe(true);
  });

  it.each(["", "event=", "event=LOY_KRATHONG&zone=1", "event=nope&zone=1", "event=loy_krathong&event=christmas&zone=1"])(
    "bad event: %s",
    (qs) => {
      expect(parse(qs)).toEqual({ ok: false, field: "event" });
    },
  );

  it.each([
    "event=loy_krathong",
    "event=loy_krathong&zone=0",
    "event=loy_krathong&zone=-1",
    "event=loy_krathong&zone=01",
    "event=loy_krathong&zone=1.5",
    "event=loy_krathong&zone=1e2",
    "event=loy_krathong&zone=%201",
    "event=loy_krathong&zone=abc",
    "event=loy_krathong&zone=2147483648",
    "event=loy_krathong&zone=1&zone=2",
  ])("bad zone: %s", (qs) => {
    expect(parse(qs)).toEqual({ ok: false, field: "zone" });
  });

  it("reports event first when both are bad", () => {
    expect(parse("event=nope&zone=0")).toEqual({ ok: false, field: "event" });
  });
});
