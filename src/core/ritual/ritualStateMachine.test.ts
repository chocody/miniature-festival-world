// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  INITIAL_RITUAL_STATE,
  isRitualBumped,
  transitionRitual,
  type RitualEvent,
  type RitualState,
  type SavedRelease,
} from "./ritualStateMachine";

const SPOT = { laneId: 1, progress: 0.4, lateralOffset: 0.2 };
const SAVED: SavedRelease = {
  id: "id-1",
  zoneId: 1,
  coord: { mode: "SPLINE_PATH", laneId: 1, spawnProgress: 0.4, speedFactor: 0.008, lateralOffset: 0.2 },
  createdAtMs: 1000,
  serverClockOffsetMs: 0,
  movedByServer: false,
};
const run = (s: RitualState, ...events: RitualEvent[]): RitualState => events.reduce(transitionRitual, s);
const started = (s: RitualState = INITIAL_RITUAL_STATE) =>
  transitionRitual(s, { type: "RELEASE_STARTED", attempt: s.attempt + 1, origin: { kind: "pier" } });

describe("ritual state machine", () => {
  it("happy path ends RELEASED with the saved object, each step a new frozen object", () => {
    const states: RitualState[] = [started()];
    for (const e of [
      { type: "LANDING_RESOLVED", attempt: 1, landing: SPOT, collided: false },
      { type: "TOUCHED_DOWN", attempt: 1 },
      { type: "SAVED", attempt: 1, saved: SAVED },
      { type: "SETTLED", attempt: 1 },
    ] as RitualEvent[]) {
      states.push(transitionRitual(states.at(-1)!, e));
    }
    expect(new Set(states).size).toBe(states.length);
    for (const s of states) expect(Object.isFrozen(s)).toBe(true);
    expect(states.at(-1)!.phase).toBe("RELEASED");
    expect(states.at(-1)!.saved).toBe(SAVED);
  });

  it("SAVED may come before TOUCHED_DOWN; SETTLED before SAVED is a no-op", () => {
    const s0 = started();
    expect(transitionRitual(s0, { type: "SETTLED", attempt: 1 })).toBe(s0);
    const s = run(s0, { type: "SAVED", attempt: 1, saved: SAVED }, { type: "TOUCHED_DOWN", attempt: 1 }, { type: "SETTLED", attempt: 1 });
    expect(s.phase).toBe("RELEASED");
  });

  it("ignores stale attempts", () => {
    const s = started();
    expect(transitionRitual(s, { type: "TOUCHED_DOWN", attempt: 0 })).toBe(s);
    expect(transitionRitual(s, { type: "RELEASE_STARTED", attempt: 3, origin: { kind: "pier" } })).toBe(s);
  });

  it("SAVE_FAILED returns to IDLE with the error; the next start clears it", () => {
    const failed = run(started(), { type: "SAVE_FAILED", attempt: 1, error: { kind: "network" } });
    expect(failed.phase).toBe("IDLE");
    expect(failed.error).toEqual({ kind: "network" });
    expect(failed.attempt).toBe(1);
    expect(failed.saved).toBeNull();
    const again = started(failed);
    expect(again.attempt).toBe(2);
    expect(again.error).toBeNull();
  });

  it("SKIP_ANIMATION completes without a scene", () => {
    const skipped = run(started(), { type: "SKIP_ANIMATION" });
    expect(skipped.touchedDown).toBe(true);
    expect(skipped.instant).toBe(true);
    expect(transitionRitual(skipped, { type: "SKIP_ANIMATION" })).toBe(skipped);
    expect(transitionRitual(skipped, { type: "SAVED", attempt: 1, saved: SAVED }).phase).toBe("RELEASED");
    const idle = transitionRitual(INITIAL_RITUAL_STATE, { type: "SKIP_ANIMATION" });
    expect(idle.instant).toBe(true);
    expect(started(idle).touchedDown).toBe(true);
    const savedFirst = run(started(), { type: "SAVED", attempt: 1, saved: SAVED }, { type: "SKIP_ANIMATION" });
    expect(savedFirst.phase).toBe("RELEASED");
  });

  it("DROP_REJECTED only in IDLE; RESET keeps attempt", () => {
    const hinted = transitionRitual(INITIAL_RITUAL_STATE, { type: "DROP_REJECTED" });
    expect(hinted.hint).toBe("DROP_ON_WATER");
    expect(transitionRitual(hinted, { type: "DROP_REJECTED" })).toBe(hinted);
    const releasing = started();
    expect(transitionRitual(releasing, { type: "DROP_REJECTED" })).toBe(releasing);
    expect(transitionRitual(releasing, { type: "RESET" }).attempt).toBe(1);
    expect(transitionRitual(releasing, { type: "RESET" }).phase).toBe("IDLE");
  });

  it("isRitualBumped", () => {
    const base = started();
    expect(isRitualBumped(base)).toBe(false);
    expect(isRitualBumped({ ...base, collided: true })).toBe(true);
    expect(isRitualBumped({ ...base, saved: { ...SAVED, movedByServer: true } })).toBe(true);
  });
});
