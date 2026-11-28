// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CHRISTMAS_COPY } from "@/config/events/christmas.copy";
import { LOY_KRATHONG_COPY } from "@/config/events/loyKrathong.copy";
import {
  E2E_CANCEL_CREATE_LABEL,
  E2E_CHRISTMAS_START_CREATE_LABEL,
  E2E_START_CREATE_LABEL,
} from "../e2e/fixtures/landingFixtures";

describe("landing e2e literals (MFW-154)", () => {
  it("LL1 the e2e labels equal the copy table", () => {
    expect(E2E_START_CREATE_LABEL).toBe(LOY_KRATHONG_COPY.create.start);
    expect(E2E_CANCEL_CREATE_LABEL).toBe(LOY_KRATHONG_COPY.create.cancel);
    expect(E2E_CHRISTMAS_START_CREATE_LABEL).toBe(CHRISTMAS_COPY.create.start);
  });
});
