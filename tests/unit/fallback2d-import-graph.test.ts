// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const ENTRIES = [
  "src/components/canvas2d/index.ts",
  "src/core/fallback2d/flat.ts",
  "src/core/world/zoneRiverItems.ts",
  "src/core/coordinates/validateCoord.ts",
  "src/core/coordinates/splineProgress.ts",
  "src/core/coordinates/CylindricalCoord.ts",
];
const FORBIDDEN_SPECIFIER = /^(three|@react-three\/|@react-spring\/)/;
const FORBIDDEN_DIRS = ["src/components/canvas3d/", "src/components/models/"];
const STATIC_IMPORT = /(?:^|[\n;])\s*(import|export)\s+([^;"']*?)\s*from\s*["']([^"']+)["']/g;
const SIDE_EFFECT_IMPORT = /(?:^|[\n;])\s*import\s*["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

/** Specifiers of static value imports/re-exports AND dynamic import(); type-only imports are skipped. */
export function valueSpecifiers(raw: string): string[] {
  const source = stripComments(raw);
  const out: string[] = [];
  for (const m of source.matchAll(STATIC_IMPORT)) {
    const clause = m[2].trim();
    if (/^type\b/.test(clause)) continue;
    const named = /^\{([\s\S]*)\}$/.exec(clause);
    if (named) {
      const members = named[1].split(",").map((x) => x.trim()).filter(Boolean);
      if (members.length > 0 && members.every((x) => x.startsWith("type "))) continue;
    }
    out.push(m[3]);
  }
  for (const m of source.matchAll(SIDE_EFFECT_IMPORT)) out.push(m[1]);
  for (const m of source.matchAll(DYNAMIC_IMPORT)) out.push(m[1]);
  return out;
}

function resolveLocal(spec: string, from: string): string | null {
  const base = spec.startsWith("@/")
    ? path.join(ROOT, "src", spec.slice(2))
    : spec.startsWith(".")
      ? path.resolve(path.dirname(from), spec)
      : null;
  if (base === null) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (existsSync(candidate) && /\.tsx?$/.test(candidate)) return candidate;
  }
  return null;
}

function findForbidden(entry: string, seen: Set<string>): string[] | null {
  const queue: string[][] = [[entry]];
  while (queue.length > 0) {
    const chain = queue.shift()!;
    const file = chain[chain.length - 1];
    const rel = path.relative(ROOT, file);
    if (FORBIDDEN_DIRS.some((d) => rel.startsWith(d))) return chain.map((f) => path.relative(ROOT, f));
    for (const spec of valueSpecifiers(readFileSync(file, "utf8"))) {
      if (FORBIDDEN_SPECIFIER.test(spec)) return [...chain.map((f) => path.relative(ROOT, f)), spec];
      const next = resolveLocal(spec, file);
      if (next !== null && !seen.has(next)) {
        seen.add(next);
        queue.push([...chain, next]);
      }
    }
  }
  return null;
}

describe("FALLBACK_2D import graph is three-free (MFW-33, MFW-44)", () => {
  it("positive controls on fixture strings", () => {
    const hits = (src: string) => valueSpecifiers(src).some((s) => FORBIDDEN_SPECIFIER.test(s));
    expect(hits('import { Vector3 } from "three";')).toBe(true);
    expect(hits('import {\n  Vector3,\n} from "three";')).toBe(true);
    expect(hits('const m = await import("three");')).toBe(true);
    expect(hits('import type { X } from "three";')).toBe(false);
    expect(hits('import { type X } from "three";')).toBe(false);
    expect(hits('// import { Vector3 } from "three";')).toBe(false);
  });

  it.each(ENTRIES)("%s reaches no three / R3F / react-spring / 3D scene module", (entry) => {
    const start = path.join(ROOT, entry);
    const seen = new Set<string>([start]);
    const chain = findForbidden(start, seen);
    expect(chain, chain?.join(" -> ")).toBeNull();
    expect(seen.size).toBeGreaterThanOrEqual(1);
  });

  it("the walk covers the river view's real dependencies (guards a silent resolver)", () => {
    const start = path.join(ROOT, ENTRIES[0]);
    const seen = new Set<string>([start]);
    findForbidden(start, seen);
    for (const f of [
      "src/components/canvas2d/FlatRiverView.tsx",
      "src/core/fallback2d/flatLane.ts",
      "src/core/world/zoneRiverItems.ts",
      "src/components/ui/InspectPopup.tsx",
      "src/core/ritual/ownKrathong.ts",
    ]) {
      expect(seen.has(path.join(ROOT, f)), f).toBe(true);
    }
  });
});
