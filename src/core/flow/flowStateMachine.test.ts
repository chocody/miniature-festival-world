import { describe, expect, it } from "vitest";
import { EVENT_FEATURE_FLAGS } from "@/config/featureFlags.config";
import {
  FLOW_EVENT_TYPES,
  FLOW_STATES,
  FLOW_TRANSITIONS,
  INITIAL_FLOW,
  canTransition,
  transition,
  type FlowEvent,
  type FlowEventType,
  type FlowSnapshot,
  type FlowState,
} from "./flowStateMachine";

function eventOf(type: FlowEventType): FlowEvent {
  return type === "SELECT_EVENT" ? { type, eventId: "loy_krathong" } : ({ type } as FlowEvent);
}

const VALID: ReadonlyArray<readonly [FlowState, FlowEventType, FlowState]> = [
  ["LANDING_EVENT_SELECT", "SELECT_EVENT", "CUSTOMIZE_OBJECT"],
  ["CUSTOMIZE_OBJECT", "FINISH_CUSTOMIZE", "WRITE_WISH"],
  ["WRITE_WISH", "SUBMIT_WISH", "RITUAL_RELEASE"],
  ["RITUAL_RELEASE", "FINISH_RITUAL", "SHARED_WORLD_EXPLORE"],
];

describe("flow state machine", () => {
  it("starts at LANDING_EVENT_SELECT with no event", () => {
    expect(INITIAL_FLOW).toEqual({ state: "LANDING_EVENT_SELECT", eventId: null });
  });

  it.each(VALID)("%s + %s -> %s", (from, type, to) => {
    const snap: FlowSnapshot = Object.freeze({ state: from, eventId: from === "LANDING_EVENT_SELECT" ? null : "loy_krathong" });
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
    expect(checked).toBe(16);
  });

  it("SHARED_WORLD_EXPLORE has no outgoing events", () => {
    expect(Object.keys(FLOW_TRANSITIONS.SHARED_WORLD_EXPLORE)).toHaveLength(0);
  });

  it("rejects SELECT_EVENT for a disabled festival", () => {
    const next = transition(INITIAL_FLOW, { type: "SELECT_EVENT", eventId: "christmas" });
    expect(next).toBe(INITIAL_FLOW);
  });

  it("rejects SELECT_EVENT for an unknown festival", () => {
    const e = { type: "SELECT_EVENT", eventId: "nope" } as unknown as FlowEvent;
    expect(transition(INITIAL_FLOW, e)).toBe(INITIAL_FLOW);
    const proto = { type: "SELECT_EVENT", eventId: "__proto__" } as unknown as FlowEvent;
    expect(transition(INITIAL_FLOW, proto)).toBe(INITIAL_FLOW);
  });

  it("accepts a flag-enabled festival when flags override", () => {
    const flags = { ...EVENT_FEATURE_FLAGS, christmas: true };
    expect(transition(INITIAL_FLOW, { type: "SELECT_EVENT", eventId: "christmas" }, flags)).toEqual({
      state: "CUSTOMIZE_OBJECT",
      eventId: "christmas",
    });
  });

  it("ignores unknown runtime event types without throwing", () => {
    for (const type of ["__proto__", "toString", "BOGUS"]) {
      expect(transition(INITIAL_FLOW, { type } as unknown as FlowEvent)).toBe(INITIAL_FLOW);
    }
  });

  it("does not mutate the input snapshot and carries eventId through", () => {
    const start = Object.freeze({ ...INITIAL_FLOW });
    let snap: FlowSnapshot = transition(start, { type: "SELECT_EVENT", eventId: "loy_krathong" });
    expect(start).toEqual({ state: "LANDING_EVENT_SELECT", eventId: null });
    for (const type of ["FINISH_CUSTOMIZE", "SUBMIT_WISH", "FINISH_RITUAL"] as const) {
      snap = transition(snap, { type });
      expect(snap.eventId).toBe("loy_krathong");
    }
    expect(snap.state).toBe("SHARED_WORLD_EXPLORE");
  });
});
