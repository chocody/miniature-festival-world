// @vitest-environment node
import { describe, expect, it } from "vitest";
import { OrthographicCamera, Vector3 } from "three";
import {
  CAMERA_FLIGHT_OFFSET,
  CAMERA_PAN_EASE_TIME_CONSTANT_MS,
  CAMERA_PAN_EDGE_RESISTANCE,
  CAMERA_PAN_MAX_OVERSHOOT,
  CAMERA_PAN_MAX_RELEASE_SPEED,
  CAMERA_PAN_RELEASE_IDLE_MS,
  CAMERA_PAN_STOP_SPEED,
  SCENE_CAMERA_FAR,
  SCENE_CAMERA_NEAR,
  SCENE_CAMERA_ZOOM_MAX,
} from "@/config/camera.config";
import { PINCH_ZOOM_MAX } from "@/config/interaction.config";
import { LOY_KRATHONG_RIVER_CHANNEL } from "@/config/events/loyKrathong.river.config";
import { acrossOf, alongOf, createEndlessRiverFrame, frameToWorldInto } from "@/core/coordinates/endlessRiverFrame";
import { getFramedCameraZoom } from "./viewportFraming";
import { getCameraFlightPose } from "./index";
import {
  applyCameraRigPose,
  applyPanDrag,
  beginRigFlight,
  createCameraRigState,
  dragAxisWithResistance,
  endPan,
  getFlightYaw,
  getPanFocusDelta,
  getEndlessRiverPanBounds,
  getRiverPanBounds,
  getRotateStepPose,
  getTravelStepPose,
  getYawAfterTwist,
  isInsidePanBounds,
  stepCameraRig,
  twistCameraRig,
  type CameraPanBounds,
  type CameraRigState,
} from "./cameraRig";

const W = 360;
const H = 640;
const OPEN: CameraPanBounds = { minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity };
const BOUNDS: CameraPanBounds = { minX: -10, maxX: 10, minZ: -2, maxZ: 2 };

function makeCamera(zoom: number): OrthographicCamera {
  const camera = new OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, SCENE_CAMERA_NEAR, SCENE_CAMERA_FAR);
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
  return camera;
}

function toScreen(camera: OrthographicCamera, p: { x: number; y: number; z: number }) {
  const v = new Vector3(p.x, p.y, p.z).project(camera);
  return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H };
}

function rigAt(patch: Partial<CameraRigState> = {}): CameraRigState {
  return Object.assign(createCameraRigState(), patch);
}

describe("camera rig pan math (MFW-57)", () => {
  const zooms = [getFramedCameraZoom({ width: W, height: H }), SCENE_CAMERA_ZOOM_MAX * PINCH_ZOOM_MAX];
  const yaws = [0, 0.7, -2, Math.PI];
  const deltas: [number, number][] = [
    [30, -45],
    [-120, 0],
    [0, 200],
  ];
  const points = [
    { x: 1.8, y: -0.24, z: -0.4 },
    { x: -1, y: 0.5, z: 2 },
  ];

  it("pan follows the finger", () => {
    for (const zoom of zooms) {
      for (const yawRad of yaws) {
        for (const [dx, dy] of deltas) {
          const rig = rigAt({ focusX: 0.3, focusY: -0.2, focusZ: 0.1, yawRad });
          const camera = makeCamera(zoom);
          applyCameraRigPose(rig, camera);
          const before = points.map((p) => toScreen(camera, p));
          const d = getPanFocusDelta(dx, dy, zoom, yawRad, { x: 0, z: 0 });
          rig.focusX += d.x;
          rig.focusZ += d.z;
          applyCameraRigPose(rig, camera);
          points.forEach((p, i) => {
            const after = toScreen(camera, p);
            expect(Math.abs(after.x - before[i].x - dx)).toBeLessThan(1e-6);
            expect(Math.abs(after.y - before[i].y - dy)).toBeLessThan(1e-6);
          });
        }
      }
    }
  });

  it("applyPanDrag with open bounds follows the finger too", () => {
    const zoom = zooms[0];
    const rig = rigAt({ yawRad: 0.7 });
    const camera = makeCamera(zoom);
    applyCameraRigPose(rig, camera);
    const before = toScreen(camera, points[0]);
    applyPanDrag(rig, 30, -45, zoom, 0, OPEN);
    applyCameraRigPose(rig, camera);
    const after = toScreen(camera, points[0]);
    expect(after.x - before.x).toBeCloseTo(30, 6);
    expect(after.y - before.y).toBeCloseTo(-45, 6);
  });

  it("getPanFocusDelta returns out; zero/invalid input gives 0", () => {
    const out = { x: 9, z: 9 };
    expect(getPanFocusDelta(10, 10, 50, 0, out)).toBe(out);
    expect(out.x).not.toBe(0);
    for (const zoom of [0, Number.NaN, -1]) {
      getPanFocusDelta(10, 10, zoom, 0, out);
      expect(out).toEqual({ x: 0, z: 0 });
    }
    out.x = 9;
    getPanFocusDelta(Number.NaN, 10, 50, 0, out);
    expect(out).toEqual({ x: 0, z: 0 });
    out.x = 9;
    getPanFocusDelta(10, Number.NaN, 50, 0, out);
    expect(out).toEqual({ x: 0, z: 0 });
  });

  it("applyCameraRigPose at yaw 0 equals getCameraFlightPose", () => {
    const tip = { x: 0.4, y: 0.12, z: 1.05 };
    const rig = rigAt({ focusX: tip.x, focusY: tip.y, focusZ: tip.z });
    const camera = makeCamera(50);
    applyCameraRigPose(rig, camera);
    const pose = getCameraFlightPose(tip);
    expect(camera.position.x).toBeCloseTo(pose.cameraX, 12);
    expect(camera.position.y).toBeCloseTo(pose.cameraY, 12);
    expect(camera.position.z).toBeCloseTo(pose.cameraZ, 12);
    const dir = camera.getWorldDirection(new Vector3());
    const toFocus = new Vector3(tip.x, tip.y, tip.z).sub(camera.position).normalize();
    expect(dir.distanceTo(toFocus)).toBeLessThan(1e-9);

    const horizontal = Math.hypot(Number(CAMERA_FLIGHT_OFFSET[0]), Number(CAMERA_FLIGHT_OFFSET[2]));
    for (const yawRad of [0.4, -1.3, Math.PI]) {
      rig.yawRad = yawRad;
      applyCameraRigPose(rig, camera);
      expect(camera.position.y - tip.y).toBeCloseTo(Number(CAMERA_FLIGHT_OFFSET[1]), 12);
      expect(Math.hypot(camera.position.x - tip.x, camera.position.z - tip.z)).toBeCloseTo(horizontal, 12);
    }
  });

  it("twist sign: clockwise finger twist turns the world clockwise", () => {
    const angleOf = (yawRad: number) => {
      const camera = makeCamera(50);
      applyCameraRigPose(rigAt({ yawRad }), camera);
      const c = toScreen(camera, { x: 0, y: 0, z: 0 });
      const p = toScreen(camera, { x: 1, y: 0, z: 0 });
      return Math.atan2(p.y - c.y, p.x - c.x); // y-down screen: increasing = clockwise
    };
    expect(angleOf(getYawAfterTwist(0, 0.05))).toBeGreaterThan(angleOf(0));
  });
});

describe("camera pan bounds (MFW-57)", () => {
  it("getRiverPanBounds", () => {
    const bounds = getRiverPanBounds({
      controlPoints: [
        { x: -12, z: 0.6 },
        { x: 0, z: 0 },
        { x: 12, z: -0.5 },
      ],
      width: 3.2,
    });
    expect(bounds.minX).toBe(-12);
    expect(bounds.maxX).toBe(12);
    expect(bounds.minZ).toBeCloseTo(-0.5 - 1.6, 12);
    expect(bounds.maxZ).toBeCloseTo(0.6 + 1.6, 12);
    expect(() => getRiverPanBounds({ controlPoints: [], width: 3 })).toThrow(RangeError);
    expect(() => getRiverPanBounds({ controlPoints: [{ x: 0, z: 0 }], width: 0 })).toThrow(RangeError);
    expect(() => getRiverPanBounds({ controlPoints: [{ x: 0, z: 0 }], width: Number.NaN })).toThrow(RangeError);
    expect(isInsidePanBounds(-12, 2.2, bounds)).toBe(true);
    expect(isInsidePanBounds(-12.01, 0, bounds)).toBe(false);
  });

  it("dragAxisWithResistance", () => {
    const min = -2;
    const max = 2;
    expect(dragAxisWithResistance(0, 0.5, min, max)).toBe(0.5);
    expect(dragAxisWithResistance(max - 0.1, 0.5, min, max)).toBeCloseTo(max + 0.4 * CAMERA_PAN_EDGE_RESISTANCE, 12);
    expect(dragAxisWithResistance(0, 1000, min, max)).toBe(max + CAMERA_PAN_MAX_OVERSHOOT);
    expect(dragAxisWithResistance(max + 2, 0.5, min, max)).toBe(max + 2);
    expect(dragAxisWithResistance(max + 2, -0.5, min, max)).toBe(max + 1.5);
    // mirrored
    expect(dragAxisWithResistance(min + 0.1, -0.5, min, max)).toBeCloseTo(min - 0.4 * CAMERA_PAN_EDGE_RESISTANCE, 12);
    expect(dragAxisWithResistance(0, -1000, min, max)).toBe(min - CAMERA_PAN_MAX_OVERSHOOT);
    expect(dragAxisWithResistance(min - 2, -0.5, min, max)).toBe(min - 2);
    expect(dragAxisWithResistance(min - 2, 0.5, min, max)).toBe(min - 1.5);
    // infinite bounds never clamp
    expect(dragAxisWithResistance(5, 1000, -Infinity, Infinity)).toBe(1005);
    expect(dragAxisWithResistance(5, -1000, -Infinity, Infinity)).toBe(-995);
    expect(dragAxisWithResistance(1, Number.NaN, min, max)).toBe(1);
  });
});

describe("camera rig drag, release and coast (MFW-57)", () => {
  const zoom = 50;

  it("applyPanDrag", () => {
    const flight = rigAt({ phase: "FLIGHT" });
    applyPanDrag(flight, 10, 0, zoom, 0, BOUNDS);
    expect(flight.phase).toBe("MANUAL");
    expect(flight.stopFlightRequested).toBe(true);

    const coast = rigAt({ phase: "COAST", velocityX: 3 });
    applyPanDrag(coast, 10, 0, zoom, 0, BOUNDS);
    expect(coast.phase).toBe("MANUAL");
    expect(coast.stopFlightRequested).toBe(false);

    const rig = rigAt({ focusY: 0.7 });
    applyPanDrag(rig, 10, 5, zoom, 100, BOUNDS);
    expect(rig.velocityX).toBe(0);
    expect(rig.velocityZ).toBe(0);
    const x0 = rig.focusX;
    const z0 = rig.focusZ;
    applyPanDrag(rig, 4, 2, zoom, 116, BOUNDS);
    expect(rig.velocityX).toBeCloseTo(((rig.focusX - x0) / 16) * 1000, 9);
    expect(rig.velocityZ).toBeCloseTo(((rig.focusZ - z0) / 16) * 1000, 9);
    const vx = rig.velocityX;
    const vz = rig.velocityZ;
    applyPanDrag(rig, 4, 2, zoom, 116, BOUNDS); // dt = 0 keeps the previous velocity
    expect(rig.velocityX).toBe(vx);
    expect(rig.velocityZ).toBe(vz);
    expect(rig.focusY).toBe(0.7);

    applyPanDrag(rig, 300, 0, zoom, 117, OPEN); // 6 world units in 1 ms
    expect(Math.hypot(rig.velocityX, rig.velocityZ)).toBeCloseTo(CAMERA_PAN_MAX_RELEASE_SPEED, 9);
  });

  const dragging = (patch: Partial<CameraRigState> = {}) => rigAt({ lastPanTime: 1000, velocityX: 2, velocityZ: -1, ...patch });

  it("endPan: a release within the idle time coasts", () => {
    const rig = dragging();
    expect(endPan(rig, 1000 + CAMERA_PAN_RELEASE_IDLE_MS, BOUNDS, false)).toBe(true);
    expect(rig.phase).toBe("COAST");
    expect(rig.velocityX).toBe(2);
    expect(Number.isNaN(rig.lastPanTime)).toBe(true);
  });

  it("endPan: a late release or time null does not coast", () => {
    const late = dragging();
    expect(endPan(late, 1000 + CAMERA_PAN_RELEASE_IDLE_MS + 1, BOUNDS, false)).toBe(false);
    expect(late.phase).toBe("MANUAL");
    expect(late.velocityX).toBe(0);
    expect(late.velocityZ).toBe(0);
    const cut = dragging();
    expect(endPan(cut, null, BOUNDS, false)).toBe(false);
    expect(cut.phase).toBe("MANUAL");
    expect(cut.velocityX).toBe(0);
  });

  it("endPan: out of bounds without velocity eases back (COAST)", () => {
    const rig = dragging({ focusX: BOUNDS.maxX + 0.3 });
    expect(endPan(rig, 1010, BOUNDS, false)).toBe(true);
    expect(rig.velocityX).toBe(0); // the outside axis has no velocity
    expect(rig.velocityZ).toBe(-1);
  });

  it("reduced motion: endPan snaps into bounds at once and never coasts", () => {
    const rig = dragging({ focusX: BOUNDS.maxX + 0.5, focusZ: BOUNDS.minZ - 0.2 });
    expect(endPan(rig, 1010, BOUNDS, true)).toBe(false);
    expect(rig.focusX).toBe(BOUNDS.maxX);
    expect(rig.focusZ).toBe(BOUNDS.minZ);
    expect(rig.phase).toBe("MANUAL");
    expect(rig.velocityX).toBe(0);
    expect(rig.velocityZ).toBe(0);
    expect(stepCameraRig(rig, 16, BOUNDS)).toBe(false);
  });

  it("stepCameraRig: coast distance is v·τ (one big step)", () => {
    const v = 3;
    const rig = rigAt({ phase: "COAST", velocityX: v });
    stepCameraRig(rig, 100 * CAMERA_PAN_EASE_TIME_CONSTANT_MS, OPEN);
    expect(Math.abs(rig.focusX - (v * CAMERA_PAN_EASE_TIME_CONSTANT_MS) / 1000)).toBeLessThan(1e-9);
    expect(rig.phase).toBe("MANUAL");
  });

  it("stepCameraRig: the speed decays monotonically and the coast stops", () => {
    const rig = rigAt({ phase: "COAST", velocityX: 5, velocityZ: -2 });
    let speed = Math.hypot(rig.velocityX, rig.velocityZ);
    let moving = true;
    let frames = 0;
    while (moving && frames < 10_000) {
      moving = stepCameraRig(rig, 16, OPEN);
      const next = Math.hypot(rig.velocityX, rig.velocityZ);
      expect(next).toBeLessThanOrEqual(speed);
      speed = next;
      frames += 1;
    }
    expect(moving).toBe(false);
    expect(rig.phase).toBe("MANUAL");
    expect(rig.velocityX).toBe(0);
    expect(rig.velocityZ).toBe(0);
    expect(frames).toBeGreaterThan(1);
    expect(CAMERA_PAN_STOP_SPEED).toBeGreaterThan(0);
  });

  it("stepCameraRig: out of bounds returns with e^−1 per τ and ends exactly on the bound", () => {
    const rig = rigAt({ phase: "COAST", focusX: BOUNDS.maxX + 0.5 });
    expect(stepCameraRig(rig, CAMERA_PAN_EASE_TIME_CONSTANT_MS, BOUNDS)).toBe(true);
    expect(Math.abs(rig.focusX - (BOUNDS.maxX + 0.5 * Math.exp(-1)))).toBeLessThan(1e-9);
    let frames = 0;
    while (stepCameraRig(rig, 16, BOUNDS) && frames < 10_000) frames += 1;
    expect(rig.focusX).toBe(BOUNDS.maxX);
    expect(rig.phase).toBe("MANUAL");
  });

  it("stepCameraRig: coasting into a bound clamps and zeroes that axis", () => {
    const rig = rigAt({ phase: "COAST", focusX: BOUNDS.maxX - 0.01, velocityX: 10, velocityZ: 1 });
    stepCameraRig(rig, 100, BOUNDS);
    expect(rig.focusX).toBe(BOUNDS.maxX);
    expect(rig.velocityX).toBe(0);
    expect(rig.velocityZ).toBeGreaterThan(0);
  });

  it("stepCameraRig: non-COAST or dt ≤ 0 is a no-op", () => {
    const manual = rigAt({ velocityX: 3 });
    expect(stepCameraRig(manual, 16, BOUNDS)).toBe(false);
    expect(manual.focusX).toBe(0);
    const coast = rigAt({ phase: "COAST", velocityX: 3 });
    expect(stepCameraRig(coast, 0, BOUNDS)).toBe(true);
    expect(stepCameraRig(coast, -5, BOUNDS)).toBe(true);
    expect(stepCameraRig(coast, Number.NaN, BOUNDS)).toBe(true);
    expect(coast.focusX).toBe(0);
    expect(coast.velocityX).toBe(3);
  });

  it("rig functions mutate in place", () => {
    const rig = createCameraRigState();
    const same = rig;
    applyPanDrag(rig, 10, 10, zoom, 0, BOUNDS);
    rig.phase = "COAST";
    stepCameraRig(rig, 16, BOUNDS);
    twistCameraRig(rig, 0.1);
    expect(rig).toBe(same);
    expect(rig.yawRad).toBeCloseTo(0.1, 12);
    twistCameraRig(rig, Number.NaN);
    expect(rig.yawRad).toBeCloseTo(0.1, 12);
    const out = { x: 0, z: 0 };
    expect(getPanFocusDelta(1, 1, zoom, 0, out)).toBe(out);
  });
});

describe("camera rig flights (MFW-57)", () => {
  it("getFlightYaw / getRotateStepPose / beginRigFlight", () => {
    const rig = rigAt({ focusX: 1, focusY: 0.2, focusZ: -1, yawRad: 0.3 });
    expect(getFlightYaw(rig)).toBe(0.3);
    const first = getRotateStepPose(rig, 0.5);
    expect(first).toEqual({ focusX: 1, focusY: 0.2, focusZ: -1, yawRad: 0.8 });

    rig.velocityX = 4;
    rig.lastPanTime = 12;
    rig.stopFlightRequested = true;
    beginRigFlight(rig, first);
    expect(rig.phase).toBe("FLIGHT");
    expect(rig.targetYawRad).toBe(0.8);
    expect(rig.targetFocusX).toBe(1);
    expect(rig.velocityX).toBe(0);
    expect(Number.isNaN(rig.lastPanTime)).toBe(true);
    expect(rig.stopFlightRequested).toBe(false);
    expect(getFlightYaw(rig)).toBe(0.8);

    const second = getRotateStepPose(rig, 0.5); // mid-flight: builds on the destination
    expect(second.yawRad).toBeCloseTo(0.3 + 2 * 0.5, 12);
    expect(second.focusX).toBe(1);
  });
});

describe("endless-river corridor bounds (MFW-58)", () => {
  const frame = createEndlessRiverFrame(LOY_KRATHONG_RIVER_CHANNEL.controlPoints);
  const corridor = getEndlessRiverPanBounds(frame, LOY_KRATHONG_RIVER_CHANNEL);
  const zoom = 50;
  const at = (along: number, across: number) => frameToWorldInto(frame, along, across, { x: 0, z: 0 });

  it("is unbounded along the river and keeps the channel corridor across", () => {
    expect(corridor.minX).toBe(-Infinity);
    expect(corridor.maxX).toBe(Infinity);
    const across = LOY_KRATHONG_RIVER_CHANNEL.controlPoints.map((p) => acrossOf(frame, p.x, p.z));
    expect(corridor.minZ).toBeCloseTo(Math.min(...across) - LOY_KRATHONG_RIVER_CHANNEL.width / 2, 12);
    expect(corridor.maxZ).toBeCloseTo(Math.max(...across) + LOY_KRATHONG_RIVER_CHANNEL.width / 2, 12);
    expect(corridor.frame).toEqual({ originX: frame.originX, originZ: frame.originZ, axisX: frame.axisX, axisZ: frame.axisZ });
    expect(isInsidePanBounds(at(1e5, 0).x, at(1e5, 0).z, corridor)).toBe(true);
    expect(isInsidePanBounds(at(-3e4, 0).x, at(-3e4, 0).z, corridor)).toBe(true);
    expect(isInsidePanBounds(at(0, corridor.maxZ + 0.1).x, at(0, corridor.maxZ + 0.1).z, corridor)).toBe(false);
  });

  it("a drag goes far past the old maxX 12 with no resistance along the river", () => {
    const old = getRiverPanBounds(LOY_KRATHONG_RIVER_CHANNEL);
    expect(old.maxX).toBe(12);
    const rig = rigAt();
    const open = rigAt();
    for (let i = 0; i < 40; i++) {
      // A finger moving left (−x on screen at yaw 0) travels the camera downstream.
      applyPanDrag(rig, -120, 0, zoom, i * 16, corridor);
      applyPanDrag(open, -120, 0, zoom, i * 16, OPEN);
    }
    const along = alongOf(frame, rig.focusX, rig.focusZ);
    expect(along).toBeGreaterThan(3 * frame.length);
    // Along the axis the corridor resists nothing: the along travel equals the open-bounds travel.
    expect(along).toBeCloseTo(alongOf(frame, open.focusX, open.focusZ), 9);
    expect(rig.focusX).toBeGreaterThan(old.maxX + CAMERA_PAN_MAX_OVERSHOOT);
  });

  it("keeps the MFW-57 rubber band across the river", () => {
    const rig = rigAt();
    const edge = at(5, corridor.maxZ);
    rig.focusX = edge.x;
    rig.focusZ = edge.z;
    for (let i = 0; i < 30; i++) applyPanDrag(rig, 0, -200, zoom, i * 16, corridor); // finger up = focus toward −z / far bank
    const across = acrossOf(frame, rig.focusX, rig.focusZ);
    const overshoot = Math.max(across - corridor.maxZ, corridor.minZ - across);
    expect(overshoot).toBeGreaterThan(0);
    expect(overshoot).toBeLessThanOrEqual(CAMERA_PAN_MAX_OVERSHOOT + 1e-9);
  });

  it("endPan / stepCameraRig: coast along never stops at a bound; out of the corridor eases back across only", () => {
    const rig = rigAt({ lastPanTime: 1000, velocityX: 10 * frame.axisX, velocityZ: 10 * frame.axisZ });
    const start = at(30 * frame.length, 0);
    rig.focusX = start.x;
    rig.focusZ = start.z;
    expect(endPan(rig, 1010, corridor, false)).toBe(true);
    for (let i = 0; i < 200; i++) stepCameraRig(rig, 16, corridor);
    expect(rig.phase).toBe("MANUAL");
    // Coast distance v·τ, short by at most the stop speed · τ (the coast ends below CAMERA_PAN_STOP_SPEED).
    const travelled = alongOf(frame, rig.focusX, rig.focusZ) - 30 * frame.length;
    const tau = CAMERA_PAN_EASE_TIME_CONSTANT_MS / 1000;
    expect(travelled).toBeLessThanOrEqual(10 * tau + 1e-9);
    expect(travelled).toBeGreaterThanOrEqual(10 * tau - CAMERA_PAN_STOP_SPEED * tau - 1e-9);
    expect(Math.abs(acrossOf(frame, rig.focusX, rig.focusZ))).toBeLessThan(1e-9);

    const out = rigAt();
    const p = at(-50, corridor.maxZ + 0.5);
    out.focusX = p.x;
    out.focusZ = p.z;
    expect(endPan(out, null, corridor, false)).toBe(true);
    for (let i = 0; i < 200; i++) stepCameraRig(out, 16, corridor);
    expect(acrossOf(frame, out.focusX, out.focusZ)).toBeCloseTo(corridor.maxZ, 9);
    expect(alongOf(frame, out.focusX, out.focusZ)).toBeCloseTo(-50, 9);
  });

  it("reduced motion: endPan cuts back across at once and keeps the along position", () => {
    const rig = rigAt({ lastPanTime: 1000, velocityX: 5 });
    const p = at(1234, corridor.minZ - 0.4);
    rig.focusX = p.x;
    rig.focusZ = p.z;
    expect(endPan(rig, 1005, corridor, true)).toBe(false);
    expect(rig.phase).toBe("MANUAL");
    expect(acrossOf(frame, rig.focusX, rig.focusZ)).toBeCloseTo(corridor.minZ, 9);
    expect(alongOf(frame, rig.focusX, rig.focusZ)).toBeCloseTo(1234, 9);
    expect(rig.velocityX).toBe(0);
  });

  it("getTravelStepPose builds on the flight destination while flying, else on the focus, and keeps the yaw", () => {
    const rig = rigAt({ focusX: 1, focusY: 0.2, focusZ: 2, yawRad: 0.3 });
    expect(getTravelStepPose(rig, frame.periodX, frame.periodZ)).toEqual({
      focusX: 1 + frame.periodX,
      focusY: 0.2,
      focusZ: 2 + frame.periodZ,
      yawRad: 0.3,
    });
    beginRigFlight(rig, { focusX: 10, focusY: 0.1, focusZ: -1, yawRad: 1 });
    expect(getTravelStepPose(rig, -frame.periodX, -frame.periodZ)).toEqual({
      focusX: 10 - frame.periodX,
      focusY: 0.1,
      focusZ: -1 - frame.periodZ,
      yawRad: 1,
    });
  });
});
