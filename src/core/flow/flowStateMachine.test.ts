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
  ["SHARED_WORLD_EXPLORE", "START_CREATE", "CUSTOMIZE_OBJECT"],
  ["CUSTOMIZE_OBJECT", "CANCEL_CREATE", "SHARED_WORLD_EXPLORE"],
];

describe("flow state machine", () => {
  it("FS1 starts in the shared world with no event (MFW-154)", () => {
    expect(INITIAL_FLOW).toEqual({ state: "SHARED_WORLD_EXPLORE", eventId: null });
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
    expect(checked).toBe(18);
  });

  it("FS3 SHARED_WORLD_EXPLORE only starts a creation", () => {
    expect(Object.keys(FLOW_TRANSITIONS.SHARED_WORLD_EXPLORE)).toEqual(["START_CREATE"]);
  });

  it("ignores unknown runtime event types without throwing", () => {
    for (const type of ["__proto__", "toString", "BOGUS", "SELECT_EVENT"]) {
      expect(transition(INITIAL_FLOW, { type } as unknown as FlowEvent)).toBe(INITIAL_FLOW);
    }
  });

  it("enterEvent binds the event once", () => {
    const bound = enterEvent(INITIAL_FLOW, "loy_krathong");
    expect(bound).toEqual({ state: "SHARED_WORLD_EXPLORE", eventId: "loy_krathong" });
    expect(enterEvent(bound, "christmas")).toBe(bound);
    expect(enterEvent(INITIAL_FLOW, "__proto__" as never)).toBe(INITIAL_FLOW);
    expect(enterEvent(INITIAL_FLOW, "nope" as never)).toBe(INITIAL_FLOW);
  });

  it("FS4 does not mutate the input snapshot, carries eventId through and the world starts a new creation", () => {
    const start = Object.freeze({ ...INITIAL_FLOW });
    let snap: FlowSnapshot = enterEvent(start, "loy_krathong");
    expect(start).toEqual({ state: "SHARED_WORLD_EXPLORE", eventId: null });
    for (const type of ["START_CREATE", "FINISH_CUSTOMIZE", "SUBMIT_WISH", "FINISH_RITUAL"] as const) {
      snap = transition(snap, { type });
      expect(snap.eventId).toBe("loy_krathong");
    }
    expect(snap.state).toBe("SHARED_WORLD_EXPLORE");
    snap = transition(snap, { type: "START_CREATE" });
    expect(snap.state).toBe("CUSTOMIZE_OBJECT");
    expect(snap.eventId).toBe("loy_krathong");
  });
});
