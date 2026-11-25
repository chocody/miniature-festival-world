// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CREATION_OWNERSHIP_RPC_PATH } from "@/config/database.config";

const DIR = join(process.cwd(), "supabase", "migrations");
const FILE = "20261125000000_mfw31_creation_ownership_read.sql";
const sql = readFileSync(join(DIR, FILE), "utf8")
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join(" ")
  .replace(/\s+/g, " ")
  .toLowerCase()
  .trim();

describe("MFW-31 ownership read migration", () => {
  it("sorts after the MFW-45 migration", () => {
    const names = readdirSync(DIR).filter((n) => n.endsWith(".sql")).sort();
    const mfw45 = names.findIndex((n) => n.includes("_mfw45_"));
    expect(names.indexOf(FILE)).toBeGreaterThan(mfw45);
  });
  it("declares the function as security invoker with a fixed search path", () => {
    expect(sql).toContain(
      "create function public.mfw_creation_ownership(p_creation_id uuid) returns table (owner_token_hash text, private_wish_text text, private_wish_key_id text)",
    );
    expect(sql).toContain("security invoker");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain(" stable ");
    expect(sql).not.toContain("security definer");
  });
  it("filters by id and expiry and joins the public table", () => {
    expect(sql).toContain("p.expires_at > now()");
    expect(sql).toContain("o.creation_id = p_creation_id");
    expect(sql).toContain("join public.creations_public");
  });
  it("is executable by service_role only", () => {
    expect(sql).toContain("revoke all on function public.mfw_creation_ownership(uuid) from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.mfw_creation_ownership(uuid) to service_role");
    expect(sql.match(/grant /g)).toHaveLength(1);
    expect(sql).not.toMatch(/grant [^;]* to (anon|authenticated)/);
  });
  it("changes no table or policy and returns no moderation or coord data", () => {
    for (const forbidden of ["create table", "alter table", "create policy", "drop ", "*", "report_count", "moderation_status", "coord"]) {
      expect(sql).not.toContain(forbidden);
    }
    expect(sql.endsWith("notify pgrst, 'reload schema';")).toBe(true);
  });
  it("the RPC path constant names the function", () => {
    expect(CREATION_OWNERSHIP_RPC_PATH).toBe("rpc/" + "mfw_creation_ownership");
  });
});
