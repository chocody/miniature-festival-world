import { ACTIVE_EVENT_OVERRIDE, ACTIVE_EVENT_OVERRIDE_ENV } from "@/config/activeEvent.config";
import { FESTIVAL_EVENT_IDS, type FestivalEventId } from "@/config/events/types";
import { findNearestWindow, resolveActiveEvent, type ActiveEventResolution } from "@/core/events";
import { isProductionDeployment, type BackendEnv } from "./creationRepositoryFactory";

export interface ServerActiveEventDeps {
  /** Default: process.env, read at call time (per request). */
  readonly env?: BackendEnv;
  /** Default: ACTIVE_EVENT_OVERRIDE. Injectable for tests only. */
  readonly constantOverride?: FestivalEventId | null;
}

/** The override in force: the trimmed env value (non-production, non-blank), else the code constant. Not validated. */
export function selectActiveEventOverride(env: BackendEnv, constantOverride: FestivalEventId | null): string | null {
  if (isProductionDeployment(env)) return constantOverride;
  const raw = env[ACTIVE_EVENT_OVERRIDE_ENV];
  if (raw === undefined) return constantOverride;
  const value = raw.trim();
  return value === "" ? constantOverride : value;
}

/**
 * The ONE resolver the page and POST /api/creations share (MFW-53, MFW-88). Server-only: never import from a
 * "use client" module. Precedence: env (non-production only) > code constant > date. Unknown ids fail closed.
 */
export function resolveServerActiveEvent(nowMs: number, deps: ServerActiveEventDeps = {}): ActiveEventResolution {
  const env = deps.env ?? process.env;
  const constantOverride = "constantOverride" in deps ? (deps.constantOverride ?? null) : ACTIVE_EVENT_OVERRIDE;
  const selected = selectActiveEventOverride(env, constantOverride);
  if (selected !== null && !(FESTIVAL_EVENT_IDS as readonly string[]).includes(selected)) {
    return { kind: "none", nearest: findNearestWindow(nowMs) };
  }
  return resolveActiveEvent(nowMs, { override: selected as FestivalEventId | null });
}

export function isServerActiveEvent(eventId: FestivalEventId, nowMs: number, deps: ServerActiveEventDeps = {}): boolean {
  const r = resolveServerActiveEvent(nowMs, deps);
  return r.kind === "active" && r.eventId === eventId;
}
