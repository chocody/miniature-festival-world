// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cylindricalCoordToWorld, type NormalizedCylindricalCoord } from "@/core/coordinates/CylindricalCoord";
import {
  QUADRANT_VIEW_ANGLES_DEG,
  angleDeltaDeg,
  createCylindricalView2D,
  cylindricalToQuadrant2D,
  isVisibleInQuadrant,
  nearestQuadrantAngle,
  normalizeAngleDeg,
  quadrant2DToCylindrical,
  quadrantFocusFor,
  stepQuadrant,
  type CylindricalView2D,
} from "./cylindricalQuadrant";

const VIEW: CylindricalView2D = createCylindricalView2D({
  centerX: 200,
  tiers: [
    { tierId: 0, baseY: 400, height: 120, bottomRadius: 150, topRadius: 90 },
    { tierId: 1, baseY: 280, height: 100, bottomRadius: 100, topRadius: 0 },
  ],
});
const coord = (angleDeg: number, heightRatio: number, tierId = 0): NormalizedCylindricalCoord => ({
  mode: "CYLINDRICAL_SURFACE",
  tierId,
  angleDeg,
  heightRatio,
});
const rad = (deg: number) => (deg * Math.PI) / 180;
const circular = (a: number, b: number) => Math.min(Math.abs(a - b) % 360, 360 - (Math.abs(a - b) % 360));

describe("cylindricalToQuadrant2D (spec §4.2)", () => {
  it("camera 0: front, edges and back", () => {
    const front = cylindricalToQuadrant2D(coord(0, 0), 0, VIEW)!;
    expect(front.x).toBeCloseTo(200, 9);
    expect(front.y).toBe(400);
    expect(front.facing).toBe(1);
    expect(cylindricalToQuadrant2D(coord(90, 0), 0, VIEW)!.x).toBeCloseTo(350, 9);
    expect(cylindricalToQuadrant2D(coord(180, 0), 0, VIEW)).toBeNull();
    expect(cylindricalToQuadrant2D(coord(270, 0), 0, VIEW)!.x).toBeCloseTo(50, 9);
    const mid = cylindricalToQuadrant2D(coord(90, 0.5), 0, VIEW)!;
    expect(mid.y).toBe(340);
    expect(mid.x).toBeCloseTo(200 + 120, 9);
  });
  it("camera 90 turns the tree", () => {
    expect(cylindricalToQuadrant2D(coord(90, 0), 90, VIEW)!.x).toBeCloseTo(200, 9);
    expect(cylindricalToQuadrant2D(coord(0, 0), 90, VIEW)!.x).toBeCloseTo(50, 9);
  });
  it("returns null for an invalid coord, an unknown tier or a bad camera", () => {
    expect(cylindricalToQuadrant2D(coord(400, 0), 0, VIEW)).toBeNull();
    expect(cylindricalToQuadrant2D({ ...coord(0, 0), mode: "SPLINE_PATH" } as never, 0, VIEW)).toBeNull();
    expect(cylindricalToQuadrant2D({ ...coord(0, 0), x: 1 } as never, 0, VIEW)).toBeNull();
    expect(cylindricalToQuadrant2D(coord(0, 0, 7), 0, VIEW)).toBeNull();
    expect(cylindricalToQuadrant2D(coord(0, 0), NaN, VIEW)).toBeNull();
  });
});

describe("visibility", () => {
  it("equals cos(Δ) >= 0 on a 5° grid for the four cameras; both ±90° edges are visible", () => {
    for (const camera of QUADRANT_VIEW_ANGLES_DEG) {
      for (let a = 0; a <= 360; a += 5) {
        expect(isVisibleInQuadrant(a, camera)).toBe(Math.cos(rad(a - camera)) >= -1e-12);
      }
      expect(isVisibleInQuadrant(camera + 90, camera)).toBe(true);
      expect(isVisibleInQuadrant(camera - 90, camera)).toBe(true);
    }
    expect(isVisibleInQuadrant(NaN, 0)).toBe(false);
  });
});

describe("quadrant2DToCylindrical", () => {
  it("round-trips every visible coord on a 5° × 0.1 grid within 1e-9", () => {
    for (const camera of QUADRANT_VIEW_ANGLES_DEG) {
      for (const tierId of [0, 1]) {
        for (let a = 0; a < 360; a += 5) {
          for (let k = 0; k <= 10; k++) {
            const h = k / 10;
            const c = coord(a, h, tierId);
            const p = cylindricalToQuadrant2D(c, camera, VIEW);
            const tier = VIEW.tiers[tierId];
            if (!p || tier.bottomRadius + (tier.topRadius - tier.bottomRadius) * h <= 0) continue;
            const back = quadrant2DToCylindrical(p, tierId, camera, VIEW)!;
            expect(back).not.toBeNull();
            expect(back.tierId).toBe(tierId);
            expect(Math.abs(back.heightRatio - h)).toBeLessThan(1e-9);
            expect(circular(back.angleDeg, a)).toBeLessThan(1e-9);
          }
        }
      }
    }
  });
  it("returns null outside the silhouette, above the tier, for an unknown tier and off the apex", () => {
    expect(quadrant2DToCylindrical({ x: 200 + 150 + 1, y: 400 }, 0, 0, VIEW)).toBeNull();
    expect(quadrant2DToCylindrical({ x: 200, y: 400 - 1.1 * 120 }, 0, 0, VIEW)).toBeNull();
    expect(quadrant2DToCylindrical({ x: 200, y: 400 }, 9, 0, VIEW)).toBeNull();
    expect(quadrant2DToCylindrical({ x: 200, y: 180 }, 1, 90, VIEW)!.angleDeg).toBeCloseTo(90, 9);
    expect(quadrant2DToCylindrical({ x: 201, y: 180 }, 1, 90, VIEW)).toBeNull();
    expect(quadrant2DToCylindrical({ x: NaN, y: 180 }, 1, 90, VIEW)).toBeNull();
  });
});

describe("angle helpers and quadrant switcher", () => {
  it("normalises and measures angles", () => {
    expect(normalizeAngleDeg(-90)).toBe(270);
    expect(normalizeAngleDeg(360)).toBe(0);
    expect(Object.is(normalizeAngleDeg(-0), 0)).toBe(true);
    expect(normalizeAngleDeg(NaN)).toBeNaN();
    expect(angleDeltaDeg(270, 0)).toBe(-90);
    expect(angleDeltaDeg(180, 0)).toBe(-180);
  });
  it("finds the nearest quadrant and steps", () => {
    expect([44, 45, 226, 315, 359].map(nearestQuadrantAngle)).toEqual([0, 90, 270, 0, 0]);
    expect(stepQuadrant(270, 1)).toBe(0);
    expect(stepQuadrant(0, -1)).toBe(270);
  });
  it("Find My picks the quadrant of the coord", () => {
    const focus = quadrantFocusFor(coord(200, 0.5, 1), VIEW)!;
    expect(focus.cameraAngleDeg).toBe(180);
    expect(focus.point.facing).toBeGreaterThanOrEqual(Math.cos(rad(45)) - 1e-12);
    expect(quadrantFocusFor(coord(0, 0, 9), VIEW)).toBeNull();
  });
});

describe("coord → 3D world → orthographic side view = coord → 2D (invariant B)", () => {
  it("agrees within 1e-9", () => {
    const k = 100;
    const y0 = 600;
    const tier3D = { tierId: 0, baseY: 2, height: 3, bottomRadius: 1.5, topRadius: 0.9 };
    const view = createCylindricalView2D({
      centerX: 200,
      tiers: [{ tierId: 0, baseY: y0 - k * 2, height: k * 3, bottomRadius: k * 1.5, topRadius: k * 0.9 }],
    });
    for (const c of QUADRANT_VIEW_ANGLES_DEG) {
      for (let a = 0; a < 360; a += 15) {
        for (const h of [0, 0.3, 1]) {
          const cc = coord(a, h);
          const p = cylindricalToQuadrant2D(cc, c, view);
          if (!p) continue;
          const w = cylindricalCoordToWorld(cc, tier3D);
          const cos = Math.cos(rad(c));
          const sin = Math.sin(rad(c));
          expect(p.x).toBeCloseTo(200 + k * (w.x * cos - w.z * sin), 9);
          expect(p.y).toBeCloseTo(y0 - k * w.y, 9);
        }
      }
    }
  });
});

describe("createCylindricalView2D", () => {
  const tier = { tierId: 0, baseY: 0, height: 1, bottomRadius: 1, topRadius: 1 };
  it("rejects bad layouts and freezes a copy", () => {
    expect(() => createCylindricalView2D({ centerX: 0, tiers: [{ ...tier, height: 0 }] })).toThrow(/tiers\[0\]\.height/);
    expect(() => createCylindricalView2D({ centerX: 0, tiers: [{ ...tier, bottomRadius: -1 }] })).toThrow(RangeError);
    expect(() => createCylindricalView2D({ centerX: 0, tiers: [tier, tier] })).toThrow(RangeError);
    expect(() => createCylindricalView2D({ centerX: 0, tiers: [{ ...tier, tierId: 0.5 }] })).toThrow(RangeError);
    const v = createCylindricalView2D({ centerX: 0, tiers: [tier] });
    expect(Object.isFrozen(v)).toBe(true);
    expect(Object.isFrozen(v.tiers[0])).toBe(true);
  });
});
