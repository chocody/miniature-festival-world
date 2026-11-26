import { LIGHT_PRESETS, LOOK_RENDERER, type LightPresetId, type LightPresetSpec } from "@/config/look.config";
import {
  hexToLinearRgb,
  SRGB_CHANNEL_MAX,
  SRGB_GAMMA_EXPONENT,
  SRGB_GAMMA_OFFSET,
  SRGB_GAMMA_SCALE,
  SRGB_LINEAR_DIVISOR,
  SRGB_LINEAR_THRESHOLD,
} from "@/core/math/relativeLuminance";
import type { FlatPoint2D } from "./flatPath";
import { projectModelPoint, type FlatSpriteView } from "./spriteProjection";

/**
 * 2D colour = the 3D lit colour, estimated per face (MFW-51): Lambert under the light preset (hemisphere + ambient + key, the
 * formula of estimateLitLuminance) + emissive, then three's PBR Neutral tone mapping, then sRGB. One preset config drives both
 * views (no 2D palette). Pure and three-free; runs only when the static art or a layer set is (re)built, never per frame.
 */
export type FlatVec3 = readonly [number, number, number];
export interface FlatSurfaceInput {
  readonly albedo: string; // "#rrggbb"
  readonly normal: FlatVec3; // world space, non-zero
  readonly emissive?: string; // "#rrggbb"
  readonly emissiveIntensity?: number; // ≥ 0, default 0
  readonly toneMapped?: boolean; // default true; false = KRATHONG_FLAME_GLOW (flame)
}

// Technical: Khronos PBR Neutral as in three's tonemapping_pars_fragment (NeutralToneMapping).
const NEUTRAL_START_COMPRESSION = 0.8 - 0.04;
const NEUTRAL_DESATURATION = 0.15;
const NEUTRAL_TOE_THRESHOLD = 0.08;
const NEUTRAL_TOE_COEFFICIENT = 6.25;
const NEUTRAL_OFFSET = 0.04;

const HALF = 0.5;
const HEX_RADIX = 16;
const HEX_DIGITS = 2;
const DEGENERATE_LENGTH = 1e-9;

/** three's NeutralToneMapping (exposure applied first). */
export function neutralToneMap(rgb: FlatVec3, exposure: number): [number, number, number] {
  let r = rgb[0] * exposure;
  let g = rgb[1] * exposure;
  let b = rgb[2] * exposure;
  const x = Math.min(r, g, b);
  const offset = x < NEUTRAL_TOE_THRESHOLD ? x - NEUTRAL_TOE_COEFFICIENT * x * x : NEUTRAL_OFFSET;
  r -= offset;
  g -= offset;
  b -= offset;
  const peak = Math.max(r, g, b);
  if (peak < NEUTRAL_START_COMPRESSION) return [r, g, b];
  const d = 1 - NEUTRAL_START_COMPRESSION;
  const newPeak = 1 - (d * d) / (peak + d - NEUTRAL_START_COMPRESSION);
  const k = newPeak / peak;
  r *= k;
  g *= k;
  b *= k;
  const mix = 1 - 1 / (NEUTRAL_DESATURATION * (peak - newPeak) + 1);
  return [r + (newPeak - r) * mix, g + (newPeak - g) * mix, b + (newPeak - b) * mix];
}

function normalize(v: FlatVec3, what: string): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (!(length > 0) || !Number.isFinite(length)) throw new RangeError(`${what} must be a non-zero finite vector`);
  return [v[0] / length, v[1] / length, v[2] / length];
}

function encodeSrgbChannel(linear: number): string {
  const c = Math.min(1, Math.max(0, linear));
  const s =
    c <= SRGB_LINEAR_THRESHOLD / SRGB_LINEAR_DIVISOR
      ? c * SRGB_LINEAR_DIVISOR
      : SRGB_GAMMA_SCALE * c ** (1 / SRGB_GAMMA_EXPONENT) - SRGB_GAMMA_OFFSET;
  return Math.round(Math.min(1, Math.max(0, s)) * SRGB_CHANNEL_MAX)
    .toString(HEX_RADIX)
    .padStart(HEX_DIGITS, "0");
}

/** Lit "#rrggbb" of a matte surface: Lambert (hemisphere + ambient + key) + emissive, Neutral tone map unless toneMapped false. */
export function flatSurfaceColor(input: FlatSurfaceInput, rig: Pick<LightPresetSpec, "hemisphere" | "ambient" | "key">): string {
  const n = normalize(input.normal, "normal");
  const l = normalize(rig.key.position, "key.position");
  const albedo = hexToLinearRgb(input.albedo);
  const sky = hexToLinearRgb(rig.hemisphere.skyColor);
  const ground = hexToLinearRgb(rig.hemisphere.groundColor);
  const ambient = hexToLinearRgb(rig.ambient.color);
  const key = hexToLinearRgb(rig.key.color);
  const emissive = input.emissive === undefined ? null : hexToLinearRgb(input.emissive);
  const emissiveIntensity = input.emissiveIntensity ?? 0;
  if (!Number.isFinite(emissiveIntensity) || emissiveIntensity < 0) throw new RangeError("emissiveIntensity must be finite and ≥ 0");
  const t = n[1] * HALF + HALF;
  const lambert = Math.max(0, n[0] * l[0] + n[1] * l[1] + n[2] * l[2]);
  const lin: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const e =
      rig.hemisphere.intensity * (ground[c] + (sky[c] - ground[c]) * t) +
      rig.ambient.intensity * ambient[c] +
      rig.key.intensity * key[c] * lambert;
    lin[c] = (albedo[c] * e) / Math.PI + (emissive === null ? 0 : emissive[c] * emissiveIntensity);
  }
  const out = (input.toneMapped ?? true) ? neutralToneMap(lin, LOOK_RENDERER.toneMappingExposure) : lin;
  return "#" + encodeSrgbChannel(out[0]) + encodeSrgbChannel(out[1]) + encodeSrgbChannel(out[2]);
}

/** three rotation.y of a vector: (x cos + z sin, y, −x sin + z cos). */
export function rotateYaw(v: FlatVec3, yawRad: number): FlatVec3 {
  const c = Math.cos(yawRad);
  const s = Math.sin(yawRad);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

export interface FlatLightContext {
  readonly preset: LightPresetId;
  readonly rig: Readonly<LightPresetSpec>;
  readonly view: FlatSpriteView;
  readonly cameraDir: FlatVec3; // (sinA·cosφ, sinφ, cosA·cosφ): toward the camera
  readonly cameraHorizontalDir: FlatVec3; // (sinA, 0, cosA)
  readonly keyDir: FlatVec3; // normalize(rig.key.position)
  readonly keyScreenDir: FlatPoint2D; // unit 2D direction of keyDir on screen (y down); (0, −1) if degenerate
  lit(albedo: string, normal: FlatVec3, emissive?: string, emissiveIntensity?: number, toneMapped?: boolean): string;
}

/** Lighting context of one sprite view under one preset. */
export function createFlatLightContext(view: FlatSpriteView, preset: LightPresetId): FlatLightContext {
  const rig = LIGHT_PRESETS[preset];
  const sinA = Math.sin(view.azimuthRad);
  const cosA = Math.cos(view.azimuthRad);
  const sinPhi = Math.sin(view.elevationRad);
  const cosPhi = Math.cos(view.elevationRad);
  const keyDir = normalize(rig.key.position, "key.position");
  const k = projectModelPoint(keyDir, { azimuthRad: view.azimuthRad, elevationRad: view.elevationRad, modelYawRad: 0 });
  const kl = Math.hypot(k.x, k.y);
  const keyScreenDir = kl < DEGENERATE_LENGTH ? { x: 0, y: -1 } : { x: k.x / kl, y: k.y / kl };
  return Object.freeze({
    preset,
    rig,
    view,
    cameraDir: Object.freeze([sinA * cosPhi, sinPhi, cosA * cosPhi] as const),
    cameraHorizontalDir: Object.freeze([sinA, 0, cosA] as const),
    keyDir: Object.freeze(keyDir) as FlatVec3,
    keyScreenDir: Object.freeze(keyScreenDir),
    lit: (albedo: string, normal: FlatVec3, emissive?: string, emissiveIntensity?: number, toneMapped?: boolean) =>
      flatSurfaceColor({ albedo, normal, emissive, emissiveIntensity, toneMapped }, rig),
  });
}
