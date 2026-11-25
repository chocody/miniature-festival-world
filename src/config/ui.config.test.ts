import { describe, expect, it } from "vitest";
import { FLOW_STATES } from "@/core/flow";
import { RITUAL_COPY } from "./ritual.config";
import { APP_METADATA_COPY, FLOW_STEP_COPY } from "./ui.config";

const THAI = /[฀-๿]/;

describe("ui.config (MFW-55)", () => {
  it("every flow step has Thai copy, never the raw state id", () => {
    for (const state of FLOW_STATES) {
      const copy = FLOW_STEP_COPY[state];
      expect(copy.title, state).toMatch(THAI);
      expect(copy.title).not.toBe(state);
      expect(copy.title).not.toMatch(/[A-Z_]{4,}/);
      if (copy.hint !== null) expect(copy.hint, state).toMatch(THAI);
    }
    expect(FLOW_STEP_COPY.SHARED_WORLD_EXPLORE.hint).toBe(
      "ลากเพื่อเลื่อนหรือหมุนแม่น้ำ แตะสั้นที่น้ำ โคมไฟ หรือกระทงเพื่อเลือก",
    );
    expect(FLOW_STEP_COPY.RITUAL_RELEASE.hint).toBe(RITUAL_COPY.hint);
  });

  it("the document title and description are Thai", () => {
    for (const value of [APP_METADATA_COPY.title, APP_METADATA_COPY.description]) {
      expect(value).toMatch(THAI);
      expect(value).not.toBe("Create Next App");
    }
  });
});
