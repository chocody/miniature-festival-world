import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import type { RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoxGeometry, InstancedMesh, Matrix4, MeshStandardMaterial } from "three";
import type { ScenePartSpec } from "@/config/scene.config";
import type { FoliageInstance, FoliageOwnerRef, FoliageSwayParams } from "@/core/world";
import { TAP_SHAKE_LOOKS } from "@/config/gimmicks.config";
import { EFFECT_POOL_CAPS } from "@/config/performance.config";
import { createObjectPoolManager, releaseExpiredNudges, startNudge, type NudgeSource } from "@/core/effects";
import { composeInstanceMatrix } from "./instancing";
import { SwayingInstancedPart } from "./SwayingInstancedPart";

const frames = vi.hoisted(() => [] as (() => void)[]);
const invalidate = vi.hoisted(() => vi.fn());
/** The mesh the stub InstancedPart put into the ref. */
const created = vi.hoisted(() => ({ mesh: null as import("three").InstancedMesh | null }));
vi.mock("@react-three/fiber", () => ({
  useFrame: (callback: () => void) => {
    frames.push(callback);
  },
  useThree: (selector: (state: { invalidate: () => void }) => unknown) => selector({ invalidate }),
}));
vi.mock("./InstancedPart", () => ({
  InstancedPart: (props: { meshRef: RefObject<InstancedMesh | null>; transforms: readonly unknown[] }) => {
    if (props.meshRef.current === null) {
      props.meshRef.current = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial(), props.transforms.length);
      created.mesh = props.meshRef.current;
    }
    return null;
  },
}));

const PART: ScenePartSpec = {
  geometry: { kind: "box", width: 1, height: 1, depth: 1 },
  material: { color: "#445566", roughness: 1, metalness: 0, flatShading: false },
  yOffset: 0.5,
  yawOffsetRad: 0,
  castShadow: false,
  receiveShadow: false,
};
const SWAY: FoliageSwayParams = { shear: 0.1, periodMs: 1000, windDirX: 1, windDirZ: 0 };
const INSTANCES: FoliageInstance[] = [
  { position: { x: 1, y: 0, z: 2 }, yawRad: 0.3, scale: 1, swayPivotY: 0, swayPhaseRad: 0 },
  { position: { x: -1, y: 0, z: 0 }, yawRad: 0, scale: 2, swayPivotY: 0, swayPhaseRad: 0 },
];
const now = () => 250;

const atRest = (mesh: InstancedMesh) =>
  INSTANCES.every((t, i) => {
    const got = new Matrix4();
    mesh.getMatrixAt(i, got);
    const want = composeInstanceMatrix(t, PART, new Matrix4());
    // instanceMatrix is Float32: compare to 1e-6.
    return got.elements.every((v, k) => Math.abs(v - want.elements[k]) < 1e-6);
  });

beforeEach(() => {
  frames.length = 0;
  invalidate.mockClear();
  created.mesh = null;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SwayingInstancedPart (MFW-70 AC4)", () => {
  it("W1: the frame callback leans the instances and never invalidates", () => {
    render(<SwayingInstancedPart name="x" part={PART} instances={INSTANCES} shadows={false} sway={SWAY} now={now} />);
    expect(frames.length).toBeGreaterThan(0);
    const calls = invalidate.mock.calls.length;
    frames[frames.length - 1]();
    expect(created.mesh).not.toBeNull();
    expect(atRest(created.mesh!)).toBe(false);
    expect(invalidate.mock.calls.length).toBe(calls);
  });

  it("W2: with sway null the frame callback keeps the rest pose; the layout effect invalidates once", () => {
    render(<SwayingInstancedPart name="x" part={PART} instances={INSTANCES} shadows={false} sway={null} now={now} />);
    expect(invalidate).toHaveBeenCalledTimes(1);
    frames[frames.length - 1]();
    expect(created.mesh).not.toBeNull();
    expect(atRest(created.mesh!)).toBe(true);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("W3: switching sway off restores the rest pose", () => {
    const view = render(<SwayingInstancedPart name="x" part={PART} instances={INSTANCES} shadows={false} sway={SWAY} now={now} />);
    frames[frames.length - 1]();
    const mesh = created.mesh!;
    expect(atRest(mesh)).toBe(false);
    view.rerender(<SwayingInstancedPart name="x" part={PART} instances={INSTANCES} shadows={false} sway={null} now={now} />);
    expect(atRest(mesh)).toBe(true);
    frames[frames.length - 1]();
    expect(atRest(mesh)).toBe(true);
  });

  it("W4: no interval and no invalidate inside the frame callback (source pins)", () => {
    const source = readFileSync(join(__dirname, "SwayingInstancedPart.tsx"), "utf8");
    expect(source).not.toMatch(/setInterval/);
    const start = source.indexOf("useFrame(() => {");
    expect(start).toBeGreaterThanOrEqual(0);
    const body = source.slice(start, source.indexOf("\n  });\n", start));
    expect(body).not.toMatch(/invalidate/);
  });
});

describe("SwayingInstancedPart tap shake (MFW-60)", () => {
  const OWNERS: FoliageOwnerRef[] = [
    { kind: "bush", index: 0 },
    { kind: "bush", index: 1 },
  ];
  let NOW = 5_000;
  const source = (): NudgeSource => ({ pool: createObjectPoolManager(EFFECT_POOL_CAPS.HIGH).nudge, now: () => NOW });

  it("SW1: with sway null it writes while shaking plus one tail frame, then nothing", () => {
    const nudges = source();
    render(<SwayingInstancedPart name="x" part={PART} instances={INSTANCES} shadows={false} sway={null} now={now} shakeOwners={OWNERS} nudges={nudges} />);
    const frame = frames[frames.length - 1];
    const mesh = created.mesh!;
    const v0 = mesh.instanceMatrix.version;
    frame();
    expect(mesh.instanceMatrix.version).toBe(v0); // idle: nothing written
    startNudge(nudges.pool, "bush", 1, NOW);
    NOW += TAP_SHAKE_LOOKS.bush.periodMs / 4;
    frame();
    expect(atRest(mesh)).toBe(false);
    NOW += TAP_SHAKE_LOOKS.bush.durationMs;
    releaseExpiredNudges(nudges.pool, NOW, false);
    const v1 = mesh.instanceMatrix.version;
    frame(); // the tail frame restores the rest pose
    expect(mesh.instanceMatrix.version).toBeGreaterThan(v1);
    expect(atRest(mesh)).toBe(true);
    const v2 = mesh.instanceMatrix.version;
    frame();
    frame();
    expect(mesh.instanceMatrix.version).toBe(v2);
  });

  it("SW2: shaking never calls invalidate (SceneEffects keeps the loop alive)", () => {
    const nudges = source();
    render(<SwayingInstancedPart name="x" part={PART} instances={INSTANCES} shadows={false} sway={SWAY} now={now} shakeOwners={OWNERS} nudges={nudges} />);
    const calls = invalidate.mock.calls.length;
    startNudge(nudges.pool, "bush", 0, NOW);
    for (let i = 0; i < 5; i++) {
      NOW += 100;
      frames[frames.length - 1]();
    }
    expect(invalidate.mock.calls.length).toBe(calls);
  });
});
