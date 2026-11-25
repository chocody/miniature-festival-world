// @vitest-environment node
import { describe, expect, it } from "vitest";
import { LOY_KRATHONG_RIVER_LANE_ID } from "@/config/events/loyKrathong.river.config";
import { RIVER_DRIFT_SPEED_FACTOR } from "@/config/riverFlow.config";
import { DEFAULT_KRATHONG_APPEARANCE, serializeKrathongAppearance } from "@/core/customization";
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
    expect(Object.keys(out[0]).sort()).toEqual(["appearance", "coord", "createdAtMs", "id"]);
    expect(out[0].coord).toEqual(input.coord);
    expect(out[0].coord).not.toBe(input.coord);
    expect(out[0].createdAtMs).toBe(Date.parse(input.createdAt));
    expect(Object.isFrozen(out)).toBe(true);
    expect(Object.isFrozen(out[0])).toBe(true);
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
  it("never copies the public wish; empty in, empty out", () => {
    const out = publicCreationsToRiverItems([creation(1)], QUERY);
    expect(JSON.stringify(out)).not.toContain("secret-ish");
    expect(publicCreationsToRiverItems([], QUERY)).toEqual([]);
  });
});
