import { describe, expect, it } from "vitest";
import { alternation, escapeRegExp, normalizeForModeration } from "./normalize";

describe("normalizeForModeration", () => {
  it("folds full-width and Thai digits", () => {
    expect(normalizeForModeration("\uFF10\uFF18\uFF11\uFF12\uFF13\uFF14\uFF15\uFF16\uFF17\uFF18")).toBe("0812345678");
    expect(normalizeForModeration("๐๘๑๒๓๔๕๖๗๘")).toBe("0812345678");
    expect(normalizeForModeration("ＳＯＭ＠ＭＡＩＬ．ＣＯＭ")).toBe("som@mail.com");
  });

  it("removes invisible characters and folds spaces and case", () => {
    expect(normalizeForModeration("so\u200Bm\u00ADchai\uFEFF")).toBe("somchai");
    expect(normalizeForModeration("a\u3000b")).toBe("a b");
    expect(normalizeForModeration("ABC")).toBe("abc");
  });

  it("leaves Thai text unchanged (SARA AM is not split)", () => {
    expect(normalizeForModeration("ระยำ")).toBe("ระยำ");
    expect(normalizeForModeration("ระยำ")).toHaveLength(4);
    expect(normalizeForModeration("ขอให้มีความสุข")).toBe("ขอให้มีความสุข");
  });
});

describe("regex helpers", () => {
  it("escapeRegExp", () => {
    expect(escapeRegExp("a.b*c")).toBe("a\\.b\\*c");
  });
  it("alternation sorts longest first", () => {
    expect(alternation(["เฟส", "เฟสบุ๊ค", "ig"])).toBe("เฟสบุ๊ค|เฟส|ig");
  });
});
