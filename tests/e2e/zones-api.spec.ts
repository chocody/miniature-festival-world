import { expect, test } from "@playwright/test";

test("GET /api/zones reports one zone without Supabase env", async ({ request }) => {
  const res = await request.get("/api/zones?event=loy_krathong");
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect(await res.json()).toEqual({ eventId: "loy_krathong", zoneCount: 1 });
});

test("GET /api/zones rejects an unknown event", async ({ request }) => {
  const res = await request.get("/api/zones?event=nope");
  expect(res.status()).toBe(400);
  expect(await res.json()).toEqual({ error: "invalid_query", field: "event" });
});
