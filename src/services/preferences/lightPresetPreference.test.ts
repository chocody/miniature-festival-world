import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LIGHT_PRESET_STORAGE_KEY } from "@/config/look.config";
import { createLightPresetPreference, parseLightPresetChoice } from "./lightPresetPreference";

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

function throwingStorage(): Storage {
  const boom = () => {
    throw new Error("denied");
  };
  return { length: 0, clear: boom, getItem: boom, key: boom, removeItem: boom, setItem: boom };
}

describe("parseLightPresetChoice", () => {
  it("keeps DAY / NIGHT, everything else is AUTO", () => {
    expect(parseLightPresetChoice("DAY")).toBe("DAY");
    expect(parseLightPresetChoice("NIGHT")).toBe("NIGHT");
    for (const raw of [null, "AUTO", "day", "x", ""]) expect(parseLightPresetChoice(raw)).toBe("AUTO");
  });
});

describe("createLightPresetPreference", () => {
  it("round-trips through storage; AUTO removes the key", () => {
    const storage = fakeStorage();
    const pref = createLightPresetPreference(storage);
    expect(pref.read()).toBe("AUTO");
    expect(pref.write("NIGHT")).toBe(true);
    expect(storage.getItem(LIGHT_PRESET_STORAGE_KEY)).toBe("NIGHT");
    expect(pref.read()).toBe("NIGHT");
    expect(pref.write("AUTO")).toBe(true);
    expect(storage.getItem(LIGHT_PRESET_STORAGE_KEY)).toBeNull();
    expect(pref.read()).toBe("AUTO");
  });

  it("no storage: reads AUTO, write returns false", () => {
    const pref = createLightPresetPreference(null);
    expect(pref.read()).toBe("AUTO");
    expect(pref.write("DAY")).toBe(false);
  });

  it("throwing storage: reads AUTO, write returns false, never throws", () => {
    const pref = createLightPresetPreference(throwingStorage());
    expect(() => pref.read()).not.toThrow();
    expect(pref.read()).toBe("AUTO");
    expect(pref.write("DAY")).toBe(false);
    expect(pref.write("AUTO")).toBe(false);
  });

  it("does not touch the owner-token vault", () => {
    const source = readFileSync(join(process.cwd(), "src/services/preferences/lightPresetPreference.ts"), "utf8");
    expect(source).not.toMatch(/deviceOwnerToken/i);
    expect(source).not.toMatch(/services\/auth/);
  });
});
