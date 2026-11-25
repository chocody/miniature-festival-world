import {
  AES_256_KEY_BYTES,
  AES_GCM_IV_BYTES,
  AES_GCM_TAG_BYTES,
  AES_GCM_TAG_LENGTH_BITS,
  PRIVATE_CIPHER_AAD_LABELS,
  PRIVATE_CIPHER_FIELDS,
  PRIVATE_WISH_AAD_SEPARATOR,
  PRIVATE_WISH_CIPHERTEXT_PATTERN,
  PRIVATE_WISH_ENVELOPE_VERSION,
  PRIVATE_WISH_EPHEMERAL_KEY_ID,
  PRIVATE_WISH_KEY_BASE64_PATTERN,
  PRIVATE_WISH_KEY_ENV,
  PRIVATE_WISH_KEY_ID_ENV,
  PRIVATE_WISH_KEY_ID_PATTERN,
  PRIVATE_WISH_RETIRED_KEY_ID_SEPARATOR,
  PRIVATE_WISH_RETIRED_KEYS_ENV,
  PRIVATE_WISH_RETIRED_KEYS_MAX,
  PRIVATE_WISH_RETIRED_KEYS_SEPARATOR,
  type PrivateCipherField,
} from "@/config/privateWish.config";
import { isOwnerTokenHash, type OwnerTokenHash } from "@/services/auth";
import { base64ToBytes, base64UrlToBytes, bytesToBase64Url } from "./base64url";
import type { CreationBackend } from "./creationRepository";
import type { BackendEnv } from "./creationRepositoryFactory"; // type-only
import type { EncryptedPrivateWish, PrivateWishCiphertext } from "./creationTypes";

export type FillRandomBytes = (bytes: Uint8Array<ArrayBuffer>) => void;

export interface PrivateWishCipher {
  readonly keyId: string;
  /**
   * AES-256-GCM with a fresh random 12-byte IV; additional data binds field label, key id and owner hash.
   * `field` defaults to "wish" (MFW-62 adds "displayName"). Rejects TypeError on bad input, including an unknown field.
   */
  encrypt(plaintext: string, ownerTokenHash: OwnerTokenHash, field?: PrivateCipherField): Promise<EncryptedPrivateWish>;
  /** Decrypts with THIS cipher's key only (wish.keyId must equal keyId); null on any failure (incl. an unknown field), never throws. */
  decrypt(wish: EncryptedPrivateWish, ownerTokenHash: OwnerTokenHash, field?: PrivateCipherField): Promise<string | null>;
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

function isPrivateCipherField(value: unknown): value is PrivateCipherField {
  return typeof value === "string" && (PRIVATE_CIPHER_FIELDS as readonly string[]).includes(value);
}

/** "<label>|<version>|<keyId>|<owner hash>"; the label depends on the field ("wish" keeps the pre-MFW-62 bytes). */
export function privateWishAdditionalData(
  keyId: string,
  ownerTokenHash: OwnerTokenHash,
  field: PrivateCipherField = "wish",
): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(
    [PRIVATE_CIPHER_AAD_LABELS[field], PRIVATE_WISH_ENVELOPE_VERSION, keyId, ownerTokenHash].join(PRIVATE_WISH_AAD_SEPARATOR),
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
    async encrypt(
      plaintext: string,
      ownerTokenHash: OwnerTokenHash,
      field: PrivateCipherField = "wish",
    ): Promise<EncryptedPrivateWish> {
      if (typeof plaintext !== "string") throw new TypeError("plaintext must be a string");
      if (!isOwnerTokenHash(ownerTokenHash)) throw new TypeError("invalid owner hash");
      if (!isPrivateCipherField(field)) throw new TypeError("unknown cipher field");
      const iv = new Uint8Array(AES_GCM_IV_BYTES);
      fillRandom(iv);
      const sealed = new Uint8Array(
        await globalThis.crypto.subtle.encrypt(
          {
            name: "AES-GCM",
            iv,
            additionalData: privateWishAdditionalData(keyId, ownerTokenHash, field),
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
    decrypt: (wish, ownerTokenHash, field = "wish") =>
      decryptPrivateWish(wish, ownerTokenHash, (id) => (id === keyId ? key : undefined), field),
  };
}

/** Returns null on ANY failure (bad envelope, unknown key id, wrong owner hash, wrong or unknown field, tampering); never throws. */
export async function decryptPrivateWish(
  wish: EncryptedPrivateWish,
  ownerTokenHash: OwnerTokenHash,
  lookup: PrivateWishKeyLookup,
  field: PrivateCipherField = "wish",
): Promise<string | null> {
  try {
    if (!isPrivateCipherField(field)) return null;
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
        additionalData: privateWishAdditionalData(wish.keyId, ownerTokenHash, field),
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

export interface RetiredPrivateWishKey {
  readonly keyId: string;
  readonly rawKey: Uint8Array<ArrayBuffer>;
}
export type RetiredPrivateWishKeysResult =
  | { readonly ok: true; readonly keys: readonly RetiredPrivateWishKey[] }
  | { readonly ok: false };

/** Parses PRIVATE_WISH_RETIRED_KEYS. Unset/blank → ok with []. Any malformed entry, duplicate id, the ephemeral id or > MAX entries → { ok: false }. */
export function readRetiredPrivateWishKeysEnv(env: BackendEnv): RetiredPrivateWishKeysResult {
  const raw = env[PRIVATE_WISH_RETIRED_KEYS_ENV]?.trim() ?? "";
  if (raw === "") return { ok: true, keys: [] };
  const entries = raw.split(PRIVATE_WISH_RETIRED_KEYS_SEPARATOR);
  if (entries.length > PRIVATE_WISH_RETIRED_KEYS_MAX) return { ok: false };
  const seen = new Set<string>();
  const keys: RetiredPrivateWishKey[] = [];
  for (const entry of entries) {
    const parts = entry.trim().split(PRIVATE_WISH_RETIRED_KEY_ID_SEPARATOR);
    if (parts.length !== 2) return { ok: false };
    const keyId = parts[0] ?? "";
    const rawKey = base64ToBytes(parts[1] ?? "", PRIVATE_WISH_KEY_BASE64_PATTERN);
    if (!PRIVATE_WISH_KEY_ID_PATTERN.test(keyId) || keyId === PRIVATE_WISH_EPHEMERAL_KEY_ID || seen.has(keyId)) return { ok: false };
    if (rawKey === null || rawKey.byteLength !== AES_256_KEY_BYTES) return { ok: false };
    seen.add(keyId);
    keys.push({ keyId, rawKey });
  }
  return { ok: true, keys };
}

export interface PrivateWishReader {
  /** null on ANY failure (unknown key id, wrong owner hash, tampering, the ephemeral id outside the memory backend); never throws. */
  decrypt(wish: EncryptedPrivateWish, ownerTokenHash: OwnerTokenHash, field?: PrivateCipherField): Promise<string | null>;
}

/**
 * Keyring for the owner read path (MFW-31).
 * - Current env key set and valid → current key + retired keys; the ephemeral id is never looked up.
 * - Retired list invalid, current key half-set/invalid, retired keys without a current key, or a retired id equal to the current id → PrivateWishKeyError("invalid").
 * - No key env at all: memory backend → decrypts only with the process's ephemeral write cipher (getWriteCipher("memory")); supabase → PrivateWishKeyError("missing").
 */
export async function createPrivateWishReaderFromEnv(
  env: BackendEnv,
  backend: CreationBackend,
  getWriteCipher: (backend: CreationBackend) => Promise<PrivateWishCipher>,
): Promise<PrivateWishReader> {
  const current = readPrivateWishKeyEnv(env);
  const retired = readRetiredPrivateWishKeysEnv(env);
  if (!retired.ok) throw new PrivateWishKeyError("invalid");
  if (current.ok) {
    const keys = new Map<string, CryptoKey>();
    keys.set(current.keyId, await importPrivateWishKey(current.rawKey));
    for (const r of retired.keys) {
      if (keys.has(r.keyId)) throw new PrivateWishKeyError("invalid");
      keys.set(r.keyId, await importPrivateWishKey(r.rawKey));
    }
    const lookup: PrivateWishKeyLookup = (keyId) => (keyId === PRIVATE_WISH_EPHEMERAL_KEY_ID ? undefined : keys.get(keyId));
    return { decrypt: (wish, ownerTokenHash, field) => decryptPrivateWish(wish, ownerTokenHash, lookup, field) };
  }
  if (current.reason === "invalid" || retired.keys.length > 0) throw new PrivateWishKeyError("invalid");
  if (backend !== "memory") throw new PrivateWishKeyError("missing");
  const cipher = await getWriteCipher("memory");
  if (cipher.keyId !== PRIVATE_WISH_EPHEMERAL_KEY_ID) throw new PrivateWishKeyError("invalid"); // defensive
  return {
    decrypt: (wish, ownerTokenHash, field) =>
      wish.keyId === PRIVATE_WISH_EPHEMERAL_KEY_ID ? cipher.decrypt(wish, ownerTokenHash, field) : Promise.resolve(null),
  };
}

let cachedReader: Promise<PrivateWishReader> | null = null;

/** Process singleton for the owner read route; reads process.env only here. A failure is not cached. */
export function getPrivateWishReader(backend: CreationBackend): Promise<PrivateWishReader> {
  if (cachedReader === null) {
    const pending = createPrivateWishReaderFromEnv(process.env, backend, getPrivateWishCipher);
    cachedReader = pending;
    pending.catch(() => {
      if (cachedReader === pending) cachedReader = null;
    });
  }
  return cachedReader;
}
