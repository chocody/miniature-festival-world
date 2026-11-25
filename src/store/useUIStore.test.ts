import { beforeEach, describe, expect, it } from "vitest";
import { useUIStore } from "./useUIStore";

beforeEach(() => {
  useUIStore.setState(useUIStore.getInitialState(), true);
});

describe("useUIStore", () => {
  it("starts at CUSTOMIZE_OBJECT with no event", () => {
    const s = useUIStore.getState();
    expect(s.flowState).toBe("CUSTOMIZE_OBJECT");
    expect(s.selectedEventId).toBeNull();
  });

  it("dispatch walks the whole chain", () => {
    const { dispatch, enterActiveEvent } = useUIStore.getState();
    enterActiveEvent("loy_krathong");
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
