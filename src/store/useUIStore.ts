import { create } from "zustand";
import type { FestivalEventId } from "@/config/events";
import { INITIAL_FLOW, transition, type FlowEvent, type FlowState } from "@/core/flow";

export interface UIState {
  flowState: FlowState;
  selectedEventId: FestivalEventId | null;
  dispatch: (event: FlowEvent) => void;
}

export const useUIStore = create<UIState>()((set, get) => ({
  flowState: INITIAL_FLOW.state,
  selectedEventId: INITIAL_FLOW.eventId,
  dispatch: (event) => {
    const { flowState, selectedEventId } = get();
    const current = { state: flowState, eventId: selectedEventId };
    const next = transition(current, event);
    if (next === current) return;
    set({ flowState: next.state, selectedEventId: next.eventId });
  },
}));
