import { create } from "zustand";

/** The creation currently being customized (spec §3: useBuilderStore). */
export interface BuilderState {
  appearance: Readonly<Record<string, unknown>> | null;
}

export const useBuilderStore = create<BuilderState>()(() => ({
  appearance: null,
}));
