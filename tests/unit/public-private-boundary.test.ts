// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const EXTS = new Set([".ts", ".tsx", ".js", ".mjs"]);

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

const rel = (f: string): string => path.relative(root, f).split(path.sep).join("/");
const isTest = (f: string): boolean => /\.test\.tsx?$/.test(f);
const read = (f: string): string => fs.readFileSync(f, "utf8");
const filesUnder = (dir: string): string[] => walk(path.join(root, dir));
const nonTest = (dirs: string[]): string[] => dirs.flatMap(filesUnder).filter((f) => !isTest(f));

const STAR_SELECT = /select\s*\(\s*["']\*["']\s*\)|select=\*|["']\*["']/;
const PRIVATE_SNAKE = /owner_token_hash|private_wish_text|private_wish_key_id|private_display_name|\bowner_token\b/;
const PRIVATE_CAMEL = /ownerTokenHash|privateWish|ownerToken/;
// The env var name itself; identifiers such as SUPABASE_SERVICE_ROLE_KEY_ENV (the constant) are not the literal.
const SERVICE_ROLE_ENV = /SUPABASE_SERVICE_ROLE_KEY(?!_ENV)/;
const SERVER_MODULES =
  /services\/api\/(creationRepository|creationRepositoryFactory|supabaseCreationRepository|inMemoryCreationRepository|listCreations|creationValidation|publicCreation)\b/;
const BARREL_SERVER_EXPORT =
  /from\s+["']\.\/(creationRepository|creationRepositoryFactory|supabaseCreationRepository|inMemoryCreationRepository|listCreations|creationValidation|publicCreation)["']/;

describe("public/private boundary (invariants C and D)", () => {
  it("no console in server data code", () => {
    const offenders = nonTest(["src/services/api", "src/app/api", "src/config"])
      .filter((f) => /\bconsole\./.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("no star selects", () => {
    const offenders = nonTest(["src/services/api", "src/app/api"])
      .filter((f) => STAR_SELECT.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("service-role env name lives only in database.config.ts", () => {
    const all = filesUnder("src");
    const holders = all.filter((f) => !isTest(f) && SERVICE_ROLE_ENV.test(read(f))).map(rel);
    expect(holders).toEqual(["src/config/database.config.ts"]);
    expect(all.filter((f) => read(f).includes("NEXT_PUBLIC_SUPABASE_SERVICE")).map(rel)).toEqual([]);
  });

  it("client code cannot import server data modules", () => {
    const clientFiles = [
      ...filesUnder("src/components"),
      ...filesUnder("src/store"),
      ...filesUnder("src/core"),
      ...filesUnder("src/app").filter((f) => !rel(f).startsWith("src/app/api/")),
    ];
    expect(clientFiles.filter((f) => SERVER_MODULES.test(read(f))).map(rel)).toEqual([]);
    expect(BARREL_SERVER_EXPORT.test(read(path.join(root, "src/services/api/index.ts")))).toBe(false);
  });

  it("private column names stay on the ownership path", () => {
    const allowed = (p: string): boolean =>
      p.startsWith("src/services/auth/") ||
      p === "src/config/ownership.config.ts" ||
      p === "src/services/api/supabaseCreationRepository.ts";
    const offenders = nonTest(["src"])
      .filter((f) => PRIVATE_SNAKE.test(read(f)))
      .map(rel)
      .filter((p) => !allowed(p));
    expect(offenders).toEqual([]);
    const apiOffenders = nonTest(["src/app/api"])
      .filter((f) => PRIVATE_SNAKE.test(read(f)) || PRIVATE_CAMEL.test(read(f)))
      .map(rel);
    expect(apiOffenders).toEqual([]);
  });

  it("the scanner patterns detect samples", () => {
    expect(STAR_SELECT.test("select('*')")).toBe(true);
    expect(STAR_SELECT.test("select=*")).toBe(true);
    expect(PRIVATE_SNAKE.test("owner_token_hash")).toBe(true);
    expect(PRIVATE_SNAKE.test("private_display_name")).toBe(true); // MFW-62
    expect(PRIVATE_CAMEL.test("const ownerTokenHash")).toBe(true);
  });
});
