import type { SplinePathCoord } from "@/core/coordinates/SplinePathCoord";
import type { RiverSpot } from "@/core/world/riverCollision";

export type RitualPhase = "IDLE" | "RELEASING" | "RELEASED";
/** How a release started. Parametric only: the drop's world point stays in the 3D layer (invariant A). */
export type ReleaseOrigin =
  | { readonly kind: "pier" }
  | { readonly kind: "drop"; readonly candidate: RiverSpot };
export const RITUAL_ERROR_KINDS = Object.freeze([
  "network",
  "timeout",
  "unavailable",
  "event_closed",
  "rejected",
  "invalid_response",
  "unexpected",
] as const);
export type RitualErrorKind = (typeof RITUAL_ERROR_KINDS)[number];
export interface RitualError {
  readonly kind: RitualErrorKind;
}
export type RitualHint = "DROP_ON_WATER";

/** What the client keeps of a saved creation: public, parametric, no wish text (invariant C). */
export interface SavedRelease {
  readonly id: string;
  readonly zoneId: number;
  readonly coord: SplinePathCoord; // the SERVER's final coord
  readonly createdAtMs: number; // Date.parse(creation.createdAt), server time
  readonly serverClockOffsetMs: number; // estimateServerClockOffsetMs
  readonly movedByServer: boolean; // didServerMoveSpot(sent, final)
}

export interface RitualState {
  readonly phase: RitualPhase;
  readonly attempt: number; // 0 before the first release; RELEASE_STARTED uses attempt + 1; never reset
  readonly origin: ReleaseOrigin | null;
  readonly landing: RiverSpot | null; // the spot sent to the server (client pre-check), null until LANDING_RESOLVED
  readonly collided: boolean; // the client pre-check moved the candidate
  readonly touchedDown: boolean; // lowering finished: ripple + candle
  readonly instant: boolean; // no scene animates this ritual (no scene is mounted or the scene is gone)
  readonly saved: SavedRelease | null;
  readonly error: RitualError | null;
  readonly hint: RitualHint | null;
}

export type RitualEvent =
  | { readonly type: "RELEASE_STARTED"; readonly attempt: number; readonly origin: ReleaseOrigin }
  | { readonly type: "LANDING_RESOLVED"; readonly attempt: number; readonly landing: RiverSpot; readonly collided: boolean }
  | { readonly type: "TOUCHED_DOWN"; readonly attempt: number }
  | { readonly type: "SAVED"; readonly attempt: number; readonly saved: SavedRelease }
  | { readonly type: "SETTLED"; readonly attempt: number }
  | { readonly type: "SAVE_FAILED"; readonly attempt: number; readonly error: RitualError }
  | { readonly type: "SKIP_ANIMATION" }
  | { readonly type: "DROP_REJECTED" }
  | { readonly type: "RESET" };

export const INITIAL_RITUAL_STATE: RitualState = Object.freeze({
  phase: "IDLE",
  attempt: 0,
  origin: null,
  landing: null,
  collided: false,
  touchedDown: false,
  instant: false,
  saved: null,
  error: null,
  hint: null,
});

const frozen = (s: RitualState): RitualState => Object.freeze(s);

/** Pure. Any event that does not apply returns `s` itself (same reference). */
export function transitionRitual(s: RitualState, e: RitualEvent): RitualState {
  const match = (attempt: number): boolean => s.phase === "RELEASING" && attempt === s.attempt;
  switch (e.type) {
    case "RELEASE_STARTED":
      if (s.phase !== "IDLE" || e.attempt !== s.attempt + 1) return s;
      return frozen({
        ...INITIAL_RITUAL_STATE,
        phase: "RELEASING",
        attempt: e.attempt,
        origin: e.origin,
        instant: s.instant,
        touchedDown: s.instant,
      });
    case "LANDING_RESOLVED":
      if (!match(e.attempt) || s.landing !== null) return s;
      return frozen({ ...s, landing: e.landing, collided: e.collided });
    case "TOUCHED_DOWN":
      if (!match(e.attempt) || s.touchedDown) return s;
      return frozen({ ...s, touchedDown: true });
    case "SAVED":
      if (!match(e.attempt) || s.saved !== null) return s;
      return frozen(
        s.instant ? { ...s, saved: e.saved, touchedDown: true, phase: "RELEASED" } : { ...s, saved: e.saved },
      );
    case "SETTLED":
      if (!match(e.attempt) || !s.touchedDown || s.saved === null) return s;
      return frozen({ ...s, phase: "RELEASED" });
    case "SAVE_FAILED":
      if (!match(e.attempt)) return s;
      return frozen({ ...INITIAL_RITUAL_STATE, attempt: s.attempt, instant: s.instant, error: e.error });
    case "SKIP_ANIMATION":
      if (s.instant) return s;
      if (s.phase === "RELEASING") {
        return frozen({ ...s, instant: true, touchedDown: true, phase: s.saved !== null ? "RELEASED" : "RELEASING" });
      }
      return frozen({ ...s, instant: true });
    case "DROP_REJECTED":
      if (s.phase !== "IDLE") return s;
      if (s.hint === "DROP_ON_WATER" && s.error === null) return s;
      return frozen({ ...s, hint: "DROP_ON_WATER", error: null });
    case "RESET":
      return frozen({ ...INITIAL_RITUAL_STATE, attempt: s.attempt });
    default:
      return s;
  }
}

/** True when the bump must play: client collision or server move. */
export function isRitualBumped(s: RitualState): boolean {
  return s.collided || (s.saved?.movedByServer ?? false);
}
