import { SKY_LAUNCH_CHOICE_STORAGE_KEY, SKY_LAUNCH_DEFAULT_KIND, type SkyLaunchKind } from "@/config/gimmicks.config";
import { browserStorage } from "./browserStorage";

/**
 * Per-device sky launch choice (MFW-85, DRAFT): kept only in this device's LocalStorage.
 * Stores only the string "firework" / "skyLantern". Never throws, never logs.
 */
export interface SkyLaunchPreference {
  read(): SkyLaunchKind;
  /** True when the choice was persisted; false when storage is missing or throws. */
  write(kind: SkyLaunchKind): boolean;
}

/** "firework" | "skyLantern" → itself; anything else (missing, other casing, garbage) → the default kind. */
export function parseSkyLaunchChoice(raw: string | null): SkyLaunchKind {
  return raw === "firework" || raw === "skyLantern" ? raw : SKY_LAUNCH_DEFAULT_KIND;
}

export function createSkyLaunchPreference(storage: Storage | null): SkyLaunchPreference {
  return {
    read() {
      if (storage === null) return SKY_LAUNCH_DEFAULT_KIND;
      try {
        return parseSkyLaunchChoice(storage.getItem(SKY_LAUNCH_CHOICE_STORAGE_KEY));
      } catch {
        return SKY_LAUNCH_DEFAULT_KIND;
      }
    },
    write(kind) {
      if (storage === null) return false;
      try {
        storage.setItem(SKY_LAUNCH_CHOICE_STORAGE_KEY, kind);
        return true;
      } catch {
        return false;
      }
    },
  };
}

let singleton: SkyLaunchPreference | null = null;

/** Lazy browser singleton. */
export function getSkyLaunchPreference(): SkyLaunchPreference {
  singleton ??= createSkyLaunchPreference(browserStorage());
  return singleton;
}
