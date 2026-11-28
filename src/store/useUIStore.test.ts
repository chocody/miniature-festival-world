import { beforeEach, describe, expect, it } from "vitest";
import { INITIAL_RITUAL_STATE, type RitualState } from "@/core/ritual";
import { useUIStore } from "./useUIStore";

beforeEach(() => {
  useUIStore.setState(useUIStore.getInitialState(), true);
});

describe("useUIStore", () => {
  it("US1 starts in the shared world with no event (MFW-154)", () => {
    const s = useUIStore.getState();
    expect(s.flowState).toBe("SHARED_WORLD_EXPLORE");
    expect(s.selectedEventId).toBeNull();
  });

  it("dispatch walks the whole chain", () => {
    const { dispatch, enterActiveEvent } = useUIStore.getState();
    enterActiveEvent("loy_krathong");
    expect(useUIStore.getState().flowState).toBe("SHARED_WORLD_EXPLORE");
    expect(useUIStore.getState().selectedEventId).toBe("loy_krathong");
    dispatch({ type: "START_CREATE" });
    expect(useUIStore.getState().flowState).toBe("CUSTOMIZE_OBJECT");
    dispatch({ type: "FINISH_CUSTOMIZE" });
    expect(useUIStore.getState().flowState).toBe("WRITE_WISH");
    dispatch({ type: "SUBMIT_WISH" });
    expect(useUIStore.getState().flowState).toBe("RITUAL_RELEASE");
    dispatch({ type: "FINISH_RITUAL" });
    expect(useUIStore.getState().flowState).toBe("SHARED_WORLD_EXPLORE");
    expect(useUIStore.getState().selectedEventId).toBe("loy_krathong");
  });

  it("invalid dispatch leaves state unchanged (no store update)", () => {
    const { dispatch } = useUIStore.getState();
    const before = useUIStore.getState();
    dispatch({ type: "SUBMIT_WISH" });
    dispatch({ type: "FINISH_RITUAL" });
    expect(useUIStore.getState()).toBe(before);
  });

  it("enterActiveEvent binds once and ignores unknown ids", () => {
    useUIStore.getState().enterActiveEvent("loy_krathong");
    const bound = useUIStore.getState();
    bound.enterActiveEvent("christmas");
    expect(useUIStore.getState()).toBe(bound);
    useUIStore.setState(useUIStore.getInitialState(), true);
    const fresh = useUIStore.getState();
    fresh.enterActiveEvent("nope" as never);
    expect(useUIStore.getState()).toBe(fresh);
  });
});

describe("useUIStore ritual", () => {
  it("dispatchRitual applies the reducer and skips no-ops (same state reference)", () => {
    const { dispatchRitual } = useUIStore.getState();
    dispatchRitual({ type: "RELEASE_STARTED", attempt: 1, origin: { kind: "pier" } });
    expect(useUIStore.getState().ritual.phase).toBe("RELEASING");
    const before = useUIStore.getState();
    dispatchRitual({ type: "TOUCHED_DOWN", attempt: 9 });
    expect(useUIStore.getState()).toBe(before);
  });

  it("REVISE_WISH returns to WRITE_WISH and resets the ritual but keeps attempt", () => {
    const { dispatch, dispatchRitual, enterActiveEvent } = useUIStore.getState();
    enterActiveEvent("loy_krathong");
    dispatch({ type: "START_CREATE" });
    dispatch({ type: "FINISH_CUSTOMIZE" });
    dispatch({ type: "SUBMIT_WISH" });
    dispatchRitual({ type: "RELEASE_STARTED", attempt: 1, origin: { kind: "pier" } });
    dispatch({ type: "REVISE_WISH" });
    const s = useUIStore.getState();
    expect(s.flowState).toBe("WRITE_WISH");
    expect(s.ritual.phase).toBe("IDLE");
    expect(s.ritual.attempt).toBe(1);
  });

  it("REVISE_WISH outside RITUAL_RELEASE changes nothing", () => {
    const before = useUIStore.getState();
    before.dispatch({ type: "REVISE_WISH" });
    expect(useUIStore.getState()).toBe(before);
  });

  it("US2 SUBMIT_WISH after a released ritual starts a fresh ritual and keeps attempt", () => {
    const released: RitualState = {
      ...INITIAL_RITUAL_STATE,
      phase: "RELEASED",
      attempt: 1,
      touchedDown: true,
      saved: {
        id: "own-creation",
        zoneId: 1,
        coord: { mode: "SPLINE_PATH", laneId: 1, spawnProgress: 0.5, speedFactor: 1, lateralOffset: 0 },
        createdAtMs: 1_700_000_000_000,
        serverClockOffsetMs: 0,
        movedByServer: false,
      },
    };
    useUIStore.setState({ flowState: "WRITE_WISH", selectedEventId: "loy_krathong", ritual: released });
    useUIStore.getState().dispatch({ type: "SUBMIT_WISH" });
    const s = useUIStore.getState();
    expect(s.flowState).toBe("RITUAL_RELEASE");
    expect(s.ritual.phase).toBe("IDLE");
    expect(s.ritual.attempt).toBe(1);
    expect(s.ritual.saved).toBeNull();
  });

  it("US3 the first SUBMIT_WISH and CANCEL_CREATE keep the ritual reference", () => {
    const { dispatch, enterActiveEvent } = useUIStore.getState();
    enterActiveEvent("loy_krathong");
    dispatch({ type: "START_CREATE" });
    dispatch({ type: "CANCEL_CREATE" });
    expect(useUIStore.getState().flowState).toBe("SHARED_WORLD_EXPLORE");
    expect(useUIStore.getState().ritual).toBe(INITIAL_RITUAL_STATE);
    dispatch({ type: "START_CREATE" });
    dispatch({ type: "FINISH_CUSTOMIZE" });
    dispatch({ type: "SUBMIT_WISH" });
    expect(useUIStore.getState().flowState).toBe("RITUAL_RELEASE");
    expect(useUIStore.getState().ritual).toBe(INITIAL_RITUAL_STATE);
  });

  it("U1 requestViewRotate bumps viewRotateRequestId 0 → 1 → 2", () => {
    expect(useUIStore.getState().viewRotateRequestId).toBe(0);
    useUIStore.getState().requestViewRotate();
    expect(useUIStore.getState().viewRotateRequestId).toBe(1);
    useUIStore.getState().requestViewRotate();
    expect(useUIStore.getState().viewRotateRequestId).toBe(2);
  });
});
