/** = SCENE_CAMERA_ZOOM: the zoom the px offsets of older specs were probed at. stage-e2e-fixtures.test.ts checks every literal here. */
export const E2E_PROBED_CAMERA_ZOOM = 52;
/** = SCENE_FRAME_VIEW_SIZE / SCENE_CAMERA_ZOOM_MAX / SCENE_MAX_VIEW_SIZE (src/config/camera.config.ts). */
export const E2E_SCENE_FRAME_VIEW_SIZE = { width: 5.4, height: 4 } as const;
export const E2E_SCENE_CAMERA_ZOOM_MAX = 143;
export const E2E_SCENE_MAX_VIEW_SIZE = { width: 20, height: 13 } as const;
/** = PINCH_ZOOM_MIN (src/config/interaction.config.ts). */
export const E2E_PINCH_ZOOM_MIN = 0.75;
/** = LIGHT_PRESET_STORAGE_KEY / LIGHT_PRESETS.DAY|NIGHT.background (src/config/look.config.ts). */
export const E2E_LIGHT_PRESET_STORAGE_KEY = "mfw:lightPreset:v1";
export const E2E_SCENE_BACKGROUNDS = { DAY: "#D8E4CF", NIGHT: "#2E3E63" } as const;
/** = TIER_MAX_RENDER_PIXELS.LOW (src/config/performance.config.ts). */
export const E2E_LOW_MAX_RENDER_PIXELS = 390 * 844;
/** Technical (MFW-68): three converts a Color background exactly (±1 from 8-bit rounding, no tone mapping on the clear colour). */
export const E2E_BACKGROUND_CHANNEL_TOLERANCE = 2;
/** Technical (MFW-68): keeps a corner sample on the canvas even with the 1-px box tolerance of expectFillsViewport. */
export const E2E_COVERAGE_INSET_PX = 2;
/** = FLAT_RIVER_VIEW_HEIGHT_PX: the 2D map height the Find My tolerance was set at. */
export const E2E_FLAT_RIVER_PROBED_HEIGHT_PX = 256;
/**
 * World point on the water, as a px offset from the viewport centre at E2E_PROBED_CAMERA_ZOOM (moved from scene-gimmicks.spec.ts).
 * Scaled to the MFW-68 framing it lands ≈ 17 px from the left edge at 360×640; same world point.
 */
export const E2E_WATER_TAP_OFFSET_PX = { x: -127, y: -40 } as const;
/** Backlog 10.2 AC4 viewports; wide = at or above Tailwind md (768 px). */
export const E2E_STAGE_VIEWPORTS = [
  { width: 360, height: 640, wide: false },
  { width: 390, height: 844, wide: false },
  { width: 1440, height: 900, wide: true },
] as const;
/** Mirror of getFramedCameraZoom for e2e (src/ is not imported into Playwright): contain the frame, capped, then the max-view floor. */
export function e2eFramedZoom(width: number, height: number): number {
  const contain = Math.min(E2E_SCENE_CAMERA_ZOOM_MAX, width / E2E_SCENE_FRAME_VIEW_SIZE.width, height / E2E_SCENE_FRAME_VIEW_SIZE.height);
  const floor = Math.max(width / E2E_SCENE_MAX_VIEW_SIZE.width, height / E2E_SCENE_MAX_VIEW_SIZE.height);
  return Math.max(contain, floor);
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const HEX_RADIX = 16;
const CHANNEL_OFFSETS = [1, 3, 5] as const;

/** True when every channel of `rgb` is within `tolerance` of `backgroundHex` ("#RRGGBB"); anything else throws a RangeError. */
export function isBackgroundPixel(
  rgb: readonly [number, number, number],
  backgroundHex: string,
  tolerance: number = E2E_BACKGROUND_CHANNEL_TOLERANCE,
): boolean {
  if (!HEX_COLOR.test(backgroundHex)) throw new RangeError(`background must be #RRGGBB, got ${backgroundHex}`);
  return CHANNEL_OFFSETS.every(
    (offset, i) => Math.abs(rgb[i] - parseInt(backgroundHex.slice(offset, offset + 2), HEX_RADIX)) <= tolerance,
  );
}

export interface CoverageSamplePoint {
  readonly name: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "centre";
  readonly x: number;
  readonly y: number;
}

/** The four corners (inset by E2E_COVERAGE_INSET_PX) and the centre of a width × height viewport, in CSS px. */
export function coverageSamplePoints(width: number, height: number): readonly CoverageSamplePoint[] {
  const left = E2E_COVERAGE_INSET_PX;
  const top = E2E_COVERAGE_INSET_PX;
  const right = width - 1 - E2E_COVERAGE_INSET_PX;
  const bottom = height - 1 - E2E_COVERAGE_INSET_PX;
  return [
    { name: "top-left", x: left, y: top },
    { name: "top-right", x: right, y: top },
    { name: "bottom-left", x: left, y: bottom },
    { name: "bottom-right", x: right, y: bottom },
    { name: "centre", x: Math.floor(width / 2), y: Math.floor(height / 2) },
  ];
}
/**
 * Viewport of the HIGH-tier functional specs (MFW-54): the smallest AC phone. The scene now fills the viewport, and SwiftShader
 * (software WebGL in e2e) cannot hold HIGH on a full-screen desktop canvas (1280×720 = 5× the old 704×256 box): the owner's FPS
 * thresholds would drop it to FALLBACK_2D mid-test. Same precedent as perf-audit.spec.ts. The desktop layout is covered by
 * full-screen-stage.spec.ts.
 */
export const E2E_SWIFTSHADER_3D_VIEWPORT = { width: 360, height: 640 } as const;
