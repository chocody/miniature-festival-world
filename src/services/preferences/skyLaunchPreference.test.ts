import { describe, expect, it } from "vitest";
import { SKY_LAUNCH_CHOICE_STORAGE_KEY, SKY_LAUNCH_DEFAULT_KIND } from "@/config/gimmicks.config";
import { createSkyLaunchPreference, parseSkyLaunchChoice } from "./skyLaunchPreference";

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

describe("parseSkyLaunchChoice", () => {
  it("SP1: keeps firework / skyLantern, everything else is the default kind", () => {
    expect(parseSkyLaunchChoice("firework")).toBe("firework");
    expect(parseSkyLaunchChoice("skyLantern")).toBe("skyLantern");
    for (const raw of [null, "", "FIREWORK", "sky-lantern", "x"]) expect(parseSkyLaunchChoice(raw)).toBe(SKY_LAUNCH_DEFAULT_KIND);
  });
});

describe("createSkyLaunchPreference", () => {
  it("SP2: round-trips through storage (the default is stored too)", () => {
    const storage = fakeStorage();
    const pref = createSkyLaunchPreference(storage);
    expect(pref.read()).toBe(SKY_LAUNCH_DEFAULT_KIND);
    expect(pref.write("skyLantern")).toBe(true);
    expect(storage.getItem(SKY_LAUNCH_CHOICE_STORAGE_KEY)).toBe("skyLantern");
    expect(pref.read()).toBe("skyLantern");
    expect(pref.write("firework")).toBe(true);
    expect(storage.getItem(SKY_LAUNCH_CHOICE_STORAGE_KEY)).toBe("firework");
  });

  it("SP3: no storage or a throwing storage: reads the default, write returns false, nothing throws", () => {
    for (const storage of [null, throwingStorage()]) {
      const pref = createSkyLaunchPreference(storage);
      expect(pref.read()).toBe(SKY_LAUNCH_DEFAULT_KIND);
      expect(pref.write("skyLantern")).toBe(false);
    }
  });
});
