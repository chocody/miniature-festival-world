/**
 * Client-only anonymous owner identity (DeviceOwnerToken), kept in LocalStorage.
 *
 * Transport rule: send the raw token only over HTTPS to the ownership endpoints, in a POST JSON body or the
 * Authorization header, never in a URL/query string. Never log it, never put it in a store fed by a public
 * endpoint, never hash it on the client.
 */
import {
  DEVICE_OWNER_TOKEN_BYTES,
  DEVICE_OWNER_TOKEN_PATTERN,
  DEVICE_OWNER_TOKEN_STORAGE_KEY,
} from "@/config/ownership.config";

/** Raw anonymous owner secret. Lives only in this device's LocalStorage; never in a URL, log or public payload. */
export type DeviceOwnerToken = string & { readonly __brand: "DeviceOwnerToken" };

/** Fills `bytes` with random values. Injected in tests; the default is crypto.getRandomValues. */
export type FillRandom = (bytes: Uint8Array) => void;

export interface DeviceOwnerTokenResult {
  token: DeviceOwnerToken;
  /** false when LocalStorage is unavailable or the write failed: the token lives only until the page unloads. */
  persisted: boolean;
}

export interface DeviceOwnerVault {
  /** Stored valid token, else the in-memory fallback token, else null. Never writes. */
  read(): DeviceOwnerToken | null;
  /** Returns the existing token or creates, persists and returns a new one. */
  getOrCreate(): DeviceOwnerTokenResult;
}

export interface DeviceOwnerVaultOptions {
  /** null = no usable LocalStorage (SSR, disabled storage, privacy mode). */
  storage: Storage | null;
  /** Token generator; defaults to generateDeviceOwnerToken. */
  generate?: () => DeviceOwnerToken;
}

export function isDeviceOwnerToken(value: unknown): value is DeviceOwnerToken {
  return typeof value === "string" && DEVICE_OWNER_TOKEN_PATTERN.test(value);
}

const defaultFillRandom: FillRandom = (bytes) => {
  const c = globalThis.crypto;
  if (!c || typeof c.getRandomValues !== "function") {
    throw new Error("Secure random source (crypto.getRandomValues) is unavailable");
  }
  c.getRandomValues(bytes); // call as a method: Web Crypto needs `this === crypto`
};

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateDeviceOwnerToken(fillRandom: FillRandom = defaultFillRandom): DeviceOwnerToken {
  const bytes = new Uint8Array(DEVICE_OWNER_TOKEN_BYTES);
  fillRandom(bytes);
  return toBase64Url(bytes) as DeviceOwnerToken;
}

export function getBrowserLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null; // the getter itself throws SecurityError when storage is blocked
  } catch {
    return null;
  }
}

export function createDeviceOwnerVault({
  storage,
  generate = () => generateDeviceOwnerToken(),
}: DeviceOwnerVaultOptions): DeviceOwnerVault {
  /** Set only when persisting failed. */
  let memoryToken: DeviceOwnerToken | null = null;

  function readStored(): DeviceOwnerToken | null {
    if (storage === null) return null;
    try {
      const raw = storage.getItem(DEVICE_OWNER_TOKEN_STORAGE_KEY);
      return isDeviceOwnerToken(raw) ? raw : null;
    } catch {
      return null;
    }
  }

  return {
    read() {
      return readStored() ?? memoryToken;
    },
    getOrCreate() {
      const stored = readStored();
      if (stored) {
        memoryToken = null;
        return { token: stored, persisted: true };
      }
      const token = memoryToken ?? generate();
      if (storage === null) {
        memoryToken = token;
        return { token, persisted: false };
      }
      try {
        storage.setItem(DEVICE_OWNER_TOKEN_STORAGE_KEY, token);
      } catch {
        memoryToken = token;
        return { token, persisted: false };
      }
      const readBack = readStored();
      if (readBack === null) {
        memoryToken = token;
        return { token, persisted: false };
      }
      memoryToken = null;
      return { token: readBack, persisted: true };
    },
  };
}

let browserVault: DeviceOwnerVault | null = null;

/** Lazily created singleton for app code. Throws on the server: it must never create or hold a token. */
export function getDeviceOwnerVault(): DeviceOwnerVault {
  if (typeof window === "undefined") {
    throw new Error("DeviceOwnerToken is client-only; the server must never create or hold one");
  }
  browserVault ??= createDeviceOwnerVault({ storage: getBrowserLocalStorage() });
  return browserVault;
}
