import { describe, expect, it } from "vitest";
import { assertDayNightHours, msUntilNextPresetChange, nextLightPresetChoice, presetForLocalTime, resolveLightPreset } from "./timeOfDay";

const H = { dayStartHour: 6, nightStartHour: 18 };
/** Local-time date (holds in any TZ). */
const at = (h: number, m = 0, s = 0, ms = 0) => new Date(2026, 10, 25, h, m, s, ms);

describe("presetForLocalTime", () => {
  it.each([
    [5, 59, "NIGHT"],
    [6, 0, "DAY"],
    [17, 59, "DAY"],
    [18, 0, "NIGHT"],
    [0, 0, "NIGHT"],
    [23, 59, "NIGHT"],
  ] as const)("%i:%i → %s", (h, m, expected) => {
    expect(presetForLocalTime(at(h, m), H)).toBe(expected);
  });
});

describe("resolveLightPreset", () => {
  it("an override wins; AUTO follows the clock", () => {
    expect(resolveLightPreset("DAY", at(22), H)).toBe("DAY");
    expect(resolveLightPreset("NIGHT", at(12), H)).toBe("NIGHT");
    expect(resolveLightPreset("AUTO", at(12), H)).toBe("DAY");
    expect(resolveLightPreset("AUTO", at(22), H)).toBe("NIGHT");
  });
});

describe("msUntilNextPresetChange", () => {
  it.each([
    [at(17, 59, 30), 30_000],
    [at(18), 43_200_000],
    [at(5), 3_600_000],
    [at(23), 25_200_000],
    [at(6, 0, 0, 0), 43_200_000],
  ] as const)("%s → %i ms", (date, expected) => {
    expect(msUntilNextPresetChange(date, H)).toBe(expected);
  });
  it("is always ≥ 1", () => {
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30, 59]) expect(msUntilNextPresetChange(at(h, m, 59, 999), H)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("assertDayNightHours", () => {
  it("accepts the default", () => {
    expect(() => assertDayNightHours(H)).not.toThrow();
  });
  it.each([
    { dayStartHour: 6, nightStartHour: 6 },
    { dayStartHour: 18, nightStartHour: 6 },
    { dayStartHour: -1, nightStartHour: 18 },
    { dayStartHour: 6, nightStartHour: 24 },
    { dayStartHour: 6.5, nightStartHour: 18 },
  ])("rejects %o", (h) => {
    expect(() => assertDayNightHours(h)).toThrow(RangeError);
  });
});

describe("nextLightPresetChoice (MFW-74)", () => {
  it("T1 shown NIGHT while the clock says NIGHT → DAY (an override)", () => expect(nextLightPresetChoice("NIGHT", "NIGHT")).toBe("DAY"));
  it("T2 shown DAY while the clock says NIGHT → AUTO (the target is what the clock shows)", () => expect(nextLightPresetChoice("DAY", "NIGHT")).toBe("AUTO"));
  it("T3 shown DAY while the clock says DAY → NIGHT", () => expect(nextLightPresetChoice("DAY", "DAY")).toBe("NIGHT"));
  it("T4 shown NIGHT while the clock says DAY → AUTO", () => expect(nextLightPresetChoice("NIGHT", "DAY")).toBe("AUTO"));
});
