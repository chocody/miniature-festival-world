// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  CANDLE_COLOR_PALETTE,
  FLOWER_KINDS,
  KRATHONG_BASE_IDS,
  LEAF_COLOR_PALETTE,
  LEAF_FOLD_STYLE_IDS,
  RIM_SOCKET_COUNT,
} from "@/config/events/loyKrathong.config";
import { assembleKrathong } from "./krathongAssembler";
import {
  DEFAULT_KRATHONG_APPEARANCE,
  KRATHONG_APPEARANCE_KEYS,
  parseKrathongAppearance,
  serializeKrathongAppearance,
} from "./krathongAppearance";
import { materialSpecFor, meshSpecFor } from "./krathongAssetKeys";
import { krathongInstanceBucketIndex } from "./krathongInstanceBuckets";

/** Stored appearance data (creations_public.appearance) must survive the v2 model (MFW-48 AC1). */
describe("stored appearance compatibility (MFW-48)", () => {
  it("catalogue ids and palettes are unchanged", () => {
    expect(KRATHONG_BASE_IDS).toEqual(["banana_trunk_01", "lotus_petal_01", "toy_bread_01"]);
    expect(LEAF_FOLD_STYLE_IDS).toEqual(["style_01", "style_02"]);
    expect(LEAF_COLOR_PALETTE).toEqual(["#5E8C3A", "#8DB255", "#3F6B4A"]);
    expect(FLOWER_KINDS).toEqual(["marigold", "orchid", "lotus"]);
    expect(CANDLE_COLOR_PALETTE).toEqual(["#FFD166", "#FFF1D6", "#FF9F6B"]);
    expect(RIM_SOCKET_COUNT).toBe(8);
    expect(KRATHONG_APPEARANCE_KEYS).toEqual(["base", "lotusFold", "leafColor", "flowers", "candleColor"]);
  });

  const FIXTURES = [
    // = the e2e fixture E2E_APPEARANCE
    '{"base":"banana_trunk_01","lotusFold":"style_01","leafColor":"#5E8C3A","flowers":["marigold"],"candleColor":"#FFD166"}',
    '{"base":"toy_bread_01","lotusFold":"style_02","leafColor":"#3F6B4A","flowers":["orchid",null,"lotus",null,null,null,null,"marigold"],"candleColor":"#FF9F6B"}',
    JSON.stringify(serializeKrathongAppearance(DEFAULT_KRATHONG_APPEARANCE)),
  ];

  it.each(FIXTURES)("a v1 stored appearance parses and every part resolves: %s", (json) => {
    const parsed = parseKrathongAppearance(JSON.parse(json));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const assembly = assembleKrathong(parsed.appearance);
    const parts = [...assembly.body, ...assembly.centerAnchor.parts];
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) {
      expect(() => meshSpecFor(part.geometryKey), part.id).not.toThrow();
      expect(() => materialSpecFor(part.materialKey), part.id).not.toThrow();
      expect(krathongInstanceBucketIndex(part.geometryKey, part.materialKey), part.id).not.toBeNull();
    }
  });
});
