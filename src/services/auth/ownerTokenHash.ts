import { OWNER_TOKEN_HASH_PATTERN } from "@/config/ownership.config";
import { isDeviceOwnerToken, type DeviceOwnerToken } from "./deviceOwnerToken";

/** SHA-256(DeviceOwnerToken) as 64 lowercase hex chars — the only form the server stores (owner_token_hash). */
export type OwnerTokenHash = string & { readonly __brand: "OwnerTokenHash" };

/**
 * SERVER USE ONLY (open question 1): the client sends the raw token; the ownership endpoint hashes it.
 * Rejects (TypeError) when `token` is not a well-formed DeviceOwnerToken. The message never echoes the input.
 */
export async function hashOwnerToken(token: DeviceOwnerToken): Promise<OwnerTokenHash> {
  if (!isDeviceOwnerToken(token)) throw new TypeError("Invalid DeviceOwnerToken format");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("") as OwnerTokenHash;
}

export function isOwnerTokenHash(value: unknown): value is OwnerTokenHash {
  return typeof value === "string" && OWNER_TOKEN_HASH_PATTERN.test(value);
}
