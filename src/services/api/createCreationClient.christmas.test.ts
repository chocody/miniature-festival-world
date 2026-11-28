import { describe, expect, it, vi } from "vitest";
import { CHRISTMAS_TREE } from "@/config/events/christmas.tree.config";
import { buildReleaseCoord } from "@/core/ritual";
import { slotsOfBand } from "@/core/world/growingTree";
import { OWNER_TOKEN_FIXTURE } from "./__fixtures__/createCreation";
import type { CreateCreationRequestBody } from "./createCreationTypes";
import { submitCreation, toCreatedPublicCreation } from "./createCreationClient";
import { PUBLIC_CREATION_KEYS, type AppearanceJson } from "./creationTypes";

const SLOT = slotsOfBand(CHRISTMAS_TREE, 1)[0];
const APPEARANCE = { design: "ball_01" } as unknown as AppearanceJson;
const BODY: CreateCreationRequestBody = {
  eventId: "christmas",
  appearance: APPEARANCE,
  coord: SLOT,
  wishText: "ขอให้ทุกคนมีความสุข",
  wishVisibility: "private",
  ownerToken: OWNER_TOKEN_FIXTURE,
};
const creation = (extra: Record<string, unknown> = {}) => ({
  id: "0f8b6c1e-3a2d-4c5b-9e7f-1a2b3c4d5e6f",
  eventId: "christmas",
  zoneId: 1,
  appearance: APPEARANCE,
  coord: SLOT,
  publicWishText: null,
  createdAt: "2026-12-20T12:00:00.000Z",
  expiresAt: "2027-01-20T12:00:00.000Z",
  ...extra,
});
const send = async (c: unknown) => {
  const f = vi.fn(async () => new Response(JSON.stringify({ creation: c }), { status: 201 }));
  return submitCreation(BODY, { fetch: f as unknown as typeof fetch });
};

describe("christmas 201 check", () => {
  it("CC1: accepts a cylindrical creation", async () => {
    const r = await send(creation());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.creation)).toEqual([...PUBLIC_CREATION_KEYS]);
      expect(r.creation.coord).toEqual(SLOT);
    }
  });

  it("CC2: a coord of the wrong mode is invalid", async () => {
    const spline = buildReleaseCoord({ laneId: 1, progress: 0.4, lateralOffset: 0.1 });
    expect(await send(creation({ coord: spline }))).toMatchObject({ ok: false, reason: "invalid_response" });
    expect(toCreatedPublicCreation(creation({ eventId: "loy_krathong" }), "loy_krathong")).toBeNull();
  });

  it("CC3: extra or private keys are rejected", () => {
    expect(toCreatedPublicCreation(creation({ coord: { ...SLOT, x: 1 } }), "christmas")).toBeNull();
    expect(toCreatedPublicCreation(creation({ coord: { ...SLOT, owner_token: "a" } }), "christmas")).toBeNull();
    expect(
      toCreatedPublicCreation(
        creation({ appearance: { design: "ball_01", nested: { privateWish: "a" } } }),
        "christmas",
      ),
    ).toBeNull();
  });

  it("CC4: an event without a coord mode is rejected", () => {
    expect(toCreatedPublicCreation({ ...creation(), eventId: "halloween" }, "halloween")).toBeNull();
  });

  it("CC5: the coord is a fresh copy", () => {
    const raw = creation();
    const out = toCreatedPublicCreation(raw, "christmas");
    expect(out).not.toBeNull();
    expect(out?.coord).not.toBe(raw.coord);
  });
});
