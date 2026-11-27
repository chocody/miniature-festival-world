import { parseDesignGlbCore, type DesignMeshData } from "./designGlb";

/**
 * Parser of the owner-made Christmas ornament GLB written by scripts/christmas-models.mjs (MFW-101; contract in
 * docs/design/models.md §12f). Pure, no three: the typed arrays are views on the input buffer (no copy).
 */

/** The hanging point of an ornament in model-local coordinates. Render-time only (invariant A). */
export interface OrnamentHookAnchor {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface OrnamentDesignMeshData extends DesignMeshData {
  /** extras.ornamentHook, or null when the file has none (props). */
  readonly hook: OrnamentHookAnchor | null;
}

export class OrnamentGlbError extends Error {
  constructor(reason: string) {
    super(`ornament design GLB: ${reason}`);
    this.name = "OrnamentGlbError";
  }
}

const HOOK_FIELDS = 3;

function fail(reason: string): never {
  throw new OrnamentGlbError(reason);
}

function parseHook(value: unknown): OrnamentHookAnchor | null {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length !== HOOK_FIELDS || !value.every((n) => typeof n === "number" && Number.isFinite(n)))
    return fail("extras.ornamentHook is not [x, y, z]");
  const [x, y, z] = value as number[];
  return Object.freeze({ x, y, z });
}

/** Validates the contract and returns views on `buffer`. Throws OrnamentGlbError naming the reason. */
export function parseOrnamentDesignGlb(buffer: ArrayBuffer): OrnamentDesignMeshData {
  const { mesh, extras } = parseDesignGlbCore(buffer, fail);
  return Object.freeze({ ...mesh, hook: parseHook(extras.ornamentHook) });
}
