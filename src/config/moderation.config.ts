/** spec §5 moderation_status enum; order equals the SQL enum public.moderation_status. */
export const MODERATION_STATUSES = Object.freeze(["approved", "flagged", "hidden"] as const);
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];
/** New rows are visible; the server-side guard (2.3, run by the 2.4 route) happens before the insert. Lead decision, MFW-12 (D12). */
export const DEFAULT_MODERATION_STATUS: ModerationStatus = "approved";
/** An item is auto-hidden when report_count reaches this value (owner, 2026-11-23, open question 3). Mirrored in the SQL view. */
export const AUTO_HIDE_REPORT_THRESHOLD = 3;
