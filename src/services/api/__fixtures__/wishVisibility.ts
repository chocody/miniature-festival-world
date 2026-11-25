import { hashOwnerToken } from "@/services/auth";
import { CREATE_NOW_MS, OWNER_TOKEN_FIXTURE, makeTestCipher } from "./createCreation";
import { makeNewCreation } from "./creations";
import { DAY_MS, OTHER_OWNER_TOKEN_FIXTURE, SECRET_WISH_FIXTURE } from "./ownerWish";
import { createInMemoryCreationRepository } from "../inMemoryCreationRepository";
import { decryptPrivateWish, type PrivateWishReader } from "../privateWishCipher";
import type { WishVisibilitySwitchDeps } from "../wishVisibilitySwitch";

export { OWNER_TOKEN_FIXTURE, OTHER_OWNER_TOKEN_FIXTURE, SECRET_WISH_FIXTURE, DAY_MS };
export const NAME_FIXTURE = "น้องมะลิ";
export const PUBLIC_WISH_FIXTURE = "ขอให้ทุกคนมีความสุข";
export const WISH_VISIBILITY_URL = "http://localhost/api/wish-visibility";

export function makeWishVisibilityRequest(
  body: unknown,
  init: { contentType?: string; rawBody?: string; contentLength?: string; query?: string } = {},
): Request {
  const headers: Record<string, string> = { "content-type": init.contentType ?? "application/json" };
  if (init.contentLength !== undefined) headers["content-length"] = init.contentLength;
  return new Request(WISH_VISIBILITY_URL + (init.query ?? ""), {
    method: "POST",
    headers,
    body: init.rawBody ?? JSON.stringify(body),
  });
}

/** In-memory repository with three creations of OWNER_TOKEN_FIXTURE: private + name, private without name, public + name. */
export async function seedWishSwitchRepository(nowMs: number = CREATE_NOW_MS) {
  let t = nowMs;
  const repo = createInMemoryCreationRepository({ now: () => t });
  const { cipher, lookup } = await makeTestCipher();
  const ownerHash = await hashOwnerToken(OWNER_TOKEN_FIXTURE);
  const expiresAt = new Date(t + DAY_MS);
  const privateNamed = await repo.insertCreation(
    makeNewCreation({
      publicWishText: null,
      ownerTokenHash: ownerHash,
      privateWish: await cipher.encrypt(SECRET_WISH_FIXTURE, ownerHash),
      privateDisplayName: await cipher.encrypt(NAME_FIXTURE, ownerHash, "displayName"),
      expiresAt,
    }),
  );
  const privateUnnamed = await repo.insertCreation(
    makeNewCreation({
      publicWishText: null,
      ownerTokenHash: ownerHash,
      privateWish: await cipher.encrypt(SECRET_WISH_FIXTURE, ownerHash),
      expiresAt,
    }),
  );
  const publicNamed = await repo.insertCreation(
    makeNewCreation({
      publicWishText: PUBLIC_WISH_FIXTURE,
      displayName: NAME_FIXTURE,
      ownerTokenHash: ownerHash,
      privateWish: null,
      expiresAt,
    }),
  );
  const reader: PrivateWishReader = { decrypt: (w, h, field) => decryptPrivateWish(w, h, lookup, field) };
  const deps: WishVisibilitySwitchDeps = {
    getRepository: () => repo,
    getWishReader: async () => reader,
    getCipher: async () => cipher,
    isProduction: false,
  };
  return {
    repo,
    setNow: (ms: number) => {
      t = ms;
    },
    ownerHash,
    cipher,
    reader,
    lookup,
    privateNamedId: privateNamed.id,
    privateUnnamedId: privateUnnamed.id,
    publicNamedId: publicNamed.id,
    deps,
  };
}
