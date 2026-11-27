import type { SkyLaunchKind } from "@/config/gimmicks.config";

/** 2^32: mulberry32 works on unsigned 32-bit state and maps it to [0, 1) by this divisor. Technical. */
const UINT32_RANGE = 4_294_967_296;

/**
 * Seeded uniform generator (mulberry32): the same seed gives the same sequence, values in [0, 1). A non-safe-integer seed throws a
 * RangeError. One closure per caller; each call allocates nothing.
 */
export function createSeededRandom(seed: number): () => number {
  if (!Number.isSafeInteger(seed)) throw new RangeError("seed must be a safe integer");
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

/** u < fireworkShare → "firework", else "skyLantern" (a NaN u gives "skyLantern"; share 0 → always lantern, 1 → always firework). */
export function pickSkyLaunch(u: number, fireworkShare: number): SkyLaunchKind {
  return u < fireworkShare ? "firework" : "skyLantern";
}

/**
 * The seed of the sky launch generator: `override` when it is a positive safe integer (the test seam), else a non-deterministic seed
 * from `entropy` (a [0, 1) source such as Math.random), as an unsigned 32-bit integer. A bad entropy value gives 0.
 */
export function resolveSkyLaunchSeed(override: unknown, entropy: () => number): number {
  if (typeof override === "number" && Number.isSafeInteger(override) && override > 0) return override;
  const u = entropy();
  if (!Number.isFinite(u) || u < 0 || u >= 1) return 0;
  return Math.floor(u * UINT32_RANGE);
}
