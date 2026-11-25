// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** MFW-55 AC1 / AC5: docs/design/ui.md documents every token verbatim and links existing before / after screenshots. */
const ROOT = process.cwd();
const DOC_PATH = join(ROOT, "docs/design/ui.md");

function readTokens(): Map<string, string> {
  const source = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");
  const start = source.indexOf("@theme static {");
  if (start < 0) throw new Error("no @theme static block");
  const body = source.slice(start + "@theme static {".length, source.indexOf("}", start));
  const tokens = new Map<string, string>();
  for (const line of body.split("\n")) {
    const m = /^\s*(--[\w-]+):\s*(.+?);\s*$/.exec(line);
    if (m) tokens.set(m[1], m[2]);
  }
  return tokens;
}

describe("docs/design/ui.md (MFW-55)", () => {
  it("ui.md lists every token verbatim", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
    const doc = readFileSync(DOC_PATH, "utf8");
    const tokens = readTokens();
    expect(tokens.size).toBeGreaterThan(30);
    for (const [name, value] of tokens) expect(doc, name).toContain(`${name}: ${value}`);
  });

  it("ui.md names the font, the rules and existing screenshots", () => {
    const doc = readFileSync(DOC_PATH, "utf8");
    for (const needle of [
      "Anuphan",
      "next/font",
      "MIN_TOUCH_TARGET_PX",
      "prefers-reduced-motion",
      "data-ui-emphasis",
      "DRAFT",
      "docs/spec/assets/loy-krathong-look-ref.png",
    ]) {
      expect(doc, needle).toContain(needle);
    }
    const links = [...doc.matchAll(/screenshots\/mfw-55\/([\w-]+\.png)/g)].map((m) => m[1]);
    for (const file of links) expect(existsSync(join(ROOT, "docs/design/screenshots/mfw-55", file)), file).toBe(true);
    expect(new Set(links.filter((f) => f.startsWith("before-"))).size).toBeGreaterThanOrEqual(8);
    expect(new Set(links.filter((f) => f.startsWith("after-"))).size).toBeGreaterThanOrEqual(8);
  });
});
