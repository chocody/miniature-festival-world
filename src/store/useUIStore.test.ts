import { beforeEach, describe, expect, it } from "vitest";
import { useUIStore } from "./useUIStore";

beforeEach(() => {
  useUIStore.setState(useUIStore.getInitialState(), true);
});

describe("useUIStore", () => {
  it("starts at landing with no selection", () => {
    const s = useUIStore.getState();
    expect(s.flowState).toBe("LANDING_EVENT_SELECT");
    expect(s.selectedEventId).toBeNull();
  });

  it("dispatch walks the whole chain", () => {
    const { dispatch } = useUIStore.getState();
    dispatch({ type: "SELECT_EVENT", eventId: "loy_krathong" });
    expect(useUIStore.getState().flowState).toBe("CUSTOMIZE_OBJECT");
    expect(useUIStore.getState().selectedEventId).toBe("loy_krathong");
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
    dispatch({ type: "SELECT_EVENT", eventId: "christmas" });
    expect(useUIStore.getState()).toBe(before);
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
    const { dispatch, dispatchRitual } = useUIStore.getState();
    dispatch({ type: "SELECT_EVENT", eventId: "loy_krathong" });
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
});
