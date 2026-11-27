import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { createRef, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BufferGeometry, InstancedMesh, Material, Object3D, Vector3 } from "three";
import type { Group, Mesh } from "three";
import { SCENE_OBJECT_NAMES } from "@/components/canvas3d/sceneObjectNames";
import { RIVER_ENVIRONMENT_PARTS } from "@/config/events/loyKrathong.river.config";
import { VILLAGE_LIGHTS } from "@/config/look.config";
import { LAMP_TAP_RADIUS, TAP_PROXY_INRADIUS_RATIO } from "@/config/gimmicks.config";
import { DRAG_START_DISTANCE_PX } from "@/config/interaction.config";
import { useDeviceStore } from "@/store/useDeviceStore";
import { RiverEnvironment } from "./RiverEnvironment";
import { LOY_KRATHONG_RIVER_LAYOUT, lampIndexFromInstanceId, lampTapProxyPlacement } from "./riverLayout";

const useFrameSpy = vi.hoisted(() => vi.fn());
/** Materials created per part material spec (MFW-49: village lights per preset). */
const partMaterials = vi.hoisted(() => new Map<object, import("three").MeshStandardMaterial>());
vi.mock("@/components/canvas3d/geometry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/canvas3d/geometry")>();
  return {
    ...actual,
    createInstancedPartMaterial: (spec: Parameters<typeof actual.createInstancedPartMaterial>[0]) => {
      const m = actual.createInstancedPartMaterial(spec);
      partMaterials.set(spec, m);
      return m;
    },
  };
});
const proxyHit = vi.hoisted(() => ({ value: false }));
// The DOM stub's click cannot carry R3F's `intersections`: this makes the water's deferral to a proxy testable.
vi.mock("@/components/canvas3d/effects/riverHitPick", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/canvas3d/effects/riverHitPick")>();
  return { ...actual, hasTapProxyHit: (i: unknown) => proxyHit.value || actual.hasTapProxyHit(i) };
});

vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: { invalidate: () => void }) => unknown) => selector({ invalidate: () => {} }),
  useFrame: useFrameSpy,
}));

type Props = ComponentProps<typeof RiverEnvironment>;

/** The props React gave a DOM stub element (an absent onClick = no R3F handler, so no raycast target). */
function reactProps(el: Element): Record<string, unknown> {
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
  if (!key) throw new Error("no React props on the element");
  return (el as unknown as Record<string, Record<string, unknown>>)[key];
}
function named(name: string): Object3D {
  const o = new Object3D();
  o.name = name;
  return o;
}
const callClick = (el: Element, event: Record<string, unknown>) => {
  const stopPropagation = vi.fn();
  (reactProps(el).onClick as (e: unknown) => void)({ stopPropagation, ...event });
  return stopPropagation;
};
function makeProps(overrides: Partial<Props> = {}): Props {
  return {
    layout: LOY_KRATHONG_RIVER_LAYOUT,
    shadows: false,
    waterRef: createRef<Mesh>(),
    onWaterSelected: vi.fn(),
    lampFocusRef: createRef<Group>(),
    selectedLampIndex: 0,
    onLampSelected: vi.fn(),
    lightPreset: "NIGHT",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useFrameSpy.mockClear();
});

describe("RiverEnvironment", () => {
  // RE1 (MFW-66): the house is the owner model's shell + roof (two roof colours) + window glasses; no door part any more.
  it("renders every environment part once", () => {
    const { container } = render(<RiverEnvironment {...makeProps()} />);
    const names = [
      "water", "bankLeft", "bankRight", "houseBodies", "houseRoofs", "treeTrunks", "leafClumps",
      "lampPosts", "lampHeads", "pierDeck", "pierPiles", "lampFocus",
      "ground", "houseRoofsGable", "houseWindows", "riversidePlants", "rocks",
    ] as const;
    for (const key of names) {
      expect(container.querySelectorAll(`[name="${SCENE_OBJECT_NAMES[key]}"]`)).toHaveLength(1);
    }
    expect(container.querySelectorAll('[name="scene-house-doors"]')).toHaveLength(0);
    expect(container.querySelectorAll("instancedMesh")).toHaveLength(11);
  });

  it("riverside trees are instanced (backlog 8.2 AC1)", () => {
    const { container } = render(<RiverEnvironment {...makeProps()} />);
    expect(container.querySelectorAll(`instancedMesh[name="${SCENE_OBJECT_NAMES.treeTrunks}"]`)).toHaveLength(1);
    expect(container.querySelectorAll(`instancedMesh[name="${SCENE_OBJECT_NAMES.leafClumps}"]`)).toHaveLength(1);
    expect(container.querySelectorAll('mesh[name^="scene-tree"]')).toHaveLength(0);
    expect(container.querySelectorAll('mesh[name^="scene-leaf"]')).toHaveLength(0);
  });

  it("registers frame work only for the two swaying foliage meshes (MFW-70)", () => {
    render(<RiverEnvironment {...makeProps()} />);
    expect(useFrameSpy).toHaveBeenCalledTimes(2);
  });

  it("renders the same tree with reduced motion on", () => {
    const { container } = render(<RiverEnvironment {...makeProps()} />);
    const before = container.querySelectorAll("*").length;
    useDeviceStore.getState().setReducedMotion(true);
    const second = render(<RiverEnvironment {...makeProps()} />);
    expect(second.container.querySelectorAll("*").length).toBe(before);
    useDeviceStore.getState().setReducedMotion(false);
  });

  it("reports water and lamp taps", () => {
    const props = makeProps();
    const { container } = render(<RiverEnvironment {...props} />);
    fireEvent.click(container.querySelector(`[name="${SCENE_OBJECT_NAMES.water}"]`)!);
    expect(props.onWaterSelected).toHaveBeenCalledTimes(1);
    expect(props.onWaterSelected).toHaveBeenCalledWith(null);
    fireEvent.click(container.querySelector(`[name="${SCENE_OBJECT_NAMES.lampHeads}"]`)!);
    expect(props.onLampSelected).toHaveBeenCalledWith(0);
  });

  // MFW-60 polish: the proxy moved from the head centre to the middle of the whole lamp (post + head), so the post answers too.
  it("renders one invisible tap proxy per lamp over the whole lamp", () => {
    const { container } = render(<RiverEnvironment {...makeProps()} />);
    const proxies = container.querySelectorAll(`[name^="${SCENE_OBJECT_NAMES.lampTapPrefix}"]`);
    expect(proxies).toHaveLength(LOY_KRATHONG_RIVER_LAYOUT.lamps.length);
    proxies.forEach((el, i) => {
      const placement = lampTapProxyPlacement(LOY_KRATHONG_RIVER_LAYOUT.lamps[i], RIVER_ENVIRONMENT_PARTS.lampHead, LAMP_TAP_RADIUS, TAP_PROXY_INRADIUS_RATIO);
      expect(el.getAttribute("position")).toBe(placement.position.join(","));
      expect(el.getAttribute("scale")).toBe([1, placement.scaleY, 1].join(","));
    });
    // React's DOM stub drops visible={false}, so the invisibility is pinned in the source instead.
    expect(readFileSync(join(__dirname, "RiverEnvironment.tsx"), "utf8")).toMatch(/lampTapPrefix[\s\S]{0,200}visible=\{false\}/);
  });

  it("the water defers to a tap proxy under the click (MFW-59)", () => {
    const props = makeProps();
    const { container } = render(<RiverEnvironment {...props} />);
    proxyHit.value = true;
    try {
      fireEvent.click(container.querySelector(`[name="${SCENE_OBJECT_NAMES.water}"]`)!);
    } finally {
      proxyHit.value = false;
    }
    expect(props.onWaterSelected).not.toHaveBeenCalled();
  });

  it("a lamp proxy tap reports its lamp", () => {
    const props = makeProps();
    const { container } = render(<RiverEnvironment {...props} />);
    fireEvent.click(container.querySelector(`[name="${SCENE_OBJECT_NAMES.lampTapPrefix}2"]`)!);
    expect(props.onLampSelected).toHaveBeenCalledWith(2);
  });

  it("lamp proxy covers the whole post and the head (MFW-60 polish)", () => {
    const head = RIVER_ENVIRONMENT_PARTS.lampHead;
    const headRadius = head.geometry.kind === "icosahedron" ? head.geometry.radius : 0;
    for (const lamp of LOY_KRATHONG_RIVER_LAYOUT.lamps) {
      const p = lampTapProxyPlacement(lamp, head, LAMP_TAP_RADIUS, TAP_PROXY_INRADIUS_RATIO);
      const vertical = LAMP_TAP_RADIUS * TAP_PROXY_INRADIUS_RATIO * p.scaleY;
      const base = lamp.position.y;
      const top = lamp.position.y + (head.yOffset + headRadius) * lamp.scale;
      expect(p.position[1] - vertical).toBeLessThanOrEqual(base + 1e-9);
      expect(p.position[1] + vertical).toBeGreaterThanOrEqual(top - 1e-9);
      expect(p.position[0]).toBe(lamp.position.x);
      expect(p.position[2]).toBe(lamp.position.z);
    }
    const tall = lampTapProxyPlacement(LOY_KRATHONG_RIVER_LAYOUT.lamps[0], { ...head, yOffset: 5 }, LAMP_TAP_RADIUS, TAP_PROXY_INRADIUS_RATIO);
    expect(tall.scaleY).toBeGreaterThan(1); // a taller lamp stretches the proxy instead of leaving the post uncovered
  });

  it("lamp proxy encloses the lamp head", () => {
    const geometry = RIVER_ENVIRONMENT_PARTS.lampHead.geometry;
    if (geometry.kind !== "icosahedron") throw new Error("lamp head is expected to be an icosahedron");
    const maxScale = Math.max(...LOY_KRATHONG_RIVER_LAYOUT.lamps.map((l) => l.scale));
    expect(LAMP_TAP_RADIUS * TAP_PROXY_INRADIUS_RATIO).toBeGreaterThanOrEqual(geometry.radius * maxScale);
  });

  it("maps instance ids to lamp indices", () => {
    expect(lampIndexFromInstanceId(2, 6)).toBe(2);
    expect(lampIndexFromInstanceId(undefined, 6)).toBe(0);
    expect(lampIndexFromInstanceId(6, 6)).toBe(0);
    expect(lampIndexFromInstanceId(-1, 6)).toBe(0);
    expect(lampIndexFromInstanceId(1.5, 6)).toBe(0);
  });

  it("anchors the lamp focus on the selected lamp head", () => {
    const view = render(<RiverEnvironment {...makeProps()} />);
    const focus = () => view.container.querySelector(`[name="${SCENE_OBJECT_NAMES.lampFocus}"]`)!;
    const expected = (i: number) => {
      const l = LOY_KRATHONG_RIVER_LAYOUT.lamps[i];
      return [l.position.x, l.position.y + RIVER_ENVIRONMENT_PARTS.lampHead.yOffset * l.scale, l.position.z].join(",");
    };
    view.rerender(<RiverEnvironment {...makeProps({ selectedLampIndex: 2 })} />);
    expect(focus().getAttribute("position")).toBe(expected(2));
    view.rerender(<RiverEnvironment {...makeProps({ selectedLampIndex: 99 })} />);
    expect(focus().getAttribute("position")).toBe(expected(0));
  });

  it("disposes on unmount only", () => {
    const geometryDispose = vi.spyOn(BufferGeometry.prototype, "dispose");
    const materialDispose = vi.spyOn(Material.prototype, "dispose");
    const props = makeProps();
    const view = render(<RiverEnvironment {...props} />);
    view.rerender(<RiverEnvironment {...props} />);
    view.rerender(<RiverEnvironment {...props} shadows />);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    view.unmount();
    // water + 2 banks + ground ring (MFW-49), 11 instanced parts (MFW-49; MFW-66 removed the door part), +1: the shared lamp
    // tap-proxy geometry (MFW-59). The ground's material is an R3F JSX element, disposed by R3F itself.
    expect(geometryDispose).toHaveBeenCalledTimes(4 + 11 + 1);
    expect(materialDispose).toHaveBeenCalledTimes(11 + 1); // +1: the proxy material
  });

  it("village windows and lanterns are lit at NIGHT and off at DAY, without re-creating materials (MFW-49 AC3)", () => {
    partMaterials.clear();
    const view = render(<RiverEnvironment {...makeProps({ lightPreset: "DAY" })} />);
    const windows = partMaterials.get(RIVER_ENVIRONMENT_PARTS.houseWindow.material)!;
    const lanterns = partMaterials.get(RIVER_ENVIRONMENT_PARTS.lampHead.material)!;
    expect(windows.emissiveIntensity).toBe(0);
    expect(lanterns.emissiveIntensity).toBe(0);
    const materialDispose = vi.spyOn(Material.prototype, "dispose");
    view.rerender(<RiverEnvironment {...makeProps({ lightPreset: "NIGHT" })} />);
    expect(partMaterials.get(RIVER_ENVIRONMENT_PARTS.houseWindow.material)).toBe(windows);
    expect(windows.emissiveIntensity).toBe(VILLAGE_LIGHTS.NIGHT.windowEmissiveIntensity);
    expect(lanterns.emissiveIntensity).toBe(VILLAGE_LIGHTS.NIGHT.lanternEmissiveIntensity);
    view.rerender(<RiverEnvironment {...makeProps({ lightPreset: "DAY" })} />);
    expect(windows.emissiveIntensity).toBe(VILLAGE_LIGHTS.DAY.windowEmissiveIntensity);
    expect(materialDispose).not.toHaveBeenCalled();
  });

  // MFW-60 changed "takes no taps": the ground takes the "sky" tap, but ONLY when onPropTapped is set (WORLD_EXPLORE); see RE4.
  it("the ground disc lies under everything, takes no taps without onPropTapped and is drawn last (MFW-49)", () => {
    const { container } = render(<RiverEnvironment {...makeProps()} />);
    const ground = container.querySelector(`[name="${SCENE_OBJECT_NAMES.ground}"]`)!;
    expect(ground.getAttribute("position")).toBe([0, LOY_KRATHONG_RIVER_LAYOUT.ground.y, 0].join(","));
    expect(Number(ground.getAttribute("renderOrder"))).toBeGreaterThan(0);
    expect(reactProps(ground).onClick).toBeUndefined();
  });

  describe("MFW-60 land and pier taps", () => {
    const land = [SCENE_OBJECT_NAMES.ground, SCENE_OBJECT_NAMES.bankLeft, SCENE_OBJECT_NAMES.bankRight];

    it("RE1: a ground or bank tap → onPropTapped('sky', 0, point)", () => {
      const onPropTapped = vi.fn();
      const { container } = render(<RiverEnvironment {...makeProps({ onPropTapped })} />);
      for (const name of land) {
        const stop = callClick(container.querySelector(`[name="${name}"]`)!, { delta: 0, intersections: [{ object: named(name) }] });
        expect(stop).toHaveBeenCalledTimes(1);
      }
      expect(onPropTapped).toHaveBeenCalledTimes(land.length);
      for (const call of onPropTapped.mock.calls) expect(call.slice(0, 2)).toEqual(["sky", 0]);
      const group = new Object3D();
      const hit = named(SCENE_OBJECT_NAMES.bankLeft);
      group.add(hit);
      callClick(container.querySelector(`[name="${SCENE_OBJECT_NAMES.bankLeft}"]`)!, { delta: 0, point: new Vector3(1.5, -0.1, -2), object: hit });
      expect(onPropTapped).toHaveBeenLastCalledWith("sky", 0, { x: 1.5, z: -2 });
      fireEvent.click(container.querySelector(`[name="${SCENE_OBJECT_NAMES.ground}"]`)!); // the DOM stub click: point unknown
      expect(onPropTapped).toHaveBeenLastCalledWith("sky", 0, null);
    });

    it("RE2: a drag, or a tap proxy further along the ray, fires nothing", () => {
      const onPropTapped = vi.fn();
      const { container } = render(<RiverEnvironment {...makeProps({ onPropTapped })} />);
      const ground = container.querySelector(`[name="${SCENE_OBJECT_NAMES.ground}"]`)!;
      expect(callClick(ground, { delta: DRAG_START_DISTANCE_PX + 1 })).not.toHaveBeenCalled();
      for (const proxy of [`${SCENE_OBJECT_NAMES.propTapPrefix}house-0`, `${SCENE_OBJECT_NAMES.lampTapPrefix}0`, `${SCENE_OBJECT_NAMES.riverHitPrefix}x`]) {
        expect(callClick(ground, { delta: 0, intersections: [{ object: named(SCENE_OBJECT_NAMES.ground) }, { object: named(proxy) }] })).not.toHaveBeenCalled();
      }
      expect(onPropTapped).not.toHaveBeenCalled();
    });

    it("RE3: a pier deck or pile tap → ('pier', 0, null); a krathong / lamp proxy wins", () => {
      const onPropTapped = vi.fn();
      const { container } = render(<RiverEnvironment {...makeProps({ onPropTapped })} />);
      fireEvent.click(container.querySelector(`[name="${SCENE_OBJECT_NAMES.pierDeck}"]`)!);
      fireEvent.click(container.querySelector(`[name="${SCENE_OBJECT_NAMES.pierPiles}"]`)!);
      expect(onPropTapped.mock.calls).toEqual([["pier", 0, null], ["pier", 0, null]]);
      const deck = container.querySelector(`[name="${SCENE_OBJECT_NAMES.pierDeck}"]`)!;
      expect(callClick(deck, { delta: 0, intersections: [{ object: named(`${SCENE_OBJECT_NAMES.riverHitPrefix}a`) }] })).not.toHaveBeenCalled();
      expect(callClick(deck, { delta: DRAG_START_DISTANCE_PX + 1 })).not.toHaveBeenCalled();
      expect(onPropTapped).toHaveBeenCalledTimes(2);
    });

    it("RE4: without onPropTapped there are no handlers on ground, banks or pier, and useFrame is still called twice", () => {
      const { container } = render(<RiverEnvironment {...makeProps()} />);
      for (const name of [...land, SCENE_OBJECT_NAMES.pierDeck, SCENE_OBJECT_NAMES.pierPiles]) {
        expect(reactProps(container.querySelector(`[name="${name}"]`)!).onClick, name).toBeUndefined();
      }
      expect(useFrameSpy).toHaveBeenCalledTimes(2);
      useFrameSpy.mockClear();
      render(<RiverEnvironment {...makeProps({ onPropTapped: vi.fn() })} />);
      expect(useFrameSpy).toHaveBeenCalledTimes(2);
    });

    it("RE5: rockMeshRef and pierDeckRef receive the meshes", () => {
      const rockMeshRef = createRef<InstancedMesh>();
      const pierDeckRef = createRef<Mesh>();
      const { container } = render(<RiverEnvironment {...makeProps({ rockMeshRef, pierDeckRef })} />);
      expect(rockMeshRef.current).toBe(container.querySelector(`[name="${SCENE_OBJECT_NAMES.rocks}"]`));
      expect(pierDeckRef.current).toBe(container.querySelector(`[name="${SCENE_OBJECT_NAMES.pierDeck}"]`));
    });
  });
});
