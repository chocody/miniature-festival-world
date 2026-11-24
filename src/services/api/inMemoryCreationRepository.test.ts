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
import { PUBLIC_CREATION_KEYS } from "./creationTypes";
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
