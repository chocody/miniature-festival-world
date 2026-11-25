// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/** MFW-55 AC1: exactly one Thai-capable web font, loaded with next/font in the root layout. */
const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe("web font (MFW-55)", () => {
  it("layout loads exactly one next/font/google family with the thai subset", () => {
    const layout = read("src/app/layout.tsx");
    const imports = [...layout.matchAll(/import\s*\{([^}]*)\}\s*from\s*"next\/font\/google"/g)];
    expect(imports).toHaveLength(1);
    expect(imports[0][1].split(",").map((s) => s.trim()).filter(Boolean)).toEqual(["Anuphan"]);
    expect(layout).toContain('subsets: ["thai", "latin"]');
    expect(layout).toContain('variable: "--font-anuphan"');
    expect(layout).toContain('lang="th"');
    expect(layout).not.toContain("Geist");
    expect(layout).not.toContain("Create Next App");
    expect(read("src/app/globals.css")).toContain("--font-sans: var(--font-anuphan)");
  });

  it("no other file under src/ imports next/font", () => {
    const others = walk(join(ROOT, "src"))
      .map((p) => relative(ROOT, p))
      .filter((p) => p !== "src/app/layout.tsx" && /from\s+["']next\/font/.test(read(p)));
    expect(others).toEqual([]);
  });
});
