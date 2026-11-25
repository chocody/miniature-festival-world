import { afterEach, describe, expect, it, vi } from "vitest";
import { MY_CREATION_ENTRY_KEYS } from "@/config/myCreations.config";
import { MY_CREATIONS_STORAGE_KEY } from "@/config/ownership.config";
import type { PublicCreation } from "@/services/api/creationTypes";
import {
  createMyCreationsVault,
  getMyCreationsVault,
  installMyCreationsRecorder,
  parseMyCreationEntries,
} from "./myCreationsVault";

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(index: number) {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
}

const NOW = Date.parse("2026-11-25T13:30:00.000Z");
const KEY = MY_CREATIONS_STORAGE_KEY;
const creation = (i: number, overrides: Record<string, unknown> = {}): PublicCreation =>
  ({
    id: `00000000-0000-4000-8000-00000000000${i}`,
    eventId: "loy_krathong",
    zoneId: 2,
    createdAt: new Date(NOW - i * 60_000).toISOString(),
    expiresAt: "2099-01-01T00:00:00.000Z",
    appearance: { base: "banana" },
    coord: { mode: "SPLINE_PATH", laneId: "main", spawnProgress: 0.1, speedFactor: 0.008, lateralOffset: 0 },
    publicWishText: "ขอให้มีความสุข",
    ...overrides,
  }) as unknown as PublicCreation;
const stored = (storage: Storage) => JSON.parse(storage.getItem(KEY)!) as Record<string, unknown>[];

afterEach(() => window.localStorage.clear());

describe("myCreationsVault", () => {
  it("record then list, newest first", () => {
    const storage = new MemoryStorage();
    const vault = createMyCreationsVault({ storage });
    for (const i of [2, 1, 3]) vault.record(creation(i), NOW);
    const want = [1, 2, 3].map((i) => creation(i).id);
    expect(vault.list("loy_krathong", NOW).map((e) => e.id)).toEqual(want);
    expect(stored(storage).map((e) => e.id)).toEqual(want);
  });

  it("stores only the five allowlisted keys", () => {
    const storage = new MemoryStorage();
    const vault = createMyCreationsVault({ storage });
    const token = "x".repeat(43);
    vault.record({ ...creation(1), ownerToken: token, privateWishText: "secret" } as unknown as PublicCreation, NOW);
    for (const e of stored(storage)) expect(Object.keys(e)).toEqual([...MY_CREATION_ENTRY_KEYS]);
    const raw = storage.getItem(KEY)!;
    for (const bad of ["secret", token, "coord", "appearance", "Wish"]) expect(raw).not.toContain(bad);
  });

  it("rejects invalid sources", () => {
    const storage = new MemoryStorage();
    const vault = createMyCreationsVault({ storage });
    const listener = vi.fn();
    vault.subscribe(listener);
    const bad: Record<string, unknown>[] = [
      { id: "abc" },
      { id: creation(1).id.toUpperCase().replace(/^0+/, "A0") },
      { zoneId: 0 },
      { zoneId: 1.5 },
      { zoneId: "2" },
      { eventId: "nope" },
      { createdAt: "nope" },
      { expiresAt: "nope" },
      { expiresAt: creation(1).createdAt },
      { createdAt: "2020-01-01T00:00:00.000Z", expiresAt: "2020-02-01T00:00:00.000Z" },
    ];
    for (const o of bad) expect(vault.record(creation(1, o), NOW)).toEqual({ recorded: false });
    expect(vault.record(creation(1, { id: "0000000A-0000-4000-8000-000000000001" }), NOW)).toEqual({ recorded: false });
    expect(storage.length).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it("dedupes by id", () => {
    const vault = createMyCreationsVault({ storage: new MemoryStorage() });
    vault.record(creation(1), NOW);
    vault.record(creation(1), NOW);
    expect(vault.list("loy_krathong", NOW)).toHaveLength(1);
  });

  it("drops expired entries", () => {
    const storage = new MemoryStorage();
    const expired = { ...creation(2, { expiresAt: new Date(NOW - 1000).toISOString(), createdAt: new Date(NOW - 5000).toISOString() }) };
    const valid = creation(1);
    const pick = (c: PublicCreation) => ({ id: c.id, eventId: c.eventId, zoneId: c.zoneId, createdAt: c.createdAt, expiresAt: c.expiresAt });
    storage.setItem(KEY, JSON.stringify([pick(valid), pick(expired)]));
    const vault = createMyCreationsVault({ storage });
    expect(vault.list("loy_krathong", NOW).map((e) => e.id)).toEqual([valid.id]);
    vault.record(creation(3), NOW);
    expect(storage.getItem(KEY)).not.toContain(expired.id);
  });

  it("keeps at most maxEntries, dropping the oldest", () => {
    const vault = createMyCreationsVault({ storage: new MemoryStorage(), maxEntries: 3 });
    for (const i of [1, 2, 3, 4]) vault.record(creation(i), NOW);
    expect(vault.list("loy_krathong", NOW).map((e) => e.id)).toEqual([1, 2, 3].map((i) => creation(i).id));
    expect(() => createMyCreationsVault({ storage: null, maxEntries: 0 })).toThrow(RangeError);
  });

  it("filters by event", () => {
    const vault = createMyCreationsVault({ storage: new MemoryStorage() });
    vault.record(creation(1, { eventId: "christmas" }), NOW);
    vault.record(creation(2), NOW);
    expect(vault.list("loy_krathong", NOW).map((e) => e.id)).toEqual([creation(2).id]);
    expect(vault.list("christmas", NOW)).toHaveLength(1);
  });

  it("tolerates corrupted storage", () => {
    const good = { id: creation(1).id, eventId: "loy_krathong", zoneId: 2, createdAt: creation(1).createdAt, expiresAt: creation(1).expiresAt };
    for (const raw of ["{", "null", "{}", '[1, null, "x"]', JSON.stringify([{ ...good, extra: 1 }]), JSON.stringify([{ id: good.id }])]) {
      const storage = new MemoryStorage();
      storage.setItem(KEY, raw);
      const vault = createMyCreationsVault({ storage });
      expect(vault.list("loy_krathong", NOW)).toEqual([]);
      vault.record(creation(2), NOW);
      expect(stored(storage)).toHaveLength(1);
    }
    expect(parseMyCreationEntries(JSON.stringify([good, good]))).toHaveLength(1);
    expect(parseMyCreationEntries(null)).toEqual([]);
  });

  it("no storage: memory fallback", () => {
    const vault = createMyCreationsVault({ storage: null });
    expect(vault.record(creation(1), NOW)).toEqual({ recorded: true, persisted: false });
    expect(vault.list("loy_krathong", NOW)).toHaveLength(1);
  });

  it("write failure: memory fallback; read failure: empty", () => {
    const storage = new MemoryStorage();
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const vault = createMyCreationsVault({ storage });
    expect(vault.record(creation(1), NOW)).toEqual({ recorded: true, persisted: false });
    expect(vault.list("loy_krathong", NOW)).toHaveLength(1);
    const broken = new MemoryStorage();
    vi.spyOn(broken, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(createMyCreationsVault({ storage: broken }).list("loy_krathong", NOW)).toEqual([]);
  });

  it("subscribe", () => {
    const vault = createMyCreationsVault({ storage: new MemoryStorage() });
    const listener = vi.fn();
    const off = vault.subscribe(listener);
    vault.subscribe(() => {
      throw new Error("boom");
    });
    vault.record(creation(1), NOW);
    vault.record(creation(1, { id: "bad" }), NOW);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    vault.record(creation(2), NOW);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("installMyCreationsRecorder records each saved creation", () => {
    const listeners = new Set<(c: PublicCreation) => void>();
    const source = {
      onCreationSaved(l: (c: PublicCreation) => void) {
        listeners.add(l);
        return () => void listeners.delete(l);
      },
    };
    const vault = createMyCreationsVault({ storage: new MemoryStorage() });
    const off = installMyCreationsRecorder(source, vault, () => NOW);
    for (const l of listeners) l(creation(1));
    expect(vault.list("loy_krathong", NOW)).toHaveLength(1);
    off();
    expect(listeners.size).toBe(0);
    for (const l of listeners) l(creation(2));
    expect(vault.list("loy_krathong", NOW)).toHaveLength(1);
  });

  it("getMyCreationsVault uses window.localStorage", () => {
    getMyCreationsVault().record(creation(1), Date.now());
    expect(window.localStorage.getItem(KEY)).toContain(creation(1).id);
  });
});
