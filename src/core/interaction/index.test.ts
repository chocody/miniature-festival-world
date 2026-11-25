import { describe, expect, it, vi } from "vitest";
import {
  CUSTOMIZE_ROTATE_STEP_RADIANS,
  CUSTOMIZE_ZOOM_STEP_SCALE,
  DRAG_START_DISTANCE_PX,
  PINCH_ZOOM_MAX,
  PINCH_ZOOM_MIN,
  ROTATION_RADIANS_PER_PIXEL,
  TWIST_START_RADIANS,
  WHEEL_LINE_HEIGHT_PX,
  WHEEL_ZOOM_PER_PIXEL,
} from "@/config/interaction.config";
import {
  capturesOnPointerDown,
  createInputSeparator,
  getInteractionMode,
  getRotationAfterDrag,
  getRotationAfterStep,
  getZoomFactorAfterStep,
  getWheelZoomScale,
  isCameraLocked,
  wrapAngleRad,
  type InteractionAction,
} from "./index";

describe("interaction mode routing", () => {
  it.each([
    ["CUSTOMIZE_OBJECT", "CUSTOMIZE"],
    ["WRITE_WISH", null],
    ["RITUAL_RELEASE", "RITUAL_RELEASE"],
    ["SHARED_WORLD_EXPLORE", "WORLD_EXPLORE"],
  ] as const)("maps %s to %s", (flowState, mode) => {
    expect(getInteractionMode(flowState)).toBe(mode);
  });

  it("customize drag rotates the krathong and a two-pointer pinch zooms", () => {
    const actions = vi.fn();
    const input = createInputSeparator("CUSTOMIZE", actions);

    input.pointerDown({ pointerId: 1, x: 10, y: 10, time: 0 });
    input.pointerMove({ pointerId: 1, x: 30, y: 12, time: 40 });
    input.pointerUp({ pointerId: 1, x: 30, y: 12, time: 60 });
    expect(actions).toHaveBeenLastCalledWith({ type: "ROTATE_KRATHONG", deltaX: 20 });

    input.pointerDown({ pointerId: 2, x: 10, y: 10, time: 100 });
    input.pointerDown({ pointerId: 3, x: 30, y: 10, time: 110 });
    input.pointerMove({ pointerId: 3, x: 40, y: 10, time: 120 });
    expect(actions).toHaveBeenLastCalledWith({ type: "PINCH_ZOOM", scale: 1.5 });
  });

  it("locks the camera in ritual mode and releases a dragged krathong over water", () => {
    const actions = vi.fn();
    const input = createInputSeparator("RITUAL_RELEASE", actions);

    expect(isCameraLocked("RITUAL_RELEASE")).toBe(true);
    input.pointerDown({ pointerId: 1, x: 20, y: 20, time: 0, target: "krathong" });
    input.pointerMove({ pointerId: 1, x: 40, y: 35, time: 50 });
    input.pointerUp({ pointerId: 1, x: 40, y: 35, time: 70, target: "water" });

    expect(actions).toHaveBeenNthCalledWith(1, { type: "DRAG_KRATHONG", deltaX: 20, deltaY: 15 });
    expect(actions).toHaveBeenNthCalledWith(2, { type: "RELEASE_KRATHONG" });
  });

  it.each(["water", "lamp", "krathong"] as const)("world explore interacts with a short tap on %s", (target) => {
    const actions = vi.fn();
    const input = createInputSeparator("WORLD_EXPLORE", actions);

    input.pointerDown({ pointerId: 1, x: 0, y: 0, time: 0, target });
    input.pointerUp({ pointerId: 1, x: 0, y: 0, time: 200, target: "water" });
    expect(actions).toHaveBeenLastCalledWith({ type: "TAP_INTERACT", target });
  });

  it("world explore pans on drag", () => {
    const actions = vi.fn();
    const input = createInputSeparator("WORLD_EXPLORE", actions);
    input.pointerDown({ pointerId: 2, x: 0, y: 0, time: 300, target: "water" });
    input.pointerMove({ pointerId: 2, x: 12, y: 8, time: 340, target: "water" });
    input.pointerUp({ pointerId: 2, x: 12, y: 8, time: 360, target: "water" });
    expect(actions).toHaveBeenNthCalledWith(1, { type: "PAN_RIVER", deltaX: 12, deltaY: 8, time: 340 });
    expect(actions).toHaveBeenLastCalledWith({ type: "PAN_END", time: 360 });
  });

  it("does not treat a long press as a world tap", () => {
    const actions = vi.fn();
    const input = createInputSeparator("WORLD_EXPLORE", actions);
    input.pointerDown({ pointerId: 1, x: 0, y: 0, time: 0, target: "water" });
    input.pointerUp({ pointerId: 1, x: 0, y: 0, time: 400, target: "water" });
    expect(actions).not.toHaveBeenCalled();
  });
});

describe("isDragging and capturesOnPointerDown (MFW-59)", () => {
  const sample = (x: number, time = 0) => ({ pointerId: 1, x, y: 0, time, target: "water" as const });
  it("isDragging is false until a move crosses DRAG_START_DISTANCE_PX", () => {
    const input = createInputSeparator("WORLD_EXPLORE", vi.fn());
    expect(input.isDragging(1)).toBe(false);
    input.pointerDown(sample(0));
    expect(input.isDragging(1)).toBe(false);
    input.pointerMove(sample(DRAG_START_DISTANCE_PX - 1, 10));
    expect(input.isDragging(1)).toBe(false);
    input.pointerMove(sample(DRAG_START_DISTANCE_PX, 20));
    expect(input.isDragging(1)).toBe(true);
    expect(input.isDragging(2)).toBe(false);
    input.pointerUp(sample(DRAG_START_DISTANCE_PX, 30));
    expect(input.isDragging(1)).toBe(false);
  });
  it("cancel resets isDragging", () => {
    const input = createInputSeparator("WORLD_EXPLORE", vi.fn());
    input.pointerDown(sample(0));
    input.pointerMove(sample(DRAG_START_DISTANCE_PX + 5, 10));
    expect(input.isDragging(1)).toBe(true);
    input.pointerCancel(1);
    expect(input.isDragging(1)).toBe(false);
  });
  it("capturesOnPointerDown", () => {
    expect(capturesOnPointerDown("WORLD_EXPLORE")).toBe(false);
    expect(capturesOnPointerDown("CUSTOMIZE")).toBe(true);
    expect(capturesOnPointerDown("RITUAL_RELEASE")).toBe(true);
  });
});

describe("customize view steps", () => {
  it("drag yaw uses the per-pixel formula", () => {
    expect(getRotationAfterDrag(0, 20)).toBeCloseTo(20 * ROTATION_RADIANS_PER_PIXEL, 9);
  });

  it("rotate steps add and subtract the step", () => {
    expect(getRotationAfterStep(0, 1)).toBeCloseTo(CUSTOMIZE_ROTATE_STEP_RADIANS, 9);
    expect(getRotationAfterStep(1, -1)).toBeCloseTo(1 - CUSTOMIZE_ROTATE_STEP_RADIANS, 9);
  });

  it("zoom steps multiply and divide by the step scale", () => {
    expect(getZoomFactorAfterStep(1, 1)).toBeCloseTo(CUSTOMIZE_ZOOM_STEP_SCALE, 9);
    expect(getZoomFactorAfterStep(1, -1)).toBeCloseTo(1 / CUSTOMIZE_ZOOM_STEP_SCALE, 9);
  });

  it("zoom steps clamp like pinch", () => {
    let zoomIn = 1;
    let zoomOut = 1;
    for (let i = 0; i < 10; i += 1) {
      zoomIn = getZoomFactorAfterStep(zoomIn, 1);
      zoomOut = getZoomFactorAfterStep(zoomOut, -1);
    }
    expect(zoomIn).toBe(PINCH_ZOOM_MAX);
    expect(zoomOut).toBe(PINCH_ZOOM_MIN);
  });

  it("zoom in then out is the identity inside the bounds", () => {
    expect(getZoomFactorAfterStep(getZoomFactorAfterStep(1, 1), -1)).toBeCloseTo(1, 9);
  });
});

describe("world explore camera gestures (MFW-57)", () => {
  const collect = (mode: "WORLD_EXPLORE" | "CUSTOMIZE" | "RITUAL_RELEASE" = "WORLD_EXPLORE") => {
    const actions: InteractionAction[] = [];
    const input = createInputSeparator(mode, (a) => actions.push(a));
    return { actions, input };
  };
  const types = (actions: InteractionAction[]) => actions.map((a) => a.type);
  /** Second pointer at `angle` (y-down screen) around the first one at (100, 100), 100 px away. */
  const at = (angle: number) => ({ x: 100 + 100 * Math.cos(angle), y: 100 + 100 * Math.sin(angle) });

  it("first PAN_RIVER carries the pre-threshold displacement", () => {
    const { actions, input } = collect();
    input.pointerDown({ pointerId: 1, x: 0, y: 0, time: 0 });
    input.pointerMove({ pointerId: 1, x: 5, y: 0, time: 10 });
    expect(actions).toEqual([]);
    input.pointerMove({ pointerId: 1, x: 9, y: 3, time: 20 });
    expect(actions).toEqual([{ type: "PAN_RIVER", deltaX: 9, deltaY: 3, time: 20 }]);
    input.pointerMove({ pointerId: 1, x: 12, y: 3, time: 30 });
    expect(actions[1]).toEqual({ type: "PAN_RIVER", deltaX: 3, deltaY: 0, time: 30 });
  });

  it("a tap emits no PAN_END", () => {
    const { actions, input } = collect();
    input.pointerDown({ pointerId: 1, x: 0, y: 0, time: 0 });
    input.pointerUp({ pointerId: 1, x: 0, y: 0, time: 100 });
    expect(types(actions)).toEqual(["TAP_INTERACT"]);
  });

  it("world explore two-finger pinch zooms", () => {
    const { actions, input } = collect();
    input.pointerDown({ pointerId: 1, x: 10, y: 10, time: 0 });
    input.pointerDown({ pointerId: 2, x: 30, y: 10, time: 5 });
    input.pointerMove({ pointerId: 2, x: 40, y: 10, time: 10 });
    expect(actions).toContainEqual({ type: "PINCH_ZOOM", scale: 1.5 });
    expect(types(actions)).not.toContain("PAN_RIVER");
  });

  it("twist emits ROTATE_VIEW past the threshold", () => {
    const { actions, input } = collect();
    input.pointerDown({ pointerId: 1, x: 100, y: 100, time: 0 });
    input.pointerDown({ pointerId: 2, x: 200, y: 100, time: 5 });
    input.pointerMove({ pointerId: 2, ...at(TWIST_START_RADIANS / 2), time: 10 });
    expect(types(actions)).not.toContain("ROTATE_VIEW");
    input.pointerMove({ pointerId: 2, ...at(TWIST_START_RADIANS + 0.01), time: 20 });
    expect(types(actions)).not.toContain("ROTATE_VIEW");
    input.pointerMove({ pointerId: 2, ...at(TWIST_START_RADIANS + 0.21), time: 30 });
    const rotations = actions.filter((a) => a.type === "ROTATE_VIEW");
    expect(rotations).toHaveLength(1);
    const first = rotations[0] as Extract<InteractionAction, { type: "ROTATE_VIEW" }>;
    expect(first.deltaRad).toBeCloseTo(0.2, 9);
    expect(first.deltaRad).toBeGreaterThan(0); // clockwise in y-down screen space is positive
    expect(types(actions)).not.toContain("PAN_RIVER");
  });

  it("twist wraps across ±π", () => {
    const { actions, input } = collect();
    input.pointerDown({ pointerId: 1, x: 100, y: 100, time: 0 });
    input.pointerDown({ pointerId: 2, ...at(2.8), time: 5 });
    input.pointerMove({ pointerId: 2, ...at(3.1), time: 10 }); // 0.3 ≥ threshold: twisting starts
    input.pointerMove({ pointerId: 2, ...at(-3.1), time: 20 });
    const last = actions.filter((a) => a.type === "ROTATE_VIEW").at(-1) as Extract<InteractionAction, { type: "ROTATE_VIEW" }>;
    expect(last.deltaRad).toBeCloseTo(2 * Math.PI - 6.2, 9);
    expect(last.deltaRad).toBeGreaterThan(0);
  });

  it("second finger during a pan ends it without inertia", () => {
    const { actions, input } = collect();
    input.pointerDown({ pointerId: 1, x: 0, y: 0, time: 0 });
    input.pointerMove({ pointerId: 1, x: 20, y: 0, time: 10 });
    input.pointerDown({ pointerId: 2, x: 100, y: 0, time: 20 });
    expect(actions.at(-1)).toEqual({ type: "PAN_END", time: null });
    input.pointerUp({ pointerId: 2, x: 100, y: 0, time: 30 });
    expect(types(actions).filter((t) => t === "PAN_END")).toHaveLength(1);
  });

  it("two-finger pointers never tap", () => {
    const { actions, input } = collect();
    input.pointerDown({ pointerId: 1, x: 0, y: 0, time: 0 });
    input.pointerDown({ pointerId: 2, x: 50, y: 0, time: 10 });
    input.pointerUp({ pointerId: 2, x: 50, y: 0, time: 40 });
    input.pointerUp({ pointerId: 1, x: 0, y: 0, time: 50 });
    expect(types(actions)).not.toContain("TAP_INTERACT");
  });

  it("after one finger lifts the other pans again", () => {
    const { actions, input } = collect();
    input.pointerDown({ pointerId: 1, x: 0, y: 0, time: 0 });
    input.pointerDown({ pointerId: 2, x: 50, y: 0, time: 10 });
    input.pointerMove({ pointerId: 1, x: 30, y: 30, time: 20 });
    expect(types(actions)).not.toContain("PAN_RIVER");
    input.pointerUp({ pointerId: 2, x: 50, y: 0, time: 30 });
    input.pointerMove({ pointerId: 1, x: 40, y: 35, time: 40 });
    expect(actions.at(-1)).toEqual({ type: "PAN_RIVER", deltaX: 10, deltaY: 5, time: 40 });
    input.pointerUp({ pointerId: 1, x: 40, y: 35, time: 50 });
    expect(actions.at(-1)).toEqual({ type: "PAN_END", time: 50 });
  });

  it("three pointers: moves are ignored", () => {
    const { actions, input } = collect();
    input.pointerDown({ pointerId: 1, x: 0, y: 0, time: 0 });
    input.pointerDown({ pointerId: 2, x: 50, y: 0, time: 1 });
    input.pointerDown({ pointerId: 3, x: 0, y: 50, time: 2 });
    input.pointerMove({ pointerId: 2, x: 90, y: 40, time: 10 });
    input.pointerMove({ pointerId: 3, x: 30, y: 90, time: 20 });
    input.pointerMove({ pointerId: 1, x: 40, y: 40, time: 30 });
    expect(actions).toEqual([]);
  });

  it("cancel during a pan → PAN_END {time: null}", () => {
    const { actions, input } = collect();
    input.pointerDown({ pointerId: 1, x: 0, y: 0, time: 0 });
    input.pointerMove({ pointerId: 1, x: 20, y: 0, time: 10 });
    input.pointerCancel(1);
    expect(actions.at(-1)).toEqual({ type: "PAN_END", time: null });
  });

  it("CUSTOMIZE twist emits no ROTATE_VIEW", () => {
    const { actions, input } = collect("CUSTOMIZE");
    input.pointerDown({ pointerId: 1, x: 100, y: 100, time: 0 });
    input.pointerDown({ pointerId: 2, x: 200, y: 100, time: 5 });
    input.pointerMove({ pointerId: 2, ...at(0.5), time: 10 });
    input.pointerMove({ pointerId: 2, ...at(1), time: 20 });
    expect(actions.length).toBeGreaterThan(0);
    expect(new Set(types(actions))).toEqual(new Set(["PINCH_ZOOM"]));
  });

  it("RITUAL_RELEASE never emits PAN_*", () => {
    const { actions, input } = collect("RITUAL_RELEASE");
    input.pointerDown({ pointerId: 1, x: 0, y: 0, time: 0, target: "water" });
    input.pointerMove({ pointerId: 1, x: 40, y: 30, time: 10 });
    input.pointerUp({ pointerId: 1, x: 40, y: 30, time: 20, target: "water" });
    expect(actions).toEqual([]);
  });

  it("getWheelZoomScale", () => {
    expect(getWheelZoomScale(0, 0, 640)).toBe(1);
    expect(getWheelZoomScale(-100, 0, 640)).toBeCloseTo(Math.exp(100 * WHEEL_ZOOM_PER_PIXEL), 12);
    expect(getWheelZoomScale(-100, 0, 640)).toBeGreaterThan(1);
    expect(getWheelZoomScale(3, 1, 640)).toBeCloseTo(Math.exp(-3 * WHEEL_LINE_HEIGHT_PX * WHEEL_ZOOM_PER_PIXEL), 12);
    expect(getWheelZoomScale(1, 2, 640)).toBeCloseTo(Math.exp(-640 * WHEEL_ZOOM_PER_PIXEL), 12);
    expect(getWheelZoomScale(Number.NaN, 0, 640)).toBe(1);
  });

  it("wrapAngleRad", () => {
    expect(wrapAngleRad(Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngleRad(-Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngleRad(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngleRad(0.5)).toBe(0.5);
  });
});
