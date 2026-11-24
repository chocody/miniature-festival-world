// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const EXTS = new Set([".ts", ".tsx", ".js", ".mjs"]);
const KEY_LITERAL = /mfw:deviceOwnerToken/;
const CONSOLE_CALL = /\bconsole\./;
const VAULT_IMPORT = /deviceOwnerToken|getDeviceOwnerVault|createDeviceOwnerVault/;

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

const matching = (dir: string, re: RegExp) =>
  walk(path.join(root, dir))
    .filter((f) => re.test(fs.readFileSync(f, "utf8")))
    .map((f) => path.relative(root, f).split(path.sep).join("/"));

describe("owner token boundary (invariant C)", () => {
  it("scanner patterns detect samples", () => {
    expect(KEY_LITERAL.test('const k = "mfw:deviceOwnerToken:v1"')).toBe(true);
    expect(CONSOLE_CALL.test("console.log(x)")).toBe(true);
    expect(VAULT_IMPORT.test('import { getDeviceOwnerVault } from "@/services/auth"')).toBe(true);
  });

  it("storage key literal lives only in ownership.config.ts", () => {
    expect(matching("src", KEY_LITERAL)).toEqual(["src/config/ownership.config.ts"]);
  });

  it("no console calls in src/services/auth", () => {
    expect(matching("src/services/auth", CONSOLE_CALL)).toEqual([]);
  });

  it("src/app/api does not import the device vault", () => {
    expect(matching("src/app/api", VAULT_IMPORT)).toEqual([]);
  });
});
