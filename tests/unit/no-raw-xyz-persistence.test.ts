// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const SCAN_DIRS = ["src/services", "src/app/api", "supabase"];
const EXTS = new Set([".ts", ".tsx", ".js", ".mjs", ".sql"]);
const FORBIDDEN: RegExp[] = [
  /from\s+["']three["']/,
  /require\(\s*["']three["']\s*\)/,
  /\bVector3\b/,
  /\.toArray\(\)/,
];

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (EXTS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

describe("no raw xyz persistence (invariant A)", () => {
  it("the scanner patterns detect a three import", () => {
    const sample = `import { Vector3 } from "three"`;
    expect(FORBIDDEN.some((re) => re.test(sample))).toBe(true);
  });

  it.each(SCAN_DIRS)("%s has no three / Vector3 / toArray()", (dir) => {
    const offenders: string[] = [];
    for (const file of walk(path.join(root, dir))) {
      const text = fs.readFileSync(file, "utf8");
      if (FORBIDDEN.some((re) => re.test(text))) offenders.push(path.relative(root, file));
    }
    expect(offenders, `offending files: ${offenders.join(", ")}`).toEqual([]);
  });
});
