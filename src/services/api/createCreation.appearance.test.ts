// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  CREATE_NOW_MS,
  defaultAppearanceJson,
  makeCreateBody,
  makeCreateRequest,
  makeTestCipher,
  recordingRepository,
} from "./__fixtures__/createCreation";
import { ORNAMENT_DESIGN_IDS } from "@/config/ornamentDesigns.config";
import { STAR_DESIGN_IDS } from "@/config/starDesigns.config";
import { handleCreateCreation, type CreateCreationDeps } from "./createCreation";
import { getCreationPlacementStrategy } from "./creationPlacement";
import { createInMemoryCreationRepository } from "./inMemoryCreationRepository";
import type { PublicCreation } from "./creationTypes";

// new_year has no retention end date until 17.2 (MFW-127); test seam for the MFW-131 allowlist only
// — remove when 17.2 lands. Every other event (christmas, loy_krathong) keeps the real config.
vi.mock("@/services/api/retention", async (importActual) => {
  const actual = await importActual<typeof import("@/services/api/retention")>();
  return {
    ...actual,
    computeCreationExpiresAt: (...args: Parameters<typeof actual.computeCreationExpiresAt>) =>
      args[0] === "new_year"
        ? new Date("2099-01-01T00:00:00.000Z")
        : actual.computeCreationExpiresAt(...args),
  };
});

async function setup() {
  const repo = createInMemoryCreationRepository({ now: () => CREATE_NOW_MS });
  const { repo: rec, inserts } = recordingRepository(repo);
  const { cipher } = await makeTestCipher();
  const deps: CreateCreationDeps = {
    getRepository: () => rec,
    getCipher: async () => cipher,
    isProduction: false,
    now: () => CREATE_NOW_MS,
    isEventActive: () => true,
    getPlacementStrategy: () => getCreationPlacementStrategy("loy_krathong"),
  };
  const post = (body: unknown) => handleCreateCreation(makeCreateRequest(body), deps);
  return { inserts, post };
}
const REJECTED = { error: "invalid_body", field: "appearance" };

describe("POST /api/creations appearance allowlist per event (MFW-92)", () => {
  it("CA1 rejects a krathong appearance for christmas", async () => {
    const { inserts, post } = await setup();
    const res = await post(makeCreateBody({ eventId: "christmas" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(REJECTED);
    expect(inserts).toHaveLength(0);
  });
  it("CA2 rejects an ornament appearance for loy_krathong", async () => {
    for (const appearance of [{ design: "ball_01" }, { ...defaultAppearanceJson(), design: "ball_01" }]) {
      const { inserts, post } = await setup();
      const res = await post(makeCreateBody({ appearance }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual(REJECTED);
      expect(inserts).toHaveLength(0);
    }
  });
  it("CA3 accepts a catalogue ornament and rejects extra keys", async () => {
    const { inserts, post } = await setup();
    const res = await post(makeCreateBody({ eventId: "christmas", appearance: { design: "ball_01" } }));
    expect(res.status).toBe(201);
    const { creation } = (await res.json()) as { creation: PublicCreation };
    expect(creation.appearance).toEqual({ design: "ball_01" });
    expect(inserts[0].appearance).toEqual({ design: "ball_01" });
    const bad = await post(makeCreateBody({ eventId: "christmas", appearance: { design: "ball_01", color: "#FFFFFF" } }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual(REJECTED);
  });
});

describe("POST /api/creations star appearance allowlist (MFW-131)", () => {
  async function expectRejected(body: unknown) {
    const { inserts, post } = await setup();
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(REJECTED);
    expect(inserts).toHaveLength(0);
  }
  it("CS1 rejects a krathong appearance for new_year", async () => {
    await expectRejected(makeCreateBody({ eventId: "new_year" }));
  });
  it("CS2 rejects an ornament appearance for new_year", async () => {
    for (const id of ORNAMENT_DESIGN_IDS) {
      await expectRejected(makeCreateBody({ eventId: "new_year", appearance: { design: id } }));
    }
  });
  it("CS3 rejects a star for the other events", async () => {
    for (const eventId of ["loy_krathong", "christmas"]) {
      for (const id of STAR_DESIGN_IDS) {
        await expectRejected(makeCreateBody({ eventId, appearance: { design: id } }));
      }
    }
    await expectRejected(makeCreateBody({ appearance: { ...defaultAppearanceJson(), design: "star_classic_01" } }));
  });
  it("CS4 accepts catalogue stars and rejects extra keys", async () => {
    for (const id of STAR_DESIGN_IDS) {
      const { inserts, post } = await setup();
      const res = await post(makeCreateBody({ eventId: "new_year", appearance: { design: id } }));
      expect(res.status).toBe(201);
      const { creation } = (await res.json()) as { creation: PublicCreation };
      expect(creation.appearance).toEqual({ design: id });
      expect(inserts[inserts.length - 1].appearance).toEqual({ design: id });
    }
    await expectRejected(makeCreateBody({ eventId: "new_year", appearance: { design: "star_classic_01", color: "#FFD700" } }));
  });
});
