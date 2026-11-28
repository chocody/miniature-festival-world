// @vitest-environment node
import { describe, expect, it } from "vitest";
import { excludeOwnAndCap, isOwnSlotReserved, isOwnZoneVisible, ownKrathongPoseKind, type OwnKrathongPoseInput } from "./ownKrathong";

const base: OwnKrathongPoseInput = { mode: "RITUAL_RELEASE", phase: "IDLE", hasSaved: false, dragging: false, ownZoneVisible: true };

describe("ownKrathongPoseKind", () => {
  it.each([
    [{ mode: "CUSTOMIZE" }, "ORIGIN"],
    [{ mode: null }, "ORIGIN"],
    [{ mode: "WORLD_EXPLORE" }, "HIDDEN"], // OK1 (MFW-154): no hero krathong on the landing view
    [{ mode: "WORLD_EXPLORE", phase: "RELEASED", hasSaved: true }, "RIVER"],
    [{ mode: "WORLD_EXPLORE", phase: "RELEASED", hasSaved: true, ownZoneVisible: false }, "HIDDEN"],
    [{}, "PIER"],
    [{ dragging: true }, "DRAG"],
    [{ phase: "RELEASING" }, "RELEASING"],
    [{ phase: "RELEASED", hasSaved: true }, "RIVER"],
  ] as const)("%j -> %s", (patch, kind) => {
    expect(ownKrathongPoseKind({ ...base, ...patch } as OwnKrathongPoseInput)).toBe(kind);
  });
});

describe("isOwnSlotReserved", () => {
  it("reserves a shared slot only when the own krathong is drawn among the shared ones", () => {
    for (const kind of ["PIER", "DRAG", "RELEASING", "RIVER"] as const) expect(isOwnSlotReserved(kind)).toBe(true);
    for (const kind of ["ORIGIN", "HIDDEN"] as const) expect(isOwnSlotReserved(kind)).toBe(false);
  });
});

describe("isOwnZoneVisible", () => {
  it("compares zones", () => {
    expect(isOwnZoneVisible(null, 1)).toBe(false);
    expect(isOwnZoneVisible(2, null)).toBe(true);
    expect(isOwnZoneVisible(2, 2)).toBe(true);
    expect(isOwnZoneVisible(2, 3)).toBe(false);
  });
});

describe("excludeOwnAndCap", () => {
  const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `i${i}` }));
  it("keeps the same reference when nothing changes", () => {
    const list = items(80);
    expect(excludeOwnAndCap(list, null, false)).toBe(list);
    expect(excludeOwnAndCap(list, "other", false)).toHaveLength(80);
  });
  it("makes room for the own krathong", () => {
    expect(excludeOwnAndCap(items(80), "i3", true)).toHaveLength(79);
    expect(excludeOwnAndCap(items(80), "i3", true).some((i) => i.id === "i3")).toBe(false);
    expect(excludeOwnAndCap(items(80), null, true)).toHaveLength(79);
  });
});
