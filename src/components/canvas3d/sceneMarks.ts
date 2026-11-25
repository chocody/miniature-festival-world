import type { CameraTargetKind } from "@/core/camera";

export interface SceneMarks {
  /** River krathong (RiverFlow) to mark, or null. */
  readonly markedRiverId: string | null;
  /** The own krathong (OwnKrathong) carries the mark. */
  readonly ownMarked: boolean;
}

export interface SceneMarkInput {
  readonly selectedTarget: CameraTargetKind | null;
  readonly findMyId: string | null; // findMyItem?.id ?? null
  readonly ownId: string | null; // ritual.saved?.id ?? null
  readonly ownShown: boolean; // isOwnSlotReserved(poseKind): the own krathong is drawn by OwnKrathong, not RiverFlow
}

const NO_MARK: SceneMarks = Object.freeze({ markedRiverId: null, ownMarked: false });
const OWN_MARK: SceneMarks = Object.freeze({ markedRiverId: null, ownMarked: true });

/** Exactly one object at most carries the selection / Find My cue (MFW-67, replaces the highlight ring). */
export function getSceneMarks(input: SceneMarkInput): SceneMarks {
  if (input.selectedTarget === "krathong") return OWN_MARK;
  if (input.selectedTarget === "riverKrathong" && input.findMyId !== null) {
    if (input.ownShown && input.ownId !== null && input.findMyId === input.ownId) return OWN_MARK;
    return { markedRiverId: input.findMyId, ownMarked: false };
  }
  return NO_MARK;
}
