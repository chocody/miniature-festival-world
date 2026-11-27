import { ZONE_ID_MIN } from "@/config/world.config";
import {
  cylindricalCoordToWorld,
  type CylindricalTierGeometry,
  type NormalizedCylindricalCoord,
} from "@/core/coordinates/CylindricalCoord";
import type { WorldVec3 } from "@/core/coordinates/types";

/*
 * The one growing Christmas tree (MFW-93, plan L16 §1): a pure, deterministic, three-free model shared by server and client.
 * Zone n = band n. tierId = global tier index counted from the top (tier 0 sits under the star). A tier's shape and slots
 * depend only on its tierId; only its world Y depends on the band count N. Not exported from the `@/core/world` barrel so the
 * server can import it without the three-using siblings (guarded by tests/unit/growing-tree-boundary.test.ts).
 */

/** One ring of ornament slots on a tier. */
export interface TreeSlotRowTemplate {
  readonly heightRatio: number;
  readonly count: number;
  readonly angleOffsetDeg: number;
}

/** Shape of one tier (world units). */
export interface TreeTierTemplate {
  readonly height: number;
  readonly bottomRadius: number;
  readonly topRadius: number;
  readonly rows: readonly TreeSlotRowTemplate[]; // top row first (heightRatio strictly descending)
}

export interface GrowingTreeConfig {
  readonly latticeVersion: string;
  readonly groundY: number;
  readonly trunkHeight: number;
  readonly crownTiers: readonly TreeTierTemplate[]; // band ZONE_ID_MIN, top-down
  readonly skirtTier: TreeTierTemplate; // every tier of every later band
  readonly skirtTiersPerBand: number;
  readonly maxBands: number;
}

const HALF_TURN_DEG = 180;
const FULL_TURN_DEG = 360;

function assertBandCount(tree: GrowingTreeConfig, n: number): void {
  if (!Number.isInteger(n) || n < 1 || n > tree.maxBands) throw new RangeError(`band count out of range: ${n}`);
}

function assertBand(tree: GrowingTreeConfig, b: number): void {
  if (!Number.isInteger(b) || b < ZONE_ID_MIN || b > ZONE_ID_MIN + tree.maxBands - 1) {
    throw new RangeError(`band out of range: ${b}`);
  }
}

function assertTier(tree: GrowingTreeConfig, t: number): void {
  if (!isTreeTierId(tree, t)) throw new RangeError(`tierId out of range: ${t}`);
}

/** C + (N − 1)·S: the number of tiers of a tree with N bands. */
export function tierCountForBands(tree: GrowingTreeConfig, n: number): number {
  assertBandCount(tree, n);
  return tree.crownTiers.length + (n - 1) * tree.skirtTiersPerBand;
}

/** Integer in [0, tierCountForBands(tree, maxBands)). Never throws. */
export function isTreeTierId(tree: GrowingTreeConfig, t: number): boolean {
  return (
    Number.isInteger(t) && t >= 0 && t < tree.crownTiers.length + (tree.maxBands - 1) * tree.skirtTiersPerBand
  );
}

/** Band of tier t: crown tiers are band ZONE_ID_MIN; skirt tier t is in band ZONE_ID_MIN + 1 + floor((t − C) / S). */
export function bandOfTier(tree: GrowingTreeConfig, t: number): number {
  assertTier(tree, t);
  const c = tree.crownTiers.length;
  if (t < c) return ZONE_ID_MIN;
  return ZONE_ID_MIN + 1 + Math.floor((t - c) / tree.skirtTiersPerBand);
}

/** Ascending tierIds of band b. */
export function tiersOfBand(tree: GrowingTreeConfig, b: number): readonly number[] {
  assertBand(tree, b);
  const c = tree.crownTiers.length;
  if (b === ZONE_ID_MIN) return Array.from({ length: c }, (_, i) => i);
  const first = c + (b - ZONE_ID_MIN - 1) * tree.skirtTiersPerBand;
  return Array.from({ length: tree.skirtTiersPerBand }, (_, i) => first + i);
}

/** Shape of tier t; independent of the band count. */
export function tierShape(tree: GrowingTreeConfig, t: number): TreeTierTemplate {
  assertTier(tree, t);
  return t < tree.crownTiers.length ? tree.crownTiers[t] : tree.skirtTier;
}

/** Sum of the tier heights of band b. */
export function bandHeight(tree: GrowingTreeConfig, b: number): number {
  let sum = 0;
  for (const t of tiersOfBand(tree, b)) sum += tierShape(tree, t).height;
  return sum;
}

/** Sum of the heights of tiers 0..t−1 (0 for t = 0). Independent of N. */
export function tierDepthFromTop(tree: GrowingTreeConfig, t: number): number {
  assertTier(tree, t);
  let sum = 0;
  for (let u = 0; u < t; u++) sum += tierShape(tree, u).height;
  return sum;
}

/**
 * World geometry of tier t in a tree of N bands. baseY = groundY + trunkHeight + Σ height(u) for u in (t, T), summed
 * bottom-up (treeWorldToCoord uses the same order, so both produce identical doubles).
 */
export function treeTierGeometry(tree: GrowingTreeConfig, t: number, n: number): CylindricalTierGeometry {
  const count = tierCountForBands(tree, n);
  assertTier(tree, t);
  if (t >= count) throw new RangeError(`tier ${t} is not in a ${n}-band tree`);
  let baseY = tree.groundY + tree.trunkHeight;
  for (let u = count - 1; u > t; u--) baseY += tierShape(tree, u).height;
  const shape = tierShape(tree, t);
  return { tierId: t, baseY, height: shape.height, bottomRadius: shape.bottomRadius, topRadius: shape.topRadius };
}

/** World position of a tree coord in a tree of N bands (derived at render time, never persisted — invariants A, B). */
export function treeCoordToWorld(tree: GrowingTreeConfig, coord: NormalizedCylindricalCoord, n: number): WorldVec3 {
  return cylindricalCoordToWorld(coord, treeTierGeometry(tree, coord.tierId, n));
}

/**
 * Inverse of treeCoordToWorld, ignoring the radius. Tiers are scanned top-down and the first with p.y ≥ baseY wins, so a
 * boundary y belongs to the upper tier (heightRatio 0). Null above the top of tier 0, below the base of the last tier, or for
 * a non-finite component. The surface hit belongs to MFW-94.
 */
export function treeWorldToCoord(tree: GrowingTreeConfig, p: WorldVec3, n: number): NormalizedCylindricalCoord | null {
  const count = tierCountForBands(tree, n);
  if (![p.x, p.y, p.z].every(Number.isFinite)) return null;
  const bases = new Array<number>(count);
  let acc = tree.groundY + tree.trunkHeight;
  for (let u = count - 1; u >= 0; u--) {
    bases[u] = acc;
    acc += tierShape(tree, u).height;
  }
  if (p.y > bases[0] + tierShape(tree, 0).height) return null;
  for (let t = 0; t < count; t++) {
    if (p.y < bases[t]) continue;
    const heightRatio = (p.y - bases[t]) / tierShape(tree, t).height;
    let angleDeg = (Math.atan2(p.x, p.z) * HALF_TURN_DEG) / Math.PI;
    if (angleDeg < 0) angleDeg += FULL_TURN_DEG;
    if (angleDeg === FULL_TURN_DEG) angleDeg = 0;
    return { mode: "CYLINDRICAL_SURFACE", tierId: t, angleDeg, heightRatio };
  }
  return null;
}

const SLOT_CACHE = new WeakMap<GrowingTreeConfig, Map<number, readonly NormalizedCylindricalCoord[]>>();

/** Slot lattice of band b: tiers ascending, then rows in config order, then k = 0..count−1. Frozen and memoized. */
export function slotsOfBand(tree: GrowingTreeConfig, b: number): readonly NormalizedCylindricalCoord[] {
  assertBand(tree, b);
  let perTree = SLOT_CACHE.get(tree);
  if (!perTree) {
    perTree = new Map();
    SLOT_CACHE.set(tree, perTree);
  }
  const cached = perTree.get(b);
  if (cached) return cached;
  const slots: NormalizedCylindricalCoord[] = [];
  for (const tierId of tiersOfBand(tree, b)) {
    for (const row of tierShape(tree, tierId).rows) {
      for (let k = 0; k < row.count; k++) {
        // Exact expression shared by server and client (identical doubles).
        const angleDeg = row.angleOffsetDeg + (k * 360) / row.count;
        slots.push(Object.freeze({ mode: "CYLINDRICAL_SURFACE", tierId, angleDeg, heightRatio: row.heightRatio }));
      }
    }
  }
  const frozen = Object.freeze(slots);
  perTree.set(b, frozen);
  return frozen;
}

/** Number of slots of band b. */
export function bandCapacity(tree: GrowingTreeConfig, b: number): number {
  return slotsOfBand(tree, b).length;
}

/** Identity key of a slot; compare slots by this key after snapToSlot, never by rounding. */
export function treeSlotKey(coord: NormalizedCylindricalCoord): string {
  return `${coord.tierId}|${coord.angleDeg}|${coord.heightRatio}`;
}

/** Circular angle difference in [0°, 180°]. */
function angleDiffDeg(a: number, b: number): number {
  const d = (((a - b) % FULL_TURN_DEG) + FULL_TURN_DEG) % FULL_TURN_DEG;
  return Math.min(d, FULL_TURN_DEG - d);
}

/** Depth below the tree top of a coord, in tree space (independent of N). */
function coordDepth(tree: GrowingTreeConfig, c: NormalizedCylindricalCoord): number {
  return tierDepthFromTop(tree, c.tierId) + (1 - c.heightRatio) * tierShape(tree, c.tierId).height;
}

/** d² = arc² + Δdepth², arc at the slot's own radius. */
function slotDistanceSq(
  tree: GrowingTreeConfig,
  angleDeg: number,
  depth: number,
  slot: NormalizedCylindricalCoord,
): number {
  const shape = tierShape(tree, slot.tierId);
  const radius = shape.bottomRadius + (shape.topRadius - shape.bottomRadius) * slot.heightRatio;
  const arc = (radius * angleDiffDeg(angleDeg, slot.angleDeg) * Math.PI) / HALF_TURN_DEG;
  const dd = depth - coordDepth(tree, slot);
  return arc * arc + dd * dd;
}

/** Lowest-index slot with the strictly smallest d²; null when no slot passes the filter. */
function nearestSlot(
  tree: GrowingTreeConfig,
  slots: readonly NormalizedCylindricalCoord[],
  angleDeg: number,
  depth: number,
  accept: (slot: NormalizedCylindricalCoord) => boolean,
): NormalizedCylindricalCoord | null {
  let best: NormalizedCylindricalCoord | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const slot of slots) {
    if (!accept(slot)) continue;
    const d = slotDistanceSq(tree, angleDeg, depth, slot);
    if (d < bestD) {
      bestD = d;
      best = slot;
    }
  }
  return best;
}

/** Nearest slot of the same tier; null for an invalid tierId or a non-finite angle / heightRatio. */
export function snapToSlot(tree: GrowingTreeConfig, coord: NormalizedCylindricalCoord): NormalizedCylindricalCoord | null {
  if (!isTreeTierId(tree, coord.tierId)) return null;
  if (!Number.isFinite(coord.angleDeg) || !Number.isFinite(coord.heightRatio)) return null;
  const slots = slotsOfBand(tree, bandOfTier(tree, coord.tierId));
  return nearestSlot(tree, slots, coord.angleDeg, coordDepth(tree, coord), (s) => s.tierId === coord.tierId);
}

/**
 * Nearest free slot of `band` to `candidate` in tree space. Occupants are snapped; those outside the band are ignored. A
 * candidate from another band has its depth clamped into the band (angle unchanged). Null when every slot is occupied.
 */
export function nearestFreeSlot(
  tree: GrowingTreeConfig,
  candidate: NormalizedCylindricalCoord,
  occupied: Iterable<NormalizedCylindricalCoord>,
  band: number,
): NormalizedCylindricalCoord | null {
  assertTier(tree, candidate.tierId);
  if (!Number.isFinite(candidate.angleDeg) || !Number.isFinite(candidate.heightRatio)) {
    throw new RangeError("candidate angle and heightRatio must be finite");
  }
  const slots = slotsOfBand(tree, band);
  const bandTiers = tiersOfBand(tree, band);
  const taken = new Set<string>();
  for (const o of occupied) {
    const s = snapToSlot(tree, o);
    if (s && bandTiers.includes(s.tierId)) taken.add(treeSlotKey(s));
  }
  let depth = coordDepth(tree, candidate);
  if (!bandTiers.includes(candidate.tierId)) {
    const top = tierDepthFromTop(tree, bandTiers[0]);
    depth = Math.min(Math.max(depth, top), top + bandHeight(tree, band));
  }
  return nearestSlot(tree, slots, candidate.angleDeg, depth, (s) => !taken.has(treeSlotKey(s)));
}

const rowTuples = (tier: TreeTierTemplate) => tier.rows.map((r) => [r.heightRatio, r.count, r.angleOffsetDeg]);

/**
 * Canonical string of everything that defines stored coords (version, rows, skirt tiers per band). Radii, heights, trunk and
 * maxBands do not move a stored coord and are left out.
 */
export function latticeFingerprint(tree: GrowingTreeConfig): string {
  return `${tree.latticeVersion}:${JSON.stringify({
    crown: tree.crownTiers.map(rowTuples),
    skirt: rowTuples(tree.skirtTier),
    skirtTiersPerBand: tree.skirtTiersPerBand,
  })}`;
}
