// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const ENTRY = "src/app/page.tsx";
const FORBIDDEN = /^(three|@react-three\/|@react-spring\/)/;
const STATIC_IMPORT = /(?:^|[\n;])\s*(import|export)\s+([^;"']*?)\s*from\s*["']([^"']+)["']/g;
const SIDE_EFFECT_IMPORT = /(?:^|[\n;])\s*import\s*["']([^"']+)["']/g;

/** Specifiers of static VALUE imports/re-exports (type-only imports and dynamic import() are skipped). */
function staticValueSpecifiers(source: string): string[] {
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
  return out;
}

function resolveLocal(spec: string, from: string): string | null {
  const base = spec.startsWith("@/") ? path.join(ROOT, "src", spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (base === null) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (existsSync(candidate) && /\.tsx?$/.test(candidate)) return candidate;
  }
  return null;
}

function findForbidden(entry: string, seen: Set<string> = new Set<string>([entry])): string[] | null {
  const queue: string[][] = [[entry]];
  while (queue.length > 0) {
    const chain = queue.shift()!;
    const file = chain[chain.length - 1];
    for (const spec of staticValueSpecifiers(readFileSync(file, "utf8"))) {
      if (FORBIDDEN.test(spec)) return [...chain.map((f) => path.relative(ROOT, f)), spec];
      const next = resolveLocal(spec, file);
      if (next !== null && !seen.has(next)) {
        seen.add(next);
        queue.push([...chain, next]);
      }
    }
  }
  return null;
}

describe("landing import graph (MFW-44)", () => {
  it("positive control: value imports of three are detected, type imports are not", () => {
    expect(staticValueSpecifiers('import { Vector3 } from "three";').some((s) => FORBIDDEN.test(s))).toBe(true);
    expect(staticValueSpecifiers('import type { X } from "three";')).toEqual([]);
    expect(staticValueSpecifiers('import { type A, type B } from "three";')).toEqual([]);
    expect(staticValueSpecifiers('const m = import("three");')).toEqual([]);
  });

  it("src/app/page.tsx reaches no three / R3F / react-spring module", () => {
    const entry = path.join(ROOT, ENTRY);
    const seen = new Set<string>([entry]);
    const chain = findForbidden(entry, seen);
    expect(chain, chain?.join(" -> ")).toBeNull();
    // The walk really covers the release path (guards against a resolver that silently stops).
    expect(seen.has(path.join(ROOT, "src/services/api/releaseCreation.ts"))).toBe(true);
    expect(seen.has(path.join(ROOT, "src/core/ritual/index.ts"))).toBe(true);
    expect(seen.has(path.join(ROOT, "src/components/ui/MyCreationsDrawer.tsx"))).toBe(true);
  });
});
