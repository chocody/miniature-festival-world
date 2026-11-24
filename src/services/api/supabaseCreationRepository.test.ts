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
import { PUBLIC_CREATION_KEYS } from "./creationTypes";
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
      "id,event_id,zone_id,appearance,coord,public_wish_text,created_at,expires_at",
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
