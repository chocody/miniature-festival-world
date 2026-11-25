import { expect, test, type APIResponse, type APIRequestContext } from "@playwright/test";
import { e2eCreateBody, e2eOwnerToken } from "./fixtures/createCreationFixtures";

const NOT_FOUND = '{"error":"not_found"}';
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const PRIVATE_KEYS = ["owner_token", "owner_token_hash", "private_wish_text", "private_display_name", "ownerToken", "privateWish"];

/** Writes close with the feature flag or at expiry; then the route answers 409 and unit tests cover the success path. */
async function closedNote(res: APIResponse): Promise<boolean> {
  if (res.status() !== 409) return false;
  expect(await res.json()).toEqual({ error: "event_closed" });
  test.info().annotations.push({ type: "note", description: "writes closed by flag or expiry; covered by unit tests" });
  return true;
}

interface ListedItem {
  id: string;
  publicWishText: string | null;
  displayName: string | null;
}

async function zoneText(request: APIRequestContext, zoneId: number): Promise<{ text: string; items: ListedItem[] }> {
  const res = await request.get(`/api/creations?event=loy_krathong&zone=${zoneId}`);
  expect(res.status()).toBe(200);
  const text = await res.text();
  for (const key of PRIVATE_KEYS) expect(text).not.toContain(key);
  return { text, items: (JSON.parse(text) as { items: ListedItem[] }).items };
}

test("E1 the owner opens, closes and reopens a named private wish", async ({ request }) => {
  const token = e2eOwnerToken();
  const name = "น้องมะลิ e2e";
  const wish = "ความลับ e2e switch " + Date.now();
  const created = await request.post("/api/creations", {
    data: e2eCreateBody({ ownerToken: token, wishVisibility: "private", wishText: wish, displayName: name }),
  });
  if (await closedNote(created)) return;
  expect(created.status()).toBe(201);
  const { creation } = (await created.json()) as { creation: { id: string; zoneId: number; displayName: string | null } };
  expect(creation.displayName).toBeNull();

  const switchTo = async (open: boolean) => {
    const res = await request.post("/api/wish-visibility", { data: { creationId: creation.id, ownerToken: token, open } });
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toContain("no-store");
    expect(await res.json()).toEqual({ open });
  };
  const shown = async () => (await zoneText(request, creation.zoneId)).items.find((i) => i.id === creation.id);

  await switchTo(true);
  expect(await shown()).toMatchObject({ publicWishText: wish, displayName: name });
  await switchTo(false);
  const closed = await zoneText(request, creation.zoneId);
  expect(closed.text).not.toContain(wish);
  expect(closed.text).not.toContain(name);
  await switchTo(true);
  expect(await shown()).toMatchObject({ publicWishText: wish, displayName: name });
});

test("E2 another token and an unknown id get the same 404", async ({ request }) => {
  const token = e2eOwnerToken();
  const created = await request.post("/api/creations", {
    data: e2eCreateBody({ ownerToken: token, wishVisibility: "private", wishText: "ความลับ e2e 404 " + Date.now() }),
  });
  if (await closedNote(created)) return;
  expect(created.status()).toBe(201);
  const { creation } = (await created.json()) as { creation: { id: string } };
  const other = await request.post("/api/wish-visibility", {
    data: { creationId: creation.id, ownerToken: e2eOwnerToken(), open: true },
  });
  const unknown = await request.post("/api/wish-visibility", { data: { creationId: UNKNOWN_ID, ownerToken: token, open: true } });
  for (const res of [other, unknown]) {
    expect(res.status()).toBe(404);
    expect(await res.text()).toBe(NOT_FOUND);
  }
});

test("E3 refuses a token in the URL and a non-JSON body", async ({ request }) => {
  const token = e2eOwnerToken();
  const query = await request.post(`/api/wish-visibility?ownerToken=${token}`, {
    data: { creationId: UNKNOWN_ID, ownerToken: token, open: true },
  });
  expect(query.status()).toBe(400);
  expect(await query.json()).toEqual({ error: "unexpected_query" });
  const wrongType = await request.post("/api/wish-visibility", { headers: { "content-type": "text/plain" }, data: "hello" });
  expect(wrongType.status()).toBe(415);
  expect(await wrongType.json()).toEqual({ error: "unsupported_media_type" });
});

test("E4 a display name with an email is blocked at create", async ({ request }) => {
  const res = await request.post("/api/creations", { data: e2eCreateBody({ displayName: "me@example.com" }) });
  if (await closedNote(res)) return;
  expect(res.status()).toBe(422);
  const text = await res.text();
  expect(JSON.parse(text)).toEqual({ error: "moderation_blocked", reasons: ["email"] });
  expect(text).not.toContain("me@example.com");
});
