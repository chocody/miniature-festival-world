import {
  AES_256_KEY_BYTES,
  AES_GCM_IV_BYTES,
  AES_GCM_TAG_BYTES,
  AES_GCM_TAG_LENGTH_BITS,
  PRIVATE_WISH_AAD_LABEL,
  PRIVATE_WISH_AAD_SEPARATOR,
  PRIVATE_WISH_CIPHERTEXT_PATTERN,
  PRIVATE_WISH_ENVELOPE_VERSION,
  PRIVATE_WISH_EPHEMERAL_KEY_ID,
  PRIVATE_WISH_KEY_BASE64_PATTERN,
  PRIVATE_WISH_KEY_ENV,
  PRIVATE_WISH_KEY_ID_ENV,
  PRIVATE_WISH_KEY_ID_PATTERN,
} from "@/config/privateWish.config";
import { isOwnerTokenHash, type OwnerTokenHash } from "@/services/auth";
import { base64ToBytes, base64UrlToBytes, bytesToBase64Url } from "./base64url";
import type { CreationBackend } from "./creationRepository";
import type { BackendEnv } from "./creationRepositoryFactory"; // type-only
import type { EncryptedPrivateWish, PrivateWishCiphertext } from "./creationTypes";

export type FillRandomBytes = (bytes: Uint8Array<ArrayBuffer>) => void;

export interface PrivateWishCipher {
  readonly keyId: string;
  /** AES-256-GCM with a fresh random 12-byte IV; additional data binds key id and owner hash. Rejects TypeError on bad input. */
  encrypt(plaintext: string, ownerTokenHash: OwnerTokenHash): Promise<EncryptedPrivateWish>;
}

export type PrivateWishKeyLookup = (keyId: string) => CryptoKey | undefined;

export type PrivateWishKeyEnvResult =
  | { readonly ok: true; readonly keyId: string; readonly rawKey: Uint8Array<ArrayBuffer> }
  | { readonly ok: false; readonly reason: "absent" | "invalid" };

export class PrivateWishKeyError extends Error {
  readonly reason: "missing" | "invalid";
  constructor(reason: "missing" | "invalid") {
    super(`private wish key ${reason}`);
    this.name = "PrivateWishKeyError";
    this.reason = reason;
  }
}

const defaultFillRandom: FillRandomBytes = (bytes) => {
  globalThis.crypto.getRandomValues(bytes);
};

export function privateWishAdditionalData(keyId: string, ownerTokenHash: OwnerTokenHash): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(
    [PRIVATE_WISH_AAD_LABEL, PRIVATE_WISH_ENVELOPE_VERSION, keyId, ownerTokenHash].join(PRIVATE_WISH_AAD_SEPARATOR),
  ) as Uint8Array<ArrayBuffer>;
}

export async function importPrivateWishKey(rawKey: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  if (rawKey.byteLength !== AES_256_KEY_BYTES) throw new RangeError("private wish key must be 32 bytes");
  return globalThis.crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export function createPrivateWishCipher(options: {
  keyId: string;
  key: CryptoKey;
  fillRandom?: FillRandomBytes;
}): PrivateWishCipher {
  const { keyId, key } = options;
  const fillRandom = options.fillRandom ?? defaultFillRandom;
  if (!PRIVATE_WISH_KEY_ID_PATTERN.test(keyId)) throw new RangeError("invalid key id");
  return {
    keyId,
    async encrypt(plaintext: string, ownerTokenHash: OwnerTokenHash): Promise<EncryptedPrivateWish> {
      if (typeof plaintext !== "string") throw new TypeError("plaintext must be a string");
      if (!isOwnerTokenHash(ownerTokenHash)) throw new TypeError("invalid owner hash");
      const iv = new Uint8Array(AES_GCM_IV_BYTES);
      fillRandom(iv);
      const sealed = new Uint8Array(
        await globalThis.crypto.subtle.encrypt(
          {
            name: "AES-GCM",
            iv,
            additionalData: privateWishAdditionalData(keyId, ownerTokenHash),
            tagLength: AES_GCM_TAG_LENGTH_BITS,
          },
          key,
          new TextEncoder().encode(plaintext),
        ),
      );
      const envelope = [PRIVATE_WISH_ENVELOPE_VERSION, bytesToBase64Url(iv), bytesToBase64Url(sealed)].join(".");
      if (!PRIVATE_WISH_CIPHERTEXT_PATTERN.test(envelope)) throw new Error("envelope format"); // defensive
      return { ciphertext: envelope as PrivateWishCiphertext, keyId };
    },
  };
}

/** Returns null on ANY failure (bad envelope, unknown key id, wrong owner hash, tampering); never throws. */
export async function decryptPrivateWish(
  wish: EncryptedPrivateWish,
  ownerTokenHash: OwnerTokenHash,
  lookup: PrivateWishKeyLookup,
): Promise<string | null> {
  try {
    if (!PRIVATE_WISH_CIPHERTEXT_PATTERN.test(wish.ciphertext)) return null;
    const parts = wish.ciphertext.split(".");
    if (parts.length !== 3) return null;
    const key = lookup(wish.keyId);
    if (key === undefined) return null;
    const iv = base64UrlToBytes(parts[1] ?? "");
    const body = base64UrlToBytes(parts[2] ?? "");
    if (iv === null || body === null) return null;
    if (iv.byteLength !== AES_GCM_IV_BYTES || body.byteLength < AES_GCM_TAG_BYTES) return null;
    const plain = await globalThis.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: privateWishAdditionalData(wish.keyId, ownerTokenHash),
        tagLength: AES_GCM_TAG_LENGTH_BITS,
      },
      key,
      body,
    );
    return new TextDecoder("utf-8", { fatal: true }).decode(plain);
  } catch {
    return null;
  }
}

export function readPrivateWishKeyEnv(env: BackendEnv): PrivateWishKeyEnvResult {
  const key = env[PRIVATE_WISH_KEY_ENV]?.trim() ?? "";
  const id = env[PRIVATE_WISH_KEY_ID_ENV]?.trim() ?? "";
  if (key === "" && id === "") return { ok: false, reason: "absent" };
  if (key === "" || id === "") return { ok: false, reason: "invalid" };
  if (!PRIVATE_WISH_KEY_ID_PATTERN.test(id) || id === PRIVATE_WISH_EPHEMERAL_KEY_ID) return { ok: false, reason: "invalid" };
  const rawKey = base64ToBytes(key, PRIVATE_WISH_KEY_BASE64_PATTERN);
  if (rawKey === null || rawKey.byteLength !== AES_256_KEY_BYTES) return { ok: false, reason: "invalid" };
  return { ok: true, keyId: id, rawKey };
}

export async function createPrivateWishCipherFromEnv(
  env: BackendEnv,
  backend: CreationBackend,
  fillRandom?: FillRandomBytes,
): Promise<PrivateWishCipher> {
  const r = readPrivateWishKeyEnv(env);
  if (r.ok) {
    return createPrivateWishCipher({ keyId: r.keyId, key: await importPrivateWishKey(r.rawKey), fillRandom });
  }
  if (r.reason === "absent" && backend === "memory") {
    const raw = new Uint8Array(AES_256_KEY_BYTES);
    (fillRandom ?? defaultFillRandom)(raw);
    return createPrivateWishCipher({
      keyId: PRIVATE_WISH_EPHEMERAL_KEY_ID,
      key: await importPrivateWishKey(raw),
      fillRandom,
    });
  }
  throw new PrivateWishKeyError(r.reason === "absent" ? "missing" : "invalid");
}

let cached: Promise<PrivateWishCipher> | null = null;

/** Process singleton; reads process.env only here. A failure is not cached. */
export function getPrivateWishCipher(backend: CreationBackend): Promise<PrivateWishCipher> {
  if (cached === null) {
    const pending = createPrivateWishCipherFromEnv(process.env, backend);
    cached = pending;
    pending.catch(() => {
      if (cached === pending) cached = null;
    });
  }
  return cached;
}
