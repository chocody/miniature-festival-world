import {
  estimateServerClockOffsetMs,
  type ReleaseOrigin,
  type RitualErrorKind,
  type SavedRelease,
} from "@/core/ritual";
import { getDeviceOwnerVault, type DeviceOwnerToken } from "@/services/auth";
import { useBuilderStore } from "@/store/useBuilderStore";
import { useDeviceStore } from "@/store/useDeviceStore";
import { useUIStore } from "@/store/useUIStore";
import { useWorldStore } from "@/store/useWorldStore";
import type { CreateCreationRequestBody } from "./createCreationTypes";
import { submitCreation, type CreateCreationResult } from "./createCreationClient";
import type { PublicCreation } from "./creationTypes";
import { evaluateDisplayName, type DisplayNameEvaluation } from "./displayName";
import { evaluateWishDraft, toWishRequestFields, type WishDraftEvaluation } from "./wishPayload";
import { getZonePagination } from "./zonePagination";
import type { ReleaseAdapterRegistry, ReleaseLandingContext, ReleaseLandingResult } from "./releaseAdapter";
import { createDefaultReleaseAdapters } from "./releaseAdapters";
import type { ResolveReleaseLanding } from "./loyReleaseAdapter";

export type { ResolveReleaseLanding } from "./loyReleaseAdapter";
export type ReleaseOutcome = "saved" | "failed" | "revise_wish" | "ignored";

export interface ReleaseCreationDeps {
  readonly submit?: (body: CreateCreationRequestBody) => Promise<CreateCreationResult>; // default submitCreation
  readonly getOwnerToken?: () => DeviceOwnerToken; // default () => getDeviceOwnerVault().getOrCreate().token
  readonly now?: () => number; // default Date.now
  readonly loadLandingResolver?: () => Promise<ResolveReleaseLanding>; // forwarded to the Loy adapter
  readonly adapters?: ReleaseAdapterRegistry; // default createDefaultReleaseAdapters
  readonly loadZone?: (zoneId: number) => Promise<unknown>; // default (id) => getZonePagination().loadZone(id)
}
export interface ReleaseCreation {
  release(origin: ReleaseOrigin): Promise<ReleaseOutcome>;
  /** Hook point for MFW-30 (creation-id list in LocalStorage, owner decision 12). Returns an unsubscribe. */
  onCreationSaved(listener: (creation: PublicCreation) => void): () => void;
}

export function createReleaseCreation(deps: ReleaseCreationDeps = {}): ReleaseCreation {
  const submit = deps.submit ?? ((body: CreateCreationRequestBody) => submitCreation(body));
  const getOwnerToken = deps.getOwnerToken ?? (() => getDeviceOwnerVault().getOrCreate().token);
  const now = deps.now ?? Date.now;
  const adapters = deps.adapters ?? createDefaultReleaseAdapters({ loadLandingResolver: deps.loadLandingResolver });
  const loadZone = deps.loadZone ?? ((zoneId: number) => getZonePagination().loadZone(zoneId));
  const listeners = new Set<(creation: PublicCreation) => void>();

  const isStale = (attempt: number): boolean => {
    const r = useUIStore.getState().ritual;
    return r.attempt !== attempt || r.phase !== "RELEASING";
  };

  async function release(origin: ReleaseOrigin): Promise<ReleaseOutcome> {
    const ui = useUIStore.getState();
    // 1. Guard (festivals without an adapter are stubs).
    if (ui.flowState !== "RITUAL_RELEASE" || ui.ritual.phase !== "IDLE") return "ignored";
    const adapter = ui.selectedEventId === null ? undefined : adapters.get(ui.selectedEventId);
    if (adapter === undefined || !adapter.acceptsOrigin(origin)) return "ignored";
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
    const device = useDeviceStore.getState();
    const ctx: ReleaseLandingContext = {
      sceneTier: device.profiled && device.webglAvailable,
      now,
      readZone: () => {
        const w = useWorldStore.getState();
        return {
          zoneItems: w.zoneItems,
          zone:
            w.eventId === adapter.eventId && w.currentZoneId !== null
              ? { eventId: adapter.eventId, zoneId: w.currentZoneId }
              : null,
        };
      },
    };
    const candidate = origin.kind === "pier" ? adapter.defaultCandidate(ctx) : origin.candidate;
    // 5. Landing (client pre-check, per event).
    let landed: ReleaseLandingResult;
    try {
      const resolved = adapter.resolveLanding(candidate, ctx);
      landed = resolved instanceof Promise ? await resolved : resolved; // no tick when the adapter answers synchronously
    } catch {
      landed = { landing: candidate, collided: false };
    }
    if (isStale(attempt)) return "ignored";
    useUIStore
      .getState()
      .dispatchRitual({ type: "LANDING_RESOLVED", attempt, landing: landed.landing, collided: landed.collided });

    // 6. Body.
    let coord: CreateCreationRequestBody["coord"];
    let body: CreateCreationRequestBody;
    try {
      coord = adapter.buildCoord(landed.landing);
      body = {
        eventId: adapter.eventId,
        appearance: adapter.serializeAppearance(useBuilderStore.getState()),
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
      const saved: SavedRelease = {
        id: c.id,
        zoneId: c.zoneId,
        coord: c.coord,
        createdAtMs: Date.parse(c.createdAt),
        serverClockOffsetMs: estimateServerClockOffsetMs(c.createdAt, sentAt, receivedAt),
        movedByServer: adapter.didServerMove({
          landing: landed.landing,
          sent: coord,
          final: c.coord,
          finalZoneId: c.zoneId,
        }),
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
      if (w.eventId === adapter.eventId && w.currentZoneId !== c.zoneId) {
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
