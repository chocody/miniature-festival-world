// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SCENE_OBJECT_NAMES } from "@/components/canvas3d/sceneObjectNames";
import { INSPECT_POPUP_COPY } from "@/config/inspect.config";
import { MIN_TOUCH_TARGET_PX } from "@/config/customizer.config";
import { SCENE_TAP_HINT_SEEN_VALUE, SCENE_TAP_HINT_STORAGE_KEY } from "@/config/gimmicks.config";
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
  });
});

describe("stable-target allowance (time-aware, MFW-47)", () => {
  it("is the fixed 4 px for reads up to 250 ms apart and scales with slower reads only", () => {
    expect(probe.stableTargetAllowancePx(0)).toBe(4);
    expect(probe.stableTargetAllowancePx(250)).toBe(4);
    expect(probe.stableTargetAllowancePx(500)).toBe(8);
  });
  it("still rejects a camera flight (≥ 100 px/s) at any read spacing", () => {
    for (const ms of [100, 250, 500, 1000, 2000]) expect((100 * ms) / 1000).toBeGreaterThan(probe.stableTargetAllowancePx(ms));
  });
});
