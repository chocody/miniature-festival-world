// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FLAT_RIVER_END_MARGIN_PROGRESS } from "@/config/fallback2d.config";
import { LOY_KRATHONG_RIVER_ENVIRONMENT, LOY_KRATHONG_RIVER_LANE_ID } from "@/config/events/loyKrathong.river.config";
import { RIVER_COLLISION_RADIUS } from "@/config/riverFlow.config";
import { LOY_KRATHONG_RIVER_LAYOUT } from "@/components/models/loyKrathong/riverLayout";
import { RIVER_CHANNEL_CURVE_ID } from "@/core/world/riverEnvironment";
import { createFlatLaneFrameOut, flatLaneFrameInto } from "./flatLane";
import { FLAT_RIVER_CHANNEL_CURVE_ID, resolveFlatRiverScene } from "./flatRiverScene";
import { getLoyKrathongFlatRiver } from "./loyKrathongFlatRiver";
import { worldToCanvas } from "./topDownProjection";

const DIGITS = 12;
const def = LOY_KRATHONG_RIVER_ENVIRONMENT;
const layout = LOY_KRATHONG_RIVER_LAYOUT;
const { scene, projection, lanes } = getLoyKrathongFlatRiver();

describe("flat river scene = MFW-27 resolved layout", () => {
  it("pins the channel curve id", () => {
    expect(FLAT_RIVER_CHANNEL_CURVE_ID).toBe(RIVER_CHANNEL_CURVE_ID);
  });

  it.each(["houses", "trees", "lamps"] as const)("%s match the 3D instance transforms", (key) => {
    expect(scene[key]).toHaveLength(layout[key].length);
    scene[key].forEach((p, i) => {
      const t = layout[key][i];
      expect(p.x).toBeCloseTo(t.position.x, DIGITS);
      expect(p.z).toBeCloseTo(t.position.z, DIGITS);
      expect(p.yawRad).toBeCloseTo(t.yawRad, DIGITS);
      expect(p.scale).toBeCloseTo(t.scale, DIGITS);
    });
  });

  it("pier tip, deck centre and deck size match", () => {
    expect(scene.pierTip.x).toBeCloseTo(layout.pier.tip.x, DIGITS);
    expect(scene.pierTip.z).toBeCloseTo(layout.pier.tip.z, DIGITS);
    const cx = scene.pierDeck.reduce((s, p) => s + p.x, 0) / 4;
    const cz = scene.pierDeck.reduce((s, p) => s + p.z, 0) / 4;
    expect(cx).toBeCloseTo(layout.pier.deckCenter.x, DIGITS);
    expect(cz).toBeCloseTo(layout.pier.deckCenter.z, DIGITS);
    const [a, b, c] = scene.pierDeck;
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(layout.pier.width, 9);
    expect(Math.hypot(c.x - b.x, c.z - b.z)).toBeCloseTo(layout.pier.length, 9);
  });

  it("water outline equals the inner ribbon edges within Float32 precision", () => {
    const n = def.ribbonSegments;
    expect(scene.waterOutline).toHaveLength(2 * (n + 1));
    const bankLeft = layout.banks.left.positions;
    const bankRight = layout.banks.right.positions;
    for (let i = 0; i <= n; i++) {
      const left = scene.waterOutline[i];
      const right = scene.waterOutline[2 * (n + 1) - 1 - i];
      expect(Math.abs(left.x - bankLeft[(2 * i + 1) * 3])).toBeLessThan(1e-5);
      expect(Math.abs(left.z - bankLeft[(2 * i + 1) * 3 + 2])).toBeLessThan(1e-5);
      expect(Math.abs(right.x - bankRight[2 * i * 3])).toBeLessThan(1e-5);
      expect(Math.abs(right.z - bankRight[2 * i * 3 + 2])).toBeLessThan(1e-5);
    }
  });

  it("bounds contain the water between the end margins and the margin hides a whole sprite", () => {
    const m = FLAT_RIVER_END_MARGIN_PROGRESS;
    const n = def.ribbonSegments;
    const f = createFlatLaneFrameOut();
    const half = def.channel.width / 2;
    for (let i = 0; i <= n; i++) {
      const p = m + (1 - 2 * m) * (i / n);
      flatLaneFrameInto(scene.channel, p, f);
      for (const s of [-1, 1]) {
        const x = f.cx + f.rx * s * half;
        const z = f.cz + f.rz * s * half;
        expect(x).toBeGreaterThanOrEqual(scene.bounds.minX);
        expect(x).toBeLessThanOrEqual(scene.bounds.maxX);
        expect(z).toBeGreaterThanOrEqual(scene.bounds.minZ);
        expect(z).toBeLessThanOrEqual(scene.bounds.maxZ);
      }
    }
    const lane = lanes.get(LOY_KRATHONG_RIVER_LANE_ID)!;
    const length = lane.arcLengths[lane.arcLengths.length - 1];
    expect(m * length).toBeGreaterThan(RIVER_COLLISION_RADIUS);
  });

  it("never draws the % 1 wrap (owner decision 22)", () => {
    const lane = lanes.get(LOY_KRATHONG_RIVER_LANE_ID)!;
    const f = createFlatLaneFrameOut();
    const radiusPx = RIVER_COLLISION_RADIUS * projection.scale;
    // The jump happens between progress 1 and 0: both ends must be fully outside the map (the sprite slides in over the margin).
    for (const p of [0, 1]) {
      for (const lat of [-0.5, 0, 0.5]) {
        flatLaneFrameInto(lane, p, f);
        const point = worldToCanvas({ x: f.cx + f.rx * lat * lane.width, z: f.cz + f.rz * lat * lane.width }, projection);
        const fullyLeft = point.x + radiusPx <= 0;
        const fullyRight = point.x - radiusPx >= projection.viewport.width;
        expect(fullyLeft || fullyRight).toBe(true);
      }
    }
  });

  it("rejects bad input", () => {
    const bent = { ...def, channel: { ...def.channel, controlPoints: def.channel.controlPoints.map((p) => ({ ...p, y: 1 })) } };
    expect(() => resolveFlatRiverScene(bent, 1, 0.05)).toThrow(RangeError);
    expect(() => resolveFlatRiverScene(def, 0, 0.05)).toThrow(RangeError);
    expect(() => resolveFlatRiverScene(def, 1, 0.5)).toThrow(RangeError);
  });
});
