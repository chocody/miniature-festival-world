import { cleanup, render } from "@testing-library/react";
import { createRef, type RefObject } from "react";
import { BoxGeometry, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RIVER_ENVIRONMENT_PARTS } from "@/config/events/loyKrathong.river.config";
import { REDUCED_MOTION_TAP_CUE, TAP_BOUNCE_LOOKS } from "@/config/gimmicks.config";
import { EFFECT_POOL_CAPS } from "@/config/performance.config";
import { createObjectPoolManager, releaseExpiredNudges, startNudge, type NudgeSource } from "@/core/effects";
import { LOY_KRATHONG_RIVER_LAYOUT } from "@/components/models/loyKrathong/riverLayout";
import { useDeviceStore } from "@/store/useDeviceStore";
import { composeInstanceMatrix } from "../instancing";
import { PropNudges } from "./PropNudges";

const frames = vi.hoisted(() => [] as (() => void)[]);
vi.mock("@react-three/fiber", () => ({
  useFrame: (cb: () => void) => {
    frames.push(cb);
  },
}));

const rocks = LOY_KRATHONG_RIVER_LAYOUT.rocks;
const part = RIVER_ENVIRONMENT_PARTS.rock;
let NOW = 10_000;

function setup(stretchIndex?: number, sharedPool?: NudgeSource["pool"]) {
  const pool = sharedPool ?? createObjectPoolManager(EFFECT_POOL_CAPS.HIGH).nudge;
  const nudges: NudgeSource = { pool, now: () => NOW, stretchIndex };
  const rockMesh = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial(), rocks.length);
  const m = new Matrix4();
  rocks.forEach((r, i) => rockMesh.setMatrixAt(i, composeInstanceMatrix(r, part, m)));
  const rockMeshRef = createRef<InstancedMesh | null>() as RefObject<InstancedMesh | null>;
  rockMeshRef.current = rockMesh;
  const deck = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  const pierDeckRef = createRef<Mesh | null>() as RefObject<Mesh | null>;
  pierDeckRef.current = deck;
  render(<PropNudges nudges={nudges} rockMeshRef={rockMeshRef} rocks={rocks} rockPart={part} pierDeckRef={pierDeckRef} />);
  return { pool, rockMesh, deck, frame: () => frames.at(-1)!() };
}
const scaleOf = (mesh: InstancedMesh, i: number) => {
  const m = new Matrix4();
  mesh.getMatrixAt(i, m);
  return new Vector3().setFromMatrixScale(m).x;
};
const rest = (i: number) => new Vector3().setFromMatrixScale(composeInstanceMatrix(rocks[i], part, new Matrix4())).x;

beforeEach(() => {
  frames.length = 0;
  NOW = 10_000;
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
});
afterEach(() => cleanup());

describe("PropNudges (MFW-60)", () => {
  it("PN1: a rock bounce writes only that rock and restores the rest pose after the duration", () => {
    const { pool, rockMesh, frame } = setup();
    startNudge(pool, "rock", 1, NOW);
    NOW += TAP_BOUNCE_LOOKS.rock.periodMs / 4;
    frame();
    expect(scaleOf(rockMesh, 1)).toBeGreaterThan(rest(1) * 1.01);
    expect(scaleOf(rockMesh, 0)).toBeCloseTo(rest(0), 6);
    NOW += TAP_BOUNCE_LOOKS.rock.durationMs;
    releaseExpiredNudges(pool, NOW, false);
    frame();
    expect(scaleOf(rockMesh, 1)).toBeCloseTo(rest(1), 6);
  });

  it("PN2: the pier deck scales, then returns to 1", () => {
    const { pool, deck, frame } = setup();
    startNudge(pool, "pier", 0, NOW);
    NOW += TAP_BOUNCE_LOOKS.pier.periodMs / 4;
    frame();
    expect(deck.scale.x).toBeGreaterThan(1);
    NOW += TAP_BOUNCE_LOOKS.pier.durationMs;
    releaseExpiredNudges(pool, NOW, false);
    frame();
    expect(deck.scale.x).toBe(1);
  });

  it("PN3: reduced motion gives a steady cue scale", () => {
    useDeviceStore.getState().setReducedMotion(true);
    const { pool, rockMesh, deck, frame } = setup();
    startNudge(pool, "rock", 0, NOW);
    startNudge(pool, "pier", 0, NOW);
    for (const dt of [0, 200, 400]) {
      NOW += dt;
      frame();
      expect(scaleOf(rockMesh, 0)).toBeCloseTo(rest(0) * REDUCED_MOTION_TAP_CUE.scale.rock, 5);
      expect(deck.scale.x).toBeCloseTo(REDUCED_MOTION_TAP_CUE.scale.pier, 9);
    }
  });

  it("PN4: no writes when idle or when only other kinds are nudged", () => {
    const { pool, rockMesh, deck, frame } = setup();
    const version = rockMesh.instanceMatrix.version;
    frame();
    frame();
    expect(rockMesh.instanceMatrix.version).toBe(version);
    startNudge(pool, "tree", 0, NOW);
    frame();
    expect(rockMesh.instanceMatrix.version).toBe(version);
    expect(deck.scale.x).toBe(1);
  });
});

describe("PropNudges per stretch (MFW-58)", () => {
  it("a rock nudge tagged stretch 1 bounces only the reader of stretch 1", () => {
    const a = setup(0);
    const b = setup(1, a.pool);
    startNudge(a.pool, "rock", 1, NOW, 1);
    NOW += TAP_BOUNCE_LOOKS.rock.periodMs / 4;
    frames.forEach((f) => f());
    expect(scaleOf(b.rockMesh, 1)).toBeGreaterThan(rest(1) * 1.01);
    expect(scaleOf(a.rockMesh, 1)).toBeCloseTo(rest(1), 6);
  });
});
