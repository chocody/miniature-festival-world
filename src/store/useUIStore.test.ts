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
