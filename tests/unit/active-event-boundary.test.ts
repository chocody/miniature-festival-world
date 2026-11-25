// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { ACTIVE_EVENT_OVERRIDE } from "../../src/config/activeEvent.config";
import { E2E_EVENT_ID } from "../e2e/fixtures/zoneFixtures";

const ROOT = join(__dirname, "..", "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const rel = (p: string) => relative(ROOT, p).split("\\").join("/");
const isCode = (p: string) => /\.(ts|tsx)$/.test(p) && !/\.test\.(ts|tsx)$/.test(p);
const srcFiles = walk(join(ROOT, "src")).filter(isCode);
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("active event boundary", () => {
  it("only the server resolver imports the override", () => {
    const importers = srcFiles.filter((f) => /activeEvent\.config["']/.test(readFileSync(f, "utf8"))).map(rel);
    expect(importers).toEqual(["src/services/api/activeEvent.ts"]);
  });

  it("no client module reaches the server resolver", () => {
    const importers = srcFiles
      .filter((f) => {
        const text = readFileSync(f, "utf8");
        return (
          /from\s+["']@\/services\/api\/activeEvent["']/.test(text) ||
          (f.includes("/services/api/") && /from\s+["']\.\/activeEvent["']/.test(text))
        );
      })
      .map(rel)
      .filter((f) => f !== "src/services/api/activeEvent.ts")
      .sort();
    expect(importers).toEqual(["src/app/page.tsx", "src/services/api/createCreation.ts"]);
    for (const f of [
      "src/config/activeEvent.config.ts",
      "src/services/api/activeEvent.ts",
      "src/app/page.tsx",
      "src/components/ui/ActiveEventView.tsx",
      "src/components/ui/NoActiveEventScreen.tsx",
    ]) {
      expect(read(f).trimStart().startsWith('"use client"')).toBe(false);
    }
    expect(read("src/services/api/index.ts")).not.toContain("activeEvent");
  });

  it("the override is not an env var", () => {
    for (const f of ["src/config/activeEvent.config.ts", "src/services/api/activeEvent.ts"]) {
      expect(read(f)).not.toMatch(/process\.env|NEXT_PUBLIC/);
    }
  });

  it("no selector or Coming Soon copy is left in src/components or src/app", () => {
    const banned = ["Coming Soon", "EventSelector", "เลือกเทศกาล", "LANDING_EVENT_SELECT", "SELECT_EVENT"];
    const files = srcFiles.map(rel).filter((f) => f.startsWith("src/components/") || f.startsWith("src/app/"));
    for (const f of files) for (const word of banned) expect(read(f), `${f} contains ${word}`).not.toContain(word);
  });

  it("e2e active event matches the override", () => {
    expect(E2E_EVENT_ID).toBe(ACTIVE_EVENT_OVERRIDE);
  });
});
