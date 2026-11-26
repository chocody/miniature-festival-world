import { RIVER_STRETCH_RENDER_RADIUS, ZONE_ID_MIN } from "@/config/world.config";
import type { EndlessRiverFrame } from "@/core/coordinates/endlessRiverFrame";

/*
 * MFW-58 (three-free; shared by the 3D slots and the 2D navigator paging, invariant B): which zone each stretch of the endless river
 * shows. zone(s) = ((anchor.zoneId − 1 + (s − anchor.stretchIndex)) mod N + N) mod N + 1 with N = max(zoneCount ?? 1, anchor.zoneId):
 * with one zone every stretch shows zone 1; after the last zone comes zone 1 again (open question 37). Render-time only, NEVER
 * persisted (invariant A).
 */

/** Stretch `stretchIndex` shows zone `zoneId`; every other stretch follows by the modulo above. */
export interface StretchAnchor {
  readonly stretchIndex: number;
  readonly zoneId: number;
}

function requireStretch(stretchIndex: number): void {
  if (!Number.isSafeInteger(stretchIndex)) throw new RangeError("stretch index must be a safe integer");
}
function requireAnchor(anchor: StretchAnchor): void {
  requireStretch(anchor.stretchIndex);
  if (!Number.isSafeInteger(anchor.zoneId) || anchor.zoneId < ZONE_ID_MIN) throw new RangeError("anchor zone must be >= ZONE_ID_MIN");
}
function requireRadius(radius: number): void {
  if (!Number.isSafeInteger(radius) || radius < 0) throw new RangeError("radius must be a safe integer >= 0");
}

/** N = max(zoneCount ?? ZONE_ID_MIN, anchor.zoneId). */
export function effectiveZoneCount(zoneCount: number | null, anchor: StretchAnchor): number {
  requireAnchor(anchor);
  if (zoneCount !== null && (!Number.isSafeInteger(zoneCount) || zoneCount < ZONE_ID_MIN)) {
    throw new RangeError("zone count must be >= ZONE_ID_MIN");
  }
  return Math.max(zoneCount ?? ZONE_ID_MIN, anchor.zoneId);
}

/** Zone shown by `stretchIndex`; null while no zone is chosen (anchor null). */
export function zoneIdForStretch(stretchIndex: number, anchor: StretchAnchor | null, zoneCount: number | null): number | null {
  requireStretch(stretchIndex);
  if (anchor === null) return null;
  const n = effectiveZoneCount(zoneCount, anchor);
  const k = anchor.zoneId - ZONE_ID_MIN + (stretchIndex - anchor.stretchIndex);
  return (((k % n) + n) % n) + ZONE_ID_MIN;
}

/** ((s mod n) + n) mod n: the fixed slot a stretch is rendered in (a crossing re-uses the far slot). */
export function stretchRingIndex(stretchIndex: number, slots: number): number {
  requireStretch(stretchIndex);
  if (!Number.isSafeInteger(slots) || slots < 1) throw new RangeError("slots must be a safe integer >= 1");
  return ((stretchIndex % slots) + slots) % slots;
}

/** One rendered stretch copy. offset = s·T (world units, render-time only). */
export interface RiverStretchSlot {
  readonly ringIndex: number;
  readonly stretchIndex: number;
  readonly relative: number;
  readonly zoneId: number | null;
  readonly offsetX: number;
  readonly offsetZ: number;
}

/** Slots S−r..S+r in the order current, then by |k| with behind (S−k) before ahead (S+k). Frozen. */
export function buildRiverStretchSlots(
  frame: EndlessRiverFrame,
  currentStretch: number,
  anchor: StretchAnchor | null,
  zoneCount: number | null,
  radius: number = RIVER_STRETCH_RENDER_RADIUS,
): readonly RiverStretchSlot[] {
  requireStretch(currentStretch);
  requireRadius(radius);
  const slots = 2 * radius + 1;
  const out: RiverStretchSlot[] = [];
  const push = (relative: number) => {
    const s = currentStretch + relative;
    out.push(
      Object.freeze({
        ringIndex: stretchRingIndex(s, slots),
        stretchIndex: s,
        relative,
        zoneId: zoneIdForStretch(s, anchor, zoneCount),
        offsetX: s * frame.periodX,
        offsetZ: s * frame.periodZ,
      }),
    );
  };
  push(0);
  for (let k = 1; k <= radius; k++) {
    push(-k);
    push(k);
  }
  return Object.freeze(out);
}

/** Distinct zone ids of stretches S−r..S+r: current first, then by |k| (behind before ahead). [] while the anchor is null. */
export function streamedZoneIds(
  currentStretch: number,
  anchor: StretchAnchor | null,
  zoneCount: number | null,
  radius: number,
): readonly number[] {
  requireStretch(currentStretch);
  requireRadius(radius);
  if (anchor === null) return Object.freeze([]);
  const out: number[] = [];
  const add = (s: number) => {
    const z = zoneIdForStretch(s, anchor, zoneCount) as number;
    if (!out.includes(z)) out.push(z);
  };
  add(currentStretch);
  for (let k = 1; k <= radius; k++) {
    add(currentStretch - k);
    add(currentStretch + k);
  }
  return Object.freeze(out);
}
