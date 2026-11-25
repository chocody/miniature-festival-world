import type { FestivalEventId } from "./events/types";

/**
 * Private-test override (owner, open question 26, MFW-53): forces the active event whatever the date.
 * null = resolve by date. SERVER-ONLY: imported only by src/services/api/activeEvent.ts (pinned by
 * tests/unit/active-event-boundary.test.ts). Not an env var, never a client choice.
 */
export const ACTIVE_EVENT_OVERRIDE: FestivalEventId | null = "loy_krathong";
