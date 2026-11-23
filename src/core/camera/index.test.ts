import { describe, expect, it, vi } from "vitest";
import {
  createCameraController,
  getCameraFlightPose,
  updateHighlightPosition,
} from "./index";

describe("camera flight and target highlight", () => {
  it("builds a clear camera pose focused on the target", () => {
    expect(getCameraFlightPose({ x: 1, y: 2, z: 3 })).toEqual({
      cameraX: 5.5,
      cameraY: 7.5,
      cameraZ: 10,
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
      to: getCameraFlightPose({ x: 1, y: 0, z: -2 }),
      immediate: false,
    });

    const instantStart = vi.fn();
    createCameraController({ start: instantStart }, true).flyTo({ x: 0, y: 1, z: 0 });
    expect(instantStart).toHaveBeenCalledWith({
      to: getCameraFlightPose({ x: 0, y: 1, z: 0 }),
      immediate: true,
    });
  });

  it("updates the highlight position from each latest target position", () => {
    const set = vi.fn();
    const ringPosition = { set };
    updateHighlightPosition({ x: 1, y: 2, z: 3 }, ringPosition);
    updateHighlightPosition({ x: 4, y: 5, z: 6 }, ringPosition);
    expect(set).toHaveBeenNthCalledWith(1, 1, 2.04, 3);
    expect(set).toHaveBeenNthCalledWith(2, 4, 5.04, 6);
  });
});
