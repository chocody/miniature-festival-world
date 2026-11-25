import type { LightPresetSpec } from "@/config/look.config";
import { hexToLinearRgb, LUMINANCE_WEIGHTS } from "@/core/math/relativeLuminance";

export type Vec3Tuple = readonly [number, number, number];

const HALF = 0.5;

function normalize(v: Vec3Tuple, what: string): Vec3Tuple {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (!(length > 0) || !Number.isFinite(length)) throw new RangeError(`${what} must be a non-zero finite vector`);
  return [v[0] / length, v[1] / length, v[2] / length];
}

/**
 * AC3 readability proxy (MFW-47): Lambert estimate of the linear luminance of a matte surface of albedo `albedoHex`
 * with normal `normal` under a light rig (hemisphere + ambient + directional key toward the origin). Linear light,
 * before tone mapping, no shadows: E = hemi·lerp(ground, sky, n.y/2 + 1/2) + ambient + key·max(0, n·l); lit = albedo·E/π.
 */
export function estimateLitLuminance(
  albedoHex: string,
  rig: Pick<LightPresetSpec, "hemisphere" | "ambient" | "key">,
  normal: Vec3Tuple,
): number {
  const n = normalize(normal, "normal");
  const l = normalize(rig.key.position, "key.position");
  const albedo = hexToLinearRgb(albedoHex);
  const sky = hexToLinearRgb(rig.hemisphere.skyColor);
  const ground = hexToLinearRgb(rig.hemisphere.groundColor);
  const ambient = hexToLinearRgb(rig.ambient.color);
  const key = hexToLinearRgb(rig.key.color);
  const t = n[1] * HALF + HALF;
  const lambert = Math.max(0, n[0] * l[0] + n[1] * l[1] + n[2] * l[2]);
  const lit = [0, 1, 2].map((c) => {
    const hemi = ground[c] + (sky[c] - ground[c]) * t;
    const e = rig.hemisphere.intensity * hemi + rig.ambient.intensity * ambient[c] + rig.key.intensity * key[c] * lambert;
    return (albedo[c] * e) / Math.PI;
  });
  return LUMINANCE_WEIGHTS.r * lit[0] + LUMINANCE_WEIGHTS.g * lit[1] + LUMINANCE_WEIGHTS.b * lit[2];
}
