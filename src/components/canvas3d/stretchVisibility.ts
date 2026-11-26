"use client";

import { createContext, useContext } from "react";

/**
 * MFW-58: whether the endless-river stretch copy a component renders in is in view this frame. RiverStretch owns one mutable
 * object per slot and writes it from its culling frame (priority −1, so before every child's useFrame); per-frame writers inside the
 * slot (villagers, motes, lantern flicker, foliage sway, glints, krathong poses, prop nudges) skip their writes while it is false.
 * Never React state (no re-render per frame).
 */
export interface StretchVisibility {
  visible: boolean;
}

/** Outside a stretch slot (tests, single scenes): always visible. Never written. */
const ALWAYS_VISIBLE: StretchVisibility = { visible: true };

export const StretchVisibilityContext = createContext<StretchVisibility>(ALWAYS_VISIBLE);

export function useStretchVisibility(): StretchVisibility {
  return useContext(StretchVisibilityContext);
}
