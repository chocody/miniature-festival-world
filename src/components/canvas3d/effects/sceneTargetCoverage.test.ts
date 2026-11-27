// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SCENE_TARGET_KINDS, type SceneTargetKind } from "@/config/gimmicks.config";
import { SCENE_OBJECT_NAMES } from "../sceneObjectNames";

type NameKey = keyof typeof SCENE_OBJECT_NAMES;

/** Every visible scene object → the object type whose tap reaction it gets (MFW-60 AC2: every visible object type answers a tap). */
const TAPPABLE: Partial<Record<NameKey, SceneTargetKind | readonly SceneTargetKind[]>> = {
  water: "water",
  ground: "sky",
  bankLeft: "sky",
  bankRight: "sky",
  houseBodies: "house",
  houseRoofs: "house",
  houseRoofsGable: "house",
  houseWindows: "house",
  treeTrunks: "tree",
  leafClumps: ["tree", "bush"], // tree crowns and bushes share the clump mesh; the owner refs pick tree or bush
  riversidePlants: "reed",
  rocks: "rock",
  lampPosts: "lamp", // the lamp tap proxy spans the whole post and head (MFW-60 polish)
  lampHeads: "lamp",
  pierDeck: "pier",
  pierPiles: "pier",
  krathong: "krathong",
  krathongPose: "krathong",
  krathongDesignBody: "krathong", // MFW-65: the hero body of an owner-supplied design, inside the krathong pose
  riverKrathongBatch: "krathong",
  villagers: "villager",
  villagerBodies: "villager",
  villagerHeads: "villager",
  villagerHats: "villager",
};
/** Not an object of its own: effects, shadows, highlights, focus anchors, name prefixes, motes. */
const NOT_AN_OBJECT: readonly NameKey[] = [
  "worldView",
  "krathongMarkCue",
  "pierFocus",
  "lampFocus",
  "findMyAnchor",
  "ripples",
  "lampGlows",
  "windowGlows",
  "fireworks",
  "skyLanterns",
  "chimneySmoke", // MFW-72 effects
  "fallingLeaves",
  "lampGroundLights", // MFW-75 effect
  "riverBatchMeshPrefix",
  "lampTapPrefix",
  "riverHitPrefix",
  "propTapPrefix",
  "environmentBlobShadows",
  "riverBlobShadows",
  "krathongBlobShadow",
  "villagerBlobShadows",
  "shoreHighlights",
  "waterGlints",
  "krathongRipples",
  "ambientMotes",
  // MFW-101: the Christmas ornament hero; not mounted in the Loy scene (no Loy tap kind). Its taps belong to the tree (16.18).
  "ornamentDesignBody",
  "ornamentFallback",
];

describe("scene target coverage (MFW-60 AC2)", () => {
  it("CV1: every SCENE_OBJECT_NAMES entry is either tappable (with a kind) or explicitly not an object", () => {
    const keys = Object.keys(SCENE_OBJECT_NAMES) as NameKey[];
    for (const key of keys) {
      const inTappable = key in TAPPABLE;
      const inNot = NOT_AN_OBJECT.includes(key);
      expect(inTappable !== inNot, `${key} must be in exactly one list`).toBe(true);
    }
    expect([...Object.keys(TAPPABLE), ...NOT_AN_OBJECT].sort()).toEqual([...keys].sort());
  });

  it("CV2: every SceneTargetKind appears as a tappable value", () => {
    const kinds = new Set<SceneTargetKind>(Object.values(TAPPABLE).flat());
    for (const kind of SCENE_TARGET_KINDS) expect(kinds.has(kind), kind).toBe(true);
  });
});
