// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  CREATE_NOW_MS,
  defaultAppearanceJson,
  makeCreateBody,
  makeCreateRequest,
  makeTestCipher,
  recordingRepository,
} from "./__fixtures__/createCreation";
import { handleCreateCreation, type CreateCreationDeps } from "./createCreation";
import { getCreationPlacementStrategy } from "./creationPlacement";
import { createInMemoryCreationRepository } from "./inMemoryCreationRepository";
import type { PublicCreation } from "./creationTypes";

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
