import { describe, expect, it } from "vitest";
import { KRATHONG_DESIGN_IDS } from "./krathongDesigns.config";
import { ORNAMENT_DESIGN_IDS } from "./ornamentDesigns.config";
import { STAR_DEFAULT_DESIGN, STAR_DESIGN_IDS } from "./starDesigns.config";

describe("star designs config", () => {
  it("SD1 lists the three star ids, a default, and stays disjoint from the other catalogues", () => {
    expect(STAR_DESIGN_IDS).toEqual(["star_classic_01", "star_sparkle_01", "star_comet_01"]);
    expect(Object.isFrozen(STAR_DESIGN_IDS)).toBe(true);
    expect(STAR_DESIGN_IDS).toContain(STAR_DEFAULT_DESIGN);
    expect(STAR_DEFAULT_DESIGN).toBe("star_classic_01");
    for (const id of STAR_DESIGN_IDS) {
      expect(KRATHONG_DESIGN_IDS as readonly string[]).not.toContain(id);
      expect(ORNAMENT_DESIGN_IDS as readonly string[]).not.toContain(id);
    }
  });
});
