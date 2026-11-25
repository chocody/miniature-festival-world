// MFW-63 (backlog 12.2): client transport of the wish visibility switch (POST /api/wish-visibility, MFW-62).
// Mirrors ownerWishClient.ts: the raw token goes only in the JSON body (open question 1); never logged, never cached.
import { WISH_VISIBILITY_CONFLICT_RETRIES, WISH_VISIBILITY_TIMEOUT_MS } from "@/config/ownerWish.config";
import { getDeviceOwnerVault, type DeviceOwnerToken } from "@/services/auth";
import { parseModerationBlockedBody, type ModerationReason } from "@/services/moderation";
import { isPlainObject } from "./json";
import { WISH_VISIBILITY_PATH, type WishVisibilityRequestBody } from "./wishVisibilityTypes";

export type WishVisibilityOutcome =
  | { readonly kind: "switched"; readonly open: boolean }
  | { readonly kind: "moderation_blocked"; readonly reasons: readonly ModerationReason[] }
  | { readonly kind: "hidden" } // 409 hidden: hidden by reports/moderation, can never be opened (owner decision 36)
  | { readonly kind: "not_found" } // 404, or this device has no token (it owns nothing)
  | { readonly kind: "failed" }; // network, timeout, 4xx/5xx, malformed answer, conflict after retries, bad input

export type WishVisibilityFetch = (input: string, init: RequestInit) => Promise<Response>;

export interface WishVisibilitySwitcherDeps {
  readonly fetch?: WishVisibilityFetch; // default: global fetch looked up at call time
  readonly readOwnerToken?: () => DeviceOwnerToken | null; // default () => getDeviceOwnerVault().read() — never creates a token
  readonly timeoutMs?: number; // default WISH_VISIBILITY_TIMEOUT_MS
  readonly conflictRetries?: number; // default WISH_VISIBILITY_CONFLICT_RETRIES
}

export interface WishVisibilitySwitcher {
  /** Never throws, never logs, never caches. */
  setOpen(creationId: string, open: boolean): Promise<WishVisibilityOutcome>;
}

const FAILED: WishVisibilityOutcome = Object.freeze({ kind: "failed" });
const NOT_FOUND: WishVisibilityOutcome = Object.freeze({ kind: "not_found" });
const HIDDEN: WishVisibilityOutcome = Object.freeze({ kind: "hidden" });

function errorOf(body: unknown): unknown {
  return isPlainObject(body) ? body.error : undefined;
}

/** Maps one answer; "conflict" = 409 {error:"conflict"} (the caller may retry). */
export function parseWishVisibilityAnswer(
  status: number,
  body: unknown,
  requested: boolean,
): WishVisibilityOutcome | "conflict" {
  switch (status) {
    case 200: {
      if (!isPlainObject(body)) return FAILED;
      const keys = Object.keys(body);
      if (keys.length !== 1 || keys[0] !== "open" || body.open !== requested) return FAILED;
      return Object.freeze({ kind: "switched" as const, open: requested });
    }
    case 422: {
      const blocked = parseModerationBlockedBody(body);
      return blocked === null ? FAILED : Object.freeze({ kind: "moderation_blocked" as const, reasons: blocked.reasons });
    }
    case 409: {
      const error = errorOf(body);
      if (error === "hidden") return HIDDEN;
      if (error === "conflict") return "conflict";
      return FAILED;
    }
    case 404:
      return NOT_FOUND;
    default:
      return FAILED;
  }
}

export function createWishVisibilitySwitcher(deps: WishVisibilitySwitcherDeps = {}): WishVisibilitySwitcher {
  const fetchImpl: WishVisibilityFetch = deps.fetch ?? ((input, init) => fetch(input, init));
  const readOwnerToken = deps.readOwnerToken ?? (() => getDeviceOwnerVault().read());
  const timeoutMs = deps.timeoutMs ?? WISH_VISIBILITY_TIMEOUT_MS;
  const conflictRetries = deps.conflictRetries ?? WISH_VISIBILITY_CONFLICT_RETRIES;

  async function attempt(body: WishVisibilityRequestBody): Promise<WishVisibilityOutcome | "conflict"> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(WISH_VISIBILITY_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        credentials: "omit",
        redirect: "error", // a redirect would re-send the body (and the token) elsewhere
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      let answer: unknown;
      try {
        answer = await response.json();
      } catch {
        answer = undefined;
      }
      return parseWishVisibilityAnswer(response.status, answer, body.open);
    } catch {
      return FAILED;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async setOpen(creationId, open) {
      if (typeof creationId !== "string" || creationId === "" || typeof open !== "boolean") return FAILED;
      let token: DeviceOwnerToken | null;
      try {
        token = readOwnerToken();
      } catch {
        return FAILED; // e.g. called on the server
      }
      if (token === null) return NOT_FOUND; // no token on this device: it owns nothing; no request
      const body: WishVisibilityRequestBody = { creationId, ownerToken: token, open };
      const attempts = 1 + Math.max(0, Math.floor(conflictRetries));
      for (let i = 0; i < attempts; i++) {
        const outcome = await attempt(body);
        if (outcome !== "conflict") return outcome;
      }
      return FAILED;
    },
  };
}

let shared: WishVisibilitySwitcher | null = null;
/** Lazy singleton used by OwnerWishControls. */
export function getWishVisibilitySwitcher(): WishVisibilitySwitcher {
  shared ??= createWishVisibilitySwitcher();
  return shared;
}
