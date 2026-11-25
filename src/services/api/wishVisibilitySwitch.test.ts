// @vitest-environment node
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { AUTO_HIDE_REPORT_THRESHOLD } from "@/config/moderation.config";
import { WISH_VISIBILITY_REQUEST_MAX_BYTES } from "@/config/ownerWish.config";
import type { OwnerTokenHash } from "@/services/auth";
import { makeNewCreation } from "./__fixtures__/creations";
import {
  DAY_MS,
  NAME_FIXTURE,
  OTHER_OWNER_TOKEN_FIXTURE,
  OWNER_TOKEN_FIXTURE,
  PUBLIC_WISH_FIXTURE,
  SECRET_WISH_FIXTURE,
  makeWishVisibilityRequest,
  seedWishSwitchRepository,
} from "./__fixtures__/wishVisibility";
import { CREATE_NOW_MS } from "./__fixtures__/createCreation";
import type { CreationRepository } from "./creationRepository";
import type { EncryptedPrivateWish } from "./creationTypes";
import type { PrivateWishCipher } from "./privateWishCipher";
import {
  handleWishVisibilitySwitch,
  parseWishVisibilityRequest,
  type WishVisibilitySwitchDeps,
} from "./wishVisibilitySwitch";

const NOT_FOUND = '{"error":"not_found"}';
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

const consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
  vi.spyOn(console, m).mockImplementation(() => undefined),
);
afterEach(() => {
  vi.clearAllMocks();
});

/** Every response text of this file and every secret seen, for the L1 no-leak check at the end. */
const responseTexts: string[] = [];
const secrets = new Set<string>([OWNER_TOKEN_FIXTURE, OTHER_OWNER_TOKEN_FIXTURE]);

function recordingCipher(inner: PrivateWishCipher): PrivateWishCipher {
  return {
    keyId: inner.keyId,
    encrypt: async (plaintext, hash, field) => {
      const out = await inner.encrypt(plaintext, hash, field);
      secrets.add(out.ciphertext);
      return out;
    },
    decrypt: (wish, hash, field) => inner.decrypt(wish, hash, field),
  };
}

async function setup() {
  const seed = await seedWishSwitchRepository();
  const cipher = recordingCipher(seed.cipher);
  secrets.add(seed.ownerHash);
  for (const id of [seed.privateNamedId, seed.privateUnnamedId, seed.publicNamedId]) {
    const st = await seed.repo.readWishSwitchState(id);
    if (st?.privateWish) secrets.add(st.privateWish.ciphertext);
    if (st?.privateDisplayName) secrets.add(st.privateDisplayName.ciphertext);
  }
  const deps: WishVisibilitySwitchDeps = { ...seed.deps, getCipher: async () => cipher };
  const send = async (body: unknown, init?: Parameters<typeof makeWishVisibilityRequest>[1], d: WishVisibilitySwitchDeps = deps) => {
    const res = await handleWishVisibilitySwitch(makeWishVisibilityRequest(body, init), d);
    const text = await res.text();
    responseTexts.push(text);
    expect(res.headers.get("cache-control")).toContain("no-store");
    return { status: res.status, text, json: JSON.parse(text) as unknown };
  };
  const switchTo = (creationId: string, open: boolean, ownerToken: string = OWNER_TOKEN_FIXTURE, d?: WishVisibilitySwitchDeps) =>
    send({ creationId, ownerToken, open }, undefined, d);
  const listed = async (id: string) => {
    const items = await seed.repo.listPublicZone({ eventId: "loy_krathong", zoneId: 1 });
    const item = items.find((i) => i.id === id);
    return item === undefined ? undefined : [item.publicWishText, item.displayName];
  };
  /** Seeds one more private creation of the owner, with a wish and an optional name. */
  const seedPrivate = async (wish: string, name: string | null) => {
    const privateWish = await seed.cipher.encrypt(wish, seed.ownerHash);
    const privateDisplayName = name === null ? null : await seed.cipher.encrypt(name, seed.ownerHash, "displayName");
    secrets.add(privateWish.ciphertext);
    if (privateDisplayName) secrets.add(privateDisplayName.ciphertext);
    const c = await seed.repo.insertCreation(
      makeNewCreation({
        publicWishText: null,
        ownerTokenHash: seed.ownerHash,
        privateWish,
        privateDisplayName,
        expiresAt: new Date(CREATE_NOW_MS + DAY_MS),
      }),
    );
    return c.id;
  };
  return { ...seed, deps, send, switchTo, listed, seedPrivate };
}

const decryptBoth = async (
  s: Awaited<ReturnType<typeof setup>>,
  wish: EncryptedPrivateWish | null,
  name: EncryptedPrivateWish | null,
) => [
  wish === null ? null : await s.reader.decrypt(wish, s.ownerHash as OwnerTokenHash, "wish"),
  name === null ? null : await s.reader.decrypt(name, s.ownerHash as OwnerTokenHash, "displayName"),
];

describe("switch on and off (AC3, AC6)", () => {
  it("S1 open → close → open moves wish and name between the stores", async () => {
    const s = await setup();
    const seeded = await s.repo.readWishSwitchState(s.privateNamedId);
    expect(await s.listed(s.privateNamedId)).toEqual([null, null]);

    const opened = await s.switchTo(s.privateNamedId, true);
    expect([opened.status, opened.json]).toEqual([200, { open: true }]);
    expect(await s.listed(s.privateNamedId)).toEqual([SECRET_WISH_FIXTURE, NAME_FIXTURE]);
    expect(await s.repo.readWishSwitchState(s.privateNamedId)).toMatchObject({ privateWish: null, privateDisplayName: null });

    const closed = await s.switchTo(s.privateNamedId, false);
    expect([closed.status, closed.json]).toEqual([200, { open: false }]);
    expect(await s.listed(s.privateNamedId)).toEqual([null, null]);
    const after = await s.repo.readWishSwitchState(s.privateNamedId);
    expect(after).toMatchObject({ publicWishText: null, displayName: null });
    expect(await decryptBoth(s, after!.privateWish, after!.privateDisplayName)).toEqual([SECRET_WISH_FIXTURE, NAME_FIXTURE]);
    expect(after!.privateWish!.ciphertext).not.toBe(seeded!.privateWish!.ciphertext); // fresh IV
    expect(after!.privateDisplayName!.ciphertext).not.toBe(seeded!.privateDisplayName!.ciphertext);

    const reopened = await s.switchTo(s.privateNamedId, true);
    expect([reopened.status, reopened.json]).toEqual([200, { open: true }]);
    expect(await s.listed(s.privateNamedId)).toEqual([SECRET_WISH_FIXTURE, NAME_FIXTURE]);
  });

  it("S2 an unnamed wish opens and closes without a name", async () => {
    const s = await setup();
    const open = vi.spyOn(s.repo, "openWish");
    const close = vi.spyOn(s.repo, "closeWish");
    expect((await s.switchTo(s.privateUnnamedId, true)).json).toEqual({ open: true });
    expect(open.mock.calls[0]?.[0]).toMatchObject({ displayName: null, publicWishText: SECRET_WISH_FIXTURE });
    expect(await s.listed(s.privateUnnamedId)).toEqual([SECRET_WISH_FIXTURE, null]);
    expect((await s.switchTo(s.privateUnnamedId, false)).json).toEqual({ open: false });
    expect(close.mock.calls[0]?.[0]).toMatchObject({ expectedDisplayName: null, privateDisplayName: null });
    expect(await s.repo.readWishSwitchState(s.privateUnnamedId)).toMatchObject({ privateDisplayName: null, displayName: null });
  });

  it("S3 asking for the current state is idempotent and writes nothing", async () => {
    const s = await setup();
    const open = vi.spyOn(s.repo, "openWish");
    const close = vi.spyOn(s.repo, "closeWish");
    const a = await s.switchTo(s.publicNamedId, true);
    expect([a.status, a.json]).toEqual([200, { open: true }]);
    const b = await s.switchTo(s.privateNamedId, false);
    expect([b.status, b.json]).toEqual([200, { open: false }]);
    expect(open).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it("S4 a public named wish closes into ciphertext and reopens with its name", async () => {
    const s = await setup();
    expect(await s.listed(s.publicNamedId)).toEqual([PUBLIC_WISH_FIXTURE, NAME_FIXTURE]);
    expect((await s.switchTo(s.publicNamedId, false)).status).toBe(200);
    const st = await s.repo.readWishSwitchState(s.publicNamedId);
    expect(await decryptBoth(s, st!.privateWish, st!.privateDisplayName)).toEqual([PUBLIC_WISH_FIXTURE, NAME_FIXTURE]);
    expect(await s.listed(s.publicNamedId)).toEqual([null, null]);
    expect((await s.switchTo(s.publicNamedId, true)).status).toBe(200);
    expect(await s.listed(s.publicNamedId)).toEqual([PUBLIC_WISH_FIXTURE, NAME_FIXTURE]);
  });
});

describe("moderation on open (AC3, AC6, invariant G)", () => {
  const cases: [string, string, string | null, string[]][] = [
    ["M1 a wish with a phone number", "โทร 0812345678", null, ["phone"]],
    ["M2 a name with an email", "ขอให้สอบติด", "me@example.com", ["email"]],
    ["M3 a Thai profanity name", "ขอให้สอบติด", "เหี้ย", ["profanity"]],
    ["M4 a phone wish and an email name", "โทร 0812345678", "me@example.com", ["phone", "email"]],
  ];
  it.each(cases)("%s → 422 with the reasons, nothing written", async (_label, wish, name, reasons) => {
    const s = await setup();
    const id = await s.seedPrivate(wish, name);
    const before = await s.repo.readWishSwitchState(id);
    const open = vi.spyOn(s.repo, "openWish");
    const res = await s.switchTo(id, true);
    expect(res.status).toBe(422);
    expect(res.json).toEqual({ error: "moderation_blocked", reasons });
    expect(res.text).not.toContain(wish);
    if (name !== null) expect(res.text).not.toContain(name);
    expect(open).not.toHaveBeenCalled();
    expect(await s.repo.readWishSwitchState(id)).toEqual(before);
    expect(await s.listed(id)).toEqual([null, null]);
  });
});

describe("ownership (AC3, AC6)", () => {
  it("N1 a wrong token gets the uniform 404 on open and close, nothing changes", async () => {
    const s = await setup();
    const before = await s.repo.readWishSwitchState(s.privateNamedId);
    const beforePublic = await s.repo.readWishSwitchState(s.publicNamedId);
    for (const [id, open] of [
      [s.privateNamedId, true],
      [s.publicNamedId, false],
    ] as const) {
      const res = await s.switchTo(id, open, OTHER_OWNER_TOKEN_FIXTURE);
      expect(res.status).toBe(404);
      expect(res.text).toBe(NOT_FOUND);
    }
    expect(await s.repo.readWishSwitchState(s.privateNamedId)).toEqual(before);
    expect(await s.repo.readWishSwitchState(s.publicNamedId)).toEqual(beforePublic);
  });

  it("N2 unknown, expired and not-yours are byte-identical", async () => {
    const s = await setup();
    const answers = [
      await s.switchTo(UNKNOWN_ID, true),
      await s.switchTo(s.privateNamedId, true, OTHER_OWNER_TOKEN_FIXTURE),
      await s.switchTo(UNKNOWN_ID, false),
    ];
    s.setNow(CREATE_NOW_MS + DAY_MS);
    answers.push(await s.switchTo(s.privateNamedId, true), await s.switchTo(s.publicNamedId, false));
    for (const a of answers) expect([a.status, a.text]).toEqual([404, NOT_FOUND]);
  });

  it("the repository sees only the creation id, never the token or the hash", async () => {
    const s = await setup();
    const read = vi.spyOn(s.repo, "readWishSwitchState");
    await s.switchTo(s.privateNamedId, true);
    expect(read.mock.calls).toEqual([[s.privateNamedId]]);
  });
});

describe("hidden wishes (AC4)", () => {
  it("H1 a flagged wish cannot be opened", async () => {
    const s = await setup();
    s.repo.setModeration(s.privateNamedId, { moderationStatus: "flagged" });
    const before = await s.repo.readWishSwitchState(s.privateNamedId);
    const res = await s.switchTo(s.privateNamedId, true);
    expect([res.status, res.json]).toEqual([409, { error: "hidden" }]);
    expect(await s.repo.readWishSwitchState(s.privateNamedId)).toEqual(before);
  });

  it("H2 a wish at the report threshold cannot be opened", async () => {
    const s = await setup();
    s.repo.setModeration(s.privateNamedId, { reportCount: AUTO_HIDE_REPORT_THRESHOLD });
    const res = await s.switchTo(s.privateNamedId, true);
    expect([res.status, res.json]).toEqual([409, { error: "hidden" }]);
  });

  it("H3 open → hidden → close works, then it never opens again", async () => {
    const s = await setup();
    expect((await s.switchTo(s.privateNamedId, true)).status).toBe(200);
    s.repo.setModeration(s.privateNamedId, { moderationStatus: "flagged" });
    const closed = await s.switchTo(s.privateNamedId, false);
    expect([closed.status, closed.json]).toEqual([200, { open: false }]);
    const again = await s.switchTo(s.privateNamedId, true);
    expect([again.status, again.json]).toEqual([409, { error: "hidden" }]);
    expect(s.repo.getModerationState(s.privateNamedId)).toEqual({ reportCount: 0, moderationStatus: "flagged" });
    const st = await s.repo.readWishSwitchState(s.publicNamedId);
    s.repo.setModeration(s.publicNamedId, { moderationStatus: "hidden" });
    const openHidden = await s.switchTo(s.publicNamedId, true); // hidden is checked before "already open"
    expect([openHidden.status, openHidden.json]).toEqual([409, { error: "hidden" }]);
    expect(await s.repo.readWishSwitchState(s.publicNamedId)).toMatchObject({ publicWishText: st!.publicWishText });
  });

  it("H4 a wrong token on a hidden wish gets 404, not 409", async () => {
    const s = await setup();
    s.repo.setModeration(s.privateNamedId, { moderationStatus: "flagged" });
    const res = await s.switchTo(s.privateNamedId, true, OTHER_OWNER_TOKEN_FIXTURE);
    expect([res.status, res.text]).toEqual([404, NOT_FOUND]);
  });
});

describe("conflicts and failures", () => {
  const withRepo = (s: Awaited<ReturnType<typeof setup>>, patch: Partial<CreationRepository>): WishVisibilitySwitchDeps => ({
    ...s.deps,
    getRepository: () => ({ ...s.repo, ...patch }),
  });

  it("K1 a concurrent change answers 409 conflict", async () => {
    const s = await setup();
    const d = withRepo(s, { openWish: async () => "conflict", closeWish: async () => "conflict" });
    const a = await s.switchTo(s.privateNamedId, true, OWNER_TOKEN_FIXTURE, d);
    expect([a.status, a.json]).toEqual([409, { error: "conflict" }]);
    const b = await s.switchTo(s.publicNamedId, false, OWNER_TOKEN_FIXTURE, d);
    expect([b.status, b.json]).toEqual([409, { error: "conflict" }]);
  });

  it("F1 backend and keyring failures are 503, keyring checked before any row read", async () => {
    const s = await setup();
    const unavailable = [503, { error: "unavailable" }];
    const throwing: WishVisibilitySwitchDeps = {
      ...s.deps,
      getRepository: () => {
        throw new Error("misconfigured");
      },
    };
    const r1 = await s.switchTo(s.privateNamedId, true, OWNER_TOKEN_FIXTURE, throwing);
    expect([r1.status, r1.json]).toEqual(unavailable);
    const r2 = await s.switchTo(s.privateNamedId, true, OWNER_TOKEN_FIXTURE, { ...s.deps, isProduction: true });
    expect([r2.status, r2.json]).toEqual(unavailable);
    const read = vi.spyOn(s.repo, "readWishSwitchState");
    const noReader: WishVisibilitySwitchDeps = { ...s.deps, getWishReader: () => Promise.reject(new Error("key")) };
    for (const id of [s.privateNamedId, UNKNOWN_ID]) {
      const r = await s.switchTo(id, true, OWNER_TOKEN_FIXTURE, noReader);
      expect([r.status, r.json]).toEqual(unavailable);
    }
    const noCipher: WishVisibilitySwitchDeps = { ...s.deps, getCipher: () => Promise.reject(new Error("key")) };
    for (const id of [s.publicNamedId, UNKNOWN_ID]) {
      const r = await s.switchTo(id, false, OWNER_TOKEN_FIXTURE, noCipher);
      expect([r.status, r.json]).toEqual(unavailable);
    }
    expect(read).not.toHaveBeenCalled();
  });

  it("F2 an undecryptable wish or a failing read is 503 and writes nothing", async () => {
    const s = await setup();
    const open = vi.spyOn(s.repo, "openWish");
    const wrongKey: WishVisibilitySwitchDeps = { ...s.deps, getWishReader: async () => ({ decrypt: async () => null }) };
    const r1 = await s.switchTo(s.privateNamedId, true, OWNER_TOKEN_FIXTURE, wrongKey);
    expect([r1.status, r1.json]).toEqual([503, { error: "unavailable" }]);
    expect(open).not.toHaveBeenCalled();
    expect(await s.listed(s.privateNamedId)).toEqual([null, null]);
    const leaky = withRepo(s, { readWishSwitchState: () => Promise.reject(new Error(`boom ${s.ownerHash}`)) });
    const r2 = await s.switchTo(s.privateNamedId, true, OWNER_TOKEN_FIXTURE, leaky);
    expect(r2.status).toBe(503);
    expect(r2.text).toBe('{"error":"unavailable"}');
    expect(r2.text).not.toContain(s.ownerHash);
  });

  it("F3 a stored name the current rules no longer accept fails closed", async () => {
    const s = await setup();
    const id = await s.seedPrivate("ขอให้สอบติด", "ก".repeat(200)); // e.g. the limit was lowered after it was stored
    const open = vi.spyOn(s.repo, "openWish");
    const r = await s.switchTo(id, true);
    expect([r.status, r.json]).toEqual([503, { error: "unavailable" }]);
    expect(open).not.toHaveBeenCalled();
  });
});

describe("request hygiene", () => {
  it("Q1 rejects bad transport and bodies without echoing", async () => {
    const s = await setup();
    const valid = { creationId: s.privateNamedId, ownerToken: OWNER_TOKEN_FIXTURE, open: true };
    const cases: [Parameters<typeof s.send>, number, unknown][] = [
      [[valid, { contentType: "text/plain" }], 415, { error: "unsupported_media_type" }],
      [[valid, { query: `?ownerToken=${OWNER_TOKEN_FIXTURE}` }], 400, { error: "unexpected_query" }],
      [[valid, { contentLength: "9999" }], 413, { error: "payload_too_large" }],
      [[null, { rawBody: JSON.stringify({ ...valid, pad: "x".repeat(600) }) }], 413, { error: "payload_too_large" }],
      [[null, { rawBody: "{not json" }], 400, { error: "invalid_body" }],
      [[{ ...valid, extra: 1 }], 400, { error: "invalid_body" }],
      [[{ creationId: valid.creationId, ownerToken: valid.ownerToken }], 400, { error: "invalid_body" }],
      [[{ ...valid, open: "true" }], 400, { error: "invalid_body" }],
      [[{ ...valid, creationId: valid.creationId.toUpperCase() }], 400, { error: "invalid_body" }],
      [[{ ...valid, ownerToken: "short" }], 400, { error: "invalid_body" }],
    ];
    expect(600).toBeGreaterThan(WISH_VISIBILITY_REQUEST_MAX_BYTES);
    for (const [args, status, body] of cases) {
      const r = await s.send(...args);
      expect([r.status, r.json]).toEqual([status, body]);
      expect(r.text).not.toContain(OWNER_TOKEN_FIXTURE);
    }
    expect(await s.listed(s.privateNamedId)).toEqual([null, null]);
  });

  it("parseWishVisibilityRequest", () => {
    const id = "950118ce-7d93-4cb6-bd84-44d91c5de9e3";
    expect(parseWishVisibilityRequest({ creationId: id, ownerToken: OWNER_TOKEN_FIXTURE, open: false })).toEqual({
      creationId: id,
      ownerToken: OWNER_TOKEN_FIXTURE,
      open: false,
    });
    expect(parseWishVisibilityRequest({ open: true, ownerToken: OWNER_TOKEN_FIXTURE, creationId: id })).toEqual({
      creationId: id,
      ownerToken: OWNER_TOKEN_FIXTURE,
      open: true,
    });
    for (const bad of [
      null,
      [],
      "x",
      {},
      { creationId: id, ownerToken: OWNER_TOKEN_FIXTURE },
      { creationId: id, ownerToken: OWNER_TOKEN_FIXTURE, open: 1 },
      { creationId: id, ownerToken: OWNER_TOKEN_FIXTURE, open: true, extra: null },
      { creationId: "nope", ownerToken: OWNER_TOKEN_FIXTURE, open: true },
      { creationId: id, ownerToken: 5, open: true },
    ]) {
      expect(parseWishVisibilityRequest(bad)).toBeNull();
    }
  });
});

describe("no leak (AC5, invariant C)", () => {
  afterAll(() => {
    for (const spy of consoleSpies) spy.mockRestore();
  });

  it("L1 no response of this file carries a private name, token, hash or ciphertext; nothing is logged", async () => {
    // Exercise one more full cycle so this case stands alone too.
    const s = await setup();
    await s.switchTo(s.privateNamedId, true);
    await s.switchTo(s.privateNamedId, false);
    expect(responseTexts.length).toBeGreaterThan(40);
    const forbidden = [
      "owner_token",
      "owner_token_hash",
      "private_wish_text",
      "private_display_name",
      "ownerToken",
      "privateWish",
      ...secrets,
    ];
    for (const text of responseTexts) {
      for (const f of forbidden) expect(text).not.toContain(f);
    }
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });
});
