import { OWNER_TOKEN_HASH_COMPARE_PLACEHOLDER, OWNER_TOKEN_HASH_HEX_LENGTH } from "@/config/ownership.config";
import { isOwnerTokenHash, type OwnerTokenHash } from "./ownerTokenHash";

/**
 * Owner proof (open question 1): true only when `stored` is a well-formed hash equal to `presented`.
 * Constant time in the hash contents: always XORs all OWNER_TOKEN_HASH_HEX_LENGTH characters, no early exit, no `===` on the hashes.
 * A missing stored hash is compared against a placeholder and then rejected, so unknown ids and wrong tokens take the same path.
 */
export function ownerTokenHashesMatch(presented: OwnerTokenHash, stored: OwnerTokenHash | null): boolean {
  const presentedOk = isOwnerTokenHash(presented);
  const storedOk = stored !== null && isOwnerTokenHash(stored);
  const left: string = presentedOk ? presented : OWNER_TOKEN_HASH_COMPARE_PLACEHOLDER;
  const right: string = storedOk ? stored : OWNER_TOKEN_HASH_COMPARE_PLACEHOLDER;
  let diff = 0;
  for (let i = 0; i < OWNER_TOKEN_HASH_HEX_LENGTH; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return presentedOk && storedOk && diff === 0;
}
