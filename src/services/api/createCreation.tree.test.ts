// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { CHRISTMAS_TREE } from "@/config/events/christmas.tree.config";
import type { NormalizedCylindricalCoord } from "@/core/coordinates/CylindricalCoord";
import { slotsOfBand } from "@/core/world/growingTree";
import { checkPublicWish, toModerationBlockedBody } from "@/services/moderation";
import { makeNewCreation } from "./__fixtures__/creations";
import {
  CREATE_NOW_MS,
  TEST_KEY_ID,
  barrierOnZoneCounts,
  makeCreateBody,
  makeCreateRequest,
  makeTestCipher,
  recordingRepository,
  riverCoord,
} from "./__fixtures__/createCreation";
import { handleCreateCreation, type CreateCreationDeps } from "./createCreation";
import { PUBLIC_CREATION_KEYS, type PublicCreation } from "./creationTypes";
import { createInMemoryCreationRepository, type InMemoryCreationRepository } from "./inMemoryCreationRepository";

const cyl = (tierId: number, angleDeg: number, heightRatio: number): NormalizedCylindricalCoord => ({
  mode: "CYLINDRICAL_SURFACE",
  tierId,
  angleDeg,
  heightRatio,
});
const S_TOP = cyl(0, 45, 0.375);
const S_TOP_NEXT = cyl(0, 135, 0.375);
const S_BAND2_FROM_TOP = cyl(5, 45, 0.625);
const S_LOSER = cyl(5, 345, 0.625);
const OFF = cyl(2, 27, 0.7);
const OFF_SNAP = cyl(2, 25, 0.6875);
const PRIVATE_NAMES = [
  "owner_token", "ownerToken", "owner_token_hash", "ownerTokenHash", "private_wish_text", "privateWishText",
  "privateWish", "private_wish_key_id", "report_count", "reportCount", "moderation_status", "moderationStatus",
];
const KEYS = ["angleDeg", "heightRatio", "mode", "tierId"];

async function setup() {
  const repo = createInMemoryCreationRepository({ now: () => CREATE_NOW_MS });
  const { repo: rec, inserts } = recordingRepository(repo);
  const { cipher } = await makeTestCipher();
  const getCipher = vi.fn(async () => cipher);
  const deps: CreateCreationDeps = {
    getRepository: () => rec,
    getCipher,
    isProduction: false,
    now: () => CREATE_NOW_MS,
    isEventActive: () => true,
  };
  const post = (body: unknown) => handleCreateCreation(makeCreateRequest(body), deps);
  return { repo, inserts, getCipher, deps, post };
}

const ornament = (coord: unknown, over: Record<string, unknown> = {}) =>
  makeCreateBody({ eventId: "christmas", appearance: { design: "ball_01" }, coord, ...over });

async function seed(repo: InMemoryCreationRepository, zoneId: number, coords: readonly NormalizedCylindricalCoord[]) {
  const ids: string[] = [];
  for (const coord of coords) {
    const c = await repo.insertCreation(makeNewCreation({ eventId: "christmas", zoneId, coord, appearance: { design: "ball_01" } }));
    ids.push(c.id);
  }
  return ids;
}
const created = async (res: Response) => ((await res.json()) as { creation: PublicCreation }).creation;

describe("POST /api/creations tree placement (MFW-97)", () => {
  it("TR1 exact free slot", async () => {
    const { post, inserts } = await setup();
    const res = await post(ornament(S_TOP));
    expect(res.status).toBe(201);
    const c = await created(res);
    expect(c.coord).toEqual(S_TOP);
    expect(c.zoneId).toBe(1);
    expect(Object.keys(c.coord).sort()).toEqual(KEYS);
    expect(c.expiresAt).toBe("2027-01-25T17:00:00.000Z");
    expect(inserts[0]!.expectedOccupantIds).toEqual([]);
    expect(inserts[0]!.coord).toEqual(S_TOP);
  });

  it("TR2 slot taken by a visible row", async () => {
    const { repo, post, inserts } = await setup();
    const ids = await seed(repo, 1, [S_TOP]);
    const res = await post(ornament(S_TOP));
    expect(res.status).toBe(201);
    const c = await created(res);
    expect(c.coord).toEqual(S_TOP_NEXT);
    expect(c.zoneId).toBe(1);
    expect(inserts[0]!.expectedOccupantIds).toEqual(ids);
  });

  it("TR3 slot taken by a hidden row", async () => {
    const { repo, post, inserts } = await setup();
    const ids = await seed(repo, 1, [S_TOP]);
    repo.setModeration(ids[0]!, { moderationStatus: "hidden" });
    const res = await post(ornament(S_TOP));
    expect(res.status).toBe(201);
    expect((await created(res)).coord).toEqual(S_TOP_NEXT);
    expect(inserts[0]!.expectedOccupantIds).toEqual(ids);
  });

  it("TR4 full band", async () => {
    const { repo, post, inserts } = await setup();
    const ids = await seed(repo, 1, slotsOfBand(CHRISTMAS_TREE, 1));
    const res = await post(ornament(S_TOP));
    expect(res.status).toBe(201);
    const c = await created(res);
    expect(c.zoneId).toBe(2);
    expect(c.coord).toEqual(S_BAND2_FROM_TOP);
    expect(inserts[0]!.expectedOccupantIds).toEqual([]);
    repo.setModeration(ids[0]!, { moderationStatus: "hidden" });
    const again = await post(ornament(S_TOP));
    expect(again.status).toBe(201);
    expect((await created(again)).zoneId).toBe(2);
  });

  it("TR5 off-lattice candidate is snapped", async () => {
    const { post } = await setup();
    const res = await post(ornament(OFF));
    expect(res.status).toBe(201);
    expect((await created(res)).coord).toEqual(OFF_SNAP);
  });

  it("TR6 rejected coords", async () => {
    const { post, inserts } = await setup();
    for (const coord of [riverCoord(0.4), { ...S_TOP, tierId: 752 }]) {
      const res = await post(ornament(coord));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_body", field: "coord" });
    }
    expect(inserts).toHaveLength(0);
    const ok = await post(ornament({ ...S_TOP, tierId: 751 }));
    expect(ok.status).toBe(201);
    expect((await created(ok)).zoneId).toBe(1);
  });

  it("TR7 last-slot race: one wins, the other lands in the next band", async () => {
    const { repo, deps } = await setup();
    await seed(repo, 1, slotsOfBand(CHRISTMAS_TREE, 1).slice(0, 74));
    const { repo: rec, inserts } = recordingRepository(barrierOnZoneCounts(repo, 2));
    const racing: CreateCreationDeps = { ...deps, getRepository: () => rec };
    const body = ornament(slotsOfBand(CHRISTMAS_TREE, 1)[74]);
    const [a, b] = await Promise.all([
      handleCreateCreation(makeCreateRequest(body), racing),
      handleCreateCreation(makeCreateRequest(body), racing),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    const cs = [await created(a), await created(b)].sort((x, y) => x.zoneId - y.zoneId);
    expect(cs.map((c) => c.zoneId)).toEqual([1, 2]);
    expect(cs[0]!.coord).toEqual(slotsOfBand(CHRISTMAS_TREE, 1)[74]);
    expect(cs[1]!.coord).toEqual(S_LOSER);
    expect(inserts).toHaveLength(3);
    const retry = inserts[2]!;
    expect(retry.zoneId).toBe(2);
    expect(retry.expectedOccupantIds).toEqual([]);
  });

  it("TR8 a PII wish is refused with 422 and nothing is stored", async () => {
    for (const wishText of ["โทร 0812345678", "somchai@gmail.com"]) {
      const { post, inserts, getCipher } = await setup();
      const guard = checkPublicWish(wishText);
      if (guard.ok) throw new Error("fixture wish must be blocked");
      const res = await post(ornament(S_TOP, { wishText }));
      expect(res.status).toBe(422);
      const text = await res.text();
      expect(JSON.parse(text)).toEqual(toModerationBlockedBody(guard.reasons));
      expect(text).not.toContain(wishText);
      expect(inserts).toHaveLength(0);
      expect(getCipher).not.toHaveBeenCalled();
    }
  });

  it("TR9 no private data in the response", async () => {
    const { post, inserts } = await setup();
    const res = await post(ornament(S_TOP, { wishVisibility: "private" }));
    expect(res.status).toBe(201);
    const text = await res.text();
    const c = (JSON.parse(text) as { creation: PublicCreation }).creation;
    expect(Object.keys(c).sort()).toEqual([...PUBLIC_CREATION_KEYS].sort());
    const walk = (v: unknown): string[] =>
      v !== null && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => [k, ...walk(x)]) : [];
    for (const key of walk(JSON.parse(text))) expect(PRIVATE_NAMES).not.toContain(key);
    for (const name of PRIVATE_NAMES) expect(text).not.toContain(name);
    for (const secret of ["SeCrEt", inserts[0]!.ownerTokenHash, inserts[0]!.privateWish!.ciphertext, TEST_KEY_ID]) {
      expect(text).not.toContain(secret);
    }
  });
});
