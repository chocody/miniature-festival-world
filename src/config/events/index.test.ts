import { describe, expect, it } from "vitest";
import { FESTIVAL_EVENTS, getEventConfig } from "./index";

describe("festival events config", () => {
  it("lists 8 unique ids in roadmap order", () => {
    expect(FESTIVAL_EVENTS.map((e) => e.id)).toEqual([
      "loy_krathong",
      "christmas",
      "new_year",
      "chinese_new_year",
      "valentines",
      "songkran",
      "mid_autumn",
      "halloween",
    ]);
    expect(new Set(FESTIVAL_EVENTS.map((e) => e.id)).size).toBe(8);
  });

  it("names match docs/spec/01-roadmap.md", () => {
    expect(FESTIVAL_EVENTS.map((e) => [e.name, e.nameTh])).toEqual([
      ["Loy Krathong", "ลอยกระทง"],
      ["Christmas", "คริสต์มาส"],
      ["New Year", "ปีใหม่ 2027"],
      ["Chinese New Year", "ตรุษจีนปีมะแม"],
      ["Valentine’s Day", "วาเลนไทน์"],
      ["Songkran", "สงกรานต์"],
      ["Mid-Autumn", "ไหว้พระจันทร์"],
      ["Halloween", "ฮาโลวีน"],
    ]);
  });

  it("getEventConfig finds by id", () => {
    expect(getEventConfig("songkran")?.nameTh).toBe("สงกรานต์");
  });
});
