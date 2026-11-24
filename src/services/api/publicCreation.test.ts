// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  KEY_ID_FIXTURE,
  OWNER_HASH_FIXTURE,
  PRIVATE_CIPHERTEXT_FIXTURE,
  makePublicRow,
} from "./__fixtures__/creations";
import { PUBLIC_CREATION_KEYS, type PublicCreation } from "./creationTypes";
import { pickPublicCreation, publicRowToCreation } from "./publicCreation";

const sortedKeys = [...PUBLIC_CREATION_KEYS].sort();

describe("publicRowToCreation", () => {
  it("maps a valid row and normalizes timestamps", () => {
    const c = publicRowToCreation(makePublicRow({ created_at: "2026-11-24T18:19:33.562709+00:00" }));
    expect(c).not.toBeNull();
    expect(Object.keys(c as PublicCreation).sort()).toEqual(sortedKeys);
    expect(c?.createdAt).toBe("2026-11-24T18:19:33.562Z");
  });

  it("drops private columns", () => {
    const c = publicRowToCreation(
      makePublicRow({
        owner_token_hash: OWNER_HASH_FIXTURE,
        private_wish_text: PRIVATE_CIPHERTEXT_FIXTURE,
        private_wish_key_id: KEY_ID_FIXTURE,
        report_count: 0,
        moderation_status: "approved",
        owner_token: "x",
      }),
    );
    expect(Object.keys(c as PublicCreation).sort()).toEqual(sortedKeys);
    const json = JSON.stringify(c);
    for (const v of [OWNER_HASH_FIXTURE, PRIVATE_CIPHERTEXT_FIXTURE, KEY_ID_FIXTURE, "moderation"]) {
      expect(json).not.toContain(v);
    }
  });

  it.each<[string, unknown]>([
    ["non-object", "row"],
    ["bad id", makePublicRow({ id: "not-a-uuid" })],
    ["bad event", makePublicRow({ event_id: "nope" })],
    ["zone 0", makePublicRow({ zone_id: 0 })],
    ["appearance array", makePublicRow({ appearance: [] })],
    ["coord with x", makePublicRow({ coord: { mode: "PLANAR_ZONE", u: 0.5, v: 0.5, x: 1 } })],
    ["wish number", makePublicRow({ public_wish_text: 5 })],
    ["bad created_at", makePublicRow({ created_at: "garbage" })],
  ])("returns null for %s", (_n, row) => {
    expect(publicRowToCreation(row)).toBeNull();
  });
});

describe("pickPublicCreation", () => {
  it("keeps exactly PUBLIC_CREATION_KEYS", () => {
    const valid = publicRowToCreation(makePublicRow()) as PublicCreation;
    const picked = pickPublicCreation({ ...valid, ownerTokenHash: "x", privateWish: {} } as unknown as PublicCreation);
    expect(Object.keys(picked).sort()).toEqual(sortedKeys);
  });
});
