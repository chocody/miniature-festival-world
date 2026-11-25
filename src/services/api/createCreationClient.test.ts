import { afterEach, describe, expect, it, vi } from "vitest";
import { CREATE_CREATION_TIMEOUT_MS } from "@/config/ritual.config";
import { DEFAULT_KRATHONG_APPEARANCE, serializeKrathongAppearance } from "@/core/customization/krathongAppearance";
import { buildReleaseCoord } from "@/core/ritual";
import { CREATIONS_API_PATH } from "./apiPaths";
import { OWNER_TOKEN_FIXTURE } from "./__fixtures__/createCreation";
import type { CreateCreationRequestBody } from "./createCreationTypes";
import { submitCreation, toCreatedPublicCreation } from "./createCreationClient";
import { PUBLIC_CREATION_KEYS, type AppearanceJson } from "./creationTypes";

const APPEARANCE = serializeKrathongAppearance(DEFAULT_KRATHONG_APPEARANCE) as unknown as AppearanceJson;
const COORD = buildReleaseCoord({ laneId: 1, progress: 0.4, lateralOffset: 0.1 });
const BODY: CreateCreationRequestBody = {
  eventId: "loy_krathong",
  appearance: APPEARANCE,
  coord: COORD,
  wishText: "ขอให้ทุกคนมีความสุข",
  wishVisibility: "private",
  ownerToken: OWNER_TOKEN_FIXTURE,
};
const creation = (extra: Record<string, unknown> = {}) => ({
  id: "0f8b6c1e-3a2d-4c5b-9e7f-1a2b3c4d5e6f",
  eventId: "loy_krathong",
  zoneId: 1,
  appearance: APPEARANCE,
  coord: COORD,
  publicWishText: null,
  createdAt: "2026-11-24T12:00:00.000Z",
  expiresAt: "2026-12-24T12:00:00.000Z",
  ...extra,
});
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const fake = (res: Response | Error) => vi.fn(async () => { if (res instanceof Error) throw res; return res; });

afterEach(() => vi.useRealTimers());

describe("submitCreation", () => {
  it("posts the JSON body to the bare path", async () => {
    const f = fake(json(201, { creation: creation() }));
    await submitCreation(BODY, { fetch: f as unknown as typeof fetch });
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(CREATIONS_API_PATH);
    expect(url).not.toContain("?");
    expect(url).not.toContain(OWNER_TOKEN_FIXTURE);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(init.cache).toBe("no-store");
    expect(init.credentials).toBe("same-origin");
    expect(JSON.parse(init.body as string)).toEqual(BODY);
  });

  it("returns exactly the public keys and drops extras", async () => {
    const r = await submitCreation(BODY, {
      fetch: fake(json(201, { creation: creation({ ownerToken: "x" }) })) as unknown as typeof fetch,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.creation)).toEqual([...PUBLIC_CREATION_KEYS]);
  });

  it.each([
    ["coord with x", creation({ coord: { ...COORD, x: 1 } })],
    ["private key in appearance", creation({ appearance: { nested: { private_wish_text: "a" } } })],
    ["another event", creation({ eventId: "christmas" })],
  ])("rejects %s", async (_n, c) => {
    const r = await submitCreation(BODY, { fetch: fake(json(201, { creation: c })) as unknown as typeof fetch });
    expect(r).toMatchObject({ ok: false, reason: "invalid_response" });
  });

  it("rejects a non-JSON 201", async () => {
    const r = await submitCreation(BODY, { fetch: fake(new Response("nope", { status: 201 })) as unknown as typeof fetch });
    expect(r).toMatchObject({ ok: false, reason: "invalid_response" });
  });

  it("maps statuses", async () => {
    const run = (res: Response) => submitCreation(BODY, { fetch: fake(res) as unknown as typeof fetch });
    const blocked = { error: "moderation_blocked", reasons: ["phone"] };
    expect(await run(json(422, blocked))).toEqual({ ok: false, reason: "moderation_blocked", moderationBody: blocked });
    expect(await run(json(422, { error: "x" }))).toMatchObject({ reason: "rejected", moderationBody: null });
    expect(await run(json(409, { error: "event_closed" }))).toMatchObject({ reason: "event_closed" });
    expect(await run(json(503, { error: "unavailable" }))).toMatchObject({ reason: "unavailable" });
    expect(await run(json(500, {}))).toMatchObject({ reason: "unavailable" });
    expect(await run(json(400, {}))).toMatchObject({ reason: "rejected" });
  });

  it("maps network, abort and timeout failures; never logs", async () => {
    const spies = (["log", "warn", "error", "info", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    expect(await submitCreation(BODY, { fetch: fake(new TypeError("x")) as unknown as typeof fetch })).toMatchObject({ reason: "network" });
    const ctrl = new AbortController();
    ctrl.abort();
    const abortFetch = vi.fn(async (_u: unknown, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new Error("aborted");
      return json(201, {});
    });
    expect(await submitCreation(BODY, { fetch: abortFetch as unknown as typeof fetch, signal: ctrl.signal })).toMatchObject({ reason: "aborted" });

    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const hang = vi.fn((_u: unknown, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted"))));
    });
    const pending = submitCreation(BODY, { fetch: hang as unknown as typeof fetch });
    await vi.advanceTimersByTimeAsync(CREATE_CREATION_TIMEOUT_MS + 1);
    expect(await pending).toMatchObject({ reason: "timeout" });
    expect(signal?.aborted).toBe(true);
    for (const s of spies) {
      expect(s).not.toHaveBeenCalled();
      s.mockRestore();
    }
  });
});

describe("toCreatedPublicCreation", () => {
  it("returns null for garbage", () => {
    expect(toCreatedPublicCreation(null, "loy_krathong")).toBeNull();
    expect(toCreatedPublicCreation(creation({ zoneId: 0 }), "loy_krathong")).toBeNull();
    expect(toCreatedPublicCreation(creation({ createdAt: "x" }), "loy_krathong")).toBeNull();
  });
});

describe("toCreatedPublicCreation displayName (MFW-62)", () => {
  it("keeps a name with a public wish, defaults it to null, rejects a non-string", async () => {
    expect(toCreatedPublicCreation(creation({ publicWishText: "w", displayName: "สมชาย" }), "loy_krathong")?.displayName).toBe("สมชาย");
    const legacy = toCreatedPublicCreation(creation(), "loy_krathong");
    expect(legacy?.displayName).toBeNull();
    expect(Object.keys(legacy ?? {})).toEqual([...PUBLIC_CREATION_KEYS]);
    expect(toCreatedPublicCreation(creation({ publicWishText: "w", displayName: 5 }), "loy_krathong")).toBeNull();
    expect(toCreatedPublicCreation(creation({ publicWishText: null, displayName: "x" }), "loy_krathong")?.displayName).toBeNull();
    const r = await submitCreation(BODY, {
      fetch: fake(json(201, { creation: creation({ displayName: 5 }) })) as unknown as typeof fetch,
    });
    expect(r).toMatchObject({ ok: false, reason: "invalid_response" });
  });
});
