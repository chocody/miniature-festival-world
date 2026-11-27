import { createRiverLane, splineProgressToWorld } from "@/core/coordinates";
import type { RiverLane, WorldVec3, WorldXZ } from "@/core/coordinates";
import { acrossOf, alongOf, createEndlessRiverFrame, type EndlessRiverFrame } from "@/core/coordinates/endlessRiverFrame";
import {
  assertBankProfile,
  bankSurfaceY,
  buildBankProfileGeometryData,
  type BankGeometryData,
  type BankProfilePoint,
} from "./bankProfile";
import { assertRiversidePath, type RiversidePathDefinition } from "./riversidePaths";

/** The channel reuses the lane curve machinery; this id is never matched against a SplinePathCoord. */
export const RIVER_CHANNEL_CURVE_ID = 0;

/** -1 = left of the flow, 1 = right of the flow (the +right vector of splineProgressToWorld). */
export type BankSide = -1 | 1;

export interface RiverChannelDefinition {
  readonly controlPoints: readonly WorldVec3[]; // y must be 0 (flat channel)
  readonly width: number; // world units, > 0
}
export interface BankPlacement {
  readonly progress: number; // [0, 1] along the channel (arc length)
  readonly side: BankSide;
  readonly setback: number; // world units from the water edge, >= 0 and < bankWidth
  readonly scale: number; // uniform, finite > 0
  readonly yawOffsetRad: number; // finite; added to the "face the water" yaw
}
export interface PierDefinition {
  readonly progress: number;
  readonly side: BankSide;
  readonly onBankLength: number; // > 0, deck length over the bank
  readonly overWaterLength: number; // > 0, deck length over the water
  readonly width: number; // > 0, across the pier (along the flow)
  readonly deckThickness: number; // > 0
  readonly deckTopY: number;
  readonly pileBottomY: number; // < deckTopY - deckThickness
  readonly releaseInset: number; // > 0, release point distance beyond the tip, over water
  readonly pileAlongFractions: readonly number[]; // each in (0, 1]: fraction of overWaterLength from the water edge
}
export type HouseRoofKind = "pyramid" | "gable";
export const HOUSE_ROOF_KINDS: readonly HouseRoofKind[] = Object.freeze(["pyramid", "gable"] as const);
export interface HousePlacement extends BankPlacement {
  readonly roof: HouseRoofKind;
}
/** Offset in a prop's local frame (local +Z = the prop's front), multiplied by the instance scale. */
export interface LocalOffset {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yawRad?: number; // added to the prop's yaw (MFW-66: back and side windows face away from the front)
}
/** Since MFW-66 the door is part of the house model; the facade lists only the window glasses. */
export interface HouseFacadeDefinition {
  readonly windows: readonly LocalOffset[];
}
/**
 * Flat ground under the diorama (below the water), so no viewport shows the background. MFW-58: two strips per stretch of the endless
 * river — from the banks' outer edge pulled in by `holeMargin` out to a straight edge at across = ±`outerAcross` from the river axis —
 * plus a full-width cap row under the river at each stretch end. The strips never shade pixels the water or banks cover (the MFW-49
 * hole design), and the copies of neighbouring stretches join exactly at the seams.
 */
export interface RiverGroundDefinition {
  readonly y: number; // < min(waterSurfaceY, bankProfile[0].y)
  /** The strips' inner edge stays this far (world units) inside the banks' outer boundary, so no gap shows under a bank edge. [0, bankWidth). */
  readonly holeMargin: number;
  /** Half width of the ground band around the river axis (world units), finite > every inner edge's |across|. */
  readonly outerAcross: number;
}
/** Resolved ground: the strips of one stretch (`buildGroundStripsData`), in the mesh's local xz at y = 0. */
export interface RiverGroundLayout extends RiverGroundDefinition {
  readonly strips: RibbonGeometryData;
}
export interface RiverEnvironmentDefinition {
  readonly channel: RiverChannelDefinition;
  readonly waterSurfaceY: number;
  readonly bankTopY: number; // village terrace height (the flat part of bankProfile)
  readonly bankWidth: number; // > 0
  readonly waterUnderlap: number; // >= 0 and < bankWidth: water extends this far under each bank
  readonly ribbonSegments: number; // integer >= 1
  readonly bankProfile: readonly BankProfilePoint[]; // bank cross-section, last offset === bankWidth
  readonly ground: RiverGroundDefinition;
  readonly houses: readonly HousePlacement[];
  readonly houseFacade: HouseFacadeDefinition;
  readonly trees: readonly BankPlacement[];
  readonly bushes: readonly BankPlacement[];
  readonly rocks: readonly BankPlacement[];
  readonly lamps: readonly BankPlacement[];
  readonly pier: PierDefinition;
  readonly paths: readonly RiversidePathDefinition[]; // MFW-50 walking paths (config only, not drawn)
}
export interface InstanceTransform {
  readonly position: WorldVec3; // instance base (derived, never persisted)
  readonly yawRad: number; // rotation about +Y; local +Z maps to (sin yaw, 0, cos yaw)
  readonly scale: number;
}
export interface RibbonGeometryData {
  readonly positions: Float32Array; // xyz per vertex, y = 0 (the mesh position sets the height)
  readonly indices: Uint32Array;
  readonly vertexCount: number;
}
export interface WorldBoundsXZ {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}
export interface PierLayout {
  readonly deckCenter: WorldVec3;
  readonly yawRad: number; // deck local +Z points from the bank toward the river
  readonly length: number; // onBankLength + overWaterLength (box depth)
  readonly width: number; // box width
  readonly thickness: number; // box height
  readonly tip: WorldVec3; // top of the deck at its river end (y = deckTopY): preview spot for MFW-23
  readonly releasePoint: WorldVec3; // on the water (y = waterSurfaceY), releaseInset beyond the tip
  readonly piles: readonly InstanceTransform[]; // position = pile centre, scale 1, yaw = pier yaw
  readonly pileHeight: number; // deckTopY - deckThickness - pileBottomY
}
export interface RiverFrame {
  readonly centerline: WorldVec3;
  readonly right: WorldVec3;
  readonly flow: WorldXZ;
}
export interface RiverEnvironmentLayout {
  readonly channel: RiverLane;
  readonly waterSurfaceY: number;
  readonly bankTopY: number; // village terrace height
  readonly ribbonSegments: number;
  readonly bankProfile: readonly BankProfilePoint[];
  readonly ground: RiverGroundLayout;
  readonly water: RibbonGeometryData;
  readonly banks: { readonly left: BankGeometryData; readonly right: BankGeometryData };
  readonly houses: readonly InstanceTransform[];
  readonly housesByRoof: Readonly<Record<HouseRoofKind, readonly InstanceTransform[]>>;
  readonly houseWindows: readonly InstanceTransform[];
  readonly trees: readonly InstanceTransform[];
  readonly bushes: readonly InstanceTransform[];
  readonly rocks: readonly InstanceTransform[];
  readonly lamps: readonly InstanceTransform[];
  readonly paths: readonly RiversidePathDefinition[];
  readonly pier: PierLayout;
  readonly bounds: WorldBoundsXZ; // union of the water and both bank ribbons; for a future pan clamp
}

function requireFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
}
function requirePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be finite and > 0`);
}

export function createRiverChannel(def: RiverChannelDefinition): RiverLane {
  if (def.controlPoints.some((p) => p.y !== 0)) {
    throw new RangeError("river channel control points must have y === 0");
  }
  return createRiverLane({
    laneId: RIVER_CHANNEL_CURVE_ID,
    controlPoints: def.controlPoints,
    width: def.width,
    closed: false,
  });
}

export function riverFrameAt(channel: RiverLane, progress: number): RiverFrame {
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
    throw new RangeError("progress must be finite and in [0, 1]");
  }
  const { centerline, right } = splineProgressToWorld(channel, progress, 0);
  return { centerline, right, flow: { x: right.z, z: -right.x } };
}

/** Local +Z faces the water. */
export function facingWaterYaw(right: WorldVec3, side: BankSide): number {
  return Math.atan2(-side * right.x, -side * right.z);
}

export function resolveBankPlacement(channel: RiverLane, placement: BankPlacement, baseY: number): InstanceTransform {
  const { progress, side, setback, scale, yawOffsetRad } = placement;
  if (side !== -1 && side !== 1) throw new RangeError("side must be -1 or 1");
  requireFinite(setback, "setback");
  if (setback < 0) throw new RangeError("setback must be >= 0");
  requirePositive(scale, "scale");
  requireFinite(yawOffsetRad, "yawOffsetRad");
  requireFinite(baseY, "baseY");
  const { centerline: c, right } = riverFrameAt(channel, progress);
  const d = side * (channel.width / 2 + setback);
  return {
    position: { x: c.x + right.x * d, y: baseY, z: c.z + right.z * d },
    yawRad: facingWaterYaw(right, side) + yawOffsetRad,
    scale,
  };
}

export function buildRibbonGeometryData(
  channel: RiverLane,
  fromOffset: number,
  toOffset: number,
  segments: number,
): RibbonGeometryData {
  return buildRibbonRowsGeometryData(channel, fromOffset, toOffset, segments, 0, segments);
}

/**
 * Rows fromRow..toRow of a ribbon of `segments` rows along the channel (row i at progress i / segments), between the lateral offsets
 * fromOffset < toOffset. buildRibbonGeometryData = rows 0..segments (bit-identical).
 */
export function buildRibbonRowsGeometryData(
  channel: RiverLane,
  fromOffset: number,
  toOffset: number,
  segments: number,
  fromRow: number,
  toRow: number,
): RibbonGeometryData {
  requireFinite(fromOffset, "fromOffset");
  requireFinite(toOffset, "toOffset");
  if (!(fromOffset < toOffset)) throw new RangeError("fromOffset must be < toOffset");
  if (!Number.isInteger(segments) || segments < 1) throw new RangeError("segments must be an integer >= 1");
  if (!Number.isInteger(fromRow) || !Number.isInteger(toRow) || fromRow < 0 || toRow > segments || !(fromRow < toRow)) {
    throw new RangeError("rows must be integers with 0 <= fromRow < toRow <= segments");
  }
  const rows = toRow - fromRow;
  const vertexCount = (rows + 1) * 2;
  const positions = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(rows * 6);
  for (let r = 0; r <= rows; r++) {
    const { centerline: c, right } = riverFrameAt(channel, (fromRow + r) / segments);
    const o = r * 6;
    positions[o] = c.x + right.x * fromOffset;
    positions[o + 2] = c.z + right.z * fromOffset;
    positions[o + 3] = c.x + right.x * toOffset;
    positions[o + 5] = c.z + right.z * toOffset;
  }
  for (let i = 0; i < rows; i++) {
    const a = 2 * i;
    indices.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6);
  }
  return { positions, indices, vertexCount };
}

/**
 * MFW-58 ground of one stretch, one position / index buffer (indices offset per part), faces up like the water ribbon:
 * (1) left strip, rows 0..segments: from the straight outer edge O + a·along(centreline) − c·outerAcross to the inner edge
 * centreline − right·innerLateral; (2) right strip, the mirror; (3) a cap under the river at rows 0..1 and (4) at rows
 * segments − 1..segments, lateral −innerLateral..+innerLateral. The outer edges of neighbouring copies (offset by T) join exactly.
 * RangeError when outerAcross is not greater than the largest |across| of an inner vertex (the strip would fold).
 */
export function buildGroundStripsData(
  channel: RiverLane,
  frame: EndlessRiverFrame,
  innerLateral: number,
  outerAcross: number,
  segments: number,
): RibbonGeometryData {
  requirePositive(innerLateral, "innerLateral");
  requirePositive(outerAcross, "outerAcross");
  if (!Number.isInteger(segments) || segments < 2) throw new RangeError("segments must be an integer >= 2");
  const stripVertices = (segments + 1) * 2;
  const caps = [
    buildRibbonRowsGeometryData(channel, -innerLateral, innerLateral, segments, 0, 1),
    buildRibbonRowsGeometryData(channel, -innerLateral, innerLateral, segments, segments - 1, segments),
  ];
  const vertexCount = 2 * stripVertices + caps[0].vertexCount + caps[1].vertexCount;
  const positions = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(2 * segments * 6 + caps[0].indices.length + caps[1].indices.length);
  let maxInnerAcross = 0;
  // Strips: vertex 2i = "from" (the more negative lateral), 2i + 1 = "to", as in buildRibbonRowsGeometryData.
  for (const [part, side] of [
    [0, -1],
    [1, 1],
  ] as const) {
    const base = part * stripVertices;
    for (let i = 0; i <= segments; i++) {
      const { centerline: c, right } = riverFrameAt(channel, i / segments);
      const innerX = c.x + right.x * side * innerLateral;
      const innerZ = c.z + right.z * side * innerLateral;
      maxInnerAcross = Math.max(maxInnerAcross, Math.abs(acrossOf(frame, innerX, innerZ)));
      const along = alongOf(frame, c.x, c.z);
      const outerX = frame.originX + frame.axisX * along - frame.axisZ * side * outerAcross;
      const outerZ = frame.originZ + frame.axisZ * along + frame.axisX * side * outerAcross;
      const [fromX, fromZ, toX, toZ] = side < 0 ? [outerX, outerZ, innerX, innerZ] : [innerX, innerZ, outerX, outerZ];
      const o = (base + 2 * i) * 3;
      positions[o] = fromX;
      positions[o + 2] = fromZ;
      positions[o + 3] = toX;
      positions[o + 5] = toZ;
    }
    for (let i = 0; i < segments; i++) {
      const a = base + 2 * i;
      indices.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], (part * segments + i) * 6);
    }
  }
  if (!(outerAcross > maxInnerAcross)) throw new RangeError("ground outerAcross must exceed every inner edge's |across|");
  let vertexOffset = 2 * stripVertices;
  let indexOffset = 2 * segments * 6;
  for (const cap of caps) {
    positions.set(cap.positions, vertexOffset * 3);
    for (let k = 0; k < cap.indices.length; k++) indices[indexOffset + k] = cap.indices[k] + vertexOffset;
    vertexOffset += cap.vertexCount;
    indexOffset += cap.indices.length;
  }
  return { positions, indices, vertexCount };
}

export function ribbonBoundsXZ(data: Pick<RibbonGeometryData, "positions" | "vertexCount">): WorldBoundsXZ {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < data.vertexCount; i++) {
    const x = data.positions[i * 3];
    const z = data.positions[i * 3 + 2];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ };
}

export function mergeBoundsXZ(a: WorldBoundsXZ, b: WorldBoundsXZ): WorldBoundsXZ {
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minZ: Math.min(a.minZ, b.minZ),
    maxZ: Math.max(a.maxZ, b.maxZ),
  };
}

export function resolvePierLayout(channel: RiverLane, pier: PierDefinition, waterSurfaceY: number): PierLayout {
  if (pier.side !== -1 && pier.side !== 1) throw new RangeError("pier side must be -1 or 1");
  requirePositive(pier.onBankLength, "pier onBankLength");
  requirePositive(pier.overWaterLength, "pier overWaterLength");
  requirePositive(pier.width, "pier width");
  requirePositive(pier.deckThickness, "pier deckThickness");
  requirePositive(pier.releaseInset, "pier releaseInset");
  requireFinite(pier.deckTopY, "pier deckTopY");
  requireFinite(pier.pileBottomY, "pier pileBottomY");
  requireFinite(waterSurfaceY, "waterSurfaceY");
  if (!(pier.pileBottomY < pier.deckTopY - pier.deckThickness)) {
    throw new RangeError("pier pileBottomY must be below the deck bottom");
  }
  for (const f of pier.pileAlongFractions) {
    if (!Number.isFinite(f) || f <= 0 || f > 1) throw new RangeError("pier pileAlongFractions must be in (0, 1]");
  }
  if (pier.overWaterLength + pier.releaseInset > channel.width / 2) {
    throw new RangeError("pier overWaterLength + releaseInset must not pass the channel centreline");
  }
  const { centerline: c, right, flow } = riverFrameAt(channel, pier.progress);
  const half = channel.width / 2;
  const at = (lateral: number, y: number): WorldVec3 => ({
    x: c.x + right.x * pier.side * lateral,
    y,
    z: c.z + right.z * pier.side * lateral,
  });
  const bankEnd = half + pier.onBankLength;
  const tipLateral = half - pier.overWaterLength;
  const deckBottomY = pier.deckTopY - pier.deckThickness;
  const yawRad = facingWaterYaw(right, pier.side);
  const pileY = (deckBottomY + pier.pileBottomY) / 2;
  const piles = pier.pileAlongFractions.flatMap((f) => {
    const base = at(half - f * pier.overWaterLength, pileY);
    return ([-1, 1] as const).map((s) => ({
      position: { x: base.x + (flow.x * s * pier.width) / 2, y: pileY, z: base.z + (flow.z * s * pier.width) / 2 },
      yawRad,
      scale: 1,
    }));
  });
  return {
    deckCenter: at((bankEnd + tipLateral) / 2, pier.deckTopY - pier.deckThickness / 2),
    yawRad,
    length: pier.onBankLength + pier.overWaterLength,
    width: pier.width,
    thickness: pier.deckThickness,
    tip: at(tipLateral, pier.deckTopY),
    releasePoint: at(tipLateral - pier.releaseInset, waterSurfaceY),
    piles,
    pileHeight: deckBottomY - pier.pileBottomY,
  };
}

/**
 * Features on each house (windows), house by house then offset by offset: position = house.position +
 * R_y(house.yawRad)·(offset·house.scale), with R_y(θ)(x, z) = (x cos θ + z sin θ, −x sin θ + z cos θ); yaw = house.yawRad +
 * (offset.yawRad ?? 0); scale is the house's.
 */
export function resolveHouseFeatures(
  houses: readonly InstanceTransform[],
  offsets: readonly LocalOffset[],
): InstanceTransform[] {
  const out: InstanceTransform[] = [];
  for (const house of houses) {
    const cos = Math.cos(house.yawRad);
    const sin = Math.sin(house.yawRad);
    for (const o of offsets) {
      const x = o.x * house.scale;
      const z = o.z * house.scale;
      out.push({
        position: {
          x: house.position.x + x * cos + z * sin,
          y: house.position.y + o.y * house.scale,
          z: house.position.z - x * sin + z * cos,
        },
        yawRad: house.yawRad + (o.yawRad ?? 0),
        scale: house.scale,
      });
    }
  }
  return out;
}

function assertGround(def: RiverEnvironmentDefinition): void {
  const { ground } = def;
  requireFinite(ground.y, "ground y");
  requireFinite(ground.holeMargin, "ground holeMargin");
  requirePositive(ground.outerAcross, "ground outerAcross");
  if (ground.holeMargin < 0 || ground.holeMargin >= def.bankWidth) throw new RangeError("ground holeMargin must be >= 0 and < bankWidth");
  if (!Number.isInteger(def.ribbonSegments) || def.ribbonSegments < 2) throw new RangeError("ribbonSegments must be >= 2 for the ground");
  if (!(ground.y < Math.min(def.waterSurfaceY, def.bankProfile[0].y))) {
    throw new RangeError("ground y must be below the water surface and the bank profile");
  }
}

export function resolveRiverEnvironment(def: RiverEnvironmentDefinition): RiverEnvironmentLayout {
  requirePositive(def.bankWidth, "bankWidth");
  requireFinite(def.waterUnderlap, "waterUnderlap");
  if (def.waterUnderlap < 0 || def.waterUnderlap >= def.bankWidth) {
    throw new RangeError("waterUnderlap must be >= 0 and < bankWidth");
  }
  assertBankProfile(def.bankProfile, def.bankWidth, def.waterSurfaceY);
  assertGround(def);
  const lists = {
    houses: def.houses,
    trees: def.trees,
    bushes: def.bushes,
    rocks: def.rocks,
    lamps: def.lamps,
  } as const;
  for (const [name, list] of Object.entries(lists)) {
    list.forEach((p, index) => {
      if (p.setback >= def.bankWidth) throw new RangeError(`${name}[${index}].setback must be < bankWidth`);
    });
  }
  def.houses.forEach((h, index) => {
    if (!HOUSE_ROOF_KINDS.includes(h.roof)) throw new RangeError(`houses[${index}].roof must be one of ${HOUSE_ROOF_KINDS.join(", ")}`);
  });
  const pathIds = new Set<number>();
  for (const path of def.paths) {
    assertRiversidePath(path, def.bankWidth);
    if (pathIds.has(path.pathId)) throw new RangeError(`duplicate path pathId ${path.pathId}`);
    pathIds.add(path.pathId);
  }
  const channel = createRiverChannel(def.channel);
  const half = def.channel.width / 2;
  const water = buildRibbonGeometryData(channel, -(half + def.waterUnderlap), half + def.waterUnderlap, def.ribbonSegments);
  const left = buildBankProfileGeometryData(channel, -1, def.bankProfile, def.ribbonSegments);
  const right = buildBankProfileGeometryData(channel, 1, def.bankProfile, def.ribbonSegments);
  const strips = buildGroundStripsData(
    channel,
    createEndlessRiverFrame(def.channel.controlPoints),
    def.channel.width / 2 + def.bankWidth - def.ground.holeMargin,
    def.ground.outerAcross,
    def.ribbonSegments,
  );
  const resolve = (list: readonly BankPlacement[]) =>
    list.map((p) => resolveBankPlacement(channel, p, bankSurfaceY(def.bankProfile, p.setback)));
  const houses = resolve(def.houses);
  const housesByRoof: Record<HouseRoofKind, InstanceTransform[]> = { pyramid: [], gable: [] };
  def.houses.forEach((h, i) => housesByRoof[h.roof].push(houses[i]));
  return {
    channel,
    waterSurfaceY: def.waterSurfaceY,
    bankTopY: def.bankTopY,
    ribbonSegments: def.ribbonSegments,
    bankProfile: def.bankProfile,
    ground: { y: def.ground.y, holeMargin: def.ground.holeMargin, outerAcross: def.ground.outerAcross, strips },
    water,
    banks: { left, right },
    houses,
    housesByRoof,
    houseWindows: resolveHouseFeatures(houses, def.houseFacade.windows),
    trees: resolve(def.trees),
    bushes: resolve(def.bushes),
    rocks: resolve(def.rocks),
    lamps: resolve(def.lamps),
    paths: def.paths,
    pier: resolvePierLayout(channel, def.pier, def.waterSurfaceY),
    bounds: mergeBoundsXZ(mergeBoundsXZ(ribbonBoundsXZ(water), ribbonBoundsXZ(left)), ribbonBoundsXZ(right)),
  };
}
