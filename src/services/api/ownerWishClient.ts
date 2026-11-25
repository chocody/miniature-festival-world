import { OWNER_WISH_REVEAL_TIMEOUT_MS } from "@/config/ownerWish.config";
import { getDeviceOwnerVault, type DeviceOwnerToken } from "@/services/auth";
import { isPlainObject } from "./json";
import { OWNER_WISH_REVEAL_PATH, type OwnerWishRevealRequestBody } from "./ownerWishRevealTypes";

export type OwnerWishRevealOutcome =
  | { readonly kind: "revealed"; readonly wishText: string }
  | { readonly kind: "none" } // the server answered null, or this device has no token
  | { readonly kind: "failed" }; // network, timeout, non-200, malformed answer, unexpected error

export type OwnerWishFetch = (input: string, init: RequestInit) => Promise<Response>;

export interface OwnerWishRevealer {
  /** Never throws, never logs, never caches the text. */
  reveal(creationId: string): Promise<OwnerWishRevealOutcome>;
}

export interface OwnerWishRevealerDeps {
  readonly fetch?: OwnerWishFetch; // default: global fetch looked up at call time
  readonly readOwnerToken?: () => DeviceOwnerToken | null; // default () => getDeviceOwnerVault().read() — never creates a token
  readonly timeoutMs?: number; // default OWNER_WISH_REVEAL_TIMEOUT_MS
}

const HTTP_OK = 200;
const NONE: OwnerWishRevealOutcome = Object.freeze({ kind: "none" });
const FAILED: OwnerWishRevealOutcome = Object.freeze({ kind: "failed" });

/** Exactly { wishText: non-empty string | null }; anything else → failed. */
export function parseOwnerWishRevealResponse(value: unknown): OwnerWishRevealOutcome {
  if (!isPlainObject(value)) return FAILED;
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "wishText") return FAILED;
  const wishText = value.wishText;
  if (wishText === null) return NONE;
  if (typeof wishText === "string" && wishText !== "") return { kind: "revealed", wishText };
  return FAILED;
}

export function createOwnerWishRevealer(deps: OwnerWishRevealerDeps = {}): OwnerWishRevealer {
  const fetchImpl: OwnerWishFetch = deps.fetch ?? ((input, init) => fetch(input, init));
  const readOwnerToken = deps.readOwnerToken ?? (() => getDeviceOwnerVault().read());
  const timeoutMs = deps.timeoutMs ?? OWNER_WISH_REVEAL_TIMEOUT_MS;
  return {
    async reveal(creationId) {
      if (typeof creationId !== "string" || creationId === "") return FAILED;
      let token: DeviceOwnerToken | null;
      try {
        token = readOwnerToken();
      } catch {
        return FAILED; // e.g. called on the server
      }
      if (token === null) return NONE; // no token on this device: it owns nothing; no request
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const body: OwnerWishRevealRequestBody = { creationId, ownerToken: token };
        const response = await fetchImpl(OWNER_WISH_REVEAL_PATH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
          credentials: "omit",
          redirect: "error", // a redirect would re-send the body (and the token) elsewhere
          referrerPolicy: "no-referrer",
          signal: controller.signal,
        });
        if (response.status !== HTTP_OK) {
          await response.body?.cancel().catch(() => undefined);
          return FAILED;
        }
        return parseOwnerWishRevealResponse(await response.json());
      } catch {
        return FAILED;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

let shared: OwnerWishRevealer | null = null;
/** Lazy singleton used by PrivateWishReveal. */
export function getOwnerWishRevealer(): OwnerWishRevealer {
  shared ??= createOwnerWishRevealer();
  return shared;
}
