// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SCENE_OBJECT_NAMES } from "@/components/canvas3d/sceneObjectNames";
import { WORLD_VIEW_ROTATE_BUTTON_COPY } from "@/config/interaction.config";
import * as probe from "../e2e/helpers/cameraProbe";

describe("camera-travel e2e literals (MFW-57)", () => {
  it("match the app constants", () => {
    expect(probe.E2E_WORLD_VIEW_NAME).toBe(SCENE_OBJECT_NAMES.worldView);
    expect(probe.E2E_WORLD_ROTATE_BUTTON_NAME).toBe(WORLD_VIEW_ROTATE_BUTTON_COPY.ariaLabel);
  });
});
