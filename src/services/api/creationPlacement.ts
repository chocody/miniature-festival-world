import { CHRISTMAS_TREE } from "@/config/events/christmas.tree.config";
import type { FestivalEventId } from "@/config/events/types";
import { ZONE_ID_MIN, ZONE_ITEM_CAP } from "@/config/world.config";
import type { NormalizedCylindricalCoord } from "@/core/coordinates/CylindricalCoord";
import type { RiverLaneSet, RiverPlacementSource } from "@/core/coordinates/riverLaneSet";
import type { PersistableCoord } from "@/core/coordinates/types";
import { bandCapacity, isTreeTierId, nearestFreeSlot, type GrowingTreeConfig } from "@/core/world/growingTree";
import { findNearestFreeSpot, riverCoordFromSpot, type RiverSpot } from "@/core/world/riverCollision";
import { getLoyKrathongRiverLanes } from "@/core/world/riverLanes";
import { assignZoneForNewCreation, type ZoneFill } from "@/core/world/zoneManager";
import type { ZoneItemCount, ZoneOccupant } from "./creationTypes";

export interface PlacementSource {
  zoneItemCounts(): Promise<readonly ZoneItemCount[]>;
  listZoneOccupants(zoneId: number): Promise<readonly ZoneOccupant[]>;
}

export interface PlacementResult {
  readonly zoneId: number;
  readonly coord: PersistableCoord; // final coord to store and return
  readonly expectedOccupantIds: readonly string[];
}

export interface CreationPlacementStrategy {
  /** Static check before any I/O: is this coord placeable for the event? */
  acceptsCoord(coord: PersistableCoord): boolean;
  /** Chooses zone and final coord at server time createdAtMs. Rejects on backend errors or internal inconsistency. */
  place(coord: PersistableCoord, createdAtMs: number, source: PlacementSource): Promise<PlacementResult>;
}

export interface RiverCollisionFns {
  readonly findNearestFreeSpot: typeof findNearestFreeSpot;
  readonly riverCoordFromSpot: typeof riverCoordFromSpot;
}

const DEFAULT_COLLISION: RiverCollisionFns = { findNearestFreeSpot, riverCoordFromSpot };

function toRiverSources(occupants: readonly ZoneOccupant[]): RiverPlacementSource[] {
  const out: RiverPlacementSource[] = [];
  for (const o of occupants) {
    if (o.coord.mode === "SPLINE_PATH") out.push({ coord: o.coord, createdAtMs: o.createdAtMs });
  }
  return out;
}

/**
 * River placement (owner decisions 4 and 25): first zone with a free spot below the cap, else a new zone; the candidate spot
 * is the client's spawnProgress / lateralOffset read at server time, moved to the nearest free spot; speed is forced.
 */
export function createRiverPlacementStrategy(
  lanes: RiverLaneSet,
  collision: RiverCollisionFns = DEFAULT_COLLISION,
  cap: number = ZONE_ITEM_CAP,
): CreationPlacementStrategy {
  function acceptsCoord(coord: PersistableCoord): boolean {
    return coord.mode === "SPLINE_PATH" && lanes.get(coord.laneId) !== undefined;
  }

  async function place(coord: PersistableCoord, createdAtMs: number, source: PlacementSource): Promise<PlacementResult> {
    if (!acceptsCoord(coord) || coord.mode !== "SPLINE_PATH") throw new RangeError("coord is not on a river lane");
    const candidate: RiverSpot = { laneId: coord.laneId, progress: coord.spawnProgress, lateralOffset: coord.lateralOffset };
    const counts = new Map<number, number>();
    for (const c of await source.zoneItemCounts()) counts.set(c.zoneId, c.itemCount);
    let maxZone = ZONE_ID_MIN - 1;
    for (const z of counts.keys()) if (z > maxZone) maxZone = z;
    const fills: ZoneFill[] = [];
    let chosen: { zoneId: number; spot: RiverSpot; ids: readonly string[] } | null = null;
    for (let zoneId = ZONE_ID_MIN; zoneId <= maxZone && chosen === null; zoneId += 1) {
      const count = counts.get(zoneId) ?? 0;
      if (count >= cap) {
        fills.push({ zoneId, itemCount: count, hasFreeSpot: false }); // full: not read
        continue;
      }
      const occupants = count === 0 ? [] : await source.listZoneOccupants(zoneId); // gap: empty, not read
      if (occupants.length >= cap) {
        fills.push({ zoneId, itemCount: occupants.length, hasFreeSpot: false });
        continue;
      }
      const spot = collision.findNearestFreeSpot(candidate, toRiverSources(occupants), lanes, createdAtMs);
      fills.push({ zoneId, itemCount: occupants.length, hasFreeSpot: spot !== null });
      if (spot !== null) chosen = { zoneId, spot, ids: occupants.map((o) => o.id) };
    }
    if (chosen === null) {
      const spot = collision.findNearestFreeSpot(candidate, [], lanes, createdAtMs);
      if (spot === null) throw new Error("no free spot in an empty zone");
      chosen = { zoneId: maxZone + 1, spot, ids: [] };
    }
    const zoneId = assignZoneForNewCreation(fills, cap); // MFW-25 is the rule; this loop only evaluates it lazily
    if (zoneId !== chosen.zoneId) throw new Error("zone assignment mismatch");
    return { zoneId, coord: collision.riverCoordFromSpot(chosen.spot, createdAtMs), expectedOccupantIds: chosen.ids };
  }

  return { acceptsCoord, place };
}

/** Tree placement (plan L16 §1, MFW-97). Coord in and out: CYLINDRICAL_SURFACE only, out = an exact lattice slot. */
export function createTreePlacementStrategy(
  tree: GrowingTreeConfig,
  cap: number = ZONE_ITEM_CAP,
): CreationPlacementStrategy {
  function acceptsCoord(coord: PersistableCoord): boolean {
    return coord.mode === "CYLINDRICAL_SURFACE" && isTreeTierId(tree, coord.tierId);
  }

  async function place(coord: PersistableCoord, _createdAtMs: number, source: PlacementSource): Promise<PlacementResult> {
    if (coord.mode !== "CYLINDRICAL_SURFACE" || !acceptsCoord(coord)) throw new RangeError("coord is not a tree tier");
    const candidate: NormalizedCylindricalCoord = coord;
    const counts = new Map<number, number>();
    for (const c of await source.zoneItemCounts()) counts.set(c.zoneId, c.itemCount);
    let maxZone = ZONE_ID_MIN - 1;
    for (const z of counts.keys()) if (z > maxZone) maxZone = z;
    const fills: ZoneFill[] = [];
    let chosen: { zoneId: number; slot: NormalizedCylindricalCoord; ids: readonly string[] } | null = null;
    for (let zoneId = ZONE_ID_MIN; zoneId <= maxZone && chosen === null; zoneId += 1) {
      const count = counts.get(zoneId) ?? 0;
      const capacity = Math.min(bandCapacity(tree, zoneId), cap);
      if (count >= capacity) {
        fills.push({ zoneId, itemCount: count, hasFreeSpot: false }); // full: not read
        continue;
      }
      const occupants = count === 0 ? [] : await source.listZoneOccupants(zoneId); // gap: empty, not read
      if (occupants.length >= capacity) {
        fills.push({ zoneId, itemCount: occupants.length, hasFreeSpot: false });
        continue;
      }
      const occupied: NormalizedCylindricalCoord[] = [];
      for (const o of occupants) if (o.coord.mode === "CYLINDRICAL_SURFACE") occupied.push(o.coord);
      const slot = nearestFreeSlot(tree, candidate, occupied, zoneId);
      fills.push({ zoneId, itemCount: occupants.length, hasFreeSpot: slot !== null });
      if (slot !== null) chosen = { zoneId, slot, ids: occupants.map((o) => o.id) };
    }
    if (chosen === null) {
      const slot = nearestFreeSlot(tree, candidate, [], maxZone + 1);
      if (slot === null) throw new Error("no free slot in an empty band");
      chosen = { zoneId: maxZone + 1, slot, ids: [] };
    }
    const zoneId = assignZoneForNewCreation(fills, cap);
    if (zoneId !== chosen.zoneId) throw new Error("zone assignment mismatch");
    const { slot } = chosen;
    // Fresh object: slots of slotsOfBand are frozen cache entries.
    const out: NormalizedCylindricalCoord = {
      mode: "CYLINDRICAL_SURFACE",
      tierId: slot.tierId,
      angleDeg: slot.angleDeg,
      heightRatio: slot.heightRatio,
    };
    return { zoneId, coord: out, expectedOccupantIds: chosen.ids };
  }

  return { acceptsCoord, place };
}

const PLACEMENT_FACTORIES: ReadonlyMap<FestivalEventId, () => CreationPlacementStrategy> = new Map([
  ["loy_krathong", () => createRiverPlacementStrategy(getLoyKrathongRiverLanes())],
  ["christmas", () => createTreePlacementStrategy(CHRISTMAS_TREE)],
]);
const built = new Map<FestivalEventId, CreationPlacementStrategy>();

/** Per-event placement registry (like the appearance registry). null = the event cannot be written. */
export function getCreationPlacementStrategy(eventId: FestivalEventId): CreationPlacementStrategy | null {
  const cached = built.get(eventId);
  if (cached !== undefined) return cached;
  const factory = PLACEMENT_FACTORIES.get(eventId);
  if (factory === undefined) return null;
  const strategy = factory();
  built.set(eventId, strategy);
  return strategy;
}
