import { MS_PER_SECOND } from "@/config/gimmicks.config";
import { RIVER_DRIFT_SPEED_FACTOR } from "@/config/riverFlow.config";
import type { EndlessRiverFrame } from "@/core/coordinates/endlessRiverFrame";
import { wrap01 } from "@/core/math/wrap01";

/*
 * MFW-79 (backlog 14.5) water with more depth: a field of soft swells written into the water ribbon's vertex NORMALS. Positions
 * stay flat (taps, float height and the overlays are unchanged) and the material / shader program stay the same; the lighting
 * turns the light-facing slopes into bands that drift downstream with the krathongs. Pure and render-time only (invariant B).
 */

/** One train of parallel swells. */
export interface WaterWaveTrain {
  readonly alongCycles: number; // integer >= 1: crests per stretch length (seamless across stretch copies)
  readonly acrossPerUnit: number; // finite: cycles per world unit across the river (0 = crests square to the flow)
  readonly phase: number; // finite, cycles
  readonly speedScale: number; // finite >= 0: × RIVER_DRIFT_SPEED_FACTOR (progress / s), as the glints
  readonly tiltAlong: number; // finite >= 0: normal tilt along the flow at a crest
  readonly tiltAcross: number; // finite >= 0: normal tilt across the flow
}

export interface WaterWaveSpec {
  readonly trains: readonly WaterWaveTrain[];
}

const XYZ = 3;
const FULL_TURN = 2 * Math.PI;

function requireFiniteNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and >= 0`);
}

/** RangeError when a train breaks the bounds of WaterWaveTrain. An empty train list is allowed (flat normals). */
export function assertWaterWaveSpec(spec: WaterWaveSpec): void {
  spec.trains.forEach((train, index) => {
    const name = `trains[${index}]`;
    if (!Number.isInteger(train.alongCycles) || train.alongCycles < 1) {
      throw new RangeError(`${name}.alongCycles must be an integer >= 1`);
    }
    if (!Number.isFinite(train.acrossPerUnit)) throw new RangeError(`${name}.acrossPerUnit must be finite`);
    if (!Number.isFinite(train.phase)) throw new RangeError(`${name}.phase must be finite`);
    requireFiniteNonNegative(train.speedScale, `${name}.speedScale`);
    requireFiniteNonNegative(train.tiltAlong, `${name}.tiltAlong`);
    requireFiniteNonNegative(train.tiltAcross, `${name}.tiltAcross`);
  });
}

/**
 * Wave normals of `vertexCount` vertices (xyz `positions`, stretch-local, in the endless-river frame) at `timeMs` into `out`.
 * Per vertex: s = along, c = across; per train τ = wrap01(alongCycles·t·RIVER_DRIFT_SPEED_FACTOR·speedScale) and
 * θ = 2π(alongCycles·s / L − τ + acrossPerUnit·c + phase); gA += tiltAlong·cos θ, gC += tiltAcross·cos θ;
 * n = normalize(a·gA + c·gC + (0, 1, 0)). Allocation-free; the spec is validated by assertWaterWaveSpec, not here.
 */
export function writeWaterWaveNormals(
  positions: ArrayLike<number>,
  vertexCount: number,
  frame: EndlessRiverFrame,
  timeMs: number,
  spec: WaterWaveSpec,
  out: Float32Array,
): Float32Array {
  if (!Number.isInteger(vertexCount) || vertexCount < 0) throw new RangeError("vertexCount must be an integer >= 0");
  if (positions.length < XYZ * vertexCount) throw new RangeError("positions must hold 3 · vertexCount values");
  if (out.length < XYZ * vertexCount) throw new RangeError("out must hold 3 · vertexCount values");
  if (!Number.isFinite(timeMs)) throw new RangeError("timeMs must be finite");
  const { originX, originZ, axisX, axisZ, length } = frame;
  const seconds = timeMs / MS_PER_SECOND;
  const trains = spec.trains;
  const trainCount = trains.length;
  for (let i = 0; i < vertexCount; i++) {
    const o = i * XYZ;
    const dx = positions[o] - originX;
    const dz = positions[o + 2] - originZ;
    const s = dx * axisX + dz * axisZ;
    const c = -dx * axisZ + dz * axisX;
    let gA = 0;
    let gC = 0;
    for (let k = 0; k < trainCount; k++) {
      const train = trains[k];
      const tau = wrap01(train.alongCycles * seconds * RIVER_DRIFT_SPEED_FACTOR * train.speedScale);
      const theta = FULL_TURN * ((train.alongCycles * s) / length - tau + train.acrossPerUnit * c + train.phase);
      const wave = Math.cos(theta);
      gA += train.tiltAlong * wave;
      gC += train.tiltAcross * wave;
    }
    const inv = 1 / Math.sqrt(1 + gA * gA + gC * gC);
    out[o] = (axisX * gA - axisZ * gC) * inv;
    out[o + 1] = inv;
    out[o + 2] = (axisZ * gA + axisX * gC) * inv;
  }
  return out;
}
