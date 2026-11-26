"use client";

import { Fragment, memo } from "react";
import { FLAT_KRATHONG_VEIN } from "@/config/fallback2d.config";
import type { KrathongLayer2D } from "@/core/fallback2d/flat";

/**
 * Layers (back to front) → SVG paths in model units: one group per part, one path per outline (MFW-51 outlines from the 3D
 * meshes), plus a midrib stroke on full-LOD leaves. A part with a single outline and no midrib is drawn as that one path (it
 * carries the layer attributes itself): one SVG element fewer per flower, centre, flame and incense stick of every river
 * krathong (weak-phone DOM size, MFW-51 dev). Purely presentational; never takes pointer events.
 */
export const FlatKrathongShapes = memo(function FlatKrathongShapes({ layers }: { readonly layers: readonly KrathongLayer2D[] }) {
  return (
    <g pointerEvents="none">
      {layers.map((l) => {
        const only = l.shapes.length === 1 && l.shapes[0].vein === undefined ? l.shapes[0] : null;
        if (only !== null) return <path key={l.id} d={only.d} fill={only.fill} data-layer-id={l.id} data-layer-role={l.role} />;
        return (
          <g key={l.id} data-layer-id={l.id} data-layer-role={l.role}>
            {l.shapes.map((s, i) => (
              <Fragment key={i}>
                <path d={s.d} fill={s.fill} />
                {s.vein !== undefined && (
                  <path d={s.vein} fill="none" stroke={s.veinStroke} strokeWidth={FLAT_KRATHONG_VEIN.width} strokeLinecap="round" />
                )}
              </Fragment>
            ))}
          </g>
        );
      })}
    </g>
  );
});
