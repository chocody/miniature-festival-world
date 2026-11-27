import { KRATHONG_DEFAULT_DESIGN, KRATHONG_DESIGN_IDS, type KrathongDesignId } from "@/config/krathongDesigns.config";
import { KRATHONG_FLAME_MODEL } from "@/config/krathongModel.config";
import type { KrathongFlameAnchor } from "./krathongDesignGlb";
import type { KrathongAppearance, KrathongPartInstance } from "./types";

/**
 * Design of a krathong (MFW-65). Every appearance maps to KRATHONG_DEFAULT_DESIGN until the customizer picks a design
 * (card 14.4); the stored appearance format is unchanged.
 */
export function krathongDesignForAppearance(appearance: KrathongAppearance): KrathongDesignId {
  void appearance;
  return KRATHONG_DEFAULT_DESIGN;
}

/** The distinct designs of a list of appearances, in KRATHONG_DESIGN_IDS order. */
export function uniqueKrathongDesigns(appearances: readonly KrathongAppearance[]): readonly KrathongDesignId[] {
  const used = new Set(appearances.map(krathongDesignForAppearance));
  return Object.freeze(KRATHONG_DESIGN_IDS.filter((id) => used.has(id)));
}

/** Height H, max radius R and bottom B (< 0) of the full procedural flame lathe (MFW-69), read from its profile. */
function flameProfileExtent(): { readonly height: number; readonly radius: number; readonly bottom: number } {
  const mesh = KRATHONG_FLAME_MODEL.mesh;
  if (mesh.kind !== "lathe") throw new Error("KRATHONG_FLAME_MODEL.mesh must be a lathe");
  const ys = mesh.profile.map(([, y]) => y);
  const bottom = Math.min(...ys);
  return { height: Math.max(...ys) - bottom, radius: Math.max(...mesh.profile.map(([r]) => r)), bottom };
}
const FLAME = flameProfileExtent();

/**
 * The procedural flame (geometry, material and flicker of MFW-69) fitted to each flame anchor of a design: scaled to the
 * anchor's height and radius, its bottom on the anchor's base. Render-time only (invariant A).
 */
export function designFlameParts(flames: readonly KrathongFlameAnchor[]): readonly KrathongPartInstance[] {
  return Object.freeze(
    flames.map((flame, i) => {
      const sy = flame.height / FLAME.height;
      const sr = flame.radius / FLAME.radius;
      return Object.freeze({
        id: `design-flame-${i}`,
        role: "flame" as const,
        socketId: null,
        geometryKey: "flame" as const,
        materialKey: "flame" as const,
        localPosition: Object.freeze([flame.x, flame.y - FLAME.bottom * sy, flame.z] as const),
        rotationY: 0,
        scale: Object.freeze([sr, sy, sr] as const),
      });
    }),
  );
}
