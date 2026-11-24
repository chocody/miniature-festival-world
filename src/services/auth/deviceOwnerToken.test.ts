import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEVICE_OWNER_TOKEN_BYTES,
  DEVICE_OWNER_TOKEN_LENGTH,
  DEVICE_OWNER_TOKEN_STORAGE_KEY,
} from "@/config/ownership.config";
import {
  createDeviceOwnerVault,
  generateDeviceOwnerToken,
  getBrowserLocalStorage,
  getDeviceOwnerVault,
  isDeviceOwnerToken,
  type DeviceOwnerToken,
} from "./deviceOwnerToken";

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

const OTHER = "A".repeat(43) as DeviceOwnerToken;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("generation", () => {
  it("config: LENGTH matches BYTES", () => {
    expect(Math.ceil((DEVICE_OWNER_TOKEN_BYTES * 8) / 6)).toBe(DEVICE_OWNER_TOKEN_LENGTH);
    expect(DEVICE_OWNER_TOKEN_BYTES).toBeGreaterThanOrEqual(16);
  });

  it("generate: format", () => {
    const t = generateDeviceOwnerToken();
    expect(t).toHaveLength(43);
    expect(isDeviceOwnerToken(t)).toBe(true);
  });

  it("generate: uses crypto.getRandomValues with 32 bytes", () => {
    const spy = vi.spyOn(globalThis.crypto, "getRandomValues");
    generateDeviceOwnerToken();
    expect(spy).toHaveBeenCalledTimes(1);
    const arg = spy.mock.calls[0][0] as Uint8Array;
    expect(arg).toBeInstanceOf(Uint8Array);
    expect(arg.length).toBe(32);
  });

  it("generate: never calls Math.random", () => {
    const spy = vi.spyOn(Math, "random");
    for (let i = 0; i < 10; i++) generateDeviceOwnerToken();
    expect(spy).not.toHaveBeenCalled();
  });

  it("generate: unique", () => {
    const tokens = Array.from({ length: 1000 }, () => generateDeviceOwnerToken());
    expect(new Set(tokens).size).toBe(1000);
  });

  it("generate: deterministic encoding", () => {
    expect(generateDeviceOwnerToken((b) => b.fill(0))).toBe("A".repeat(43));
    expect(generateDeviceOwnerToken((b) => b.fill(0xff))).toBe("_".repeat(42) + "8");
    expect(
      generateDeviceOwnerToken((b) => b.forEach((_, i) => (b[i] = i))),
    ).toBe("AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8");
  });

  it("generate: throws when no secure random source", () => {
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(() => {
      throw new Error("x");
    });
    expect(() => generateDeviceOwnerToken()).toThrow();
    vi.restoreAllMocks();
    vi.stubGlobal("crypto", undefined);
    expect(() => generateDeviceOwnerToken()).toThrow(/getRandomValues/);
  });

  it("isDeviceOwnerToken rejects", () => {
    const bad: unknown[] = [
      "",
      "A".repeat(42),
      "A".repeat(44),
      "A".repeat(42) + "B",
      "A".repeat(42) + "+",
      "A".repeat(42) + "/",
      "A".repeat(42) + "=",
      "a1b2c3d4".repeat(8),
      null,
      undefined,
      123,
      {},
    ];
    for (const v of bad) expect(isDeviceOwnerToken(v)).toBe(false);
  });
});

describe("vault persistence", () => {
  it("read() on empty storage returns null and writes nothing", () => {
    const storage = new MemoryStorage();
    expect(createDeviceOwnerVault({ storage }).read()).toBeNull();
    expect(storage.length).toBe(0);
  });

  it("getOrCreate persists under the storage key", () => {
    const storage = new MemoryStorage();
    const result = createDeviceOwnerVault({ storage }).getOrCreate();
    expect(result.persisted).toBe(true);
    expect(storage.getItem(DEVICE_OWNER_TOKEN_STORAGE_KEY)).toBe(result.token);
    expect(isDeviceOwnerToken(result.token)).toBe(true);
  });

  it("getOrCreate is stable", () => {
    const generate = vi.fn(() => generateDeviceOwnerToken());
    const vault = createDeviceOwnerVault({ storage: new MemoryStorage(), generate });
    const a = vault.getOrCreate();
    const b = vault.getOrCreate();
    expect(b.token).toBe(a.token);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("survives a reload", () => {
    const storage = new MemoryStorage();
    const first = createDeviceOwnerVault({ storage }).getOrCreate().token;
    const generate = vi.fn(() => generateDeviceOwnerToken());
    const second = createDeviceOwnerVault({ storage, generate });
    expect(second.read()).toBe(first);
    expect(second.getOrCreate().token).toBe(first);
    expect(generate).not.toHaveBeenCalled();
  });

  it("uses real window.localStorage", () => {
    const { token } = createDeviceOwnerVault({ storage: window.localStorage }).getOrCreate();
    expect(window.localStorage.getItem(DEVICE_OWNER_TOKEN_STORAGE_KEY)).toBe(token);
  });

  it("invalid stored value is replaced", () => {
    const storage = new MemoryStorage();
    storage.setItem(DEVICE_OWNER_TOKEN_STORAGE_KEY, "garbage");
    const vault = createDeviceOwnerVault({ storage });
    expect(vault.read()).toBeNull();
    const r = vault.getOrCreate();
    expect(isDeviceOwnerToken(r.token)).toBe(true);
    expect(r.persisted).toBe(true);
    expect(storage.getItem(DEVICE_OWNER_TOKEN_STORAGE_KEY)).toBe(r.token);
  });

  it("no storage -> in-memory only", () => {
    const vault = createDeviceOwnerVault({ storage: null });
    const a = vault.getOrCreate();
    expect(a.persisted).toBe(false);
    expect(vault.getOrCreate().token).toBe(a.token);
    expect(vault.read()).toBe(a.token);
  });

  it("setItem throws (QuotaExceededError) -> not persisted, same token kept", () => {
    const storage = new MemoryStorage();
    storage.setItem = () => {
      throw new DOMException("full", "QuotaExceededError");
    };
    const generate = vi.fn(() => generateDeviceOwnerToken());
    const vault = createDeviceOwnerVault({ storage, generate });
    const a = vault.getOrCreate();
    expect(a.persisted).toBe(false);
    expect(vault.getOrCreate().token).toBe(a.token);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("getItem throws (SecurityError) -> handled", () => {
    const storage = new MemoryStorage();
    storage.getItem = () => {
      throw new DOMException("denied", "SecurityError");
    };
    expect(() => createDeviceOwnerVault({ storage }).getOrCreate()).not.toThrow();
  });

  it("another tab won the race", () => {
    const storage = new MemoryStorage();
    let calls = 0;
    storage.getItem = () => (calls++ === 0 ? null : OTHER);
    expect(createDeviceOwnerVault({ storage }).getOrCreate()).toEqual({ token: OTHER, persisted: true });
  });

  it("storage drops the write", () => {
    const storage = new MemoryStorage();
    storage.setItem = () => {};
    expect(createDeviceOwnerVault({ storage }).getOrCreate().persisted).toBe(false);
  });

  it("getBrowserLocalStorage returns window.localStorage", () => {
    expect(getBrowserLocalStorage()).toBe(window.localStorage);
  });

  it("getBrowserLocalStorage returns null when access throws", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(getBrowserLocalStorage()).toBeNull();
  });

  it("getDeviceOwnerVault returns the same instance on repeated calls", () => {
    expect(getDeviceOwnerVault()).toBe(getDeviceOwnerVault());
  });
});
