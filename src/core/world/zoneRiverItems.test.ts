// @vitest-environment node
import { describe, expect, it } from "vitest";
import { LOY_KRATHONG_RIVER_LANE_ID } from "@/config/events/loyKrathong.river.config";
import { RIVER_DRIFT_SPEED_FACTOR } from "@/config/riverFlow.config";
import { DEFAULT_KRATHONG_APPEARANCE, krathongDesignForAppearance, serializeKrathongAppearance } from "@/core/customization";
import type { PublicCreation } from "@/services/api/creationTypes";
import { publicCreationsToRiverItems } from "./zoneRiverItems";

const QUERY = { eventId: "loy_krathong", zoneId: 2 } as const;
const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const baseCoord = () => ({
  mode: "SPLINE_PATH",
  laneId: LOY_KRATHONG_RIVER_LANE_ID,
  spawnProgress: 0.25,
  speedFactor: RIVER_DRIFT_SPEED_FACTOR,
  lateralOffset: 0,
});
function creation(i: number, overrides: Record<string, unknown> = {}): PublicCreation {
  return {
    id: uuid(i),
    eventId: "loy_krathong",
    zoneId: 2,
    appearance: serializeKrathongAppearance(DEFAULT_KRATHONG_APPEARANCE),
    coord: baseCoord(),
    publicWishText: "secret-ish public wish",
    createdAt: "2026-11-24T12:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
    ...overrides,
  } as unknown as PublicCreation;
}

describe("publicCreationsToRiverItems", () => {
  it("maps one valid item to a frozen public-only river item", () => {
    const input = creation(1);
    const out = publicCreationsToRiverItems([input], QUERY);
    expect(out).toHaveLength(1);
    expect(Object.keys(out[0]).sort()).toEqual(["appearance", "coord", "createdAtMs", "displayName", "id", "publicWishText"]);
    expect(out[0].coord).toEqual(input.coord);
    expect(out[0].coord).not.toBe(input.coord);
    expect(out[0].createdAtMs).toBe(Date.parse(input.createdAt));
    expect(Object.isFrozen(out)).toBe(true);
    expect(Object.isFrozen(out[0])).toBe(true);
  });
  it("copies the public wish text (MFW-28)", () => {
    const out = publicCreationsToRiverItems(
      [creation(1, { publicWishText: "ขอให้สุขภาพแข็งแรง" }), creation(2, { publicWishText: null })],
      QUERY,
    );
    expect(out.map((x) => x.publicWishText)).toEqual(["ขอให้สุขภาพแข็งแรง", null]);
  });
  it("copies the display name only with an open wish (MFW-63)", () => {
    const out = publicCreationsToRiverItems(
      [
        creation(1, { publicWishText: "ขอให้สมหวัง", displayName: "น้องมะลิ" }),
        creation(2, { publicWishText: null, displayName: "น้องมะลิ" }),
        creation(3, { publicWishText: "ขอให้สมหวัง" }),
      ],
      QUERY,
    );
    expect(out.map((x) => x.displayName)).toEqual(["น้องมะลิ", null, null]);
  });
  it("caps at 80 valid items", () => {
    const valid = Array.from({ length: 85 }, (_, i) => creation(i + 1));
    expect(publicCreationsToRiverItems(valid, QUERY).map((x) => x.id)).toEqual(valid.slice(0, 80).map((x) => x.id));
    const invalid = Array.from({ length: 5 }, (_, i) => creation(500 + i, { createdAt: "garbage" }));
    const mixed = [...invalid, ...valid.slice(0, 80)];
    const out = publicCreationsToRiverItems(mixed, QUERY);
    expect(out).toHaveLength(80);
    expect(out[0].id).toBe(valid[0].id);
  });
  it("drops invalid items", () => {
    const dropped = [
      creation(1, { zoneId: 3 }),
      creation(2, { eventId: "christmas" }),
      creation(3, { id: "" }),
      creation(5, { coord: { ...baseCoord(), x: 1 } }),
      creation(6, { coord: { mode: "PLANAR_ZONE", zoneId: "z", u: 0.5, v: 0.5 } }),
      creation(7, { coord: { ...baseCoord(), lateralOffset: 0.7 } }),
      creation(8, { createdAt: "garbage" }),
      creation(9, { appearance: { ...serializeKrathongAppearance(DEFAULT_KRATHONG_APPEARANCE), base: "nope" } }),
    ];
    expect(publicCreationsToRiverItems(dropped, QUERY)).toEqual([]);
    const dup = [creation(10), creation(10)];
    expect(publicCreationsToRiverItems(dup, QUERY)).toHaveLength(1);
  });
  it("ZR1 (MFW-78): keeps legacy and designed appearances, drops an unknown design", () => {
    const { design, ...legacy } = serializeKrathongAppearance(DEFAULT_KRATHONG_APPEARANCE);
    void design;
    const out = publicCreationsToRiverItems(
      [
        creation(1, { appearance: legacy }),
        creation(2, { appearance: { ...legacy, design: "naga_01" } }),
        creation(3, { appearance: { ...legacy, design: "bogus" } }),
      ],
      QUERY,
    );
    expect(out.map((item) => item.id)).toEqual([uuid(1), uuid(2)]);
    expect("design" in out[0].appearance).toBe(false);
    expect(krathongDesignForAppearance(out[0].appearance)).toBe("banana_leaf_01");
    expect(out[1].appearance.design).toBe("naga_01");
    expect(krathongDesignForAppearance(out[1].appearance)).toBe("naga_01");
  });

  it("copies the public wish but never expiresAt; empty in, empty out (MFW-28 changed the wish rule)", () => {
    const out = publicCreationsToRiverItems([creation(1)], QUERY);
    expect(JSON.stringify(out)).toContain("secret-ish");
    expect(JSON.stringify(out)).not.toContain("expiresAt");
    expect(publicCreationsToRiverItems([], QUERY)).toEqual([]);
  });
});

describe("getZoneRiverItems (MFW-58)", () => {
  it("equals publicCreationsToRiverItems and is the same reference for the same array and query", async () => {
    const { getZoneRiverItems, publicCreationsToRiverItems } = await import("./zoneRiverItems");
    const creations = Object.freeze([
      {
        id: "00000000-0000-4000-8000-000000000001",
        eventId: "loy_krathong",
        zoneId: 2,
        appearance: { base: "banana_trunk_01" },
        coord: { mode: "SPLINE_PATH", laneId: 1, spawnProgress: 0.1, speedFactor: 0.008, lateralOffset: 0 },
        publicWishText: null,
        createdAt: "2026-11-24T12:00:00.000Z",
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
    ]) as never;
    const q = { eventId: "loy_krathong", zoneId: 2 } as const;
    const a = getZoneRiverItems(creations, q);
    expect(a).toEqual(publicCreationsToRiverItems(creations, q));
    expect(getZoneRiverItems(creations, q)).toBe(a);
    expect(getZoneRiverItems(creations, { ...q, zoneId: 3 })).toEqual([]);
    expect(getZoneRiverItems([...(creations as unknown as never[])], q)).not.toBe(a);
  });
});
