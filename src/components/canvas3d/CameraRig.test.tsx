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
    />
  );
  const result = render(view(props));
  return { handleRef, rerender: (p: typeof props) => result.rerender(view(p)) };
}

describe("CameraRig (MFW-57)", () => {
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
