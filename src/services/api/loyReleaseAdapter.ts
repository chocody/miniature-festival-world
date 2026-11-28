import type { FestivalEventId } from "@/config/events/types";
import { LOY_KRATHONG_PIER_RELEASE_SPOT } from "@/config/events/loyKrathong.riverLane.config";
import { DEFAULT_KRATHONG_APPEARANCE, serializeKrathongAppearance } from "@/core/customization/krathongAppearance";
import { buildReleaseCoord, didServerMoveSpot, isTreeSlot } from "@/core/ritual";
import type { ReleaseLanding } from "@/core/world/releaseSpot";
import type { RiverSpot } from "@/core/world/riverCollision";
import type { AppearanceJson, PublicCreation } from "./creationTypes";
import type { ReleaseEventAdapter } from "./releaseAdapter";

export type ResolveReleaseLanding = (
  candidate: RiverSpot,
  zoneItems: readonly PublicCreation[],
  zone: { eventId: FestivalEventId; zoneId: number } | null,
  nowMs: number,
) => ReleaseLanding;

export interface LoyReleaseAdapterDeps {
  readonly loadLandingResolver?: () => Promise<ResolveReleaseLanding>;
}

const defaultLoadLandingResolver = (): Promise<ResolveReleaseLanding> =>
  import("@/core/world/releaseSpot").then((m) => m.resolveReleaseLandingForZone);

export function createLoyReleaseAdapter(deps: LoyReleaseAdapterDeps = {}): ReleaseEventAdapter {
  const loadLandingResolver = deps.loadLandingResolver ?? defaultLoadLandingResolver;
  return {
    eventId: "loy_krathong",
    acceptsOrigin: (origin) => origin.kind === "pier" || origin.kind === "drop",
    defaultCandidate: () => LOY_KRATHONG_PIER_RELEASE_SPOT,
    resolveLanding(candidate, ctx) {
      // Client pre-check only when the scene can mount; a tree slot is never resolved here.
      // Returned synchronously when nothing is awaited, so a scene-less release reaches submit without a tick.
      if (isTreeSlot(candidate) || !ctx.sceneTier) return { landing: candidate, collided: false };
      return (async () => {
        try {
          const resolve = await loadLandingResolver();
          const { zoneItems, zone } = ctx.readZone();
          return resolve(candidate, zoneItems, zone, ctx.now());
        } catch {
          return { landing: candidate, collided: false };
        }
      })();
    },
    buildCoord(landing) {
      if (isTreeSlot(landing)) throw new RangeError("loy_krathong lands on a river spot");
      return buildReleaseCoord(landing);
    },
    didServerMove({ sent, final }) {
      if (sent.mode === "SPLINE_PATH" && final.mode === "SPLINE_PATH") return didServerMoveSpot(sent, final);
      return true;
    },
    serializeAppearance: (b) =>
      serializeKrathongAppearance(b.appearance ?? DEFAULT_KRATHONG_APPEARANCE) as unknown as AppearanceJson,
  };
}
