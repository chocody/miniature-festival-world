import type { RenderTier } from "./performance.config";
import { RIVER_KRATHONG_SCALE } from "./riverFlow.config";

/**
 * Shared look v2 (MFW-47, backlog 9.1): palette, light presets and soft shadows taken from
 * docs/spec/assets/loy-krathong-look-ref.png. Documented in docs/design/loy-krathong-look.md (config wins).
 * Three-free and React-free so every model / scene card (9.2–9.5) can import it.
 */

/**
 * Palette sampled from docs/spec/assets/loy-krathong-look-ref.png (MFW-47). Canonical uppercase #RRGGBB.
 * DRAFT (owner reviews it from the PR screenshots). Keys marked "reserved" are for later cards.
 */
export const LOOK_PALETTE = Object.freeze({
  grass: "#A7BA96", // lit land (ref: top-left and right land)
  grassShade: "#5E6D54", // land in contact shade under trees (ref) — reserved for 9.3
  water: "#90AAAE", // river body (ref)
  waterLight: "#ACC3C7", // river highlight (ref, near-bank sparkle) — used since MFW-49 (water highlights)
  waterDeep: "#546970", // water in shade by the bank / under the pier (ref) — used since MFW-49 (window glass)
  wallCream: "#E4D4B3", // house walls (ref)
  roofTeal: "#718C86", // left house roof (ref)
  roofTerracotta: "#D1936B", // right house roof (ref) — used since MFW-49 (gable roofs)
  doorWood: "#B9815A", // doors, crates (ref) — used since MFW-49 (house doors); krathong incense sticks (MFW-48)
  woodLight: "#D4AE82", // pier deck planks (ref)
  woodDark: "#725F46", // pier posts, lamp posts (ref)
  trunk: "#7C5D40", // tree trunks (ref)
  canopy: "#8CA682", // tree canopy, lit side (ref)
  canopyShade: "#4E644E", // tree canopy shade side (ref) — reserved for 9.3
  leafLight: "#8DA667", // krathong banana leaf, lit (ref) — banana-trunk base (MFW-48)
  leafDark: "#3F5B35", // krathong banana leaf, shade (ref) — reserved for 9.2
  flowerCoral: "#E19A7C", // krathong flower petals (ref) — reserved for 9.2
  flowerCream: "#EBDFC4", // krathong flower petals, pale (ref) — reserved for 9.2
  flowerYellow: "#F2D585", // flower centres / lantern body (ref) — krathong flower centres (MFW-48)
  candleWax: "#D5B279", // candle body (ref) — reserved for 9.2
  flameCore: "#FDF7C6", // flame core (ref) — krathong flame albedo (MFW-48)
  flameHalo: "#F9EAA6", // flame halo (ref) — reserved for 9.2
  lanternGlow: "#FFC46B", // warm lamp emissive (= existing LAMP_GLOW_LOOK colour)
  shadowTint: "#40564A", // blob-shadow tint: dark sage, never black (ref contact shadows #5E6D54 / #475C60)
  daySky: "#D8E4CF", // DAY canvas background (pale sage haze)
  nightSky: "#2E3E63", // NIGHT canvas background (deep periwinkle, not black)
  stone: "#B9B7A8", // rocks; not in the reference, DRAFT (MFW-49)
});

export const LIGHT_PRESET_IDS = ["DAY", "NIGHT"] as const;
export type LightPresetId = (typeof LIGHT_PRESET_IDS)[number];
/** "AUTO" = follow the device's local time (owner decision, open question 32). */
export type LightPresetChoice = "AUTO" | LightPresetId;
export const LIGHT_PRESET_CHOICES: readonly LightPresetChoice[] = Object.freeze(["AUTO", "DAY", "NIGHT"] as const);

export interface LightPresetSpec {
  readonly background: string;
  readonly hemisphere: { readonly skyColor: string; readonly groundColor: string; readonly intensity: number };
  readonly ambient: { readonly color: string; readonly intensity: number };
  readonly key: {
    readonly color: string;
    readonly intensity: number;
    readonly position: [number, number, number]; // directional light position, target = origin
    readonly shadow: { readonly intensity: number; readonly radius: number; readonly bias: number; readonly normalBias: number };
  };
  /** Multiplies the own-krathong candle point light (TOY_SCENE_LIGHTING.candle.intensity is the NIGHT base). */
  readonly candle: { readonly intensityScale: number };
  /** Emissive intensity written to the shared krathong flame material. */
  readonly flame: { readonly emissiveIntensity: number };
}

function freezePreset(spec: LightPresetSpec): Readonly<LightPresetSpec> {
  Object.freeze(spec.hemisphere);
  Object.freeze(spec.ambient);
  Object.freeze(spec.key.position);
  Object.freeze(spec.key.shadow);
  Object.freeze(spec.key);
  Object.freeze(spec.candle);
  Object.freeze(spec.flame);
  return Object.freeze(spec);
}

/**
 * DAY = soft overcast daylight of the reference (sun from the upper left, strong even fill); NIGHT = moonlit periwinkle
 * with a readable village and a glowing candle. All values DRAFT (owner reviews them from the PR screenshots).
 * The key light reuses MOON_SHADOW_MAP_SIZE_PX for its shadow map in both presets.
 * DAY was tuned from the lead's draft on the screenshots (MFW-47 dev): a cooler sky fill (#F6F2E6 → #EEF2EC) and a less
 * orange sun (#FFF0D9 → #FFF4E3) keep the river blue-grey; a lower sun ([-5, 8, 4] → [-5, 6.5, 5]) lights the cream
 * walls like the reference instead of only the ground.
 */
export const LIGHT_PRESETS: Readonly<Record<LightPresetId, Readonly<LightPresetSpec>>> = Object.freeze({
  DAY: freezePreset({
    background: LOOK_PALETTE.daySky,
    hemisphere: { skyColor: "#EEF2EC", groundColor: LOOK_PALETTE.grass, intensity: 1.6 },
    ambient: { color: "#FFFFFF", intensity: 0.4 },
    key: {
      color: "#FFF4E3",
      intensity: 2.4,
      position: [-5, 6.5, 5],
      shadow: { intensity: 0.5, radius: 5, bias: -0.0005, normalBias: 0.02 },
    },
    candle: { intensityScale: 0.15 },
    flame: { emissiveIntensity: 2.2 },
  }),
  NIGHT: freezePreset({
    background: LOOK_PALETTE.nightSky,
    hemisphere: { skyColor: "#A9B9E6", groundColor: "#5B6A86", intensity: 1.7 },
    ambient: { color: "#8FA2D6", intensity: 0.5 },
    key: {
      color: "#CAD7FF",
      intensity: 1.3,
      position: [-4, 7, 3], // existing MFW-27 moon position
      shadow: { intensity: 0.4, radius: 5, bias: -0.0005, normalBias: 0.02 },
    },
    candle: { intensityScale: 1 },
    flame: { emissiveIntensity: 3.0 },
  }),
});

/**
 * Device-local hours of the AUTO preset: DAY = [dayStartHour, nightStartHour), NIGHT = the rest.
 * PLACEHOLDER (spec silent; open question 32 follow-up). Integers, 0 ≤ dayStartHour < nightStartHour ≤ 23.
 */
export const DAY_NIGHT_HOURS = Object.freeze({ dayStartHour: 6, nightStartHour: 18 });

/** Server snapshot of the AUTO preset (SSR only; the scene never renders on the server). Lead decision MFW-47. */
export const LIGHT_PRESET_SERVER_FALLBACK: LightPresetId = "NIGHT";

/** LocalStorage key of the per-device light preset choice (only "DAY" / "NIGHT"; AUTO = no key). `mfw:<name>:v1` pattern. */
export const LIGHT_PRESET_STORAGE_KEY = "mfw:lightPreset:v1";

/** Day/night switch copy. DRAFT Thai copy (owner sign-off from the PR). */
export const LIGHT_PRESET_SWITCH_COPY = Object.freeze({
  groupLabel: "แสงในฉาก",
  AUTO: "ตามเวลาจริง",
  DAY: "กลางวัน",
  NIGHT: "กลางคืน",
});

export type LookToneMappingId = "NEUTRAL" | "ACES_FILMIC" | "AGX";
/** Renderer look: Neutral keeps the pastel albedo close to the sampled hexes (ACES darkens and shifts them). DRAFT. */
export const LOOK_RENDERER: Readonly<{ toneMapping: LookToneMappingId; toneMappingExposure: number }> = Object.freeze({
  toneMapping: "NEUTRAL",
  toneMappingExposure: 1,
});

/** The krathong flame is not tone-mapped, so it stays the brightest thing on screen (glow without bloom). Lead decision MFW-47. */
export const KRATHONG_FLAME_GLOW = Object.freeze({ toneMapped: false });

/**
 * Soft blob shadows (vertex-alpha fans, no texture). DRAFT. liftY is in world units above the surface the blob lies on;
 * falloffExponent shapes the alpha from centre (1) to rim (0); polygon offset keeps it from z-fighting the ground.
 */
export const BLOB_SHADOW_LOOK = Object.freeze({
  color: LOOK_PALETTE.shadowTint,
  opacity: 0.35,
  liftY: 0.006,
  falloffExponent: 1.6,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});

/**
 * Blob fan resolution per tier. LOW is the "cheap variant": 10×2 = 30 triangles per blob, against 16×2 = 48 on HIGH.
 * DRAFT. The lead's draft (HIGH 24×3 = 120, MEDIUM 16×3 = 80) was lowered by the dev: the soft blobs look the same and the
 * triangles cost frame time in the SwiftShader e2e (MFW-47 dev report).
 */
export const BLOB_SHADOW_TIER_GEOMETRY: Readonly<Record<RenderTier, Readonly<{ segments: number; rings: number }>>> =
  Object.freeze({
    HIGH: Object.freeze({ segments: 16, rings: 2 }),
    MEDIUM: Object.freeze({ segments: 12, rings: 2 }),
    LOW: Object.freeze({ segments: 10, rings: 2 }),
  });

/** Own-krathong blob, krathong model units (base rim ≈ 1.1–1.2, so it shows a soft ring around the base). DRAFT. */
export const KRATHONG_BLOB_SHADOW = Object.freeze({ radius: 1.45, liftY: 0.02 });

/** River-krathong blob radius in world units (derived: model radius × river scale). */
export const RIVER_KRATHONG_BLOB_SHADOW_RADIUS = KRATHONG_BLOB_SHADOW.radius * RIVER_KRATHONG_SCALE;

/**
 * MFW-50 villagers: simple dark silhouettes (owner, 2026-11-25: "คนอาจจะแค่เป็นเงาๆก็พอ") — body, head and an optional
 * conical hat in ONE muted palette colour; no faces, no outfit colours. DRAFT (owner reviews from the PR screenshots).
 */
export const VILLAGER_LOOK = Object.freeze({ silhouette: LOOK_PALETTE.shadowTint });

/**
 * MFW-50 floating light motes: pale pollen by DAY, warm fireflies at NIGHT. Tiny soft points (vertex-alpha, no hard edge, no
 * halo; owner, 2026-11-25). Same material, recoloured on a preset switch. DRAFT.
 */
export const AMBIENT_MOTE_LOOK: Readonly<Record<LightPresetId, Readonly<{ color: string; opacity: number }>>> = Object.freeze({
  DAY: Object.freeze({ color: LOOK_PALETTE.flowerCream, opacity: 0.6 }),
  NIGHT: Object.freeze({ color: LOOK_PALETTE.flameCore, opacity: 0.9 }),
});

/**
 * Lead regression guard (not a product number): minimum estimated linear luminance (Lambert, before tone mapping) of
 * every environment surface, up-facing and camera-facing side, in both presets. The MFW-27 night look scores ≤ 0.014.
 */
export const LOOK_MIN_LIT_LUMINANCE = 0.025;

/**
 * Lead regression guard (technical, not a product number): the largest Lambert radiance the own-krathong candle light may add to a
 * white surface right under it. three's PBR Neutral tone mapping (LOOK_RENDERER) is linear up to StartCompression = 0.8 − 0.04
 * (tonemapping_pars_fragment); above it the light clips into a flat bright disc with a visible edge (MFW-67).
 */
export const CANDLE_MAX_PEAK_RADIANCE = 0.76;

/** Lead guard for "pastel, no near-black albedo" on environment materials (WCAG relative luminance). */
export const LOOK_MIN_ALBEDO_LUMINANCE = 0.1;

/** Village light levels per preset (MFW-49, backlog 9.3 AC3). */
export interface VillageLightLevels {
  readonly windowEmissiveIntensity: number;
  readonly lanternEmissiveIntensity: number;
}

/** AC3: lit at NIGHT, off at DAY (emissive only; the MFW-49 lamp light pools were removed in MFW-67, owner decision 40). Emissive is a uniform, so a preset switch recompiles nothing. DRAFT. */
export const VILLAGE_LIGHTS: Readonly<Record<LightPresetId, VillageLightLevels>> = Object.freeze({
  DAY: Object.freeze({ windowEmissiveIntensity: 0, lanternEmissiveIntensity: 0 }),
  NIGHT: Object.freeze({ windowEmissiveIntensity: 0.9, lanternEmissiveIntensity: 1.2 }),
});

/** Stylized water highlights (shore band, drifting glints, krathong ripples; MFW-49, AC4). DRAFT. */
export const WATER_HIGHLIGHT_LOOK = Object.freeze({
  color: LOOK_PALETTE.waterLight,
  shoreOpacity: 0.55,
  glintOpacity: 0.6,
  rippleOpacity: 0.5,
});
