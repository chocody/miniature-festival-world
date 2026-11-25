import { wrap01 } from "@/core/math/wrap01";
import type { SplinePathCoord } from "./SplinePathCoord"; // type-only: no runtime cycle
import { MS_PER_SECOND } from "./splineConstants";

function elapsedMsOf(createdAtMs: number, nowMs: number): number {
  const elapsedMs = nowMs - createdAtMs;
  return !Number.isFinite(elapsedMs) || elapsedMs < 0 ? 0 : elapsedMs;
}

/**
 * Spec §4.1: CurrentProgress(t) = (spawnProgress + (now − createdAt) × speedFactor) % 1.0,
 * with time in seconds (createdAtMs / nowMs are Unix epoch ms). Negative or non-finite elapsed counts as 0.
 * Only + − × ÷ % are used, so identical inputs give bit-identical output on every client.
 */
export function currentProgress(
  coord: Pick<SplinePathCoord, "spawnProgress" | "speedFactor">,
  createdAtMs: number,
  nowMs: number,
): number {
  const elapsedMs = elapsedMsOf(createdAtMs, nowMs);
  const raw = wrap01((elapsedMs / MS_PER_SECOND) * coord.speedFactor);
  const travelled = Number.isFinite(raw) ? raw : 0; // defence in depth for unvalidated input
  return wrap01(coord.spawnProgress + travelled);
}

/** Inverse of {@link currentProgress}: the spawnProgress that yields `progress` at `nowMs`. */
export function spawnProgressFromCurrent(
  progress: number,
  speedFactor: number,
  createdAtMs: number,
  nowMs: number,
): number {
  const elapsedMs = elapsedMsOf(createdAtMs, nowMs);
  const raw = wrap01((elapsedMs / MS_PER_SECOND) * speedFactor);
  const travelled = Number.isFinite(raw) ? raw : 0; // defence in depth for unvalidated input
  return wrap01(progress - travelled);
}
