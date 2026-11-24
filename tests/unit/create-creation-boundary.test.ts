// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const EXTS = new Set([".ts", ".tsx", ".js", ".mjs"]);
const read = (p: string): string => fs.readFileSync(path.join(root, p), "utf8");
const isTest = (f: string): boolean => /\.test\.tsx?$/.test(f);

function walk(dir: string): string[] {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(full, { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...walk(rel));
    else if (EXTS.has(path.extname(e.name))) out.push(rel);
  }
  return out;
}

const EXPORT_NAME = /^export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/gm;
const SERVER_ONLY = /services\/api\/(createCreation|createCreationRequest|creationPlacement|privateWishCipher)\b/;
const KEY_ENV_LITERAL = /["']PRIVATE_WISH_KEY(_ID)?["']/;
const VERCEL_ENV_LITERAL = /["']VERCEL_ENV["']/;

describe("create-creation boundary", () => {
  it("route.ts exports only GET and POST and reads no env", () => {
    const src = read("src/app/api/creations/route.ts");
    expect([...src.matchAll(EXPORT_NAME)].map((m) => m[1]).sort()).toEqual(["GET", "POST"]);
    expect(src).not.toMatch(/export\s+default|export\s*\{|process\.env/);
  });

  it("client code cannot import the server write modules", () => {
    const client = [
      ...walk("src/components"),
      ...walk("src/store"),
      ...walk("src/core"),
      ...walk("src/app").filter((f) => !f.startsWith("src/app/api/")),
    ];
    expect(client.filter((f) => SERVER_ONLY.test(read(f)))).toEqual([]);
    const barrel = read("src/services/api/index.ts");
    expect(barrel).not.toMatch(/from\s+["']\.\/(createCreation|createCreationRequest|creationPlacement|privateWishCipher)["']/);
  });

  it("key env names live only in config files", () => {
    const files = walk("src").filter((f) => !isTest(f));
    expect(files.filter((f) => KEY_ENV_LITERAL.test(read(f)))).toEqual(["src/config/privateWish.config.ts"]);
    expect(files.filter((f) => /NEXT_PUBLIC_PRIVATE_WISH/.test(read(f)))).toEqual([]);
    expect(files.filter((f) => VERCEL_ENV_LITERAL.test(read(f)))).toEqual(["src/config/database.config.ts"]);
  });

  it("the cipher uses Web Crypto AES-GCM only", () => {
    const src = read("src/services/api/privateWishCipher.ts");
    expect(src).toContain('"AES-GCM"');
    for (const bad of ["AES-CBC", "AES-CTR", "node:crypto", "createCipheriv"]) expect(src).not.toContain(bad);
  });

  it("wish columns come only from an evaluated wish", () => {
    const src = read("src/services/api/createCreation.ts");
    expect(src).toContain("evaluateWishDraft(");
    expect(src).not.toMatch(/toWishColumns\((?!evaluation\.wish\))/);
    expect(src.indexOf("evaluateWishDraft(")).toBeLessThan(src.indexOf("toWishColumns("));
    expect(src).not.toContain("toWishRequestFields");
  });

  it("scanner patterns match samples", () => {
    expect(SERVER_ONLY.test("@/services/api/createCreation")).toBe(true);
    expect(KEY_ENV_LITERAL.test('"PRIVATE_WISH_KEY_ID"')).toBe(true);
    expect(VERCEL_ENV_LITERAL.test("'VERCEL_ENV'")).toBe(true);
    expect([..."export async function POST(".matchAll(EXPORT_NAME)].map((m) => m[1])).toEqual(["POST"]);
  });
});
