import type { Page } from "@playwright/test";
import { E2E_CREATION_ID, type CapturedCreate } from "./ritualRoutes";
import { E2E_EVENT_ID, makeZoneBody, makeZoneItem } from "./zoneFixtures";

/** Id of the second krathong created in one test (after a reload). */
export const E2E_SECOND_CREATION_ID = "5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a";
const CREATION_IDS = [E2E_CREATION_ID, E2E_SECOND_CREATION_ID] as const;
const ZONE_ID = 1;
const ZONE_FILLER_COUNT = 3;
/** Zone item index used for the coord of the created krathongs: spawnProgress 0.5, away from the filler items and the pier. */
const OWN_ITEM_INDEX = 50;
const E2E_EXPIRY_DAYS = 30;
const MS_PER_DAY = 86_400_000;

export interface CapturedSwitch {
  readonly url: string;
  readonly body: Record<string, unknown>;
}
export interface WishSwitchWorld {
  readonly creates: CapturedCreate[];
  readonly switches: CapturedSwitch[];
  isOpen(id: string): boolean | undefined;
  /** The next open:true answers 422 {error:"moderation_blocked", reasons}. */
  rejectNextOpen(reasons: readonly string[]): void;
}

interface CreatedState {
  open: boolean;
  readonly text: string;
  readonly name: string | null;
  readonly token: unknown;
  readonly createdAtMs: number;
}

/** The user's krathong as GET /api/creations returns it: wish text and name only while open. */
export function makeSwitchZoneItem(
  id: string,
  createdAtMs: number,
  wish: { open: boolean; text: string; name: string | null },
  appearance?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...makeZoneItem(ZONE_ID, OWN_ITEM_INDEX),
    ...(appearance === undefined ? {} : { appearance }),
    id,
    createdAt: new Date(createdAtMs).toISOString(),
    publicWishText: wish.open ? wish.text : null,
    displayName: wish.open ? wish.name : null,
  };
}

/** Stateful fake of /api/zones, /api/creations (GET + POST) and /api/wish-visibility. The state survives page.reload(). */
export async function routeWishSwitchWorld(
  page: Page,
  options?: { readonly ownAppearance?: Record<string, unknown> },
): Promise<WishSwitchWorld> {
  const creates: CapturedCreate[] = [];
  const switches: CapturedSwitch[] = [];
  const state = new Map<string, CreatedState>();
  let pendingReject: readonly string[] | null = null;

  await page.route(
    (url) => url.pathname === "/api/zones",
    (route) => route.fulfill({ json: { eventId: E2E_EVENT_ID, zoneCount: 1 } }),
  );
  await page.route(
    (url) => url.pathname === "/api/creations",
    async (route) => {
      const request = route.request();
      if (request.method() === "GET") {
        const body = makeZoneBody(ZONE_ID, ZONE_FILLER_COUNT);
        for (const [id, s] of state) body.items.push(makeSwitchZoneItem(id, s.createdAtMs, s, options?.ownAppearance));
        return route.fulfill({ headers: { "cache-control": "no-store" }, json: body });
      }
      const body = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
      creates.push({ url: request.url(), body });
      const id = CREATION_IDS[creates.length - 1];
      if (id === undefined) return route.fulfill({ status: 503, json: { error: "unavailable" } });
      const now = Date.now();
      const created: CreatedState = {
        open: body.wishVisibility === "public",
        text: String(body.wishText),
        name: typeof body.displayName === "string" ? body.displayName : null,
        token: body.ownerToken,
        createdAtMs: now,
      };
      state.set(id, created);
      return route.fulfill({
        status: 201,
        headers: { "cache-control": "no-store" },
        json: {
          creation: {
            id,
            eventId: body.eventId,
            zoneId: ZONE_ID,
            appearance: body.appearance,
            coord: body.coord,
            publicWishText: created.open ? created.text : null,
            createdAt: new Date(now).toISOString(),
            expiresAt: new Date(now + E2E_EXPIRY_DAYS * MS_PER_DAY).toISOString(),
            displayName: created.open ? created.name : null,
          },
        },
      });
    },
  );
  await page.route(
    (url) => url.pathname === "/api/wish-visibility",
    async (route) => {
      const request = route.request();
      const body = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
      switches.push({ url: request.url(), body });
      if (new URL(request.url()).search !== "") return route.fulfill({ status: 400, json: { error: "unexpected_query" } });
      const s = typeof body.creationId === "string" ? state.get(body.creationId) : undefined;
      if (s === undefined || body.ownerToken !== s.token || typeof body.open !== "boolean") {
        return route.fulfill({ status: 404, json: { error: "not_found" } });
      }
      if (body.open && pendingReject !== null) {
        const reasons = pendingReject;
        pendingReject = null;
        return route.fulfill({ status: 422, json: { error: "moderation_blocked", reasons } });
      }
      s.open = body.open;
      return route.fulfill({ status: 200, headers: { "cache-control": "no-store" }, json: { open: s.open } });
    },
  );

  return {
    creates,
    switches,
    isOpen: (id) => state.get(id)?.open,
    rejectNextOpen: (reasons) => {
      pendingReject = [...reasons];
    },
  };
}
