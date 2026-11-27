import { expect, type Page } from "@playwright/test";
import {
  CHRISTMAS_E2E_BAND_COUNT,
  CHRISTMAS_E2E_CREATIONS_PATH,
  CHRISTMAS_E2E_EVENT_ID,
  CHRISTMAS_E2E_FIRST_BAND,
  CHRISTMAS_E2E_ZONES_PATH,
  makeChristmasBandBody,
  makeChristmasDirectoryBody,
} from "../fixtures/christmasFixtures";

/** Checks only the attribute: the Christmas flow is not built yet, so waitForActiveEvent (CUSTOMIZE_OBJECT) cannot be used. */
export async function waitForChristmasEvent(page: Page): Promise<void> {
  await expect(page.locator("[data-flow-state]")).toHaveAttribute("data-active-event", CHRISTMAS_E2E_EVENT_ID);
}

export interface ChristmasWorldRoutes {
  /** Live list of the bands requested from the creations endpoint, in order. */
  readonly requestedBands: number[];
}

export async function routeChristmasWorld(
  page: Page,
  options: { readonly bandCount?: number } = {},
): Promise<ChristmasWorldRoutes> {
  const bandCount = options.bandCount ?? CHRISTMAS_E2E_BAND_COUNT;
  const requestedBands: number[] = [];
  await page.route(
    (url) => url.pathname === CHRISTMAS_E2E_ZONES_PATH,
    (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      return route.fulfill({ json: makeChristmasDirectoryBody(bandCount) });
    },
  );
  await page.route(
    (url) => url.pathname === CHRISTMAS_E2E_CREATIONS_PATH,
    (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      const zone = Number(new URL(route.request().url()).searchParams.get("zone"));
      if (!Number.isSafeInteger(zone) || zone < CHRISTMAS_E2E_FIRST_BAND) {
        return route.fulfill({ status: 400, json: { error: "invalid_query", field: "zone" } });
      }
      requestedBands.push(zone);
      return route.fulfill({ json: makeChristmasBandBody(zone) });
    },
  );
  return { requestedBands };
}
