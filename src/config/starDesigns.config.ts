/**
 * New Year wish-star designs (MFW-131). These are placeholder designs, and there is no colour key
 * (plan docs/plans/L17-new-year.md N3). Rendering comes later (17.14 / N17).
 */
export const STAR_DESIGN_IDS = Object.freeze(["star_classic_01", "star_sparkle_01", "star_comet_01"] as const);
export type StarDesignId = (typeof STAR_DESIGN_IDS)[number];

/** Design preselected for new New Year creations. Lead decision MFW-131, DRAFT, owner to confirm. */
export const STAR_DEFAULT_DESIGN: StarDesignId = "star_classic_01";
