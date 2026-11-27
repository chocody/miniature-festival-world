// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { MY_CREATIONS_STORAGE_KEY } from "@/config/ownership.config";

const SCRIPTS_DIR = join(process.cwd(), "supabase", "scripts");
const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const FILE = join(SCRIPTS_DIR, "wipe_all_2026-11-27.sql");
const TABLES = ["public.creations_public", "public.creations_private_ownership"];
const RUNBOOK = join(process.cwd(), "docs", "runbooks", "data-wipe.md");

function normalise(raw: string): string {
  return raw
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

const sql = normalise(readFileSync(FILE, "utf8"));

function captures(re: RegExp, text: string): string[] {
  return [...text.matchAll(re)].map((m) => m[1]);
}

describe("MFW-117 wipe script (static checks)", () => {
  it("W1 lives in supabase/scripts, not in supabase/migrations", () => {
    expect(existsSync(FILE)).toBe(true);
    expect(relative(MIGRATIONS_DIR, FILE).startsWith("..")).toBe(true);
    expect(readdirSync(MIGRATIONS_DIR).filter((f) => f.includes("wipe"))).toEqual([]);
  });

  it("W2 nothing in CI or package scripts applies it", () => {
    const dir = join(process.cwd(), ".github", "workflows");
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".yml") || n.endsWith(".yaml"))) {
      const text = readFileSync(join(dir, f), "utf8");
      for (const word of ["supabase/scripts", "wipe_all", "psql", "supabase db"]) {
        expect(text, `${f} mentions ${word}`).not.toContain(word);
      }
    }
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    for (const value of Object.values(pkg.scripts)) expect(value).not.toContain("supabase");
  });

  it("W3 is exactly one transaction", () => {
    expect(sql.startsWith("begin;")).toBe(true);
    expect(sql.endsWith("commit;")).toBe(true);
    expect(sql.match(/\bbegin\s*;/g)).toHaveLength(1);
    expect(sql.match(/\bcommit\b/g)).toHaveLength(1);
    for (const re of [/\brollback\b/, /\bsavepoint\b/, /\bstart transaction\b/, /\babort\b/, /\bend\s*;/]) {
      expect(sql).not.toMatch(re);
    }
  });

  it("W4 statements run in order", () => {
    const order = [
      "begin;",
      "as creations_public_before",
      "delete from public.creations_public;",
      "do $$",
      "raise exception 'wipe incomplete'",
      "as creations_public_after",
      "commit;",
    ].map((s) => sql.indexOf(s));
    expect(order[0]).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
  });

  it("W5 touches only the two tables", () => {
    expect(new Set(captures(/\b(?:from|into|update|join|table)\s+([a-z0-9_."]+)/g, sql))).toEqual(new Set(TABLES));
    expect(new Set(captures(/\bpublic\.([a-z0-9_]+)/g, sql).map((t) => `public.${t}`))).toEqual(new Set(TABLES));
  });

  it("W6 deletes every creations_public row and nothing else directly", () => {
    expect(sql.match(/\bdelete\b/g)).toHaveLength(1);
    const stmt = "delete from public.creations_public;";
    expect(sql).toContain(stmt);
    expect(stmt).not.toMatch(/\b(where|using)\b/);
    expect(sql).not.toContain("delete from public.creations_private_ownership");
  });

  it.each([
    "drop",
    "alter",
    "grant",
    "revoke",
    "truncate",
    "create",
    "insert",
    "update",
    "set",
    "copy",
    "comment",
    "notify",
    "security definer",
    "session_replication_role",
    "disable",
    "policy",
    "owner",
    "role",
  ])("W7 has no %s", (w) => {
    expect(sql).not.toMatch(new RegExp(`\\b${w}\\b`));
  });

  it("W8 raises unless both tables are empty, and shows the after counts", () => {
    const s = sql.indexOf("do $$");
    const end = sql.indexOf("$$;", s + "do $$".length) + 3;
    const block = sql.slice(s, end);
    expect(block).toContain("exists (select 1 from public.creations_public)");
    expect(block).toContain("exists (select 1 from public.creations_private_ownership)");
    expect(block).toContain("raise exception 'wipe incomplete'");
    const after = sql.slice(end);
    expect(after).toContain("as creations_public_after");
    expect(after).toContain("as creations_private_ownership_after");
  });

  it("W9 the cascade it relies on is in MFW-12", () => {
    const mfw12 = normalise(
      readFileSync(join(MIGRATIONS_DIR, "20261124000000_mfw12_creations_public_private.sql"), "utf8"),
    );
    expect(mfw12).toContain("references public.creations_public (id) on delete cascade");
  });

  it("W10 has no star", () => {
    expect(sql).not.toMatch(/select \*|count\(\*\)|returning \*|\.\*/);
  });

  it("W11 the runbook covers the owner steps", () => {
    expect(existsSync(RUNBOOK)).toBe(true);
    const text = readFileSync(RUNBOOK, "utf8");
    for (const needle of [
      "supabase/scripts/wipe_all_2026-11-27.sql",
      "SQL editor",
      "project ref",
      "0 and 0",
      "site data",
      MY_CREATIONS_STORAGE_KEY,
      "docs/follow-ups.md",
    ]) {
      expect(text).toContain(needle);
    }
    expect(text).not.toMatch(/[a-z0-9]{20}\.supabase\.co/);
  });
});
