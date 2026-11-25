import { describe, expect, it } from "vitest";
import { EVENT_UTC_OFFSET } from "../eventCalendar.config";
import { FESTIVAL_ENDS_AT } from "../retention.config";
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

  it("every event declares at least one Bangkok-midnight date window", () => {
    const midnight = new RegExp(`^\\d{4}-\\d{2}-\\d{2}T00:00:00\\${EVENT_UTC_OFFSET}$`);
    for (const e of FESTIVAL_EVENTS) {
      expect(e.dateWindows.length).toBeGreaterThan(0);
      let prevEnd = -Infinity;
      for (const win of e.dateWindows) {
        expect(win.startsAt).toMatch(midnight);
        expect(win.endsAt).toMatch(midnight);
        expect(Date.parse(win.startsAt)).toBeLessThan(Date.parse(win.endsAt));
        expect(Date.parse(win.startsAt)).toBeGreaterThanOrEqual(prevEnd);
        prevEnd = Date.parse(win.endsAt);
      }
    }
  });

  it("date windows match docs/spec/01-roadmap.md §1.1", () => {
    const day = (d: string) => `${d}T00:00:00+07:00`;
    const expected = {
      loy_krathong: [["2026-11-24", "2026-11-25"], ["2027-11-13", "2027-11-14"]],
      christmas: [["2026-12-20", "2026-12-27"]],
      new_year: [["2026-12-28", "2027-01-06"]],
      chinese_new_year: [["2027-02-04", "2027-02-07"]],
      valentines: [["2027-02-12", "2027-02-16"]],
      songkran: [["2027-04-10", "2027-04-17"]],
      mid_autumn: [["2027-09-15", "2027-09-16"]],
      halloween: [["2027-10-31", "2027-11-01"]],
    };
    for (const e of FESTIVAL_EVENTS) {
      expect(e.dateWindows.map((x) => [x.startsAt, x.endsAt])).toEqual(
        expected[e.id].map(([a, b]) => [day(a), day(b)]),
      );
    }
  });

  it("no two windows overlap", () => {
    const all = FESTIVAL_EVENTS.flatMap((e) => e.dateWindows.map((x) => [Date.parse(x.startsAt), Date.parse(x.endsAt)]))
      .sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < all.length; i += 1) expect(all[i - 1][1]).toBeLessThanOrEqual(all[i][0]);
  });

  it("Loy Krathong 2026 window ends at the retention festival end", () => {
    expect(getEventConfig("loy_krathong")!.dateWindows[0].endsAt).toBe(FESTIVAL_ENDS_AT.loy_krathong);
  });
});
