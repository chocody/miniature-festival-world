// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AdditiveBlending } from "three";
import { SCENE_OBJECT_NAMES } from "@/components/canvas3d/sceneObjectNames";
import { INSPECT_POPUP_COPY } from "@/config/inspect.config";
import { MIN_TOUCH_TARGET_PX } from "@/config/customizer.config";
import { DRAG_START_DISTANCE_PX } from "@/config/interaction.config";
import { KRATHONG_MARK_CUE, SCENE_TAP_HINT_SEEN_VALUE, SCENE_TAP_HINT_STORAGE_KEY } from "@/config/gimmicks.config";
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
    // MFW-67 ring / halo checks
    expect(probe.E2E_TAP_RIPPLE_NAME).toBe(SCENE_OBJECT_NAMES.ripples);
    expect(probe.E2E_LAMP_GLOW_NAME).toBe(SCENE_OBJECT_NAMES.lampGlows);
    expect(probe.E2E_KRATHONG_MARK_NAME).toBe(SCENE_OBJECT_NAMES.krathongMarkCue);
    expect(probe.E2E_KRATHONG_MARK_SCALE).toBe(KRATHONG_MARK_CUE.scale);
    expect(probe.E2E_ADDITIVE_BLENDING).toBe(AdditiveBlending);
    // MFW-60 scene reactions
    expect(probe.E2E_PROP_TAP_PREFIX).toBe(SCENE_OBJECT_NAMES.propTapPrefix);
    expect(probe.E2E_LAND_NAMES).toEqual([SCENE_OBJECT_NAMES.ground, SCENE_OBJECT_NAMES.bankLeft, SCENE_OBJECT_NAMES.bankRight]);
    expect(probe.E2E_FIREWORK_NAME).toBe(SCENE_OBJECT_NAMES.fireworks);
    expect(probe.E2E_WINDOW_GLOW_NAME).toBe(SCENE_OBJECT_NAMES.windowGlows);
    expect(probe.E2E_SKY_LANTERN_NAME).toBe(SCENE_OBJECT_NAMES.skyLanterns);
    expect(probe.E2E_DRAG_START_DISTANCE_PX).toBe(DRAG_START_DISTANCE_PX);
    // MFW-72 scene reactions part 2
    expect(probe.E2E_CHIMNEY_SMOKE_NAME).toBe(SCENE_OBJECT_NAMES.chimneySmoke);
    expect(probe.E2E_FALLING_LEAVES_NAME).toBe(SCENE_OBJECT_NAMES.fallingLeaves);
  });
});
