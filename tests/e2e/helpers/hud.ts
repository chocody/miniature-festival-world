import { expect, type Locator, type Page } from "@playwright/test";
import { E2E_MY_CREATIONS_STORAGE_KEY } from "../fixtures/findMyFixtures";
import { E2E_EVENT_ID } from "../fixtures/zoneFixtures";
import { E2E_WORLD_ROTATE_BUTTON_NAME } from "./cameraProbe";
import { E2E_WATER_NAME } from "./sceneProbe";

/** MFW-74 world HUD helpers. Literals are duplicated (do not import src/ into Playwright). */
export const E2E_FIND_MY_BUTTON_NAME = "ค้นหาของฉัน"; // = MY_CREATIONS_COPY.openButton
export const E2E_TOGGLE_NIGHT_LABEL = "เปลี่ยนเป็นกลางวัน"; // = LIGHT_PRESET_TOGGLE_COPY.NIGHT (the button shown at NIGHT)
export const E2E_TOGGLE_DAY_LABEL = "เปลี่ยนเป็นกลางคืน"; // = LIGHT_PRESET_TOGGLE_COPY.DAY
export const E2E_LIGHT_PRESET_STORAGE_KEY = "mfw:lightPreset:v1"; // = LIGHT_PRESET_STORAGE_KEY
/** An extra, older creation of this device (a second entry makes Find My open the picker). */
export const E2E_SECOND_OWN_CREATION_ID = "5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a";

export interface HudButtons {
  readonly findMy: Locator;
  readonly toggle: Locator;
  readonly rotate: Locator;
}

export function hudButtons(page: Page): HudButtons {
  return {
    findMy: page.getByRole("button", { name: E2E_FIND_MY_BUTTON_NAME }),
    toggle: page.getByTestId("day-night-toggle"),
    rotate: page.getByRole("button", { name: E2E_WORLD_ROTATE_BUTTON_NAME }),
  };
}

/** Before the app boots: this device already holds an older creation in zone 1, so the release adds a second entry. */
export async function seedSecondOwnEntry(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, id, eventId]) => {
      if (localStorage.getItem(key) !== null) return;
      const createdAt = new Date(Date.now() - 3_600_000).toISOString();
      const expiresAt = new Date(Date.now() + 86_400_000 * 30).toISOString();
      localStorage.setItem(key, JSON.stringify([{ id, eventId, zoneId: 1, createdAt, expiresAt }]));
    },
    [E2E_MY_CREATIONS_STORAGE_KEY, E2E_SECOND_OWN_CREATION_ID, E2E_EVENT_ID] as const,
  );
}

interface ProbeScene {
  traverse(visit: (o: { name: string; __r3f?: { root?: { getState(): ProbeState } } }) => void): void;
}
interface ProbeState {
  pointer: { clone(): { set(x: number, y: number): unknown } };
  raycaster: {
    setFromCamera(ndc: unknown, camera: unknown): void;
    intersectObjects(objects: unknown[], recursive: boolean): { object: { name: string } }[];
  };
  internal: { interaction: unknown[] };
}

/** Samples the centre and the 4 corners (inset 2 px) of every visible HUD button: the scene must not hit water there. */
export async function expectHudClearOfRiver(page: Page): Promise<void> {
  await expectClearOfRiver(page, Object.values(hudButtons(page)));
}

/** MFW-154: the same water check for any controls over the scene (5 samples per visible target). */
export async function expectClearOfRiver(page: Page, targets: readonly Locator[]): Promise<void> {
  const buttons = await Promise.all(
    targets.map(async (b) => ((await b.count()) > 0 && (await b.isVisible()) ? b.boundingBox() : null)),
  );
  const boxes = buttons.filter((b): b is NonNullable<typeof b> => b !== null);
  expect(boxes.length).toBeGreaterThan(0);
  const points = boxes.flatMap((b) => [
    { x: b.x + b.width / 2, y: b.y + b.height / 2 },
    { x: b.x + 2, y: b.y + 2 },
    { x: b.x + b.width - 2, y: b.y + 2 },
    { x: b.x + 2, y: b.y + b.height - 2 },
    { x: b.x + b.width - 2, y: b.y + b.height - 2 },
  ]);
  const hits = await page.evaluate(
    ({ points: pts, waterName }) => {
      const probe = (window as unknown as { __mfwProbe?: { scene: ProbeScene | null; camera: unknown } }).__mfwProbe;
      const canvas = document.querySelector("canvas");
      if (!probe?.scene || !probe.camera || !canvas) return null;
      let state: ProbeState | null = null;
      probe.scene.traverse((o) => {
        if (o.name === waterName) state = o.__r3f?.root?.getState() ?? null;
      });
      if (state === null) return null;
      const s = state as ProbeState;
      const rect = canvas.getBoundingClientRect();
      const ndc = s.pointer.clone();
      return pts.map((p) => {
        ndc.set(((p.x - rect.left) / rect.width) * 2 - 1, -((p.y - rect.top) / rect.height) * 2 + 1);
        s.raycaster.setFromCamera(ndc, probe.camera);
        return s.raycaster.intersectObjects(s.internal.interaction, false).map((h) => h.object.name);
      });
    },
    { points, waterName: E2E_WATER_NAME },
  );
  expect(hits, "scene probe ready").not.toBeNull();
  const onWater = hits!.flatMap((names, i) => (names.includes(E2E_WATER_NAME) ? [`(${Math.round(points[i].x)},${Math.round(points[i].y)})`] : []));
  expect(onWater, "control samples that hit the water").toEqual([]);
}
