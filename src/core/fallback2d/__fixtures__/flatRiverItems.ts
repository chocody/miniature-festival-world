import { LOY_KRATHONG_RIVER_LANE_ID } from "@/config/events/loyKrathong.river.config";
import { RIVER_DRIFT_SPEED_FACTOR } from "@/config/riverFlow.config";
import { DEFAULT_KRATHONG_APPEARANCE, serializeKrathongAppearance } from "@/core/customization";
import type { PublicCreation } from "@/services/api/creationTypes";

/** Test fixture: a public Loy Krathong creation in zone 1, spaced along the lane by index. */
export function makePublicCreation(i: number, overrides: Partial<PublicCreation> = {}): PublicCreation {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    eventId: "loy_krathong",
    zoneId: 1,
    appearance: serializeKrathongAppearance(DEFAULT_KRATHONG_APPEARANCE) as unknown as PublicCreation["appearance"],
    coord: {
      mode: "SPLINE_PATH",
      laneId: LOY_KRATHONG_RIVER_LANE_ID,
      spawnProgress: i / 10,
      speedFactor: RIVER_DRIFT_SPEED_FACTOR,
      lateralOffset: 0,
    },
    publicWishText: "ขอให้มีความสุข",
    createdAt: "2026-11-24T12:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
    displayName: null,
    ...overrides,
  };
}
