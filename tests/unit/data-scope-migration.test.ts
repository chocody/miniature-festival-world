// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PUBLIC_CREATION_COLUMNS } from "@/config/database.config";
import { ZONE_ITEM_CAP } from "@/config/world.config";
import { AUTO_HIDE_REPORT_THRESHOLD, DEFAULT_MODERATION_STATUS } from "@/config/moderation.config";

const DIR = join(process.cwd(), "supabase", "migrations");
const FILE = "20261127000000_mfw118_data_scope.sql";
const MFW12 = "20261124000000_mfw12_creations_public_private.sql";
const MFW13 = "20261124010000_mfw13_report_creation.sql";
const MFW45 = "20261124020000_mfw45_guarded_creation_insert.sql";
const MFW31 = "20261125000000_mfw31_creation_ownership_read.sql";
const MFW62 = "20261126000000_mfw62_wish_visibility_switch.sql";
const RUNBOOK = join(process.cwd(), "docs", "runbooks", "migrations.md");
const FOLLOW_UPS = join(process.cwd(), "docs", "follow-ups.md");

/** Strip `--` comments, collapse whitespace, lowercase (same as wish-visibility-migration.test.ts). */
function normalise(raw: string): string {
  return raw
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

const sql = normalise(readFileSync(join(DIR, FILE), "utf8"));

function old(file: string): string {
  return normalise(readFileSync(join(DIR, file), "utf8"));
}

/** The text of one `create function` statement, up to the end of its body. */
function statement(text: string, name: string): string {
  const start = text.indexOf(`create function public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = text.indexOf("$$;", text.indexOf("$$", start) + 2);
  return text.slice(start, end + 3);
}

function migrationNames(): string[] {
  return readdirSync(DIR)
    .filter((n) => n.endsWith(".sql"))
    .sort();
}

const SCOPES = "('live', 'test')";
const GUARD =
  "if p_data_scope is null or p_data_scope not in ('live', 'test') then raise exception 'unknown data scope' using errcode = '22023'; end if;";

interface Scoped {
  name: string;
  oldName: string;
  oldFile: string;
  args: string;
  plpgsql: boolean;
}

const SCOPED: Scoped[] = [
  { name: "mfw_zone_item_counts_v2", oldName: "mfw_zone_item_counts", oldFile: MFW45, args: "text, text", plpgsql: false },
  { name: "mfw_zone_occupants_v2", oldName: "mfw_zone_occupants", oldFile: MFW45, args: "text, integer, text", plpgsql: false },
  {
    name: "mfw_insert_creation_guarded_v3",
    oldName: "mfw_insert_creation_guarded_v2",
    oldFile: MFW62,
    args: "text, integer, jsonb, jsonb, text, timestamptz, timestamptz, text, text, text, uuid[], text, text, text",
    plpgsql: true,
  },
  { name: "mfw_creation_ownership_v2", oldName: "mfw_creation_ownership", oldFile: MFW31, args: "uuid, text", plpgsql: false },
  { name: "mfw_creation_wish_state_v2", oldName: "mfw_creation_wish_state", oldFile: MFW62, args: "uuid, text", plpgsql: false },
  { name: "mfw_open_creation_wish_v2", oldName: "mfw_open_creation_wish", oldFile: MFW62, args: "uuid, text, text, text, text", plpgsql: true },
  {
    name: "mfw_close_creation_wish_v2",
    oldName: "mfw_close_creation_wish",
    oldFile: MFW62,
    args: "uuid, text, text, text, text, text, text",
    plpgsql: true,
  },
  { name: "mfw_report_creation_v2", oldName: "mfw_report_creation", oldFile: MFW13, args: "uuid, text", plpgsql: true },
];

const OLD_NAMES = [
  "mfw_insert_creation",
  "mfw_insert_creation_guarded",
  "mfw_insert_creation_guarded_v2",
  "mfw_zone_item_counts",
  "mfw_zone_occupants",
  "mfw_creation_ownership",
  "mfw_creation_wish_state",
  "mfw_open_creation_wish",
  "mfw_close_creation_wish",
  "mfw_report_creation",
];

/** sha256 of the five earlier migrations at BASE d294937. */
const OLD_SHA256: Record<string, string> = {
  [MFW12]: "2290807db9f9bdc7b7410e7a531256ce175fa29cba48a07c888301667098406f",
  [MFW13]: "7b58af9acab3f4c23f81ea8f3c20f4eeece0fe6137c623d98f15fc2107ade256",
  [MFW45]: "b8ac53638997ea5bfae2b3fe73a904ad3f8a3b516f8a1bb83a737c6ed8f9867c",
  [MFW31]: "779a68e876c89f447cecc1d160f03d175f226cb9bd7dfca420e543f2e2b1f56a",
  [MFW62]: "5f35337b949afe90c7a19e907ccdc3977884f7573b92de37d60970b3c94efda0",
};

const VIEW_HEAD = "create or replace view public.creations_public_visible with (security_invoker = true) as select ";

function viewColumns(text: string): string[] {
  const view = text.slice(text.indexOf(VIEW_HEAD));
  const end = view.indexOf(" from public.creations_public");
  return view
    .slice(VIEW_HEAD.length, end)
    .split(",")
    .map((c) => c.trim().replace(/^p\./, ""));
}

function viewFilters(text: string): string {
  const view = text.slice(text.indexOf(VIEW_HEAD));
  const from = view.indexOf(" from public.creations_public as p");
  expect(from).toBeGreaterThanOrEqual(0);
  return view.slice(from, view.indexOf(";", from));
}

function lockCall(st: string): string {
  const start = st.indexOf("pg_catalog.pg_advisory_xact_lock(");
  expect(start).toBeGreaterThanOrEqual(0);
  return st.slice(start, st.indexOf(";", start));
}

function section(text: string, heading: string): string {
  const start = text.indexOf(heading);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = text.indexOf("\n## ", start + heading.length);
  return next < 0 ? text.slice(start) : text.slice(start, next);
}

function countOf(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

describe("MFW-118 data-scope migration (static checks)", () => {
  it("DS0 old migrations untouched (sha256 pinned)", () => {
    for (const [file, digest] of Object.entries(OLD_SHA256)) {
      expect(createHash("sha256").update(readFileSync(join(DIR, file))).digest("hex"), file).toBe(digest);
    }
  });

  it("DS1 is the last migration and no migration is named like a wipe", () => {
    const names = migrationNames();
    expect(names[names.length - 1]).toBe(FILE);
    expect(FILE).not.toContain("wipe");
    for (const n of names) expect(n).not.toContain("wipe");
  });

  it("DS2 contains no forbidden text", () => {
    for (const bad of [
      "create table",
      "drop ",
      "truncate",
      "delete from",
      "security definer",
      "create or replace function",
      "create policy",
      "alter policy",
      "policy",
      "disable row level security",
      "select *",
      "returning *",
      ".*",
      "count(*)",
      "begin;",
      "commit;",
    ]) {
      expect(sql, bad).not.toContain(bad);
    }
  });

  it("DS3 adds data_scope text not null default 'test' with a live/test check", () => {
    expect(sql).toContain(
      `alter table public.creations_public add column data_scope text not null default 'test' constraint creations_public_data_scope_known check (data_scope in ${SCOPES});`,
    );
    expect(sql.match(/\bdefault\b/g)).toHaveLength(1);
  });

  it("DS4 adds the scope-first index", () => {
    expect(sql).toContain(
      "create index creations_public_scope_event_zone_created_idx on public.creations_public (data_scope, event_id, zone_id, created_at, id);",
    );
    expect(sql.match(/create index /g)).toHaveLength(1);
  });

  it("DS5 keeps RLS on, clients revoked and the MFW-12 deny policies in place", () => {
    expect(sql).toContain("alter table public.creations_public enable row level security");
    expect(sql).toContain("alter table public.creations_private_ownership enable row level security");
    for (const t of ["public.creations_public", "public.creations_private_ownership", "public.creations_public_visible"]) {
      expect(sql).toContain(`revoke all on table ${t} from public, anon, authenticated`);
    }
    expect(countOf(old(MFW12), "as restrictive for all to anon, authenticated using (false) with check (false)")).toBe(2);
  });

  it("DS6 re-creates the view with data_scope appended and the MFW-62 filters", () => {
    expect(sql).toContain(VIEW_HEAD);
    expect(viewColumns(sql)).toEqual([...PUBLIC_CREATION_COLUMNS, "data_scope"]);
    const filters = viewFilters(sql);
    expect(filters).toBe(viewFilters(old(MFW62)));
    expect(filters).toContain(`o.moderation_status = '${DEFAULT_MODERATION_STATUS}'`);
    expect(filters).toContain(`o.report_count < ${AUTO_HIDE_REPORT_THRESHOLD}`);
    expect(sql).toContain("grant select on table public.creations_public_visible to service_role");
  });

  it("DS7 grants only to service_role (9 grants)", () => {
    const grants = [...sql.matchAll(/\bgrant\b[^;]*\bto (\w+)/g)];
    expect(grants).toHaveLength(9);
    for (const m of grants) expect(m[1]).toBe("service_role");
    expect(sql).not.toMatch(/\bgrant\b[^;]*\bto\b[^;]*\b(anon|authenticated)\b/);
  });

  it("DS8 creates exactly the eight scoped functions", () => {
    expect(sql.match(/create function /g)).toHaveLength(8);
    const names = new Set([...sql.matchAll(/create function public\.(\w+)\(/g)].map((m) => m[1]));
    expect(names).toEqual(new Set(SCOPED.map((s) => s.name)));
  });

  it.each(SCOPED)("DS9 $name is invoker, pinned, service_role only, p_data_scope last and without default", ({ name, args }) => {
    const st = statement(sql, name);
    expect(st).toContain("security invoker");
    expect(st).toContain("set search_path = ''");
    expect(sql).toContain(`revoke all on function public.${name}(${args}) from public, anon, authenticated`);
    expect(sql).toContain(`grant execute on function public.${name}(${args}) to service_role`);
    const sig = st.slice(0, st.indexOf(" returns "));
    expect(sig).toMatch(/, p_data_scope text ?\)$/);
    expect(sig).not.toMatch(/\bdefault\b|=/);
  });

  it.each(SCOPED)("DS10 $name equals $oldName plus the scope edits only", ({ name, oldName, oldFile, plpgsql }) => {
    const st = statement(sql, name);
    expect(countOf(st, "and p.data_scope = p_data_scope and p.expires_at > now()")).toBe(1);
    expect(countOf(st, "p.data_scope = p_data_scope")).toBe(1);
    const once = (text: string, from: string, to: string): string => {
      expect(text).toContain(from);
      return text.replace(from, to);
    };
    let back = once(st, `create function public.${name}(`, `create function public.${oldName}(`);
    back = once(back, ", p_data_scope text", "");
    back = once(back, " and p.data_scope = p_data_scope", "");
    if (plpgsql) back = once(back, `begin ${GUARD} `, "begin ");
    if (name === "mfw_insert_creation_guarded_v3") {
      back = once(back, ", display_name, data_scope)", ", display_name)");
      back = once(back, ", p_display_name, p_data_scope)", ", p_display_name)");
      back = once(back, ", display_name, data_scope into v_row", ", display_name into v_row");
    }
    expect(back).toBe(statement(old(oldFile), oldName));
  });

  it.each(SCOPED)("DS11 $name rejects an unknown scope (plpgsql) or has no guard (sql)", ({ name, plpgsql }) => {
    const st = statement(sql, name);
    if (plpgsql) {
      expect(st).toContain(`begin ${GUARD}`);
    } else {
      expect(st).toContain("language sql");
      expect(st).not.toContain("p_data_scope is null");
    }
  });

  it("DS12 guarded insert v3 caps per scope, writes data_scope and keeps the v2 lock key", () => {
    const st = statement(sql, "mfw_insert_creation_guarded_v3");
    expect(st).toContain("returns setof public.creations_public");
    expect(st).toContain(`cardinality(v_current) >= ${ZONE_ITEM_CAP}`);
    expect(st).toContain(`returning ${[...PUBLIC_CREATION_COLUMNS, "data_scope"].join(", ")} into v_row`);
    expect(st).toContain(
      "insert into public.creations_public (event_id, zone_id, appearance, coord, public_wish_text, created_at, expires_at, display_name, data_scope)",
    );
    const lock = lockCall(st);
    const oldLock = lockCall(statement(old(MFW62), "mfw_insert_creation_guarded_v2"));
    expect(lock).toBe(oldLock);
    expect(lock).not.toContain("data_scope");
    expect(oldLock).not.toContain("data_scope");
  });

  it("DS13 does not redefine the old functions", () => {
    for (const n of OLD_NAMES) expect(sql).not.toContain(`function public.${n}(`);
  });

  it("DS14 reloads the PostgREST schema at the end", () => {
    expect(sql.endsWith("notify pgrst, 'reload schema';")).toBe(true);
  });

  it("DS15 the runbook lists the apply order and an anon-key denial checklist for every relation and function", () => {
    expect(existsSync(RUNBOOK)).toBe(true);
    const text = readFileSync(RUNBOOK, "utf8");
    const names = migrationNames();

    const apply = section(text, "## Apply order");
    let last = -1;
    for (const n of names) {
      const at = apply.indexOf(n);
      expect(at, n).toBeGreaterThan(last);
      last = at;
    }
    const wipe = apply.indexOf("supabase/scripts/wipe_all_2026-11-27.sql");
    expect(wipe).toBeGreaterThan(apply.indexOf(MFW62));
    expect(wipe).toBeLessThan(apply.indexOf(FILE));

    const deny = section(text, "## Anon-key denial checklist");
    const functions = new Set(
      names.flatMap((n) => [...old(n).matchAll(/create function public\.(\w+)\(/g)].map((m) => m[1])),
    );
    for (const n of [...functions, "creations_public", "creations_private_ownership", "creations_public_visible"]) {
      expect(deny, n).toMatch(new RegExp(`\\b${n}\\b`));
    }
    for (const needle of ["has_function_privilege", "has_table_privilege", "relrowsecurity"]) {
      expect(deny).toContain(needle);
    }

    expect(text).toContain("project ref");
    expect(text).toContain("docs/follow-ups.md");
    expect(text).not.toMatch(/[a-z0-9]{20}\.supabase\.co/);
    expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
  });

  it("DS16 docs/follow-ups.md has the owner row for this migration", () => {
    const lines = readFileSync(FOLLOW_UPS, "utf8").split("\n");
    const row = lines.find((l) => l.startsWith("| MFW-118 |"));
    expect(row).toBeDefined();
    expect(row).toContain(FILE);
    expect(row).toContain("docs/runbooks/migrations.md");
  });

  it("DS17 the runbook applies a migration inside begin / commit and rolls back on any error", () => {
    const apply = section(readFileSync(RUNBOOK, "utf8"), "## Applying one migration");
    const begin = apply.indexOf("`begin;`");
    const commit = apply.indexOf("`commit;`");
    const rollback = apply.indexOf("`rollback;`");
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(commit).toBeGreaterThan(begin);
    expect(rollback).toBeGreaterThan(commit);
    expect(apply).toContain("begin;\n   -- the whole migration file, unchanged\n   commit;");
    expect(apply).toContain("`text`, `NO`, `'test'::text`");
    expect(apply.toLowerCase()).not.toContain("do not re-run");
  });
});
