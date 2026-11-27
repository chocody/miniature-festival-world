import { describe, expect, it } from "vitest";
import { KRATHONG_DESIGN_IDS } from "@/config/krathongDesigns.config";
import { ORNAMENT_DEFAULT_DESIGN, ORNAMENT_DESIGN_IDS } from "./ornamentDesigns.config";

describe("ornament designs config", () => {
  it("OD1 lists the catalogue, frozen, with the default inside and no krathong id", () => {
    expect(ORNAMENT_DESIGN_IDS).toEqual(["ball_01", "star_01", "bow_01", "bell_01", "stocking_01", "gift_01"]);
    expect(Object.isFrozen(ORNAMENT_DESIGN_IDS)).toBe(true);
    expect(ORNAMENT_DESIGN_IDS).toContain(ORNAMENT_DEFAULT_DESIGN);
    for (const id of ORNAMENT_DESIGN_IDS) expect(KRATHONG_DESIGN_IDS as readonly string[]).not.toContain(id);
  });
});
