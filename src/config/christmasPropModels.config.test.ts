import { describe, expect, it } from "vitest";
import {
  CHRISTMAS_PROP_IDS,
  CHRISTMAS_PROP_LODS,
  CHRISTMAS_PROP_MAX_TRIANGLES_BY_LOD,
  christmasPropUrl,
} from "./christmasPropModels.config";
import { ORNAMENT_DESIGN_IDS } from "./ornamentDesigns.config";

describe("christmas prop model config (MFW-124)", () => {
  it("PC1: URLs, ids and LODs", () => {
    expect(christmasPropUrl("gift_pile_01", "low")).toBe("/models/christmas/gift_pile_01.low.glb");
    expect([...CHRISTMAS_PROP_IDS]).toEqual(["snowman_01", "gift_pile_01"]);
    expect([...CHRISTMAS_PROP_LODS]).toEqual(["medium", "low"]);
  });

  it("PC2: triangle guards; prop ids are not ornament designs", () => {
    expect(CHRISTMAS_PROP_MAX_TRIANGLES_BY_LOD).toEqual({ medium: 1500, low: 600 });
    for (const id of CHRISTMAS_PROP_IDS) expect((ORNAMENT_DESIGN_IDS as readonly string[]).includes(id)).toBe(false);
  });
});
