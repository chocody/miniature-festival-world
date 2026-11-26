import { FLAT_KRATHONG_VEIN } from "@/config/fallback2d.config";
import { KRATHONG_HERO_LOD, type KrathongLod } from "@/config/krathongModel.config";
import { KRATHONG_FLAME_GLOW, LIGHT_PRESETS, type LightPresetId } from "@/config/look.config";
import { assembleKrathong } from "@/core/customization/krathongAssembler";
import { materialSpecFor } from "@/core/customization/krathongAssetKeys";
import type { KrathongAppearance, KrathongPartInstance, KrathongPartRole } from "@/core/customization/types";
import { shadeHex } from "@/core/math/shadeHex";
import { createFlatLightContext, rotateYaw, type FlatLightContext, type FlatVec3 } from "./flatLight";
import { bladePath, convexHull2D, polygonPath, smoothClosedPath, smoothOpenPath } from "./flatPath";
import { krathongOutlineDataFor } from "./krathongOutlines";
import { projectModelPoint, type FlatKrathongView, type ProjectedPoint2D } from "./spriteProjection";

export { projectModelPoint, type FlatKrathongView, type ProjectedPoint2D, type FlatSpriteView } from "./spriteProjection";

/** One filled outline of a part, model units, screen y DOWN. Derived at render time, NEVER persisted. */
export interface KrathongShape2D {
  readonly d: string; // SVG path, model units, y down
  readonly fill: string; // "#rrggbb"
  readonly vein?: string; // open path (leaf midrib), full LOD only
  readonly veinStroke?: string; // shadeHex(fill, FLAT_KRATHONG_VEIN.shade)
}
/** One MFW-19 part: its shapes back to front. */
export interface KrathongLayer2D {
  readonly id: string; // part id (unique)
  readonly role: KrathongPartRole;
  readonly depth: number; // projected depth of the part origin (+ centre anchor)
  readonly shapes: readonly KrathongShape2D[]; // back to front
}
export interface KrathongLayers2DOptions {
  readonly lod?: KrathongLod;
  readonly preset?: LightPresetId;
}

const UP: FlatVec3 = Object.freeze([0, 1, 0] as const);
const XYZ = 3;

interface PositionedPart {
  readonly part: KrathongPartInstance;
  readonly position: readonly [number, number, number];
}
interface DepthShape {
  readonly shape: KrathongShape2D;
  readonly depth: number;
  readonly k: number;
}

const sub = (a: FlatVec3, b: FlatVec3): FlatVec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: FlatVec3, b: FlatVec3): FlatVec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: FlatVec3, b: FlatVec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const meanDepth = (points: readonly ProjectedPoint2D[]): number => points.reduce((s, p) => s + p.depth, 0) / points.length;

/** "base|lotusFold|leafColor|flowers (null → -)|candleColor": equal appearances share one layer set. */
export function krathongAppearanceKey(appearance: KrathongAppearance): string {
  return `${appearance.base}|${appearance.lotusFold}|${appearance.leafColor}|${appearance.flowers.map((f) => f ?? "-").join(",")}|${appearance.candleColor}`;
}

function partShapes(
  { part, position }: PositionedPart,
  view: FlatKrathongView,
  lod: KrathongLod,
  preset: LightPresetId,
  ctx: FlatLightContext,
): readonly KrathongShape2D[] {
  const data = krathongOutlineDataFor(part.geometryKey, lod);
  const color = materialSpecFor(part.materialKey).color;
  const [sx, sy, sz] = part.scale;
  const cosY = Math.cos(part.rotationY);
  const sinY = Math.sin(part.rotationY);
  const pos = data.positions;
  const model = (v: number): FlatVec3 => {
    const x = pos[v * XYZ] * sx;
    const y = pos[v * XYZ + 1] * sy;
    const z = pos[v * XYZ + 2] * sz;
    return [x * cosY + z * sinY + position[0], y + position[1], -x * sinY + z * cosY + position[2]];
  };
  const project = (v: number) => projectModelPoint(model(v), view);
  /** Model normal → world normal (model yaw), flipped toward the camera. */
  const facing = (n: FlatVec3): FlatVec3 => {
    const w = rotateYaw(n, view.modelYawRad);
    return dot(w, ctx.cameraDir) < 0 ? [-w[0], -w[1], -w[2]] : w;
  };
  const capRole = part.role === "base" || part.role === "candle";
  const list: DepthShape[] = [];
  let firstHull = true;
  const push = (shape: KrathongShape2D, depth: number) => list.push({ shape: Object.freeze(shape), depth, k: list.length });

  for (const s of data.shapes) {
    if (s.kind === "blade") {
      const outline = s.outline.map(project);
      const normal = facing(cross(sub(model(s.outline[s.tipAt]), model(s.outline[0])), sub(model(s.mid[1]), model(s.mid[0]))));
      const fill = ctx.lit(color, normal);
      const d = bladePath(outline, s.tipAt);
      push(
        lod === "full" ? { d, fill, vein: smoothOpenPath(s.vein.map(project)), veinStroke: shadeHex(fill, FLAT_KRATHONG_VEIN.shade) } : { d, fill },
        meanDepth(outline),
      );
    } else if (s.kind === "hull") {
      const points = s.vertices.map(project);
      const depth = meanDepth(points);
      const fill =
        part.role === "flame"
          ? ctx.lit(
              color,
              UP, // the flame glow is up-lit like T4 / the lead probe (MFW-51 dev: the spec's P5 said cameraDir, T26 pins UP)
              materialSpecFor("flame").emissive,
              LIGHT_PRESETS[preset].flame.emissiveIntensity,
              KRATHONG_FLAME_GLOW.toneMapped,
            )
          : ctx.lit(color, ctx.cameraHorizontalDir);
      push({ d: polygonPath(convexHull2D(points)), fill }, depth);
      if (firstHull && capRole && s.cap !== null) push({ d: polygonPath(s.cap.map(project)), fill: ctx.lit(color, UP) }, depth);
      firstHull = false;
    } else {
      const rim = s.rim.map(project);
      const normal = facing(sub(model(s.axis[0]), model(s.axis[1])));
      push({ d: smoothClosedPath(rim), fill: ctx.lit(color, normal) }, meanDepth(rim));
    }
  }
  list.sort((a, b) => a.depth - b.depth || a.k - b.k);
  return Object.freeze(list.map((e) => e.shape));
}

/**
 * Appearance (parsed) → one layer per MFW-19 part, sorted back-to-front by part depth (ties keep part order). Each layer holds
 * the part's outlines from the 3D mesh vertices (krathongOutlines), lit like 3D under the preset (flatLight). Default LOD
 * KRATHONG_HERO_LOD, default preset DAY. Throws only on an unknown key. Pure; never mutates the appearance.
 */
export function buildKrathongLayers2D(
  appearance: KrathongAppearance,
  view: FlatKrathongView,
  options: KrathongLayers2DOptions = {},
): readonly KrathongLayer2D[] {
  const lod = options.lod ?? KRATHONG_HERO_LOD;
  const preset = options.preset ?? "DAY";
  const ctx = createFlatLightContext(view, preset);
  const assembly = assembleKrathong(appearance);
  const anchor = assembly.centerAnchor.localPosition;
  const parts: PositionedPart[] = [
    ...assembly.body.map((part) => ({ part, position: part.localPosition })),
    ...assembly.centerAnchor.parts.map((part) => ({
      part,
      position: [
        anchor[0] + part.localPosition[0],
        anchor[1] + part.localPosition[1],
        anchor[2] + part.localPosition[2],
      ] as const,
    })),
  ];
  const indexed = parts.map((p, k) => ({
    layer: Object.freeze({
      id: p.part.id,
      role: p.part.role,
      depth: projectModelPoint(p.position, view).depth,
      shapes: partShapes(p, view, lod, preset, ctx),
    }),
    k,
  }));
  indexed.sort((a, b) => a.layer.depth - b.layer.depth || a.k - b.k);
  return Object.freeze(indexed.map((e) => e.layer));
}
