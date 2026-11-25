import { FESTIVAL_EVENT_IDS, type FestivalEventId } from "@/config/events";

/** App-level user flow (backlog 1.1): customize → wish → ritual → shared world; the event is resolved by the server (MFW-53). */
export const FLOW_STATES = [
  "CUSTOMIZE_OBJECT",
  "WRITE_WISH",
  "RITUAL_RELEASE",
  "SHARED_WORLD_EXPLORE",
] as const;

export type FlowState = (typeof FLOW_STATES)[number];

export type FlowEvent =
  | { type: "FINISH_CUSTOMIZE" }
  | { type: "SUBMIT_WISH" }
  | { type: "FINISH_RITUAL" }
  | { type: "REVISE_WISH" };

export type FlowEventType = FlowEvent["type"];

export const FLOW_EVENT_TYPES: readonly FlowEventType[] = Object.freeze([
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
  state: "CUSTOMIZE_OBJECT",
  eventId: null,
});

/** Forward-only, except REVISE_WISH: a server-side moderation block sends the user back to the wish (MFW-23). SHARED_WORLD_EXPLORE is terminal. */
export const FLOW_TRANSITIONS: Readonly<Record<FlowState, Partial<Record<FlowEventType, FlowState>>>> =
  Object.freeze({
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

/** Pure transition. Any invalid input (no table entry, unknown event type) returns the input snapshot `s` unchanged (same reference). */
export function transition(s: FlowSnapshot, e: FlowEvent): FlowSnapshot {
  const next = nextState(s.state, e.type);
  if (next === undefined) return s;
  return { state: next, eventId: s.eventId };
}

/** Binds the server-resolved active event to the session once (MFW-53). Same reference when already bound or unknown id. */
export function enterEvent(s: FlowSnapshot, eventId: FestivalEventId): FlowSnapshot {
  if (s.eventId !== null) return s;
  if (!(FESTIVAL_EVENT_IDS as readonly string[]).includes(eventId)) return s;
  return { state: s.state, eventId };
}
