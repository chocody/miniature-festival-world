// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AUTO_HIDE_REPORT_THRESHOLD } from "@/config/moderation.config";
import { UUID_PATTERN } from "@/config/database.config";
import {
  KEY_ID_FIXTURE,
  OWNER_HASH_FIXTURE,
  PRIVATE_CIPHERTEXT_FIXTURE,
  SPLINE_COORD_FIXTURE,
  makeNewCreation,
  makePrivateWish,
} from "./__fixtures__/creations";
import { CreationRepositoryError } from "./creationRepository";
import { PUBLIC_CREATION_KEYS, type GuardedNewCreation } from "./creationTypes";
import { createInMemoryCreationRepository } from "./inMemoryCreationRepository";

const START = Date.parse("2026-11-24T12:00:00.000Z");
const STEP = 1000;

function setup(newId?: () => string) {
  let t = START;
  const repo = createInMemoryCreationRepository({ now: () => t, newId });
  return {
    repo,
    tick: () => {
      t += STEP;
    },
    now: () => t,
  };
}

const sortedKeys = [...PUBLIC_CREATION_KEYS].sort();
const Z1 = { eventId: "loy_krathong", zoneId: 1 } as const;

describe("in-memory creation repository", () => {
  it("insert returns exactly the public keys", async () => {
    const { repo, now } = setup();
    expect(repo.backend).toBe("memory");
    const c = await repo.insertCreation(makeNewCreation());
    expect(Object.keys(c).sort()).toEqual(sortedKeys);
    expect(c.id).toMatch(UUID_PATTERN);
    expect(c.createdAt).toBe(new Date(now()).toISOString());
  });

  it("a private creation leaks nothing", async () => {
    const { repo } = setup();
    const c = await repo.insertCreation(makeNewCreation({ publicWishText: null, privateWish: makePrivateWish() }));
    const json = JSON.stringify([c, await repo.listPublicZone(Z1)]);
    for (const v of [PRIVATE_CIPHERTEXT_FIXTURE, KEY_ID_FIXTURE, OWNER_HASH_FIXTURE]) expect(json).not.toContain(v);
  });

  it("filters by event and zone", async () => {
    const { repo, tick } = setup();
    const a = await repo.insertCreation(makeNewCreation());
    tick();
    const b = await repo.insertCreation(makeNewCreation({ zoneId: 2 }));
    tick();
    const c = await repo.insertCreation(makeNewCreation({ eventId: "christmas" }));
    expect((await repo.listPublicZone(Z1)).map((x) => x.id)).toEqual([a.id]);
    expect((await repo.listPublicZone({ eventId: "loy_krathong", zoneId: 2 })).map((x) => x.id)).toEqual([b.id]);
    expect((await repo.listPublicZone({ eventId: "christmas", zoneId: 1 })).map((x) => x.id)).toEqual([c.id]);
  });

  it("orders oldest first, id as tie-breaker", async () => {
    const { repo, tick } = setup();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push((await repo.insertCreation(makeNewCreation())).id);
      tick();
    }
    expect((await repo.listPublicZone(Z1)).map((x) => x.id)).toEqual(ids);

    const queue = ["00000000-0000-4000-8000-00000000000b", "00000000-0000-4000-8000-00000000000a"];
    const tie = setup(() => queue.shift() as string);
    await tie.repo.insertCreation(makeNewCreation());
    await tie.repo.insertCreation(makeNewCreation());
    expect((await tie.repo.listPublicZone(Z1)).map((x) => x.id)).toEqual([
      "00000000-0000-4000-8000-00000000000a",
      "00000000-0000-4000-8000-00000000000b",
    ]);
  });

  it("returns the oldest 80 of 85", async () => {
    const { repo, tick } = setup();
    const ids: string[] = [];
    for (let i = 0; i < 85; i++) {
      ids.push((await repo.insertCreation(makeNewCreation())).id);
      tick();
    }
    const list = await repo.listPublicZone(Z1);
    expect(list).toHaveLength(80);
    expect(list.map((x) => x.id)).toEqual(ids.slice(0, 80));
  });

  it("hides flagged, hidden and auto-hidden items", async () => {
    const { repo } = setup();
    const c = await repo.insertCreation(makeNewCreation());
    const visible = async () => (await repo.listPublicZone(Z1)).length;
    expect(repo.setModeration(c.id, { moderationStatus: "flagged" })).toBe(true);
    expect(await visible()).toBe(0);
    repo.setModeration(c.id, { moderationStatus: "hidden" });
    expect(await visible()).toBe(0);
    repo.setModeration(c.id, { moderationStatus: "approved", reportCount: AUTO_HIDE_REPORT_THRESHOLD - 1 });
    expect(await visible()).toBe(1);
    repo.setModeration(c.id, { reportCount: AUTO_HIDE_REPORT_THRESHOLD });
    expect(await visible()).toBe(0);
    expect(repo.setModeration("00000000-0000-4000-8000-000000000000", {})).toBe(false);
    expect(() => repo.setModeration(c.id, { reportCount: -1 })).toThrow(CreationRepositoryError);
    expect(() => repo.setModeration(c.id, { moderationStatus: "bogus" as never })).toThrow(CreationRepositoryError);
  });

  it("expiry is strict", async () => {
    const { repo, now, tick } = setup();
    await repo.insertCreation(makeNewCreation({ expiresAt: new Date(now() + STEP) }));
    expect(await repo.listPublicZone(Z1)).toHaveLength(1);
    tick();
    expect(await repo.listPublicZone(Z1)).toHaveLength(0);
  });

  it("an invalid insert throws and stores nothing", async () => {
    const { repo } = setup();
    await repo.insertCreation(makeNewCreation());
    await expect(
      repo.insertCreation(makeNewCreation({ coord: { ...SPLINE_COORD_FIXTURE, x: 1 } as never })),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(await repo.listPublicZone(Z1)).toHaveLength(1);
  });

  it("rejects an invalid query", async () => {
    const { repo } = setup();
    await expect(repo.listPublicZone({ eventId: "nope" as never, zoneId: 1 })).rejects.toMatchObject({
      code: "invalid_input",
      detail: "eventId",
    });
    await expect(repo.listPublicZone({ eventId: "loy_krathong", zoneId: 0 })).rejects.toMatchObject({
      detail: "zoneId",
    });
  });

  it("returned values are isolated from the store", async () => {
    const { repo } = setup();
    await repo.insertCreation(makeNewCreation());
    const first = await repo.listPublicZone(Z1);
    (first[0]?.appearance as Record<string, unknown>).base = "mutated";
    const second = await repo.listPublicZone(Z1);
    expect(second[0]?.appearance.base).toBe("banana_trunk_01");
  });
});

describe("in-memory creation repository: moderation (MFW-13)", () => {
  it("insert with a PII public wish stores nothing", async () => {
    const { repo } = setup();
    const before = (await repo.listPublicZone(Z1)).length;
    await expect(repo.insertCreation(makeNewCreation({ publicWishText: "0812345678" }))).rejects.toMatchObject({
      code: "invalid_input",
      detail: "publicWishText",
    });
    expect(await repo.listPublicZone(Z1)).toHaveLength(before);
  });

  it("report: counts, flags at 3, then hidden", async () => {
    const { repo } = setup();
    const c = await repo.insertCreation(makeNewCreation());
    expect(await repo.reportCreation(c.id)).toBe("counted");
    expect(repo.getModerationState(c.id)).toEqual({ reportCount: 1, moderationStatus: "approved" });
    expect(await repo.listPublicZone(Z1)).toHaveLength(1);
    expect(await repo.reportCreation(c.id)).toBe("counted");
    expect(repo.getModerationState(c.id)).toEqual({ reportCount: 2, moderationStatus: "approved" });
    expect(await repo.listPublicZone(Z1)).toHaveLength(1);
    expect(await repo.reportCreation(c.id)).toBe("counted");
    expect(repo.getModerationState(c.id)).toEqual({ reportCount: 3, moderationStatus: "flagged" });
    expect(await repo.listPublicZone(Z1)).toHaveLength(0);
    expect(await repo.reportCreation(c.id)).toBe("ignored");
    expect(repo.getModerationState(c.id)?.reportCount).toBe(3);
  });

  it("report ignores private-only creations", async () => {
    const { repo } = setup();
    const c = await repo.insertCreation(makeNewCreation({ publicWishText: null, privateWish: makePrivateWish() }));
    expect(await repo.reportCreation(c.id)).toBe("ignored");
    expect(repo.getModerationState(c.id)?.reportCount).toBe(0);
  });

  it("report ignores unknown, hidden and expired", async () => {
    const { repo, tick, now } = setup();
    expect(await repo.reportCreation("00000000-0000-4000-8000-000000000001")).toBe("ignored");
    const h = await repo.insertCreation(makeNewCreation());
    repo.setModeration(h.id, { moderationStatus: "hidden" });
    expect(await repo.reportCreation(h.id)).toBe("ignored");
    const e = await repo.insertCreation(makeNewCreation({ expiresAt: new Date(now() + STEP) }));
    tick();
    expect(await repo.reportCreation(e.id)).toBe("ignored");
    expect(repo.getModerationState(e.id)?.reportCount).toBe(0);
  });

  it("report rejects a non-uuid", async () => {
    const { repo } = setup();
    const c = await repo.insertCreation(makeNewCreation());
    for (const bad of ["nope", "", c.id.toUpperCase()]) {
      await expect(repo.reportCreation(bad)).rejects.toMatchObject({ code: "invalid_input", detail: "creationId" });
    }
  });

  it("getModerationState: null for unknown, copy for known", async () => {
    const { repo } = setup();
    expect(repo.getModerationState("00000000-0000-4000-8000-000000000000")).toBeNull();
    const c = await repo.insertCreation(makeNewCreation());
    const state = repo.getModerationState(c.id) as { reportCount: number };
    (state as { reportCount: number }).reportCount = 99;
    expect(repo.getModerationState(c.id)?.reportCount).toBe(0);
  });
});

describe("in-memory creation repository: highestVisibleZoneId", () => {
  it("is null when empty", async () => {
    const { repo } = setup();
    expect(await repo.highestVisibleZoneId("loy_krathong")).toBeNull();
  });
  it("returns the highest zone with a visible creation", async () => {
    const { repo } = setup();
    await repo.insertCreation(makeNewCreation({ zoneId: 1 }));
    await repo.insertCreation(makeNewCreation({ zoneId: 3 }));
    expect(await repo.highestVisibleZoneId("loy_krathong")).toBe(3);
  });
  it("ignores other events, hidden, flagged and expired rows", async () => {
    const { repo, tick } = setup();
    await repo.insertCreation(makeNewCreation({ zoneId: 1 }));
    await repo.insertCreation(makeNewCreation({ eventId: "christmas", zoneId: 9 }));
    const hidden = await repo.insertCreation(makeNewCreation({ zoneId: 4 }));
    repo.setModeration(hidden.id, { moderationStatus: "hidden" });
    const flagged = await repo.insertCreation(makeNewCreation({ zoneId: 5 }));
    repo.setModeration(flagged.id, { reportCount: AUTO_HIDE_REPORT_THRESHOLD });
    expect(await repo.highestVisibleZoneId("loy_krathong")).toBe(1);
    await repo.insertCreation(makeNewCreation({ zoneId: 6, expiresAt: new Date(START + STEP) }));
    expect(await repo.highestVisibleZoneId("loy_krathong")).toBe(6);
    tick();
    expect(await repo.highestVisibleZoneId("loy_krathong")).toBe(1);
  });
  it("rejects an unknown event", async () => {
    const { repo } = setup();
    await expect(repo.highestVisibleZoneId("nope" as never)).rejects.toMatchObject({
      code: "invalid_input",
      detail: "eventId",
    });
  });
});

describe("MFW-45 zone occupancy and guarded insert", () => {
  const ID_A = "00000000-0000-4000-8000-00000000000a";
  const guarded = (nowMs: number, ids: readonly string[], over: Partial<GuardedNewCreation> = {}): GuardedNewCreation => ({
    ...makeNewCreation(),
    createdAt: new Date(nowMs),
    expectedOccupantIds: ids,
    ...over,
  });

  it("zone counts include hidden rows and skip expired ones", async () => {
    const { repo, tick, now } = setup();
    const a = await repo.insertCreation(makeNewCreation({ zoneId: 1 }));
    await repo.insertCreation(makeNewCreation({ zoneId: 1 }));
    await repo.insertCreation(makeNewCreation({ zoneId: 3 }));
    await repo.insertCreation(makeNewCreation({ zoneId: 2, expiresAt: new Date(now() + STEP) }));
    repo.setModeration(a.id, { moderationStatus: "hidden" });
    expect(await repo.zoneItemCounts("loy_krathong")).toEqual([
      { zoneId: 1, itemCount: 2 },
      { zoneId: 2, itemCount: 1 },
      { zoneId: 3, itemCount: 1 },
    ]);
    tick();
    expect((await repo.zoneItemCounts("loy_krathong")).map((c) => c.zoneId)).toEqual([1, 3]);
    expect(await repo.zoneItemCounts("christmas")).toEqual([]);
  });

  it("occupants are ordered and include flagged rows", async () => {
    const { repo, tick } = setup();
    const a = await repo.insertCreation(makeNewCreation());
    tick();
    const b = await repo.insertCreation(makeNewCreation());
    repo.setModeration(a.id, { moderationStatus: "flagged" });
    const occupants = await repo.listZoneOccupants(Z1);
    expect(occupants.map((o) => o.id)).toEqual([a.id, b.id]);
    expect(occupants[1]?.createdAtMs).toBe(START + STEP);
    expect(Object.keys(occupants[0] ?? {}).sort()).toEqual(["coord", "createdAtMs", "id"]);
  });

  it("guarded insert: stale expected ids give zone_changed and store nothing", async () => {
    const { repo } = setup();
    const result = await repo.insertCreationGuarded(guarded(START, [ID_A]));
    expect(result).toEqual({ status: "zone_changed" });
    expect(await repo.zoneItemCounts("loy_krathong")).toEqual([]);
  });

  it("guarded insert: a missing occupant also gives zone_changed", async () => {
    const { repo } = setup();
    await repo.insertCreation(makeNewCreation());
    expect(await repo.insertCreationGuarded(guarded(START, []))).toEqual({ status: "zone_changed" });
  });

  it("guarded insert at the cap gives zone_changed", async () => {
    const { repo } = setup();
    const ids: string[] = [];
    for (let i = 0; i < 80; i += 1) ids.push((await repo.insertCreation(makeNewCreation())).id);
    expect(await repo.insertCreationGuarded(guarded(START, ids.slice(0, 79)))).toEqual({ status: "zone_changed" });
    expect((await repo.zoneItemCounts("loy_krathong"))[0]?.itemCount).toBe(80);
  });

  it("expected ids in any order are accepted; createdAt is the input's", async () => {
    const { repo } = setup();
    const a = await repo.insertCreation(makeNewCreation());
    const b = await repo.insertCreation(makeNewCreation());
    const at = START + 5 * STEP;
    const result = await repo.insertCreationGuarded(guarded(at, [b.id, a.id]));
    expect(result.status).toBe("inserted");
    if (result.status !== "inserted") return;
    expect(result.creation.createdAt).toBe(new Date(at).toISOString());
    expect(Object.keys(result.creation).sort()).toEqual([...PUBLIC_CREATION_KEYS].sort());
    expect(repo.getModerationState(result.creation.id)).toEqual({ reportCount: 0, moderationStatus: "approved" });
  });

  it("invalid input stores nothing", async () => {
    const { repo } = setup();
    await expect(repo.insertCreationGuarded(guarded(START, [], { zoneId: 0 }))).rejects.toBeInstanceOf(CreationRepositoryError);
    await expect(repo.insertCreationGuarded(guarded(START, ["nope"]))).rejects.toBeInstanceOf(CreationRepositoryError);
    expect(await repo.zoneItemCounts("loy_krathong")).toEqual([]);
  });
});

describe("in-memory repository: readOwnership (MFW-31)", () => {
  it("returns the stored hash and encrypted wish", async () => {
    const { repo } = setup();
    const c = await repo.insertCreation(makeNewCreation({ publicWishText: null, privateWish: makePrivateWish() }));
    expect(await repo.readOwnership(c.id)).toEqual({ ownerTokenHash: OWNER_HASH_FIXTURE, privateWish: makePrivateWish() });
  });

  it("public creation has no private wish; unknown id is null", async () => {
    const { repo } = setup();
    const c = await repo.insertCreation(makeNewCreation());
    expect(await repo.readOwnership(c.id)).toEqual({ ownerTokenHash: OWNER_HASH_FIXTURE, privateWish: null });
    expect(await repo.readOwnership("00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("expired creation is null once the clock passes expiresAt", async () => {
    let t = START;
    const repo = createInMemoryCreationRepository({ now: () => t });
    const c = await repo.insertCreation(makeNewCreation({ expiresAt: new Date(START + STEP) }));
    expect(await repo.readOwnership(c.id)).not.toBeNull();
    t = START + STEP;
    expect(await repo.readOwnership(c.id)).toBeNull();
  });

  it("ignores moderation status", async () => {
    const { repo } = setup();
    const c = await repo.insertCreation(makeNewCreation({ publicWishText: null, privateWish: makePrivateWish() }));
    expect(repo.setModeration(c.id, { moderationStatus: "hidden" })).toBe(true);
    expect(await repo.readOwnership(c.id)).not.toBeNull();
  });

  it("rejects an uppercase or non-uuid id", async () => {
    const { repo } = setup();
    for (const id of ["nope", "950118CE-7D93-4CB6-BD84-44D91C5DE9E3"]) {
      await expect(repo.readOwnership(id)).rejects.toMatchObject({ code: "invalid_input", detail: "creationId" });
      await expect(repo.readOwnership(id)).rejects.toBeInstanceOf(CreationRepositoryError);
    }
  });

  it("returns a copy", async () => {
    const { repo } = setup();
    const c = await repo.insertCreation(makeNewCreation({ publicWishText: null, privateWish: makePrivateWish() }));
    const first = await repo.readOwnership(c.id);
    (first!.privateWish as { keyId: string }).keyId = "mutated";
    expect((await repo.readOwnership(c.id))!.privateWish!.keyId).toBe(KEY_ID_FIXTURE);
  });
});

describe("wish switch (MFW-62)", async () => {
  const { makeTestCipher } = await import("./__fixtures__/createCreation");
  const { cipher } = await makeTestCipher();
  const WISH = "ขอให้สอบติด";
  const NAME = "สมชาย";

  async function seedPrivate(repo: ReturnType<typeof setup>["repo"], expiresAt = new Date(START + 60_000)) {
    const privateWish = await cipher.encrypt(WISH, OWNER_HASH_FIXTURE);
    const privateDisplayName = await cipher.encrypt(NAME, OWNER_HASH_FIXTURE, "displayName");
    const c = await repo.insertCreation(makeNewCreation({ publicWishText: null, privateWish, privateDisplayName, expiresAt }));
    return { id: c.id, privateWish, privateDisplayName };
  }
  const openOf = (id: string, expected: string) => ({
    creationId: id,
    expectedPrivateWish: expected as ReturnType<typeof makePrivateWish>["ciphertext"],
    publicWishText: WISH,
    displayName: NAME,
  });
  async function closeOf(id: string, expectedDisplayName: string | null = NAME) {
    return {
      creationId: id,
      expectedPublicWishText: WISH,
      expectedDisplayName,
      privateWish: await cipher.encrypt(WISH, OWNER_HASH_FIXTURE),
      privateDisplayName: await cipher.encrypt(NAME, OWNER_HASH_FIXTURE, "displayName"),
    };
  }
  /** Exactly one store holds the text, and the name never sits in both. */
  async function expectOneStore(repo: ReturnType<typeof setup>["repo"], id: string) {
    const s = await repo.readWishSwitchState(id);
    expect(s).not.toBeNull();
    if (s === null) return;
    expect((s.publicWishText === null) !== (s.privateWish === null)).toBe(true);
    expect(s.displayName !== null && s.privateDisplayName !== null).toBe(false);
    if (s.displayName !== null) expect(s.publicWishText).not.toBeNull();
    if (s.privateDisplayName !== null) expect(s.privateWish).not.toBeNull();
  }

  it("W1 lists a public name, never a closed one", async () => {
    const { repo } = setup();
    const pub = await repo.insertCreation(makeNewCreation({ displayName: NAME }));
    const priv = await seedPrivate(repo);
    const items = await repo.listPublicZone(Z1);
    const pubItem = items.find((i) => i.id === pub.id);
    const privItem = items.find((i) => i.id === priv.id);
    expect(pubItem).toMatchObject({ publicWishText: "ขอให้ทุกคนมีความสุข", displayName: NAME });
    expect(Object.keys(pubItem ?? {})).toEqual([...PUBLIC_CREATION_KEYS]);
    expect(privItem).toMatchObject({ publicWishText: null, displayName: null });
    expect(JSON.stringify(privItem)).not.toContain(NAME);
  });

  it("W2 readWishSwitchState", async () => {
    const { repo } = setup();
    expect(await repo.readWishSwitchState("00000000-0000-4000-8000-000000000999")).toBeNull();
    await expect(repo.readWishSwitchState("NOPE")).rejects.toMatchObject({ code: "invalid_input", detail: "creationId" });
    const { id, privateWish, privateDisplayName } = await seedPrivate(repo);
    expect(await repo.readWishSwitchState(id)).toEqual({
      ownerTokenHash: OWNER_HASH_FIXTURE,
      hidden: false,
      publicWishText: null,
      displayName: null,
      privateWish,
      privateDisplayName,
    });
  });

  it("W2 expired creations have no state", async () => {
    let t = START;
    const repo = createInMemoryCreationRepository({ now: () => t });
    const { id } = await seedPrivate(repo, new Date(START + 10));
    expect(await repo.readWishSwitchState(id)).not.toBeNull();
    t = START + 10;
    expect(await repo.readWishSwitchState(id)).toBeNull();
    expect(await repo.openWish(openOf(id, "v1.AAAAAAAAAAAAAAAA.SECRETxPRIVATExWISHxCIPHERTEXT"))).toBe("conflict");
  });

  it("W3 open moves text and name to the public row once", async () => {
    const { repo } = setup();
    const { id, privateWish } = await seedPrivate(repo);
    expect(await repo.openWish(openOf(id, privateWish.ciphertext))).toBe("switched");
    const s = await repo.readWishSwitchState(id);
    expect(s).toMatchObject({ publicWishText: WISH, displayName: NAME, privateWish: null, privateDisplayName: null });
    expect((await repo.listPublicZone(Z1))[0]).toMatchObject({ id, publicWishText: WISH, displayName: NAME });
    expect(await repo.openWish(openOf(id, privateWish.ciphertext))).toBe("conflict");
  });

  it("W4 close moves them back; repeated or mismatched closes conflict", async () => {
    const { repo } = setup();
    const { id, privateWish } = await seedPrivate(repo);
    await repo.openWish(openOf(id, privateWish.ciphertext));
    expect(await repo.closeWish(await closeOf(id, "someone else"))).toBe("conflict");
    expect((await repo.readWishSwitchState(id))?.publicWishText).toBe(WISH);
    const input = await closeOf(id);
    expect(await repo.closeWish(input)).toBe("switched");
    const s = await repo.readWishSwitchState(id);
    expect(s).toMatchObject({ publicWishText: null, displayName: null, privateWish: input.privateWish, privateDisplayName: input.privateDisplayName });
    expect((await repo.listPublicZone(Z1))[0]).toMatchObject({ publicWishText: null, displayName: null });
    expect(await repo.closeWish(await closeOf(id))).toBe("conflict");
  });

  it("W5 one store at a time through create / open / close / reopen", async () => {
    const { repo } = setup();
    const { id, privateWish } = await seedPrivate(repo);
    await expectOneStore(repo, id);
    await repo.openWish(openOf(id, privateWish.ciphertext));
    await expectOneStore(repo, id);
    const closing = await closeOf(id);
    await repo.closeWish(closing);
    await expectOneStore(repo, id);
    expect(await repo.openWish(openOf(id, closing.privateWish.ciphertext))).toBe("switched");
    await expectOneStore(repo, id);
  });

  it("W6 a hidden wish cannot be opened; it can be closed; moderation state is untouched", async () => {
    const { repo } = setup();
    const flagged = await seedPrivate(repo);
    repo.setModeration(flagged.id, { moderationStatus: "flagged" });
    expect((await repo.readWishSwitchState(flagged.id))?.hidden).toBe(true);
    expect(await repo.openWish(openOf(flagged.id, flagged.privateWish.ciphertext))).toBe("conflict");
    expect(await repo.readWishSwitchState(flagged.id)).toMatchObject({ publicWishText: null, privateWish: flagged.privateWish });

    const reported = await seedPrivate(repo);
    repo.setModeration(reported.id, { reportCount: AUTO_HIDE_REPORT_THRESHOLD });
    expect((await repo.readWishSwitchState(reported.id))?.hidden).toBe(true);
    expect(await repo.openWish(openOf(reported.id, reported.privateWish.ciphertext))).toBe("conflict");

    const open = await seedPrivate(repo);
    await repo.openWish(openOf(open.id, open.privateWish.ciphertext));
    repo.setModeration(open.id, { reportCount: AUTO_HIDE_REPORT_THRESHOLD, moderationStatus: "flagged" });
    expect(await repo.closeWish(await closeOf(open.id))).toBe("switched");
    expect(repo.getModerationState(open.id)).toEqual({ reportCount: AUTO_HIDE_REPORT_THRESHOLD, moderationStatus: "flagged" });
    expect(repo.getModerationState(flagged.id)).toEqual({ reportCount: 0, moderationStatus: "flagged" });
  });

  it("W7 a blocked public text is rejected before any change", async () => {
    const { repo } = setup();
    const { id, privateWish } = await seedPrivate(repo);
    await expect(repo.openWish({ ...openOf(id, privateWish.ciphertext), publicWishText: "โทร 0812345678" })).rejects.toMatchObject({
      code: "invalid_input",
      detail: "publicWishText",
    });
    expect(await repo.readWishSwitchState(id)).toMatchObject({ publicWishText: null, privateWish });
  });
});
