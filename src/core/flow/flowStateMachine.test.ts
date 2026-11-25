import { describe, expect, it } from "vitest";
import {
  FLOW_EVENT_TYPES,
  FLOW_STATES,
  FLOW_TRANSITIONS,
  INITIAL_FLOW,
  canTransition,
  enterEvent,
  transition,
  type FlowEvent,
  type FlowEventType,
  type FlowSnapshot,
  type FlowState,
} from "./flowStateMachine";

function eventOf(type: FlowEventType): FlowEvent {
  return { type } as FlowEvent;
}

const VALID: ReadonlyArray<readonly [FlowState, FlowEventType, FlowState]> = [
  ["CUSTOMIZE_OBJECT", "FINISH_CUSTOMIZE", "WRITE_WISH"],
  ["WRITE_WISH", "SUBMIT_WISH", "RITUAL_RELEASE"],
  ["RITUAL_RELEASE", "FINISH_RITUAL", "SHARED_WORLD_EXPLORE"],
  ["RITUAL_RELEASE", "REVISE_WISH", "WRITE_WISH"],
];

describe("flow state machine", () => {
  it("starts at CUSTOMIZE_OBJECT with no event", () => {
    expect(INITIAL_FLOW).toEqual({ state: "CUSTOMIZE_OBJECT", eventId: null });
  });

  it.each(VALID)("%s + %s -> %s", (from, type, to) => {
    const snap: FlowSnapshot = Object.freeze({ state: from, eventId: "loy_krathong" });
    const next = transition(snap, eventOf(type));
    expect(next.state).toBe(to);
    expect(canTransition(from, type)).toBe(true);
  });

  it("returns the SAME snapshot reference for every other state x event pair", () => {
    let checked = 0;
    for (const state of FLOW_STATES) {
      for (const type of FLOW_EVENT_TYPES) {
        if (VALID.some(([s, t]) => s === state && t === type)) continue;
        const snap: FlowSnapshot = Object.freeze({ state, eventId: "loy_krathong" });
        expect(transition(snap, eventOf(type))).toBe(snap);
        expect(canTransition(state, type)).toBe(false);
        checked++;
      }
    }
    expect(checked).toBe(12);
  });

  it("SHARED_WORLD_EXPLORE has no outgoing events", () => {
    expect(Object.keys(FLOW_TRANSITIONS.SHARED_WORLD_EXPLORE)).toHaveLength(0);
  });

  it("ignores unknown runtime event types without throwing", () => {
    for (const type of ["__proto__", "toString", "BOGUS", "SELECT_EVENT"]) {
      expect(transition(INITIAL_FLOW, { type } as unknown as FlowEvent)).toBe(INITIAL_FLOW);
    }
  });

  it("enterEvent binds the event once", () => {
    const bound = enterEvent(INITIAL_FLOW, "loy_krathong");
    expect(bound).toEqual({ state: "CUSTOMIZE_OBJECT", eventId: "loy_krathong" });
    expect(enterEvent(bound, "christmas")).toBe(bound);
    expect(enterEvent(INITIAL_FLOW, "__proto__" as never)).toBe(INITIAL_FLOW);
    expect(enterEvent(INITIAL_FLOW, "nope" as never)).toBe(INITIAL_FLOW);
  });

  it("does not mutate the input snapshot and carries eventId through", () => {
    const start = Object.freeze({ ...INITIAL_FLOW });
    let snap: FlowSnapshot = enterEvent(start, "loy_krathong");
    expect(start).toEqual({ state: "CUSTOMIZE_OBJECT", eventId: null });
    for (const type of ["FINISH_CUSTOMIZE", "SUBMIT_WISH", "FINISH_RITUAL"] as const) {
      snap = transition(snap, { type });
      expect(snap.eventId).toBe("loy_krathong");
    }
    expect(snap.state).toBe("SHARED_WORLD_EXPLORE");
  });
});
