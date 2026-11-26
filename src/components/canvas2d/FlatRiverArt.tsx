"use client";

import { memo } from "react";
import { flatBlobGradientStops, type FlatArtShape, type FlatRiverArt, type FlatSprite } from "@/core/fallback2d/flat";

const BLOB_STOPS = flatBlobGradientStops();

/** One `<path>` per shape (fill-opacity when the shape has an opacity). */
export const FlatArtShapes = memo(function FlatArtShapes({ shapes }: { readonly shapes: readonly FlatArtShape[] }) {
  return (
    <>
      {shapes.map((s, i) => (
        <path key={i} d={s.d} fill={s.fill} fillOpacity={s.opacity} />
      ))}
    </>
  );
});

/** Soft blob-shadow radial gradient (the 3D fan's alpha falloff, MFW-51). */
export const FlatBlobGradient = memo(function FlatBlobGradient({ id }: { readonly id: string }) {
  return (
    <radialGradient id={id}>
      {BLOB_STOPS.map((s) => (
        <stop key={s.offset} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity} />
      ))}
    </radialGradient>
  );
});

function SpriteGroup({ sprite }: { readonly sprite: FlatSprite }) {
  return (
    <g
      data-flat-prop={sprite.kind}
      data-roof={sprite.roof}
      data-tree-shape={sprite.treeShape}
      transform={`translate(${sprite.x} ${sprite.y}) scale(${sprite.scale})`}
    >
      <FlatArtShapes shapes={sprite.shapes} />
    </g>
  );
}

/** Ground bands, the tappable water, shore highlight, blob shadows and the far-bank sprites (under the krathongs). */
export const FlatRiverBackdrop = memo(function FlatRiverBackdrop({ art, gradientId }: { readonly art: FlatRiverArt; readonly gradientId: string }) {
  const fill = `url(#${gradientId})`;
  return (
    <>
      <g pointerEvents="none">
        <FlatArtShapes shapes={art.bankBands} />
      </g>
      <path d={art.water.d} fill={art.water.fill} data-input-target="water" />
      <g pointerEvents="none">
        <FlatArtShapes shapes={art.shoreBands} />
        {art.blobs.map((b, i) => (
          <ellipse key={i} cx={b.cx} cy={b.cy} rx={b.rx} ry={b.ry} fill={fill} transform={`rotate(${b.rotationDeg} ${b.cx} ${b.cy})`} />
        ))}
        {art.farSprites.map((s) => (
          <SpriteGroup key={s.key} sprite={s} />
        ))}
      </g>
    </>
  );
});

/** Near-bank sprites, drawn over the krathongs (3/4 occlusion); never take pointer events. */
export const FlatRiverNearProps = memo(function FlatRiverNearProps({ art }: { readonly art: FlatRiverArt }) {
  return (
    <g pointerEvents="none" data-testid="flat-river-near-props">
      {art.nearSprites.map((s) => (
        <SpriteGroup key={s.key} sprite={s} />
      ))}
    </g>
  );
});
