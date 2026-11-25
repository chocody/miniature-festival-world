import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  NeutralToneMapping,
  type MeshStandardMaterial,
  type ToneMapping,
} from "three";
import { KRATHONG_FLAME_GLOW, LOOK_RENDERER, type LookToneMappingId } from "@/config/look.config";

/** Config tone-mapping id → three constant. */
export const TONE_MAPPING_BY_ID: Readonly<Record<LookToneMappingId, ToneMapping>> = Object.freeze({
  NEUTRAL: NeutralToneMapping,
  ACES_FILMIC: ACESFilmicToneMapping,
  AGX: AgXToneMapping,
});

export interface CanvasGlOptions {
  readonly antialias: boolean;
  readonly toneMapping: ToneMapping;
  readonly toneMappingExposure: number;
}

const glOptions = (antialias: boolean): CanvasGlOptions =>
  Object.freeze({
    antialias,
    toneMapping: TONE_MAPPING_BY_ID[LOOK_RENDERER.toneMapping],
    toneMappingExposure: LOOK_RENDERER.toneMappingExposure,
  });

/**
 * Stable `<Canvas gl>` objects (module-level, frozen): the renderer reads antialias only at creation, and the Canvas key
 * re-creates it when the value flips. R3F applies gl.toneMapping / toneMappingExposure when the props define them.
 */
export const CANVAS_GL_OPTIONS: Readonly<{ on: CanvasGlOptions; off: CanvasGlOptions }> = Object.freeze({
  on: glOptions(true),
  off: glOptions(false),
});

/** Writes the preset's flame glow into the shared flame material (allocation-free). Not tone-mapped, so it stays bright. */
export function applyFlameGlow(material: MeshStandardMaterial, emissiveIntensity: number): void {
  material.emissiveIntensity = emissiveIntensity;
  if (material.toneMapped !== KRATHONG_FLAME_GLOW.toneMapped) {
    material.toneMapped = KRATHONG_FLAME_GLOW.toneMapped;
    material.needsUpdate = true;
  }
}
