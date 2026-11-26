import { describe, expect, it, vi } from "vitest";
import {
  createCameraController,
  getCameraFlightPose,
  getCameraRigPose,
} from "./index";

describe("camera flight", () => {
  it("builds a clear camera pose focused on the target", () => {
    expect(getCameraFlightPose({ x: 1, y: 2, z: 3 })).toEqual({
      cameraX: 10,
      cameraY: 13,
      cameraZ: 17,
      focusX: 1,
      focusY: 2,
      focusZ: 3,
    });
  });

  it("flies smoothly unless reduced motion requests an instant cut", () => {
    const start = vi.fn();
    const animatedController = createCameraController({ start }, false);
    animatedController.flyTo({ x: 1, y: 0, z: -2 });
    expect(start).toHaveBeenCalledWith({
      to: getCameraRigPose({ x: 1, y: 0, z: -2 }, 0),
      immediate: false,
    });

    const instantStart = vi.fn();
    createCameraController({ start: instantStart }, true).flyTo({ x: 0, y: 1, z: 0 });
    expect(instantStart).toHaveBeenCalledWith({
      to: getCameraRigPose({ x: 0, y: 1, z: 0 }, 0),
      immediate: true,
    });
  });

  it("flyTo keeps the given yaw (MFW-57)", () => {
    const start = vi.fn();
    createCameraController({ start }, false).flyTo({ x: 1, y: 2, z: 3 }, 0.5);
    expect(start).toHaveBeenCalledWith({ to: { focusX: 1, focusY: 2, focusZ: 3, yawRad: 0.5 }, immediate: false });
    expect(start.mock.calls[0][0].to.yawRad).toBe(0.5);
  });

  it.each([false, true])("rotateTo passes the pose, immediate = reduced motion (%s)", (reduced) => {
    const start = vi.fn();
    const pose = { focusX: 1, focusY: 0, focusZ: -1, yawRad: Math.PI / 4 };
    createCameraController({ start }, reduced).rotateTo(pose);
    expect(start).toHaveBeenCalledWith({ to: pose, immediate: reduced });
  });
});
