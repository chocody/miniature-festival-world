// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLOSE_CREATION_WISH_RPC_PATH,
  CREATION_WISH_STATE_RPC_PATH,
  INSERT_CREATION_GUARDED_V2_RPC_PATH,
  OPEN_CREATION_WISH_RPC_PATH,
  PUBLIC_CREATION_COLUMNS,
} from "@/config/database.config";
import { AUTO_HIDE_REPORT_THRESHOLD, DEFAULT_MODERATION_STATUS } from "@/config/moderation.config";
import { PRIVATE_WISH_CIPHERTEXT_PATTERN } from "@/config/privateWish.config";
import { ZONE_ITEM_CAP } from "@/config/world.config";

const DIR = join(process.cwd(), "supabase", "migrations");
const FILE = "20261126000000_mfw62_wish_visibility_switch.sql";
const raw = readFileSync(join(DIR, FILE), "utf8");
const sql = raw
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join(" ")
  .replace(/\s+/g, " ")
  .toLowerCase()
  .trim();
const FUNCTIONS = ["mfw_insert_creation_guarded_v2", "mfw_creation_wish_state", "mfw_open_creation_wish", "mfw_close_creation_wish"];

/** The text of one `create function` statement, up to the end of its body. */
function statement(name: string): string {
  const start = sql.indexOf(`create function public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("$$;", sql.indexOf("$$", start) + 2);
  return sql.slice(start, end + 3);
}

describe("MFW-62 wish visibility migration (static checks)", () => {
  it("M1 is followed only by the MFW-118 data-scope migration", () => {
    const names = readdirSync(DIR).filter((n) => n.endsWith(".sql")).sort();
    expect(names.indexOf(FILE)).toBeGreaterThanOrEqual(0);
    expect(names.slice(names.indexOf(FILE) + 1)).toEqual(["20261127000000_mfw118_data_scope.sql"]);
  });

  it("M2 creates no table, drops nothing, no definer, no replaced function, no star", () => {
    for (const bad of ["create table", "drop ", "security definer", "create or replace function", "select *", "returning *", ".*"]) {
      expect(sql).not.toContain(bad);
    }
  });

  it("M3 grants only to service_role (5 grants)", () => {
    const grants = [...sql.matchAll(/\bgrant\b[^;]*\bto (\w+)/g)];
    expect(grants).toHaveLength(5);
    for (const m of grants) expect(m[1]).toBe("service_role");
    expect(sql).not.toMatch(/\bgrant\b[^;]*\bto\b[^;]*\b(anon|authenticated)\b/);
  });

  it("M4 adds the two columns and the four constraints", () => {
    expect(sql).toContain("alter table public.creations_public add column display_name text");
    expect(sql).toContain("alter table public.creations_private_ownership add column private_display_name text");
    for (const name of [
      "creations_public_display_name_not_blank",
      "creations_public_display_name_needs_wish",
      "creations_private_display_name_ciphertext_format",
      "creations_private_display_name_needs_wish",
    ]) {
      expect(sql).toContain(`constraint ${name} check (`);
    }
    expect(sql).toContain("display_name is null or public_wish_text is not null");
    expect(sql).toContain("private_display_name is null or private_wish_text is not null");
    expect(raw).toContain(`'${PRIVATE_WISH_CIPHERTEXT_PATTERN.source}'`);
  });

  it("M5 keeps RLS on and clients revoked on both tables and the view", () => {
    expect(sql).toContain("alter table public.creations_public enable row level security");
    expect(sql).toContain("alter table public.creations_private_ownership enable row level security");
    for (const t of ["public.creations_public", "public.creations_private_ownership", "public.creations_public_visible"]) {
      expect(sql).toContain(`revoke all on table ${t} from public, anon, authenticated`);
    }
    expect(sql).not.toContain("create policy");
    expect(sql).not.toContain("disable row level security");
  });

  it("M6 replaces the view with display_name appended and the same filters", () => {
    const head = "create or replace view public.creations_public_visible with (security_invoker = true) as select ";
    expect(sql).toContain(head);
    const view = sql.slice(sql.indexOf(head));
    const start = head.length;
    const end = view.indexOf(" from public.creations_public");
    const cols = view
      .slice(start, end)
      .split(",")
      .map((c) => c.trim().replace(/^p\./, ""));
    expect(cols).toEqual([...PUBLIC_CREATION_COLUMNS]);
    expect(cols[cols.length - 1]).toBe("display_name");
    expect(view).toContain(`o.moderation_status = '${DEFAULT_MODERATION_STATUS}'`);
    expect(view).toContain(`o.report_count < ${AUTO_HIDE_REPORT_THRESHOLD}`);
    expect(view).toContain("p.expires_at > now()");
  });

  it.each(FUNCTIONS)("M7 %s is invoker, pinned, revoked from clients and granted to service_role", (name) => {
    const st = statement(name);
    expect(st).toContain("security invoker");
    expect(st).toContain("set search_path = ''");
    expect(sql).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated`));
    expect(sql).toMatch(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to service_role`));
  });

  it("M7 creates exactly four functions", () => {
    expect(sql.match(/create function /g)).toHaveLength(4);
  });

  it("M8 guarded v2 locks like v1, caps the zone and writes both name columns", () => {
    const st = statement("mfw_insert_creation_guarded_v2");
    expect(st).toContain("pg_catalog.hashtextextended('mfw_creation_zone:' || p_event_id || ':' || p_zone_id::text, 0)");
    expect(st).toContain(`cardinality(v_current) >= ${ZONE_ITEM_CAP}`);
    expect(st).toContain(`returning ${PUBLIC_CREATION_COLUMNS.join(", ")}`);
    expect(st).toContain(
      "insert into public.creations_public (event_id, zone_id, appearance, coord, public_wish_text, created_at, expires_at, display_name)",
    );
    expect(st).toContain(
      "insert into public.creations_private_ownership (creation_id, owner_token_hash, private_wish_text, private_wish_key_id, private_display_name)",
    );
  });

  it("M9 open is a locked compare-and-set that refuses hidden wishes and clears the private store", () => {
    const st = statement("mfw_open_creation_wish");
    expect(st).toContain("for update of o, p");
    expect(st).toContain(`v_moderation_status <> '${DEFAULT_MODERATION_STATUS}' or v_report_count >= ${AUTO_HIDE_REPORT_THRESHOLD}`);
    expect(st).toContain("is distinct from p_expected_private_wish_text");
    expect(st).toContain("private_display_name = null");
    expect(st).toContain("private_wish_text = null");
  });

  it("M10 close is a locked compare-and-set that clears the public store", () => {
    const st = statement("mfw_close_creation_wish");
    expect(st).toContain("for update of o, p");
    expect(st).toContain("set public_wish_text = null, display_name = null");
    expect(st).toContain("v_display_name is distinct from p_expected_display_name");
    expect(st).not.toContain("moderation_status");
    expect(st).not.toContain("report_count");
  });

  it("M11 does not redefine the old functions", () => {
    expect(sql).not.toContain("function public.mfw_insert_creation_guarded(");
    expect(sql).not.toContain("function public.mfw_creation_ownership(");
    expect(sql).not.toContain("function public.mfw_insert_creation(");
    expect(sql).not.toContain("function public.mfw_report_creation(");
  });

  it("M12 the RPC path constants name the functions", () => {
    expect(INSERT_CREATION_GUARDED_V2_RPC_PATH).toBe("rpc/" + "mfw_insert_creation_guarded_v2");
    expect(CREATION_WISH_STATE_RPC_PATH).toBe("rpc/" + "mfw_creation_wish_state");
    expect(OPEN_CREATION_WISH_RPC_PATH).toBe("rpc/" + "mfw_open_creation_wish");
    expect(CLOSE_CREATION_WISH_RPC_PATH).toBe("rpc/" + "mfw_close_creation_wish");
  });

  it("M13 reloads the PostgREST schema at the end", () => {
    expect(sql.endsWith("notify pgrst, 'reload schema';")).toBe(true);
  });
});
