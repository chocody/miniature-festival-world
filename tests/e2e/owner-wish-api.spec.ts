import { expect, test, type APIResponse } from "@playwright/test";
import { e2eCreateBody, e2eOwnerToken } from "./fixtures/createCreationFixtures";

const NOT_REVEALED = '{"wishText":null}';
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

/** Writes close with the feature flag or at expiry; then the route answers 409 and unit tests cover the success path. */
async function closedNote(res: APIResponse): Promise<boolean> {
  if (res.status() !== 409) return false;
  expect(await res.json()).toEqual({ error: "event_closed" });
  test.info().annotations.push({ type: "note", description: "writes closed by flag or expiry; covered by unit tests" });
  return true;
}

test("the owner reads a private wish, others get null", async ({ request }) => {
  const tokenA = e2eOwnerToken();
  const tokenB = e2eOwnerToken();
  const wish = "ความลับ e2e " + Date.now();
  const created = await request.post("/api/creations", {
    data: e2eCreateBody({ ownerToken: tokenA, wishVisibility: "private", wishText: wish }),
  });
  if (await closedNote(created)) return;
  expect(created.status()).toBe(201);
  const { creation } = (await created.json()) as { creation: { id: string; zoneId: number } };

  const own = await request.post("/api/private-wish", { data: { creationId: creation.id, ownerToken: tokenA } });
  expect(own.status()).toBe(200);
  expect(own.headers()["cache-control"]).toContain("no-store");
  expect(await own.json()).toEqual({ wishText: wish });

  const other = await request.post("/api/private-wish", { data: { creationId: creation.id, ownerToken: tokenB } });
  expect(other.status()).toBe(200);
  expect(await other.text()).toBe(NOT_REVEALED);

  const unknown = await request.post("/api/private-wish", { data: { creationId: UNKNOWN_ID, ownerToken: tokenA } });
  expect(await unknown.text()).toBe(NOT_REVEALED);

  const list = await request.get(`/api/creations?event=loy_krathong&zone=${creation.zoneId}`);
  expect(await list.text()).not.toContain(wish);
});

test("a public krathong reveals nothing", async ({ request }) => {
  const token = e2eOwnerToken();
  const created = await request.post("/api/creations", { data: e2eCreateBody({ ownerToken: token }) });
  if (await closedNote(created)) return;
  expect(created.status()).toBe(201);
  const { creation } = (await created.json()) as { creation: { id: string } };
  const res = await request.post("/api/private-wish", { data: { creationId: creation.id, ownerToken: token } });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ wishText: null });
});

test("refuses unsafe or malformed requests", async ({ request }) => {
  const token = e2eOwnerToken();
  const query = await request.post(`/api/private-wish?ownerToken=${token}`, { data: { creationId: UNKNOWN_ID, ownerToken: token } });
  expect(query.status()).toBe(400);
  expect(await query.json()).toEqual({ error: "unexpected_query" });

  const wrongType = await request.post("/api/private-wish", { headers: { "content-type": "text/plain" }, data: "hello" });
  expect(wrongType.status()).toBe(415);

  const bad = await request.post("/api/private-wish", { data: { creationId: "nope", ownerToken: token } });
  expect(bad.status()).toBe(400);
  expect(await bad.text()).not.toContain(token);

  const get = await request.get("/api/private-wish");
  expect(get.status()).toBe(405);
});
