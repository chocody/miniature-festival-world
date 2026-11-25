// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NO_FLOWER_LABEL } from "@/config/customizer.config";
import { INSPECT_POPUP_COPY } from "@/config/inspect.config";
import { DEFAULT_KRATHONG_APPEARANCE, type KrathongAppearance } from "@/core/customization";
import { describeKrathongAppearance } from "./krathongAppearanceSummary";

const withFlowers = (flowers: KrathongAppearance["flowers"]): KrathongAppearance => ({ ...DEFAULT_KRATHONG_APPEARANCE, flowers });
const flowerValue = (a: KrathongAppearance) => describeKrathongAppearance(a).find((r) => r.key === "flowers")!.value;

describe("describeKrathongAppearance", () => {
  it("describes the default krathong in Thai", () => {
    expect(describeKrathongAppearance(DEFAULT_KRATHONG_APPEARANCE)).toEqual([
      { key: "base", label: "ฐานกระทง", value: "หยวกกล้วย", swatch: null },
      { key: "lotusFold", label: "แบบพับใบตอง", value: "พับแหลม", swatch: null },
      { key: "leafColor", label: "สีใบตอง", value: "เขียวใบตอง", swatch: "#5E8C3A" },
      { key: "flowers", label: "ดอกไม้รอบขอบ", value: "ดาวเรือง ×8", swatch: null },
      { key: "candleColor", label: "สีเทียน", value: "เหลืองทอง", swatch: "#FFD166" },
    ]);
  });
  it("counts flowers in palette order", () => {
    expect(flowerValue(withFlowers(["lotus", null, "marigold", "lotus"]))).toBe("ดาวเรือง ×1 · ดอกบัว ×2");
    expect(flowerValue(withFlowers([null, null]))).toBe(NO_FLOWER_LABEL);
    expect(flowerValue(withFlowers([]))).toBe(NO_FLOWER_LABEL);
  });
  it("shows a dash and no swatch for an unknown colour", () => {
    const row = describeKrathongAppearance({ ...DEFAULT_KRATHONG_APPEARANCE, leafColor: "#123456" as never }).find((r) => r.key === "leafColor")!;
    expect(row.value).toBe(INSPECT_POPUP_COPY.unknownPart);
    expect(row.swatch).toBeNull();
  });
});
