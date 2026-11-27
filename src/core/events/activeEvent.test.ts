import { describe, expect, it, vi } from "vitest";
import { FESTIVAL_EVENTS, FESTIVAL_EVENT_IDS, type FestivalEventConfig } from "@/config/events";
import { EVENT_FEATURE_FLAGS, type EventFeatureFlags } from "@/config/featureFlags.config";
import { findNearestWindow, isEventActive, resolveActiveEvent } from "./activeEvent";

const bkk = (s: string) => Date.parse(s);
const ALL_ON = Object.fromEntries(FESTIVAL_EVENT_IDS.map((id) => [id, true])) as unknown as EventFeatureFlags;
const LOY_ONLY = { ...EVENT_FEATURE_FLAGS, christmas: false } as EventFeatureFlags;
const XMAS = bkk("2026-12-22T12:00:00+07:00");
const XMAS_START = bkk("2026-12-20T00:00:00+07:00");
const XMAS_END = bkk("2026-12-27T00:00:00+07:00");

const nearestId = (r: ReturnType<typeof resolveActiveEvent>) => (r.kind === "none" ? r.nearest?.eventId : undefined);

describe("resolveActiveEvent", () => {
  it("inside a window resolves by date", () => {
    expect(resolveActiveEvent(XMAS, { flags: ALL_ON })).toEqual({ kind: "active", eventId: "christmas", source: "date" });
  });

  it("Loy Krathong by date with the default flags", () => {
    expect(resolveActiveEvent(bkk("2026-11-24T10:00:00+07:00"))).toEqual({
      kind: "active",
      eventId: "loy_krathong",
      source: "date",
    });
  });

  it("start boundary is inclusive", () => {
    expect(resolveActiveEvent(XMAS_START, { flags: ALL_ON })).toMatchObject({ kind: "active", eventId: "christmas" });
    const before = resolveActiveEvent(XMAS_START - 1, { flags: ALL_ON });
    expect(before.kind).toBe("none");
    expect(nearestId(before)).toBe("christmas");
  });

  it("end boundary is exclusive", () => {
    expect(resolveActiveEvent(XMAS_END - 1, { flags: ALL_ON })).toMatchObject({ kind: "active", eventId: "christmas" });
    expect(resolveActiveEvent(XMAS_END, { flags: ALL_ON }).kind).toBe("none");
  });

  it("outside: the nearest festival can be one that just ended", () => {
    expect(nearestId(resolveActiveEvent(bkk("2026-12-27T06:00:00+07:00"), { flags: ALL_ON }))).toBe("christmas");
  });

  it("outside: a tie goes to the upcoming festival", () => {
    expect(nearestId(resolveActiveEvent(bkk("2026-12-27T12:00:00+07:00"), { flags: ALL_ON }))).toBe("new_year");
  });

  it("before and after the roadmap", () => {
    const early = findNearestWindow(bkk("2026-01-01T00:00:00+07:00"));
    expect(early?.eventId).toBe("loy_krathong");
    expect(early?.window.startsAt).toBe("2026-11-24T00:00:00+07:00");
    const late = findNearestWindow(bkk("2030-01-01T00:00:00+07:00"));
    expect(late?.eventId).toBe("loy_krathong");
    expect(late?.window.startsAt).toBe("2027-11-13T00:00:00+07:00");
  });

  it("an in-window festival that is not built is not active", () => {
    const r = resolveActiveEvent(XMAS, { flags: LOY_ONLY });
    expect(r.kind).toBe("none");
    expect(nearestId(r)).toBe("christmas");
  });

  it("the override forces the event whatever the date, and fails closed for an unbuilt or unknown one", () => {
    for (const t of [XMAS, bkk("2030-01-01T00:00:00+07:00"), Number.NaN]) {
      expect(resolveActiveEvent(t, { override: "loy_krathong" })).toEqual({
        kind: "active",
        eventId: "loy_krathong",
        source: "override",
      });
    }
    expect(resolveActiveEvent(XMAS, { override: "christmas", flags: LOY_ONLY }).kind).toBe("none");
    expect(resolveActiveEvent(XMAS, { override: "nope" as never }).kind).toBe("none");
  });

  it("with the default flags Christmas is active by date in its window", () => {
    expect(resolveActiveEvent(XMAS)).toEqual({ kind: "active", eventId: "christmas", source: "date" });
  });

  it("a non-finite time or no events resolves to none without a nearest festival", () => {
    expect(resolveActiveEvent(Number.NaN)).toEqual({ kind: "none", nearest: null });
    expect(resolveActiveEvent(Number.POSITIVE_INFINITY)).toEqual({ kind: "none", nearest: null });
    expect(resolveActiveEvent(XMAS, { events: [] })).toEqual({ kind: "none", nearest: null });
  });

  it("skips a malformed window instead of throwing", () => {
    const events = [
      { id: "christmas", name: "C", nameTh: "C", dateWindows: [{ startsAt: "x", endsAt: "y" }] },
      { id: "new_year", name: "N", nameTh: "N", dateWindows: [{ startsAt: "2026-12-30T00:00:00+07:00", endsAt: "2026-12-29T00:00:00+07:00" }] },
    ] as unknown as FestivalEventConfig[];
    expect(resolveActiveEvent(XMAS, { events, flags: ALL_ON })).toEqual({ kind: "none", nearest: null });
  });

  it("is pure: no clock read, same output, inputs untouched", () => {
    const spy = vi.spyOn(Date, "now");
    const snapshot = JSON.stringify(FESTIVAL_EVENTS);
    const a = resolveActiveEvent(XMAS, { flags: ALL_ON });
    const b = resolveActiveEvent(XMAS, { flags: ALL_ON });
    expect(a).toEqual(b);
    expect(spy).not.toHaveBeenCalled();
    expect(JSON.stringify(FESTIVAL_EVENTS)).toBe(snapshot);
    spy.mockRestore();
  });
});

describe("isEventActive", () => {
  it("is true only for the resolved event", () => {
    expect(isEventActive("christmas", XMAS, { flags: ALL_ON })).toBe(true);
    expect(isEventActive("loy_krathong", XMAS, { flags: ALL_ON })).toBe(false);
  });
});
