import { cleanup, render } from "@testing-library/react";
import { createRef, type RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrthographicCamera, type Vector3 } from "three";
import { DEFAULT_KRATHONG_APPEARANCE } from "@/core/customization";
import { getLoyKrathongRiverLanes } from "@/core/world";
import { RIVER_DRIFT_SPEED_FACTOR } from "@/config/riverFlow.config";
import { StretchVisibilityContext } from "./stretchVisibility";
import { WishBubbleAnchor } from "./WishBubbleAnchor";

type FrameState = { camera: unknown; size: { left: number; top: number; width: number; height: number } };
const frames = vi.hoisted(() => [] as ((state: unknown) => void)[]);
vi.mock("@react-three/fiber", () => ({
  useFrame: (cb: (state: unknown) => void) => {
    frames.push(cb);
  },
}));

const SIZE = { left: 0, top: 0, width: 400, height: 400 };
const world = { x: 0, y: 0, z: 0 };

/** The R3F group is a plain DOM element in jsdom: give it the three methods the projection uses. */
const proto = HTMLUnknownElement.prototype as unknown as Record<string, unknown>;
beforeEach(() => {
  frames.length = 0;
  world.x = 0;
  Object.defineProperty(proto, "position", { configurable: true, value: { set() {} } });
  Object.defineProperty(proto, "updateWorldMatrix", { configurable: true, value: () => {} });
  Object.defineProperty(proto, "getWorldPosition", {
    configurable: true,
    value(target: Vector3) {
      target.set(world.x, world.y, world.z);
      return target;
    },
  });
});
afterEach(() => {
  cleanup();
  delete proto.position;
  delete proto.updateWorldMatrix;
  delete proto.getWorldPosition;
});

const item = {
  id: "a",
  coord: { mode: "SPLINE_PATH" as const, laneId: 1, spawnProgress: 0.2, speedFactor: RIVER_DRIFT_SPEED_FACTOR, lateralOffset: 0 },
  createdAtMs: 1_700_000_000_000,
  appearance: DEFAULT_KRATHONG_APPEARANCE,
  publicWishText: "x",
};
const camera = () => {
  const c = new OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
  c.position.set(0, 0, 50);
  c.lookAt(0, 0, 0);
  return c;
};

function setup(visible = true) {
  const el = document.createElement("div");
  el.style.visibility = "hidden";
  const bubbleRef = { current: el } as RefObject<HTMLDivElement | null>;
  const now = () => 1_700_000_100_000;
  const ui = (
    <StretchVisibilityContext.Provider value={{ visible }}>
      <WishBubbleAnchor item={item} lanes={getLoyKrathongRiverLanes()} now={now} bubbleRef={bubbleRef} />
    </StretchVisibilityContext.Provider>
  );
  render(ui);
  const state: FrameState = { camera: camera(), size: SIZE };
  return { el, run: () => frames.forEach((f) => f(state)) };
}

describe("WishBubbleAnchor (MFW-80)", () => {
  it("A1: one useFrame; a frame writes the transform and shows the bubble", () => {
    const { el, run } = setup();
    expect(frames).toHaveLength(1);
    run();
    expect(el.style.transform).toMatch(/^translate3d\(.+px, .+px, 0(px)?\)$/);
    expect(el.style.visibility).toBe("visible");
  });

  it("A2: no transform rewrite without a move", () => {
    const { el, run } = setup();
    run();
    el.style.transform = "translate3d(1px, 2px, 0px)";
    run();
    expect(el.style.transform).toBe("translate3d(1px, 2px, 0px)");
  });

  it("A5: a new bubble element (re-tap) is shown on the first frame even when the krathong has not moved", () => {
    const first = setup();
    first.run();
    cleanup();
    frames.length = 0;
    const el = document.createElement("div");
    el.style.visibility = "hidden";
    const bubbleRef = { current: el } as RefObject<HTMLDivElement | null>;
    // same anchor instance, new element: swap the ref target between frames
    const { rerender } = render(
      <WishBubbleAnchor item={item} lanes={getLoyKrathongRiverLanes()} now={() => 1_700_000_100_000} bubbleRef={bubbleRef} />,
    );
    const state: FrameState = { camera: camera(), size: SIZE };
    frames.forEach((f) => f(state));
    expect(el.style.visibility).toBe("visible");
    const el2 = document.createElement("div");
    el2.style.visibility = "hidden";
    (bubbleRef as { current: HTMLDivElement | null }).current = el2;
    rerender(<WishBubbleAnchor item={item} lanes={getLoyKrathongRiverLanes()} now={() => 1_700_000_100_000} bubbleRef={bubbleRef} />);
    frames.forEach((f) => f(state));
    expect(el2.style.visibility).toBe("visible");
    expect(el2.style.transform).toMatch(/^translate3d/);
  });

  it("A3: an anchor outside the viewport hides the bubble", () => {
    const { el, run } = setup();
    run();
    expect(el.style.visibility).toBe("visible");
    world.x = 1000;
    run();
    expect(el.style.visibility).toBe("hidden");
  });

  it("A4: a culled stretch hides the bubble and writes no transform", () => {
    const { el, run } = setup(false);
    run();
    expect(el.style.visibility).toBe("hidden");
    expect(el.style.transform).toBe("");
  });

  it("renders nothing for an item with no lane", () => {
    const ref = createRef<HTMLDivElement>() as RefObject<HTMLDivElement | null>;
    const { container } = render(
      <WishBubbleAnchor item={{ ...item, coord: { ...item.coord, laneId: 999 } }} lanes={getLoyKrathongRiverLanes()} bubbleRef={ref} />,
    );
    expect(container.querySelector('[name="scene-wish-bubble-anchor"]')).toBeNull();
  });
});
