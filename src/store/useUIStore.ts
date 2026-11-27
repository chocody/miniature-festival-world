import { create } from "zustand";
import type { FestivalEventId } from "@/config/events";
import { INITIAL_FLOW, enterEvent, transition, type FlowEvent, type FlowState } from "@/core/flow";
import { INITIAL_RITUAL_STATE, transitionRitual, type RitualEvent, type RitualState } from "@/core/ritual";

export interface UIState {
  flowState: FlowState;
  /** Active event resolved on the server (MFW-53); null until FlowRoot mounts. Name kept from 1.1. */
  selectedEventId: FestivalEventId | null;
  enterActiveEvent: (eventId: FestivalEventId) => void;
  dispatch: (event: FlowEvent) => void;
  /** Release ritual sub-state of RITUAL_RELEASE (MFW-23). Public, parametric data only (invariant C). */
  ritual: RitualState;
  dispatchRitual: (event: RitualEvent) => void;
  /** Bumped by the HUD rotate button (MFW-74); SceneViewport owns the camera rig and turns the view once per change (as `focusRequestId`). */
  viewRotateRequestId: number;
  requestViewRotate: () => void;
}

export const useUIStore = create<UIState>()((set, get) => ({
  flowState: INITIAL_FLOW.state,
  selectedEventId: INITIAL_FLOW.eventId,
  enterActiveEvent: (eventId) => {
    const { flowState, selectedEventId } = get();
    const current = { state: flowState, eventId: selectedEventId };
    const next = enterEvent(current, eventId);
    if (next === current) return;
    set({ selectedEventId: next.eventId });
  },
  dispatch: (event) => {
    const { flowState, selectedEventId } = get();
    const current = { state: flowState, eventId: selectedEventId };
    const next = transition(current, event);
    if (next === current) return;
    if (event.type === "REVISE_WISH") {
      set({
        flowState: next.state,
        selectedEventId: next.eventId,
        ritual: transitionRitual(get().ritual, { type: "RESET" }),
      });
      return;
    }
    set({ flowState: next.state, selectedEventId: next.eventId });
  },
  ritual: INITIAL_RITUAL_STATE,
  dispatchRitual: (event) => {
    const current = get().ritual;
    const next = transitionRitual(current, event);
    if (next !== current) set({ ritual: next });
  },
  viewRotateRequestId: 0,
  requestViewRotate: () => set((s) => ({ viewRotateRequestId: s.viewRotateRequestId + 1 })),
}));
