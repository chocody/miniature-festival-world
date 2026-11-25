import { SCENE_CAMERA_ZOOM, SCENE_CAMERA_ZOOM_MAX, SCENE_FRAME_VIEW_SIZE } from "@/config/camera.config";

export interface ViewportPixelSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Base orthographic zoom (CSS px per world unit) for a viewport: the largest zoom that keeps SCENE_FRAME_VIEW_SIZE (view-plane
 * rectangle centred on the camera focus) fully visible ("contain"), capped at SCENE_CAMERA_ZOOM_MAX. Width or height not finite
 * or ≤ 0 → SCENE_CAMERA_ZOOM (size unknown, e.g. jsdom).
 */
export function getFramedCameraZoom(size: ViewportPixelSize): number {
  const { width, height } = size;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return SCENE_CAMERA_ZOOM;
  return Math.min(SCENE_CAMERA_ZOOM_MAX, width / SCENE_FRAME_VIEW_SIZE.width, height / SCENE_FRAME_VIEW_SIZE.height);
}
