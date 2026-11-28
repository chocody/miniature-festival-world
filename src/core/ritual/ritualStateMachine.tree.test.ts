// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CHRISTMAS_TREE } from "@/config/events/christmas.tree.config";
import { slotsOfBand } from "@/core/world/growingTree";
import {
  INITIAL_RITUAL_STATE,
  isRitualBumped,
  isTreeSlot,
  transitionRitual,
  type RitualState,
  type SavedRelease,
} from "./ritualStateMachine";

const S = slotsOfBand(CHRISTMAS_TREE, 1)[0];
const S2 = slotsOfBand(CHRISTMAS_TREE, 1)[1];
const SPOT = { laneId: 1, progress: 0.4, lateralOffset: 0.2 };
const hang = (s: RitualState = INITIAL_RITUAL_STATE) =>
  transitionRitual(s, { type: "RELEASE_STARTED", attempt: s.attempt + 1, origin: { kind: "hang", candidate: S } });

describe("ritual state machine, tree slots", () => {
  it("RT1: isTreeSlot tells a slot from a river spot", () => {
    expect(isTreeSlot(S)).toBe(true);
    expect(isTreeSlot(SPOT)).toBe(false);
  });

  it("RT2: hang origin and tree landing are kept", () => {
    const s = hang();
    expect(s.phase).toBe("RELEASING");
    expect(s.origin).toEqual({ kind: "hang", candidate: S });
    const l = transitionRitual(s, { type: "LANDING_RESOLVED", attempt: 1, landing: S2, collided: true });
    expect(l.landing).toBe(S2);
    expect(l.collided).toBe(true);
  });

  it("RT3: SAVED with a cylindrical coord bumps when the server moved it", () => {
    const saved: SavedRelease = {
      id: "id-1",
      zoneId: 1,
      coord: { ...S2 },
      createdAtMs: 1000,
      serverClockOffsetMs: 0,
      movedByServer: true,
    };
    const s = transitionRitual({ ...hang(), instant: true }, { type: "SAVED", attempt: 1, saved });
    expect(s.phase).toBe("RELEASED");
    expect(s.saved?.coord).toEqual(S2);
    expect(isRitualBumped(s)).toBe(true);
  });

  it("RT4: DROP_REJECTED carries a hint", () => {
    const a = transitionRitual(INITIAL_RITUAL_STATE, { type: "DROP_REJECTED", hint: "TAP_ON_TREE" });
    expect(a.hint).toBe("TAP_ON_TREE");
    expect(a.error).toBeNull();
    expect(transitionRitual(a, { type: "DROP_REJECTED", hint: "TAP_ON_TREE" })).toBe(a);
    expect(transitionRitual(a, { type: "DROP_REJECTED" }).hint).toBe("DROP_ON_WATER");
    const r = hang();
    expect(transitionRitual(r, { type: "DROP_REJECTED", hint: "TAP_ON_TREE" })).toBe(r);
  });
});
