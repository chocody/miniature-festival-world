import type { FestivalEventId } from "@/config/events/types";
import type { PersistableCoord } from "@/core/coordinates/types";
import type { ReleaseOrigin, RitualSpot } from "@/core/ritual";
import type { BuilderState } from "@/store/useBuilderStore";
import type { AppearanceJson, PublicCreation } from "./creationTypes";

export type BuilderAppearanceState = Pick<BuilderState, "appearance" | "ornamentAppearance" | "starAppearance">;
export interface ReleaseZoneView {
  readonly zoneItems: readonly PublicCreation[];
  readonly zone: { readonly eventId: FestivalEventId; readonly zoneId: number } | null;
}
export interface ReleaseLandingContext {
  readonly sceneTier: boolean; // device.profiled && device.webglAvailable
  readonly now: () => number; // the service clock; call only when needed
  readonly readZone: () => ReleaseZoneView; // reads useWorldStore at call time
}
export interface ReleaseLandingResult {
  readonly landing: RitualSpot;
  readonly collided: boolean;
}
export interface ServerMoveInput {
  readonly landing: RitualSpot; // what LANDING_RESOLVED stored
  readonly sent: PersistableCoord; // body.coord
  readonly final: PersistableCoord; // the 201 creation.coord
  readonly finalZoneId: number; // the 201 creation.zoneId
}
/** Per-event part of the release pipeline. A new event adds one adapter to the registry. */
export interface ReleaseEventAdapter {
  readonly eventId: FestivalEventId;
  acceptsOrigin(origin: ReleaseOrigin): boolean; // guard
  defaultCandidate(ctx: ReleaseLandingContext): RitualSpot; // for origin "pier"
  resolveLanding(candidate: RitualSpot, ctx: ReleaseLandingContext): ReleaseLandingResult | Promise<ReleaseLandingResult>; // never rejects; sync when nothing is awaited
  buildCoord(landing: RitualSpot): PersistableCoord; // may throw RangeError
  didServerMove(input: ServerMoveInput): boolean;
  serializeAppearance(builder: BuilderAppearanceState): AppearanceJson; // may throw
}
export type ReleaseAdapterRegistry = ReadonlyMap<FestivalEventId, ReleaseEventAdapter>;
