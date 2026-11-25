"use client";

import { useMemo } from "react";
import {
  FLAT_KRATHONG_PREVIEW_VIEW,
  FLAT_KRATHONG_VIEW_AZIMUTH_RAD,
  FLAT_KRATHONG_VIEW_ELEVATION_RAD,
  FLAT_VIEW_COLORS,
  FLAT_VIEW_COPY,
} from "@/config/fallback2d.config";
import { DEFAULT_KRATHONG_APPEARANCE } from "@/core/customization";
import { buildKrathongLayers2D } from "@/core/fallback2d/flat";
import { useBuilderStore } from "@/store/useBuilderStore";
import { FlatKrathongShapes } from "./FlatKrathongShapes";

const PREVIEW_VIEW = Object.freeze({
  azimuthRad: FLAT_KRATHONG_VIEW_AZIMUTH_RAD,
  elevationRad: FLAT_KRATHONG_VIEW_ELEVATION_RAD,
  modelYawRad: 0,
});
const { halfExtent: HALF_EXTENT, centerLift: CENTER_LIFT } = FLAT_KRATHONG_PREVIEW_VIEW;
const VIEW_BOX = `${-HALF_EXTENT} ${-CENTER_LIFT - HALF_EXTENT} ${2 * HALF_EXTENT} ${2 * HALF_EXTENT}`;

/** CUSTOMIZE_OBJECT on FALLBACK_2D: the layered flat-vector krathong, drawn from the same builder appearance as the 3D model. */
export function FlatKrathongPreview() {
  const appearance = useBuilderStore((s) => s.appearance) ?? DEFAULT_KRATHONG_APPEARANCE;
  const layers = useMemo(() => buildKrathongLayers2D(appearance, PREVIEW_VIEW), [appearance]);
  return (
    <section
      aria-label={FLAT_VIEW_COPY.previewLabel}
      data-testid="flat-krathong-preview"
      data-krathong-base={appearance.base}
      data-flower-count={appearance.flowers.filter((f) => f !== null).length}
      data-layer-count={layers.length}
      className="relative mb-8 h-64 w-full select-none overflow-hidden rounded-3xl border border-indigo-950/30 shadow-lg"
      style={{ backgroundColor: FLAT_VIEW_COLORS.background }}
    >
      <svg role="img" aria-label={FLAT_VIEW_COPY.previewLabel} viewBox={VIEW_BOX} preserveAspectRatio="xMidYMid meet" className="block h-full w-full">
        <FlatKrathongShapes layers={layers} />
      </svg>
    </section>
  );
}
