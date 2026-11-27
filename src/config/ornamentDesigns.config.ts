/**
 * Christmas ornament designs (MFW-92). Procedural placeholder designs until the owner models arrive (owner, 2026-11-27).
 * Designs only, no colour key (plan D7 default).
 */
// Owner decision 2026-11-27: six hangable designs (snowman and gift pile are scene props).
export const ORNAMENT_DESIGN_IDS = Object.freeze(["ball_01", "star_01", "bow_01", "bell_01", "stocking_01", "gift_01"] as const);
export type OrnamentDesignId = (typeof ORNAMENT_DESIGN_IDS)[number];

/** Design preselected for new Christmas creations. Lead decision MFW-92, DRAFT, owner to confirm. */
export const ORNAMENT_DEFAULT_DESIGN: OrnamentDesignId = "ball_01";
