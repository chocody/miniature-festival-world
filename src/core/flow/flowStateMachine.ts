import type { FestivalEventId } from "@/config/events";
import { EVENT_FEATURE_FLAGS, isEventEnabled, type EventFeatureFlags } from "@/config/featureFlags.config";

/** App-level user flow (backlog 1.1): select festival → customize → wish → ritual → shared world. */
export const FLOW_STATES = [
  "LANDING_EVENT_SELECT",
  "CUSTOMIZE_OBJECT",
  "WRITE_WISH",
  "RITUAL_RELEASE",
  "SHARED_WORLD_EXPLORE",
] as const;

export type FlowState = (typeof FLOW_STATES)[number];

export type FlowEvent =
  | { type: "SELECT_EVENT"; eventId: FestivalEventId }
  | { type: "FINISH_CUSTOMIZE" }
  | { type: "SUBMIT_WISH" }
  | { type: "FINISH_RITUAL" }
  | { type: "REVISE_WISH" };

export type FlowEventType = FlowEvent["type"];

export const FLOW_EVENT_TYPES: readonly FlowEventType[] = Object.freeze([
  "SELECT_EVENT",
  "FINISH_CUSTOMIZE",
  "SUBMIT_WISH",
  "FINISH_RITUAL",
  "REVISE_WISH",
]);

export interface FlowSnapshot {
  readonly state: FlowState;
  readonly eventId: FestivalEventId | null;
}

export const INITIAL_FLOW: FlowSnapshot = Object.freeze({
  state: "LANDING_EVENT_SELECT",
  eventId: null,
});

/** Forward-only, except REVISE_WISH: a server-side moderation block sends the user back to the wish (MFW-23). SHARED_WORLD_EXPLORE is terminal. */
export const FLOW_TRANSITIONS: Readonly<Record<FlowState, Partial<Record<FlowEventType, FlowState>>>> =
  Object.freeze({
    LANDING_EVENT_SELECT: Object.freeze({ SELECT_EVENT: "CUSTOMIZE_OBJECT" }),
    CUSTOMIZE_OBJECT: Object.freeze({ FINISH_CUSTOMIZE: "WRITE_WISH" }),
    WRITE_WISH: Object.freeze({ SUBMIT_WISH: "RITUAL_RELEASE" }),
    RITUAL_RELEASE: Object.freeze({ FINISH_RITUAL: "SHARED_WORLD_EXPLORE", REVISE_WISH: "WRITE_WISH" }),
    SHARED_WORLD_EXPLORE: Object.freeze({}),
  });

const hasOwn = (obj: object, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key);

function nextState(state: FlowState, type: string): FlowState | undefined {
  if (!hasOwn(FLOW_TRANSITIONS, state)) return undefined;
  const row = FLOW_TRANSITIONS[state];
  if (!hasOwn(row, type)) return undefined;
  return row[type as FlowEventType];
}

export function canTransition(state: FlowState, type: FlowEventType): boolean {
  return nextState(state, type) !== undefined;
}

/**
 * Pure transition. Any invalid input (no table entry, disabled/unknown festival,
 * unknown event type) returns the input snapshot `s` unchanged (same reference).
 */
export function transition(
  s: FlowSnapshot,
  e: FlowEvent,
  flags: EventFeatureFlags = EVENT_FEATURE_FLAGS,
): FlowSnapshot {
  const next = nextState(s.state, e.type);
  if (next === undefined) return s;

  if (e.type === "SELECT_EVENT") {
    if (!isEventEnabled(e.eventId, flags)) return s;
    return { state: next, eventId: e.eventId };
  }

  return { state: next, eventId: s.eventId };
}
