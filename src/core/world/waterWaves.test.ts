import { describe, expect, it } from "vitest";
import { LOY_KRATHONG_RIVER_LAYOUT } from "@/components/models/loyKrathong/riverLayout";
import { RIVER_WATER_WAVES } from "@/config/events/loyKrathong.river.config";
import { MS_PER_SECOND } from "@/config/gimmicks.config";
import { RIVER_DRIFT_SPEED_FACTOR } from "@/config/riverFlow.config";
import { getLoyKrathongEndlessRiverFrame } from "./endlessRiver";
import { assertWaterWaveSpec, writeWaterWaveNormals, type WaterWaveSpec, type WaterWaveTrain } from "./waterWaves";

const frame = getLoyKrathongEndlessRiverFrame();
const water = LOY_KRATHONG_RIVER_LAYOUT.water;
const T0 = 1_700_000_000_000;

function normalsOf(positions: ArrayLike<number>, count: number, timeMs: number, spec: WaterWaveSpec): Float32Array {
  return writeWaterWaveNormals(positions, count, frame, timeMs, spec, new Float32Array(count * 3));
}

/** The normal at one world point (x, z). */
function normalAt(x: number, z: number, timeMs: number, spec: WaterWaveSpec): [number, number, number] {
  const n = normalsOf([x, 0, z], 1, timeMs, spec);
  return [n[0], n[1], n[2]];
}

const TRAIN: WaterWaveTrain = { alongCycles: 6, acrossPerUnit: 0, phase: 0, speedScale: 1, tiltAlong: 0.2, tiltAcross: 0 };

describe("writeWaterWaveNormals (MFW-79)", () => {
  it("WW1: zero tilt or no trains → every normal is exactly (0, 1, 0)", () => {
    const flat: WaterWaveSpec = { trains: RIVER_WATER_WAVES.trains.map((t) => ({ ...t, tiltAlong: 0, tiltAcross: 0 })) };
    for (const spec of [flat, { trains: [] }]) {
      const n = normalsOf(water.positions, water.vertexCount, T0, spec);
      for (let i = 0; i < water.vertexCount; i++) {
        expect(n[i * 3] === 0 && n[i * 3 + 1] === 1 && n[i * 3 + 2] === 0, `vertex ${i}`).toBe(true);
      }
    }
  });

  it("WW2: the shipped swells give unit normals, bounded tilt and some tilted vertices", () => {
    const sumAlong = RIVER_WATER_WAVES.trains.reduce((s, t) => s + t.tiltAlong, 0);
    const sumAcross = RIVER_WATER_WAVES.trains.reduce((s, t) => s + t.tiltAcross, 0);
    const minY = 1 / Math.sqrt(1 + sumAlong ** 2 + sumAcross ** 2);
    for (const t of [0, T0, 1_700_000_012_345]) {
      const n = normalsOf(water.positions, water.vertexCount, t, RIVER_WATER_WAVES);
      let lowest = 1;
      for (let i = 0; i < water.vertexCount; i++) {
        const [x, y, z] = [n[i * 3], n[i * 3 + 1], n[i * 3 + 2]];
        expect(Math.abs(Math.hypot(x, y, z) - 1)).toBeLessThanOrEqual(1e-6);
        expect(y).toBeGreaterThanOrEqual(minY - 1e-9);
        lowest = Math.min(lowest, y);
      }
      expect(lowest, `t = ${t}`).toBeLessThan(1 - 1e-4);
    }
  });

  it("WW3: the swells move with the flow (a crest shifts downstream by the drift distance)", () => {
    const spec = { trains: [TRAIN] };
    const dt = 5_000;
    const d = (dt / MS_PER_SECOND) * RIVER_DRIFT_SPEED_FACTOR * frame.length;
    const p0 = { x: frame.originX + 3 * frame.axisX, z: frame.originZ + 3 * frame.axisZ };
    const before = normalAt(p0.x, p0.z, T0, spec);
    const moved = normalAt(p0.x + d * frame.axisX, p0.z + d * frame.axisZ, T0 + dt, spec);
    for (let k = 0; k < 3; k++) expect(Math.abs(moved[k] - before[k])).toBeLessThanOrEqual(1e-7);
    const stayed = normalAt(p0.x, p0.z, T0 + dt, spec);
    expect(Math.max(Math.abs(stayed[0] - before[0]), Math.abs(stayed[2] - before[2]))).toBeGreaterThan(1e-4);
  });

  it("WW4: stretch copies are seamless (P and P + period get the same normal)", () => {
    for (const [along, across] of [
      [1.3, -0.8],
      [7.1, 0.4],
      [15.9, 2.2],
    ]) {
      const x = frame.originX + along * frame.axisX - across * frame.axisZ;
      const z = frame.originZ + along * frame.axisZ + across * frame.axisX;
      const a = normalAt(x, z, T0, RIVER_WATER_WAVES);
      const b = normalAt(x + frame.periodX, z + frame.periodZ, T0, RIVER_WATER_WAVES);
      for (let k = 0; k < 3; k++) expect(Math.abs(a[k] - b[k])).toBeLessThanOrEqual(1e-7);
    }
  });

  it("WW5: returns the same out array and is deterministic", () => {
    const out = new Float32Array(water.vertexCount * 3);
    expect(writeWaterWaveNormals(water.positions, water.vertexCount, frame, T0, RIVER_WATER_WAVES, out)).toBe(out);
    const again = normalsOf(water.positions, water.vertexCount, T0, RIVER_WATER_WAVES);
    expect(Array.from(again)).toEqual(Array.from(out));
  });

  it("WW6: RangeError on bad buffers, time or vertex count; assertWaterWaveSpec rejects out-of-bound trains", () => {
    const n = water.vertexCount;
    const write = (positions: ArrayLike<number>, count: number, t: number, out: Float32Array) => () =>
      writeWaterWaveNormals(positions, count, frame, t, RIVER_WATER_WAVES, out);
    expect(write(water.positions, n, T0, new Float32Array(n * 3 - 1))).toThrow(RangeError);
    expect(write(water.positions.subarray(0, n * 3 - 1), n, T0, new Float32Array(n * 3))).toThrow(RangeError);
    expect(write(water.positions, n, Number.NaN, new Float32Array(n * 3))).toThrow(RangeError);
    expect(write(water.positions, 1.5, T0, new Float32Array(n * 3))).toThrow(RangeError);
    expect(write(water.positions, -1, T0, new Float32Array(n * 3))).toThrow(RangeError);
    const bad = (patch: Partial<WaterWaveTrain>) => () => assertWaterWaveSpec({ trains: [{ ...TRAIN, ...patch }] });
    expect(bad({ alongCycles: 2.5 })).toThrow(RangeError);
    expect(bad({ alongCycles: 0 })).toThrow(RangeError);
    expect(bad({ speedScale: -1 })).toThrow(RangeError);
    expect(bad({ tiltAlong: -0.1 })).toThrow(RangeError);
    expect(bad({ tiltAcross: Number.NaN })).toThrow(RangeError);
    expect(bad({ acrossPerUnit: Number.POSITIVE_INFINITY })).toThrow(RangeError);
    expect(bad({ phase: Number.NaN })).toThrow(RangeError);
    expect(() => assertWaterWaveSpec({ trains: [] })).not.toThrow();
  });

  it("WW7: the shipped RIVER_WATER_WAVES is valid with integer alongCycles", () => {
    expect(() => assertWaterWaveSpec(RIVER_WATER_WAVES)).not.toThrow();
    expect(RIVER_WATER_WAVES.trains.length).toBeGreaterThan(0);
    for (const t of RIVER_WATER_WAVES.trains) expect(Number.isInteger(t.alongCycles)).toBe(true);
    expect(Object.isFrozen(RIVER_WATER_WAVES)).toBe(true);
  });
});
