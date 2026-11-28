import type { FestivalEventId } from "@/config/events";
import type { FlowStepCopy } from "@/config/ui.config";
import type { WishComposerIssue } from "@/config/wish.config";
import type { FlowState } from "@/core/flow";
import type { RitualErrorKind } from "@/core/ritual/ritualStateMachine";
import { CHRISTMAS_COPY } from "./christmas.copy";
import { LOY_KRATHONG_COPY } from "./loyKrathong.copy";

export type EventFindMyIconId = "krathong" | "ornament";
export interface EventCustomizerCopy {
  readonly panelLabel: string;
  readonly designGroupLabel: string;
  readonly viewGroupLabel: string;
  readonly rotateLeft: string;
  readonly rotateRight: string;
  readonly zoomIn: string;
  readonly zoomOut: string;
  readonly done: string;
  readonly gestureHint: string;
}
export interface EventRitualCopy {
  readonly panelLabel: string;
  readonly hint: string;
  readonly releaseButton: string;
  readonly releasing: string;
  readonly dropOnWater: string;
  readonly errors: Readonly<Record<RitualErrorKind, string>>;
}
export interface EventWishCopy {
  readonly title: string;
  readonly textLabel: string;
  readonly textPlaceholder: string;
  readonly nameLabel: string;
  readonly namePlaceholder: string;
  readonly nameHint: string;
  readonly issues: Readonly<Record<Exclude<WishComposerIssue, "name_blocked" | "wish_blocked">, string>>;
  readonly submit: string;
}
export interface EventInspectCopy {
  readonly dialogTitle: string;
  readonly wishHeading: string;
  readonly fromLabel: string;
  readonly close: string;
}
export interface EventMyCreationsCopy {
  readonly openButton: string;
  readonly title: string;
  readonly searching: string;
  readonly found: string;
  readonly notFound: string;
  readonly failed: string;
}
export interface EventOwnerWishCopy {
  readonly heading: string;
  readonly deviceOnlyNote: string;
  readonly reveal: string;
  readonly revealing: string;
  readonly hide: string;
  readonly none: string;
  readonly failed: string;
  readonly retry: string;
}
export interface EventOwnerSwitchCopy {
  readonly heading: string;
  readonly loading: string;
  readonly loadFailed: string;
  readonly retryLoad: string;
  readonly saving: string;
  readonly switchedOn: string;
  readonly switchedOff: string;
  readonly stayedPrivate: string;
  readonly hidden: string;
  readonly notFound: string;
  readonly failed: string;
}
export interface EventZoneNavVerticalCopy {
  readonly up: string;
  readonly down: string;
}
export interface EventZoneNavCopy {
  readonly navLabel: string;
  readonly upstream: string;
  readonly downstream: string;
  readonly loading: string;
  readonly error: string;
  readonly retry: string;
  readonly vertical: EventZoneNavVerticalCopy | null;
}
/** The create entry (MFW-154): `start` = the landing button text; `cancel` = the customizer close control's aria-label. */
export interface EventCreateCopy {
  readonly start: string;
  readonly cancel: string;
}
export interface EventCopy {
  readonly flowSteps: Readonly<Record<FlowState, FlowStepCopy>>;
  readonly customizer: EventCustomizerCopy;
  readonly ritual: EventRitualCopy;
  readonly wish: EventWishCopy;
  readonly inspect: EventInspectCopy;
  readonly myCreations: EventMyCreationsCopy;
  readonly ownerWish: EventOwnerWishCopy;
  readonly ownerSwitch: EventOwnerSwitchCopy;
  readonly sceneTapHint: string;
  readonly zoneNav: EventZoneNavCopy;
  readonly findMyIcon: EventFindMyIconId;
  readonly create: EventCreateCopy;
}

/**
 * One entry per event; adding an event = one `<event>.copy.ts` file + one row here. An event without a row falls back to Loy
 * (today's behaviour; New Year gets its row in 17.9).
 */
export const EVENT_COPY: Readonly<Partial<Record<FestivalEventId, EventCopy>>> = Object.freeze({
  loy_krathong: LOY_KRATHONG_COPY,
  christmas: CHRISTMAS_COPY,
});

export function getEventCopy(eventId: FestivalEventId | null): EventCopy {
  return (eventId === null ? undefined : EVENT_COPY[eventId]) ?? LOY_KRATHONG_COPY;
}
