import { RIVER_DRIFT_SPEED_FACTOR } from "@/config/riverFlow.config";
import { RELEASE_SPOT_MATCH_EPSILON, SPLINE_LATERAL_OFFSET_LIMIT } from "@/config/ritual.config";
import type { SplinePathCoord } from "@/core/coordinates/SplinePathCoord";
import { wrap01 } from "@/core/math/wrap01";

export interface LaneSpotLike {
  readonly laneId: number;
  readonly progress: number;
  readonly lateralOffset: number;
}

/** The coord for a spot chosen now: three-free twin of riverCoordFromSpot(spot, t) (createdAt = now ⇒ spawnProgress = progress). */
export function buildReleaseCoord(spot: LaneSpotLike): SplinePathCoord {
  if (!Number.isInteger(spot.laneId) || spot.laneId < 0) throw new RangeError("laneId must be an integer >= 0");
  if (!Number.isFinite(spot.progress)) throw new RangeError("progress must be finite");
  if (!Number.isFinite(spot.lateralOffset)) throw new RangeError("lateralOffset must be finite");
  return {
    mode: "SPLINE_PATH",
    laneId: spot.laneId,
    spawnProgress: wrap01(spot.progress),
    speedFactor: RIVER_DRIFT_SPEED_FACTOR,
    lateralOffset: Math.min(SPLINE_LATERAL_OFFSET_LIMIT, Math.max(-SPLINE_LATERAL_OFFSET_LIMIT, spot.lateralOffset)),
  };
}

const COORD_KEYS = ["laneId", "lateralOffset", "mode", "spawnProgress", "speedFactor"];

/** Shallow three-free shape check of an untrusted coord (exactly 5 keys). The 3D chunk deep-validates again (prepareRiverItems). */
export function isSplinePathCoordShape(value: unknown): value is SplinePathCoord {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  const keys = Object.keys(value).sort();
  if (keys.length !== COORD_KEYS.length || keys.some((k, i) => k !== COORD_KEYS[i])) return false;
  const v = value as Record<string, unknown>;
  const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
  return (
    v.mode === "SPLINE_PATH" &&
    typeof v.laneId === "number" &&
    Number.isSafeInteger(v.laneId) &&
    v.laneId >= 0 &&
    finite(v.spawnProgress) &&
    v.spawnProgress >= 0 &&
    v.spawnProgress <= 1 &&
    finite(v.speedFactor) &&
    v.speedFactor >= 0 &&
    finite(v.lateralOffset) &&
    v.lateralOffset >= -SPLINE_LATERAL_OFFSET_LIMIT &&
    v.lateralOffset <= SPLINE_LATERAL_OFFSET_LIMIT
  );
}

/** True when the server stored a different spot than the one sent (lane, circular progress or lateral beyond RELEASE_SPOT_MATCH_EPSILON). */
export function didServerMoveSpot(sent: SplinePathCoord, final: SplinePathCoord): boolean {
  const d = Math.abs(sent.spawnProgress - final.spawnProgress) % 1;
  const circ = Math.min(d, 1 - d);
  return (
    sent.laneId !== final.laneId ||
    circ > RELEASE_SPOT_MATCH_EPSILON ||
    Math.abs(sent.lateralOffset - final.lateralOffset) > RELEASE_SPOT_MATCH_EPSILON
  );
}
