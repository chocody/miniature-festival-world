import { expect, test, type APIResponse } from "@playwright/test";
import { E2E_DRIFT_SPEED_FACTOR, e2eCreateBody, e2eOwnerToken } from "./fixtures/createCreationFixtures";

const PRIVATE_NAMES = ["owner_token", "ownerToken", "private_wish_text", "privateWishText", "privateWish"];
const PUBLIC_KEYS = ["appearance", "coord", "createdAt", "displayName", "eventId", "expiresAt", "id", "publicWishText", "zoneId"];

/** Writes close with the feature flag or at expiry; then the route answers 409 and unit tests cover the success path. */
async function closedNote(res: APIResponse): Promise<boolean> {
  if (res.status() !== 409) return false;
  expect(await res.json()).toEqual({ error: "event_closed" });
  test.info().annotations.push({ type: "note", description: "writes closed by flag or expiry; covered by unit tests" });
  return true;
}

test("refuses malformed requests without echoing them", async ({ request }) => {
  const wrongType = await request.post("/api/creations", { headers: { "content-type": "text/plain" }, data: "hello" });
  expect(wrongType.status()).toBe(415);
  expect(wrongType.headers()["cache-control"]).toContain("no-store");

  const extra = await request.post("/api/creations", { data: e2eCreateBody({ zoneId: 3 }) });
  expect(extra.status()).toBe(400);
  expect(await extra.json()).toEqual({ error: "invalid_body", field: "body" });

  const badToken = await request.post("/api/creations", { data: e2eCreateBody({ ownerToken: "not-a-valid-token-value" }) });
  expect(badToken.status()).toBe(400);
  const text = await badToken.text();
  expect(JSON.parse(text)).toEqual({ error: "invalid_body", field: "ownerToken" });
  expect(text).not.toContain("not-a-valid");
});

test("stores a public krathong and returns only public fields", async ({ request }) => {
  const token = e2eOwnerToken();
  const res = await request.post("/api/creations", { data: e2eCreateBody({ ownerToken: token }) });
  if (await closedNote(res)) return;
  expect(res.status()).toBe(201);
  const text = await res.text();
  for (const name of PRIVATE_NAMES) expect(text).not.toContain(name);
  expect(text).not.toContain(token);
  const { creation } = JSON.parse(text) as { creation: Record<string, unknown> & { coord: { speedFactor: number }; id: string; zoneId: number } };
  expect(Object.keys(creation).sort()).toEqual(PUBLIC_KEYS);
  expect(creation.coord.speedFactor).toBe(E2E_DRIFT_SPEED_FACTOR);
  const list = await request.get(`/api/creations?event=loy_krathong&zone=${creation.zoneId}`);
  expect(list.status()).toBe(200);
  const body = (await list.json()) as { items: { id: string }[] };
  expect(body.items.map((i) => i.id)).toContain(creation.id);
});

test("keeps a private wish private", async ({ request }) => {
  const wish = "ความลับของฉันไม่บอกใคร";
  const res = await request.post("/api/creations", { data: e2eCreateBody({ wishText: wish, wishVisibility: "private" }) });
  if (await closedNote(res)) return;
  expect(res.status()).toBe(201);
  const text = await res.text();
  expect(text).not.toContain(wish);
  expect((JSON.parse(text) as { creation: { publicWishText: unknown } }).creation.publicWishText).toBeNull();
});
