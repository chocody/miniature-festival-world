// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEFAULT_KRATHONG_APPEARANCE } from "@/core/customization";
import { findInspectedCreation, inspectTapOutcome, pickInspectedCreation, type InspectableSource } from "./inspectedCreation";

const src = (id: string, wish?: unknown, displayName?: unknown): InspectableSource =>
  ({ id, appearance: DEFAULT_KRATHONG_APPEARANCE, publicWishText: wish, displayName }) as InspectableSource;

describe("pickInspectedCreation", () => {
  it("copies only the allowlisted keys", () => {
    const withExtras = {
      ...src("a", "ขอให้สมหวัง"),
      ownerToken: "TOKEN-VALUE",
      ownerTokenHash: "HASH-VALUE",
      privateWishText: "PRIVATE-VALUE",
      zoneId: 7,
      createdAtMs: 123456789,
      coord: { mode: "SPLINE_PATH", marker: "COORD-VALUE" },
    } as unknown as InspectableSource;
    const result = pickInspectedCreation(withExtras);
    expect(Object.keys(result)).toEqual(["id", "appearance", "publicWishText", "displayName"]);
    const json = JSON.stringify(result);
    for (const v of ["TOKEN-VALUE", "HASH-VALUE", "PRIVATE-VALUE", "COORD-VALUE", "123456789"]) expect(json).not.toContain(v);
  });
  it("normalises the wish", () => {
    expect(pickInspectedCreation(src("a", "ขอให้สมหวัง")).publicWishText).toBe("ขอให้สมหวัง");
    expect(pickInspectedCreation(src("a", "   ")).publicWishText).toBeNull();
    expect(pickInspectedCreation(src("a", undefined)).publicWishText).toBeNull();
    expect(pickInspectedCreation(src("a", null)).publicWishText).toBeNull();
    expect(pickInspectedCreation(src("a", 42)).publicWishText).toBeNull();
  });
});

describe("pickInspectedCreation displayName (owner decision 29)", () => {
  it("keeps the name only next to an open wish", () => {
    expect(pickInspectedCreation(src("a", "ขอให้สมหวัง", "น้องมะลิ")).displayName).toBe("น้องมะลิ");
    expect(pickInspectedCreation(src("a", null, "น้องมะลิ")).displayName).toBeNull();
    expect(pickInspectedCreation(src("a", "   ", "น้องมะลิ")).displayName).toBeNull();
  });
  it("whitespace, missing or non-string names become null", () => {
    expect(pickInspectedCreation(src("a", "x", "   ")).displayName).toBeNull();
    expect(pickInspectedCreation(src("a", "x", undefined)).displayName).toBeNull();
    expect(pickInspectedCreation(src("a", "x", null)).displayName).toBeNull();
    expect(pickInspectedCreation(src("a", "x", 42)).displayName).toBeNull();
  });
});

describe("findInspectedCreation", () => {
  it("finds by id", () => {
    const a = src("a", "x");
    const b = src("b", "y");
    expect(findInspectedCreation([a, b], "b")).toEqual(pickInspectedCreation(b));
    expect(findInspectedCreation([a, b], "zzz")).toBeNull();
    expect(findInspectedCreation([], "a")).toBeNull();
  });
});

describe("inspectTapOutcome (MFW-80)", () => {
  const owned = (id: string) => id === "mine";
  it("I1: own krathong → panel; another person's open wish → bubble; closed wish → none", () => {
    expect(inspectTapOutcome(pickInspectedCreation(src("mine", "hi")), owned)).toBe("panel");
    expect(inspectTapOutcome(pickInspectedCreation(src("mine", null)), owned)).toBe("panel");
    expect(inspectTapOutcome(pickInspectedCreation(src("other", "hi")), owned)).toBe("bubble");
    expect(inspectTapOutcome(pickInspectedCreation(src("other", null)), owned)).toBe("none");
  });
});
