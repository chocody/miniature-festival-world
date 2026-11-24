import type { OwnerTokenHash } from "@/services/auth";
import type { EncryptedPrivateWish, NewCreation, PrivateWishCiphertext } from "../creationTypes";

export const OWNER_HASH_FIXTURE = "0123456789abcdef".repeat(4) as OwnerTokenHash; // 64 lowercase hex
export const PRIVATE_CIPHERTEXT_FIXTURE = "v1.AAAAAAAAAAAAAAAA.SECRETxPRIVATExWISHxCIPHERTEXT" as PrivateWishCiphertext;
export const KEY_ID_FIXTURE = "test-key-1";
export const FAR_FUTURE = new Date("2099-01-01T00:00:00.000Z");
export const APPEARANCE_FIXTURE = {
  base: "banana_trunk_01",
  lotusFold: "style_02",
  flowers: ["marigold", "orchid"],
  candleColor: "#FFD166",
};
export const SPLINE_COORD_FIXTURE = {
  mode: "SPLINE_PATH",
  laneId: 0,
  spawnProgress: 0.25,
  speedFactor: 0.008,
  lateralOffset: 0,
} as const;

/** Defaults: loy_krathong, zone 1, public wish; overrides win (null is a valid override for the nullable fields). */
export function makeNewCreation(overrides: Partial<NewCreation> = {}): NewCreation {
  return {
    eventId: overrides.eventId !== undefined ? overrides.eventId : "loy_krathong",
    zoneId: overrides.zoneId !== undefined ? overrides.zoneId : 1,
    appearance: overrides.appearance !== undefined ? overrides.appearance : APPEARANCE_FIXTURE,
    coord: overrides.coord !== undefined ? overrides.coord : { ...SPLINE_COORD_FIXTURE },
    publicWishText: "publicWishText" in overrides ? (overrides.publicWishText ?? null) : "ขอให้ทุกคนมีความสุข",
    expiresAt: overrides.expiresAt !== undefined ? overrides.expiresAt : FAR_FUTURE,
    ownerTokenHash: overrides.ownerTokenHash !== undefined ? overrides.ownerTokenHash : OWNER_HASH_FIXTURE,
    privateWish: "privateWish" in overrides ? (overrides.privateWish ?? null) : null,
  };
}

export function makePrivateWish(): EncryptedPrivateWish {
  return { ciphertext: PRIVATE_CIPHERTEXT_FIXTURE, keyId: KEY_ID_FIXTURE };
}

/** Valid snake_case view row (lowercase uuid, ISO timestamps). */
export function makePublicRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "950118ce-7d93-4cb6-bd84-44d91c5de9e3",
    event_id: "loy_krathong",
    zone_id: 1,
    appearance: { ...APPEARANCE_FIXTURE },
    coord: { ...SPLINE_COORD_FIXTURE },
    public_wish_text: "ขอให้ทุกคนมีความสุข",
    created_at: "2026-11-24T12:00:00.000Z",
    expires_at: "2026-12-24T17:00:00.000Z",
    ...overrides,
  };
}
