import { KRATHONG_DESIGN_MAX_FLAMES } from "@/config/krathongDesigns.config";
import { parseDesignGlbCore, type DesignMeshData } from "./designGlb";

/**
 * Parser of the owner-supplied krathong design GLB written by scripts/krathong-models.mjs (MFW-65; contract in
 * docs/design/models.md). Pure, no three: the typed arrays are views on the input buffer (no copy).
 */

/** One flame of a design, in model-local coordinates: (x, z) = flame axis, y = flame base. Render-time only (invariant A). */
export interface KrathongFlameAnchor {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly height: number;
  readonly radius: number;
}

export interface KrathongDesignMeshData extends DesignMeshData {
  readonly flames: readonly KrathongFlameAnchor[];
}

export class KrathongGlbError extends Error {
  constructor(reason: string) {
    super(`krathong design GLB: ${reason}`);
    this.name = "KrathongGlbError";
  }
}

const ANCHOR_FIELDS = 5;

function fail(reason: string): never {
  throw new KrathongGlbError(reason);
}

function parseFlames(value: unknown): KrathongFlameAnchor[] {
  if (!Array.isArray(value)) return fail("extras.krathongFlames is missing");
  if (value.length > KRATHONG_DESIGN_MAX_FLAMES) fail(`more than ${KRATHONG_DESIGN_MAX_FLAMES} flames`);
  return value.map((entry: unknown) => {
    if (!Array.isArray(entry) || entry.length !== ANCHOR_FIELDS || !entry.every((n) => typeof n === "number" && Number.isFinite(n)))
      fail("a flame anchor is not [x, y, z, height, radius]");
    const [x, y, z, height, radius] = entry as number[];
    if (!(height > 0) || !(radius > 0)) fail("a flame anchor has a non-positive size");
    return Object.freeze({ x, y, z, height, radius });
  });
}

/** Validates the contract and returns views on `buffer`. Throws KrathongGlbError naming the reason. */
export function parseKrathongDesignGlb(buffer: ArrayBuffer): KrathongDesignMeshData {
  const { mesh, extras } = parseDesignGlbCore(buffer, fail);
  const flames = parseFlames(extras.krathongFlames);
  return { ...mesh, flames: Object.freeze(flames) };
}
