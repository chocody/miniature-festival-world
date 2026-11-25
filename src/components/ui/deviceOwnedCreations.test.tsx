import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MyCreationEntry, MyCreationsVault } from "@/services/auth/myCreationsVault";
import { MY_CREATIONS_STORAGE_KEY } from "@/config/ownership.config";
import { isOwnedCreation } from "@/services/auth/ownedCreationHint";
import { deviceListsCreation, installDeviceOwnedCreationHint } from "./deviceOwnedCreations";

const ID = "950118ce-7d93-4cb6-bd84-44d91c5de9e3";
const NOW = Date.parse("2026-11-25T00:00:00.000Z");
const entry = (id: string): MyCreationEntry => ({
  id,
  eventId: "loy_krathong",
  zoneId: 1,
  createdAt: "2026-11-24T12:00:00.000Z",
  expiresAt: "2026-12-24T17:00:00.000Z",
});

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe("deviceListsCreation", () => {
  it("is true for a listed id only", () => {
    const vault: Pick<MyCreationsVault, "list"> = { list: (eventId) => (eventId === "loy_krathong" ? [entry(ID)] : []) };
    expect(deviceListsCreation(ID, vault, NOW)).toBe(true);
    expect(deviceListsCreation("00000000-0000-4000-8000-000000000000", vault, NOW)).toBe(false);
  });
  it("a throwing list is false", () => {
    const vault: Pick<MyCreationsVault, "list"> = {
      list: () => {
        throw new Error("x");
      },
    };
    expect(deviceListsCreation(ID, vault, NOW)).toBe(false);
  });
});

describe("installDeviceOwnedCreationHint", () => {
  it("follows the default vault and installs once", () => {
    installDeviceOwnedCreationHint();
    installDeviceOwnedCreationHint();
    expect(isOwnedCreation(ID)).toBe(false);
    window.localStorage.setItem(MY_CREATIONS_STORAGE_KEY, JSON.stringify([entry(ID)]));
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    try {
      expect(isOwnedCreation(ID)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
