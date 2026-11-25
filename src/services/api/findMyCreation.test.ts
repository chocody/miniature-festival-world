import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorldState } from "@/store/useWorldStore";
import { INITIAL_WORLD_STATE } from "@/store/useWorldStore";
import type { PublicCreation } from "./creationTypes";
import { createFindMyCreation } from "./findMyCreation";
import type { ZoneLoadOutcome } from "./zonePagination";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const itemOf = (zoneId: number, id: string) => ({ id, zoneId, eventId: "loy_krathong" }) as unknown as PublicCreation;

let state: WorldState;
const store = {
  getState: () => state,
  setState: (p: Partial<WorldState>) => {
    state = { ...state, ...p };
  },
};
const enterZone = (z: number, items: PublicCreation[]) =>
  store.setState({ currentZoneId: z, zoneStatus: "ready", zoneItems: items, focusedCreationId: null });

beforeEach(() => {
  state = {
    ...INITIAL_WORLD_STATE,
    eventId: "loy_krathong",
    currentZoneId: 3,
    zoneStatus: "ready",
    zoneItems: [itemOf(3, "c")],
  };
});

const target = (id: string, zoneId: number) => ({ id, eventId: "loy_krathong" as const, zoneId });

describe("findMyCreation", () => {
  it("another zone: awaits loadZone once, then focuses", async () => {
    const loadZone = vi.fn(async (z: number): Promise<ZoneLoadOutcome> => {
      enterZone(z, [itemOf(z, A)]);
      return "loaded";
    });
    const out = await createFindMyCreation({ store, loadZone }).find(target(A, 2));
    expect(out).toBe("focused");
    expect(loadZone).toHaveBeenCalledTimes(1);
    expect(loadZone).toHaveBeenCalledWith(2);
    expect(state.focusedCreationId).toBe(A);
    expect(state.focusRequestId).toBe(1);
  });

  it("same zone with the item: no load", async () => {
    const loadZone = vi.fn(async (): Promise<ZoneLoadOutcome> => "loaded");
    expect(await createFindMyCreation({ store, loadZone }).find(target("c", 3))).toBe("focused");
    expect(loadZone).not.toHaveBeenCalled();
  });

  it("same zone without the item: reloads once", async () => {
    let withItem = true;
    const loadZone = vi.fn(async (z: number): Promise<ZoneLoadOutcome> => {
      enterZone(z, withItem ? [itemOf(z, A)] : []);
      return "loaded";
    });
    const finder = createFindMyCreation({ store, loadZone });
    expect(await finder.find(target(A, 3))).toBe("focused");
    expect(loadZone).toHaveBeenCalledTimes(1);
    withItem = false;
    store.setState({ focusedCreationId: null, focusRequestId: 0, zoneItems: [] });
    expect(await finder.find(target(A, 3))).toBe("not_found");
    expect(state.focusedCreationId).toBeNull();
    expect(state.focusRequestId).toBe(0);
  });

  it("focus fields after a find", async () => {
    const finder = createFindMyCreation({ store, loadZone: vi.fn(async () => "loaded" as const) });
    await finder.find(target("c", 3));
    expect(state.focusRequestId).toBe(1);
    await finder.find(target("c", 3));
    expect(state.focusRequestId).toBe(2);
    expect(state.focusedCreationId).toBe("c");
  });

  it("load failed / invalid / superseded", async () => {
    for (const outcome of ["failed", "invalid", "superseded"] as const) {
      const loadZone = vi.fn(async (): Promise<ZoneLoadOutcome> => outcome);
      expect(await createFindMyCreation({ store, loadZone }).find(target(A, 2))).toBe(outcome);
      expect(state.focusedCreationId).toBeNull();
      expect(state.focusRequestId).toBe(0);
    }
  });

  it("a newer find supersedes an older one", async () => {
    const pending = new Map<number, () => void>();
    const loadZone = vi.fn(
      (z: number) =>
        new Promise<ZoneLoadOutcome>((resolve) => {
          pending.set(z, () => {
            enterZone(z, [itemOf(z, z === 2 ? A : B)]);
            resolve("loaded");
          });
        }),
    );
    const finder = createFindMyCreation({ store, loadZone });
    const first = finder.find(target(A, 2));
    const second = finder.find(target(B, 1));
    pending.get(2)!();
    pending.get(1)!();
    expect(await first).toBe("superseded");
    expect(await second).toBe("focused");
    expect(state.focusedCreationId).toBe(B);
  });

  it("a zone switch during the load supersedes", async () => {
    const loadZone = vi.fn(async (): Promise<ZoneLoadOutcome> => {
      enterZone(1, [itemOf(1, "z")]);
      return "loaded";
    });
    expect(await createFindMyCreation({ store, loadZone }).find(target(A, 2))).toBe("superseded");
    expect(state.focusedCreationId).toBeNull();
  });

  it("wrong or missing world", async () => {
    const loadZone = vi.fn(async (): Promise<ZoneLoadOutcome> => "loaded");
    const finder = createFindMyCreation({ store, loadZone });
    store.setState({ eventId: null });
    expect(await finder.find(target(A, 2))).toBe("invalid");
    store.setState({ eventId: "christmas" });
    expect(await finder.find(target(A, 2))).toBe("invalid");
    store.setState({ eventId: "loy_krathong" });
    expect(await finder.find(target(A, 0))).toBe("invalid");
    expect(await finder.find(target("", 2))).toBe("invalid");
    expect(loadZone).not.toHaveBeenCalled();
  });
});
