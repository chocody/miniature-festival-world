// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CREATE_NOW_MS, makeCreateBody, makeCreateRequest } from "@/services/api/__fixtures__/createCreation";

const PRIVATE_NAMES = [
  "owner_token", "ownerToken", "owner_token_hash", "ownerTokenHash", "private_wish_text", "privateWishText",
  "privateWish", "private_wish_key_id", "report_count", "reportCount", "moderation_status", "moderationStatus",
];
const ENV_NAMES = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "PRIVATE_WISH_KEY", "PRIVATE_WISH_KEY_ID", "VERCEL_ENV"];

beforeEach(() => {
  vi.resetModules();
  for (const name of ENV_NAMES) vi.stubEnv(name, "");
  vi.useFakeTimers({ toFake: ["Date"], now: CREATE_NOW_MS });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("POST /api/creations (real route, no Supabase env)", () => {
  it("works on the in-memory repository and GET lists the creation", async () => {
    const { GET, POST } = await import("./route");
    const res = await POST(makeCreateRequest(makeCreateBody()));
    expect(res.status).toBe(201);
    const { creation } = (await res.json()) as { creation: { id: string; zoneId: number } };
    const list = await GET(new Request(`http://localhost/api/creations?event=loy_krathong&zone=${creation.zoneId}`));
    const body = (await list.json()) as { items: { id: string }[] };
    expect(body.items.map((i) => i.id)).toContain(creation.id);
  });

  it("private-test override: Loy Krathong is accepted outside its date window, other events are rejected, reads keep working", async () => {
    vi.setSystemTime(Date.parse("2026-12-01T12:00:00+07:00"));
    const { GET, POST } = await import("./route");
    const ok = await POST(makeCreateRequest(makeCreateBody()));
    expect(ok.status).toBe(201);
    const { creation } = (await ok.json()) as { creation: { id: string; zoneId: number } };
    const other = await POST(makeCreateRequest(makeCreateBody({ eventId: "christmas" })));
    expect(other.status).toBe(409);
    expect(await other.json()).toEqual({ error: "event_closed" });
    const list = await GET(new Request(`http://localhost/api/creations?event=loy_krathong&zone=${creation.zoneId}`));
    expect(list.status).toBe(200);
    const body = (await list.json()) as { items: { id: string }[] };
    expect(body.items.map((i) => i.id)).toContain(creation.id);
  });

  it("stores a private wish with the ephemeral key and leaks nothing", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeCreateRequest(makeCreateBody({ wishVisibility: "private", wishText: "ความลับ" })));
    expect(res.status).toBe(201);
    const text = await res.text();
    expect((JSON.parse(text) as { creation: { publicWishText: unknown } }).creation.publicWishText).toBeNull();
    for (const name of [...PRIVATE_NAMES, "ephemeral", "ความลับ"]) expect(text).not.toContain(name);
  });

  it("refuses the in-memory backend on a production deployment", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const { POST } = await import("./route");
    const res = await POST(makeCreateRequest(makeCreateBody()));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
  });

  it("exports only GET and POST", async () => {
    expect(Object.keys(await import("./route")).sort()).toEqual(["GET", "POST"]);
  });
});
