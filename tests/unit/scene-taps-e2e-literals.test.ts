// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SCENE_OBJECT_NAMES } from "@/components/canvas3d/sceneObjectNames";
import { INSPECT_POPUP_COPY } from "@/config/inspect.config";
import { MIN_TOUCH_TARGET_PX } from "@/config/customizer.config";
import { SCENE_TAP_HINT_SEEN_VALUE, SCENE_TAP_HINT_STORAGE_KEY } from "@/config/gimmicks.config";
import { TIER_PIN_QUERY_PARAM, TIER_PIN_QUERY_VALUE } from "@/config/perfProbe.config";
import * as probe from "../e2e/helpers/sceneProbe";

describe("scene-taps e2e literals", () => {
  it("match the app constants", () => {
    expect(probe.E2E_MIN_TOUCH_TARGET_PX).toBe(MIN_TOUCH_TARGET_PX);
    expect(probe.E2E_WATER_NAME).toBe(SCENE_OBJECT_NAMES.water);
    expect(probe.E2E_LAMP_TAP_PREFIX).toBe(SCENE_OBJECT_NAMES.lampTapPrefix);
    expect(probe.E2E_RIVER_HIT_PREFIX).toBe(SCENE_OBJECT_NAMES.riverHitPrefix);
    expect(probe.E2E_TAP_HINT_STORAGE_KEY).toBe(SCENE_TAP_HINT_STORAGE_KEY);
    expect(probe.E2E_TAP_HINT_SEEN_VALUE).toBe(SCENE_TAP_HINT_SEEN_VALUE);
    expect(probe.E2E_INSPECT_DIALOG_TITLE).toBe(INSPECT_POPUP_COPY.dialogTitle);
    expect(probe.E2E_PINNED_TIER_URL).toBe(`/?${TIER_PIN_QUERY_PARAM}=${TIER_PIN_QUERY_VALUE}`);
  });
});
