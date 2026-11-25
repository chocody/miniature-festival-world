// @vitest-environment node
import { describe, expect, it } from "vitest";
import { INSPECT_POPUP_COPY } from "@/config/inspect.config";
import { MODERATION_COPY } from "@/config/moderation.config";
import { OWNER_SWITCH_COPY } from "@/config/ownerWish.config";
import { DISPLAY_NAME_FALLBACK, WISH_COPY, WISH_SWITCH_COPY } from "@/config/wish.config";
import { publicCreationsToRiverItems } from "@/core/world";
import { toClientPublicCreation } from "@/services/api/zoneClient";
import * as copy from "../e2e/fixtures/wishCopy";
import { E2E_SECOND_CREATION_ID, makeSwitchZoneItem } from "../e2e/fixtures/wishSwitchRoutes";
import { E2E_CREATION_ID } from "../e2e/fixtures/ritualRoutes";

describe("wish switch e2e fixtures (MFW-63)", () => {
  it("copy literals equal the config values", () => {
    expect(copy.WISH_DIALOG_TITLE).toBe(WISH_COPY.title);
    expect(copy.WISH_TEXT_LABEL).toBe(WISH_COPY.textLabel);
    expect(copy.WISH_NAME_LABEL).toBe(WISH_COPY.nameLabel);
    expect(copy.WISH_SUBMIT_LABEL).toBe(WISH_COPY.submit);
    expect(copy.WISH_SWITCH_LABEL).toBe(WISH_SWITCH_COPY.label);
    expect(copy.DISPLAY_NAME_FALLBACK_TEXT).toBe(DISPLAY_NAME_FALLBACK);
    expect(copy.INSPECT_DIALOG_TITLE).toBe(INSPECT_POPUP_COPY.dialogTitle);
    expect(copy.REPORT_LABEL).toBe(INSPECT_POPUP_COPY.report);
    expect(copy.OWNER_STAYED_PRIVATE).toBe(OWNER_SWITCH_COPY.stayedPrivate);
    expect(copy.PHONE_REASON).toBe(MODERATION_COPY.reasons.phone);
  });

  it("an own zone item passes the client validators and keeps its name only when open", () => {
    const now = Date.now();
    const open = makeSwitchZoneItem(E2E_CREATION_ID, now, { open: true, text: "ขอให้สมหวัง", name: "น้องมะลิ" });
    const parsed = toClientPublicCreation(open, "loy_krathong", 1);
    expect(parsed).not.toBeNull();
    expect(parsed!.displayName).toBe("น้องมะลิ");
    expect(parsed!.publicWishText).toBe("ขอให้สมหวัง");
    expect(publicCreationsToRiverItems([parsed!], { eventId: "loy_krathong", zoneId: 1 })).toHaveLength(1);

    const closed = toClientPublicCreation(
      makeSwitchZoneItem(E2E_SECOND_CREATION_ID, now, { open: false, text: "ขอให้สมหวัง", name: "น้องมะลิ" }),
      "loy_krathong",
      1,
    );
    expect(closed).not.toBeNull();
    expect(closed!.publicWishText).toBeNull();
    expect(closed!.displayName).toBeNull();
    expect(E2E_SECOND_CREATION_ID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
