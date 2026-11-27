// @vitest-environment node
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * MFW-66 perf: the generated house model (and the scene parts of loyKrathong.river.config.ts that use it) must stay in the
 * lazy canvas chunk. The eager graph is every runtime (non-type) static import reachable from the app entry files;
 * dynamic `import()` (FlowRoot's lazy canvas) ends the walk.
 */
const ROOT = process.cwd();
const ENTRIES = ["src/app/layout.tsx", "src/app/page.tsx"];
const HOUSE_MODEL = "src/config/events/loyKrathong.houseModel.ts";
const RIVER_CONFIG = "src/config/events/loyKrathong.river.config.ts";
const RIVER_LANE_CONFIG = "src/config/events/loyKrathong.riverLane.config.ts";

/** Static runtime imports and re-exports at line start; `import type` / `export type` and `import()` are not matched. */
const STATIC_SPECIFIER = /^\s*(?:import|export)\s+(?!type\b)(?:[^;'"]*?\bfrom\s+)?["']([^"']+)["']/gm;

function staticSpecifiers(source: string): string[] {
  return [...source.matchAll(STATIC_SPECIFIER)].map((m) => m[1]);
}

function resolveLocal(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = join(dirname(join(ROOT, fromFile)), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile()) return relative(ROOT, c);
  }
  return null;
}

/** Every local file reachable through static runtime imports, mapped to the file that first imported it. */
function eagerGraph(entries: readonly string[]): Map<string, string | null> {
  const parent = new Map<string, string | null>(entries.map((e) => [e, null]));
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.shift()!;
    for (const spec of staticSpecifiers(readFileSync(join(ROOT, file), "utf8"))) {
      const next = resolveLocal(file, spec);
      if (next && !parent.has(next)) {
        parent.set(next, file);
        queue.push(next);
      }
    }
  }
  return parent;
}

function chain(graph: Map<string, string | null>, file: string): string[] {
  const out: string[] = [];
  for (let f: string | null | undefined = file; f; f = graph.get(f)) out.unshift(f);
  return out;
}

describe("river config import boundary (MFW-66)", () => {
  it("the scanner sees static imports and re-exports, not type-only or dynamic imports", () => {
    const src = [
      'import { a } from "a";',
      'import {\n  b,\n  type B,\n} from "b";',
      'import "c";',
      'export { d } from "d";',
      'import type { E } from "e";',
      'export type { F } from "f";',
      'const g = () => import("g");',
    ].join("\n");
    expect(staticSpecifiers(src)).toEqual(["a", "b", "c", "d"]);
  });

  it("the eager graph does not reach the house model or the scene-part river config", () => {
    const graph = eagerGraph(ENTRIES);
    expect(graph.has("src/components/ui/FlowRoot.tsx")).toBe(true);
    expect(graph.has("src/services/api/releaseCreation.ts")).toBe(true);
    expect(graph.has(RIVER_LANE_CONFIG)).toBe(true);
    for (const file of [HOUSE_MODEL, RIVER_CONFIG]) {
      expect({ file, via: graph.has(file) ? chain(graph, file) : null }).toEqual({ file, via: null });
    }
  });

  it("the lazy canvas still reaches the house model (the walk would see a regression)", () => {
    const graph = eagerGraph(["src/components/canvas3d/index.tsx"]);
    expect(graph.has(RIVER_CONFIG)).toBe(true);
    expect(graph.has(HOUSE_MODEL)).toBe(true);
  });

  it("the light lane module imports only plain config", () => {
    const specs = staticSpecifiers(readFileSync(join(ROOT, RIVER_LANE_CONFIG), "utf8"));
    expect(specs).toEqual(["@/config/riverFlow.config", "@/config/ritual.config"]);
  });
});
