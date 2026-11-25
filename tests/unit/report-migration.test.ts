// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTO_HIDE_MODERATION_STATUS,
  AUTO_HIDE_REPORT_THRESHOLD,
  DEFAULT_MODERATION_STATUS,
} from "@/config/moderation.config";

const dir = path.resolve(__dirname, "../../supabase/migrations");
const FILE = "20261124010000_mfw13_report_creation.sql";
const raw = fs.readFileSync(path.join(dir, FILE), "utf8");
const sql = raw.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").toLowerCase();

describe("MFW-13 report migration", () => {
  it("runs after the MFW-12 migration", () => {
    const files = fs.readdirSync(dir).sort();
    const mfw12 = files.find((f) => /_mfw12_/.test(f));
    expect(mfw12).toBeDefined();
    expect(files.indexOf(FILE)).toBeGreaterThan(files.indexOf(mfw12 as string));
  });

  it("is a security invoker function with an empty search_path", () => {
    expect(sql).toContain("create function public.mfw_report_creation(p_creation_id uuid) returns boolean");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("set search_path = ''");
    expect(sql).not.toContain("security definer");
  });

  it("threshold equals AUTO_HIDE_REPORT_THRESHOLD", () => {
    expect(sql).toContain(`o.report_count < ${AUTO_HIDE_REPORT_THRESHOLD}`);
    expect(sql).toContain(`o.report_count + 1 >= ${AUTO_HIDE_REPORT_THRESHOLD}`);
  });

  it("flags at the threshold", () => {
    expect(sql).toContain(`'${AUTO_HIDE_MODERATION_STATUS}'::public.moderation_status`);
    expect(sql).toContain(`o.moderation_status = '${DEFAULT_MODERATION_STATUS}'`);
  });

  it("counts only visible public wishes", () => {
    expect(sql).toContain("p.public_wish_text is not null");
    expect(sql).toContain("p.expires_at > now()");
  });

  it("is server-only", () => {
    expect(sql).toContain("revoke all on function public.mfw_report_creation(uuid) from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.mfw_report_creation(uuid) to service_role");
    expect(sql).not.toMatch(/\bgrant\b[^;]*\b(anon|authenticated)\b/);
    const grantees = [...sql.matchAll(/\bgrant\b[^;]*\bto (\w+)/g)].map((m) => m[1]);
    expect(grantees.length).toBeGreaterThan(0);
    for (const g of grantees) expect(g).toBe("service_role");
  });

  it("makes no schema changes", () => {
    expect(sql).not.toMatch(/create table|alter table|drop |create policy|create view|select \*|returning \*/);
  });

  it("reloads the PostgREST schema", () => {
    expect(raw).toContain("notify pgrst, 'reload schema'");
  });
});
