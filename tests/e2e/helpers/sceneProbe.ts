import { expect, type Page } from "@playwright/test";

/*
 * Test-only access to the 3D scene on the production build: three.js' built-in devtools hook ("observe" event) hands us the
 * renderer, and R3F stores its root state on every object (`__r3f`). Never imports src/ (tests/unit/scene-taps-e2e-literals.test.ts
 * pins the literals below to the app constants).
 */
export const E2E_MIN_TOUCH_TARGET_PX = 44; // = MIN_TOUCH_TARGET_PX
export const E2E_WATER_NAME = "scene-water"; // = SCENE_OBJECT_NAMES.water
export const E2E_LAMP_TAP_PREFIX = "scene-lamp-tap-"; // = SCENE_OBJECT_NAMES.lampTapPrefix
export const E2E_RIVER_HIT_PREFIX = "river-hit-"; // = SCENE_OBJECT_NAMES.riverHitPrefix
export const E2E_TAP_HINT_STORAGE_KEY = "mfw:sceneTapHintSeen:v1"; // = SCENE_TAP_HINT_STORAGE_KEY
export const E2E_TAP_HINT_SEEN_VALUE = "1"; // = SCENE_TAP_HINT_SEEN_VALUE
export const E2E_INSPECT_DIALOG_TITLE = "กระทงในสายน้ำ"; // = INSPECT_POPUP_COPY.dialogTitle

const WATER_GRID_X_FROM = 0.1;
const WATER_GRID_X_TO = 0.9;
const WATER_GRID_Y_FROM = 0.2;
const WATER_GRID_Y_TO = 0.8;
const WATER_GRID_STEP = 0.05;
const RING_SAMPLES = 8;
const RING_INSET_PX = 2;
const CAMERA_REST_TIMEOUT_MS = 5_000;
const CAMERA_REST_EPSILON = 1e-4;
/** Frames watched per rest check: a flight started by a tap begins a few frames later, so two frames can look at rest. */
const CAMERA_REST_FRAMES = 8;
/** Krathongs drift about 5 px/s, so two reads under load differ by a few px; a camera flight moves them by far more. */
const STABLE_TARGET_TOLERANCE_PX = 4;

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}
export interface TapTarget extends ScreenPoint {
  readonly name: string;
  readonly ringHits: number;
  readonly ringSamples: number;
}
export interface SceneTargets {
  readonly water: ScreenPoint | null;
  readonly lamp: TapTarget | null;
  readonly krathong: TapTarget | null;
}

/** Browser-side structural types (three / R3F are not importable from the test runner). */
interface Vec3 {
  x: number;
  y: number;
  z: number;
  clone(): Vec3;
  project(camera: unknown): Vec3;
}
interface Vec2 {
  set(x: number, y: number): void;
}
interface SceneObject {
  name: string;
  getWorldPosition(target: Vec3): Vec3;
  __r3f?: { root: { getState(): R3FState } };
}
interface Intersection {
  distance: number;
  object: SceneObject;
}
interface R3FState {
  pointer: { clone(): Vec2 };
  raycaster: {
    ray: { distanceSqToPoint(point: Vec3): number };
    setFromCamera(ndc: Vec2, camera: unknown): void;
    intersectObjects(objects: unknown[], recursive: boolean): Intersection[];
  };
  internal: { interaction: unknown[] };
}
interface ProbeCamera {
  position: Vec3;
}
interface ProbeScene {
  traverse(visit: (object: SceneObject) => void): void;
}
interface ProbeWindow {
  __THREE_DEVTOOLS__?: EventTarget;
  __mfwProbe?: { scene: ProbeScene | null; camera: ProbeCamera | null };
}
interface ObservedRenderer {
  isWebGLRenderer?: boolean;
  render: (scene: ProbeScene, camera: ProbeCamera) => unknown;
}

export async function installSceneProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as ProbeWindow;
    const probe = { scene: null as ProbeScene | null, camera: null as ProbeCamera | null };
    w.__mfwProbe = probe;
    const hook = new EventTarget();
    w.__THREE_DEVTOOLS__ = hook;
    hook.addEventListener("observe", (event) => {
      const detail = (event as CustomEvent<ObservedRenderer>).detail;
      if (!detail || !detail.isWebGLRenderer) return;
      const original = detail.render.bind(detail);
      detail.render = (scene, camera) => {
        probe.scene = scene;
        probe.camera = camera;
        return original(scene, camera);
      };
    });
  });
}

/** Screen points (client px) of tappable things; each is verified to be reachable and to hit the intended object first. */
export async function locateSceneTargets(page: Page): Promise<SceneTargets> {
  return page.evaluate(
    ({ waterName, lampPrefix, hitPrefix, minPx, grid, ringSamples, ringInset }) => {
      const none = { water: null, lamp: null, krathong: null };
      const probe = (window as unknown as ProbeWindow).__mfwProbe;
      const canvas = document.querySelector("canvas");
      if (!probe || !probe.scene || !probe.camera || !canvas) return none;
      const scene = probe.scene;
      const camera = probe.camera;
      const rect = canvas.getBoundingClientRect();
      let water: SceneObject | null = null;
      scene.traverse((o) => {
        if (o.name === waterName) water = o;
      });
      const waterObject = water as SceneObject | null;
      const root = waterObject?.__r3f?.root;
      if (!root) return none;
      const state = root.getState();
      const ndc = state.pointer.clone();
      const firstHitName = (x: number, y: number): string | null => {
        ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
        state.raycaster.setFromCamera(ndc, camera);
        const hits = state.raycaster.intersectObjects(state.internal.interaction, false).sort((a, b) => a.distance - b.distance);
        return hits[0]?.object.name ?? null;
      };
      // The water defers to a proxy hit anywhere along the ray (even below the water), so a water tap must have none.
      const anyProxyHit = (x: number, y: number): boolean => {
        ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
        state.raycaster.setFromCamera(ndc, camera);
        return state.raycaster
          .intersectObjects(state.internal.interaction, false)
          .some((h) => h.object.name.startsWith(hitPrefix) || h.object.name.startsWith(lampPrefix));
      };
      // Like the app (pickNearestRiverHitId): among overlapping river hit proxies the one whose centre is nearest the ray wins.
      const resolvedName = (x: number, y: number, prefix: string): string | null => {
        ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
        state.raycaster.setFromCamera(ndc, camera);
        const hits = state.raycaster.intersectObjects(state.internal.interaction, false).sort((a, b) => a.distance - b.distance);
        // A krathong proxy is centred on the water plane, so the water can be hit first; the app defers to the proxy then.
        if (prefix !== hitPrefix || !hits.some((h) => h.object.name.startsWith(prefix))) return hits[0]?.object.name ?? null;
        let bestName: string | null = null;
        let bestDistSq = Infinity;
        for (const h of hits) {
          if (!h.object.name.startsWith(prefix)) continue;
          const d = state.raycaster.ray.distanceSqToPoint(h.object.getWorldPosition(camera.position.clone()));
          if (d < bestDistSq) {
            bestDistSq = d;
            bestName = h.object.name;
          }
        }
        return bestName;
      };
      const reachable = (x: number, y: number): boolean =>
        x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom && document.elementFromPoint(x, y) === canvas;
      const toClient = (o: SceneObject): ScreenPoint => {
        const p = o.getWorldPosition(camera.position.clone()).project(camera);
        return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
      };

      let waterPoint: ScreenPoint | null = null;
      for (let gy = grid.yFrom; gy <= grid.yTo && !waterPoint; gy += grid.step) {
        for (let gx = grid.xFrom; gx <= grid.xTo && !waterPoint; gx += grid.step) {
          const x = rect.left + gx * rect.width;
          const y = rect.top + gy * rect.height;
          if (reachable(x, y) && firstHitName(x, y) === waterName && !anyProxyHit(x, y)) waterPoint = { x, y };
        }
      }

      const best = (prefix: string): TapTarget | null => {
        let found: TapTarget | null = null;
        scene.traverse((o) => {
          if (!o.name.startsWith(prefix)) return;
          const c = toClient(o);
          if (!reachable(c.x, c.y) || resolvedName(c.x, c.y, prefix) !== o.name) return;
          let ringHits = 0;
          const r = minPx / 2 - ringInset;
          for (let k = 0; k < ringSamples; k++) {
            const a = (k / ringSamples) * 2 * Math.PI;
            const x = c.x + r * Math.cos(a);
            const y = c.y + r * Math.sin(a);
            if (reachable(x, y) && resolvedName(x, y, prefix) === o.name) ringHits++;
          }
          if (!found || ringHits > found.ringHits) found = { x: c.x, y: c.y, name: o.name, ringHits, ringSamples };
        });
        return found;
      };

      return { water: waterPoint, lamp: best(lampPrefix), krathong: best(hitPrefix) };
    },
    {
      waterName: E2E_WATER_NAME,
      lampPrefix: E2E_LAMP_TAP_PREFIX,
      hitPrefix: E2E_RIVER_HIT_PREFIX,
      minPx: E2E_MIN_TOUCH_TARGET_PX,
      grid: { xFrom: WATER_GRID_X_FROM, xTo: WATER_GRID_X_TO, yFrom: WATER_GRID_Y_FROM, yTo: WATER_GRID_Y_TO, step: WATER_GRID_STEP },
      ringSamples: RING_SAMPLES,
      ringInset: RING_INSET_PX,
    },
  );
}

/** Waits until the camera has stopped moving (the release flight to the pier has landed). */
export async function waitForCameraRest(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          async ({ epsilon, frames }) => {
            const camera = (window as unknown as ProbeWindow).__mfwProbe?.camera;
            if (!camera) return false;
            const before = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
            for (let i = 0; i < frames; i++) await new Promise<void>((r) => requestAnimationFrame(() => r()));
            const p = camera.position;
            return Math.abs(p.x - before.x) < epsilon && Math.abs(p.y - before.y) < epsilon && Math.abs(p.z - before.z) < epsilon;
          },
          { epsilon: CAMERA_REST_EPSILON, frames: CAMERA_REST_FRAMES },
        ),
      { timeout: CAMERA_REST_TIMEOUT_MS },
    )
    .toBe(true);
}

/** Polls until the located target is the same screen point on two back-to-back reads (it is not mid-flight), then returns it. */
export async function locateStableTarget<K extends keyof SceneTargets>(page: Page, key: K): Promise<NonNullable<SceneTargets[K]>> {
  let found: NonNullable<SceneTargets[K]> | null = null;
  await expect
    .poll(async () => {
      const a = (await locateSceneTargets(page))[key] as ScreenPoint | null;
      const b = (await locateSceneTargets(page))[key] as ScreenPoint | null;
      const stable = a !== null && b !== null && Math.hypot(a.x - b.x, a.y - b.y) <= STABLE_TARGET_TOLERANCE_PX;
      found = stable ? (b as NonNullable<SceneTargets[K]>) : null;
      return found !== null;
    })
    .toBe(true);
  return found as unknown as NonNullable<SceneTargets[K]>;
}
