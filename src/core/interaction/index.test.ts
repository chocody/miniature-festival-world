import { describe, expect, it, vi } from "vitest";
import { createInputSeparator, getInteractionMode, isCameraLocked } from "./index";

describe("interaction mode routing", () => {
  it.each([
    ["LANDING_EVENT_SELECT", null],
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
    expect(actions).toHaveBeenLastCalledWith({ type: "PAN_RIVER", deltaX: 12, deltaY: 8 });
  });

  it("does not treat a long press as a world tap", () => {
    const actions = vi.fn();
    const input = createInputSeparator("WORLD_EXPLORE", actions);
    input.pointerDown({ pointerId: 1, x: 0, y: 0, time: 0, target: "water" });
    input.pointerUp({ pointerId: 1, x: 0, y: 0, time: 400, target: "water" });
    expect(actions).not.toHaveBeenCalled();
  });
});
