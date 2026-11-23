import { create } from "zustand";

/** Shared-world status (spec §3: useWorldStore). */
export interface WorldState {
  currentZoneId: number | null;
  participantCount: number | null;
}

export const useWorldStore = create<WorldState>()(() => ({
  currentZoneId: null,
  participantCount: null,
}));
