import { expect, test } from "@playwright/test";

const SOME_ID = "00000000-0000-4000-8000-000000000000";

test("POST /api/reports accepts a well-formed report", async ({ request }) => {
  const res = await request.post("/api/reports", { data: { creationId: SOME_ID } });
  expect(res.status()).toBe(202);
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect(await res.json()).toEqual({ status: "received" });
});

test("POST /api/reports rejects bad bodies and media types", async ({ request }) => {
  const bad = await request.post("/api/reports", { data: { creationId: "nope" } });
  expect(bad.status()).toBe(400);
  expect(await bad.json()).toEqual({ error: "invalid_body" });
  const plain = await request.post("/api/reports", { headers: { "content-type": "text/plain" }, data: "x" });
  expect(plain.status()).toBe(415);
  const get = await request.get("/api/reports");
  expect(get.status()).toBe(405);
});
