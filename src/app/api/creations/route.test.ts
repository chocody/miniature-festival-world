// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KEY_ID_FIXTURE,
  OWNER_HASH_FIXTURE,
  PRIVATE_CIPHERTEXT_FIXTURE,
  makeNewCreation,
  makePrivateWish,
} from "@/services/api/__fixtures__/creations";
import {
  CreationRepositoryError,
  type CreationRepository,
  type ReportOutcome,
} from "@/services/api/creationRepository";
import { PUBLIC_CREATION_KEYS } from "@/services/api/creationTypes";
import { createInMemoryCreationRepository } from "@/services/api/inMemoryCreationRepository";
import { handleListCreations } from "@/services/api/listCreations";

const START = Date.parse("2026-11-24T12:00:00.000Z");
const STEP = 1000;
const PRIVATE_NAMES = [
  "owner_token",
  "ownerToken",
  "owner_token_hash",
  "ownerTokenHash",
  "private_wish_text",
  "privateWishText",
  "privateWish",
  "private_wish_key_id",
  "report_count",
  "reportCount",
  "moderation_status",
  "moderationStatus",
];

function collectKeys(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) value.forEach((v) => collectKeys(v, out));
  else if (typeof value === "object" && value !== null) {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      collectKeys(v, out);
    }
  }
}

function setup() {
  let t = START;
  const repo = createInMemoryCreationRepository({ now: () => t });
  const tick = () => {
    t += STEP;
  };
  const call = (qs: string, r: () => CreationRepository = () => repo) =>
    handleListCreations(new Request(`http://localhost/api/creations?${qs}`), r);
  return { repo, tick, call };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/creations", () => {
  it("returns only public fields (AC 3)", async () => {
    const { repo, tick, call } = setup();
    await repo.insertCreation(makeNewCreation());
    tick();
    await repo.insertCreation(makeNewCreation({ publicWishText: null, privateWish: makePrivateWish() }));
    const res = await call("event=loy_krathong&zone=1");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const text = await res.text();
    for (const s of [...PRIVATE_NAMES, OWNER_HASH_FIXTURE, PRIVATE_CIPHERTEXT_FIXTURE, KEY_ID_FIXTURE]) {
      expect(text).not.toContain(s);
    }
    const body = JSON.parse(text) as { items: Record<string, unknown>[] };
    expect(body.items).toHaveLength(2);
    for (const item of body.items) expect(Object.keys(item).sort()).toEqual([...PUBLIC_CREATION_KEYS].sort());
    expect(body.items[1]?.publicWishText).toBeNull();
    const keys = new Set<string>();
    collectKeys(body, keys);
    for (const name of PRIVATE_NAMES) expect(keys.has(name)).toBe(false);
  });

  it("responds with at most 80 items and limit 80 (AC 4)", async () => {
    const { repo, tick, call } = setup();
    for (let i = 0; i < 81; i++) {
      await repo.insertCreation(makeNewCreation({ zoneId: 3 }));
      tick();
    }
    const body = (await (await call("event=loy_krathong&zone=3")).json()) as { items: unknown[]; limit: number };
    expect(body.items).toHaveLength(80);
    expect(body.limit).toBe(80);
  });

  it("hidden items are not served", async () => {
    const { repo, call } = setup();
    const c = await repo.insertCreation(makeNewCreation());
    repo.setModeration(c.id, { moderationStatus: "hidden" });
    const body = (await (await call("event=loy_krathong&zone=1")).json()) as { items: unknown[] };
    expect(body.items).toHaveLength(0);
  });

  it("bad query returns 400", async () => {
    const { call } = setup();
    const a = await call("event=nope&zone=1");
    expect(a.status).toBe(400);
    expect(await a.json()).toEqual({ error: "invalid_query", field: "event" });
    const b = await call("event=loy_krathong&zone=0");
    expect(b.status).toBe(400);
    expect(await b.json()).toEqual({ error: "invalid_query", field: "zone" });
  });

  it("repository failure returns 503 without details", async () => {
    const { call } = setup();
    const failing: CreationRepository = {
      backend: "memory",
      listPublicZone: () => Promise.reject(new Error(`boom ${OWNER_HASH_FIXTURE}`)),
      insertCreation: () => Promise.reject(new Error("unused")),
      reportCreation: async (): Promise<ReportOutcome> => "ignored",
    };
    const res = await call("event=loy_krathong&zone=1", () => failing);
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: "unavailable" });
    expect(text).not.toContain(OWNER_HASH_FIXTURE);
    const res2 = await call("event=loy_krathong&zone=1", () => {
      throw new CreationRepositoryError("backend_misconfigured", "SUPABASE_URL");
    });
    expect(res2.status).toBe(503);
    expect(await res2.json()).toEqual({ error: "unavailable" });
  });

  it("real GET without Supabase env", async () => {
    vi.resetModules();
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/creations?event=loy_krathong&zone=1"));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(Array.isArray((JSON.parse(text) as { items: unknown }).items)).toBe(true);
    for (const name of PRIVATE_NAMES) expect(text).not.toContain(name);
  });
});
