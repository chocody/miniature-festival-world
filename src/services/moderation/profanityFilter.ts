import { PROFANITY_EN, PROFANITY_LEET_MAP, PROFANITY_TH, PROFANITY_TH_ALLOWLIST } from "@/config/moderation.config";
import { normalizeForModeration } from "./normalize";

/** Removed before Thai substring matching, so "เ ห ี้ ย" and "เ-หี้-ย" still match. */
const THAI_COMPACT_STRIP = /[\s\-_.*~'"`]+/g;
/** Replaces an allowlisted word; it is not part of any Thai term, so it breaks matches across the removed word. */
const ALLOWLIST_PLACEHOLDER = "|";
const LEET = new Map<string, string>(Object.entries(PROFANITY_LEET_MAP));
const LATIN_WORD = /[a-z]+/g;

/** True when `text` contains a Thai or English banned word (moderation.config.ts lists). Pure. */
export function containsProfanity(text: string): boolean {
  const normalized = normalizeForModeration(text);

  let compact = normalized.replace(THAI_COMPACT_STRIP, "");
  for (const allowed of PROFANITY_TH_ALLOWLIST) compact = compact.split(allowed).join(ALLOWLIST_PLACEHOLDER);
  if (PROFANITY_TH.some((term) => compact.includes(term))) return true;

  const latin = Array.from(normalized, (c) => LEET.get(c) ?? c).join("");
  for (const word of latin.match(LATIN_WORD) ?? []) {
    for (const { term, match } of PROFANITY_EN) {
      const hit = match === "word" ? word === term : match === "prefix" ? word.startsWith(term) : word.includes(term);
      if (hit) return true;
    }
  }
  return false;
}
