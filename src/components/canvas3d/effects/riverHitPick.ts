import { Object3D, Ray, Vector3 } from "three";
import { SCENE_OBJECT_NAMES } from "../sceneObjectNames";

const scratch = new Vector3();

function isTapProxyName(name: string): boolean {
  return name.startsWith(SCENE_OBJECT_NAMES.riverHitPrefix) || name.startsWith(SCENE_OBJECT_NAMES.lampTapPrefix);
}

/**
 * True when any of R3F's intersections is a river-krathong or lamp tap proxy. A proxy is centred on the water plane, so its lower
 * front half sits BELOW the water: the ray meets the water first and the water would take the tap (a ripple instead of the popup).
 * The water handler uses this to defer to the proxy. Render-time only.
 */
export function hasTapProxyHit(intersections: unknown): boolean {
  if (!Array.isArray(intersections)) return false;
  for (const entry of intersections as ReadonlyArray<{ eventObject?: unknown; object?: unknown } | null>) {
    const candidate = entry?.eventObject ?? entry?.object;
    if (candidate instanceof Object3D && isTapProxyName(candidate.name)) return true;
  }
  return false;
}

/**
 * Id of the river krathong whose hit-proxy centre is nearest the click ray, among R3F's intersections. Null when
 * `intersections` is not an array, `ray` is not a three Ray, or no intersection is a river hit proxy. Render-time only.
 */
export function pickNearestRiverHitId(intersections: unknown, ray: unknown): string | null {
  if (!Array.isArray(intersections) || !(ray instanceof Ray)) return null;
  const prefix = SCENE_OBJECT_NAMES.riverHitPrefix;
  let bestName: string | null = null;
  let bestDistSq = Infinity;
  for (const entry of intersections as ReadonlyArray<{ eventObject?: unknown; object?: unknown } | null>) {
    const candidate = entry?.eventObject ?? entry?.object;
    if (!(candidate instanceof Object3D) || !candidate.name.startsWith(prefix)) continue;
    const distSq = ray.distanceSqToPoint(candidate.getWorldPosition(scratch));
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestName = candidate.name;
    }
  }
  return bestName === null ? null : bestName.slice(prefix.length);
}
