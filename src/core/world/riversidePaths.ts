import { splineProgressToPoseInto, type RiverLane, type SplinePoseOut } from "@/core/coordinates";
import { bankSurfaceY, type BankProfilePoint } from "./bankProfile";
import type { BankSide } from "./riverEnvironment";

/**
 * Riverside walking path on one bank (MFW-49 contract for MFW-50 villagers). Config only, never persisted, not drawn.
 * The walkable strip is [setback − halfWidth, setback + halfWidth] world units from the channel edge, between
 * fromProgress and toProgress along the channel.
 */
export interface RiversidePathDefinition {
  readonly pathId: number; // integer ≥ 1, unique
  readonly side: BankSide; // -1 left of the flow (far bank), 1 right (near bank)
  readonly setback: number; // path centreline, world units from the channel edge
  readonly halfWidth: number; // walkable strip = setback ± halfWidth
  readonly fromProgress: number; // [0, 1)
  readonly toProgress: number; // (fromProgress, 1]
}

export function assertRiversidePath(path: RiversidePathDefinition, bankWidth: number): void {
  const { pathId, side, setback, halfWidth, fromProgress, toProgress } = path;
  if (!Number.isInteger(pathId) || pathId < 1) throw new RangeError("path pathId must be an integer >= 1");
  if (side !== -1 && side !== 1) throw new RangeError("path side must be -1 or 1");
  for (const [name, value] of [
    ["setback", setback],
    ["halfWidth", halfWidth],
    ["fromProgress", fromProgress],
    ["toProgress", toProgress],
    ["bankWidth", bankWidth],
  ] as const) {
    if (!Number.isFinite(value)) throw new RangeError(`path ${name} must be finite`);
  }
  if (!(halfWidth > 0)) throw new RangeError("path halfWidth must be > 0");
  if (!(setback - halfWidth > 0)) throw new RangeError("path must not touch the water edge (setback - halfWidth > 0)");
  if (!(setback + halfWidth < bankWidth)) throw new RangeError("path must stay on the bank (setback + halfWidth < bankWidth)");
  if (!(fromProgress >= 0 && fromProgress < toProgress && toProgress <= 1)) {
    throw new RangeError("path progress must satisfy 0 <= fromProgress < toProgress <= 1");
  }
}

/**
 * Allocation-free, render-time only (never persisted, invariant A). Writes x, y (bank surface), z and yawRad (downstream flow
 * yaw) of the point at `progress` (clamped to [fromProgress, toProgress]) and `across` (clamped to [−1, 1]; ±1 = strip edges).
 */
export function riversidePathPoseInto(
  channel: RiverLane,
  path: RiversidePathDefinition,
  profile: readonly BankProfilePoint[],
  progress: number,
  across: number,
  out: SplinePoseOut,
): SplinePoseOut {
  if (!Number.isFinite(progress) || !Number.isFinite(across)) throw new RangeError("progress and across must be finite");
  const p = Math.min(path.toProgress, Math.max(path.fromProgress, progress));
  const a = Math.min(1, Math.max(-1, across));
  const offset = path.setback + a * path.halfWidth;
  splineProgressToPoseInto(channel, p, 0, out); // centreline and downstream yaw
  // right = (−cos yaw, sin yaw) is the lane's right vector; added here because the spline helpers clamp lateral to ±0.5.
  const d = path.side * (channel.width / 2 + offset);
  out.x += -Math.cos(out.yawRad) * d;
  out.z += Math.sin(out.yawRad) * d;
  out.y = bankSurfaceY(profile, offset);
  return out;
}
