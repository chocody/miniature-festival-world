/** = SCENE_CAMERA_ZOOM: the zoom the px offsets of older specs were probed at. stage-e2e-fixtures.test.ts checks every literal here. */
export const E2E_PROBED_CAMERA_ZOOM = 52;
/** = SCENE_FRAME_VIEW_SIZE / SCENE_CAMERA_ZOOM_MAX (src/config/camera.config.ts). */
export const E2E_SCENE_FRAME_VIEW_SIZE = { width: 7.4, height: 4.9 } as const;
export const E2E_SCENE_CAMERA_ZOOM_MAX = 104;
/** = FLAT_RIVER_VIEW_HEIGHT_PX: the 2D map height the Find My tolerance was set at. */
export const E2E_FLAT_RIVER_PROBED_HEIGHT_PX = 256;
/** World point on the water, as a px offset from the viewport centre at E2E_PROBED_CAMERA_ZOOM (moved from scene-gimmicks.spec.ts). */
export const E2E_WATER_TAP_OFFSET_PX = { x: -127, y: -40 } as const;
/** Backlog 10.2 AC4 viewports; wide = at or above Tailwind md (768 px). */
export const E2E_STAGE_VIEWPORTS = [
  { width: 360, height: 640, wide: false },
  { width: 390, height: 844, wide: false },
  { width: 1440, height: 900, wide: true },
] as const;
/** Mirror of getFramedCameraZoom for e2e (src/ is not imported into Playwright). */
export function e2eFramedZoom(width: number, height: number): number {
  return Math.min(E2E_SCENE_CAMERA_ZOOM_MAX, width / E2E_SCENE_FRAME_VIEW_SIZE.width, height / E2E_SCENE_FRAME_VIEW_SIZE.height);
}
/**
 * Viewport of the HIGH-tier functional specs (MFW-54): the smallest AC phone. The scene now fills the viewport, and SwiftShader
 * (software WebGL in e2e) cannot hold HIGH on a full-screen desktop canvas (1280×720 = 5× the old 704×256 box): the owner's FPS
 * thresholds would drop it to FALLBACK_2D mid-test. Same precedent as perf-audit.spec.ts. The desktop layout is covered by
 * full-screen-stage.spec.ts.
 */
export const E2E_SWIFTSHADER_3D_VIEWPORT = { width: 360, height: 640 } as const;
