// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { CREATE_NOW_MS, OWNER_TOKEN_FIXTURE, makeTestCipher } from "./__fixtures__/createCreation";
import { makeNewCreation } from "./__fixtures__/creations";
import {
  DAY_MS,
  OTHER_OWNER_TOKEN_FIXTURE,
  SECRET_WISH_FIXTURE,
  makeOwnerWishRequest,
  seedOwnerWishRepository,
} from "./__fixtures__/ownerWish";
import { CreationRepositoryError, type CreationRepository } from "./creationRepository";
import { handleOwnerWishReveal, parseOwnerWishRevealRequest, type OwnerWishRevealDeps } from "./ownerWishReveal";
import { OWNER_WISH_REVEAL_REQUEST_MAX_BYTES } from "@/config/ownerWish.config";
import {
  PrivateWishKeyError,
  createPrivateWishCipher,
  createPrivateWishReaderFromEnv,
  importPrivateWishKey,
} from "./privateWishCipher";
import { isDeviceOwnerToken } from "@/services/auth";

const NOT_REVEALED = '{"wishText":null}';
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

const consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
afterEach(() => {
  vi.clearAllMocks();
});

async function setup() {
  const seed = await seedOwnerWishRepository();
  const readOwnership = vi.spyOn(seed.repo, "readOwnership");
  const decrypt = vi.spyOn(seed.reader, "decrypt");
  const getWishReader = vi.fn(async () => seed.reader);
  const deps: OwnerWishRevealDeps = { getRepository: () => seed.repo, getWishReader, isProduction: false };
  const post = (body: unknown, init?: Parameters<typeof makeOwnerWishRequest>[1]) =>
    handleOwnerWishReveal(makeOwnerWishRequest(body, init), deps);
  return { ...seed, readOwnership, decrypt, getWishReader, deps, post };
}

describe("AC2: owner reads the private wish", () => {
  it("returns exactly { wishText } with no-store", async () => {
    const s = await setup();
    const res = await s.post({ creationId: s.privateId, ownerToken: OWNER_TOKEN_FIXTURE });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toEqual({ wishText: SECRET_WISH_FIXTURE });
    expect(Object.keys(json)).toEqual(["wishText"]);
    const reversed = await s.post(null, { rawBody: JSON.stringify({ ownerToken: OWNER_TOKEN_FIXTURE, creationId: s.privateId }) });
    expect(await reversed.json()).toEqual({ wishText: SECRET_WISH_FIXTURE });
  });

  it("compares hashes server-side: the repository sees only the id", async () => {
    const s = await setup();
    await s.post({ creationId: s.privateId, ownerToken: OWNER_TOKEN_FIXTURE });
    expect(s.readOwnership.mock.calls).toEqual([[s.privateId]]);
    const dump = JSON.stringify(s.readOwnership.mock.calls);
    expect(dump).not.toContain(OWNER_TOKEN_FIXTURE);
    expect(dump).not.toContain(s.ownerHash);
  });
});

describe("AC3: private text is never returned without a matching owner token", () => {
  async function expectUniform(res: Response, extra: string[] = []) {
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe(NOT_REVEALED);
    for (const secret of [SECRET_WISH_FIXTURE, OWNER_TOKEN_FIXTURE, ...extra]) expect(text).not.toContain(secret);
  }

  it("another token, unknown id: uniform and never decrypted", async () => {
    const s = await setup();
    await expectUniform(await s.post({ creationId: s.privateId, ownerToken: OTHER_OWNER_TOKEN_FIXTURE }), [s.ownerHash]);
    await expectUniform(await s.post({ creationId: UNKNOWN_ID, ownerToken: OWNER_TOKEN_FIXTURE }));
    expect(s.decrypt).not.toHaveBeenCalled();
  });

  it("public-wish creation and expired creation", async () => {
    const s = await setup();
    await expectUniform(await s.post({ creationId: s.publicId, ownerToken: OWNER_TOKEN_FIXTURE }));
    s.setNow(CREATE_NOW_MS + DAY_MS + 1);
    await expectUniform(await s.post({ creationId: s.privateId, ownerToken: OWNER_TOKEN_FIXTURE }));
  });

  it("unknown key id and tampered ciphertext", async () => {
    const s = await setup();
    const second = createPrivateWishCipher({ keyId: "unknown-key", key: await importPrivateWishKey(new Uint8Array(32).fill(9)) });
    const other = await s.repo.insertCreation(
      makeNewCreation({
        publicWishText: null,
        ownerTokenHash: s.ownerHash,
        privateWish: await second.encrypt(SECRET_WISH_FIXTURE, s.ownerHash),
        expiresAt: new Date(CREATE_NOW_MS + DAY_MS),
      }),
    );
    await expectUniform(await s.post({ creationId: other.id, ownerToken: OWNER_TOKEN_FIXTURE }));

    const real = await s.cipher.encrypt(SECRET_WISH_FIXTURE, s.ownerHash);
    const [v, iv, body] = real.ciphertext.split(".") as [string, string, string];
    const flipped = (body[0] === "A" ? "B" : "A") + body.slice(1);
    const tampered = await s.repo.insertCreation(
      makeNewCreation({
        publicWishText: null,
        ownerTokenHash: s.ownerHash,
        privateWish: { ciphertext: `${v}.${iv}.${flipped}` as typeof real.ciphertext, keyId: real.keyId },
        expiresAt: new Date(CREATE_NOW_MS + DAY_MS),
      }),
    );
    await expectUniform(await s.post({ creationId: tampered.id, ownerToken: OWNER_TOKEN_FIXTURE }));
  });

  it("ephemeral id outside the memory backend", async () => {
    const s = await setup();
    const eph = createPrivateWishCipher({ keyId: "ephemeral", key: await importPrivateWishKey(new Uint8Array(32).fill(7)) });
    const row = await s.repo.insertCreation(
      makeNewCreation({
        publicWishText: null,
        ownerTokenHash: s.ownerHash,
        privateWish: await eph.encrypt(SECRET_WISH_FIXTURE, s.ownerHash),
        expiresAt: new Date(CREATE_NOW_MS + DAY_MS),
      }),
    );
    const reader = await createPrivateWishReaderFromEnv(
      { PRIVATE_WISH_KEY: Buffer.alloc(32, 7).toString("base64"), PRIVATE_WISH_KEY_ID: "k2026b" },
      "supabase",
      async () => (await makeTestCipher()).cipher,
    );
    const repo: CreationRepository = { ...s.repo, backend: "supabase" };
    const res = await handleOwnerWishReveal(makeOwnerWishRequest({ creationId: row.id, ownerToken: OWNER_TOKEN_FIXTURE }), {
      getRepository: () => repo,
      getWishReader: async () => reader,
      isProduction: false,
    });
    await expectUniform(res);
  });

  it("malformed requests never reach the repository", async () => {
    const s = await setup();
    const id = s.privateId;
    const bodies: Array<[unknown, Parameters<typeof makeOwnerWishRequest>[1]?, number?, string?]> = [
      [{ creationId: id }],
      [{ creationId: id, ownerToken: "not-a-valid-token" }],
      [{ creationId: id, ownerToken: s.ownerHash }],
      [{ creationId: id, ownerToken: OWNER_TOKEN_FIXTURE, ownerTokenHash: s.ownerHash }],
      [{ creationId: id, ownerToken: OWNER_TOKEN_FIXTURE, zoneId: 1 }],
      [null, { rawBody: `{"__proto__":{},"creationId":"${id}","ownerToken":"${OWNER_TOKEN_FIXTURE}"}` }],
      [{ creationId: id.toUpperCase(), ownerToken: OWNER_TOKEN_FIXTURE }],
      [{ creationId: 1, ownerToken: OWNER_TOKEN_FIXTURE }],
      [[id, OWNER_TOKEN_FIXTURE]],
      [null, { rawBody: "{not json" }],
    ];
    for (const [body, init] of bodies) {
      const res = await s.post(body, init);
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ error: "invalid_body" });
      expect(text).not.toContain(OWNER_TOKEN_FIXTURE);
      expect(text).not.toContain("not-a-valid");
    }
    for (const query of ["?ownerToken=" + OWNER_TOKEN_FIXTURE, "?x=1"]) {
      const res = await s.post({ creationId: id, ownerToken: OWNER_TOKEN_FIXTURE }, { query });
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ error: "unexpected_query" });
      expect(text).not.toContain(OWNER_TOKEN_FIXTURE);
    }
    expect((await s.post({ creationId: id, ownerToken: OWNER_TOKEN_FIXTURE }, { contentType: "text/plain" })).status).toBe(415);
    const big = OWNER_WISH_REVEAL_REQUEST_MAX_BYTES + 1;
    expect(
      (await s.post({ creationId: id, ownerToken: OWNER_TOKEN_FIXTURE }, { contentLength: String(big) })).status,
    ).toBe(413);
    expect((await s.post(null, { rawBody: " ".repeat(big) })).status).toBe(413);
    expect(s.readOwnership).not.toHaveBeenCalled();
    expect(s.getWishReader).not.toHaveBeenCalled();
  });
});

describe("503 without details", () => {
  it("misconfigured repository, production memory, key error, repository failure", async () => {
    const s = await setup();
    const valid = { creationId: s.privateId, ownerToken: OWNER_TOKEN_FIXTURE };
    const asJson = async (res: Response) => ({ status: res.status, text: await res.text() });

    const misconfigured = await asJson(
      await handleOwnerWishReveal(makeOwnerWishRequest(valid), {
        ...s.deps,
        getRepository: () => {
          throw new CreationRepositoryError("backend_misconfigured", "SUPABASE_URL");
        },
      }),
    );
    expect(misconfigured).toEqual({ status: 503, text: '{"error":"unavailable"}' });

    const prod = await handleOwnerWishReveal(makeOwnerWishRequest(valid), { ...s.deps, isProduction: true });
    expect(prod.status).toBe(503);
    expect(s.readOwnership).not.toHaveBeenCalled();
    expect(s.getWishReader).not.toHaveBeenCalled();

    const keyError = await handleOwnerWishReveal(makeOwnerWishRequest(valid), {
      ...s.deps,
      getWishReader: async () => {
        throw new PrivateWishKeyError("missing");
      },
    });
    expect(keyError.status).toBe(503);
    expect(s.readOwnership).not.toHaveBeenCalled();

    const failing: CreationRepository = {
      ...s.repo,
      readOwnership: () => Promise.reject(new Error(`boom ${s.ownerHash}`)),
    };
    const bodies: string[] = [];
    for (const token of [OWNER_TOKEN_FIXTURE, OTHER_OWNER_TOKEN_FIXTURE]) {
      const res = await handleOwnerWishReveal(makeOwnerWishRequest({ ...valid, ownerToken: token }), { ...s.deps, getRepository: () => failing });
      expect(res.status).toBe(503);
      bodies.push(await res.text());
    }
    expect(bodies[0]).toBe(bodies[1]);
    expect(bodies[0]).not.toContain(s.ownerHash);
  });
});

describe("parseOwnerWishRevealRequest", () => {
  it("accepts the exact shape", () => {
    expect(isDeviceOwnerToken(OTHER_OWNER_TOKEN_FIXTURE)).toBe(true);
    expect(parseOwnerWishRevealRequest({ creationId: UNKNOWN_ID, ownerToken: OWNER_TOKEN_FIXTURE })).toEqual({
      creationId: UNKNOWN_ID,
      ownerToken: OWNER_TOKEN_FIXTURE,
    });
    expect(parseOwnerWishRevealRequest("x")).toBeNull();
  });
});

describe("no logging", () => {
  it("never calls console", () => {
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });
});
