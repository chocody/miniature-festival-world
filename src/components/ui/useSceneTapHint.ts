"use client";

import { useCallback, useState } from "react";
import { SCENE_TAP_HINT_SEEN_VALUE, SCENE_TAP_HINT_STORAGE_KEY } from "@/config/gimmicks.config";

/** localStorage, or null on the server or when the getter throws (blocked storage). */
export function getSceneTapHintStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readSceneTapHintSeen(storage: Pick<Storage, "getItem"> | null): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(SCENE_TAP_HINT_STORAGE_KEY) === SCENE_TAP_HINT_SEEN_VALUE;
  } catch {
    return false;
  }
}

export function markSceneTapHintSeen(storage: Pick<Storage, "setItem"> | null): void {
  if (!storage) return;
  try {
    storage.setItem(SCENE_TAP_HINT_STORAGE_KEY, SCENE_TAP_HINT_SEEN_VALUE);
  } catch {
    // storage full or blocked: the hint simply shows again next visit
  }
}

export interface SceneTapHintState {
  readonly visible: boolean;
  readonly dismiss: () => void;
}

/** First-visit "the scene can be tapped" hint: visible while `active` and not yet dismissed on this device. */
export function useSceneTapHint(active: boolean): SceneTapHintState {
  const [seen, setSeen] = useState(() => readSceneTapHintSeen(getSceneTapHintStorage()));
  const dismiss = useCallback(() => {
    setSeen(true);
    markSceneTapHintSeen(getSceneTapHintStorage());
  }, []);
  return { visible: active && !seen, dismiss };
}
