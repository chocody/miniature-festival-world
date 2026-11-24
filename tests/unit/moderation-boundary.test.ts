// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const EXTS = new Set([".ts", ".tsx", ".js", ".mjs"]);
const IMPORT_FROM = /from\s+["']([^"']+)["']/g;
const IMPURE = /\bconsole\.|\bfetch\(|process\.env|localStorage|Date\.now|Math\.random/;
const TOKEN_NAMES = /ownerToken|owner_token|privateWish|private_wish|\bconsole\./;
const HANDLER_IMPORT = /services\/api\/reportHandler\b/;

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (EXTS.has(path.extname(entry.name)) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const rel = (f: string) => path.relative(root, f).split(path.sep).join("/");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const importsOf = (src: string) => [...src.matchAll(IMPORT_FROM)].map((m) => m[1] as string);
const allowedImport = (spec: string) => spec === "@/config/moderation.config" || spec.startsWith("./");

describe("moderation boundary (invariant G, C)", () => {
  it("scanner patterns detect samples", () => {
    expect(importsOf('import x from "lodash";')).toEqual(["lodash"]);
    expect(allowedImport("lodash")).toBe(false);
    expect(IMPURE.test("Math.random()")).toBe(true);
    expect(IMPURE.test("const a = 1")).toBe(false);
    expect(TOKEN_NAMES.test("const ownerToken = 1")).toBe(true);
    expect(HANDLER_IMPORT.test('from "@/services/api/reportHandler"')).toBe(true);
  });

  const detectorFiles = walk(path.join(root, "src/services/moderation")).map(rel);

  it("detector modules import rules only from moderation.config", () => {
    expect(detectorFiles.length).toBeGreaterThan(0);
    for (const f of detectorFiles) {
      for (const spec of importsOf(read(f))) expect(allowedImport(spec), `${f} imports ${spec}`).toBe(true);
    }
  });

  it("detector is pure", () => {
    for (const f of detectorFiles) expect(IMPURE.test(read(f)), f).toBe(false);
  });

  it("report route exports only POST", () => {
    const src = read("src/app/api/reports/route.ts");
    const exports = src.match(/^export\b/gm) ?? [];
    expect(exports).toHaveLength(1);
    expect(src).toMatch(/export async function POST\(/);
  });

  it("report route and handler never touch tokens", () => {
    for (const f of ["src/app/api/reports/route.ts", "src/services/api/reportHandler.ts"]) {
      expect(TOKEN_NAMES.test(read(f)), f).toBe(false);
    }
  });

  it("client code cannot import the report handler", () => {
    const files = [
      ...walk(path.join(root, "src/components")),
      ...walk(path.join(root, "src/store")),
      ...walk(path.join(root, "src/core")),
      ...walk(path.join(root, "src/app")).filter((f) => !rel(f).startsWith("src/app/api/")),
    ];
    for (const f of files) expect(HANDLER_IMPORT.test(fs.readFileSync(f, "utf8")), rel(f)).toBe(false);
    expect(read("src/services/api/index.ts")).not.toMatch(/["']\.\/reportHandler["']/);
  });
});
