// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ACTIVE_EVENT_OVERRIDE, ACTIVE_EVENT_OVERRIDE_ENV } from "../../src/config/activeEvent.config";
import { resolveServerActiveEvent } from "../../src/services/api/activeEvent";
import { E2E_EVENT_ID } from "../e2e/fixtures/zoneFixtures";

const STATIC_IMPORT = /(?:^|[\n;])\s*(import|export)\s+([^;"']*?)\s*from\s*["']([^"']+)["']/g;
const SIDE_EFFECT_IMPORT = /(?:^|[\n;])\s*import\s*["']([^"']+)["']/g;

/** Specifiers of static VALUE imports/re-exports (type-only imports and dynamic import() are skipped). */
function staticValueSpecifiers(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(STATIC_IMPORT)) {
    const clause = m[2].trim();
    if (/^type\b/.test(clause)) continue;
    const named = /^\{([\s\S]*)\}$/.exec(clause);
    if (named) {
      const members = named[1].split(",").map((x) => x.trim()).filter(Boolean);
      if (members.length > 0 && members.every((x) => x.startsWith("type "))) continue;
    }
    out.push(m[3]);
  }
  for (const m of source.matchAll(SIDE_EFFECT_IMPORT)) out.push(m[1]);
  return out;
}

const ROOT = join(__dirname, "..", "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const rel = (p: string) => relative(ROOT, p).split("\\").join("/");
const isCode = (p: string) => /\.(ts|tsx)$/.test(p) && !/\.test\.(ts|tsx)$/.test(p);
const srcFiles = walk(join(ROOT, "src")).filter(isCode);
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function resolveLocal(spec: string, from: string): string | null {
  const base = spec.startsWith("@/") ? join(ROOT, "src", spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (base === null) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile() && /\.tsx?$/.test(candidate)) return candidate;
  }
  return null;
}

afterEach(() => vi.unstubAllEnvs());

describe("active event boundary", () => {
  it("only the server resolver imports the override", () => {
    const importers = srcFiles.filter((f) => /activeEvent\.config["']/.test(readFileSync(f, "utf8"))).map(rel);
    expect(importers).toEqual(["src/services/api/activeEvent.ts"]);
  });

  it("no client module reaches the server resolver", () => {
    const importers = srcFiles
      .filter((f) => {
        const text = readFileSync(f, "utf8");
        return (
          /from\s+["']@\/services\/api\/activeEvent["']/.test(text) ||
          (f.includes("/services/api/") && /from\s+["']\.\/activeEvent["']/.test(text))
        );
      })
      .map(rel)
      .filter((f) => f !== "src/services/api/activeEvent.ts")
      .sort();
    expect(importers).toEqual(["src/app/page.tsx", "src/services/api/createCreation.ts"]);
    for (const f of [
      "src/config/activeEvent.config.ts",
      "src/services/api/activeEvent.ts",
      "src/app/page.tsx",
      "src/components/ui/ActiveEventView.tsx",
      "src/components/ui/NoActiveEventScreen.tsx",
    ]) {
      expect(read(f).trimStart().startsWith('"use client"')).toBe(false);
    }
    expect(read("src/services/api/index.ts")).not.toContain("activeEvent");
  });

  it("the env var name is server-only", () => {
    expect(ACTIVE_EVENT_OVERRIDE_ENV).toBe("MFW_ACTIVE_EVENT_OVERRIDE");
    expect(ACTIVE_EVENT_OVERRIDE_ENV.startsWith("NEXT_PUBLIC_")).toBe(false);
    const withName = srcFiles.filter((f) => readFileSync(f, "utf8").includes("MFW_ACTIVE_EVENT_OVERRIDE")).map(rel);
    expect(withName).toEqual(["src/config/activeEvent.config.ts"]);
    for (const f of srcFiles) expect(readFileSync(f, "utf8"), rel(f)).not.toContain("NEXT_PUBLIC_MFW_ACTIVE_EVENT");
    expect(read("next.config.ts")).not.toContain("MFW_ACTIVE_EVENT_OVERRIDE");
    expect(read("src/config/activeEvent.config.ts")).not.toMatch(/process\.env|NEXT_PUBLIC/);
    expect(read("src/services/api/activeEvent.ts")).not.toMatch(/NEXT_PUBLIC/);
  });

  it("production ignores the env", () => {
    const t = Date.parse("2026-12-01T12:00:00+07:00");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv(ACTIVE_EVENT_OVERRIDE_ENV, "christmas");
    expect(resolveServerActiveEvent(t)).toEqual({ kind: "active", eventId: ACTIVE_EVENT_OVERRIDE, source: "override" });
    expect(resolveServerActiveEvent(t, { constantOverride: null }).kind).toBe("none");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(resolveServerActiveEvent(t)).toMatchObject({ kind: "active", eventId: "christmas" });
  });

  it("the override comes only from env and the constant, never from the request", () => {
    expect(read("src/services/api/activeEvent.ts")).not.toMatch(
      /next\/headers|cookies\(|headers\(|searchParams|nextUrl|Request\b/,
    );
  });

  it("the client bundle never reaches the resolver", () => {
    const clientFiles = srcFiles.filter((f) => readFileSync(f, "utf8").trimStart().startsWith('"use client"'));
    expect(clientFiles.length).toBeGreaterThan(0);
    const seen = new Set<string>(clientFiles);
    const queue = [...clientFiles];
    while (queue.length > 0) {
      const file = queue.shift()!;
      for (const spec of staticValueSpecifiers(readFileSync(file, "utf8"))) {
        const next = resolveLocal(spec, file);
        if (next !== null && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    const reached = new Set([...seen].map(rel));
    expect(reached.has("src/services/api/activeEvent.ts")).toBe(false);
    expect(reached.has("src/config/activeEvent.config.ts")).toBe(false);
    expect(reached.has("src/components/ui/FlowRoot.tsx")).toBe(true);
    expect(reached.has("src/services/api/zoneClient.ts")).toBe(true);
  });

  it("no selector or Coming Soon copy is left in src/components or src/app", () => {
    const banned = ["Coming Soon", "EventSelector", "เลือกเทศกาล", "LANDING_EVENT_SELECT", "SELECT_EVENT"];
    const files = srcFiles.map(rel).filter((f) => f.startsWith("src/components/") || f.startsWith("src/app/"));
    for (const f of files) for (const word of banned) expect(read(f), `${f} contains ${word}`).not.toContain(word);
  });

  it("e2e active event matches the override", () => {
    expect(E2E_EVENT_ID).toBe(ACTIVE_EVENT_OVERRIDE);
  });
});
