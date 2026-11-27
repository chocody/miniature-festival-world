import { browserStorage } from "./browserStorage";
import { LIGHT_PRESET_STORAGE_KEY, type LightPresetChoice } from "@/config/look.config";

/**
 * Per-device light preset choice (owner decision, open question 32): kept only in this device's LocalStorage.
 * Stores only the string "DAY" / "NIGHT"; AUTO = no key. Never throws, never logs.
 */
export interface LightPresetPreference {
  read(): LightPresetChoice;
  /** True when the choice was persisted; false when storage is missing or throws. */
  write(choice: LightPresetChoice): boolean;
}

/** "DAY" | "NIGHT" → itself; anything else (missing, "AUTO", other casing, garbage) → "AUTO". */
export function parseLightPresetChoice(raw: string | null): LightPresetChoice {
  return raw === "DAY" || raw === "NIGHT" ? raw : "AUTO";
}

export function createLightPresetPreference(storage: Storage | null): LightPresetPreference {
  return {
    read() {
      if (storage === null) return "AUTO";
      try {
        return parseLightPresetChoice(storage.getItem(LIGHT_PRESET_STORAGE_KEY));
      } catch {
        return "AUTO";
      }
    },
    write(choice) {
      if (storage === null) return false;
      try {
        if (choice === "AUTO") storage.removeItem(LIGHT_PRESET_STORAGE_KEY);
        else storage.setItem(LIGHT_PRESET_STORAGE_KEY, choice);
        return true;
      } catch {
        return false;
      }
    },
  };
}

let singleton: LightPresetPreference | null = null;

/** Lazy browser singleton. */
export function getLightPresetPreference(): LightPresetPreference {
  singleton ??= createLightPresetPreference(browserStorage());
  return singleton;
}
