import { STAR_DEFAULT_DESIGN, STAR_DESIGN_IDS, type StarDesignId } from "@/config/starDesigns.config";
import type { AppearanceParseResult, StarAppearance } from "./types";

/** The exact key set of a stored new_year appearance (MFW-131). */
export const STAR_APPEARANCE_KEYS = ["design"] as const;

export const DEFAULT_STAR_APPEARANCE: StarAppearance = Object.freeze({ design: STAR_DEFAULT_DESIGN });

function isPlainObject(input: unknown): input is Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const proto = Object.getPrototypeOf(input);
  return proto === Object.prototype || proto === null;
}

/** Write-path gate for creations_public.appearance of new_year: a fresh {design} copy or a reason. Never throws. */
export function parseStarAppearance(input: unknown): AppearanceParseResult<StarAppearance> {
  if (!isPlainObject(input)) return { ok: false, reason: "appearance must be a plain object" };
  const allowed: readonly string[] = STAR_APPEARANCE_KEYS;
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) return { ok: false, reason: `unknown key: ${key}` };
  }
  if (!Object.prototype.hasOwnProperty.call(input, "design")) return { ok: false, reason: "missing key: design" };
  const design = input.design;
  if (typeof design !== "string" || !(STAR_DESIGN_IDS as readonly string[]).includes(design)) {
    return { ok: false, reason: "design is not a known star design" };
  }
  return { ok: true, appearance: { design: design as StarDesignId } };
}
