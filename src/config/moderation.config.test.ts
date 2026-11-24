// @vitest-environment node
import { describe, expect, it } from "vitest";
import { normalizeForModeration } from "@/services/moderation/normalize";
import {
  AUTO_HIDE_MODERATION_STATUS,
  AUTO_HIDE_REPORT_THRESHOLD,
  DEFAULT_MODERATION_STATUS,
  EMAIL_OBFUSCATED_TLDS,
  ID_KEYWORDS_LATIN,
  LINE_KEYWORDS_LATIN,
  LINE_KEYWORDS_THAI,
  MODERATION_COPY,
  MODERATION_REASONS,
  MODERATION_STATUSES,
  PHONE_MAX_DIGITS,
  PROFANITY_EN,
  PROFANITY_TH,
  PROFANITY_TH_ALLOWLIST,
  SOCIAL_KEYWORDS_LATIN,
  SOCIAL_KEYWORDS_THAI,
  SOCIAL_PROFILE_DOMAINS,
  THAI_PHONE_PATTERNS,
} from "./moderation.config";

describe("moderation.config", () => {
  it("auto-hide settings", () => {
    expect(AUTO_HIDE_REPORT_THRESHOLD).toBe(3);
    expect(MODERATION_STATUSES).toContain(AUTO_HIDE_MODERATION_STATUS);
    expect(AUTO_HIDE_MODERATION_STATUS).not.toBe(DEFAULT_MODERATION_STATUS);
  });

  it("copy covers every reason with non-empty text", () => {
    expect(Object.keys(MODERATION_COPY.reasons).sort()).toEqual([...MODERATION_REASONS].sort());
    for (const text of [
      MODERATION_COPY.publicHint,
      MODERATION_COPY.blockedTitle,
      MODERATION_COPY.fixHint,
      ...Object.values(MODERATION_COPY.reasons),
    ]) {
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it("Latin literals are lowercase", () => {
    const latin = [
      ...LINE_KEYWORDS_LATIN,
      ...ID_KEYWORDS_LATIN,
      ...SOCIAL_KEYWORDS_LATIN,
      ...SOCIAL_PROFILE_DOMAINS,
      ...EMAIL_OBFUSCATED_TLDS,
      ...PROFANITY_EN.map((t) => t.term),
    ];
    for (const x of latin) expect(x).toBe(normalizeForModeration(x));
    for (const { term } of PROFANITY_EN) expect(term).toMatch(/^[a-z]+$/);
  });

  it("Thai literals are already normalized", () => {
    for (const x of [...PROFANITY_TH, ...PROFANITY_TH_ALLOWLIST, ...LINE_KEYWORDS_THAI, ...SOCIAL_KEYWORDS_THAI]) {
      expect(x).toBe(normalizeForModeration(x));
    }
    for (const x of [...PROFANITY_TH, ...PROFANITY_TH_ALLOWLIST]) {
      expect(x.length).toBeGreaterThan(0);
      expect(x).not.toMatch(/\s/);
    }
  });

  it("allowlist entries each contain a banned term and are not banned themselves", () => {
    for (const a of PROFANITY_TH_ALLOWLIST) {
      expect(PROFANITY_TH.some((t) => a.includes(t))).toBe(true);
      expect(PROFANITY_TH.includes(a)).toBe(false);
    }
  });

  it("phone patterns are anchored and non-global", () => {
    for (const p of THAI_PHONE_PATTERNS) {
      expect(p.source.startsWith("^")).toBe(true);
      expect(p.source.endsWith("$")).toBe(true);
      expect(p.flags).not.toMatch(/[gy]/);
    }
    expect(PHONE_MAX_DIGITS).toBe(11);
  });

  it("exported collections are frozen", () => {
    for (const x of [
      MODERATION_REASONS,
      LINE_KEYWORDS_LATIN,
      LINE_KEYWORDS_THAI,
      ID_KEYWORDS_LATIN,
      SOCIAL_KEYWORDS_LATIN,
      SOCIAL_KEYWORDS_THAI,
      SOCIAL_PROFILE_DOMAINS,
      EMAIL_OBFUSCATED_TLDS,
      THAI_PHONE_PATTERNS,
      PROFANITY_TH,
      PROFANITY_TH_ALLOWLIST,
      PROFANITY_EN,
      MODERATION_COPY,
      MODERATION_COPY.reasons,
    ]) {
      expect(Object.isFrozen(x)).toBe(true);
    }
  });
});
