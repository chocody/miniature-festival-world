import { FLAT_KRATHONG_SIDE_SHADE } from "@/config/fallback2d.config";
import { assembleKrathong } from "@/core/customization/krathongAssembler";
import { geometrySpecFor, materialSpecFor } from "@/core/customization/krathongAssetKeys";
import type { KrathongAppearance, KrathongPartInstance, KrathongPartRole } from "@/core/customization/types";
import { shadeHex } from "@/core/math/shadeHex";

/** Orthographic 3/4 view: camera azimuth/elevation around the model, plus the model's own yaw (three rotation.y). */
export interface FlatKrathongView {
  readonly azimuthRad: number;
  readonly elevationRad: number;
  readonly modelYawRad: number;
}
interface LayerBase {
  readonly id: string;
  readonly role: KrathongPartRole;
  readonly depth: number;
  readonly fill: string;
}
/** Model units, screen x right, screen y DOWN, origin = projected model origin. Derived at render time, NEVER persisted. */
export type KrathongLayer2D =
  | (LayerBase & { readonly kind: "ellipse"; readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number })
  | (LayerBase & {
      readonly kind: "triangle";
      readonly points: readonly [number, number, number, number, number, number];
    })
  | (LayerBase & {
      readonly kind: "puck";
      readonly cx: number;
      readonly topY: number;
      readonly bottomY: number;
      readonly topRx: number;
      readonly topRy: number;
      readonly bottomRx: number;
      readonly bottomRy: number;
      readonly sideFill: string;
    });
export interface ProjectedPoint2D {
  readonly x: number;
  readonly y: number;
  readonly depth: number;
}

export function projectModelPoint(p: readonly [number, number, number], view: FlatKrathongView): ProjectedPoint2D {
  const [x, y, z] = p;
  const cosRho = Math.cos(view.modelYawRad);
  const sinRho = Math.sin(view.modelYawRad);
  const xw = x * cosRho + z * sinRho;
  const zw = -x * sinRho + z * cosRho;
  const cosA = Math.cos(view.azimuthRad);
  const sinA = Math.sin(view.azimuthRad);
  const sx = xw * cosA - zw * sinA;
  const zt = xw * sinA + zw * cosA; // toward the camera
  const cosPhi = Math.cos(view.elevationRad);
  const sinPhi = Math.sin(view.elevationRad);
  return { x: sx, y: -y * cosPhi + zt * sinPhi, depth: zt * cosPhi + y * sinPhi };
}

interface PositionedPart {
  readonly part: KrathongPartInstance;
  readonly position: readonly [number, number, number];
}

/**
 * Appearance (parsed) → one layer per MFW-19 part, sorted back-to-front by depth (ties keep part order).
 * Sphere layers are exact for sx = sz and an approximation for MFW-19's flattened `style_02` leaf (accepted).
 * Throws only on an unknown key, like geometrySpecFor. Pure; never mutates the appearance.
 */
export function buildKrathongLayers2D(appearance: KrathongAppearance, view: FlatKrathongView): readonly KrathongLayer2D[] {
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
  const cosPhi = Math.cos(view.elevationRad);
  const sinPhi = Math.sin(view.elevationRad);
  const indexed = parts.map(({ part, position }, k) => {
    const g = geometrySpecFor(part.geometryKey);
    const fill = materialSpecFor(part.materialKey).color;
    const [sx, sy, sz] = part.scale;
    const [px, py, pz] = position;
    const c = projectModelPoint(position, view);
    const base = { id: part.id, role: part.role, depth: c.depth, fill };
    let layer: KrathongLayer2D;
    if (g.type === "cylinder") {
      const half = (g.height * sy) / 2;
      const top = projectModelPoint([px, py + half, pz], view);
      const bottom = projectModelPoint([px, py - half, pz], view);
      layer = {
        ...base,
        kind: "puck",
        cx: c.x,
        topY: top.y,
        bottomY: bottom.y,
        topRx: g.radiusTop * sx,
        topRy: g.radiusTop * sz * sinPhi,
        bottomRx: g.radiusBottom * sx,
        bottomRy: g.radiusBottom * sz * sinPhi,
        sideFill: shadeHex(fill, FLAT_KRATHONG_SIDE_SHADE),
      };
    } else if (g.type === "sphere") {
      layer = {
        ...base,
        kind: "ellipse",
        cx: c.x,
        cy: c.y,
        rx: g.radius * sx,
        ry: g.radius * Math.hypot(sy * cosPhi, sz * sinPhi),
      };
    } else {
      const half = (g.height * sy) / 2;
      const apex = projectModelPoint([px, py + half, pz], view);
      const bottom = projectModelPoint([px, py - half, pz], view);
      const r = g.radius * sx;
      layer = { ...base, kind: "triangle", points: [c.x - r, bottom.y, c.x + r, bottom.y, c.x, apex.y] };
    }
    return { layer: Object.freeze(layer), k };
  });
  indexed.sort((a, b) => a.layer.depth - b.layer.depth || a.k - b.k);
  return Object.freeze(indexed.map((e) => e.layer));
}

/** Side of a puck: bottom front half-arc + straight sides to the top ellipse. */
export function puckSidePath(layer: Extract<KrathongLayer2D, { kind: "puck" }>): string {
  const l = layer;
  return `M ${l.cx - l.bottomRx} ${l.bottomY} A ${l.bottomRx} ${l.bottomRy} 0 0 0 ${l.cx + l.bottomRx} ${l.bottomY} L ${l.cx + l.topRx} ${l.topY} L ${l.cx - l.topRx} ${l.topY} Z`;
}

/** "x0,y0 x1,y1 x2,y2". */
export function trianglePoints(layer: Extract<KrathongLayer2D, { kind: "triangle" }>): string {
  const p = layer.points;
  return `${p[0]},${p[1]} ${p[2]},${p[3]} ${p[4]},${p[5]}`;
}
