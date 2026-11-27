import type { FestivalEventId } from "@/config/events/types";
import { LOY_KRATHONG_PIER_RELEASE_SPOT } from "@/config/events/loyKrathong.riverLane.config";
import { DEFAULT_KRATHONG_APPEARANCE, serializeKrathongAppearance } from "@/core/customization/krathongAppearance";
import {
  buildReleaseCoord,
  didServerMoveSpot,
  estimateServerClockOffsetMs,
  type ReleaseOrigin,
  type RitualErrorKind,
  type SavedRelease,
} from "@/core/ritual";
import type { SplinePathCoord } from "@/core/coordinates/SplinePathCoord";
import type { ReleaseLanding } from "@/core/world/releaseSpot";
import type { RiverSpot } from "@/core/world/riverCollision";
import { getDeviceOwnerVault, type DeviceOwnerToken } from "@/services/auth";
import { useBuilderStore } from "@/store/useBuilderStore";
import { useDeviceStore } from "@/store/useDeviceStore";
import { useUIStore } from "@/store/useUIStore";
import { useWorldStore } from "@/store/useWorldStore";
import type { CreateCreationRequestBody } from "./createCreationTypes";
import { submitCreation, type CreateCreationResult } from "./createCreationClient";
import type { PublicCreation, AppearanceJson } from "./creationTypes";
import { evaluateDisplayName, type DisplayNameEvaluation } from "./displayName";
import { evaluateWishDraft, toWishRequestFields, type WishDraftEvaluation } from "./wishPayload";
import { getZonePagination } from "./zonePagination";

export type ResolveReleaseLanding = (
  candidate: RiverSpot,
  zoneItems: readonly PublicCreation[],
  zone: { eventId: FestivalEventId; zoneId: number } | null,
  nowMs: number,
) => ReleaseLanding;
export type ReleaseOutcome = "saved" | "failed" | "revise_wish" | "ignored";

export interface ReleaseCreationDeps {
  readonly submit?: (body: CreateCreationRequestBody) => Promise<CreateCreationResult>; // default submitCreation
  readonly getOwnerToken?: () => DeviceOwnerToken; // default () => getDeviceOwnerVault().getOrCreate().token
  readonly now?: () => number; // default Date.now
  readonly loadLandingResolver?: () => Promise<ResolveReleaseLanding>;
  readonly loadZone?: (zoneId: number) => Promise<unknown>; // default (id) => getZonePagination().loadZone(id)
}
export interface ReleaseCreation {
  release(origin: ReleaseOrigin): Promise<ReleaseOutcome>;
  /** Hook point for MFW-30 (creation-id list in LocalStorage, owner decision 12). Returns an unsubscribe. */
  onCreationSaved(listener: (creation: PublicCreation) => void): () => void;
}

const defaultLoadLandingResolver = (): Promise<ResolveReleaseLanding> =>
  import("@/core/world/releaseSpot").then((m) => m.resolveReleaseLandingForZone);

export function createReleaseCreation(deps: ReleaseCreationDeps = {}): ReleaseCreation {
  const submit = deps.submit ?? ((body: CreateCreationRequestBody) => submitCreation(body));
  const getOwnerToken = deps.getOwnerToken ?? (() => getDeviceOwnerVault().getOrCreate().token);
  const now = deps.now ?? Date.now;
  const loadLandingResolver = deps.loadLandingResolver ?? defaultLoadLandingResolver;
  const loadZone = deps.loadZone ?? ((zoneId: number) => getZonePagination().loadZone(zoneId));
  const listeners = new Set<(creation: PublicCreation) => void>();

  const isStale = (attempt: number): boolean => {
    const r = useUIStore.getState().ritual;
    return r.attempt !== attempt || r.phase !== "RELEASING";
  };

  async function release(origin: ReleaseOrigin): Promise<ReleaseOutcome> {
    const ui = useUIStore.getState();
    // 1. Guard (other festivals are stubs).
    if (ui.flowState !== "RITUAL_RELEASE" || ui.ritual.phase !== "IDLE" || ui.selectedEventId !== "loy_krathong") {
      return "ignored";
    }
    // 2. Wish: re-evaluate, never trust the stored composition blindly.
    const { wish, wishDisplayName } = useBuilderStore.getState();
    let evaluation: WishDraftEvaluation | null;
    let nameEvaluation: DisplayNameEvaluation | null;
    try {
      evaluation = wish === null ? null : evaluateWishDraft({ text: wish.text, visibility: wish.visibility });
      nameEvaluation = evaluateDisplayName(wishDisplayName);
    } catch {
      evaluation = null;
      nameEvaluation = null;
    }
    if (evaluation === null || !evaluation.ok || nameEvaluation === null || !nameEvaluation.ok) {
      ui.dispatch({ type: "REVISE_WISH" });
      return "revise_wish";
    }
    // 3. Start.
    const attempt = ui.ritual.attempt + 1;
    ui.dispatchRitual({ type: "RELEASE_STARTED", attempt, origin });
    // 4. Candidate spot.
    const candidate: RiverSpot = origin.kind === "drop" ? origin.candidate : LOY_KRATHONG_PIER_RELEASE_SPOT;
    // 5. Landing (client pre-check, only when the scene can mount).
    const device = useDeviceStore.getState();
    const sceneTier = device.profiled && device.webglAvailable;
    let landed: ReleaseLanding = { landing: candidate, collided: false };
    if (sceneTier) {
      try {
        const resolve = await loadLandingResolver();
        const w = useWorldStore.getState();
        const zone =
          w.eventId === "loy_krathong" && w.currentZoneId !== null
            ? { eventId: w.eventId, zoneId: w.currentZoneId }
            : null;
        landed = resolve(candidate, w.zoneItems, zone, now());
      } catch {
        landed = { landing: candidate, collided: false };
      }
    }
    if (isStale(attempt)) return "ignored";
    useUIStore
      .getState()
      .dispatchRitual({ type: "LANDING_RESOLVED", attempt, landing: landed.landing, collided: landed.collided });

    // 6. Body.
    const coord = buildReleaseCoord(landed.landing);
    let body: CreateCreationRequestBody;
    try {
      body = {
        eventId: "loy_krathong",
        appearance: serializeKrathongAppearance(
          (useBuilderStore.getState().appearance ?? DEFAULT_KRATHONG_APPEARANCE) as typeof DEFAULT_KRATHONG_APPEARANCE,
        ) as unknown as AppearanceJson,
        coord,
        ...toWishRequestFields(evaluation.wish), // wishText, wishVisibility
        ...(nameEvaluation.name !== null ? { displayName: nameEvaluation.name } : {}), // omitted when there is no name (MFW-63)
        ownerToken: getOwnerToken(),
      };
    } catch {
      useUIStore.getState().dispatchRitual({ type: "SAVE_FAILED", attempt, error: { kind: "unexpected" } });
      return "failed";
    }

    // 7. Send.
    const sentAt = now();
    const result = await submit(body);
    const receivedAt = now();
    if (isStale(attempt)) {
      if (result.ok) useBuilderStore.setState({ wish: null, wishDisplayName: null, wishServerReasons: null }); // private text must not linger
      return "ignored";
    }

    if (result.ok) {
      // 8. Success: the server's coord and time are final.
      const c = result.creation;
      const finalCoord = c.coord as SplinePathCoord;
      const saved: SavedRelease = {
        id: c.id,
        zoneId: c.zoneId,
        coord: finalCoord,
        createdAtMs: Date.parse(c.createdAt),
        serverClockOffsetMs: estimateServerClockOffsetMs(c.createdAt, sentAt, receivedAt),
        movedByServer: didServerMoveSpot(coord, finalCoord),
      };
      useUIStore.getState().dispatchRitual({ type: "SAVED", attempt, saved });
      useBuilderStore.setState({ wish: null, wishDisplayName: null, wishServerReasons: null }); // private text must not linger
      for (const listener of [...listeners]) {
        try {
          listener(c);
        } catch {
          /* a failing listener must not break the save */
        }
      }
      const w = useWorldStore.getState();
      if (w.eventId === "loy_krathong" && w.currentZoneId !== c.zoneId) {
        void loadZone(c.zoneId).catch(() => undefined);
      }
      return "saved";
    }
    if (result.reason === "moderation_blocked") {
      // 9. Server moderation block: back to the wish step with the server's reasons.
      useBuilderStore.getState().rejectWishFromServer(result.moderationBody);
      useUIStore.getState().dispatchRitual({ type: "RESET" });
      useUIStore.getState().dispatch({ type: "REVISE_WISH" });
      return "revise_wish";
    }
    // 10. Any other failure: the wish stays for the retry.
    const kind: RitualErrorKind = result.reason === "aborted" ? "network" : result.reason;
    useUIStore.getState().dispatchRitual({ type: "SAVE_FAILED", attempt, error: { kind } });
    return "failed";
  }

  return {
    release,
    onCreationSaved(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

let singleton: ReleaseCreation | null = null;

/** App singleton (created on first call). */
export function getReleaseCreation(): ReleaseCreation {
  if (singleton === null) singleton = createReleaseCreation();
  return singleton;
}
