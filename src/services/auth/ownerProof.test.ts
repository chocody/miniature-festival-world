import { describe, expect, it } from "vitest";
import { OWNER_TOKEN_HASH_COMPARE_PLACEHOLDER } from "@/config/ownership.config";
import type { OwnerTokenHash } from "./ownerTokenHash";
import { ownerTokenHashesMatch } from "./ownerProof";

const H = (s: string) => s as OwnerTokenHash;
const A = "0123456789abcdef".repeat(4);

describe("ownerTokenHashesMatch", () => {
  it("equal hashes match", () => {
    expect(ownerTokenHashesMatch(H(A), H(A))).toBe(true);
  });
  it("a difference in the last or first char does not match", () => {
    expect(ownerTokenHashesMatch(H(A), H(A.slice(0, 63) + "0"))).toBe(false);
    expect(ownerTokenHashesMatch(H(A), H("1" + A.slice(1)))).toBe(false);
  });
  it("a missing stored hash never matches", () => {
    expect(ownerTokenHashesMatch(H(A), null)).toBe(false);
    expect(ownerTokenHashesMatch(H(OWNER_TOKEN_HASH_COMPARE_PLACEHOLDER), null)).toBe(false);
  });
  it("malformed stored or presented hashes never match", () => {
    for (const bad of [A.slice(0, 63), A.toUpperCase(), "g".repeat(64)]) {
      expect(ownerTokenHashesMatch(H(A), H(bad))).toBe(false);
      expect(ownerTokenHashesMatch(H(bad), H(bad))).toBe(false);
    }
  });
  it("the placeholder equals itself as a real equality", () => {
    expect(ownerTokenHashesMatch(H(OWNER_TOKEN_HASH_COMPARE_PLACEHOLDER), H(OWNER_TOKEN_HASH_COMPARE_PLACEHOLDER))).toBe(true);
  });
});
