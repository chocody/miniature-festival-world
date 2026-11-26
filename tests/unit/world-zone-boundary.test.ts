// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const SPECIFIER = /\b(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g;
function specifiers(source: string): string[] {
  return [...source.matchAll(SPECIFIER)].map((m) => m[1] ?? m[2]);
}

const ALLOWED: Record<string, readonly string[]> = {
  "src/services/api/apiPaths.ts": [],
  "src/services/api/zoneClient.ts": ["@/config/events/types", "@/config/world.config", "./apiPaths", "./creationTypes"],
  "src/services/api/zonePagination.ts": [
    "@/config/events/types",
    "@/config/world.config",
    "@/core/world/zoneManager",
    "@/core/world/riverStretches", // MFW-58: the zone ↔ stretch mapping (three-free)
    "@/store/useWorldStore",
    "./creationTypes", // MFW-58: type-only (the streamed zone map)
    "./zoneClient",
  ],
  // MFW-58: three-free zone ↔ stretch mapping; its frame import is type-only.
  "src/core/world/riverStretches.ts": ["@/config/world.config", "@/core/coordinates/endlessRiverFrame"],
  "src/core/world/zoneManager.ts": ["@/config/world.config"],
  "src/core/world/growingWorldScaler.ts": ["@/config/world.config"],
  "src/store/useWorldStore.ts": ["zustand", "@/config/events/types", "@/core/world/riverStretches", "@/services/api/creationTypes"],
  "src/components/ui/ZoneNavigator.tsx": [
    "react",
    "@/core/world/growingWorldScaler",
    "@/services/api/zonePagination",
    "@/store/useWorldStore",
    "./uiClasses", // MFW-55: class-string constants only (no imports)
  ],
};

const listDir = (dir: string, re: RegExp) =>
  readdirSync(join(ROOT, dir)).filter((f) => re.test(f) && !/\.test\./.test(f)).map((f) => `${dir}/${f}`);
const ZONE_FILES = [
  ...listDir("src/core/world", /^zone.*\.ts$/),
  "src/core/world/riverVisibility.ts",
  "src/core/world/growingWorldScaler.ts",
  ...listDir("src/services/api", /^zone.*\.ts$/),
  "src/components/ui/ZoneNavigator.tsx",
];

describe("world / zone import boundary", () => {
  it("landing-path files import only from the allowlist", () => {
    for (const [file, allowed] of Object.entries(ALLOWED)) {
      const found = [...new Set(specifiers(read(file)))];
      const extra = found.filter((f) => !allowed.includes(f));
      expect({ file, extra }).toEqual({ file, extra: [] });
    }
  });

  it("type-only modules have no value imports", () => {
    for (const file of ["src/services/api/creationTypes.ts", "src/config/world.config.ts"]) {
      expect(read(file)).not.toMatch(/^import (?!type\b)/m);
    }
  });

  it("FlowRoot does not pull in the world barrel or the 3D mapper", () => {
    const found = specifiers(read("src/components/ui/FlowRoot.tsx"));
    expect(found).not.toContain("@/core/world");
    expect(found.some((s) => s.includes("zoneRiverItems"))).toBe(false);
  });

  it("creates no per-zone three resources", () => {
    for (const file of ZONE_FILES) {
      expect({ file, hit: /new\s+\w*(Geometry|Material|Texture)\b/.test(read(file)) }).toEqual({ file, hit: false });
    }
  });

  it("never logs", () => {
    for (const file of ZONE_FILES) expect({ file, hit: /console\./.test(read(file)) }).toEqual({ file, hit: false });
  });

  it("never touches the owner token or auth headers on the client", () => {
    const pattern = /deviceOwnerToken|getDeviceOwnerVault|ownerToken|Authorization/;
    for (const file of ["src/services/api/zoneClient.ts", "src/services/api/zonePagination.ts", "src/components/ui/ZoneNavigator.tsx"]) {
      expect({ file, hit: pattern.test(read(file)) }).toEqual({ file, hit: false });
    }
  });

  it("the specifier regex works (self-check)", () => {
    const sample = ["im", "port { a } fr", "om \"./a\";\nex", "port * fr", "om '@/b';\nconst c = im", "port('./c');"].join("");
    expect(specifiers(sample)).toEqual(["./a", "@/b", "./c"]);
  });
});
