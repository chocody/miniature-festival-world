/** TEST FIXTURES ONLY — not product river geometry (spec gives none). */
import type { RiverLaneDefinition } from "../SplinePathCoord";

export const STRAIGHT_LANE_DEF: RiverLaneDefinition = {
  laneId: 1,
  controlPoints: [
    { x: 0, y: 0, z: 0 },
    { x: 50, y: 0, z: 0 },
    { x: 100, y: 0, z: 0 },
  ],
  width: 10,
};

export const S_LANE_DEF: RiverLaneDefinition = {
  laneId: 2,
  controlPoints: [
    { x: 0, y: 0, z: 0 },
    { x: 30, y: 1, z: 20 },
    { x: 60, y: 2, z: -20 },
    { x: 90, y: 2, z: 0 },
  ],
  width: 6,
};

export const LOOP_LANE_DEF: RiverLaneDefinition = {
  laneId: 3,
  controlPoints: Array.from({ length: 8 }, (_, k) => ({
    x: 40 * Math.cos((k * Math.PI) / 4),
    y: 0,
    z: 40 * Math.sin((k * Math.PI) / 4),
  })),
  width: 8,
  closed: true,
};

export const PROGRESS_SAMPLES = [0, 0.00001, 0.001, 0.1, 0.25, 0.5, 0.75, 0.999, 0.99999] as const;
export const LATERAL_SAMPLES = [-0.5, -0.25, 0, 0.25, 0.5] as const;
export const VIEWPORTS = [
  { width: 390, height: 844, paddingPx: 16 },
  { width: 1280, height: 720, paddingPx: 0 },
] as const;

/** Measured errors are about 1e-14; boundsPx covers centerline extremes between the 256 bound samples. */
export const TOLERANCE = {
  progress: 1e-9,
  lateral: 1e-9,
  worldUnits: 1e-9,
  canvasPx: 1e-9,
  analyticWorldUnits: 1e-6,
  boundsPx: 0.5,
} as const;

/** Distance on the unit circle [0, 1). */
export function circularDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 1;
  return Math.min(d, 1 - d);
}
