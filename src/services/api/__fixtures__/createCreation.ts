import { LOY_KRATHONG_RIVER_LANE_ID } from "@/config/events/loyKrathong.river.config";
import { AES_256_KEY_BYTES } from "@/config/privateWish.config";
import { RIVER_DRIFT_SPEED_FACTOR } from "@/config/riverFlow.config";
import { serializeKrathongAppearance, DEFAULT_KRATHONG_APPEARANCE } from "@/core/customization/krathongAppearance";
import type { DeviceOwnerToken } from "@/services/auth";
import type { CreationRepository } from "../creationRepository";
import type { GuardedNewCreation } from "../creationTypes";
import {
  createPrivateWishCipher,
  importPrivateWishKey,
  type FillRandomBytes,
  type PrivateWishCipher,
  type PrivateWishKeyLookup,
} from "../privateWishCipher";

/** Valid DeviceOwnerToken shape with a searchable marker (43 chars, last char from the canonical set). */
export const OWNER_TOKEN_FIXTURE = ("SeCrEtOwNeRtOkEn" + "x".repeat(26) + "w") as DeviceOwnerToken;
export const CREATE_NOW_MS = Date.parse("2026-11-24T12:00:00.000Z"); // before the Loy Krathong expiry 2026-12-24T17:00Z
export const TEST_KEY_ID = "test-key-1";
export const TEST_KEY_BYTES = (): Uint8Array<ArrayBuffer> => new Uint8Array(AES_256_KEY_BYTES).fill(7);

export async function makeTestCipher(
  fillRandom?: FillRandomBytes,
): Promise<{ cipher: PrivateWishCipher; lookup: PrivateWishKeyLookup }> {
  const key = await importPrivateWishKey(TEST_KEY_BYTES());
  return {
    cipher: createPrivateWishCipher({ keyId: TEST_KEY_ID, key, fillRandom }),
    lookup: (keyId) => (keyId === TEST_KEY_ID ? key : undefined),
  };
}

export function defaultAppearanceJson(): Record<string, unknown> {
  return structuredClone(serializeKrathongAppearance(DEFAULT_KRATHONG_APPEARANCE)) as unknown as Record<string, unknown>;
}

export function riverCoord(spawnProgress: number, lateralOffset = 0): Record<string, unknown> {
  return {
    mode: "SPLINE_PATH",
    laneId: LOY_KRATHONG_RIVER_LANE_ID,
    spawnProgress,
    speedFactor: RIVER_DRIFT_SPEED_FACTOR,
    lateralOffset,
  };
}

export function makeCreateBody(
  overrides: Record<string, unknown> = {},
  omit: readonly string[] = [],
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    eventId: "loy_krathong",
    appearance: defaultAppearanceJson(),
    coord: riverCoord(0.4),
    wishText: "ขอให้ทุกคนมีความสุข",
    wishVisibility: "public",
    ownerToken: OWNER_TOKEN_FIXTURE,
    ...overrides,
  };
  for (const key of omit) delete body[key];
  return body;
}

export function makeCreateRequest(
  body: unknown,
  init: { contentType?: string; rawBody?: string; contentLength?: string } = {},
): Request {
  const headers: Record<string, string> = { "content-type": init.contentType ?? "application/json" };
  if (init.contentLength !== undefined) headers["content-length"] = init.contentLength;
  return new Request("http://localhost/api/creations", {
    method: "POST",
    headers,
    body: init.rawBody ?? JSON.stringify(body),
  });
}

/** Wraps a repository, recording a deep copy of every guarded insert input. Explicit delegation, no spread. */
export function recordingRepository(inner: CreationRepository): { repo: CreationRepository; inserts: GuardedNewCreation[] } {
  const inserts: GuardedNewCreation[] = [];
  const repo: CreationRepository = {
    backend: inner.backend,
    listPublicZone: (q) => inner.listPublicZone(q),
    highestVisibleZoneId: (e) => inner.highestVisibleZoneId(e),
    insertCreation: (i) => inner.insertCreation(i),
    reportCreation: (id) => inner.reportCreation(id),
    zoneItemCounts: (e) => inner.zoneItemCounts(e),
    listZoneOccupants: (q) => inner.listZoneOccupants(q),
    insertCreationGuarded: (input) => {
      inserts.push(structuredClone(input));
      return inner.insertCreationGuarded(input);
    },
  };
  return { repo, inserts };
}

/** The first `parties` zoneItemCounts calls wait until `parties` calls have arrived, then all resolve; later calls pass through. */
export function barrierOnZoneCounts(inner: CreationRepository, parties: number): CreationRepository {
  let arrived = 0;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    backend: inner.backend,
    listPublicZone: (q) => inner.listPublicZone(q),
    highestVisibleZoneId: (e) => inner.highestVisibleZoneId(e),
    insertCreation: (i) => inner.insertCreation(i),
    reportCreation: (id) => inner.reportCreation(id),
    listZoneOccupants: (q) => inner.listZoneOccupants(q),
    insertCreationGuarded: (input) => inner.insertCreationGuarded(input),
    zoneItemCounts: async (e) => {
      const result = await inner.zoneItemCounts(e);
      if (arrived < parties) {
        arrived += 1;
        if (arrived === parties) release();
        await gate;
      }
      return result;
    },
  };
}
