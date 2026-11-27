import { ORNAMENT_DEFAULT_DESIGN, ORNAMENT_DESIGN_IDS, type OrnamentDesignId } from "@/config/ornamentDesigns.config";
import type { AppearanceParseResult, OrnamentAppearance } from "./types";

/** The exact key set of a stored christmas appearance (MFW-92). */
export const ORNAMENT_APPEARANCE_KEYS = ["design"] as const;

export const DEFAULT_ORNAMENT_APPEARANCE: OrnamentAppearance = Object.freeze({ design: ORNAMENT_DEFAULT_DESIGN });

function isPlainObject(input: unknown): input is Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const proto = Object.getPrototypeOf(input);
  return proto === Object.prototype || proto === null;
}

/** Write-path gate for creations_public.appearance of christmas: a fresh {design} copy or a reason. Never throws. */
export function parseOrnamentAppearance(input: unknown): AppearanceParseResult<OrnamentAppearance> {
  if (!isPlainObject(input)) return { ok: false, reason: "appearance must be a plain object" };
  const allowed: readonly string[] = ORNAMENT_APPEARANCE_KEYS;
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) return { ok: false, reason: `unknown key: ${key}` };
  }
  if (!Object.prototype.hasOwnProperty.call(input, "design")) return { ok: false, reason: "missing key: design" };
  const design = input.design;
  if (typeof design !== "string" || !(ORNAMENT_DESIGN_IDS as readonly string[]).includes(design)) {
    return { ok: false, reason: "design is not a known ornament design" };
  }
  return { ok: true, appearance: { design: design as OrnamentDesignId } };
}
