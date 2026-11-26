// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createEndlessRiverFrame } from "@/core/coordinates/endlessRiverFrame";
import {
  buildRiverStretchSlots,
  effectiveZoneCount,
  streamedZoneIds,
  stretchRingIndex,
  zoneIdForStretch,
} from "./riverStretches";

const frame = createEndlessRiverFrame([
  { x: -12, z: 0.6 },
  { x: 12, z: -0.5 },
]);

describe("zone ↔ stretch mapping (MFW-58, open question 37)", () => {
  it("wraps from the anchor: N = 3, anchor {0, 3}: stretches −2..4 show 1, 2, 3, 1, 2, 3, 1", () => {
    const anchor = { stretchIndex: 0, zoneId: 3 };
    expect([-2, -1, 0, 1, 2, 3, 4].map((s) => zoneIdForStretch(s, anchor, 3))).toEqual([1, 2, 3, 1, 2, 3, 1]);
  });

  it("with one zone every stretch shows zone 1; no anchor → null", () => {
    for (const s of [-5, 0, 1, 99]) expect(zoneIdForStretch(s, { stretchIndex: 0, zoneId: 1 }, 1)).toBe(1);
    expect(zoneIdForStretch(0, null, 3)).toBeNull();
  });

  it("N grows with the anchor zone (zoneCount null, anchor zone 3 → N = 3)", () => {
    expect(effectiveZoneCount(null, { stretchIndex: 0, zoneId: 3 })).toBe(3);
    expect(effectiveZoneCount(2, { stretchIndex: 0, zoneId: 3 })).toBe(3);
    expect(zoneIdForStretch(1, { stretchIndex: 0, zoneId: 3 }, null)).toBe(1);
    expect(zoneIdForStretch(-1, { stretchIndex: 0, zoneId: 3 }, null)).toBe(2);
  });

  it("a re-anchor at another stretch keeps the modulo", () => {
    const anchor = { stretchIndex: 7, zoneId: 2 };
    expect(zoneIdForStretch(7, anchor, 3)).toBe(2);
    expect(zoneIdForStretch(8, anchor, 3)).toBe(3);
    expect(zoneIdForStretch(9, anchor, 3)).toBe(1);
    expect(zoneIdForStretch(5, anchor, 3)).toBe(3);
  });

  it("orders slots current, behind, ahead; the ring index of a stretch is stable", () => {
    const anchor = { stretchIndex: 0, zoneId: 3 };
    const at0 = buildRiverStretchSlots(frame, 0, anchor, 3);
    expect(at0.map((s) => [s.ringIndex, s.stretchIndex, s.relative, s.zoneId])).toEqual([
      [0, 0, 0, 3],
      [2, -1, -1, 2],
      [1, 1, 1, 1],
    ]);
    const at1 = buildRiverStretchSlots(frame, 1, anchor, 3);
    expect(at1.map((s) => [s.ringIndex, s.stretchIndex])).toEqual([
      [1, 1],
      [0, 0],
      [2, 2],
    ]);
    expect(at1[2].offsetX).toBe(2 * frame.periodX);
    expect(at1[2].offsetZ).toBe(2 * frame.periodZ);
    expect(Object.isFrozen(at1)).toBe(true);
    expect(Object.isFrozen(at1[0])).toBe(true);
    expect(buildRiverStretchSlots(frame, 0, null, null).map((s) => s.zoneId)).toEqual([null, null, null]);
    expect(stretchRingIndex(-4, 3)).toBe(2);
  });

  it("streams the distinct zones of S−r..S+r, current first", () => {
    const anchor = { stretchIndex: 0, zoneId: 3 };
    expect(streamedZoneIds(0, anchor, 3, 2)).toEqual([3, 2, 1]);
    expect(streamedZoneIds(0, anchor, 3, 0)).toEqual([3]);
    expect(streamedZoneIds(4, { stretchIndex: 0, zoneId: 1 }, 1, 2)).toEqual([1]);
    expect(streamedZoneIds(0, anchor, 9, 2)).toEqual([3, 2, 4, 1, 5]);
    expect(streamedZoneIds(0, null, 3, 2)).toEqual([]);
  });

  it("rejects invalid input with RangeError", () => {
    expect(() => zoneIdForStretch(0.5, null, 1)).toThrow(RangeError);
    expect(() => zoneIdForStretch(0, { stretchIndex: 0, zoneId: 0 }, 1)).toThrow(RangeError);
    expect(() => zoneIdForStretch(0, { stretchIndex: 0.5, zoneId: 1 }, 1)).toThrow(RangeError);
    expect(() => zoneIdForStretch(0, { stretchIndex: 0, zoneId: 1 }, 0)).toThrow(RangeError);
    expect(() => streamedZoneIds(0, null, 1, -1)).toThrow(RangeError);
    expect(() => buildRiverStretchSlots(frame, Number.NaN, null, null)).toThrow(RangeError);
    expect(() => stretchRingIndex(0, 0)).toThrow(RangeError);
  });
});
