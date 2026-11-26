// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FLAT_RIVER_END_MARGIN_PROGRESS, FLAT_RIVER_VISIBLE_BANK_DEPTH } from "@/config/fallback2d.config";
import {
  LOY_KRATHONG_RIVER_CHANNEL,
  LOY_KRATHONG_RIVER_ENVIRONMENT,
  LOY_KRATHONG_RIVER_FOLIAGE_DEFINITION,
  LOY_KRATHONG_RIVER_LANE_ID,
  LOY_KRATHONG_RIVER_LANE_WIDTH,
  LOY_KRATHONG_TREE_SHAPES,
  LOY_KRATHONG_TREES,
} from "@/config/events/loyKrathong.river.config";
import { RIVER_COLLISION_RADIUS } from "@/config/riverFlow.config";
import { LOY_KRATHONG_RIVER_FOLIAGE, LOY_KRATHONG_RIVER_LAYOUT } from "@/components/models/loyKrathong/riverLayout";
import { RIVER_CHANNEL_CURVE_ID } from "@/core/world/riverEnvironment";
import { createFlatCanvasScratch, flatProgressToCanvasInto } from "./flatRiverFrame";
import { createFlatLaneFrameOut, flatLaneFrameInto } from "./flatLane";
import { FLAT_RIVER_CHANNEL_CURVE_ID, resolveFlatRiverScene } from "./flatRiverScene";
import { getLoyKrathongFlatRiver } from "./loyKrathongFlatRiver";
import { createCanvasPointOut, worldToCanvas } from "./topDownProjection";

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
    // MFW-49 bank profile rows: vertex k = 0 of row i (index i × rowSize) is the water edge on both banks.
    const leftRow = layout.banks.left.rowSize;
    const rightRow = layout.banks.right.rowSize;
    for (let i = 0; i <= n; i++) {
      const left = scene.waterOutline[i];
      const right = scene.waterOutline[2 * (n + 1) - 1 - i];
      expect(Math.abs(left.x - bankLeft[i * leftRow * 3])).toBeLessThan(1e-5);
      expect(Math.abs(left.z - bankLeft[i * leftRow * 3 + 2])).toBeLessThan(1e-5);
      expect(Math.abs(right.x - bankRight[i * rightRow * 3])).toBeLessThan(1e-5);
      expect(Math.abs(right.z - bankRight[i * rightRow * 3 + 2])).toBeLessThan(1e-5);
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
    const foliage = LOY_KRATHONG_RIVER_FOLIAGE_DEFINITION;
    expect(() => resolveFlatRiverScene(bent, foliage, 1, 0.05)).toThrow(RangeError);
    expect(() => resolveFlatRiverScene(def, foliage, 0, 0.05)).toThrow(RangeError);
    expect(() => resolveFlatRiverScene(def, foliage, 1, 0.5)).toThrow(RangeError);
    // T68: one foliage tree per environment tree.
    expect(() => resolveFlatRiverScene(def, { trees: [], plants: [] }, 1, 0.05)).toThrow(RangeError);
  });
});

describe("flat river scene = the 3D village and foliage (MFW-51, invariant B)", () => {
  const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThan(tol);

  it("T62 houses carry their roof and sit on the 3D per-roof instances", () => {
    const seen = { pyramid: 0, gable: 0 };
    scene.houses.forEach((h, i) => {
      expect(h.roof).toBe(def.houses[i].roof);
      expect(h.side).toBe(def.houses[i].side);
      const t = layout.housesByRoof[h.roof][seen[h.roof]++];
      near(h.x, t.position.x, 1e-12);
      near(h.z, t.position.z, 1e-12);
    });
    expect(seen.pyramid).toBe(layout.housesByRoof.pyramid.length);
    expect(seen.gable).toBe(layout.housesByRoof.gable.length);
  });

  it("T63 bushes, rocks and riverside plants match the 3D instances", () => {
    for (const key of ["bushes", "rocks"] as const) {
      expect(scene[key]).toHaveLength(layout[key].length);
      scene[key].forEach((p, i) => {
        const t = layout[key][i];
        near(p.x, t.position.x, 1e-12);
        near(p.z, t.position.z, 1e-12);
        near(p.yawRad, t.yawRad, 1e-12);
        near(p.scale, t.scale, 1e-12);
      });
    }
    expect(scene.plants).toHaveLength(LOY_KRATHONG_RIVER_FOLIAGE.plants.length);
    scene.plants.forEach((p, i) => {
      const t = LOY_KRATHONG_RIVER_FOLIAGE.plants[i];
      near(p.x, t.position.x, 1e-12);
      near(p.z, t.position.z, 1e-12);
      near(p.yawRad, t.yawRad, 1e-12);
      near(p.scale, t.scale, 1e-12);
    });
  });

  it("T64 tree shapes place the clumps where the 3D foliage puts them", () => {
    const clumps = LOY_KRATHONG_RIVER_FOLIAGE.clumps;
    let k = 0;
    scene.trees.forEach((t, i) => {
      expect(t.shape).toBe(LOY_KRATHONG_TREES[i].shape);
      const cos = Math.cos(t.yawRad);
      const sin = Math.sin(t.yawRad);
      for (const c of LOY_KRATHONG_TREE_SHAPES[t.shape].clumps) {
        near(t.x + (c.x * cos + c.z * sin) * t.scale, clumps[k].position.x, 1e-9);
        near(t.z + (-c.x * sin + c.z * cos) * t.scale, clumps[k].position.z, 1e-9);
        k++;
      }
    });
  });

  it("T65 the water is the shared channel width", () => {
    const n = def.ribbonSegments;
    for (let i = 0; i <= n; i++) {
      const a = scene.waterOutline[i];
      const b = scene.waterOutline[2 * (n + 1) - 1 - i];
      near(Math.hypot(a.x - b.x, a.z - b.z), LOY_KRATHONG_RIVER_CHANNEL.width, 1e-9);
    }
  });

  it("T66 lane ±0.5 through the shared projection is the 3D lane width", () => {
    const lane = lanes.get(LOY_KRATHONG_RIVER_LANE_ID)!;
    const a = flatProgressToCanvasInto(lane, 0.4, -0.5, projection, createCanvasPointOut(), createFlatCanvasScratch());
    const b = flatProgressToCanvasInto(lane, 0.4, 0.5, projection, createCanvasPointOut(), createFlatCanvasScratch());
    near(Math.hypot(a.x - b.x, a.y - b.y), LOY_KRATHONG_RIVER_LANE_WIDTH * projection.scale, 1e-6);
  });

  it("T67 bounds: x spans the water edges, z the bank depth", () => {
    const m = FLAT_RIVER_END_MARGIN_PROGRESS;
    const n = def.ribbonSegments;
    const f = createFlatLaneFrameOut();
    const half = def.channel.width / 2;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i <= n; i++) {
      flatLaneFrameInto(scene.channel, m + (1 - 2 * m) * (i / n), f);
      for (const s of [-1, 1]) {
        const x = f.cx + f.rx * s * half;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        const lat = s * (half + FLAT_RIVER_VISIBLE_BANK_DEPTH);
        const z = f.cz + f.rz * lat;
        expect(z).toBeGreaterThanOrEqual(scene.bounds.minZ);
        expect(z).toBeLessThanOrEqual(scene.bounds.maxZ);
      }
    }
    expect(scene.bounds.minX).toBe(minX);
    expect(scene.bounds.maxX).toBe(maxX);
  });
});
