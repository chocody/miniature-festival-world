// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { OwnerTokenHash } from "@/services/auth";
import { makeNewCreation, makePrivateWish } from "./__fixtures__/creations";
import { CreationRepositoryError } from "./creationRepository";
import type { NewCreation } from "./creationTypes";
import { isZoneId, toIsoTimestamp, validateNewCreation } from "./creationValidation";

const NOW = Date.parse("2026-11-24T12:00:00.000Z");

function failure(input: NewCreation): CreationRepositoryError {
  try {
    validateNewCreation(input, NOW);
  } catch (err) {
    if (err instanceof CreationRepositoryError) return err;
    throw err;
  }
  throw new Error("expected validateNewCreation to throw");
}

describe("validateNewCreation", () => {
  it("returns an equal but fresh copy of a valid public creation", () => {
    const input = makeNewCreation();
    const out = validateNewCreation(input, NOW);
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
    expect(out.appearance).not.toBe(input.appearance);
  });

  it("accepts a valid private creation", () => {
    const out = validateNewCreation(makeNewCreation({ publicWishText: null, privateWish: makePrivateWish() }), NOW);
    expect(out.privateWish).toEqual(makePrivateWish());
  });

  const cases: [string, Partial<NewCreation>, string][] = [
    ["eventId", { eventId: "nope" as never }, "eventId"],
    ["zone 0", { zoneId: 0 }, "zoneId"],
    ["zone 1.5", { zoneId: 1.5 }, "zoneId"],
    ["zone -1", { zoneId: -1 }, "zoneId"],
    ["zone int4+1", { zoneId: 2147483648 }, "zoneId"],
    ["appearance array", { appearance: [] as never }, "appearance"],
    ["appearance null", { appearance: null as never }, "appearance"],
    ["coord with x", { coord: { mode: "PLANAR_ZONE", u: 0.5, v: 0.5, x: 1 } as never }, "coord"],
    ["coord xyz", { coord: { x: 1, y: 2, z: 3 } as never }, "coord"],
    ["blank public wish", { publicWishText: "   " }, "publicWishText"],
    ["expiresAt NaN", { expiresAt: new Date(NaN) }, "expiresAt"],
    ["expiresAt == now", { expiresAt: new Date(NOW) }, "expiresAt"],
    ["short hash", { ownerTokenHash: "abc" as OwnerTokenHash }, "ownerTokenHash"],
    ["uppercase hash", { ownerTokenHash: "0123456789ABCDEF".repeat(4) as OwnerTokenHash }, "ownerTokenHash"],
    ["raw token shape", { ownerTokenHash: "A".repeat(43) as OwnerTokenHash }, "ownerTokenHash"],
    [
      "rejects a plaintext private wish",
      { publicWishText: null, privateWish: { ciphertext: "my secret wish", keyId: "k1" } as never },
      "privateWish",
    ],
    [
      "bad key id",
      { publicWishText: null, privateWish: { ...makePrivateWish(), keyId: "Key 1" } },
      "privateWish",
    ],
    ["both wishes", { privateWish: makePrivateWish() }, "privateWish"],
  ];

  it.each(cases)("%s", (_name, overrides, detail) => {
    const err = failure(makeNewCreation(overrides));
    expect(err.code).toBe("invalid_input");
    expect(err.detail).toBe(detail);
  });

  it("error message does not echo values", () => {
    const err = failure(makeNewCreation({ ownerTokenHash: "SECRETVALUE" as OwnerTokenHash }));
    expect(err.message).not.toContain("SECRET");
  });
});

describe("helpers", () => {
  it("isZoneId bounds", () => {
    expect(isZoneId(2147483647)).toBe(true);
    expect(isZoneId(2147483648)).toBe(false);
  });
  it("toIsoTimestamp", () => {
    expect(toIsoTimestamp("2026-11-24T18:19:33.562709+00:00")).toBe("2026-11-24T18:19:33.562Z");
    expect(toIsoTimestamp("x")).toBeNull();
    expect(toIsoTimestamp(5)).toBeNull();
  });
});
