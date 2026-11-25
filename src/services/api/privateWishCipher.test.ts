// @vitest-environment node
import { createCipheriv } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PRIVATE_WISH_CIPHERTEXT_PATTERN, PRIVATE_WISH_RETIRED_KEYS_MAX } from "@/config/privateWish.config";
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
  createPrivateWishReaderFromEnv,
  readPrivateWishKeyEnv,
  readRetiredPrivateWishKeysEnv,
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

const keyB64 = (n: number): string => Buffer.alloc(32, n).toString("base64");
const rawKey = (n: number): Uint8Array<ArrayBuffer> => new Uint8Array(32).fill(n);
const unusedCipher = () => vi.fn(async (): Promise<never> => {
  throw new Error("must not be called");
});

describe("cipher.decrypt (MFW-31)", () => {
  it("round trips, and fails for another owner hash or a relabelled key id", async () => {
    const { cipher } = await makeTestCipher();
    const wish = await cipher.encrypt("ความลับ", HASH);
    expect(await cipher.decrypt(wish, HASH)).toBe("ความลับ");
    expect(await cipher.decrypt(wish, "f".repeat(64) as OwnerTokenHash)).toBeNull();
    expect(await cipher.decrypt({ ...wish, keyId: "other" }, HASH)).toBeNull();
  });
});

describe("readRetiredPrivateWishKeysEnv (MFW-31)", () => {
  it("unset or blank is ok and empty", () => {
    expect(readRetiredPrivateWishKeysEnv({})).toEqual({ ok: true, keys: [] });
    expect(readRetiredPrivateWishKeysEnv({ PRIVATE_WISH_RETIRED_KEYS: "  " })).toEqual({ ok: true, keys: [] });
  });

  it("parses id:key pairs in order", () => {
    const r = readRetiredPrivateWishKeysEnv({ PRIVATE_WISH_RETIRED_KEYS: `old1:${keyB64(1)},old2:${keyB64(2)}` });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.keys.map((k) => k.keyId)).toEqual(["old1", "old2"]);
      expect(r.keys.every((k) => k.rawKey.byteLength === 32)).toBe(true);
    }
  });

  it("rejects malformed lists", () => {
    const k = keyB64(1);
    const many = Array.from({ length: PRIVATE_WISH_RETIRED_KEYS_MAX + 1 }, (_, i) => `id${i}:${k}`).join(",");
    const bad = [
      k,
      `a:b:${k}`,
      `:${k}`,
      `Old1:${k}`,
      `ephemeral:${k}`,
      `a:${k},a:${keyB64(2)}`,
      `a:${Buffer.alloc(31, 1).toString("base64")}`,
      "a:AAAA",
      many,
    ];
    for (const value of bad) expect(readRetiredPrivateWishKeysEnv({ PRIVATE_WISH_RETIRED_KEYS: value })).toEqual({ ok: false });
  });
});

describe("private wish reader (MFW-31)", () => {
  it("reader with the current key", async () => {
    const cipher = createPrivateWishCipher({ keyId: "k2026b", key: await importPrivateWishKey(rawKey(2)) });
    const wish = await cipher.encrypt("hello", HASH);
    const unused = unusedCipher();
    const reader = await createPrivateWishReaderFromEnv({ PRIVATE_WISH_KEY: keyB64(2), PRIVATE_WISH_KEY_ID: "k2026b" }, "supabase", unused);
    expect(await reader.decrypt(wish, HASH)).toBe("hello");
    expect(unused).not.toHaveBeenCalled();
  });

  it("reader decrypts retired keys", async () => {
    const old = createPrivateWishCipher({ keyId: "k2026a", key: await importPrivateWishKey(rawKey(1)) });
    const wish = await old.encrypt("old wish", HASH);
    const base = { PRIVATE_WISH_KEY: keyB64(2), PRIVATE_WISH_KEY_ID: "k2026b" };
    const withRetired = await createPrivateWishReaderFromEnv(
      { ...base, PRIVATE_WISH_RETIRED_KEYS: `k2026a:${keyB64(1)}` },
      "supabase",
      unusedCipher(),
    );
    expect(await withRetired.decrypt(wish, HASH)).toBe("old wish");
    const without = await createPrivateWishReaderFromEnv(base, "supabase", unusedCipher());
    expect(await without.decrypt(wish, HASH)).toBeNull();
  });

  it("never accepts the ephemeral id outside the memory backend", async () => {
    const eph = createPrivateWishCipher({ keyId: "ephemeral", key: await importPrivateWishKey(rawKey(2)) });
    const wish = await eph.encrypt("x", HASH);
    const reader = await createPrivateWishReaderFromEnv({ PRIVATE_WISH_KEY: keyB64(2), PRIVATE_WISH_KEY_ID: "k2026b" }, "supabase", unusedCipher());
    expect(await reader.decrypt(wish, HASH)).toBeNull();
  });

  it("memory without env uses the write cipher only", async () => {
    const write = await createPrivateWishCipherFromEnv({}, "memory");
    const reader = await createPrivateWishReaderFromEnv({}, "memory", async () => write);
    expect(await reader.decrypt(await write.encrypt("mem", HASH), HASH)).toBe("mem");
    const { cipher } = await makeTestCipher();
    expect(await reader.decrypt(await cipher.encrypt("mem", HASH), HASH)).toBeNull();
  });

  it("fails closed with PrivateWishKeyError and no env value in the message", async () => {
    const cipher = async () => createPrivateWishCipherFromEnv({}, "memory");
    const cases: Array<[Record<string, string>, "memory" | "supabase", string]> = [
      [{}, "supabase", "missing"],
      [{ PRIVATE_WISH_KEY: keyB64(2) }, "memory", "invalid"],
      [{ PRIVATE_WISH_KEY: keyB64(2), PRIVATE_WISH_KEY_ID: "k2026b", PRIVATE_WISH_RETIRED_KEYS: "bad" }, "supabase", "invalid"],
      [{ PRIVATE_WISH_RETIRED_KEYS: `k2026a:${keyB64(1)}` }, "memory", "invalid"],
      [{ PRIVATE_WISH_RETIRED_KEYS: `k2026a:${keyB64(1)}` }, "supabase", "invalid"],
      [{ PRIVATE_WISH_KEY: keyB64(2), PRIVATE_WISH_KEY_ID: "k2026b", PRIVATE_WISH_RETIRED_KEYS: `k2026b:${keyB64(1)}` }, "supabase", "invalid"],
    ];
    for (const [env, backend, reason] of cases) {
      const err = (await createPrivateWishReaderFromEnv(env, backend, cipher).catch((e: unknown) => e)) as PrivateWishKeyError;
      expect(err).toBeInstanceOf(PrivateWishKeyError);
      expect(err.reason).toBe(reason);
      expect(err.message).not.toContain(keyB64(1));
      expect(err.message).not.toContain(keyB64(2));
    }
  });

  it("getPrivateWishReader caches success, not failure", async () => {
    vi.resetModules();
    vi.stubEnv("PRIVATE_WISH_KEY", "");
    vi.stubEnv("PRIVATE_WISH_KEY_ID", "");
    vi.stubEnv("PRIVATE_WISH_RETIRED_KEYS", "");
    const first = await import("./privateWishCipher");
    expect(first.getPrivateWishReader("memory")).toBe(first.getPrivateWishReader("memory"));
    vi.resetModules();
    vi.stubEnv("PRIVATE_WISH_KEY", "AAAA");
    vi.stubEnv("PRIVATE_WISH_KEY_ID", "k2026a");
    const second = await import("./privateWishCipher");
    await expect(second.getPrivateWishReader("supabase")).rejects.toBeInstanceOf(second.PrivateWishKeyError);
    await expect(second.getPrivateWishReader("supabase")).rejects.toBeInstanceOf(second.PrivateWishKeyError);
    vi.stubEnv("PRIVATE_WISH_KEY", KEY_B64);
    await expect(second.getPrivateWishReader("supabase")).resolves.toHaveProperty("decrypt");
  });
});
