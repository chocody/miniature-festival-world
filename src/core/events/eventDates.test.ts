import { describe, expect, it } from "vitest";
import { getEventConfig } from "@/config/events";
import { describeFestivalWindow, formatEventDateRange } from "./eventDates";

const w = (startsAt: string, endsAt: string) => ({ startsAt, endsAt });

describe("formatEventDateRange", () => {
  it("formats the roadmap windows", () => {
    expect(formatEventDateRange(getEventConfig("loy_krathong")!.dateWindows[0])).toBe("24 พ.ย. 2026");
    expect(formatEventDateRange(getEventConfig("christmas")!.dateWindows[0])).toBe("20–26 ธ.ค. 2026");
    expect(formatEventDateRange(getEventConfig("new_year")!.dateWindows[0])).toBe("28 ธ.ค. 2026 – 5 ม.ค. 2027");
    expect(formatEventDateRange(getEventConfig("chinese_new_year")!.dateWindows[0])).toBe("4–6 ก.พ. 2027");
  });

  it("formats a range across months of one year", () => {
    expect(formatEventDateRange(w("2027-09-28T00:00:00+07:00", "2027-10-04T00:00:00+07:00"))).toBe("28 ก.ย. – 3 ต.ค. 2027");
  });

  it("returns null for an invalid window", () => {
    expect(formatEventDateRange(w("x", "2027-10-04T00:00:00+07:00"))).toBeNull();
    expect(formatEventDateRange(w("2027-10-04T00:00:00+07:00", "2027-10-04T00:00:00+07:00"))).toBeNull();
  });

  it("uses the Bangkok calendar day, not the host zone (a UTC-based day would be 23)", () => {
    expect(formatEventDateRange(w("2026-11-24T00:00:00+07:00", "2026-11-25T00:00:00+07:00"))).toBe("24 พ.ย. 2026");
  });
});

describe("describeFestivalWindow", () => {
  it("returns names and the date label", () => {
    expect(describeFestivalWindow({ eventId: "christmas", window: getEventConfig("christmas")!.dateWindows[0] })).toEqual({
      eventId: "christmas",
      name: "Christmas",
      nameTh: "คริสต์มาส",
      datesLabel: "20–26 ธ.ค. 2026",
    });
  });
});
