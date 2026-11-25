// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const SPECIFIER = /\b(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g;
function specifiers(source: string): string[] {
  return [...source.matchAll(SPECIFIER)].map((m) => m[1] ?? m[2]);
}

const ALLOWED: Record<string, readonly string[]> = {
  "src/config/myCreations.config.ts": [],
  "src/services/auth/myCreationsVault.ts": [
    "@/config/events/types",
    "@/config/ownership.config",
    "@/config/myCreations.config",
    "@/core/world/zoneManager",
    "./deviceOwnerToken",
    "@/services/api/creationTypes",
  ],
  "src/services/api/findMyCreation.ts": ["@/config/events/types", "@/core/world/zoneManager", "@/store/useWorldStore", "./zonePagination"],
  "src/components/ui/MyCreationsDrawer.tsx": [
    "react",
    "@/config/myCreations.config",
    "@/services/api/findMyCreation",
    "@/services/auth/myCreationsVault",
    "@/store/useWorldStore",
  ],
};
const FILES = Object.keys(ALLOWED);

describe("find-my import boundary (MFW-30)", () => {
  it("the specifier scanner sees imports, re-exports and dynamic imports", () => {
    expect(specifiers('import { a } from "x";\nexport * from "y";\nconst m = import("z");')).toEqual(["x", "y", "z"]);
  });

  it("landing-path files import only from the allowlist", () => {
    for (const [file, allowed] of Object.entries(ALLOWED)) {
      const extra = [...new Set(specifiers(read(file)))].filter((f) => !allowed.includes(f));
      expect({ file, extra }).toEqual({ file, extra: [] });
    }
  });

  it("never touches the owner token", () => {
    const re = /getDeviceOwnerVault|createDeviceOwnerVault|DEVICE_OWNER_TOKEN_STORAGE_KEY|getOrCreate|ownerToken|Authorization/;
    for (const file of FILES) expect({ file, hit: re.test(read(file)) }).toEqual({ file, hit: false });
    const line = read("src/services/auth/myCreationsVault.ts").match(/import\s*\{([^}]*)\}\s*from\s*"\.\/deviceOwnerToken"/);
    expect(line?.[1].trim()).toBe("getBrowserLocalStorage");
  });

  it("no console, no fetch, no localStorage literal", () => {
    for (const file of FILES) {
      const src = read(file);
      for (const re of [/console\./, /\bfetch\(/, /localStorage/]) expect({ file, re: String(re), hit: re.test(src) }).toEqual({ file, re: String(re), hit: false });
    }
  });

  it("no private names", () => {
    const re = /owner_?token|private_?wish|wishText|publicWishText/i;
    for (const file of FILES) {
      let src = read(file);
      if (file.endsWith("myCreationsVault.ts")) src = src.replace(/^.*from "\.\/deviceOwnerToken";\n/m, "");
      expect({ file, hit: re.test(src) }).toEqual({ file, hit: false });
    }
  });

  it("FlowRoot does not pull in the world barrel or three", () => {
    const specs = specifiers(read("src/components/ui/FlowRoot.tsx"));
    expect(specs).not.toContain("@/core/world");
    expect(specs.filter((s) => /^(three|@react-three|@react-spring)/.test(s))).toEqual([]);
  });

  it("FindMyAnchor puts no data-* prop on the R3F group", () => {
    expect(read("src/components/canvas3d/FindMyAnchor.tsx")).not.toMatch(/data-/);
  });
});
