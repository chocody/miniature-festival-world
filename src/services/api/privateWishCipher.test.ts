// @vitest-environment node
import { createCipheriv } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PRIVATE_WISH_CIPHERTEXT_PATTERN } from "@/config/privateWish.config";
import type { OwnerTokenHash } from "@/services/auth";
import { OWNER_HASH_FIXTURE } from "./__fixtures__/creations";
import { TEST_KEY_BYTES, TEST_KEY_ID, makeTestCipher } from "./__fixtures__/createCreation";
import { bytesToBase64Url } from "./base64url";
import type { PrivateWishCiphertext } from "./creationTypes";
import {
  PrivateWishKeyError,
  createPrivateWishCipher,
  createPrivateWishCipherFromEnv,
  decryptPrivateWish,
  importPrivateWishKey,
  privateWishAdditionalData,
  readPrivateWishKeyEnv,
} from "./privateWishCipher";

const HASH = OWNER_HASH_FIXTURE;
const TEXTS = ["ขอให้สอบติด", "May all my wishes come true", "🏮✨", "a", ""];
const KEY_B64 = Buffer.from(TEST_KEY_BYTES()).toString("base64");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("private wish cipher", () => {
  it("is real AES-256-GCM (matches node:crypto)", async () => {
    const { cipher } = await makeTestCipher((b) => b.fill(9));
    const out = await cipher.encrypt("ขอให้สอบติด", HASH);
    const iv = Buffer.alloc(12, 9);
    const nodeCipher = createCipheriv("aes-256-gcm", Buffer.from(TEST_KEY_BYTES()), iv);
    nodeCipher.setAAD(Buffer.from(privateWishAdditionalData(TEST_KEY_ID, HASH)));
    const ct = Buffer.concat([nodeCipher.update("ขอให้สอบติด", "utf8"), nodeCipher.final(), nodeCipher.getAuthTag()]);
    expect(out.ciphertext).toBe(`v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(ct)}`);
  });

  it("round trips and hides the plaintext", async () => {
    const { cipher, lookup } = await makeTestCipher();
    for (const text of TEXTS) {
      const out = await cipher.encrypt(text, HASH);
      expect(out.keyId).toBe(TEST_KEY_ID);
      expect(PRIVATE_WISH_CIPHERTEXT_PATTERN.test(out.ciphertext)).toBe(true);
      expect(await decryptPrivateWish(out, HASH, lookup)).toBe(text);
      if (text.length > 3) {
        expect(out.ciphertext).not.toContain(text);
        expect(out.ciphertext).not.toContain(bytesToBase64Url(new TextEncoder().encode(text)));
      }
    }
  });

  it("uses a fresh IV each time", async () => {
    const { cipher } = await makeTestCipher();
    expect((await cipher.encrypt("x", HASH)).ciphertext).not.toBe((await cipher.encrypt("x", HASH)).ciphertext);
  });

  it("decrypt returns null on any failure", async () => {
    const { cipher, lookup } = await makeTestCipher();
    const out = await cipher.encrypt("secret wish", HASH);
    const flipped = out.ciphertext.slice(0, -2) + (out.ciphertext.endsWith("AA") ? "BB" : "AA");
    expect(await decryptPrivateWish({ ...out, ciphertext: flipped as PrivateWishCiphertext }, HASH, lookup)).toBeNull();
    expect(await decryptPrivateWish(out, "f".repeat(64) as OwnerTokenHash, lookup)).toBeNull();
    expect(await decryptPrivateWish(out, HASH, () => undefined)).toBeNull();
    const otherKey = await importPrivateWishKey(new Uint8Array(32).fill(8));
    expect(await decryptPrivateWish(out, HASH, () => otherKey)).toBeNull();
    const v2 = out.ciphertext.replace(/^v1/, "v2") as PrivateWishCiphertext;
    expect(await decryptPrivateWish({ ...out, ciphertext: v2 }, HASH, lookup)).toBeNull();
    expect(await decryptPrivateWish({ ...out, keyId: "other-key" }, HASH, lookup)).toBeNull();
    const sameKey = await importPrivateWishKey(TEST_KEY_BYTES());
    expect(await decryptPrivateWish({ ...out, keyId: "other-key" }, HASH, () => sameKey)).toBeNull();
  });

  it("validates key size, key id and inputs", async () => {
    for (const n of [16, 31, 33]) await expect(importPrivateWishKey(new Uint8Array(n))).rejects.toBeInstanceOf(RangeError);
    const key = await importPrivateWishKey(TEST_KEY_BYTES());
    expect(() => createPrivateWishCipher({ keyId: "Key 1", key })).toThrow(RangeError);
    const { cipher } = await makeTestCipher();
    const e1 = await cipher.encrypt(5 as unknown as string, HASH).catch((e: unknown) => e);
    expect(e1).toBeInstanceOf(TypeError);
    expect((e1 as Error).message).not.toContain("5");
    const e2 = await cipher.encrypt("x", "abc" as OwnerTokenHash).catch((e: unknown) => e);
    expect(e2).toBeInstanceOf(TypeError);
    expect((e2 as Error).message).not.toContain("abc");
  });
});

describe("private wish key env", () => {
  it("readPrivateWishKeyEnv", () => {
    expect(readPrivateWishKeyEnv({})).toEqual({ ok: false, reason: "absent" });
    expect(readPrivateWishKeyEnv({ PRIVATE_WISH_KEY: KEY_B64 })).toEqual({ ok: false, reason: "invalid" });
    expect(readPrivateWishKeyEnv({ PRIVATE_WISH_KEY_ID: "k2026a" })).toEqual({ ok: false, reason: "invalid" });
    for (const id of ["Key 1", "ephemeral"]) {
      expect(readPrivateWishKeyEnv({ PRIVATE_WISH_KEY: KEY_B64, PRIVATE_WISH_KEY_ID: id })).toEqual({ ok: false, reason: "invalid" });
    }
    expect(readPrivateWishKeyEnv({ PRIVATE_WISH_KEY: "AAAA", PRIVATE_WISH_KEY_ID: "k2026a" })).toEqual({ ok: false, reason: "invalid" });
    const short = Buffer.alloc(31, 1).toString("base64");
    expect(readPrivateWishKeyEnv({ PRIVATE_WISH_KEY: short, PRIVATE_WISH_KEY_ID: "k2026a" })).toEqual({ ok: false, reason: "invalid" });
    const ok = readPrivateWishKeyEnv({ PRIVATE_WISH_KEY: KEY_B64, PRIVATE_WISH_KEY_ID: "k2026a" });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.keyId).toBe("k2026a");
      expect(ok.rawKey.byteLength).toBe(32);
    }
  });

  it("createPrivateWishCipherFromEnv", async () => {
    const mem = await createPrivateWishCipherFromEnv({}, "memory");
    expect(mem.keyId).toBe("ephemeral");
    const out = await mem.encrypt("hello", HASH);
    expect(PRIVATE_WISH_CIPHERTEXT_PATTERN.test(out.ciphertext)).toBe(true);
    await expect(createPrivateWishCipherFromEnv({}, "supabase")).rejects.toMatchObject({ reason: "missing" });
    const bad = { PRIVATE_WISH_KEY: "AAAA", PRIVATE_WISH_KEY_ID: "k2026a" };
    const err = await createPrivateWishCipherFromEnv(bad, "memory").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PrivateWishKeyError);
    expect((err as PrivateWishKeyError).reason).toBe("invalid");
    expect((err as Error).message).not.toContain("AAAA");
    const good = await createPrivateWishCipherFromEnv({ PRIVATE_WISH_KEY: KEY_B64, PRIVATE_WISH_KEY_ID: "k2026a" }, "supabase");
    expect(good.keyId).toBe("k2026a");
  });

  it("getPrivateWishCipher caches success, not failure", async () => {
    vi.resetModules();
    vi.stubEnv("PRIVATE_WISH_KEY", "");
    vi.stubEnv("PRIVATE_WISH_KEY_ID", "");
    const first = await import("./privateWishCipher");
    expect(first.getPrivateWishCipher("memory")).toBe(first.getPrivateWishCipher("memory"));
    vi.resetModules();
    vi.stubEnv("PRIVATE_WISH_KEY", "AAAA");
    vi.stubEnv("PRIVATE_WISH_KEY_ID", "k2026a");
    const second = await import("./privateWishCipher");
    await expect(second.getPrivateWishCipher("supabase")).rejects.toBeInstanceOf(second.PrivateWishKeyError);
    await expect(second.getPrivateWishCipher("supabase")).rejects.toBeInstanceOf(second.PrivateWishKeyError);
    vi.stubEnv("PRIVATE_WISH_KEY", KEY_B64);
    await expect(second.getPrivateWishCipher("supabase")).resolves.toMatchObject({ keyId: "k2026a" });
  });
});
