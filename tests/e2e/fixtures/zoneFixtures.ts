/** = LOY_KRATHONG_RIVER_LANE_ID (src/config/events/loyKrathong.river.config.ts); zone-e2e-fixtures.test.ts checks it. */
export const E2E_LANE_ID = 1;
/** = RIVER_DRIFT_SPEED_FACTOR (src/config/riverFlow.config.ts); checked by the same test. */
export const E2E_SPEED_FACTOR = 0.008;
export const E2E_EVENT_ID = "loy_krathong";
export const E2E_APPEARANCE = {
  base: "banana_trunk_01",
  lotusFold: "style_01",
  leafColor: "#5E8C3A",
  flowers: ["marigold"],
  candleColor: "#FFD166",
};
const E2E_ZONE_ID_STRIDE = 1000;
const E2E_PROGRESS_STEPS = 100;
const E2E_ID_DIGITS = 12;
const E2E_BODY_LIMIT = 80;

export function e2eItemId(zoneId: number, index: number): string {
  return `00000000-0000-4000-8000-${String(zoneId * E2E_ZONE_ID_STRIDE + index).padStart(E2E_ID_DIGITS, "0")}`;
}

export function makeZoneItem(zoneId: number, index: number): Record<string, unknown> {
  return {
    id: e2eItemId(zoneId, index),
    eventId: E2E_EVENT_ID,
    zoneId,
    appearance: E2E_APPEARANCE,
    coord: {
      mode: "SPLINE_PATH",
      laneId: E2E_LANE_ID,
      spawnProgress: (index % E2E_PROGRESS_STEPS) / E2E_PROGRESS_STEPS,
      speedFactor: E2E_SPEED_FACTOR,
      lateralOffset: 0,
    },
    publicWishText: null,
    createdAt: "2026-11-24T12:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
}

export function makeZoneBody(
  zoneId: number,
  count: number,
): { eventId: string; zoneId: number; limit: number; items: Record<string, unknown>[] } {
  return {
    eventId: E2E_EVENT_ID,
    zoneId,
    limit: E2E_BODY_LIMIT,
    items: Array.from({ length: count }, (_, i) => makeZoneItem(zoneId, i + 1)),
  };
}
