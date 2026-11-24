import { expect, test } from "@playwright/test";

const PRIVATE_NAMES = ["owner_token", "ownerToken", "private_wish_text", "privateWishText", "privateWish"];

test("GET /api/creations returns only public fields, capped at 80", async ({ request }) => {
  const res = await request.get("/api/creations?event=loy_krathong&zone=1");
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("no-store");
  const text = await res.text();
  for (const name of PRIVATE_NAMES) expect(text).not.toContain(name);
  const body = JSON.parse(text);
  expect(body).toMatchObject({ eventId: "loy_krathong", zoneId: 1, limit: 80 });
  expect(Array.isArray(body.items)).toBe(true);
  expect(body.items.length).toBeLessThanOrEqual(80);
});

test("GET /api/creations rejects an unknown event and a bad zone", async ({ request }) => {
  const badEvent = await request.get("/api/creations?event=nope&zone=1");
  expect(badEvent.status()).toBe(400);
  expect(await badEvent.json()).toEqual({ error: "invalid_query", field: "event" });
  const badZone = await request.get("/api/creations?event=loy_krathong&zone=0");
  expect(badZone.status()).toBe(400);
  expect(await badZone.json()).toEqual({ error: "invalid_query", field: "zone" });
});
