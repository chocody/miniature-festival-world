// @vitest-environment node
import { describe, expect, it } from "vitest";
import { UUID_PATTERN } from "@/config/database.config";
import {
  MY_CREATION_ENTRY_KEYS,
  MY_CREATION_ID_PATTERN,
  MY_CREATIONS_COPY,
  MY_CREATIONS_MAX_ENTRIES,
  MY_CREATIONS_MONTHS,
} from "@/config/myCreations.config";
import { DEVICE_OWNER_TOKEN_STORAGE_KEY, MY_CREATIONS_STORAGE_KEY } from "@/config/ownership.config";
import { PUBLIC_CREATION_KEYS } from "@/services/api/creationTypes";

describe("myCreations config", () => {
  it("id pattern equals UUID_PATTERN", () => {
    expect(MY_CREATION_ID_PATTERN.source).toBe(UUID_PATTERN.source);
  });
  it("storage key is versioned and distinct from the token key", () => {
    expect(MY_CREATIONS_STORAGE_KEY.startsWith("mfw:")).toBe(true);
    expect(MY_CREATIONS_STORAGE_KEY).not.toBe(DEVICE_OWNER_TOKEN_STORAGE_KEY);
    expect(MY_CREATIONS_STORAGE_KEY.endsWith(":v1")).toBe(true);
  });
  it("entry keys are public fields only", () => {
    expect([...MY_CREATION_ENTRY_KEYS]).toEqual(["id", "eventId", "zoneId", "createdAt", "expiresAt"]);
    for (const key of MY_CREATION_ENTRY_KEYS) expect(PUBLIC_CREATION_KEYS).toContain(key);
  });
  it("max entries is a positive safe integer", () => {
    expect(Number.isSafeInteger(MY_CREATIONS_MAX_ENTRIES) && MY_CREATIONS_MAX_ENTRIES >= 1).toBe(true);
  });
  it("copy keeps the status lines and drops the old panel text", () => {
    expect(MY_CREATIONS_COPY.openButton).toBe("ค้นหาของฉัน");
    expect(MY_CREATIONS_COPY.found(2)).toContain("คุ้งน้ำที่ 2");
    expect(Object.keys(MY_CREATIONS_COPY).sort()).toEqual(["failed", "found", "notFound", "openButton", "searching", "title"]);
  });
  it("month table: 12 upper-case English abbreviations, frozen", () => {
    expect(MY_CREATIONS_MONTHS).toHaveLength(12);
    for (const m of MY_CREATIONS_MONTHS) expect(m).toMatch(/^[A-Z]{3}$/);
    expect(Object.isFrozen(MY_CREATIONS_MONTHS)).toBe(true);
  });
});
