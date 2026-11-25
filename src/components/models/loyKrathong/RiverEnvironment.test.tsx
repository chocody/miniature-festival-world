import { cleanup, fireEvent, render } from "@testing-library/react";
import { createRef, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BufferGeometry, Material } from "three";
import type { Group, Mesh } from "three";
import { SCENE_OBJECT_NAMES } from "@/components/canvas3d/sceneObjectNames";
import { RIVER_ENVIRONMENT_PARTS } from "@/config/events/loyKrathong.river.config";
import { useDeviceStore } from "@/store/useDeviceStore";
import { RiverEnvironment } from "./RiverEnvironment";
import { LOY_KRATHONG_RIVER_LAYOUT, lampIndexFromInstanceId } from "./riverLayout";

const useFrameSpy = vi.hoisted(() => vi.fn());
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
    expect(geometryDispose).toHaveBeenCalledTimes(3 + 7);
    expect(materialDispose).toHaveBeenCalledTimes(7);
  });
});
