// Import-free e2e body builder (kept apart from src so Playwright needs no path aliases).
export const E2E_RIVER_LANE_ID = 1;
export const E2E_DRIFT_SPEED_FACTOR = 0.008;

const TOKEN_BYTES = 32;

/** A fresh DeviceOwnerToken: 32 random bytes, base64url without padding (43 chars). */
export function e2eOwnerToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function e2eCreateBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eventId: "loy_krathong",
    appearance: {
      base: "banana_trunk_01",
      lotusFold: "style_01",
      leafColor: "#5E8C3A",
      flowers: ["marigold", "marigold", "marigold", "marigold", "marigold", "marigold", "marigold", "marigold"],
      candleColor: "#FFD166",
    },
    coord: {
      mode: "SPLINE_PATH",
      laneId: E2E_RIVER_LANE_ID,
      spawnProgress: 0.48,
      speedFactor: E2E_DRIFT_SPEED_FACTOR,
      lateralOffset: 0,
    },
    wishText: "ขอให้ทุกคนมีความสุข",
    wishVisibility: "public",
    ownerToken: e2eOwnerToken(),
    ...overrides,
  };
}
