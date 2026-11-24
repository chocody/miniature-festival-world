// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  INSERT_CREATION_GUARDED_RPC_PATH,
  PUBLIC_CREATION_COLUMNS,
  ZONE_ITEM_COUNTS_RPC_PATH,
  ZONE_OCCUPANTS_RPC_PATH,
} from "@/config/database.config";
import { ZONE_ITEM_CAP } from "@/config/world.config";

const FILE = path.resolve(__dirname, "../../supabase/migrations/20261124020000_mfw45_guarded_creation_insert.sql");
const raw = fs.readFileSync(FILE, "utf8");
const sql = raw
  .split("\n")
  .map((l) => l.replace(/--.*$/, ""))
  .join(" ")
  .replace(/\s+/g, " ")
  .toLowerCase();
const NAMES = ["mfw_zone_item_counts", "mfw_zone_occupants", "mfw_insert_creation_guarded"];

function statement(name: string): string {
  const start = sql.indexOf(`create function public.${name}(`);
  const end = sql.indexOf("$$;", sql.indexOf("$$", start) + 2);
  return sql.slice(start, end + 3);
}

describe("MFW-45 migration (static checks)", () => {
  it("creates no tables, policies or drops", () => {
    for (const bad of ["create table", "alter table", "create policy", "drop ", "create or replace"]) {
      expect(sql).not.toContain(bad);
    }
  });

  it.each(NAMES)("%s is invoker, pinned, revoked from clients and granted to service_role", (name) => {
    expect(sql).toContain(`create function public.${name}(`);
    const st = statement(name);
    expect(st).toContain("security invoker");
    expect(st).toContain("set search_path = ''");
    expect(sql).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated`));
    expect(sql).toMatch(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to service_role`));
  });

  it("grants nothing to clients", () => {
    expect(sql).not.toMatch(/\bgrant\b[^;]*\bto\b[^;]*\b(anon|authenticated)\b/);
    for (const m of sql.matchAll(/\bgrant\b[^;]*\bto (\w+)/g)) expect(m[1]).toBe("service_role");
  });

  it("the guarded function locks, compares and caps", () => {
    const st = statement("mfw_insert_creation_guarded");
    expect(st).toContain("pg_catalog.pg_advisory_xact_lock(");
    expect(st).toContain("is distinct from");
    expect(st).toContain(`cardinality(v_current) >= ${ZONE_ITEM_CAP}`);
    expect(st).toContain("insert into public.creations_public (event_id, zone_id, appearance, coord, public_wish_text, created_at, expires_at)");
    expect(st).toContain("insert into public.creations_private_ownership");
    expect(st).toContain(`returning ${PUBLIC_CREATION_COLUMNS.join(", ")}`);
  });

  it("occupancy ignores moderation state", () => {
    expect(sql.split("p.expires_at > now()")).toHaveLength(4);
    expect(sql).not.toContain("moderation_status");
    expect(sql).not.toContain("report_count");
  });

  it("has no star selects", () => {
    expect(sql).not.toMatch(/select \*|returning \*|\.\*|count\(\*\)/);
  });

  it("matches the RPC paths used by the repository", () => {
    for (const p of [ZONE_ITEM_COUNTS_RPC_PATH, ZONE_OCCUPANTS_RPC_PATH, INSERT_CREATION_GUARDED_RPC_PATH]) {
      expect(sql).toContain(`create function public.${p.replace("rpc/", "")}(`);
    }
  });
});
