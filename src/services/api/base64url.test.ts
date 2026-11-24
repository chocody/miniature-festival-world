// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PRIVATE_WISH_KEY_BASE64_PATTERN } from "@/config/privateWish.config";
import { base64ToBytes, base64UrlToBytes, bytesToBase64Url } from "./base64url";

describe("base64url", () => {
  it("round trips byte lengths 0-40 without padding", () => {
    for (let n = 0; n <= 40; n += 1) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37) % 256);
      const text = bytesToBase64Url(bytes);
      expect(text).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(text).not.toContain("=");
      expect(Array.from(base64UrlToBytes(text) ?? [])).toEqual(Array.from(bytes));
    }
  });

  it("rejects malformed and non-canonical input", () => {
    for (const bad of ["A", "AB=", "A+B/", "a b"]) expect(base64UrlToBytes(bad)).toBeNull();
    const one = bytesToBase64Url(new Uint8Array([1]));
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const last = one[one.length - 1] ?? "";
    const next = alphabet[alphabet.indexOf(last) + 1] ?? "";
    expect(base64UrlToBytes(one.slice(0, -1) + next)).toBeNull();
  });

  it("base64ToBytes decodes only the pattern", () => {
    const key = base64ToBytes(Buffer.alloc(32, 7).toString("base64"), PRIVATE_WISH_KEY_BASE64_PATTERN);
    expect(key?.byteLength).toBe(32);
    expect(key?.every((b) => b === 7)).toBe(true);
    expect(base64ToBytes("AAAA", PRIVATE_WISH_KEY_BASE64_PATTERN)).toBeNull();
    const urlForm = Buffer.alloc(32, 0xfb).toString("base64url");
    expect(base64ToBytes(urlForm, PRIVATE_WISH_KEY_BASE64_PATTERN)).toBeNull();
  });
});
