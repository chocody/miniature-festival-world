import { SCENE_CAMERA_ZOOM, SCENE_CAMERA_ZOOM_MAX, SCENE_FRAME_VIEW_SIZE, SCENE_MAX_VIEW_SIZE } from "@/config/camera.config";

export interface ViewportPixelSize {
  readonly width: number;
  readonly height: number;
}

/** A view-plane rectangle (world units) that the framed zoom keeps fully visible. */
export interface ViewFrameSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Base orthographic zoom (CSS px per world unit) for a viewport: the largest zoom that keeps SCENE_FRAME_VIEW_SIZE (view-plane
 * rectangle centred on the camera focus) fully visible ("contain"), capped at SCENE_CAMERA_ZOOM_MAX — but never so low that the
 * viewport shows more than SCENE_MAX_VIEW_SIZE (MFW-68). The floor beats the cap, so a huge screen gets a closer view instead of
 * unbounded world, and an extreme aspect ratio crops the frame instead of showing past the ground. Width or height not finite or
 * ≤ 0 → SCENE_CAMERA_ZOOM (size unknown, e.g. jsdom). `frame` replaces SCENE_FRAME_VIEW_SIZE for another scene (MFW-93: the
 * Christmas tree); the cap, the floor and the fallback stay the same.
 */
export function getFramedCameraZoom(size: ViewportPixelSize, frame: ViewFrameSize = SCENE_FRAME_VIEW_SIZE): number {
  const { width, height } = size;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return SCENE_CAMERA_ZOOM;
  const contain = Math.min(SCENE_CAMERA_ZOOM_MAX, width / frame.width, height / frame.height);
  const floor = Math.max(width / SCENE_MAX_VIEW_SIZE.width, height / SCENE_MAX_VIEW_SIZE.height);
  return Math.max(contain, floor);
}
