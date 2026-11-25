// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CREATE_NOW_MS, OWNER_TOKEN_FIXTURE, makeCreateBody, makeCreateRequest } from "@/services/api/__fixtures__/createCreation";
import { OTHER_OWNER_TOKEN_FIXTURE, SECRET_WISH_FIXTURE } from "@/services/api/__fixtures__/ownerWish";
import { makeWishVisibilityRequest } from "@/services/api/__fixtures__/wishVisibility";
import { PUBLIC_CREATION_KEYS, type PublicCreation } from "@/services/api/creationTypes";

const ENV_NAMES = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PRIVATE_WISH_KEY",
  "PRIVATE_WISH_KEY_ID",
  "PRIVATE_WISH_RETIRED_KEYS",
  "VERCEL_ENV",
];
const NAME = "น้องมะลิ";
const PRIVATE_KEYS = [
  "owner_token",
  "owner_token_hash",
  "private_wish_text",
  "private_display_name",
  "ownerToken",
  "ownerTokenHash",
  "privateWishText",
  "privateWish",
  "privateDisplayName",
];

beforeEach(() => {
  vi.resetModules();
  for (const name of ENV_NAMES) vi.stubEnv(name, "");
  vi.useFakeTimers({ toFake: ["Date"], now: CREATE_NOW_MS });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function createPrivateNamed() {
  const creations = await import("@/app/api/creations/route");
  const route = await import("./route");
  const res = await creations.POST(
    makeCreateRequest(makeCreateBody({ wishVisibility: "private", wishText: SECRET_WISH_FIXTURE, displayName: NAME })),
  );
  expect(res.status).toBe(201);
  const { creation } = (await res.json()) as { creation: PublicCreation };
  expect(creation.displayName).toBeNull();
  const list = async () => {
    const r = await creations.GET(new Request(`http://localhost/api/creations?event=loy_krathong&zone=${creation.zoneId}`));
    expect(r.status).toBe(200);
    const text = await r.text();
    const items = (JSON.parse(text) as { items: PublicCreation[] }).items;
    for (const item of items) expect(Object.keys(item)).toEqual([...PUBLIC_CREATION_KEYS]);
    for (const key of PRIVATE_KEYS) expect(text).not.toContain(key);
    const item = items.find((i) => i.id === creation.id);
    return { text, item: item === undefined ? undefined : [item.publicWishText, item.displayName] };
  };
  const switchTo = async (open: boolean, ownerToken: string = OWNER_TOKEN_FIXTURE) => {
    const r = await route.POST(makeWishVisibilityRequest({ creationId: creation.id, ownerToken, open }));
    expect(r.headers.get("cache-control")).toContain("no-store");
    return { status: r.status, text: await r.text() };
  };
  return { creation, list, switchTo };
}

describe("POST /api/wish-visibility (real routes, no env, in-memory)", () => {
  it("R1 open → close → open shows and hides the name and the wish", async () => {
    const { list, switchTo } = await createPrivateNamed();
    expect((await list()).item).toEqual([null, null]);
    expect(await switchTo(true)).toEqual({ status: 200, text: '{"open":true}' });
    expect((await list()).item).toEqual([SECRET_WISH_FIXTURE, NAME]);
    expect(await switchTo(false)).toEqual({ status: 200, text: '{"open":false}' });
    const closed = await list();
    expect(closed.item).toEqual([null, null]);
    expect(closed.text).not.toContain(SECRET_WISH_FIXTURE);
    expect(closed.text).not.toContain(NAME);
    expect(await switchTo(true)).toEqual({ status: 200, text: '{"open":true}' });
    expect((await list()).item).toEqual([SECRET_WISH_FIXTURE, NAME]);
  });

  it("R2 public responses carry exactly the public keys and no private names (AC5)", async () => {
    const { list } = await createPrivateNamed();
    const { text, item } = await list(); // list() asserts the key set and the absent private names
    expect(item).toEqual([null, null]);
    expect(text).not.toContain(OWNER_TOKEN_FIXTURE);
  });

  it("R3 a wrong token gets the uniform 404", async () => {
    const { switchTo, list } = await createPrivateNamed();
    expect(await switchTo(true, OTHER_OWNER_TOKEN_FIXTURE)).toEqual({ status: 404, text: '{"error":"not_found"}' });
    expect((await list()).item).toEqual([null, null]);
  });

  it("R4 refuses the in-memory backend in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const route = await import("./route");
    const res = await route.POST(
      makeWishVisibilityRequest({ creationId: "00000000-0000-4000-8000-000000000000", ownerToken: OWNER_TOKEN_FIXTURE, open: true }),
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
  });

  it("R5 exports only POST", async () => {
    expect(Object.keys(await import("./route"))).toEqual(["POST"]);
  });
});
