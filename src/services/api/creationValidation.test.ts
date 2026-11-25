// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { OwnerTokenHash } from "@/services/auth";
import { makeNewCreation, makePrivateWish } from "./__fixtures__/creations";
import { CreationRepositoryError } from "./creationRepository";
import type { NewCreation } from "./creationTypes";
import {
  isZoneId,
  toIsoTimestamp,
  validateCloseWishInput,
  validateGuardedNewCreation,
  validateNewCreation,
  validateOpenWishInput,
} from "./creationValidation";
import type { GuardedNewCreation } from "./creationTypes";

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

describe("validateNewCreation: moderation backstop (MFW-13)", () => {
  it.each(["โทร 081-234-5678", "line: somchai99", "somchai@gmail.com", "ไอ้เหี้ย", "fuck"])(
    "rejects a public wish with PII / profanity: %s",
    (text) => {
      const err = failure(makeNewCreation({ publicWishText: text }));
      expect(err.code).toBe("invalid_input");
      expect(err.detail).toBe("publicWishText");
      expect(err.message).not.toContain("0812");
      expect(err.message).not.toContain("somchai");
      expect(err.message).not.toContain(text);
    },
  );

  it("a private creation is not moderated", () => {
    const input = makeNewCreation({ publicWishText: null, privateWish: makePrivateWish() });
    expect(validateNewCreation(input, NOW)).toEqual(input);
  });

  it("a normal wish with a year passes", () => {
    const input = makeNewCreation({ publicWishText: "ขอให้ปี 2569 ทุกคนสุขภาพแข็งแรง" });
    expect(validateNewCreation(input, NOW).publicWishText).toBe("ขอให้ปี 2569 ทุกคนสุขภาพแข็งแรง");
  });
});

describe("validateGuardedNewCreation", () => {
  const UUID_A = "00000000-0000-4000-8000-000000000001";
  const guarded = (over: Partial<GuardedNewCreation> = {}): GuardedNewCreation => ({
    ...makeNewCreation(),
    createdAt: new Date(NOW),
    expectedOccupantIds: [UUID_A],
    ...over,
  });
  const field = (input: GuardedNewCreation): string | undefined => {
    try {
      validateGuardedNewCreation(input);
    } catch (err) {
      if (err instanceof CreationRepositoryError) return err.detail;
      throw err;
    }
    return undefined;
  };

  it("passes a valid input with a fresh copy and frozen ids", () => {
    const input = guarded();
    const out = validateGuardedNewCreation(input);
    expect(out).not.toBe(input);
    expect(out.createdAt).not.toBe(input.createdAt);
    expect(out.createdAt.getTime()).toBe(NOW);
    expect(Object.isFrozen(out.expectedOccupantIds)).toBe(true);
    expect(out.expectedOccupantIds).toEqual([UUID_A]);
  });
  it("rejects a bad createdAt", () => {
    expect(field(guarded({ createdAt: new Date(NaN) }))).toBe("createdAt");
    expect(field(guarded({ createdAt: "2026-11-24" as unknown as Date }))).toBe("createdAt");
  });
  it("requires expiresAt later than createdAt", () => {
    expect(field(guarded({ expiresAt: new Date(NOW) }))).toBe("expiresAt");
  });
  it("rejects bad expectedOccupantIds", () => {
    expect(field(guarded({ expectedOccupantIds: "x" as unknown as string[] }))).toBe("expectedOccupantIds");
    expect(field(guarded({ expectedOccupantIds: ["00000000-0000-4000-8000-00000000000A"] }))).toBe("expectedOccupantIds");
    expect(field(guarded({ expectedOccupantIds: [UUID_A, UUID_A] }))).toBe("expectedOccupantIds");
    const eighty = Array.from({ length: 80 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect(field(guarded({ expectedOccupantIds: eighty }))).toBe("expectedOccupantIds");
    expect(field(guarded({ expectedOccupantIds: eighty.slice(0, 79) }))).toBeUndefined();
  });
});

describe("display name and wish switch inputs (MFW-62)", () => {
  const NAME_WISH = { ciphertext: "v1.BBBBBBBBBBBBBBBB.NAMExPRIVATExCIPHERTEXTxxx", keyId: makePrivateWish().keyId } as ReturnType<
    typeof makePrivateWish
  >;
  const UUID = "950118ce-7d93-4cb6-bd84-44d91c5de9e3";
  const fieldOf = (fn: () => unknown): string | undefined => {
    try {
      fn();
    } catch (err) {
      if (err instanceof CreationRepositoryError) {
        expect(err.code).toBe("invalid_input");
        for (const secret of ["สมชาย", "me@example.com", "0812345678", "NAMExPRIVATE"]) expect(err.message).not.toContain(secret);
        return err.detail;
      }
      throw err;
    }
    return undefined;
  };

  it("keeps a public name with a public wish and rejects it elsewhere", () => {
    expect(validateNewCreation(makeNewCreation({ displayName: "สมชาย" }), NOW).displayName).toBe("สมชาย");
    expect(fieldOf(() => validateNewCreation(makeNewCreation({ publicWishText: null, privateWish: makePrivateWish(), displayName: "สมชาย" }), NOW))).toBe(
      "displayName",
    );
    for (const bad of [" สมชาย", "", "me@example.com", 5 as never]) {
      expect(fieldOf(() => validateNewCreation(makeNewCreation({ displayName: bad }), NOW))).toBe("displayName");
    }
  });

  it("keeps a private name with the same key id as a fresh copy", () => {
    const input = makeNewCreation({ publicWishText: null, privateWish: makePrivateWish(), privateDisplayName: NAME_WISH });
    const out = validateNewCreation(input, NOW);
    expect(out.privateDisplayName).toEqual(NAME_WISH);
    expect(out.privateDisplayName).not.toBe(NAME_WISH);
    expect(out.displayName).toBeNull();
    const guarded = validateGuardedNewCreation({ ...input, createdAt: new Date(NOW), expectedOccupantIds: [] });
    expect(guarded.privateDisplayName).toEqual(NAME_WISH);
    expect(guarded.displayName).toBeNull();
  });

  it("rejects a private name without a private wish, with another key id or a bad ciphertext", () => {
    expect(fieldOf(() => validateNewCreation(makeNewCreation({ privateDisplayName: NAME_WISH }), NOW))).toBe("privateDisplayName");
    const priv = { publicWishText: null, privateWish: makePrivateWish() };
    expect(
      fieldOf(() => validateNewCreation(makeNewCreation({ ...priv, privateDisplayName: { ...NAME_WISH, keyId: "other-key" } }), NOW)),
    ).toBe("privateDisplayName");
    expect(
      fieldOf(() =>
        validateNewCreation(makeNewCreation({ ...priv, privateDisplayName: { ...NAME_WISH, ciphertext: "plain name" as never } }), NOW),
      ),
    ).toBe("privateDisplayName");
  });

  it("an input without the two keys yields explicit nulls", () => {
    const { displayName, privateDisplayName, ...legacy } = makeNewCreation();
    void displayName;
    void privateDisplayName;
    const out = validateNewCreation(legacy, NOW);
    expect(out.displayName).toBeNull();
    expect(out.privateDisplayName).toBeNull();
    expect(Object.keys(out)).toContain("displayName");
    expect(Object.keys(out)).toContain("privateDisplayName");
  });

  const open = {
    creationId: UUID,
    expectedPrivateWish: makePrivateWish().ciphertext,
    publicWishText: "ขอให้ทุกคนมีความสุข",
    displayName: "สมชาย",
  };
  it("validateOpenWishInput", () => {
    const out = validateOpenWishInput(open);
    expect(out).toEqual(open);
    expect(out).not.toBe(open);
    expect(validateOpenWishInput({ ...open, displayName: null }).displayName).toBeNull();
    expect(fieldOf(() => validateOpenWishInput({ ...open, creationId: UUID.toUpperCase() }))).toBe("creationId");
    expect(fieldOf(() => validateOpenWishInput({ ...open, expectedPrivateWish: "nope" as never }))).toBe("expectedPrivateWish");
    for (const text of [" x", "", "โทร 0812345678"]) {
      expect(fieldOf(() => validateOpenWishInput({ ...open, publicWishText: text }))).toBe("publicWishText");
    }
    expect(fieldOf(() => validateOpenWishInput({ ...open, displayName: "me@example.com" }))).toBe("displayName");
  });

  const close = {
    creationId: UUID,
    expectedPublicWishText: "ขอให้ทุกคนมีความสุข",
    expectedDisplayName: "สมชาย",
    privateWish: makePrivateWish(),
    privateDisplayName: NAME_WISH,
  };
  it("validateCloseWishInput", () => {
    const out = validateCloseWishInput(close);
    expect(out).toEqual(close);
    expect(out.privateWish).not.toBe(close.privateWish);
    expect(validateCloseWishInput({ ...close, expectedDisplayName: null, privateDisplayName: null }).privateDisplayName).toBeNull();
    expect(fieldOf(() => validateCloseWishInput({ ...close, creationId: "x" }))).toBe("creationId");
    expect(fieldOf(() => validateCloseWishInput({ ...close, expectedPublicWishText: "  " }))).toBe("expectedPublicWishText");
    expect(fieldOf(() => validateCloseWishInput({ ...close, expectedDisplayName: "" }))).toBe("expectedDisplayName");
    expect(fieldOf(() => validateCloseWishInput({ ...close, privateWish: { ...close.privateWish, keyId: "BAD" } }))).toBe("privateWish");
    expect(fieldOf(() => validateCloseWishInput({ ...close, privateDisplayName: { ...NAME_WISH, keyId: "other-key" } }))).toBe(
      "privateDisplayName",
    );
  });
});
