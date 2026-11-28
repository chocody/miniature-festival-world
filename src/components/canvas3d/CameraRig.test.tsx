import { createRef } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrthographicCamera } from "three";
import {
  applyCameraRigPose,
  applyPanDrag,
  createCameraRigState,
  endPan,
  getCameraRigPose,
  type CameraPanBounds,
  type CameraRigState,
} from "@/core/camera";
import { RIVER_STRETCH_SWITCH_HYSTERESIS } from "@/config/world.config";
import { createEndlessRiverFrame, frameToWorldInto } from "@/core/coordinates/endlessRiverFrame";
import { CameraRig, createPointTarget, type CameraRigHandle, type WorldPositionSource } from "./CameraRig";

const fiber = vi.hoisted(() => ({
  frame: null as null | ((state: { camera: unknown; invalidate: () => void }, delta: number) => void),
  invalidate: (() => {}) as () => void,
}));

vi.mock("@react-three/fiber", () => {
  const noop = () => {};
  return {
    useFrame: (cb: typeof fiber.frame) => {
      fiber.frame = cb;
    },
    useThree: (sel: (s: { invalidate: () => void }) => unknown) => sel({ invalidate: fiber.invalidate }),
    addEffect: () => noop,
    applyProps: noop,
    invalidate: noop,
  };
});

const spring = vi.hoisted(() => {
  const values = { focusX: 0, focusY: 0, focusZ: 0, yawRad: 0 };
  const make = (k: keyof typeof values) => ({ get: () => values[k] });
  return {
    values,
    springs: { focusX: make("focusX"), focusY: make("focusY"), focusZ: make("focusZ"), yawRad: make("yawRad") },
    api: { set: (() => {}) as unknown, start: (() => {}) as unknown, stop: (() => {}) as unknown } as {
      set: ReturnType<typeof vi.fn>;
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
    },
  };
});

vi.mock("@react-spring/three", () => ({
  useSpring: () => [spring.springs, spring.api],
}));

const BOUNDS: CameraPanBounds = { minX: -10, maxX: 10, minZ: -2, maxZ: 2 };
const ZOOM = 50;

let rig: CameraRigState;
let invalidateSpy: ReturnType<typeof vi.fn>;
const getRig = () => rig;

beforeEach(() => {
  rig = createCameraRigState();
  invalidateSpy = vi.fn();
  fiber.invalidate = invalidateSpy as unknown as () => void;
  fiber.frame = null;
  Object.assign(spring.values, { focusX: 0, focusY: 0, focusZ: 0, yawRad: 0 });
  spring.api.set = vi.fn();
  spring.api.start = vi.fn();
  spring.api.stop = vi.fn();
});
afterEach(cleanup);

function frame(camera = new OrthographicCamera(), stateInvalidate = vi.fn()) {
  act(() => fiber.frame!({ camera, invalidate: stateInvalidate }, 1 / 60));
  return { camera, stateInvalidate };
}

function renderRig(props: {
  targetRef?: { current: WorldPositionSource | null } | null;
  requestId?: number;
  reducedMotion?: boolean;
  flightYawRad?: number | null;
}) {
  const handleRef = createRef<CameraRigHandle>();
  const view = (p: typeof props) => (
    <CameraRig
      getRig={getRig}
      bounds={BOUNDS}
      targetRef={p.targetRef ?? null}
      requestId={p.requestId ?? 0}
      reducedMotion={p.reducedMotion ?? false}
      handleRef={handleRef}
      flightYawRad={p.flightYawRad}
    />
  );
  const result = render(view(props));
  return { handleRef, rerender: (p: typeof props) => result.rerender(view(p)) };
}

describe("CameraRig (MFW-57)", () => {
  it("CR1 (MFW-154) flightYawRad overrides the rig's yaw for a target flight", () => {
    const target = { current: createPointTarget(1, 0, -1) };
    rig.yawRad = 0.5;
    renderRig({ targetRef: target });
    expect(spring.api.start).toHaveBeenLastCalledWith(expect.objectContaining({ to: expect.objectContaining({ yawRad: 0.5 }) }));
    cleanup();

    rig = createCameraRigState();
    rig.yawRad = 0.5;
    renderRig({ targetRef: target, flightYawRad: 0 });
    expect(spring.api.start).toHaveBeenLastCalledWith(expect.objectContaining({ to: expect.objectContaining({ yawRad: 0 }) }));
  });

  it("no target → no flight", () => {
    renderRig({});
    expect(spring.api.start).not.toHaveBeenCalled();
    expect(rig.phase).toBe("MANUAL");
  });

  it("a target flies", () => {
    const target = { x: 1, y: 0.2, z: -1 };
    renderRig({ targetRef: { current: createPointTarget(target.x, target.y, target.z) } });
    expect(spring.api.set).toHaveBeenCalledWith({ focusX: 0, focusY: 0, focusZ: 0, yawRad: 0 });
    expect(spring.api.start).toHaveBeenCalledTimes(1);
    expect(spring.api.start).toHaveBeenCalledWith({ to: getCameraRigPose(target, 0), immediate: false });
    expect(rig.phase).toBe("FLIGHT");
    expect(rig.targetFocusX).toBe(1);
    expect(rig.targetFocusY).toBe(0.2);
    expect(rig.targetFocusZ).toBe(-1);
    expect(invalidateSpy).toHaveBeenCalled();
    cleanup();

    rig = createCameraRigState();
    renderRig({ targetRef: { current: createPointTarget(0, 0, 0) }, reducedMotion: true });
    expect(spring.api.start).toHaveBeenLastCalledWith({ to: getCameraRigPose({ x: 0, y: 0, z: 0 }, 0), immediate: true });
  });

  it("a flight from a panned rig re-syncs the spring first", () => {
    applyPanDrag(rig, 40, 20, ZOOM, 0, BOUNDS);
    const { focusX, focusZ } = rig;
    renderRig({ targetRef: { current: createPointTarget(2, 0, 0) } });
    expect(spring.api.set).toHaveBeenLastCalledWith({ focusX, focusY: 0, focusZ, yawRad: 0 });
    const setOrder = spring.api.set.mock.invocationCallOrder.at(-1)!;
    expect(setOrder).toBeLessThan(spring.api.start.mock.invocationCallOrder[0]);
  });

  it("a second flight while FLIGHT does not api.set", () => {
    const targetRef = { current: createPointTarget(2, 0, 0) as WorldPositionSource };
    const { rerender } = renderRig({ targetRef, requestId: 1 });
    const sets = spring.api.set.mock.calls.length;
    targetRef.current = createPointTarget(-3, 0, 1);
    rerender({ targetRef, requestId: 2 });
    expect(spring.api.start).toHaveBeenCalledTimes(2);
    expect(spring.api.set.mock.calls.length).toBe(sets);
    expect(rig.targetFocusX).toBe(-3);
  });

  it("FLIGHT frames copy the spring into the rig and camera", () => {
    renderRig({ targetRef: { current: createPointTarget(2, 0, 0) } });
    Object.assign(spring.values, { focusX: 1, focusY: 0.1, focusZ: -0.5, yawRad: 0.3 });
    const { camera } = frame();
    expect(rig).toMatchObject({ focusX: 1, focusY: 0.1, focusZ: -0.5, yawRad: 0.3, phase: "FLIGHT" });
    const expected = new OrthographicCamera();
    applyCameraRigPose(rig, expected);
    expect(camera.position.toArray()).toEqual(expected.position.toArray());
    expect(camera.quaternion.toArray()).toEqual(expected.quaternion.toArray());
  });

  it("user input mid-flight stops the spring once and stops copying", () => {
    renderRig({ targetRef: { current: createPointTarget(2, 0, 0) } });
    Object.assign(spring.values, { focusX: 1, focusY: 0, focusZ: 0, yawRad: 0 });
    frame();
    applyPanDrag(rig, 40, 0, ZOOM, 0, BOUNDS);
    const panned = rig.focusX;
    Object.assign(spring.values, { focusX: 1.5 });
    frame();
    expect(spring.api.stop).toHaveBeenCalledTimes(1);
    frame();
    frame();
    expect(spring.api.stop).toHaveBeenCalledTimes(1);
    expect(rig.focusX).toBe(panned);
    expect(rig.phase).toBe("MANUAL");
  });

  it("COAST invalidates until rest", () => {
    renderRig({});
    applyPanDrag(rig, 10, 0, ZOOM, 0, BOUNDS);
    applyPanDrag(rig, 10, 0, ZOOM, 16, BOUNDS);
    expect(endPan(rig, 20, BOUNDS, false)).toBe(true);
    let lastInvalidate = vi.fn();
    let camera = new OrthographicCamera();
    let frames = 0;
    while (rig.phase === "COAST" && frames < 10_000) {
      lastInvalidate = vi.fn();
      ({ camera } = frame(camera, lastInvalidate));
      frames += 1;
      if (rig.phase === "COAST") expect(lastInvalidate).toHaveBeenCalledTimes(1);
    }
    expect(frames).toBeGreaterThan(1);
    expect(lastInvalidate).not.toHaveBeenCalled(); // the final frame does not ask for another
    expect(rig.phase).toBe("MANUAL");
    const expected = new OrthographicCamera();
    applyCameraRigPose(rig, expected);
    expect(camera.position.toArray()).toEqual(expected.position.toArray());
  });

  it("rotateBy", () => {
    rig.yawRad = 0.2;
    const { handleRef } = renderRig({});
    act(() => handleRef.current!.rotateBy(0.5));
    expect(spring.api.start).toHaveBeenLastCalledWith({
      to: { focusX: 0, focusY: 0, focusZ: 0, yawRad: 0.7 },
      immediate: false,
    });
    expect(rig.phase).toBe("FLIGHT");
    act(() => handleRef.current!.rotateBy(0.5));
    expect(spring.api.start.mock.calls.at(-1)![0].to.yawRad).toBeCloseTo(1.2, 12);
    cleanup();

    rig = createCameraRigState();
    const reduced = renderRig({ reducedMotion: true });
    act(() => reduced.handleRef.current!.rotateBy(0.5));
    expect(spring.api.start).toHaveBeenLastCalledWith({ to: { focusX: 0, focusY: 0, focusZ: 0, yawRad: 0.5 }, immediate: true });
  });

  it("same requestId re-render → no new flight; new requestId → flight", () => {
    const targetRef = { current: createPointTarget(2, 0, 0) as WorldPositionSource };
    const { rerender } = renderRig({ targetRef, requestId: 1 });
    expect(spring.api.start).toHaveBeenCalledTimes(1);
    rerender({ targetRef, requestId: 1 });
    expect(spring.api.start).toHaveBeenCalledTimes(1);
    rerender({ targetRef, requestId: 2 });
    expect(spring.api.start).toHaveBeenCalledTimes(2);
  });
});

describe("CameraRig on the endless river (MFW-58)", () => {
  const frameOf = createEndlessRiverFrame([
    { x: -12, z: 0.6 },
    { x: 12, z: -0.5 },
  ]);
  const at = (along: number) => frameToWorldInto(frameOf, along, 0, { x: 0, z: 0 });
  const h = RIVER_STRETCH_SWITCH_HYSTERESIS;

  function renderStretchRig(stretchIndex: number, onStretchChange: (s: number) => void, reducedMotion = false) {
    const handleRef = createRef<CameraRigHandle>();
    const view = (s: number) => (
      <CameraRig
        getRig={getRig}
        bounds={BOUNDS}
        targetRef={null}
        requestId={0}
        reducedMotion={reducedMotion}
        handleRef={handleRef}
        stretchFrame={frameOf}
        stretchIndex={s}
        onStretchChange={onStretchChange}
      />
    );
    const result = render(view(stretchIndex));
    return { handleRef, rerender: (s: number) => result.rerender(view(s)) };
  }
  const placeFocus = (along: number) => {
    const p = at(along);
    rig.focusX = p.x;
    rig.focusZ = p.z;
  };

  it("travelBy flies the focus by (dx, dz) keeping the yaw; reduced motion makes it an instant cut", () => {
    const onChange = vi.fn();
    rig.yawRad = 0.4;
    const { handleRef } = renderStretchRig(0, onChange);
    act(() => handleRef.current!.travelBy(frameOf.periodX, frameOf.periodZ));
    expect(spring.api.start).toHaveBeenLastCalledWith({
      to: { focusX: frameOf.periodX, focusY: 0, focusZ: frameOf.periodZ, yawRad: 0.4 },
      immediate: false,
    });
    expect(rig.phase).toBe("FLIGHT");
    // A second tap during the flight builds on its destination (taps accumulate).
    act(() => handleRef.current!.travelBy(frameOf.periodX, frameOf.periodZ));
    expect(spring.api.start).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: expect.objectContaining({ focusX: 2 * frameOf.periodX }) }),
    );
    expect(invalidateSpy).toHaveBeenCalled();
    cleanup();
    rig = createCameraRigState();
    const reduced = renderStretchRig(0, onChange, true);
    act(() => reduced.handleRef.current!.travelBy(-frameOf.periodX, -frameOf.periodZ));
    expect(spring.api.start).toHaveBeenLastCalledWith(expect.objectContaining({ immediate: true }));
    const calls = spring.api.start.mock.calls.length;
    act(() => reduced.handleRef.current!.travelBy(Number.NaN, 0));
    expect(spring.api.start.mock.calls.length).toBe(calls);
  });

  it("onStretchChange fires once when the focus is h past a seam, not within ± h of it", () => {
    const onChange = vi.fn();
    const { rerender } = renderStretchRig(0, onChange);
    placeFocus(frameOf.length + 0.5 * h);
    frame();
    expect(onChange).not.toHaveBeenCalled();
    placeFocus(-0.5 * h);
    frame();
    expect(onChange).not.toHaveBeenCalled();
    placeFocus(frameOf.length + 1.5 * h);
    frame();
    frame(); // the store has not caught up yet: no repeat
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(1);
    rerender(1);
    frame();
    expect(onChange).toHaveBeenCalledTimes(1);
    placeFocus(frameOf.length - 0.5 * h); // back over the seam, still within h: stays 1
    frame();
    expect(onChange).toHaveBeenCalledTimes(1);
    placeFocus(frameOf.length - 1.5 * h);
    frame();
    expect(onChange).toHaveBeenLastCalledWith(0);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("without the stretch props nothing is reported (MFW-57 behaviour)", () => {
    renderRig({});
    placeFocus(10 * frameOf.length);
    expect(() => frame()).not.toThrow();
  });
});
