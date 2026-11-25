import type { FestivalEventId } from "@/config/events/types";
import { ZONE_ITEM_CAP } from "@/config/world.config";
import { isValidRiverPlacement, parsePersistableCoord, type SplinePathCoord } from "@/core/coordinates";
import { parseEventAppearance, type KrathongAppearance } from "@/core/customization";
import type { PublicCreation } from "@/services/api/creationTypes";
import type { RiverRenderSource } from "./riverFlow";

/** One renderable krathong of the visible zone. Public fields only (invariant C). Copies the public wish (a public field) for the InspectPopup (MFW-28). Never copy expiresAt or any non-public field. Structurally a RiverFlowItem. */
export interface ZoneRiverItem extends RiverRenderSource {
  readonly appearance: KrathongAppearance;
  readonly publicWishText: string | null;
}
export interface ZoneRiverItemsQuery {
  readonly eventId: FestivalEventId;
  readonly zoneId: number;
}

/** Store items → river items, at most ZONE_ITEM_CAP (AC1). Skips invalid items silently. Not per-frame (useMemo). */
export function publicCreationsToRiverItems(
  creations: readonly PublicCreation[],
  query: ZoneRiverItemsQuery,
): readonly ZoneRiverItem[] {
  const out: ZoneRiverItem[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < creations.length && out.length < ZONE_ITEM_CAP; i++) {
    const c = creations[i];
    if (c.eventId !== query.eventId || c.zoneId !== query.zoneId) continue;
    if (typeof c.id !== "string" || c.id === "" || seen.has(c.id)) continue;
    const createdAtMs = Date.parse(c.createdAt);
    const parsed = parsePersistableCoord(c.coord);
    if (!parsed.ok || parsed.coord.mode !== "SPLINE_PATH") continue;
    const coord: SplinePathCoord = parsed.coord;
    if (!isValidRiverPlacement({ coord, createdAtMs })) continue;
    const appearance = parseEventAppearance(query.eventId, c.appearance);
    if (!appearance.ok) continue;
    seen.add(c.id);
    out.push(Object.freeze({ id: c.id, coord, createdAtMs, appearance: appearance.appearance, publicWishText: c.publicWishText }));
  }
  return Object.freeze(out);
}
