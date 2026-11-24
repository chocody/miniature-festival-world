import { createRiverLane, type RiverLane, type RiverLaneDefinition, type SplinePathCoord } from "./SplinePathCoord";
import { parsePersistableCoord } from "./validateCoord";

/** Lanes of one river scene, looked up by laneId. Built once; immutable. */
export interface RiverLaneSet {
  readonly lanes: readonly RiverLane[]; // in definition order
  get(laneId: number): RiverLane | undefined;
}

/** What positions a river item: the stored coord plus the row's created_at as epoch ms (open question 6). */
export interface RiverPlacementSource {
  readonly coord: SplinePathCoord;
  readonly createdAtMs: number;
}

export function createRiverLaneSet(defs: readonly RiverLaneDefinition[]): RiverLaneSet {
  if (defs.length === 0) throw new RangeError("at least one lane definition is required");
  const map = new Map<number, RiverLane>();
  const lanes: RiverLane[] = [];
  for (const def of defs) {
    const lane = createRiverLane(def);
    if (map.has(def.laneId)) throw new RangeError(`duplicate laneId: ${def.laneId}`);
    lane.curve.getLengths(); // warm the arc-length cache so per-frame getPointAt / getLength allocate nothing
    map.set(def.laneId, lane);
    lanes.push(lane);
  }
  return Object.freeze({ lanes: Object.freeze(lanes), get: (laneId: number) => map.get(laneId) });
}

/** True if the item can be placed: coord passes the write-path validator as SPLINE_PATH and createdAtMs is finite. */
export function isValidRiverPlacement(item: RiverPlacementSource): boolean {
  if (typeof item !== "object" || item === null) return false;
  if (!Number.isFinite(item.createdAtMs)) return false;
  const parsed = parsePersistableCoord(item.coord);
  return parsed.ok && parsed.coord.mode === "SPLINE_PATH";
}
