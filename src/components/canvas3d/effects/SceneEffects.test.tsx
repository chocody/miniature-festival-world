import { createRef } from "react";
import { cleanup, render } from "@testing-library/react";
import { BufferGeometry, InstancedMesh, Material } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RIVER_ENVIRONMENT_PARTS } from "@/config/events/loyKrathong.river.config";
import { LAMP_GLOW_LOOK, RIPPLE_LOOK } from "@/config/gimmicks.config";
import { LOY_KRATHONG_RIVER_LAYOUT } from "@/components/models/loyKrathong";
import { SceneEffects, type SceneEffectsHandle } from "./SceneEffects";

const r3f = vi.hoisted(() => ({ frame: null as null | (() => void), invalidate: vi.fn() }));
const spies = vi.hoisted(() => ({ ripple: vi.fn(), glow: vi.fn() }));

vi.mock("@react-three/fiber", () => ({
  useFrame: (cb: () => void) => {
    r3f.frame = cb;
  },
  useThree: (sel: (s: { invalidate: () => void }) => unknown) => sel({ invalidate: r3f.invalidate }),
}));

vi.mock("./effectMeshes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./effectMeshes")>();
  return {
    ...actual,
    createRippleMesh: (...args: Parameters<typeof actual.createRippleMesh>) => {
      spies.ripple();
      return actual.createRippleMesh(...args);
    },
    createLampGlowMesh: (...args: Parameters<typeof actual.createLampGlowMesh>) => {
      spies.glow();
      return actual.createLampGlowMesh(...args);
    },
  };
});

let NOW = 1_000_000;
const lamps = LOY_KRATHONG_RIVER_LAYOUT.lamps;
const CAPS = { ripple: 3, glow: 2 } as const;
const ui = (ref: React.Ref<SceneEffectsHandle>, caps: { ripple: number; glow: number } = CAPS) => (
  <SceneEffects
    handleRef={ref}
    caps={caps}
    reducedMotion={false}
    waterSurfaceY={LOY_KRATHONG_RIVER_LAYOUT.waterSurfaceY}
    lamps={lamps}
    lampHead={RIVER_ENVIRONMENT_PARTS.lampHead}
    now={() => NOW}
  />
);

beforeEach(() => {
  NOW = 1_000_000;
  r3f.frame = null;
  r3f.invalidate.mockClear();
  spies.ripple.mockClear();
  spies.glow.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SceneEffects", () => {
  it("caps ripples and creates the mesh once", () => {
    const ref = createRef<SceneEffectsHandle>();
    render(ui(ref));
    r3f.invalidate.mockClear();
    for (let i = 0; i < 10; i++) ref.current!.spawnRipple({ x: 0, z: 0 });
    expect(ref.current!.activeCount("ripple")).toBe(3);
    expect(r3f.invalidate).toHaveBeenCalledTimes(10);
    expect(spies.ripple).toHaveBeenCalledTimes(1);
    ref.current!.spawnRipple({ x: Number.NaN, z: 0 });
    expect(ref.current!.activeCount("ripple")).toBe(3);
    expect(r3f.invalidate).toHaveBeenCalledTimes(10);
  });

  it("lights lamps, restarts a lit lamp and ignores bad indices", () => {
    const ref = createRef<SceneEffectsHandle>();
    render(ui(ref));
    ref.current!.lightLamp(1);
    ref.current!.lightLamp(1);
    expect(ref.current!.activeCount("glow")).toBe(1);
    ref.current!.lightLamp(0);
    expect(ref.current!.activeCount("glow")).toBe(2);
    ref.current!.lightLamp(lamps.length - 1);
    expect(ref.current!.activeCount("glow")).toBe(2);
    r3f.invalidate.mockClear();
    for (const bad of [-1, 1.5, lamps.length]) ref.current!.lightLamp(bad);
    expect(ref.current!.activeCount("glow")).toBe(2);
    expect(r3f.invalidate).not.toHaveBeenCalled();
  });

  it("draws while effects run and stops the loop when idle", () => {
    const ref = createRef<SceneEffectsHandle>();
    render(ui(ref));
    const set = vi.spyOn(InstancedMesh.prototype, "setMatrixAt");
    ref.current!.spawnRipple({ x: 1, z: 1 });
    ref.current!.lightLamp(0);
    r3f.invalidate.mockClear();
    r3f.frame!();
    expect(set).toHaveBeenCalled();
    expect(r3f.invalidate).toHaveBeenCalled();
    NOW += Math.max(RIPPLE_LOOK.durationMs, LAMP_GLOW_LOOK.durationMs) + 1;
    r3f.frame!();
    expect(ref.current!.activeCount("ripple")).toBe(0);
    expect(ref.current!.activeCount("glow")).toBe(0);
    r3f.invalidate.mockClear();
    r3f.frame!();
    expect(r3f.invalidate).not.toHaveBeenCalled();
  });

  it("creates and disposes meshes per cap, not per render", () => {
    const ref = createRef<SceneEffectsHandle>();
    const view = render(ui(ref));
    const g = vi.spyOn(BufferGeometry.prototype, "dispose");
    const m = vi.spyOn(Material.prototype, "dispose");
    const i = vi.spyOn(InstancedMesh.prototype, "dispose");
    view.rerender(ui(ref));
    expect(g).not.toHaveBeenCalled();
    expect(spies.ripple).toHaveBeenCalledTimes(1);
    view.rerender(ui(ref, { ripple: 2, glow: 2 }));
    expect(spies.ripple).toHaveBeenCalledTimes(2);
    expect(spies.glow).toHaveBeenCalledTimes(1);
    expect(g).toHaveBeenCalledTimes(1);
    expect(m).toHaveBeenCalledTimes(1);
    expect(i).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(g).toHaveBeenCalledTimes(3);
    expect(m).toHaveBeenCalledTimes(3);
    expect(i).toHaveBeenCalledTimes(3);
  });

  it("renders exactly two primitives", () => {
    const { container } = render(ui(createRef<SceneEffectsHandle>()));
    expect(container.querySelectorAll("primitive")).toHaveLength(2);
  });
});
