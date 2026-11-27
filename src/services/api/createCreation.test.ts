// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CREATE_CREATION_MAX_ATTEMPTS, CREATE_CREATION_REQUEST_MAX_BYTES } from "@/config/creationWrite.config";
import { PRIVATE_WISH_CIPHERTEXT_PATTERN } from "@/config/privateWish.config";
import { RIVER_DRIFT_SPEED_FACTOR, RIVER_MIN_CENTER_SPACING } from "@/config/riverFlow.config";
import { DISPLAY_NAME_MAX_LENGTH, WISH_TEXT_MAX_LENGTH } from "@/config/wish.config";
import { riverSpotDistance, riverSpotOf } from "@/core/world/riverCollision";
import { getLoyKrathongRiverLanes } from "@/core/world/riverLanes";
import type { OwnerTokenHash } from "@/services/auth";
import { checkPublicWish, toModerationBlockedBody } from "@/services/moderation";
import { makeNewCreation } from "./__fixtures__/creations";
import {
  CREATE_NOW_MS,
  OWNER_TOKEN_FIXTURE,
  TEST_KEY_ID,
  barrierOnZoneCounts,
  defaultAppearanceJson,
  makeCreateBody,
  makeCreateRequest,
  makeTestCipher,
  recordingRepository,
  riverCoord,
} from "./__fixtures__/createCreation";
import { isEventActive } from "@/core/events";
import { isServerActiveEvent } from "./activeEvent";
import { getDefaultCreateCreationDeps, handleCreateCreation, type CreateCreationDeps } from "./createCreation";
import { CreationRepositoryError, type CreationRepository } from "./creationRepository";
import { PUBLIC_CREATION_KEYS, type PublicCreation } from "./creationTypes";
import { createInMemoryCreationRepository } from "./inMemoryCreationRepository";
import { decryptPrivateWish, PrivateWishKeyError } from "./privateWishCipher";
import { computeCreationExpiresAt } from "./retention";
import { evaluateWishDraft, moderationReasonsFromServerBody, toWishColumns } from "./wishPayload";

const sha256Hex = (s: string): string => createHash("sha256").update(s).digest("hex");
const PRIVATE_NAMES = [
  "owner_token", "ownerToken", "owner_token_hash", "ownerTokenHash", "private_wish_text", "privateWishText",
  "privateWish", "private_wish_key_id", "report_count", "reportCount", "moderation_status", "moderationStatus",
];
const lanes = getLoyKrathongRiverLanes();
const lane = lanes.get(1)!;

afterEach(() => {
  vi.restoreAllMocks();
});

async function setup(over: Partial<CreateCreationDeps> = {}, startMs = CREATE_NOW_MS) {
  let t = startMs;
  const repo = createInMemoryCreationRepository({ now: () => t });
  const { repo: rec, inserts } = recordingRepository(repo);
  const { cipher, lookup } = await makeTestCipher();
  const getCipher = vi.fn(async () => cipher);
  const deps: CreateCreationDeps = { getRepository: () => rec, getCipher, isProduction: false, now: () => t, ...over };
  const post = (body: unknown, init?: Parameters<typeof makeCreateRequest>[1]) =>
    handleCreateCreation(makeCreateRequest(body, init), deps);
  return { repo, rec, inserts, getCipher, lookup, deps, post, setNow: (ms: number) => { t = ms; }, now: () => t };
}

const created = async (res: Response): Promise<PublicCreation> => ((await res.json()) as { creation: PublicCreation }).creation;
const spotAt = (c: PublicCreation, t: number) =>
  riverSpotOf({ coord: c.coord as never, createdAtMs: Date.parse(c.createdAt) }, lanes, t)!;

describe("AC1: request shape", () => {
  it("creates a public krathong", async () => {
    const { post } = await setup();
    const res = await post(makeCreateBody());
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const c = await created(res);
    expect(Object.keys(c).sort()).toEqual([...PUBLIC_CREATION_KEYS].sort());
    expect(c).toMatchObject({ eventId: "loy_krathong", zoneId: 1, appearance: defaultAppearanceJson() });
    expect(c.createdAt).toBe(new Date(CREATE_NOW_MS).toISOString());
  });

  it("rejects unknown and invalid fields with the field name", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [makeCreateBody({ zoneId: 1 }), "body"],
      [makeCreateBody({ expiresAt: "2099-01-01" }), "body"],
      [makeCreateBody({ createdAt: "2099-01-01" }), "body"],
      [makeCreateBody({ eventId: "nope" }), "eventId"],
      [makeCreateBody({}, ["appearance"]), "appearance"],
      [makeCreateBody({ coord: { x: 1, y: 2, z: 3 } }), "coord"],
      [makeCreateBody({ wishText: 5 }), "wishText"],
      [makeCreateBody({ wishVisibility: "friends" }), "wishVisibility"],
      [makeCreateBody({ ownerToken: "abc" }), "ownerToken"],
    ];
    const { post, inserts } = await setup();
    for (const [body, field] of cases) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_body", field });
    }
    expect(inserts).toHaveLength(0);
  });

  it("rejects a coord off the lane and a bad appearance", async () => {
    const { post, inserts } = await setup();
    expect(await (await post(makeCreateBody({ coord: { ...riverCoord(0.4), laneId: 0 } }))).json()).toEqual({ error: "invalid_body", field: "coord" });
    for (const appearance of [{ ...defaultAppearanceJson(), glow: true }, { ...defaultAppearanceJson(), candleColor: "#000000" }, []]) {
      const res = await post(makeCreateBody({ appearance }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_body", field: "appearance" });
    }
    expect(inserts).toHaveLength(0);
  });

  it("CC1 (MFW-78): stores the chosen design", async () => {
    const { post, inserts } = await setup();
    const res = await post(makeCreateBody({ appearance: { ...defaultAppearanceJson(), design: "lotus_bud_01" } }));
    expect(res.status).toBe(201);
    const text = await res.text();
    const c = (JSON.parse(text) as { creation: PublicCreation }).creation;
    expect(inserts).toHaveLength(1);
    expect((inserts[0]!.appearance as Record<string, unknown>).design).toBe("lotus_bud_01");
    expect((c.appearance as Record<string, unknown>).design).toBe("lotus_bud_01");
    for (const name of ["owner_token", "owner_token_hash", "private_wish_text"]) expect(text).not.toContain(name);
  });

  it("CC2 (MFW-78): rejects an unknown design", async () => {
    const { post, inserts } = await setup();
    const res = await post(makeCreateBody({ appearance: { ...defaultAppearanceJson(), design: "naga_02" } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body", field: "appearance" });
    expect(inserts).toHaveLength(0);
  });

  it("enforces transport rules", async () => {
    const { post } = await setup();
    expect((await post(makeCreateBody(), { contentType: "text/plain" })).status).toBe(415);
    expect((await post(makeCreateBody(), { contentLength: "20000" })).status).toBe(413);
    const pad = makeCreateBody({ wishText: "x".repeat(CREATE_CREATION_REQUEST_MAX_BYTES) });
    expect((await post(pad)).status).toBe(413);
    const bad = await post(null, { rawBody: "{" });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "invalid_body", field: "body" });
  });

  it("applies the wish rules of the WishModal on the server", async () => {
    const { post } = await setup();
    for (const wishText of ["", "   "]) expect((await post(makeCreateBody({ wishText }))).status).toBe(400);
    const tooLong = "ก".repeat(WISH_TEXT_MAX_LENGTH + 1);
    for (const wishVisibility of ["public", "private"]) {
      const res = await post(makeCreateBody({ wishText: tooLong, wishVisibility }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_body", field: "wishText" });
    }
    expect((await post(makeCreateBody({ wishText: "ก".repeat(WISH_TEXT_MAX_LENGTH) }))).status).toBe(201);
    expect((await post(makeCreateBody({ wishText: `  ${"ก".repeat(WISH_TEXT_MAX_LENGTH)}  `, ownerToken: OWNER_TOKEN_FIXTURE }))).status).toBe(201);
    const piiLong = await post(makeCreateBody({ wishText: "โทร 0812345678" + "ก".repeat(WISH_TEXT_MAX_LENGTH) }));
    expect(piiLong.status).toBe(400);
  });

  it("closes the event", async () => {
    const closed = { error: "event_closed" };
    const a = await setup();
    const christmas = await a.post(makeCreateBody({ eventId: "christmas" }));
    expect(christmas.status).toBe(409);
    expect(await christmas.json()).toEqual(closed);
    const expiry = computeCreationExpiresAt("loy_krathong")!.getTime();
    const b = await setup({}, expiry);
    expect((await b.post(makeCreateBody())).status).toBe(409);
    const c = await setup({ getPlacementStrategy: () => null });
    expect((await c.post(makeCreateBody())).status).toBe(409);
    expect(a.inserts.length + b.inserts.length + c.inserts.length).toBe(0);
  });

  it("rejects an event that is not active (date resolver)", async () => {
    const byDate = (id: Parameters<typeof isEventActive>[0], t: number) => isEventActive(id, t, { override: null });
    const inside = await setup({ isEventActive: byDate });
    expect((await inside.post(makeCreateBody())).status).toBe(201);
    const outside = await setup({ isEventActive: byDate }, Date.parse("2026-11-25T12:00:00+07:00"));
    const res = await outside.post(makeCreateBody());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "event_closed" });
    const never = await setup({ isEventActive: () => false });
    expect((await never.post(makeCreateBody())).status).toBe(409);
    expect(outside.inserts.length + never.inserts.length).toBe(0);
  });

  it("default deps use the server resolver", () => {
    expect(getDefaultCreateCreationDeps().isEventActive).toBe(isServerActiveEvent);
  });

  it("does not echo a bad token", async () => {
    const { post } = await setup();
    const res = await post(makeCreateBody({ ownerToken: "not-a-valid-token-value" }));
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: "invalid_body", field: "ownerToken" });
    expect(text).not.toContain("not-a-valid");
  });
});

describe("AC2: owner token", () => {
  it("stores only the SHA-256 hash", async () => {
    const { post, inserts } = await setup();
    const res = await post(makeCreateBody());
    const text = await res.text();
    expect(inserts[0]?.ownerTokenHash).toBe(sha256Hex(OWNER_TOKEN_FIXTURE));
    const captured = JSON.stringify(inserts);
    expect(captured).not.toContain(OWNER_TOKEN_FIXTURE);
    expect(captured).not.toContain("SeCrEt");
    expect(Object.keys(inserts[0] ?? {})).not.toContain("ownerToken");
    expect(text).not.toContain("SeCrEt");
    expect(text).not.toContain(sha256Hex(OWNER_TOKEN_FIXTURE));
  });

  it("never logs", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m));
    const { post, deps } = await setup();
    await post(makeCreateBody());
    await post(makeCreateBody({ zoneId: 1 }));
    await post(makeCreateBody({ wishText: "fuck you" }));
    await handleCreateCreation(makeCreateRequest(makeCreateBody()), { ...deps, getRepository: () => { throw new Error("x"); } });
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe("AC3: wishes", () => {
  it("encrypts a private wish", async () => {
    const { post, inserts, lookup } = await setup();
    const res = await post(makeCreateBody({ wishVisibility: "private", wishText: "  ขอให้สอบติด  " }));
    expect(res.status).toBe(201);
    const text = await res.text();
    const row = inserts[0]!;
    expect(row.publicWishText).toBeNull();
    expect(row.privateWish?.keyId).toBe(TEST_KEY_ID);
    expect(PRIVATE_WISH_CIPHERTEXT_PATTERN.test(row.privateWish!.ciphertext)).toBe(true);
    expect(row.privateWish!.ciphertext).not.toContain("ขอให้สอบติด");
    expect(await decryptPrivateWish(row.privateWish!, sha256Hex(OWNER_TOKEN_FIXTURE) as OwnerTokenHash, lookup)).toBe("ขอให้สอบติด");
    expect((JSON.parse(text) as { creation: PublicCreation }).creation.publicWishText).toBeNull();
    for (const s of ["ขอให้สอบติด", row.privateWish!.ciphertext, TEST_KEY_ID]) expect(text).not.toContain(s);
  });

  it("does not moderate a private wish", async () => {
    const { post } = await setup();
    for (const wishText of ["โทร 0812345678", "fuck you"]) {
      expect((await post(makeCreateBody({ wishVisibility: "private", wishText }))).status).toBe(201);
    }
  });

  it("blocks a public wish with the reasons", async () => {
    const { post, inserts, getCipher } = await setup();
    for (const wishText of ["โทร 0812345678", "somchai@gmail.com", "fuck you"]) {
      const res = await post(makeCreateBody({ wishText }));
      expect(res.status).toBe(422);
      const text = await res.text();
      const body: unknown = JSON.parse(text);
      const guard = checkPublicWish(wishText);
      if (guard.ok) throw new Error("fixture must be blocked");
      expect(body).toEqual(toModerationBlockedBody(guard.reasons));
      expect(moderationReasonsFromServerBody(body)).toEqual(guard.reasons);
      expect(text).not.toContain(wishText);
    }
    expect(inserts).toHaveLength(0);
    expect(getCipher).not.toHaveBeenCalled();
  });

  it("puts the wish in the same column as the client", async () => {
    const { post, inserts, lookup } = await setup();
    for (const visibility of ["public", "private"] as const) {
      const text = "  ขอให้สุขภาพดี  ";
      await post(makeCreateBody({ wishText: text, wishVisibility: visibility }));
      const evaluated = evaluateWishDraft({ text, visibility });
      if (!evaluated.ok) throw new Error("fixture");
      const cols = toWishColumns(evaluated.wish);
      const row = inserts[inserts.length - 1]!;
      expect(row.publicWishText).toBe(cols.publicWishText);
      const plain = row.privateWish ? await decryptPrivateWish(row.privateWish, row.ownerTokenHash, lookup) : null;
      expect(plain).toBe(cols.privateWishPlaintext);
    }
  });

  it("public: no cipher, no private part", async () => {
    const { post, inserts, getCipher } = await setup();
    await post(makeCreateBody({ wishText: "  ขอให้ทุกคนมีความสุข  " }));
    expect(inserts[0]?.privateWish).toBeNull();
    expect(inserts[0]?.publicWishText).toBe("ขอให้ทุกคนมีความสุข");
    expect(getCipher).not.toHaveBeenCalled();
  });

  it("a missing key fails a private wish only", async () => {
    const { post, inserts } = await setup({ getCipher: async () => { throw new PrivateWishKeyError("missing"); } });
    const res = await post(makeCreateBody({ wishVisibility: "private" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
    expect(inserts).toHaveLength(0);
    expect((await post(makeCreateBody())).status).toBe(201);
  });
});

describe("AC4: zone and expiry", () => {
  it("expiresAt is festival end + 30 days", async () => {
    const { post } = await setup();
    const c = await created(await post(makeCreateBody()));
    expect(c.expiresAt).toBe("2026-12-24T17:00:00.000Z");
    expect(c.expiresAt).toBe(computeCreationExpiresAt("loy_krathong")!.toISOString());
  });

  async function seed(repo: CreationRepository, zoneId: number, n: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < n; i += 1) ids.push((await repo.insertCreation(makeNewCreation({ zoneId }))).id);
    return ids;
  }

  it("uses a new zone when zone 1 is full, hidden rows still count, gaps are filled", async () => {
    const a = await setup();
    await seed(a.repo, 1, 80);
    expect((await created(await a.post(makeCreateBody()))).zoneId).toBe(2);
    const b = await setup();
    const ids = await seed(b.repo, 1, 80);
    b.repo.setModeration(ids[0]!, { moderationStatus: "hidden" });
    expect((await created(await b.post(makeCreateBody()))).zoneId).toBe(2);
    const c = await setup();
    await seed(c.repo, 1, 80);
    await seed(c.repo, 3, 1);
    expect((await created(await c.post(makeCreateBody()))).zoneId).toBe(2);
  });
});

describe("AC5: response and backend", () => {
  it("contains no private names or values", async () => {
    const { post, inserts } = await setup();
    const res = await post(makeCreateBody({ wishVisibility: "private" }));
    const text = await res.text();
    const walk = (v: unknown, out: string[]): string[] => {
      if (Array.isArray(v)) v.forEach((x) => walk(x, out));
      else if (typeof v === "object" && v !== null) for (const [k, x] of Object.entries(v)) { out.push(k); walk(x, out); }
      return out;
    };
    const keys = walk(JSON.parse(text), []);
    for (const name of PRIVATE_NAMES) {
      expect(keys).not.toContain(name);
      expect(text).not.toContain(name);
    }
    for (const s of ["SeCrEt", inserts[0]!.ownerTokenHash, inserts[0]!.privateWish!.ciphertext, TEST_KEY_ID]) expect(text).not.toContain(s);
  });

  it("refuses the in-memory backend in production", async () => {
    const { post, inserts, getCipher } = await setup({ isProduction: true });
    const res = await post(makeCreateBody({ wishVisibility: "private" }));
    expect(res.status).toBe(503);
    expect(inserts).toHaveLength(0);
    expect(getCipher).not.toHaveBeenCalled();
    const real = createInMemoryCreationRepository({ now: () => CREATE_NOW_MS });
    const fake: CreationRepository = { ...real, backend: "supabase" };
    const { post: post2 } = await setup({ isProduction: true, getRepository: () => fake });
    expect((await post2(makeCreateBody())).status).toBe(201);
  });

  it("answers 503 without details on backend failures", async () => {
    const { post, repo } = await setup({ getRepository: () => { throw new CreationRepositoryError("backend_misconfigured", "SUPABASE_URL"); } });
    void repo;
    const res = await post(makeCreateBody());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
    const hash = sha256Hex(OWNER_TOKEN_FIXTURE);
    const failing: CreationRepository = { ...createInMemoryCreationRepository(), insertCreationGuarded: () => Promise.reject(new Error("boom " + hash)) };
    const { post: post2 } = await setup({ getRepository: () => failing });
    const res2 = await post2(makeCreateBody());
    expect(res2.status).toBe(503);
    const text = await res2.text();
    expect(JSON.parse(text)).toEqual({ error: "unavailable" });
    expect(text).not.toContain(hash);
  });
});

describe("AC6: no overlap", () => {
  it("moves the krathong off an occupied spot", async () => {
    const { post, setNow } = await setup();
    const first = await created(await post(makeCreateBody({ coord: riverCoord(0.4) })));
    const t = CREATE_NOW_MS + 10_000;
    setNow(t);
    const second = await created(await post(makeCreateBody({ coord: riverCoord(0.48) })));
    expect(second.coord).not.toMatchObject({ spawnProgress: 0.48, lateralOffset: 0 });
    expect(riverSpotDistance(spotAt(first, t), spotAt(second, t), lane)).toBeGreaterThanOrEqual(RIVER_MIN_CENTER_SPACING);
    expect(second.zoneId).toBe(1);
  });

  it("forces the drift speed", async () => {
    const { post } = await setup();
    const c = await created(await post(makeCreateBody({ coord: { ...riverCoord(0.4), speedFactor: 0.02 } })));
    expect(c.coord).toMatchObject({ speedFactor: RIVER_DRIFT_SPEED_FACTOR });
  });

  it("two racing releases end up apart", async () => {
    const { repo, inserts, deps } = await setup();
    const { repo: rec, inserts: ins } = recordingRepository(barrierOnZoneCounts(repo, 2));
    void inserts;
    const racing: CreateCreationDeps = { ...deps, getRepository: () => rec };
    const [a, b] = await Promise.all([
      handleCreateCreation(makeCreateRequest(makeCreateBody()), racing),
      handleCreateCreation(makeCreateRequest(makeCreateBody()), racing),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    const [ca, cb] = [await created(a), await created(b)];
    expect(ca.id).not.toBe(cb.id);
    expect([ca.zoneId, cb.zoneId]).toEqual([1, 1]);
    expect(riverSpotDistance(spotAt(ca, CREATE_NOW_MS), spotAt(cb, CREATE_NOW_MS), lane)).toBeGreaterThanOrEqual(RIVER_MIN_CENTER_SPACING);
    expect(ins).toHaveLength(3);
  });

  it("gives up after the maximum attempts", async () => {
    const insertCreationGuarded = vi.fn(async () => ({ status: "zone_changed" as const }));
    const real = createInMemoryCreationRepository({ now: () => CREATE_NOW_MS });
    const stub: CreationRepository = { ...real, insertCreationGuarded };
    const { post } = await setup({ getRepository: () => stub });
    expect((await post(makeCreateBody())).status).toBe(503);
    expect(insertCreationGuarded).toHaveBeenCalledTimes(CREATE_CREATION_MAX_ATTEMPTS);
  });

  it("reads server time on every attempt", async () => {
    let calls = 0;
    const base = CREATE_NOW_MS;
    const { post, inserts } = await setup({ now: () => base + 5 * calls++ });
    const res = await post(makeCreateBody());
    expect(res.status).toBe(201);
    const c = await created(res);
    expect(Date.parse(c.createdAt)).toBe(inserts[0]!.createdAt.getTime());
  });
});

describe("display name (MFW-62)", () => {
  const HASH = sha256Hex(OWNER_TOKEN_FIXTURE) as OwnerTokenHash;

  it("C1 a public wish shows the trimmed name", async () => {
    const { post, inserts } = await setup();
    const res = await post(makeCreateBody({ displayName: "  สมชาย  " }));
    expect(res.status).toBe(201);
    const c = await created(res);
    expect(c.displayName).toBe("สมชาย");
    expect(Object.keys(c)).toEqual([...PUBLIC_CREATION_KEYS]);
    expect(inserts[0]).toMatchObject({ displayName: "สมชาย", privateDisplayName: null });
  });

  it("C2 a private wish encrypts the name with the wish key and never returns it", async () => {
    const { post, inserts, lookup } = await setup();
    const res = await post(makeCreateBody({ wishVisibility: "private", displayName: "สมชาย" }));
    expect(res.status).toBe(201);
    const text = await res.text();
    expect((JSON.parse(text) as { creation: PublicCreation }).creation.displayName).toBeNull();
    expect(text).not.toContain("สมชาย");
    const row = inserts[0]!;
    expect(row.displayName).toBeNull();
    expect(row.privateDisplayName?.keyId).toBe(row.privateWish?.keyId);
    expect(row.privateDisplayName!.ciphertext).not.toContain("สมชาย");
    expect(await decryptPrivateWish(row.privateDisplayName!, HASH, lookup, "displayName")).toBe("สมชาย");
    expect(await decryptPrivateWish(row.privateDisplayName!, HASH, lookup)).toBeNull(); // not a wish ciphertext
    expect(text).not.toContain(row.privateDisplayName!.ciphertext);
  });

  it("C3 no name, null, empty or blank → null in the response and the insert", async () => {
    const { post, inserts } = await setup();
    const bodies = [makeCreateBody(), makeCreateBody({ displayName: null }), makeCreateBody({ displayName: "" }), makeCreateBody({ displayName: "   " })];
    for (const body of [...bodies, ...bodies.map((b) => ({ ...b, wishVisibility: "private" }))]) {
      const res = await post(body);
      expect(res.status).toBe(201);
      expect((await created(res)).displayName).toBeNull();
      const row = inserts[inserts.length - 1]!;
      expect(row.displayName ?? null).toBeNull();
      expect(row.privateDisplayName ?? null).toBeNull();
    }
  });

  it("C4 length limit from config and input hygiene → 400 displayName", async () => {
    const { post, inserts } = await setup();
    expect((await post(makeCreateBody({ displayName: "ก".repeat(DISPLAY_NAME_MAX_LENGTH) }))).status).toBe(201);
    const before = inserts.length;
    for (const displayName of ["ก".repeat(DISPLAY_NAME_MAX_LENGTH + 1), "a\nb", 123]) {
      const res = await post(makeCreateBody({ displayName }));
      expect(res.status).toBe(400);
      expect(res.headers.get("cache-control")).toContain("no-store");
      expect(await res.json()).toEqual({ error: "invalid_body", field: "displayName" });
    }
    expect(inserts).toHaveLength(before);
  });

  it("C5 the name passes the public moderation guard (Thai and English), whatever the visibility", async () => {
    const { post, inserts } = await setup();
    const cases: [Record<string, unknown>, string[], string][] = [
      [{ displayName: "0812345678" }, ["phone"], "0812345678"],
      [{ displayName: "me@example.com" }, ["email"], "me@example.com"],
      [{ displayName: "เหี้ย" }, ["profanity"], "เหี้ย"],
      [{ displayName: "fuck" }, ["profanity"], "fuck"],
      [{ wishVisibility: "private", displayName: "@somchai_j" }, ["social_handle"], "@somchai_j"],
      [{ wishText: "โทร 0812345678", displayName: "me@example.com" }, ["phone", "email"], "me@example.com"],
    ];
    for (const [over, reasons, name] of cases) {
      const res = await post(makeCreateBody(over));
      expect(res.status).toBe(422);
      expect(res.headers.get("cache-control")).toContain("no-store");
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ error: "moderation_blocked", reasons });
      expect(text).not.toContain(name);
    }
    expect(inserts).toHaveLength(0);
  });

  it("C6 without a name the response still has exactly the public keys", async () => {
    const { post } = await setup();
    const c = await created(await post(makeCreateBody()));
    expect(Object.keys(c)).toEqual([...PUBLIC_CREATION_KEYS]);
    expect(c.displayName).toBeNull();
  });
});
