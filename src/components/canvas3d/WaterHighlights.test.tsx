import { act, cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Material, Matrix4, Vector3, type BufferGeometry, type InstancedMesh } from "three";
import { LOY_KRATHONG_RIVER_LAYOUT as layout } from "@/components/models/loyKrathong/riverLayout";
import { RIVER_WATER_HIGHLIGHTS } from "@/config/events/loyKrathong.river.config";
import { LAMP_LIGHT_POOL_LOOK } from "@/config/look.config";
import { WATER_EFFECT_TIERS } from "@/config/performance.config";
import { useDeviceStore } from "@/store/useDeviceStore";
import { NO_RAYCAST } from "./blobShadowMeshes";
import { SCENE_OBJECT_NAMES } from "./sceneObjectNames";
import { KrathongRipples, LampLightPools, ShoreHighlights, WaterGlints, type KrathongRipplesHandle } from "./WaterHighlights";

const created = vi.hoisted(() => ({
  meshes: [] as InstancedMesh[],
  geometries: [] as BufferGeometry[],
  materials: [] as Material[],
}));
const r3f = vi.hoisted(() => ({ frames: [] as (() => void)[] }));

vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: { invalidate: () => void }) => unknown) => selector({ invalidate: () => {} }),
  useFrame: (cb: () => void) => {
    r3f.frames.push(cb);
  },
}));

vi.mock("./blobShadowMeshes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./blobShadowMeshes")>();
  const track = <T,>(list: T[], value: T) => {
    list.push(value);
    return value;
  };
  return {
    ...actual,
    createBlobShadowGeometry: (...a: Parameters<typeof actual.createBlobShadowGeometry>) =>
      track(created.geometries, actual.createBlobShadowGeometry(...a)),
    createVertexAlphaGeometry: (...a: Parameters<typeof actual.createVertexAlphaGeometry>) =>
      track(created.geometries, actual.createVertexAlphaGeometry(...a)),
    createFanMaterial: (...a: Parameters<typeof actual.createFanMaterial>) => track(created.materials, actual.createFanMaterial(...a)),
    createBlobShadowInstances: (...a: Parameters<typeof actual.createBlobShadowInstances>) =>
      track(created.meshes, actual.createBlobShadowInstances(...a)),
  };
});

const mesh = (name: string) => [...created.meshes].reverse().find((m) => m.name === name);
const lastFrame = () => r3f.frames.at(-1)!;
let NOW = 1_700_000_000_000;
const now = () => NOW;

beforeEach(() => {
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
  created.meshes.length = 0;
  created.geometries.length = 0;
  created.materials.length = 0;
  r3f.frames.length = 0;
  NOW = 1_700_000_000_000;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("WaterGlints (AC4)", () => {
  it.each(["HIGH", "MEDIUM"] as const)("%s: one instanced glint mesh with the tier count", (tier) => {
    useDeviceStore.getState().setQualityTier(tier);
    const { container } = render(<WaterGlints layout={layout} now={now} />);
    expect(container.querySelectorAll(`[name="${SCENE_OBJECT_NAMES.waterGlints}"]`)).toHaveLength(1);
    expect(mesh(SCENE_OBJECT_NAMES.waterGlints)!.count).toBe(WATER_EFFECT_TIERS[tier].glintCount);
  });

  it("LOW (the cheap variant): no glints, but the static shore highlights", () => {
    useDeviceStore.getState().setQualityTier("LOW");
    const { container } = render(
      <>
        <ShoreHighlights layout={layout} />
        <WaterGlints layout={layout} now={now} />
      </>,
    );
    expect(container.querySelector(`[name="${SCENE_OBJECT_NAMES.waterGlints}"]`)).toBeNull();
    expect(container.querySelectorAll(`[name="${SCENE_OBJECT_NAMES.shoreHighlights}"]`)).toHaveLength(1);
    expect(mesh(SCENE_OBJECT_NAMES.shoreHighlights)!.count).toBe(1);
  });

  it("reduced motion: static (a frame writes nothing)", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    useDeviceStore.getState().setReducedMotion(true);
    render(<WaterGlints layout={layout} now={now} />);
    const m = mesh(SCENE_OBJECT_NAMES.waterGlints)!;
    const version = m.instanceMatrix.version;
    NOW += 5_000;
    lastFrame()();
    expect(m.instanceMatrix.version).toBe(version);
  });

  it("motion on: every frame moves the glints", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    render(<WaterGlints layout={layout} now={now} />);
    const m = mesh(SCENE_OBJECT_NAMES.waterGlints)!;
    const version = m.instanceMatrix.version;
    lastFrame()();
    expect(m.instanceMatrix.version).toBeGreaterThan(version);
    const a = new Matrix4();
    m.getMatrixAt(0, a);
    NOW += 1_500;
    lastFrame()();
    const b = new Matrix4();
    m.getMatrixAt(0, b);
    expect(a.equals(b)).toBe(false);
    const p = new Vector3().setFromMatrixPosition(b);
    expect(p.y).toBeCloseTo(layout.waterSurfaceY + RIVER_WATER_HIGHLIGHTS.liftY, 6);
  });

  it("a tier change disposes the glint geometry", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    render(<WaterGlints layout={layout} now={now} />);
    const geometry = created.geometries.at(-1)!;
    const spy = vi.spyOn(geometry, "dispose");
    act(() => useDeviceStore.getState().setQualityTier("MEDIUM"));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("LampLightPools (AC3)", () => {
  it("DAY: nothing; NIGHT: one instance per lamp", () => {
    const day = render(<LampLightPools layout={layout} lightPreset="DAY" />);
    expect(day.container.querySelector(`[name="${SCENE_OBJECT_NAMES.lampLightPools}"]`)).toBeNull();
    day.unmount();
    const night = render(<LampLightPools layout={layout} lightPreset="NIGHT" />);
    expect(night.container.querySelectorAll(`[name="${SCENE_OBJECT_NAMES.lampLightPools}"]`)).toHaveLength(1);
    const m = mesh(SCENE_OBJECT_NAMES.lampLightPools)!;
    expect(m.count).toBe(layout.lamps.length);
    const at = new Matrix4();
    m.getMatrixAt(1, at);
    const p = new Vector3().setFromMatrixPosition(at);
    const s = new Vector3().setFromMatrixScale(at);
    expect(p.x).toBeCloseTo(layout.lamps[1].position.x, 6);
    expect(p.y).toBeCloseTo(layout.lamps[1].position.y + LAMP_LIGHT_POOL_LOOK.liftY, 6);
    expect(s.x).toBeCloseTo(LAMP_LIGHT_POOL_LOOK.radius * layout.lamps[1].scale, 6);
  });

  it("switching DAY → NIGHT → DAY creates and disposes nothing", () => {
    const view = render(<LampLightPools layout={layout} lightPreset="DAY" />);
    const meshes = created.meshes.length;
    const materialDispose = vi.spyOn(Material.prototype, "dispose");
    view.rerender(<LampLightPools layout={layout} lightPreset="NIGHT" />);
    view.rerender(<LampLightPools layout={layout} lightPreset="DAY" />);
    expect(materialDispose).not.toHaveBeenCalled();
    expect(created.meshes.length).toBe(meshes);
  });
});

describe("KrathongRipples handle", () => {
  it("writes, hides and commits rings on the water", () => {
    const ref = createRef<KrathongRipplesHandle>();
    render(<KrathongRipples ref={ref} capacity={4} surfaceY={-0.24} />);
    ref.current!.writeAt(0, 1, 2, 0.5);
    ref.current!.hideAt(1);
    ref.current!.commit(2);
    const m = mesh(SCENE_OBJECT_NAMES.krathongRipples)!;
    expect(m.count).toBe(2);
    const a = new Matrix4();
    m.getMatrixAt(0, a);
    expect(new Vector3().setFromMatrixPosition(a).toArray()).toEqual(
      [1, -0.24 + RIVER_WATER_HIGHLIGHTS.liftY, 2].map((n) => expect.closeTo(n, 6)),
    );
    expect(new Vector3().setFromMatrixScale(a).x).toBeCloseTo(0.5, 6);
    m.getMatrixAt(1, a);
    expect(new Vector3().setFromMatrixScale(a).x).toBe(0);
  });
});

describe("disposal and taps", () => {
  const all = () => (
    <>
      <ShoreHighlights layout={layout} />
      <WaterGlints layout={layout} now={now} />
      <LampLightPools layout={layout} lightPreset="NIGHT" />
      <KrathongRipples capacity={4} surfaceY={-0.24} />
    </>
  );

  it("unmount disposes every geometry and material", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const view = render(all());
    expect(created.geometries).toHaveLength(4);
    expect(created.materials).toHaveLength(4);
    const spies = [...created.geometries, ...created.materials].map((o) => vi.spyOn(o, "dispose"));
    view.unmount();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });

  it("no mesh takes taps", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    render(all());
    expect(created.meshes).toHaveLength(4);
    for (const m of created.meshes) {
      expect(m.raycast).toBe(NO_RAYCAST);
      expect(m.castShadow).toBe(false);
      expect(m.receiveShadow).toBe(false);
      expect(m.frustumCulled).toBe(false);
    }
  });
});
