// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOOK_PALETTE } from "@/config/look.config";

const DOC = join(process.cwd(), "docs/design/loy-krathong-look.md");

describe("art-direction note (MFW-47 AC1)", () => {
  it("exists and records the target, the palette and both presets", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");
    expect(doc).toContain("docs/spec/assets/loy-krathong-look-ref.png");
    const lower = doc.toLowerCase();
    for (const [key, hex] of Object.entries(LOOK_PALETTE)) expect(lower, key).toContain(hex.toLowerCase());
    expect(doc).toMatch(/\bDAY\b/);
    expect(doc).toMatch(/\bNIGHT\b/);
  });
});
