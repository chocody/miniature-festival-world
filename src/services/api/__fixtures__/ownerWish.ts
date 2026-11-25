import type { DeviceOwnerToken } from "@/services/auth";
import { hashOwnerToken } from "@/services/auth";
import { CREATE_NOW_MS, OWNER_TOKEN_FIXTURE, makeTestCipher } from "./createCreation";
import { makeNewCreation } from "./creations";
import { createInMemoryCreationRepository } from "../inMemoryCreationRepository";
import { decryptPrivateWish, type PrivateWishReader } from "../privateWishCipher";

export const DAY_MS = 86_400_000;
/** Valid DeviceOwnerToken shape that differs from OWNER_TOKEN_FIXTURE. */
export const OTHER_OWNER_TOKEN_FIXTURE = ("OtHeRdEvIcEtOkEn" + "y".repeat(26) + "A") as DeviceOwnerToken;
export const SECRET_WISH_FIXTURE = "ความลับของฉันไม่บอกใคร";

export function makeOwnerWishRequest(
  body: unknown,
  init: { contentType?: string; rawBody?: string; contentLength?: string; query?: string } = {},
): Request {
  const headers: Record<string, string> = { "content-type": init.contentType ?? "application/json" };
  if (init.contentLength !== undefined) headers["content-length"] = init.contentLength;
  return new Request("http://localhost/api/private-wish" + (init.query ?? ""), {
    method: "POST",
    headers,
    body: init.rawBody ?? JSON.stringify(body),
  });
}

export async function seedOwnerWishRepository(nowMs: number = CREATE_NOW_MS) {
  let t = nowMs;
  const repo = createInMemoryCreationRepository({ now: () => t });
  const { cipher, lookup } = await makeTestCipher();
  const ownerHash = await hashOwnerToken(OWNER_TOKEN_FIXTURE);
  const priv = await repo.insertCreation(
    makeNewCreation({
      publicWishText: null,
      ownerTokenHash: ownerHash,
      privateWish: await cipher.encrypt(SECRET_WISH_FIXTURE, ownerHash),
      expiresAt: new Date(t + DAY_MS),
    }),
  );
  const pub = await repo.insertCreation(
    makeNewCreation({
      publicWishText: "ขอให้ทุกคนมีความสุข",
      ownerTokenHash: ownerHash,
      privateWish: null,
      expiresAt: new Date(t + DAY_MS),
    }),
  );
  const reader: PrivateWishReader = { decrypt: (w, h) => decryptPrivateWish(w, h, lookup) };
  return {
    repo,
    setNow: (ms: number) => {
      t = ms;
    },
    ownerHash,
    privateId: priv.id,
    publicId: pub.id,
    reader,
    cipher,
    lookup,
  };
}
