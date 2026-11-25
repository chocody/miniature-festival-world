import type { Page } from "@playwright/test";

/** Duplicated literals (do not import src/ into Playwright): checked by tests/unit/ritual-e2e-fixtures.test.ts. */
export const E2E_CREATION_ID = "0f8b6c1e-3a2d-4c5b-9e7f-1a2b3c4d5e6f";
export const E2E_OWNER_TOKEN_STORAGE_KEY = "mfw:deviceOwnerToken:v1"; // = DEVICE_OWNER_TOKEN_STORAGE_KEY
const E2E_LATERAL_LIMIT = 0.5;
const E2E_EXPIRY_DAYS = 30;
const MS_PER_DAY = 86_400_000;
const HTTP_CREATED = 201;

export interface CapturedCreate {
  readonly url: string;
  readonly body: Record<string, unknown>;
}
export interface MockCreateOptions {
  readonly status?: number; // default 201
  readonly errorBody?: unknown; // body for a non-201 status
  readonly abort?: boolean; // simulate a network failure
  readonly moveLateralBy?: number; // 201 with the coord's lateralOffset moved (server collision), clamped to ±0.5
  readonly zoneId?: number; // zone of the created krathong, default 1
}

/** Intercepts POST /api/creations only (GET falls through to the real server or an earlier route). */
export async function mockCreateCreation(
  page: Page,
  options: MockCreateOptions = {},
): Promise<{ readonly requests: CapturedCreate[] }> {
  const requests: CapturedCreate[] = [];
  await page.route(
    (url) => url.pathname === "/api/creations",
    async (route) => {
      const request = route.request();
      if (request.method() !== "POST") return route.fallback();
      const body = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
      requests.push({ url: request.url(), body });
      if (options.abort) return route.abort("failed");
      const status = options.status ?? HTTP_CREATED;
      if (status !== HTTP_CREATED) return route.fulfill({ status, json: options.errorBody ?? {} });
      const sent = body.coord as Record<string, unknown>;
      const lateral = Math.min(
        E2E_LATERAL_LIMIT,
        Math.max(-E2E_LATERAL_LIMIT, Number(sent.lateralOffset) + (options.moveLateralBy ?? 0)),
      );
      const now = Date.now();
      return route.fulfill({
        status: HTTP_CREATED,
        headers: { "cache-control": "no-store" },
        json: {
          creation: {
            id: E2E_CREATION_ID,
            eventId: body.eventId,
            zoneId: options.zoneId ?? 1,
            appearance: body.appearance,
            coord: { ...sent, lateralOffset: lateral },
            publicWishText: body.wishVisibility === "public" ? body.wishText : null,
            createdAt: new Date(now).toISOString(),
            expiresAt: new Date(now + E2E_EXPIRY_DAYS * MS_PER_DAY).toISOString(),
          },
        },
      });
    },
  );
  return { requests };
}
