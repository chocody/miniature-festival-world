// @vitest-environment node
import { describe, expect, it } from "vitest";
import { INSPECT_POPUP_COPY, WISH_BUBBLE_TIMING } from "@/config/inspect.config";
import * as helper from "../e2e/helpers/wishBubble";

describe("wish-bubble e2e literals", () => {
  it("L1: match the app constants", () => {
    expect(helper.E2E_WISH_BUBBLE_VISIBLE_MS).toBe(WISH_BUBBLE_TIMING.visibleMs);
    expect(helper.E2E_WISH_BUBBLE_FADE_MS).toBe(WISH_BUBBLE_TIMING.fadeMs);
    expect(helper.E2E_REPORT_LABEL).toBe(INSPECT_POPUP_COPY.report);
    expect(helper.E2E_REPORT_CONFIRM).toBe(INSPECT_POPUP_COPY.reportConfirm);
    expect(helper.E2E_REPORT_RECEIVED).toBe(INSPECT_POPUP_COPY.reportReceived);
  });
});
