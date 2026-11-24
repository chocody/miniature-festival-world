// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PRIVATE_CIPHERTEXT_FIXTURE } from "@/services/api/__fixtures__/creations";
import {
  AES_GCM_IV_BYTES,
  AES_GCM_TAG_BYTES,
  PRIVATE_WISH_CIPHERTEXT_PATTERN,
  PRIVATE_WISH_KEY_ID_PATTERN,
} from "./privateWish.config";

const BITS_PER_BYTE = 8;
const BITS_PER_BASE64_CHAR = 6;

describe("private wish storage contract", () => {
  it("length derivations match the pattern", () => {
    expect(Math.ceil((AES_GCM_IV_BYTES * BITS_PER_BYTE) / BITS_PER_BASE64_CHAR)).toBe(16);
    expect(Math.ceil((AES_GCM_TAG_BYTES * BITS_PER_BYTE) / BITS_PER_BASE64_CHAR)).toBe(22);
  });

  it("ciphertext pattern", () => {
    expect(PRIVATE_WISH_CIPHERTEXT_PATTERN.test(PRIVATE_CIPHERTEXT_FIXTURE)).toBe(true);
    const body = "A".repeat(22);
    for (const bad of [
      "my secret wish",
      `v2.${"A".repeat(16)}.${body}`,
      `v1.${"A".repeat(15)}.${body}`,
      `v1.${"A".repeat(16)}.${"A".repeat(21)}`,
      `v1.${"A".repeat(16)}.${body}=`,
    ]) {
      expect(PRIVATE_WISH_CIPHERTEXT_PATTERN.test(bad)).toBe(false);
    }
  });

  it("key id pattern", () => {
    for (const ok of ["k1", "test-key-1"]) expect(PRIVATE_WISH_KEY_ID_PATTERN.test(ok)).toBe(true);
    for (const bad of ["", "Key", "-k", "a".repeat(33)]) expect(PRIVATE_WISH_KEY_ID_PATTERN.test(bad)).toBe(false);
  });
});
