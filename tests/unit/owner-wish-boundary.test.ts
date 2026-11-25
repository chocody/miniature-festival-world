// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_KRATHONG_APPEARANCE } from "@/core/customization";
import { pickInspectedCreation } from "@/components/ui/inspectedCreation";
import { PUBLIC_CREATION_KEYS } from "@/services/api/creationTypes";

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
const SERVER_ONLY = /services\/(api\/(ownerWishReveal|requestBody|privateWishCipher)|auth\/ownerProof)\b/;
const ROUTE_FORBIDDEN = /export\s+default|export\s*\{|process\.env|\bdynamic\b|\bruntime\b|\brevalidate\b/;
const HASH_EQ = /(presented|stored|left|right)\s*===\s*(presented|stored|left|right)/;
const THREE_IMPORT = /from\s+["'](three|@react-three\/[\w-]+|@react-spring\/[\w-]+|@\/components\/canvas3d[^"']*|@\/components\/models\/[^"']*)["']/;
const IDENTITY = /name|nick|profile|author|owner|device|token|hash/i;
const OWNER_UI_FILES = [
  "src/components/ui/PrivateWishReveal.tsx",
  "src/components/ui/OwnerWishSection.tsx",
  "src/config/ownerWish.config.ts",
  "src/services/auth/ownedCreationHint.ts",
  "src/services/api/ownerWishClient.ts",
];

describe("owner wish boundary (MFW-31)", () => {
  it("the route exports only POST", () => {
    const src = read("src/app/api/private-wish/route.ts");
    expect([...src.matchAll(EXPORT_NAME)].map((m) => m[1])).toEqual(["POST"]);
    expect(src).not.toMatch(ROUTE_FORBIDDEN);
    // positive control
    expect("export default x").toMatch(ROUTE_FORBIDDEN);
    expect("process.env.X").toMatch(ROUTE_FORBIDDEN);
  });

  it("client code cannot import the server modules", () => {
    const client = [
      ...walk("src/components"),
      ...walk("src/store"),
      ...walk("src/core"),
      ...walk("src/app").filter((f) => !f.startsWith("src/app/api/")),
    ].filter((f) => !isTest(f));
    expect(client.filter((f) => SERVER_ONLY.test(read(f)))).toEqual([]);
    expect('import x from "@/services/auth/ownerProof"').toMatch(SERVER_ONLY);
    const barrel = read("src/services/api/index.ts");
    expect(barrel).not.toMatch(/from\s+["']\.\/(ownerWishReveal|ownerWishClient|requestBody)["']/);
  });

  it("the client transport is body-only and hardened", () => {
    const src = read("src/services/api/ownerWishClient.ts");
    for (const needed of ['redirect: "error"', 'credentials: "omit"', 'method: "POST"']) expect(src).toContain(needed);
    for (const bad of [
      "searchParams",
      "URLSearchParams",
      "OWNER_WISH_REVEAL_PATH +",
      "${OWNER_WISH_REVEAL_PATH}",
      "localStorage",
      "sessionStorage",
      "getOrCreate",
      "console.",
    ]) {
      expect(src).not.toContain(bad);
    }
  });

  it("the proof compare has no early exit or string compare", () => {
    const src = read("src/services/auth/ownerProof.ts");
    expect(src).toContain("^");
    expect(src).not.toMatch(HASH_EQ);
    expect("presented === stored").toMatch(HASH_EQ);
    for (const bad of ["localeCompare", "node:crypto"]) expect(src).not.toContain(bad);
  });

  it("the owner UI files are three-free, static and safe", () => {
    for (const file of OWNER_UI_FILES) {
      const src = read(file);
      expect(src, file).not.toMatch(THREE_IMPORT);
      for (const bad of ["dangerouslySetInnerHTML", "animate-", "transition"]) expect(src, file).not.toContain(bad);
    }
    expect('import { a } from "@react-spring/three"').toMatch(THREE_IMPORT);
    expect('import * as T from "three"').toMatch(THREE_IMPORT);
  });

  it("the retired-keys env name lives only in its config", () => {
    const files = walk("src").filter((f) => !isTest(f));
    expect(files.filter((f) => /["']PRIVATE_WISH_RETIRED_KEYS["']/.test(read(f)))).toEqual(["src/config/privateWish.config.ts"]);
    expect(files.filter((f) => /NEXT_PUBLIC_PRIVATE_WISH/.test(read(f)))).toEqual([]);
  });

  it("AC1: no identity fields in what other people see", () => {
    expect(PUBLIC_CREATION_KEYS.filter((k) => IDENTITY.test(k))).toEqual([]);
    const picked = pickInspectedCreation({
      id: "950118ce-7d93-4cb6-bd84-44d91c5de9e3",
      appearance: DEFAULT_KRATHONG_APPEARANCE,
      publicWishText: "w",
    });
    const keys = Object.keys(picked);
    expect(keys).toEqual(["id", "appearance", "publicWishText"]);
    expect(keys.filter((k) => IDENTITY.test(k))).toEqual([]);
    expect("ownerToken").toMatch(IDENTITY);
  });
});
