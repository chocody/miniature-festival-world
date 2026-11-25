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

const ROUTE = "src/app/api/wish-visibility/route.ts";
const HANDLER = "src/services/api/wishVisibilitySwitch.ts";
const EXPORT_NAME = /^export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/gm;
const ROUTE_FORBIDDEN = /export\s+default|export\s*\{|process\.env|\bdynamic\b|\bruntime\b|\brevalidate\b/;
const SERVER_ONLY = /services\/api\/wishVisibilitySwitch\b/;
const BARREL_SWITCH = /from\s+["']\.\/wishVisibilitySwitch["']/;
const HASH_EQ = /(?:\w+\.)?(presented\w*|stored\w*|\w*Hash)\s*[!=]==?\s*(?:\w+\.)?(presented\w*|stored\w*|\w*Hash)\b/;
const IMPORT_FROM = /^import\s[^;]*?from\s+["']([^"']+)["']/gm;

describe("wish visibility boundary (MFW-62)", () => {
  it("the route exports only POST and nothing else", () => {
    const src = read(ROUTE);
    expect([...src.matchAll(EXPORT_NAME)].map((m) => m[1])).toEqual(["POST"]);
    expect(src).not.toMatch(ROUTE_FORBIDDEN);
    expect("export default x").toMatch(ROUTE_FORBIDDEN);
    expect("export { GET }").toMatch(ROUTE_FORBIDDEN);
    expect("export const runtime = 'edge'").toMatch(ROUTE_FORBIDDEN);
  });

  it("client code never imports the switch handler; the barrel does not re-export it", () => {
    const client = [
      ...walk("src/components"),
      ...walk("src/store"),
      ...walk("src/core"),
      ...walk("src/app").filter((f) => !f.startsWith("src/app/api/")),
    ].filter((f) => !isTest(f));
    expect(client.filter((f) => SERVER_ONLY.test(read(f)))).toEqual([]);
    expect('import { x } from "@/services/api/wishVisibilitySwitch"').toMatch(SERVER_ONLY);
    expect(read("src/services/api/index.ts")).not.toMatch(BARREL_SWITCH);
    expect('export { x } from "./wishVisibilitySwitch"').toMatch(BARREL_SWITCH);
  });

  it("the handler proves ownership in constant time and moderates before opening", () => {
    const src = read(HANDLER);
    for (const needed of ["ownerTokenHashesMatch(", "hashOwnerToken(", "readRequestTextWithLimit(", "checkPublicWish("]) {
      expect(src).toContain(needed);
    }
    expect(src.indexOf("checkPublicWish(")).toBeLessThan(src.indexOf(".openWish("));
    expect(src.indexOf(".openWish(")).toBeGreaterThan(0);
    expect(src).not.toContain("console.");
    expect(src).not.toContain("searchParams.get");
    expect(src).not.toMatch(HASH_EQ);
    expect(src).not.toMatch(/owner_token|private_wish_text|private_wish_key_id|private_display_name/);
    // positive controls
    expect("presentedHash === state.ownerTokenHash").toMatch(HASH_EQ);
    expect("if (presented === stored)").toMatch(HASH_EQ);
    expect("a.ownerTokenHash !== presentedHash").toMatch(HASH_EQ);
  });

  it("displayName.ts imports only the wish config and the moderation barrel (isomorphic)", () => {
    const src = read("src/services/api/displayName.ts");
    const imports = [...src.matchAll(IMPORT_FROM)].map((m) => m[1]).sort();
    expect(imports).toEqual(["@/config/wish.config", "@/services/moderation"]);
    expect([...'import { a } from "@/x";\nimport type { B } from "./y";'.matchAll(IMPORT_FROM)].map((m) => m[1])).toEqual(["@/x", "./y"]);
  });

  it("the client-safe types module has no runtime imports", () => {
    const src = read("src/services/api/wishVisibilityTypes.ts");
    for (const m of src.matchAll(IMPORT_FROM)) expect(m[0]).toMatch(/^import\s+type\s/);
  });
});
