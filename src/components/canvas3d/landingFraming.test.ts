// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createCameraRigState } from "@/core/camera";
import { createRigAt, pierFramingPose } from "./landingFraming";

describe("landing framing (MFW-154)", () => {
  it("LF1 the pier focus world position with the default yaw", () => {
    expect(pierFramingPose({ x: 1.5, y: 0.3, z: -2 }, 10, -4)).toEqual({ focusX: 11.5, focusY: 0.3, focusZ: -6, yawRad: 0 });
  });

  it("LF2 createRigAt seeds only the pose", () => {
    expect(createRigAt(null)).toEqual(createCameraRigState());
    const pose = { focusX: 3, focusY: 0.25, focusZ: -7, yawRad: 0.4 };
    const rig = createRigAt(pose);
    expect(rig).toEqual({ ...createCameraRigState(), ...pose, phase: "MANUAL" });
  });
});
