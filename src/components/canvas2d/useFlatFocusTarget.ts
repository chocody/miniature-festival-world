"use client";

import { useWorldStore } from "@/store/useWorldStore";

/**
 * Find My (MFW-30) selects a creation by setting useWorldStore.focusedCreationId (after loading its zone) and bumps
 * focusRequestId on every request. This is the only place the 2D view reads them (MFW-33).
 */
export function useFlatFocusTarget(): string | null {
  return useWorldStore((s) => s.focusedCreationId);
}

/** Monotonic counter of Find My requests: selecting the same krathong again requests another scroll (like the 3D fly-to). */
export function useFlatFocusRequestId(): number {
  return useWorldStore((s) => s.focusRequestId);
}
