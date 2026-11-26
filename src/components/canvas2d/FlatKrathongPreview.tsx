"use client";

import { useId, useMemo } from "react";
import {
  FLAT_KRATHONG_PREVIEW_VIEW,
  FLAT_KRATHONG_VIEW_AZIMUTH_RAD,
  FLAT_KRATHONG_VIEW_ELEVATION_RAD,
  FLAT_VIEW_COPY,
} from "@/config/fallback2d.config";
import { KRATHONG_HERO_LOD } from "@/config/krathongModel.config";
import { KRATHONG_BLOB_SHADOW, LIGHT_PRESETS } from "@/config/look.config";
import { TOY_MATTE_MATERIALS } from "@/config/scene.config";
import { DEFAULT_KRATHONG_APPEARANCE } from "@/core/customization";
import { buildKrathongLayers2D, flatSurfaceColor, projectModelPoint } from "@/core/fallback2d/flat";
import { useResolvedLightPreset } from "@/components/ui/useResolvedLightPreset";
import { useBuilderStore } from "@/store/useBuilderStore";
import { FlatKrathongShapes } from "./FlatKrathongShapes";
import { FlatBlobGradient } from "./FlatRiverArt";

const PREVIEW_VIEW = Object.freeze({
  azimuthRad: FLAT_KRATHONG_VIEW_AZIMUTH_RAD,
  elevationRad: FLAT_KRATHONG_VIEW_ELEVATION_RAD,
  modelYawRad: 0,
});
const { halfExtent: HALF_EXTENT, centerLift: CENTER_LIFT } = FLAT_KRATHONG_PREVIEW_VIEW;
const VIEW_BOX = `${-HALF_EXTENT} ${-CENTER_LIFT - HALF_EXTENT} ${2 * HALF_EXTENT} ${2 * HALF_EXTENT}`;
const UP = [0, 1, 0] as const;
/** Own-krathong blob shadow seen in the 3/4 view (the same KRATHONG_BLOB_SHADOW as 3D). */
const BLOB_CY = projectModelPoint([0, KRATHONG_BLOB_SHADOW.liftY, 0], PREVIEW_VIEW).y;
const BLOB_RY = KRATHONG_BLOB_SHADOW.radius * Math.sin(FLAT_KRATHONG_VIEW_ELEVATION_RAD);

/**
 * CUSTOMIZE_OBJECT on FALLBACK_2D: the krathong outlined from the same 3D meshes and builder appearance as the 3D model (hero LOD),
 * lit by the same day / night preset, on the lit water the 3D customize frames it on (MFW-51).
 */
export function FlatKrathongPreview() {
  const appearance = useBuilderStore((s) => s.appearance) ?? DEFAULT_KRATHONG_APPEARANCE;
  const preset = useResolvedLightPreset();
  const gradientId = "flat-preview-blob-" + useId().replace(/[^A-Za-z0-9_-]/g, "");
  const layers = useMemo(() => buildKrathongLayers2D(appearance, PREVIEW_VIEW, { lod: KRATHONG_HERO_LOD, preset }), [appearance, preset]);
  const background = useMemo(
    () => flatSurfaceColor({ albedo: TOY_MATTE_MATERIALS.water.color, normal: UP }, LIGHT_PRESETS[preset]),
    [preset],
  );
  return (
    <section
      aria-label={FLAT_VIEW_COPY.previewLabel}
      data-testid="flat-krathong-preview"
      data-krathong-base={appearance.base}
      data-flower-count={appearance.flowers.filter((f) => f !== null).length}
      data-layer-count={layers.length}
      data-light-preset={preset}
      className="relative flex h-full w-full select-none items-start justify-center overflow-hidden pt-[max(calc(var(--spacing)*3),env(safe-area-inset-top))] md:items-center md:pt-0"
      style={{ backgroundColor: background }}
    >
      <svg role="img" aria-label={FLAT_VIEW_COPY.previewLabel} viewBox={VIEW_BOX} preserveAspectRatio="xMidYMid meet" className="block h-[45dvh] max-h-64 w-full">
        <defs>
          <FlatBlobGradient id={gradientId} />
        </defs>
        <ellipse cx={0} cy={BLOB_CY} rx={KRATHONG_BLOB_SHADOW.radius} ry={BLOB_RY} fill={`url(#${gradientId})`} />
        <FlatKrathongShapes layers={layers} />
      </svg>
    </section>
  );
}
