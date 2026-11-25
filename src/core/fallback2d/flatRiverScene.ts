import type { WorldXZ } from "@/core/coordinates/types";
import type { BankPlacement, RiverEnvironmentDefinition } from "@/core/world/riverEnvironment"; // type-only
import { createFlatLane, createFlatLaneFrameOut, flatLaneFrameInto, type FlatLane } from "./flatLane";
import type { BoundsXZ } from "./topDownProjection";

/** = RIVER_CHANNEL_CURVE_ID in src/core/world/riverEnvironment.ts (pinned by flatRiverScene.test.ts; value import would load three). */
export const FLAT_RIVER_CHANNEL_CURVE_ID = 0;

export interface FlatProp {
  readonly x: number;
  readonly z: number;
  readonly scale: number;
  readonly yawRad: number;
}
export interface FlatRiverScene {
  readonly channel: FlatLane;
  /** Closed polygon of the visible water (channel ±width/2): left edge at progress 0→1, then right edge 1→0. */
  readonly waterOutline: readonly WorldXZ[];
  /** Deck rectangle seen from above: [bankEnd − flow·w/2, bankEnd + flow·w/2, tip + flow·w/2, tip − flow·w/2]. */
  readonly pierDeck: readonly WorldXZ[];
  readonly pierTip: WorldXZ;
  readonly houses: readonly FlatProp[];
  readonly trees: readonly FlatProp[];
  readonly lamps: readonly FlatProp[];
  /** Map bounds: water ± visibleBankDepth, cropped by endMarginProgress at both lane ends (owner decision 22). */
  readonly bounds: BoundsXZ;
}

const SIDES = [-1, 1] as const;

/** Three-free twin of the 2D-relevant part of resolveRiverEnvironment (same expressions, bit-identical). */
export function resolveFlatRiverScene(
  def: RiverEnvironmentDefinition,
  visibleBankDepth: number,
  endMarginProgress: number,
): FlatRiverScene {
  if (def.channel.controlPoints.some((p) => p.y !== 0)) {
    throw new RangeError("river channel control points must have y === 0");
  }
  if (!Number.isFinite(visibleBankDepth) || visibleBankDepth <= 0) {
    throw new RangeError("visibleBankDepth must be finite and > 0");
  }
  if (!Number.isFinite(endMarginProgress) || endMarginProgress < 0 || endMarginProgress >= 0.5) {
    throw new RangeError("endMarginProgress must be in [0, 0.5)");
  }
  const channel = createFlatLane({
    laneId: FLAT_RIVER_CHANNEL_CURVE_ID,
    controlPoints: def.channel.controlPoints,
    width: def.channel.width,
    closed: false,
  });
  const half = def.channel.width / 2;
  const n = def.ribbonSegments;
  const f = createFlatLaneFrameOut();

  const left: WorldXZ[] = [];
  const rightEdge: WorldXZ[] = [];
  for (let i = 0; i <= n; i++) {
    flatLaneFrameInto(channel, i / n, f);
    left.push(Object.freeze({ x: f.cx + f.rx * -half, z: f.cz + f.rz * -half }));
    rightEdge.push(Object.freeze({ x: f.cx + f.rx * half, z: f.cz + f.rz * half }));
  }
  const waterOutline = Object.freeze([...left, ...rightEdge.reverse()]);

  const outer = half + visibleBankDepth;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i <= n; i++) {
    const p = endMarginProgress + (1 - 2 * endMarginProgress) * (i / n);
    flatLaneFrameInto(channel, p, f);
    for (const s of SIDES) {
      const x = f.cx + f.rx * s * outer;
      const z = f.cz + f.rz * s * outer;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }
  const bounds: BoundsXZ = Object.freeze({ minX, maxX, minZ, maxZ });

  const resolve = (p: BankPlacement): FlatProp => {
    flatLaneFrameInto(channel, p.progress, f);
    const d = p.side * (half + p.setback);
    return Object.freeze({
      x: f.cx + f.rx * d,
      z: f.cz + f.rz * d,
      scale: p.scale,
      yawRad: Math.atan2(-p.side * f.rx, -p.side * f.rz) + p.yawOffsetRad,
    });
  };
  const houses = Object.freeze(def.houses.map(resolve));
  const trees = Object.freeze(def.trees.map(resolve));
  const lamps = Object.freeze(def.lamps.map(resolve));

  flatLaneFrameInto(channel, def.pier.progress, f);
  const flowX = f.rz;
  const flowZ = -f.rx;
  const at = (lat: number): WorldXZ => ({
    x: f.cx + f.rx * def.pier.side * lat,
    z: f.cz + f.rz * def.pier.side * lat,
  });
  const bankEnd = half + def.pier.onBankLength;
  const tipLat = half - def.pier.overWaterLength;
  const w = def.pier.width / 2;
  const b = at(bankEnd);
  const t = at(tipLat);
  const pierDeck = Object.freeze([
    Object.freeze({ x: b.x - flowX * w, z: b.z - flowZ * w }),
    Object.freeze({ x: b.x + flowX * w, z: b.z + flowZ * w }),
    Object.freeze({ x: t.x + flowX * w, z: t.z + flowZ * w }),
    Object.freeze({ x: t.x - flowX * w, z: t.z - flowZ * w }),
  ]);

  return Object.freeze({
    channel,
    waterOutline,
    pierDeck,
    pierTip: Object.freeze(t),
    houses,
    trees,
    lamps,
    bounds,
  });
}
