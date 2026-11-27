// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { ACTIVE_EVENT_OVERRIDE_ENV } from "@/config/activeEvent.config";
import { findNearestWindow } from "@/core/events";
import { isServerActiveEvent, resolveServerActiveEvent, selectActiveEventOverride } from "./activeEvent";

const DEC1 = Date.parse("2026-12-01T12:00:00+07:00");
const XMAS = Date.parse("2026-12-22T12:00:00+07:00");
const XMAS_START = Date.parse("2026-12-20T00:00:00+07:00");
const XMAS_END = Date.parse("2026-12-27T00:00:00+07:00");
const ENV = ACTIVE_EVENT_OVERRIDE_ENV;
const LOY = { kind: "active", eventId: "loy_krathong", source: "override" } as const;
const CHRISTMAS_OVERRIDE = { kind: "active", eventId: "christmas", source: "override" } as const;

afterEach(() => vi.unstubAllEnvs());

describe("server active event resolver", () => {
  it("AE1 env beats the constant on a non-production deployment", () => {
    for (const vercel of ["preview", "development", undefined]) {
      const deps = { env: { VERCEL_ENV: vercel, [ENV]: "christmas" }, constantOverride: "loy_krathong" as const };
      expect(resolveServerActiveEvent(DEC1, deps)).toEqual(CHRISTMAS_OVERRIDE);
      expect(isServerActiveEvent("christmas", DEC1, deps)).toBe(true);
      expect(isServerActiveEvent("loy_krathong", DEC1, deps)).toBe(false);
    }
  });

  it("AE2 production ignores the env", () => {
    for (const vercel of ["production", " production "]) {
      const env = { VERCEL_ENV: vercel, [ENV]: "christmas" };
      for (const t of [DEC1, XMAS]) {
        expect(resolveServerActiveEvent(t, { env, constantOverride: "loy_krathong" })).toEqual(LOY);
      }
      const none = resolveServerActiveEvent(DEC1, { env, constantOverride: null });
      expect(none).toEqual({ kind: "none", nearest: findNearestWindow(DEC1) });
    }
  });

  it("AE3 the constant beats the date", () => {
    const deps = { env: {}, constantOverride: "loy_krathong" as const };
    for (const t of [DEC1, XMAS, Date.parse("2030-01-01T00:00:00+07:00"), Number.NaN]) {
      expect(resolveServerActiveEvent(t, deps)).toEqual(LOY);
      expect(isServerActiveEvent("christmas", t, deps)).toBe(false);
    }
  });

  it("AE4 the date when neither override is set", () => {
    const envs = [{}, { [ENV]: "" }, { [ENV]: "   " }];
    const cases = [
      ...envs.map((env) => ({ env })),
      { env: { VERCEL_ENV: "production", [ENV]: "christmas" } },
      { env: { VERCEL_ENV: "production" } },
    ];
    for (const { env } of cases) {
      const deps = { env, constantOverride: null };
      expect(resolveServerActiveEvent(XMAS, deps)).toEqual({ kind: "active", eventId: "christmas", source: "date" });
      const before = resolveServerActiveEvent(XMAS_START - 1, deps);
      expect(before.kind).toBe("none");
      expect(before.kind === "none" && before.nearest?.eventId).toBe("christmas");
      expect(resolveServerActiveEvent(XMAS_START, deps)).toMatchObject({ kind: "active", eventId: "christmas" });
      expect(resolveServerActiveEvent(XMAS_END, deps).kind).toBe("none");
    }
  });

  it("AE5 unknown or disabled env ids fail closed", () => {
    for (const value of ["nope", "CHRISTMAS", "__proto__", "toString", "new_year"]) {
      const deps = { env: { VERCEL_ENV: "preview", [ENV]: value }, constantOverride: "loy_krathong" as const };
      for (const t of [DEC1, XMAS]) {
        expect(resolveServerActiveEvent(t, deps)).toEqual({ kind: "none", nearest: findNearestWindow(t) });
        expect(isServerActiveEvent("loy_krathong", t, deps)).toBe(false);
      }
    }
  });

  it("AE6 the env value is trimmed", () => {
    const deps = { env: { VERCEL_ENV: "preview", [ENV]: "  christmas  " }, constantOverride: "loy_krathong" as const };
    expect(resolveServerActiveEvent(DEC1, deps)).toEqual(CHRISTMAS_OVERRIDE);
  });

  it("AE7 reads process.env on every call (per request)", () => {
    const deps = { constantOverride: "loy_krathong" as const };
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv(ENV, "christmas");
    expect(resolveServerActiveEvent(DEC1, deps)).toEqual(CHRISTMAS_OVERRIDE);
    vi.stubEnv(ENV, "");
    expect(resolveServerActiveEvent(DEC1, deps)).toEqual(LOY);
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv(ENV, "christmas");
    expect(resolveServerActiveEvent(DEC1, deps)).toEqual(LOY);
  });

  it("AE8 defaults: the shipped constant forces Loy Krathong", () => {
    vi.stubEnv(ENV, "");
    expect(resolveServerActiveEvent(XMAS)).toEqual(LOY);
  });

  it("selectActiveEventOverride picks the env value, else the constant", () => {
    expect(selectActiveEventOverride({}, null)).toBeNull();
    expect(selectActiveEventOverride({ [ENV]: " x " }, null)).toBe("x");
    expect(selectActiveEventOverride({ VERCEL_ENV: "production", [ENV]: "x" }, "loy_krathong")).toBe("loy_krathong");
  });
});
