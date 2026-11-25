import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { createRef, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BufferGeometry, Material } from "three";
import type { Group, Mesh } from "three";
import { SCENE_OBJECT_NAMES } from "@/components/canvas3d/sceneObjectNames";
import { RIVER_ENVIRONMENT_PARTS } from "@/config/events/loyKrathong.river.config";
import { LAMP_TAP_RADIUS, TAP_PROXY_INRADIUS_RATIO } from "@/config/gimmicks.config";
import { useDeviceStore } from "@/store/useDeviceStore";
import { RiverEnvironment } from "./RiverEnvironment";
import { LOY_KRATHONG_RIVER_LAYOUT, lampHeadPosition, lampIndexFromInstanceId } from "./riverLayout";

const useFrameSpy = vi.hoisted(() => vi.fn());
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
function makeProps(overrides: Partial<Props> = {}): Props {
  return {
    layout: LOY_KRATHONG_RIVER_LAYOUT,
    shadows: false,
    waterRef: createRef<Mesh>(),
    onWaterSelected: vi.fn(),
    lampFocusRef: createRef<Group>(),
    selectedLampIndex: 0,
    onLampSelected: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useFrameSpy.mockClear();
});

describe("RiverEnvironment", () => {
  it("renders every environment part once", () => {
    const { container } = render(<RiverEnvironment {...makeProps()} />);
    const names = [
      "water", "bankLeft", "bankRight", "houseBodies", "houseRoofs", "treeTrunks", "treeCanopies",
      "lampPosts", "lampHeads", "pierDeck", "pierPiles", "lampFocus",
    ] as const;
    for (const key of names) {
      expect(container.querySelectorAll(`[name="${SCENE_OBJECT_NAMES[key]}"]`)).toHaveLength(1);
    }
    expect(container.querySelectorAll("instancedMesh")).toHaveLength(7);
  });

  it("riverside trees are instanced (backlog 8.2 AC1)", () => {
    const { container } = render(<RiverEnvironment {...makeProps()} />);
    expect(container.querySelectorAll(`instancedMesh[name="${SCENE_OBJECT_NAMES.treeTrunks}"]`)).toHaveLength(1);
    expect(container.querySelectorAll(`instancedMesh[name="${SCENE_OBJECT_NAMES.treeCanopies}"]`)).toHaveLength(1);
    expect(container.querySelectorAll('mesh[name^="scene-tree"]')).toHaveLength(0);
  });

  it("is static", () => {
    render(<RiverEnvironment {...makeProps()} />);
    expect(useFrameSpy).not.toHaveBeenCalled();
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

  it("renders one invisible tap proxy per lamp over the head", () => {
    const { container } = render(<RiverEnvironment {...makeProps()} />);
    const proxies = container.querySelectorAll(`[name^="${SCENE_OBJECT_NAMES.lampTapPrefix}"]`);
    expect(proxies).toHaveLength(LOY_KRATHONG_RIVER_LAYOUT.lamps.length);
    proxies.forEach((el, i) => {
      expect(el.getAttribute("position")).toBe(
        lampHeadPosition(LOY_KRATHONG_RIVER_LAYOUT.lamps[i], RIVER_ENVIRONMENT_PARTS.lampHead.yOffset).join(","),
      );
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
    expect(geometryDispose).toHaveBeenCalledTimes(3 + 7 + 1); // +1: the shared lamp tap-proxy geometry (MFW-59)
    expect(materialDispose).toHaveBeenCalledTimes(7 + 1); // +1: its material
  });
});
