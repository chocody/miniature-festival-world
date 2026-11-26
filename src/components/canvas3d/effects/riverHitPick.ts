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

/** MFW-60: invisible tap proxy of a house, tree, bush, reed, rock or villager. */
export function isPropTapProxyName(name: string): boolean {
  return name.startsWith(SCENE_OBJECT_NAMES.propTapPrefix);
}

function intersectionObject(entry: { eventObject?: unknown; object?: unknown } | null): Object3D | null {
  const candidate = entry?.object ?? entry?.eventObject;
  return candidate instanceof Object3D ? candidate : null;
}

/** Any river-krathong, lamp or prop tap proxy among R3F's intersections (MFW-60: land defers to a proxy further along the ray). */
export function hasAnyTapProxyHit(intersections: unknown): boolean {
  if (!Array.isArray(intersections)) return false;
  for (const entry of intersections as ReadonlyArray<{ eventObject?: unknown; object?: unknown } | null>) {
    const o = intersectionObject(entry);
    if (o !== null && (isTapProxyName(o.name) || isPropTapProxyName(o.name))) return true;
  }
  return false;
}

/** Name of the first intersection (R3F sorts them by distance) whose object is NOT a tap proxy; null if none or not an array. */
export function nearestSurfaceName(intersections: unknown): string | null {
  if (!Array.isArray(intersections)) return null;
  for (const entry of intersections as ReadonlyArray<{ eventObject?: unknown; object?: unknown } | null>) {
    const o = intersectionObject(entry);
    if (o !== null && !isTapProxyName(o.name) && !isPropTapProxyName(o.name)) return o.name;
  }
  return null;
}

/** The R3F click fields a prop proxy reads (ThreeEvent<MouseEvent> fits). */
export interface PropTapEventLike {
  readonly intersections?: unknown;
  readonly ray?: unknown;
  readonly eventObject?: unknown;
}

/**
 * Tap priority rule 2 (MFW-60, look doc §16): a prop proxy takes the tap unless (a) a river-krathong or lamp proxy is on the ray (they
 * beat props), or (b) the nearest real surface on the ray is the water and the ray misses the prop's body sphere (centre = the proxy's
 * world position, radius `bodyRadius`): the river keeps its taps (backlog story 9-4 AC5). Render-time only.
 */
export function propProxyTakesTap(event: PropTapEventLike, bodyRadius: number): boolean {
  if (hasTapProxyHit(event.intersections)) return false;
  if (nearestSurfaceName(event.intersections) !== SCENE_OBJECT_NAMES.water) return true;
  if (!(event.ray instanceof Ray) || !(event.eventObject instanceof Object3D)) return false;
  return event.ray.distanceSqToPoint(event.eventObject.getWorldPosition(scratch)) <= bodyRadius * bodyRadius;
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
