"use client";

import { puckSidePath, trianglePoints, type KrathongLayer2D } from "@/core/fallback2d/flat";

/** Layers (back to front) → SVG elements, in model units. Purely presentational; never takes pointer events. */
export function FlatKrathongShapes({ layers }: { readonly layers: readonly KrathongLayer2D[] }) {
  return (
    <g pointerEvents="none">
      {layers.map((l) => {
        if (l.kind === "ellipse") {
          return (
            <ellipse key={l.id} cx={l.cx} cy={l.cy} rx={l.rx} ry={l.ry} fill={l.fill} data-layer-id={l.id} data-layer-role={l.role} />
          );
        }
        if (l.kind === "triangle") {
          return <polygon key={l.id} points={trianglePoints(l)} fill={l.fill} data-layer-id={l.id} data-layer-role={l.role} />;
        }
        return (
          <g key={l.id} data-layer-id={l.id} data-layer-role={l.role}>
            <path d={puckSidePath(l)} fill={l.sideFill} />
            <ellipse cx={l.cx} cy={l.topY} rx={l.topRx} ry={l.topRy} fill={l.fill} />
          </g>
        );
      })}
    </g>
  );
}
