// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CREATE_NOW_MS, OWNER_TOKEN_FIXTURE, makeCreateBody, makeCreateRequest } from "@/services/api/__fixtures__/createCreation";
import { OTHER_OWNER_TOKEN_FIXTURE, SECRET_WISH_FIXTURE, makeOwnerWishRequest } from "@/services/api/__fixtures__/ownerWish";

const ENV_NAMES = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PRIVATE_WISH_KEY",
  "PRIVATE_WISH_KEY_ID",
  "PRIVATE_WISH_RETIRED_KEYS",
  "VERCEL_ENV",
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

async function createPrivate() {
  const creations = await import("@/app/api/creations/route");
  const reveal = await import("./route");
  const res = await creations.POST(makeCreateRequest(makeCreateBody({ wishVisibility: "private", wishText: SECRET_WISH_FIXTURE })));
  expect(res.status).toBe(201);
  const { creation } = (await res.json()) as { creation: { id: string; zoneId: number } };
  return { creations, reveal, creation };
}

describe("POST /api/private-wish (real routes, no env)", () => {
  it("the owner reads back a private wish", async () => {
    const { reveal, creation } = await createPrivate();
    const res = await reveal.POST(makeOwnerWishRequest({ creationId: creation.id, ownerToken: OWNER_TOKEN_FIXTURE }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ wishText: SECRET_WISH_FIXTURE });
  });

  it("another device gets null", async () => {
    const { reveal, creation } = await createPrivate();
    const res = await reveal.POST(makeOwnerWishRequest({ creationId: creation.id, ownerToken: OTHER_OWNER_TOKEN_FIXTURE }));
    expect(await res.text()).toBe('{"wishText":null}');
  });

  it("GET never carries the private wish", async () => {
    const { creations, creation } = await createPrivate();
    const list = await creations.GET(new Request(`http://localhost/api/creations?event=loy_krathong&zone=${creation.zoneId}`));
    expect(await list.text()).not.toContain(SECRET_WISH_FIXTURE);
  });

  it("refuses the in-memory backend in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const reveal = await import("./route");
    const res = await reveal.POST(makeOwnerWishRequest({ creationId: "00000000-0000-4000-8000-000000000000", ownerToken: OWNER_TOKEN_FIXTURE }));
    expect(res.status).toBe(503);
  });

  it("exports only POST", async () => {
    expect(Object.keys(await import("./route"))).toEqual(["POST"]);
  });
});
