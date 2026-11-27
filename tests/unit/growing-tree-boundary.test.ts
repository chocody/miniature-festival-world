// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/* MFW-93: the growing-tree model and its configs stay three-free and deterministic (server and client share them). */
const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
// Same specifier regex as world-zone-boundary.test.ts (copied, not imported).
const SPECIFIER = /\b(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g;
function specifiers(source: string): string[] {
  return [...source.matchAll(SPECIFIER)].map((m) => m[1] ?? m[2]);
}

const MODEL = "src/core/world/growingTree.ts";
const TREE_CONFIG = "src/config/events/christmas.tree.config.ts";
const CAMERA_CONFIG = "src/config/events/christmas.camera.config.ts";
const MODEL_ALLOWED = ["@/config/world.config", "@/core/coordinates/CylindricalCoord", "@/core/coordinates/types"];

describe("growing tree import boundary (MFW-93)", () => {
  it("B1 imports only from the allowlist", () => {
    const extra = [...new Set(specifiers(read(MODEL)))].filter((s) => !MODEL_ALLOWED.includes(s));
    expect(extra).toEqual([]);
    expect(specifiers(read(CAMERA_CONFIG))).toEqual([]);
    const treeConfig = read(TREE_CONFIG);
    expect([...new Set(specifiers(treeConfig))]).toEqual(["@/core/world/growingTree"]);
    const importLines = treeConfig.split("\n").filter((l) => /^\s*import\b/.test(l));
    expect(importLines.length).toBeGreaterThan(0);
    for (const line of importLines) expect(line).toMatch(/^\s*import type\b/);
  });

  it("B2 no three, no Vector3, no randomness or clock", () => {
    for (const file of [MODEL, TREE_CONFIG, CAMERA_CONFIG]) {
      const source = read(file);
      expect({ file, three: specifiers(source).filter((s) => /^(three|@react-three\/)/.test(s)) }).toEqual({ file, three: [] });
      for (const banned of ["Vector3", "Math.random", "Date.now"]) {
        expect({ file, banned, hit: source.includes(banned) }).toEqual({ file, banned, hit: false });
      }
    }
  });
});
