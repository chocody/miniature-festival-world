// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OWNER_TOKEN_HASH_PATTERN } from "@/config/ownership.config";
import { PUBLIC_CREATION_COLUMNS } from "@/config/database.config";
import { FESTIVAL_EVENT_IDS } from "@/config/events/types";
import { AUTO_HIDE_REPORT_THRESHOLD, DEFAULT_MODERATION_STATUS, MODERATION_STATUSES } from "@/config/moderation.config";
import { PRIVATE_WISH_CIPHERTEXT_PATTERN, PRIVATE_WISH_KEY_ID_PATTERN } from "@/config/privateWish.config";
import { ZONE_ID_MIN } from "@/config/world.config";
import { COORD_MODES } from "@/core/coordinates/types";

const file = path.resolve(__dirname, "../../supabase/migrations/20261124000000_mfw12_creations_public_private.sql");
const raw = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
const sql = raw.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").toLowerCase();

function statement(start: string): string {
  const from = sql.indexOf(start);
  expect(from, `missing: ${start}`).toBeGreaterThanOrEqual(0);
  return sql.slice(from, sql.indexOf(");", from) + 2);
}

describe("creations migration (static)", () => {
  it("the file exists", () => {
    expect(fs.existsSync(file)).toBe(true);
  });

  it("creates creations_public with the AC columns", () => {
    const s = statement("create table public.creations_public (");
    for (const col of [
      "id uuid",
      "event_id text",
      "zone_id integer",
      "appearance jsonb",
      "coord jsonb",
      "public_wish_text text",
      "created_at timestamptz",
      "expires_at timestamptz",
    ]) {
      expect(s).toContain(col);
    }
  });

  it("creates creations_private_ownership with the AC columns and an FK to creations_public", () => {
    const s = statement("create table public.creations_private_ownership (");
    for (const col of [
      "creation_id uuid primary key references public.creations_public (id) on delete cascade",
      "owner_token_hash text not null",
      "private_wish_text text",
      "private_wish_key_id text",
      "report_count integer not null default 0",
      `moderation_status public.moderation_status not null default '${DEFAULT_MODERATION_STATUS}'`,
    ]) {
      expect(s).toContain(col);
    }
  });

  it("moderation_status enum matches MODERATION_STATUSES", () => {
    const values = MODERATION_STATUSES.map((s) => `'${s}'`).join(", ");
    expect(sql).toContain(`create type public.moderation_status as enum (${values})`);
  });

  const tables = [...sql.matchAll(/create table (public\.\w+)/g)].map((m) => m[1] as string);

  it("every table has RLS", () => {
    expect(tables).toHaveLength(2);
    for (const name of tables) expect(sql).toContain(`alter table ${name} enable row level security`);
  });

  it("clients are denied on both tables", () => {
    for (const name of tables) {
      expect(sql).toContain(
        `on ${name} as restrictive for all to anon, authenticated using (false) with check (false)`,
      );
      expect(sql).toContain(`revoke all on table ${name} from public, anon, authenticated`);
    }
  });

  it("no permissive policy", () => {
    const policies = sql.match(/create policy/g)?.length ?? 0;
    const restrictive = sql.match(/as restrictive/g)?.length ?? 0;
    expect(policies).toBe(2);
    expect(policies).toBe(restrictive);
  });

  it("no grant to clients", () => {
    expect(/\bgrant\b[^;]*\bto\b[^;]*\b(anon|authenticated)\b/.test(sql)).toBe(false);
    const targets = [...sql.matchAll(/\bgrant\b[^;]*\bto (\w+)/g)].map((m) => m[1]);
    expect(targets.length).toBeGreaterThan(0);
    expect(new Set(targets)).toEqual(new Set(["service_role"]));
  });

  const viewStatement = /create view public\.creations_public_visible[\s\S]*?;/.exec(sql)?.[0] ?? "";

  it("view is server-only and filtered", () => {
    expect(sql).toContain("create view public.creations_public_visible with (security_invoker = true)");
    expect(viewStatement).toContain("o.moderation_status = 'approved'");
    expect(viewStatement).toContain(`o.report_count < ${AUTO_HIDE_REPORT_THRESHOLD}`);
    expect(viewStatement).toContain("p.expires_at > now()");
    expect(sql).toContain("revoke all on table public.creations_public_visible from public, anon, authenticated");
  });

  it("view selects exactly the public allowlist", () => {
    const start = viewStatement.indexOf("as select ") + "as select ".length;
    const end = viewStatement.indexOf(" from public.creations_public");
    const cols = viewStatement
      .slice(start, end)
      .split(",")
      .map((c) => c.trim().replace(/^p\./, ""));
    expect(cols).toEqual([...PUBLIC_CREATION_COLUMNS]);
  });

  it("insert function is server-only", () => {
    expect(sql).toContain("security invoker");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toMatch(/revoke all on function public\.mfw_insert_creation\([^)]*\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.mfw_insert_creation\([^)]*\) to service_role/);
  });

  it("no select * / returning *", () => {
    expect(/select \*|returning \*|\.\*/.test(sql)).toBe(false);
  });

  it("event ids match FESTIVAL_EVENT_IDS", () => {
    for (const id of FESTIVAL_EVENT_IDS) expect(sql).toContain(`'${id}'`);
    const list = /event_id in \(([^)]*)\)/.exec(sql)?.[1] ?? "";
    expect(list.match(/'[^']+'/g)?.length).toBe(FESTIVAL_EVENT_IDS.length);
  });

  it("ciphertext / key id / owner hash patterns equal the TS config", () => {
    expect(raw).toContain(`'${PRIVATE_WISH_CIPHERTEXT_PATTERN.source}'`);
    expect(raw).toContain(`'${PRIVATE_WISH_KEY_ID_PATTERN.source}'`);
    expect(raw).toContain(`'${OWNER_TOKEN_HASH_PATTERN.source}'`);
  });

  it("coord check forbids raw xyz", () => {
    expect(sql).toContain("not (coord ?| array['x', 'y', 'z', 'position'])");
    for (const mode of COORD_MODES) expect(raw).toContain(`'${mode}'`);
  });

  it("coord check is null-safe (a coord without mode is rejected)", () => {
    expect(sql).toContain("and coord ->> 'mode' is not null and coord ->> 'mode' in (");
  });

  it("zone min matches ZONE_ID_MIN", () => {
    expect(sql).toContain(`check (zone_id >= ${ZONE_ID_MIN})`);
  });
});
