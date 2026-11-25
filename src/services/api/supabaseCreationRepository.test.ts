// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  KEY_ID_FIXTURE,
  OWNER_HASH_FIXTURE,
  PRIVATE_CIPHERTEXT_FIXTURE,
  SPLINE_COORD_FIXTURE,
  makeNewCreation,
  makePrivateWish,
  makePublicRow,
} from "./__fixtures__/creations";
import { CreationRepositoryError } from "./creationRepository";
import { PUBLIC_CREATION_KEYS, type GuardedNewCreation } from "./creationTypes";
import { createSupabaseCreationRepository } from "./supabaseCreationRepository";

const KEY = "test-service-key";
const URL_OK = "https://example.supabase.co";
const sortedKeys = [...PUBLIC_CREATION_KEYS].sort();
const Z1 = { eventId: "loy_krathong", zoneId: 1 } as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function make(body: unknown, status = 200) {
  const fetchMock = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => {
    void args;
    return jsonResponse(body, status);
  });
  const repo = createSupabaseCreationRepository({ url: URL_OK, serviceRoleKey: KEY, fetch: fetchMock });
  return { fetchMock, repo };
}

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

describe("supabase repository: list", () => {
  it("sends the explicit-column request (sends limit=80)", async () => {
    const { fetchMock, repo } = make([makePublicRow()]);
    const items = await repo.listPublicZone(Z1);
    expect(items).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    const url = new URL(String(input));
    expect(url.pathname).toBe("/rest/v1/creations_public_visible");
    expect(url.searchParams.get("select")).toBe(
      "id,event_id,zone_id,appearance,coord,public_wish_text,created_at,expires_at,display_name",
    );
    expect(url.searchParams.get("select")).not.toContain("*");
    expect(url.searchParams.get("event_id")).toBe("eq.loy_krathong");
    expect(url.searchParams.get("zone_id")).toBe("eq.1");
    expect(url.searchParams.get("order")).toBe("created_at.asc,id.asc");
    expect(url.searchParams.get("limit")).toBe("80");
    expect(init.method).toBe("GET");
    expect(init.cache).toBe("no-store");
    const headers = new Headers(init.headers);
    expect(headers.get("apikey")).toBe(KEY);
    expect(headers.get("authorization")).toBe(`Bearer ${KEY}`);
  });

  it("strips private columns", async () => {
    const { repo } = make([
      makePublicRow({
        owner_token_hash: OWNER_HASH_FIXTURE,
        private_wish_text: PRIVATE_CIPHERTEXT_FIXTURE,
        private_wish_key_id: KEY_ID_FIXTURE,
      }),
    ]);
    const items = await repo.listPublicZone(Z1);
    expect(Object.keys(items[0] ?? {}).sort()).toEqual(sortedKeys);
    const json = JSON.stringify(items);
    for (const v of [OWNER_HASH_FIXTURE, PRIVATE_CIPHERTEXT_FIXTURE, KEY_ID_FIXTURE]) expect(json).not.toContain(v);
  });

  it("drops invalid rows", async () => {
    const { repo } = make([
      makePublicRow(),
      makePublicRow({ id: uuid(2), coord: { ...SPLINE_COORD_FIXTURE, x: 1 } }),
      makePublicRow({ id: "bad-id" }),
      makePublicRow({ id: uuid(4), zone_id: 2 }),
    ]);
    expect(await repo.listPublicZone(Z1)).toHaveLength(1);
  });

  it("re-caps 85 returned rows to 80", async () => {
    const rows = Array.from({ length: 85 }, (_, i) => makePublicRow({ id: uuid(i + 1) }));
    const { repo } = make(rows);
    expect(await repo.listPublicZone(Z1)).toHaveLength(80);
  });

  it("non-2xx: no body is read", async () => {
    const res = new Response(JSON.stringify({ detail: OWNER_HASH_FIXTURE }), { status: 400 });
    const jsonSpy = vi.spyOn(res, "json");
    const textSpy = vi.spyOn(res, "text");
    const repo = createSupabaseCreationRepository({ url: URL_OK, serviceRoleKey: KEY, fetch: async () => res });
    const err = (await repo.listPublicZone(Z1).catch((e: unknown) => e)) as CreationRepositoryError;
    expect(err).toBeInstanceOf(CreationRepositoryError);
    expect(err.code).toBe("backend_request_failed");
    expect(err.detail).toBe("status 400");
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(textSpy).not.toHaveBeenCalled();
    expect(err.message).not.toContain(OWNER_HASH_FIXTURE);
    expect(err.message).not.toContain(KEY);
  });

  it("network error", async () => {
    const repo = createSupabaseCreationRepository({
      url: URL_OK,
      serviceRoleKey: KEY,
      fetch: async () => {
        throw new Error(`down ${KEY}`);
      },
    });
    await expect(repo.listPublicZone(Z1)).rejects.toMatchObject({
      code: "backend_request_failed",
      detail: "network",
    });
  });

  it("non-array body", async () => {
    const { repo } = make({ rows: [] });
    await expect(repo.listPublicZone(Z1)).rejects.toMatchObject({ code: "invalid_backend_response" });
  });

  it("rejects an invalid query without a request", async () => {
    const { repo, fetchMock } = make([]);
    await expect(repo.listPublicZone({ eventId: "nope" as never, zoneId: 1 })).rejects.toMatchObject({
      code: "invalid_input",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("supabase repository: insert", () => {
  it("insert request (public)", async () => {
    const { fetchMock, repo } = make(makePublicRow());
    const created = await repo.insertCreation(makeNewCreation());
    expect(Object.keys(created).sort()).toEqual(sortedKeys);
    const [input, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect(new URL(String(input)).pathname).toBe("/rest/v1/rpc/mfw_insert_creation");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      [
        "p_appearance",
        "p_coord",
        "p_event_id",
        "p_expires_at",
        "p_owner_token_hash",
        "p_private_wish_key_id",
        "p_private_wish_text",
        "p_public_wish_text",
        "p_zone_id",
      ].sort(),
    );
    expect(body.p_private_wish_text).toBeNull();
    expect(body.p_private_wish_key_id).toBeNull();
    expect(body.p_owner_token_hash).toBe(OWNER_HASH_FIXTURE);
    expect(body.p_expires_at).toBe("2099-01-01T00:00:00.000Z");
  });

  it("accepts the array-of-one response form", async () => {
    const { repo } = make([makePublicRow()]);
    expect((await repo.insertCreation(makeNewCreation())).id).toBe(String(makePublicRow().id));
  });

  it("insert private", async () => {
    const { fetchMock, repo } = make(makePublicRow({ public_wish_text: null }));
    const created = await repo.insertCreation(makeNewCreation({ publicWishText: null, privateWish: makePrivateWish() }));
    expect(created.publicWishText).toBeNull();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.p_public_wish_text).toBeNull();
    expect(body.p_private_wish_text).toBe(PRIVATE_CIPHERTEXT_FIXTURE);
    expect(body.p_private_wish_key_id).toBe(KEY_ID_FIXTURE);
    expect(JSON.stringify(created)).not.toContain(PRIVATE_CIPHERTEXT_FIXTURE);
  });

  it("invalid insert makes no request", async () => {
    const { fetchMock, repo } = make(makePublicRow());
    await expect(
      repo.insertCreation(makeNewCreation({ coord: { ...SPLINE_COORD_FIXTURE, x: 1 } as never })),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("unusable insert response", async () => {
    const { repo } = make({});
    await expect(repo.insertCreation(makeNewCreation())).rejects.toMatchObject({
      code: "invalid_backend_response",
      detail: "insert",
    });
  });
});

describe("supabase repository: construction", () => {
  it.each([
    ["http remote", "http://example.com", KEY],
    ["not a url", "not a url", KEY],
    ["ftp", "ftp://x", KEY],
    ["blank key", URL_OK, "   "],
    ["empty key", URL_OK, ""],
  ])("%s throws backend_misconfigured", (_n, url, key) => {
    try {
      createSupabaseCreationRepository({ url, serviceRoleKey: key });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(CreationRepositoryError);
      expect((err as CreationRepositoryError).code).toBe("backend_misconfigured");
      expect((err as Error).message).not.toContain(KEY);
    }
  });

  it("accepts local http", () => {
    expect(createSupabaseCreationRepository({ url: "http://127.0.0.1:54321", serviceRoleKey: KEY }).backend).toBe(
      "supabase",
    );
    expect(createSupabaseCreationRepository({ url: "http://localhost:54321", serviceRoleKey: KEY }).backend).toBe(
      "supabase",
    );
  });
});

describe("supabase repository: report and moderation backstop (MFW-13)", () => {
  const ID = "950118ce-7d93-4cb6-bd84-44d91c5de9e3";

  it("report request", async () => {
    const { fetchMock, repo } = make(true);
    expect(await repo.reportCreation(ID)).toBe("counted");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect(new URL(String(input)).pathname).toBe("/rest/v1/rpc/mfw_report_creation");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toEqual({ p_creation_id: ID });
    expect(Object.keys(body).sort()).toEqual(["p_creation_id"]);
    const headers = new Headers(init.headers);
    expect(headers.get("apikey")).toBe(KEY);
    expect(headers.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("false means ignored; other bodies are invalid", async () => {
    expect(await make(false).repo.reportCreation(ID)).toBe("ignored");
    for (const bad of [{}, null, 1]) {
      await expect(make(bad).repo.reportCreation(ID)).rejects.toMatchObject({
        code: "invalid_backend_response",
        detail: "report",
      });
    }
  });

  it("report non-2xx: no body is read", async () => {
    const res = new Response(`{"leak":"${OWNER_HASH_FIXTURE}"}`, { status: 500 });
    const jsonSpy = vi.spyOn(res, "json");
    const textSpy = vi.spyOn(res, "text");
    const fetchMock = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => {
      void args;
      return res;
    });
    const repo = createSupabaseCreationRepository({ url: URL_OK, serviceRoleKey: KEY, fetch: fetchMock });
    const err = (await repo.reportCreation(ID).catch((e: unknown) => e)) as CreationRepositoryError;
    expect(err).toBeInstanceOf(CreationRepositoryError);
    expect(err.code).toBe("backend_request_failed");
    expect(err.detail).toBe("status 500");
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(textSpy).not.toHaveBeenCalled();
    expect(err.message).not.toContain(OWNER_HASH_FIXTURE);
    expect(err.message).not.toContain(KEY);
  });

  it("invalid report id makes no request", async () => {
    const { fetchMock, repo } = make(true);
    await expect(repo.reportCreation("nope")).rejects.toMatchObject({ code: "invalid_input" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("insert with a PII public wish makes no request", async () => {
    const { fetchMock, repo } = make({});
    await expect(repo.insertCreation(makeNewCreation({ publicWishText: "ig: somchai" }))).rejects.toMatchObject({
      code: "invalid_input",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("supabase repository: highestVisibleZoneId", () => {
  it("sends the explicit-column request", async () => {
    const { fetchMock, repo } = make([{ zone_id: 4 }]);
    expect(await repo.highestVisibleZoneId("loy_krathong")).toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    const url = new URL(String(input));
    expect(url.pathname).toBe("/rest/v1/creations_public_visible");
    expect(url.searchParams.get("select")).toBe("zone_id");
    expect(url.searchParams.get("event_id")).toBe("eq.loy_krathong");
    expect(url.searchParams.get("order")).toBe("zone_id.desc");
    expect(url.searchParams.get("limit")).toBe("1");
    expect(init.method).toBe("GET");
    expect(init.cache).toBe("no-store");
    const headers = new Headers(init.headers);
    expect(headers.get("apikey")).toBe(KEY);
    expect(headers.get("authorization")).toBe(`Bearer ${KEY}`);
  });
  it("maps an empty list to null", async () => {
    const { repo } = make([]);
    expect(await repo.highestVisibleZoneId("loy_krathong")).toBeNull();
  });
  it("rejects unusable rows and bodies", async () => {
    for (const body of [[{ zone_id: 0 }], [{}]]) {
      const { repo } = make(body);
      await expect(repo.highestVisibleZoneId("loy_krathong")).rejects.toMatchObject({
        code: "invalid_backend_response",
        detail: "zone",
      });
    }
    const { repo } = make({});
    await expect(repo.highestVisibleZoneId("loy_krathong")).rejects.toMatchObject({ detail: "list" });
  });
  it("does not read a non-2xx body and rejects an unknown event without a request", async () => {
    const json = vi.fn();
    const text = vi.fn();
    const fetchMock = vi.fn(async () => ({ ok: false, status: 400, json, text, body: { cancel: async () => undefined } }) as unknown as Response);
    const repo = createSupabaseCreationRepository({ url: URL_OK, serviceRoleKey: KEY, fetch: fetchMock });
    await expect(repo.highestVisibleZoneId("loy_krathong")).rejects.toMatchObject({ code: "backend_request_failed" });
    expect(json).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
    fetchMock.mockClear();
    await expect(repo.highestVisibleZoneId("nope" as never)).rejects.toMatchObject({ detail: "eventId" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("supabase repository: MFW-45 zone RPCs and guarded insert", () => {
  const coord = { ...SPLINE_COORD_FIXTURE };
  const guarded = (over: Partial<GuardedNewCreation> = {}): GuardedNewCreation => ({
    ...makeNewCreation(),
    createdAt: new Date("2026-11-24T12:00:00.000Z"),
    expectedOccupantIds: [uuid(1), uuid(2)],
    ...over,
  });
  const lastCall = (m: ReturnType<typeof make>["fetchMock"]) => m.mock.calls[0] as [RequestInfo | URL, RequestInit];

  it("zone counts request and mapping", async () => {
    const { fetchMock, repo } = make([{ zone_id: 1, item_count: 80 }, { zone_id: 2, item_count: 3 }]);
    expect(await repo.zoneItemCounts("loy_krathong")).toEqual([
      { zoneId: 1, itemCount: 80 },
      { zoneId: 2, itemCount: 3 },
    ]);
    const [input, init] = lastCall(fetchMock);
    expect(new URL(String(input)).pathname).toBe("/rest/v1/rpc/mfw_zone_item_counts");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ p_event_id: "loy_krathong" });
  });

  it("zone counts fail closed on a bad row", async () => {
    for (const body of [[{ zone_id: 0, item_count: 1 }], [{ zone_id: 1, item_count: 0 }], [{ zone_id: 1, item_count: 1 }, { zone_id: 1, item_count: 2 }], {}]) {
      const { repo } = make(body);
      await expect(repo.zoneItemCounts("loy_krathong")).rejects.toMatchObject({
        code: "invalid_backend_response",
        detail: "zone",
      });
    }
  });

  it("occupants request and mapping", async () => {
    const { fetchMock, repo } = make([{ id: uuid(1), coord, created_at: "2026-11-24T12:00:00+00:00" }]);
    const out = await repo.listZoneOccupants(Z1);
    expect(out).toEqual([{ id: uuid(1), coord, createdAtMs: Date.parse("2026-11-24T12:00:00.000Z") }]);
    const [input, init] = lastCall(fetchMock);
    expect(new URL(String(input)).pathname).toBe("/rest/v1/rpc/mfw_zone_occupants");
    expect(JSON.parse(String(init.body))).toEqual({ p_event_id: "loy_krathong", p_zone_id: 1 });
  });

  it("occupants fail closed on a bad coord or duplicate id", async () => {
    const good = { id: uuid(1), coord, created_at: "2026-11-24T12:00:00Z" };
    for (const body of [[{ ...good, coord: { x: 1, y: 2, z: 3 } }], [good, good], "no"]) {
      const { repo } = make(body);
      await expect(repo.listZoneOccupants(Z1)).rejects.toMatchObject({ code: "invalid_backend_response", detail: "occupant" });
    }
  });

  it("guarded insert request", async () => {
    const { fetchMock, repo } = make([makePublicRow()]);
    const result = await repo.insertCreationGuarded(guarded());
    expect(result.status).toBe("inserted");
    const [input, init] = lastCall(fetchMock);
    expect(new URL(String(input)).pathname).toBe("/rest/v1/rpc/mfw_insert_creation_guarded_v2");
    const text = String(init.body);
    const body = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      [
        "p_appearance",
        "p_coord",
        "p_created_at",
        "p_display_name",
        "p_event_id",
        "p_expected_occupant_ids",
        "p_expires_at",
        "p_owner_token_hash",
        "p_private_display_name",
        "p_private_wish_key_id",
        "p_private_wish_text",
        "p_public_wish_text",
        "p_zone_id",
      ].sort(),
    );
    expect(body.p_created_at).toBe("2026-11-24T12:00:00.000Z");
    expect(body.p_expected_occupant_ids).toEqual([uuid(1), uuid(2)]);
    expect(body.p_owner_token_hash).toBe(OWNER_HASH_FIXTURE);
    expect(body.p_display_name).toBeNull();
    expect(body.p_private_display_name).toBeNull();
    expect(text).not.toContain("SeCrEt");
  });

  it("guarded insert result mapping", async () => {
    expect(await make([]).repo.insertCreationGuarded(guarded())).toEqual({ status: "zone_changed" });
    await expect(make([makePublicRow(), makePublicRow()]).repo.insertCreationGuarded(guarded())).rejects.toMatchObject({ detail: "insert" });
    await expect(make({}).repo.insertCreationGuarded(guarded())).rejects.toMatchObject({ detail: "insert" });
    await expect(make([{ id: "x" }]).repo.insertCreationGuarded(guarded())).rejects.toMatchObject({ detail: "insert" });
  });

  it("guarded insert with invalid input sends no request", async () => {
    const { fetchMock, repo } = make([]);
    await expect(repo.insertCreationGuarded(guarded({ expectedOccupantIds: ["nope"] }))).rejects.toBeInstanceOf(CreationRepositoryError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never reads the body of an error response", async () => {
    const res = new Response(JSON.stringify({ hash: OWNER_HASH_FIXTURE }), { status: 409 });
    const json = vi.spyOn(res, "json");
    const text = vi.spyOn(res, "text");
    const repo = createSupabaseCreationRepository({ url: URL_OK, serviceRoleKey: KEY, fetch: async () => res });
    await expect(repo.insertCreationGuarded(guarded())).rejects.toMatchObject({ code: "backend_request_failed" });
    expect(json).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
  });
});

describe("supabase repository: readOwnership (MFW-31)", () => {
  const ID = "950118ce-7d93-4cb6-bd84-44d91c5de9e3";
  const FULL = {
    owner_token_hash: OWNER_HASH_FIXTURE,
    private_wish_text: PRIVATE_CIPHERTEXT_FIXTURE,
    private_wish_key_id: KEY_ID_FIXTURE,
  };

  it("sends only the creation id to the RPC with the service-role headers", async () => {
    const { fetchMock, repo } = make([]);
    expect(await repo.readOwnership(ID)).toBeNull();
    const [input, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect(new URL(String(input)).pathname).toBe("/rest/v1/rpc/mfw_creation_ownership");
    expect(init.method).toBe("POST");
    expect(String(init.body)).toBe(JSON.stringify({ p_creation_id: ID }));
    expect(String(init.body)).not.toContain(OWNER_HASH_FIXTURE);
    const headers = new Headers(init.headers);
    expect(headers.get("apikey")).toBe(KEY);
    expect(headers.get("authorization")).toBe(`Bearer ${KEY}`);
  });

  it("maps rows", async () => {
    expect(await make([FULL]).repo.readOwnership(ID)).toEqual({
      ownerTokenHash: OWNER_HASH_FIXTURE,
      privateWish: { ciphertext: PRIVATE_CIPHERTEXT_FIXTURE, keyId: KEY_ID_FIXTURE },
    });
    expect(
      await make([{ owner_token_hash: OWNER_HASH_FIXTURE, private_wish_text: null, private_wish_key_id: null }]).repo.readOwnership(ID),
    ).toEqual({ ownerTokenHash: OWNER_HASH_FIXTURE, privateWish: null });
  });

  it("malformed answers fail closed", async () => {
    const bad: unknown[] = [
      [FULL, FULL],
      {},
      null,
      [{ ...FULL, owner_token_hash: "nope" }],
      [{ ...FULL, private_wish_key_id: null }],
      [{ ...FULL, private_wish_text: null }],
      [{ ...FULL, private_wish_text: "not-a-ciphertext" }],
      [{ owner_token_hash: OWNER_HASH_FIXTURE, private_wish_text: FULL.private_wish_text }],
      ["row"],
    ];
    for (const body of bad) {
      await expect(make(body).repo.readOwnership(ID)).rejects.toMatchObject({
        code: "invalid_backend_response",
        detail: "ownership",
      });
    }
  });

  it("non-2xx does not read the body; a non-uuid makes no request", async () => {
    const res = new Response(`{"leak":"${OWNER_HASH_FIXTURE}"}`, { status: 500 });
    const textSpy = vi.spyOn(res, "text");
    const jsonSpy = vi.spyOn(res, "json");
    const fetchMock = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => {
      void args;
      return res;
    });
    const repo = createSupabaseCreationRepository({ url: URL_OK, serviceRoleKey: KEY, fetch: fetchMock });
    await expect(repo.readOwnership(ID)).rejects.toMatchObject({ code: "backend_request_failed" });
    expect(textSpy).not.toHaveBeenCalled();
    expect(jsonSpy).not.toHaveBeenCalled();
    const other = make([]);
    await expect(other.repo.readOwnership("nope")).rejects.toMatchObject({ code: "invalid_input", detail: "creationId" });
    expect(other.fetchMock).not.toHaveBeenCalled();
  });
});

describe("supabase repository: wish switch and display name (MFW-62)", () => {
  const ID = "950118ce-7d93-4cb6-bd84-44d91c5de9e3";
  const NAME_CIPHERTEXT = "v1.BBBBBBBBBBBBBBBB.NAMExPRIVATExCIPHERTEXTxxx" as typeof PRIVATE_CIPHERTEXT_FIXTURE;
  const firstCall = (m: ReturnType<typeof make>["fetchMock"]) => m.mock.calls[0] as [RequestInfo | URL, RequestInit];
  const guarded = (over: Partial<GuardedNewCreation> = {}): GuardedNewCreation => ({
    ...makeNewCreation(),
    createdAt: new Date("2026-11-24T12:00:00.000Z"),
    expectedOccupantIds: [],
    ...over,
  });
  const CLOSED_ROW = {
    owner_token_hash: OWNER_HASH_FIXTURE,
    public_wish_text: null,
    display_name: null,
    private_wish_text: PRIVATE_CIPHERTEXT_FIXTURE,
    private_wish_key_id: KEY_ID_FIXTURE,
    private_display_name: NAME_CIPHERTEXT,
    hidden: false,
  };
  const OPEN_ROW = {
    owner_token_hash: OWNER_HASH_FIXTURE,
    public_wish_text: "ขอให้ทุกคนมีความสุข",
    display_name: "สมชาย",
    private_wish_text: null,
    private_wish_key_id: null,
    private_display_name: null,
    hidden: true,
  };

  it("a guarded insert with a public name sends p_display_name", async () => {
    const { fetchMock, repo } = make([makePublicRow({ display_name: "สมชาย" })]);
    const result = await repo.insertCreationGuarded(guarded({ displayName: "สมชาย" }));
    expect(result).toMatchObject({ status: "inserted", creation: { displayName: "สมชาย" } });
    const body = JSON.parse(String(firstCall(fetchMock)[1].body)) as Record<string, unknown>;
    expect(body.p_display_name).toBe("สมชาย");
    expect(body.p_private_display_name).toBeNull();
  });

  it("a guarded insert with a private name sends the ciphertext and the shared key id", async () => {
    const { fetchMock, repo } = make([makePublicRow({ public_wish_text: null })]);
    await repo.insertCreationGuarded(
      guarded({
        publicWishText: null,
        privateWish: makePrivateWish(),
        privateDisplayName: { ciphertext: NAME_CIPHERTEXT, keyId: KEY_ID_FIXTURE },
      }),
    );
    const body = JSON.parse(String(firstCall(fetchMock)[1].body)) as Record<string, unknown>;
    expect(body.p_private_display_name).toBe(NAME_CIPHERTEXT);
    expect(body.p_private_wish_key_id).toBe(KEY_ID_FIXTURE);
    expect(body.p_display_name).toBeNull();
  });

  it("the unguarded v1 insert refuses a name before any request", async () => {
    const { fetchMock, repo } = make([makePublicRow()]);
    await expect(repo.insertCreation(makeNewCreation({ displayName: "สมชาย" }))).rejects.toMatchObject({
      code: "invalid_input",
      detail: "displayName",
    });
    await expect(
      repo.insertCreation(
        makeNewCreation({
          publicWishText: null,
          privateWish: makePrivateWish(),
          privateDisplayName: { ciphertext: NAME_CIPHERTEXT, keyId: KEY_ID_FIXTURE },
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid_input", detail: "privateDisplayName" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("list rows map display_name", async () => {
    const items = await make([
      makePublicRow({ id: uuid(1), display_name: "สมชาย" }),
      makePublicRow({ id: uuid(2), display_name: 5 }),
      makePublicRow({ id: uuid(3), public_wish_text: null, display_name: "x" }),
    ]).repo.listPublicZone(Z1);
    expect(items.map((i) => [i.id, i.displayName])).toEqual([
      [uuid(1), "สมชาย"],
      [uuid(3), null],
    ]);
    expect(Object.keys(items[0] ?? {}).sort()).toEqual(sortedKeys);
  });

  it("readWishSwitchState sends only the creation id and maps rows", async () => {
    const empty = make([]);
    expect(await empty.repo.readWishSwitchState(ID)).toBeNull();
    const [input, init] = firstCall(empty.fetchMock);
    const url = new URL(String(input));
    expect(url.pathname).toBe("/rest/v1/rpc/mfw_creation_wish_state");
    expect(url.search).toBe("");
    expect(init.method).toBe("POST");
    expect(String(init.body)).toBe(JSON.stringify({ p_creation_id: ID }));
    expect(String(init.body)).not.toContain(OWNER_HASH_FIXTURE);
    expect(await make([CLOSED_ROW]).repo.readWishSwitchState(ID)).toEqual({
      ownerTokenHash: OWNER_HASH_FIXTURE,
      hidden: false,
      publicWishText: null,
      displayName: null,
      privateWish: { ciphertext: PRIVATE_CIPHERTEXT_FIXTURE, keyId: KEY_ID_FIXTURE },
      privateDisplayName: { ciphertext: NAME_CIPHERTEXT, keyId: KEY_ID_FIXTURE },
    });
    expect(await make([OPEN_ROW]).repo.readWishSwitchState(ID)).toEqual({
      ownerTokenHash: OWNER_HASH_FIXTURE,
      hidden: true,
      publicWishText: "ขอให้ทุกคนมีความสุข",
      displayName: "สมชาย",
      privateWish: null,
      privateDisplayName: null,
    });
  });

  it("readWishSwitchState fails closed on malformed rows", async () => {
    const bad: unknown[] = [
      [{ ...CLOSED_ROW, owner_token_hash: "nope" }],
      [{ ...CLOSED_ROW, hidden: "no" }],
      [{ ...OPEN_ROW, public_wish_text: null }], // display_name without public text
      [{ ...OPEN_ROW, private_display_name: NAME_CIPHERTEXT }], // private name without private wish
      [{ ...CLOSED_ROW, public_wish_text: "ขอให้ทุกคนมีความสุข" }], // both texts set
      [{ ...CLOSED_ROW, private_wish_key_id: null }],
      [{ ...CLOSED_ROW, private_display_name: "not-a-ciphertext" }],
      [{ ...CLOSED_ROW, display_name: 5 }],
      [CLOSED_ROW, CLOSED_ROW],
      {},
      [{}],
    ];
    for (const body of bad) {
      await expect(make(body).repo.readWishSwitchState(ID)).rejects.toMatchObject({
        code: "invalid_backend_response",
        detail: "wish_state",
      });
    }
    const other = make([]);
    await expect(other.repo.readWishSwitchState("NOPE")).rejects.toMatchObject({ code: "invalid_input", detail: "creationId" });
    expect(other.fetchMock).not.toHaveBeenCalled();
  });

  const openInput = {
    creationId: ID,
    expectedPrivateWish: PRIVATE_CIPHERTEXT_FIXTURE,
    publicWishText: "ขอให้ทุกคนมีความสุข",
    displayName: "สมชาย",
  };
  const closeInput = {
    creationId: ID,
    expectedPublicWishText: "ขอให้ทุกคนมีความสุข",
    expectedDisplayName: "สมชาย",
    privateWish: makePrivateWish(),
    privateDisplayName: { ciphertext: NAME_CIPHERTEXT, keyId: KEY_ID_FIXTURE },
  };

  it("openWish posts the compare-and-set body and maps the answer", async () => {
    const { fetchMock, repo } = make(true);
    expect(await repo.openWish(openInput)).toBe("switched");
    const [input, init] = firstCall(fetchMock);
    expect(new URL(String(input)).pathname).toBe("/rest/v1/rpc/mfw_open_creation_wish");
    expect(JSON.parse(String(init.body))).toEqual({
      p_creation_id: ID,
      p_expected_private_wish_text: PRIVATE_CIPHERTEXT_FIXTURE,
      p_public_wish_text: "ขอให้ทุกคนมีความสุข",
      p_display_name: "สมชาย",
    });
    expect(String(init.body)).not.toContain(OWNER_HASH_FIXTURE);
    expect(await make(false).repo.openWish(openInput)).toBe("conflict");
    await expect(make("yes").repo.openWish(openInput)).rejects.toMatchObject({ detail: "wish_switch" });
    const other = make(true);
    await expect(other.repo.openWish({ ...openInput, publicWishText: "โทร 0812345678" })).rejects.toMatchObject({
      code: "invalid_input",
      detail: "publicWishText",
    });
    expect(other.fetchMock).not.toHaveBeenCalled();
  });

  it("closeWish posts the compare-and-set body and maps the answer", async () => {
    const { fetchMock, repo } = make(true);
    expect(await repo.closeWish(closeInput)).toBe("switched");
    const [input, init] = firstCall(fetchMock);
    expect(new URL(String(input)).pathname).toBe("/rest/v1/rpc/mfw_close_creation_wish");
    expect(JSON.parse(String(init.body))).toEqual({
      p_creation_id: ID,
      p_expected_public_wish_text: "ขอให้ทุกคนมีความสุข",
      p_expected_display_name: "สมชาย",
      p_private_wish_text: PRIVATE_CIPHERTEXT_FIXTURE,
      p_private_wish_key_id: KEY_ID_FIXTURE,
      p_private_display_name: NAME_CIPHERTEXT,
    });
    expect(await make(false).repo.closeWish(closeInput)).toBe("conflict");
    await expect(make("yes").repo.closeWish(closeInput)).rejects.toMatchObject({ detail: "wish_switch" });
    const other = make(true);
    await expect(
      other.repo.closeWish({ ...closeInput, privateDisplayName: { ciphertext: NAME_CIPHERTEXT, keyId: "other-key" } }),
    ).rejects.toMatchObject({ code: "invalid_input", detail: "privateDisplayName" });
    expect(other.fetchMock).not.toHaveBeenCalled();
  });
});
