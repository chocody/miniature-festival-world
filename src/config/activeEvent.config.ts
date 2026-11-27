import type { FestivalEventId } from "./events/types";

/**
 * The code constant is the private-test override (owner, open question 26, MFW-53): it forces the active
 * event whatever the date. null = resolve by date.
 * `ACTIVE_EVENT_OVERRIDE_ENV` names a server-only env var that overrides the constant on non-production
 * deployments only (owner, 2026-11-27, open question 26, MFW-88); it is ignored when VERCEL_ENV=production.
 * Still SERVER-ONLY: imported only by src/services/api/activeEvent.ts (pinned by
 * tests/unit/active-event-boundary.test.ts). Never a client choice.
 */
export const ACTIVE_EVENT_OVERRIDE: FestivalEventId | null = "loy_krathong";

export const ACTIVE_EVENT_OVERRIDE_ENV = "MFW_ACTIVE_EVENT_OVERRIDE";
