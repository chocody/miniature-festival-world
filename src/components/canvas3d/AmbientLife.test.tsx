import { act, cleanup, render } from "@testing-library/react";
import { createRef, type RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BufferGeometry, InstancedMesh, Material, MeshBasicMaterial, type MeshStandardMaterial } from "three";
import { LOY_KRATHONG_RIVER_LAYOUT as layout } from "@/components/models/loyKrathong/riverLayout";
import { LANTERN_FLICKER } from "@/config/events/loyKrathong.life.config";
import { RIVER_ENVIRONMENT_PARTS } from "@/config/events/loyKrathong.river.config";
import { AMBIENT_MOTE_LOOK, VILLAGE_LIGHTS } from "@/config/look.config";
import { LIVING_WORLD_TIERS } from "@/config/performance.config";
import { lanternFlickerFactor } from "@/core/world";
import { useDeviceStore } from "@/store/useDeviceStore";
import { AmbientLife, AmbientMotes, AmbientTicker, LanternFlicker } from "./AmbientLife";
import { NO_RAYCAST } from "./blobShadowMeshes";
import { createInstancedPartGeometry, createInstancedPartMaterial } from "./geometry";
import { SCENE_OBJECT_NAMES } from "./sceneObjectNames";

const r3f = vi.hoisted(() => ({ frames: [] as (() => void)[], invalidate: vi.fn() }));
vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: { invalidate: () => void }) => unknown) => selector({ invalidate: r3f.invalidate }),
  useFrame: (cb: () => void) => {
    r3f.frames.push(cb);
  },
}));

const created = vi.hoisted(() => ({ motes: [] as import("three").InstancedMesh[], materials: [] as import("three").MeshBasicMaterial[] }));
vi.mock("./ambientMeshes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ambientMeshes")>();
  return {
    ...actual,
    createMoteInstances: (...a: Parameters<typeof actual.createMoteInstances>) => {
      const mesh = actual.createMoteInstances(...a);
      created.motes.push(mesh);
      return mesh;
    },
    createMoteMaterial: (...a: Parameters<typeof actual.createMoteMaterial>) => {
      const m = actual.createMoteMaterial(...a);
      created.materials.push(m);
      return m;
    },
  };
});

const lastFrame = () => r3f.frames.at(-1)!;
let NOW = 1_700_000_000_000;
const now = () => NOW;
const matrices = (mesh: InstancedMesh) => Array.from(mesh.instanceMatrix.array);

function realMesh(part: (typeof RIVER_ENVIRONMENT_PARTS)["lampHead"], count: number): RefObject<InstancedMesh | null> {
  const mesh = new InstancedMesh(createInstancedPartGeometry(part.geometry, part.material.flatShading), createInstancedPartMaterial(part.material), count);
  const ref = createRef<InstancedMesh | null>() as { current: InstancedMesh | null };
  ref.current = mesh;
  return ref;
}
const lampMaterial = (ref: RefObject<InstancedMesh | null>) => ref.current!.material as MeshStandardMaterial;

beforeEach(() => {
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
  r3f.frames.length = 0;
  r3f.invalidate.mockClear();
  created.motes.length = 0;
  created.materials.length = 0;
  NOW = 1_700_000_000_000;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AmbientMotes (MFW-50 AC3)", () => {
  it.each(["HIGH", "MEDIUM", "LOW"] as const)("AL1 %s: mote count from LIVING_WORLD_TIERS (none on LOW)", (tier) => {
    useDeviceStore.getState().setQualityTier(tier);
    const { container } = render(<AmbientMotes layout={layout} now={now} lightPreset="NIGHT" />);
    const expected = LIVING_WORLD_TIERS[tier].moteCount;
    if (expected === 0) {
      expect(created.motes).toHaveLength(0);
      expect(container.querySelector("primitive")).toBeNull();
    } else {
      expect(created.motes.at(-1)!.count).toBe(expected);
      expect(container.querySelectorAll("primitive")).toHaveLength(1);
    }
  });

  it("AL2 DAY → NIGHT → DAY recolours the same material and disposes nothing", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const dispose = vi.spyOn(Material.prototype, "dispose");
    const view = render(<AmbientMotes layout={layout} now={now} lightPreset="DAY" />);
    const material = created.materials.at(-1)!;
    expect(created.motes.at(-1)!.material).toBe(material);
    for (const preset of ["DAY", "NIGHT", "DAY"] as const) {
      view.rerender(<AmbientMotes layout={layout} now={now} lightPreset={preset} />);
      expect(created.materials).toHaveLength(1);
      expect(material.color.getHexString()).toBe(AMBIENT_MOTE_LOOK[preset].color.slice(1).toLowerCase());
      expect(material.opacity).toBe(AMBIENT_MOTE_LOOK[preset].opacity);
    }
    expect(dispose).not.toHaveBeenCalled();
    expect(created.motes).toHaveLength(1);
  });

  it("AL3 motes move per frame, and hang still under reduced motion", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    render(<AmbientMotes layout={layout} now={now} lightPreset="NIGHT" />);
    const mesh = created.motes.at(-1)!;
    const a = matrices(mesh);
    NOW += 1_500;
    lastFrame()();
    expect(matrices(mesh)).not.toEqual(a);
    act(() => useDeviceStore.getState().setReducedMotion(true));
    const version = mesh.instanceMatrix.version;
    const still = matrices(mesh);
    NOW += 1_500;
    lastFrame()();
    expect(mesh.instanceMatrix.version).toBe(version);
    expect(matrices(mesh)).toEqual(still);
  });

  it("AL10 every mote mesh has NO_RAYCAST and no handler", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const { container } = render(
      <AmbientLife layout={layout} now={now} lightPreset="NIGHT" lampHeadMeshRef={realMesh(RIVER_ENVIRONMENT_PARTS.lampHead, layout.lamps.length)} idleRedraw />,
    );
    for (const mesh of created.motes) expect(mesh.raycast).toBe(NO_RAYCAST);
    for (const el of container.querySelectorAll("*")) expect(el.getAttribute("onclick")).toBeNull();
    expect(container.querySelectorAll(`primitive`)).toHaveLength(1);
    expect(created.motes[0].name).toBe(SCENE_OBJECT_NAMES.ambientMotes);
  });
});

describe("LanternFlicker (MFW-50 AC3, AC4)", () => {
  it("AL7 NIGHT HIGH: emissive = base × flicker factor", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const ref = realMesh(RIVER_ENVIRONMENT_PARTS.lampHead, layout.lamps.length);
    render(<LanternFlicker now={now} lightPreset="NIGHT" meshRef={ref} />);
    NOW = 500;
    lastFrame()();
    const base = VILLAGE_LIGHTS.NIGHT.lanternEmissiveIntensity;
    const factor = lanternFlickerFactor(500, true, LANTERN_FLICKER);
    expect(factor).not.toBe(1);
    expect(lampMaterial(ref).emissiveIntensity).toBeCloseTo(base * factor, 12);
  });

  it.each([
    ["DAY", "HIGH", false],
    ["NIGHT", "LOW", false],
    ["NIGHT", "HIGH", true],
  ] as const)("AL8 %s %s reduced=%s: emissive stays exactly the preset base", (preset, tier, reduced) => {
    useDeviceStore.getState().setQualityTier(tier);
    useDeviceStore.getState().setReducedMotion(reduced);
    const ref = realMesh(RIVER_ENVIRONMENT_PARTS.lampHead, layout.lamps.length);
    lampMaterial(ref).emissiveIntensity = 42;
    render(<LanternFlicker now={now} lightPreset={preset} meshRef={ref} />);
    NOW = 500;
    lastFrame()();
    expect(lampMaterial(ref).emissiveIntensity).toBe(VILLAGE_LIGHTS[preset].lanternEmissiveIntensity);
  });
});

describe("AmbientTicker: the living world's idle-redraw cap (MFW-50 D4, fix round)", () => {
  it("AL9 shared world view: one interval per tier; none on LOW or with reduced motion; cleared on unmount", () => {
    vi.useFakeTimers();
    const setSpy = vi.spyOn(window, "setInterval");
    const clearSpy = vi.spyOn(window, "clearInterval");
    useDeviceStore.getState().setQualityTier("HIGH");
    const view = render(<AmbientTicker enabled />);
    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(setSpy.mock.calls[0][1]).toBe(LIVING_WORLD_TIERS.HIGH.idleRedrawIntervalMs);
    r3f.invalidate.mockClear();
    vi.advanceTimersByTime(500);
    expect(r3f.invalidate).toHaveBeenCalledTimes(500 / LIVING_WORLD_TIERS.HIGH.idleRedrawIntervalMs!);
    act(() => useDeviceStore.getState().setQualityTier("MEDIUM"));
    expect(setSpy.mock.calls.at(-1)![1]).toBe(LIVING_WORLD_TIERS.MEDIUM.idleRedrawIntervalMs);
    view.unmount();
    expect(clearSpy).toHaveBeenCalledTimes(2);

    setSpy.mockClear();
    for (const [tier, reduced] of [
      ["LOW", false],
      ["HIGH", true],
    ] as const) {
      useDeviceStore.getState().setQualityTier(tier);
      useDeviceStore.getState().setReducedMotion(reduced);
      render(<AmbientTicker enabled />);
      cleanup();
    }
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("CUSTOMIZE / RITUAL (enabled false): no living-world timer at all, even on HIGH", () => {
    vi.useFakeTimers();
    const setSpy = vi.spyOn(window, "setInterval");
    useDeviceStore.getState().setQualityTier("HIGH");
    const view = render(<AmbientTicker enabled={false} />);
    expect(setSpy).not.toHaveBeenCalled();
    view.rerender(<AmbientTicker enabled />); // entering the shared world view registers
    expect(setSpy).toHaveBeenCalledTimes(1);
  });
});

describe("disposal", () => {
  it("unmount disposes the mote mesh, geometry and material", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const view = render(<AmbientMotes layout={layout} now={now} lightPreset="NIGHT" />);
    const mesh = created.motes.at(-1)!;
    const meshDispose = vi.spyOn(mesh, "dispose");
    const geometryDispose = vi.spyOn(mesh.geometry as BufferGeometry, "dispose");
    const materialDispose = vi.spyOn(mesh.material as MeshBasicMaterial, "dispose");
    view.unmount();
    expect(meshDispose).toHaveBeenCalledTimes(1);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });
});
