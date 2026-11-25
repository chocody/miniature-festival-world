import { CYLINDRICAL_QUADRANT_EPSILON } from "@/config/fallback2d.config";
import type { NormalizedCylindricalCoord } from "@/core/coordinates/CylindricalCoord";
import { parsePersistableCoord } from "@/core/coordinates/validateCoord";

const FULL_TURN_DEG = 360;
const HALF_TURN_DEG = 180;
const QUADRANT_STEP_DEG = 90;
const QUADRANT_COUNT = 4;

/** Spec §4.2 4-Quadrant View Switcher: หน้า / ขวา / หลัง / ซ้าย (0 = front, 90 = right, 180 = back, 270 = left). */
export const QUADRANT_VIEW_ANGLES_DEG = Object.freeze([0, 90, 180, 270] as const);
export type QuadrantViewAngleDeg = (typeof QUADRANT_VIEW_ANGLES_DEG)[number];
export const QUADRANT_VIEW_NAMES: Readonly<Record<QuadrantViewAngleDeg, "front" | "right" | "back" | "left">> =
  Object.freeze({ 0: "front", 90: "right", 180: "back", 270: "left" });

/** One flat tier in 2D screen units (y down). Layout comes from the festival's 2D scene config (none in Phase 1). */
export interface CylindricalTier2D {
  readonly tierId: number; // integer >= 0, unique in the view
  readonly baseY: number; // Y_tierBase2D: screen y of heightRatio 0
  readonly height: number; // H_tier2D: finite > 0 (heightRatio 1 is at baseY − height)
  readonly bottomRadius: number; // R_2D(0): finite >= 0
  readonly topRadius: number; // R_2D(1): finite >= 0
}
export interface CylindricalView2D {
  readonly centerX: number;
  readonly tiers: readonly CylindricalTier2D[];
}
/** Derived at render time, NEVER persisted. facing = cos(Δ) in [0, 1]. */
export interface QuadrantPoint2D {
  readonly x: number;
  readonly y: number;
  readonly facing: number;
}

export function createCylindricalView2D(def: CylindricalView2D): CylindricalView2D {
  if (!Number.isFinite(def.centerX)) throw new RangeError("centerX must be finite");
  const seen = new Set<number>();
  const tiers = def.tiers.map((t, i) => {
    if (!Number.isInteger(t.tierId) || t.tierId < 0) throw new RangeError(`tiers[${i}].tierId must be an integer >= 0`);
    if (seen.has(t.tierId)) throw new RangeError(`tiers[${i}].tierId must be unique`);
    seen.add(t.tierId);
    if (!Number.isFinite(t.baseY)) throw new RangeError(`tiers[${i}].baseY must be finite`);
    if (!Number.isFinite(t.height) || t.height <= 0) throw new RangeError(`tiers[${i}].height must be finite and > 0`);
    if (!Number.isFinite(t.bottomRadius) || t.bottomRadius < 0) {
      throw new RangeError(`tiers[${i}].bottomRadius must be finite and >= 0`);
    }
    if (!Number.isFinite(t.topRadius) || t.topRadius < 0) {
      throw new RangeError(`tiers[${i}].topRadius must be finite and >= 0`);
    }
    return Object.freeze({
      tierId: t.tierId,
      baseY: t.baseY,
      height: t.height,
      bottomRadius: t.bottomRadius,
      topRadius: t.topRadius,
    });
  });
  return Object.freeze({ centerX: def.centerX, tiers: Object.freeze(tiers) });
}

/** [0, 360); non-finite → NaN. Normalises −0. */
export function normalizeAngleDeg(angleDeg: number): number {
  const r = angleDeg % FULL_TURN_DEG;
  const w = r < 0 ? r + FULL_TURN_DEG : r;
  return w >= FULL_TURN_DEG ? 0 : w === 0 ? 0 : w;
}

/** [-180, 180). Both ±90° edges stay visible (decision D13). */
export function angleDeltaDeg(angleDeg: number, cameraAngleDeg: number): number {
  return normalizeAngleDeg(angleDeg - cameraAngleDeg + HALF_TURN_DEG) - HALF_TURN_DEG;
}

/** lerp(bottomRadius, topRadius, h). */
export function cylindricalRadius2D(tier: CylindricalTier2D, heightRatio: number): number {
  return tier.bottomRadius + (tier.topRadius - tier.bottomRadius) * heightRatio;
}

/** Spec §4.2: visible when cos(angleRad − cameraAngleRad) >= 0. Non-finite → false. */
export function isVisibleInQuadrant(angleDeg: number, cameraAngleDeg: number): boolean {
  if (!Number.isFinite(angleDeg) || !Number.isFinite(cameraAngleDeg)) return false;
  return Math.cos((angleDeltaDeg(angleDeg, cameraAngleDeg) * Math.PI) / HALF_TURN_DEG) >= 0;
}

/**
 * Spec §4.2: X_2D = X_center + R_2D(h) * sin(angleRad − cameraAngleRad), Y_2D = Y_tierBase2D − (h * H_tier2D).
 * null when the coord is invalid, the tier is unknown or the point faces away from the camera.
 */
export function cylindricalToQuadrant2D(
  coord: NormalizedCylindricalCoord,
  cameraAngleDeg: number,
  view: CylindricalView2D,
): QuadrantPoint2D | null {
  const parsed = parsePersistableCoord(coord);
  if (!parsed.ok || parsed.coord.mode !== "CYLINDRICAL_SURFACE") return null;
  if (!Number.isFinite(cameraAngleDeg)) return null;
  const tier = view.tiers.find((t) => t.tierId === coord.tierId);
  if (!tier) return null;
  const deltaRad = (angleDeltaDeg(coord.angleDeg, cameraAngleDeg) * Math.PI) / HALF_TURN_DEG;
  const facing = Math.cos(deltaRad);
  if (facing < 0) return null;
  const h = coord.heightRatio;
  return {
    x: view.centerX + cylindricalRadius2D(tier, h) * Math.sin(deltaRad),
    y: tier.baseY - h * tier.height,
    facing,
  };
}

/** Inverse of cylindricalToQuadrant2D for the visible half (returns null outside the tier or silhouette). */
export function quadrant2DToCylindrical(
  point: { readonly x: number; readonly y: number },
  tierId: number,
  cameraAngleDeg: number,
  view: CylindricalView2D,
): NormalizedCylindricalCoord | null {
  const tier = view.tiers.find((t) => t.tierId === tierId);
  if (!tier) return null;
  if (![point.x, point.y, cameraAngleDeg].every(Number.isFinite)) return null;
  const eps = CYLINDRICAL_QUADRANT_EPSILON;
  const hRaw = (tier.baseY - point.y) / tier.height;
  if (hRaw < -eps || hRaw > 1 + eps) return null;
  const h = Math.min(1, Math.max(0, hRaw));
  const r = cylindricalRadius2D(tier, h);
  const dx = point.x - view.centerX;
  let s: number;
  if (r === 0) {
    if (Math.abs(dx) > eps) return null;
    s = 0;
  } else {
    s = dx / r;
    if (Math.abs(s) > 1 + eps) return null;
    s = Math.min(1, Math.max(-1, s));
  }
  const angleDeg = normalizeAngleDeg(cameraAngleDeg + (Math.asin(s) * HALF_TURN_DEG) / Math.PI);
  return { mode: "CYLINDRICAL_SURFACE", tierId, angleDeg, heightRatio: h };
}

/** Nearest of 0/90/180/270 (45° → 90°, 315° → 0°). */
export function nearestQuadrantAngle(angleDeg: number): QuadrantViewAngleDeg {
  return ((Math.round(normalizeAngleDeg(angleDeg) / QUADRANT_STEP_DEG) % QUADRANT_COUNT) *
    QUADRANT_STEP_DEG) as QuadrantViewAngleDeg;
}

/** +1 = next angle 0 → 90 → 180 → 270; which button label maps to which step is the festival UI's choice. */
export function stepQuadrant(current: QuadrantViewAngleDeg, step: -1 | 1): QuadrantViewAngleDeg {
  return normalizeAngleDeg(current + step * QUADRANT_STEP_DEG) as QuadrantViewAngleDeg;
}

/** Find My in 2D: switch the tree to the quadrant nearest the coord's angle; null if the coord cannot be drawn. */
export function quadrantFocusFor(
  coord: NormalizedCylindricalCoord,
  view: CylindricalView2D,
): { readonly cameraAngleDeg: QuadrantViewAngleDeg; readonly point: QuadrantPoint2D } | null {
  const cameraAngleDeg = nearestQuadrantAngle(coord.angleDeg);
  const point = cylindricalToQuadrant2D(coord, cameraAngleDeg, view);
  return point ? { cameraAngleDeg, point } : null;
}
