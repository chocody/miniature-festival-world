// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { LIGHT_PRESETS, LOOK_PALETTE } from "@/config/look.config";
import { relativeLuminance } from "@/core/math/relativeLuminance";

/** MFW-55 AC1 / AC4: the design tokens live once in src/app/globals.css and meet WCAG AA over every scene colour. */
const ROOT = process.cwd();
const CSS_PATH = join(ROOT, "src/app/globals.css");
const css = () => readFileSync(CSS_PATH, "utf8");

function readTokens(): Map<string, string> {
  const source = css();
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

interface Rgba {
  readonly hex: string;
  readonly alpha: number;
}

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, "0");

function parseColor(value: string): Rgba {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return { hex: value.toUpperCase(), alpha: 1 };
  const m = /^rgb\(\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s*\/\s*([\d.]+)\s*\)$/.exec(value);
  if (!m) throw new Error(`unsupported colour ${value}`);
  return { hex: `#${hex2(+m[1])}${hex2(+m[2])}${hex2(+m[3])}`.toUpperCase(), alpha: Number(m[4]) };
}

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Alpha-blends fg over an opaque background per sRGB channel. */
function over(fg: Rgba, bgHex: string): string {
  const f = channels(fg.hex);
  const b = channels(bgHex);
  return `#${f.map((c, i) => hex2(c * fg.alpha + b[i] * (1 - fg.alpha))).join("")}`.toUpperCase();
}

function contrast(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const BACKDROPS: readonly string[] = [
  ...Object.values(LOOK_PALETTE),
  LIGHT_PRESETS.DAY.background,
  LIGHT_PRESETS.NIGHT.background,
  "#000000",
  "#FFFFFF",
];

/** Worst-case contrast of a [fg, bg] token pair; translucent tokens are blended over every backdrop. */
function worstContrast(fgName: string, bg: string): number {
  const tokens = readTokens();
  const value = (n: string) => {
    if (n.startsWith("#")) return n;
    const v = tokens.get(`--color-${n}`);
    if (v === undefined) throw new Error(`no token --color-${n}`);
    return v;
  };
  const fg = parseColor(value(fgName));
  const back = parseColor(value(bg));
  const backs = back.alpha < 1 ? BACKDROPS.map((d) => over(back, d)) : [back.hex];
  let worst = Infinity;
  for (const b of backs) {
    const front = fg.alpha < 1 ? over(fg, b) : fg.hex;
    worst = Math.min(worst, contrast(front, b));
  }
  return worst;
}

const TOKEN_NAMES = [
  "--color-stage", "--color-paper", "--color-veil", "--color-ink", "--color-ink-muted", "--color-ink-veil",
  "--color-line", "--color-track", "--color-clay", "--color-clay-strong", "--color-clay-soft", "--color-clay-ink",
  "--color-danger", "--color-danger-soft", "--color-notice", "--color-notice-soft", "--color-focus",
  "--text-caption", "--text-body", "--text-input", "--text-title", "--text-display",
  "--radius-field", "--radius-card", "--radius-sheet", "--spacing-gutter", "--spacing-card",
  "--shadow-raised", "--shadow-float", "--shadow-sheet",
  "--default-transition-duration", "--default-transition-timing-function", "--focus-ring-width", "--focus-ring-offset",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe("design tokens (MFW-55)", () => {
  it("the colour parser accepts hex and rgb() with alpha and rejects anything else", () => {
    expect(parseColor("#aabbcc")).toEqual({ hex: "#AABBCC", alpha: 1 });
    expect(parseColor("rgb(251 248 241 / 0.9)")).toEqual({ hex: "#FBF8F1", alpha: 0.9 });
    expect(() => parseColor("red")).toThrow();
    expect(over({ hex: "#FFFFFF", alpha: 0.5 }, "#000000")).toBe("#808080");
  });

  it("tokens live in one @theme static block", () => {
    const tokens = readTokens();
    for (const name of TOKEN_NAMES) expect(tokens.has(name), name).toBe(true);
    expect(tokens.get("--color-stage")!.toLowerCase()).toBe(LOOK_PALETTE.daySky.toLowerCase());
    expect(parseColor(tokens.get("--color-veil")!).hex).toBe(parseColor(tokens.get("--color-paper")!).hex);
    expect(parseColor(tokens.get("--color-ink-veil")!).hex).toBe(parseColor(tokens.get("--color-ink")!).hex);
    expect(parseColor(tokens.get("--color-veil")!).alpha).toBeLessThan(1);
  });

  it("no other CSS file defines tokens", () => {
    const cssFiles = walk(join(ROOT, "src")).filter((p) => p.endsWith(".css"));
    expect(cssFiles.map((p) => relative(ROOT, p))).toEqual(["src/app/globals.css"]);
    expect(css().split("@theme static").length - 1).toBe(1);
  });

  it("text pairs meet WCAG AA 4.5:1 over every scene colour", () => {
    const pairs: readonly [string, string][] = [
      ["ink", "veil"], ["ink-muted", "veil"], ["clay", "veil"], ["ink", "paper"], ["ink-muted", "paper"],
      ["ink-muted", "#FFFFFF"], ["clay-ink", "clay"], ["clay-ink", "clay-strong"], ["ink", "clay-soft"],
      ["danger", "danger-soft"], ["notice", "notice-soft"], ["paper", "ink-veil"], ["clay", "paper"],
      ["ink", "stage"], ["ink-muted", "stage"],
    ];
    for (const [fg, bg] of pairs) expect(worstContrast(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  it("non-text pairs meet 3:1", () => {
    const pairs: readonly [string, string][] = [
      ["focus", "paper"], ["focus", "veil"], ["track", "paper"], ["track", "veil"], ["clay", "paper"], ["clay", "veil"],
    ];
    for (const [fg, bg] of pairs) expect(worstContrast(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
  });

  it("reduced motion switches every UI transition off", () => {
    const source = css();
    const media = source.indexOf("@media (prefers-reduced-motion: reduce)");
    const attr = source.indexOf('[data-reduced-motion="true"]');
    expect(media).toBeGreaterThanOrEqual(0);
    expect(attr).toBeGreaterThanOrEqual(0);
    for (const start of [media, attr]) {
      const block = source.slice(start, source.indexOf("}", source.indexOf("{", start)) + 1);
      expect(block).toContain("transition: none !important");
      expect(block).toContain("animation: none !important");
    }
  });

  it("the focus ring uses the tokens", () => {
    const source = css();
    expect(source).toContain(":focus-visible");
    expect(source).toContain("outline: var(--focus-ring-width) solid var(--color-focus)");
    expect(source).toContain("outline-offset: var(--focus-ring-offset)");
  });
});
