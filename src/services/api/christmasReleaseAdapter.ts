import { CHRISTMAS_TREE } from "@/config/events/christmas.tree.config";
import { ZONE_ID_MIN } from "@/config/world.config";
import { parsePersistableCoord } from "@/core/coordinates/validateCoord";
import { DEFAULT_ORNAMENT_APPEARANCE, parseOrnamentAppearance } from "@/core/customization/ornamentAppearance";
import { isTreeSlot } from "@/core/ritual";
import {
  bandOfTier,
  isTreeTierId,
  nearestFreeSlot,
  slotsOfBand,
  snapToSlot,
  treeSlotKey,
  type GrowingTreeConfig,
} from "@/core/world/growingTree";
import type { NormalizedCylindricalCoord } from "@/core/coordinates/CylindricalCoord";
import type { AppearanceJson } from "./creationTypes";
import type { ReleaseEventAdapter } from "./releaseAdapter";

/** Christmas: an ornament hangs on a lattice slot of the growing tree (parametric, invariant A). */
export function createChristmasReleaseAdapter(tree: GrowingTreeConfig = CHRISTMAS_TREE): ReleaseEventAdapter {
  return {
    eventId: "christmas",
    acceptsOrigin: (origin) => origin.kind === "pier" || origin.kind === "hang",
    defaultCandidate: () => slotsOfBand(tree, ZONE_ID_MIN)[0],
    async resolveLanding(candidate, ctx) {
      try {
        if (!isTreeSlot(candidate)) return { landing: candidate, collided: false };
        const snapped = snapToSlot(tree, candidate);
        if (snapped === null) return { landing: candidate, collided: false };
        const band = bandOfTier(tree, snapped.tierId);
        const { zoneItems, zone } = ctx.readZone();
        const occupied: NormalizedCylindricalCoord[] = [];
        if (zone !== null && zone.zoneId === band) {
          for (const item of zoneItems) {
            if (item.coord.mode === "CYLINDRICAL_SURFACE") occupied.push(item.coord);
          }
        }
        const free = nearestFreeSlot(tree, snapped, occupied, band);
        // Band full: the server opens the next band.
        if (free === null) return { landing: snapped, collided: false };
        return { landing: free, collided: treeSlotKey(free) !== treeSlotKey(snapped) };
      } catch {
        return { landing: candidate, collided: false };
      }
    },
    buildCoord(landing) {
      if (!isTreeSlot(landing)) throw new RangeError("christmas hangs on a tree slot");
      if (!isTreeTierId(tree, landing.tierId)) throw new RangeError("tierId is not a tier of the tree");
      // Fresh copy: lattice slots are frozen cache entries.
      const coord = {
        mode: "CYLINDRICAL_SURFACE" as const,
        tierId: landing.tierId,
        angleDeg: landing.angleDeg,
        heightRatio: landing.heightRatio,
      };
      const parsed = parsePersistableCoord(coord);
      if (!parsed.ok) throw new RangeError(parsed.reason);
      return coord;
    },
    didServerMove({ sent, final, finalZoneId }) {
      if (sent.mode !== "CYLINDRICAL_SURFACE" || final.mode !== "CYLINDRICAL_SURFACE") return true;
      const s = snapToSlot(tree, sent) ?? sent;
      const f = snapToSlot(tree, final) ?? final;
      if (treeSlotKey(s) !== treeSlotKey(f)) return true;
      return isTreeTierId(tree, s.tierId) && bandOfTier(tree, s.tierId) !== finalZoneId;
    },
    serializeAppearance(b) {
      const parsed = parseOrnamentAppearance(b.ornamentAppearance ?? DEFAULT_ORNAMENT_APPEARANCE);
      if (!parsed.ok) throw new RangeError(parsed.reason);
      return parsed.appearance as unknown as AppearanceJson;
    },
  };
}
