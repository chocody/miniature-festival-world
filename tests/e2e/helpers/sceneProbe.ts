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
/**
 * Start URL that keeps the tier the test forced (= `/?${TIER_PIN_QUERY_PARAM}=${TIER_PIN_QUERY_VALUE}`). CI's SwiftShader
 * renders the world at 12–20 FPS, so without it the FPS profiler (correctly) steps the tier down mid-test.
 */
export const E2E_PINNED_TIER_URL = "/?pinTier=1";
export const E2E_TAP_RIPPLE_NAME = "scene-ripples"; // = SCENE_OBJECT_NAMES.ripples
export const E2E_LAMP_GLOW_NAME = "scene-lamp-glows"; // = SCENE_OBJECT_NAMES.lampGlows
export const E2E_KRATHONG_MARK_NAME = "scene-krathong-mark-cue"; // = SCENE_OBJECT_NAMES.krathongMarkCue
export const E2E_KRATHONG_MARK_SCALE = 1.2; // = KRATHONG_MARK_CUE.scale
export const E2E_ADDITIVE_BLENDING = 2; // = three AdditiveBlending
// MFW-60 scene reactions
export const E2E_PROP_TAP_PREFIX = "scene-prop-tap-"; // = SCENE_OBJECT_NAMES.propTapPrefix
export const E2E_LAND_NAMES = ["scene-ground", "scene-bank-left", "scene-bank-right"] as const; // = SCENE_OBJECT_NAMES ground / banks
export const E2E_FIREWORK_NAME = "scene-fireworks"; // = SCENE_OBJECT_NAMES.fireworks
export const E2E_WINDOW_GLOW_NAME = "scene-window-glows"; // = SCENE_OBJECT_NAMES.windowGlows
export const E2E_SKY_LANTERN_NAME = "scene-sky-lanterns"; // = SCENE_OBJECT_NAMES.skyLanterns
export const E2E_CHIMNEY_SMOKE_NAME = "scene-chimney-smoke"; // = SCENE_OBJECT_NAMES.chimneySmoke (MFW-72)
export const E2E_FALLING_LEAVES_NAME = "scene-falling-leaves"; // = SCENE_OBJECT_NAMES.fallingLeaves (MFW-72)
export const E2E_DRAG_START_DISTANCE_PX = 8; // = DRAG_START_DISTANCE_PX

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
  /** MFW-60: a bare-land point (ground / bank first on the ray, no tap proxy of any kind on it): a "sky" tap launches a firework. */
  readonly sky: ScreenPoint | null;
  /** MFW-60: a house tap proxy that wins its tap under the app's priority rules. */
  readonly house: TapTarget | null;
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
  isMesh?: boolean;
  geometry?: { type?: string };
  material?: { blending?: number } | { blending?: number }[];
  scale?: { x: number };
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
  __mfwProbe?: { scene: ProbeScene | null; camera: ProbeCamera | null; renderer: ObservedRenderer | null };
}
interface ObservedRenderer {
  isWebGLRenderer?: boolean;
  render: (scene: ProbeScene, camera: ProbeCamera) => unknown;
  info?: { programs?: unknown[] | null; render?: { calls: number; triangles: number } };
}

export async function installSceneProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as ProbeWindow;
    const probe = { scene: null as ProbeScene | null, camera: null as ProbeCamera | null, renderer: null as ObservedRenderer | null };
    w.__mfwProbe = probe;
    const hook = new EventTarget();
    w.__THREE_DEVTOOLS__ = hook;
    hook.addEventListener("observe", (event) => {
      const detail = (event as CustomEvent<ObservedRenderer>).detail;
      if (!detail || !detail.isWebGLRenderer) return;
      probe.renderer = detail;
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
    ({ waterName, lampPrefix, hitPrefix, propPrefix, landNames, minPx, grid, ringSamples, ringInset }) => {
      const none = { water: null, lamp: null, krathong: null, sky: null, house: null };
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
      const isProxy = (name: string) => name.startsWith(hitPrefix) || name.startsWith(lampPrefix) || name.startsWith(propPrefix);
      // MFW-60 app rule 5: bare land takes a tap only when no tap proxy of any kind is on the ray.
      const landHit = (x: number, y: number): boolean => {
        ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
        state.raycaster.setFromCamera(ndc, camera);
        const hits = state.raycaster.intersectObjects(state.internal.interaction, false).sort((a, b) => a.distance - b.distance);
        return hits.length > 0 && landNames.includes(hits[0].object.name) && !hits.some((h) => isProxy(h.object.name));
      };
      // MFW-60 app rule 2: a prop proxy loses to river / lamp proxies and leaves taps whose nearest real surface is the water.
      const propWinner = (x: number, y: number): string | null => {
        ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
        state.raycaster.setFromCamera(ndc, camera);
        const hits = state.raycaster.intersectObjects(state.internal.interaction, false).sort((a, b) => a.distance - b.distance);
        if (hits.some((h) => h.object.name.startsWith(hitPrefix) || h.object.name.startsWith(lampPrefix))) return null;
        const surface = hits.find((h) => !isProxy(h.object.name));
        if (surface && surface.object.name === waterName) return null;
        const first = hits[0];
        return first && first.object.name.startsWith(propPrefix) ? first.object.name : null;
      };
      // Like the app (pickNearestRiverHitId): among overlapping river hit proxies the one whose centre is nearest the ray wins.
      // MFW-60 app rule 2a: krathong and lamp proxies beat prop proxies, so prop proxies are ignored here.
      const resolvedName = (x: number, y: number, prefix: string): string | null => {
        if (prefix === propPrefix) return propWinner(x, y);
        ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
        state.raycaster.setFromCamera(ndc, camera);
        const hits = state.raycaster
          .intersectObjects(state.internal.interaction, false)
          .filter((h) => !h.object.name.startsWith(propPrefix))
          .sort((a, b) => a.distance - b.distance);
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

      let skyPoint: ScreenPoint | null = null;
      for (let gy = grid.yFrom; gy <= grid.yTo && !skyPoint; gy += grid.step) {
        for (let gx = grid.xFrom; gx <= grid.xTo && !skyPoint; gx += grid.step) {
          const x = rect.left + gx * rect.width;
          const y = rect.top + gy * rect.height;
          if (reachable(x, y) && landHit(x, y)) skyPoint = { x, y };
        }
      }

      const best = (prefix: string, rule = prefix): TapTarget | null => {
        let found: TapTarget | null = null;
        scene.traverse((o) => {
          if (!o.name.startsWith(prefix)) return;
          const c = toClient(o);
          if (!reachable(c.x, c.y) || resolvedName(c.x, c.y, rule) !== o.name) return;
          let ringHits = 0;
          const r = minPx / 2 - ringInset;
          for (let k = 0; k < ringSamples; k++) {
            const a = (k / ringSamples) * 2 * Math.PI;
            const x = c.x + r * Math.cos(a);
            const y = c.y + r * Math.sin(a);
            if (reachable(x, y) && resolvedName(x, y, rule) === o.name) ringHits++;
          }
          if (!found || ringHits > found.ringHits) found = { x: c.x, y: c.y, name: o.name, ringHits, ringSamples };
        });
        return found;
      };

      return {
        water: waterPoint,
        lamp: best(lampPrefix),
        krathong: best(hitPrefix),
        sky: skyPoint,
        house: best(`${propPrefix}house-`, propPrefix),
      };
    },
    {
      waterName: E2E_WATER_NAME,
      lampPrefix: E2E_LAMP_TAP_PREFIX,
      hitPrefix: E2E_RIVER_HIT_PREFIX,
      propPrefix: E2E_PROP_TAP_PREFIX,
      landNames: [...E2E_LAND_NAMES] as string[],
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

/**
 * MFW-71: the screen point of the river krathong with this creation id (its `river-hit-<id>` proxy), or null while it is off the canvas
 * or not rendered yet. Re-read until stable (a camera flight moves it), then tap.
 */
export async function locateKrathongById(page: Page, creationId: string): Promise<ScreenPoint> {
  let found: ScreenPoint | null = null;
  const read = () =>
    page.evaluate(
      ({ name }) => {
        const probe = (window as unknown as ProbeWindow).__mfwProbe;
        const canvas = document.querySelector("canvas");
        if (!probe || !probe.scene || !probe.camera || !canvas) return null;
        const camera = probe.camera;
        const rect = canvas.getBoundingClientRect();
        // The endless river draws one copy of each krathong per stretch slot (same name): take the copy on the canvas.
        const points: { x: number; y: number }[] = [];
        probe.scene.traverse((o) => {
          if (o.name !== name || points.length > 0) return;
          const p = o.getWorldPosition(camera.position.clone()).project(camera);
          const x = rect.left + ((p.x + 1) / 2) * rect.width;
          const y = rect.top + ((1 - p.y) / 2) * rect.height;
          const inside = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
          if (inside && document.elementFromPoint(x, y) === canvas) points.push({ x, y });
        });
        return points[0] ?? null;
      },
      { name: `${E2E_RIVER_HIT_PREFIX}${creationId}` },
    );
  await expect
    .poll(async () => {
      const a = await read();
      const b = await read();
      found = a !== null && b !== null && Math.hypot(a.x - b.x, a.y - b.y) <= STABLE_TARGET_TOLERANCE_PX ? b : null;
      return found !== null;
    })
    .toBe(true);
  return found as unknown as ScreenPoint;
}

/**
 * Names of meshes that draw a ring or an additive halo, except the tap ripple and the lamp light-up (MFW-67). null = no frame rendered
 * yet (poll). Unnamed meshes are reported as "(unnamed)".
 */
export async function listRingAndHaloMeshes(page: Page): Promise<string[] | null> {
  return page.evaluate(
    ({ allowed, additive }) => {
      const scene = (window as unknown as ProbeWindow).__mfwProbe?.scene;
      if (!scene) return null;
      const found: string[] = [];
      scene.traverse((o) => {
        if (!o.isMesh || allowed.includes(o.name)) return;
        const materials = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        const ring = o.geometry?.type === "RingGeometry";
        const halo = materials.some((m) => m.blending === additive);
        if (ring || halo) found.push(o.name || "(unnamed)");
      });
      return found;
    },
    // MFW-60: the house window light-up is an additive skin over the window glass, like the lamp light-up.
    { allowed: [E2E_TAP_RIPPLE_NAME, E2E_LAMP_GLOW_NAME, E2E_WINDOW_GLOW_NAME], additive: E2E_ADDITIVE_BLENDING },
  );
}

/** scale.x of the first scene object with this name; null when there is no scene or no such object. */
export async function readObjectScaleX(page: Page, name: string): Promise<number | null> {
  return page.evaluate((target) => {
    const scene = (window as unknown as ProbeWindow).__mfwProbe?.scene;
    if (!scene) return null;
    let value: number | null = null;
    scene.traverse((o) => {
      if (value === null && o.name === target && o.scale) value = o.scale.x;
    });
    return value;
  }, name);
}

/** Number of shader programs the renderer has compiled (renderer.info.programs.length); null before the first frame. */
export async function readProgramCount(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const programs = (window as unknown as ProbeWindow).__mfwProbe?.renderer?.info?.programs;
    return Array.isArray(programs) ? programs.length : null;
  });
}

/** Draw calls and triangles of the last rendered frame; null before the first frame. */
export async function readRenderInfo(page: Page): Promise<{ calls: number; triangles: number } | null> {
  return page.evaluate(() => {
    const info = (window as unknown as ProbeWindow).__mfwProbe?.renderer?.info?.render;
    return info ? { calls: info.calls, triangles: info.triangles } : null;
  });
}

/** True when the last rendered scene holds an object with this name. */
export async function sceneHasObject(page: Page, name: string): Promise<boolean> {
  return page.evaluate((target) => {
    const scene = (window as unknown as ProbeWindow).__mfwProbe?.scene;
    if (!scene) return false;
    let found = false;
    scene.traverse((o) => {
      if (o.name === target) found = true;
    });
    return found;
  }, name);
}

/** True while the named object is drawn (visible with at least one instance). */
export async function sceneObjectVisible(page: Page, name: string): Promise<boolean> {
  return page.evaluate((target) => {
    const scene = (window as unknown as ProbeWindow).__mfwProbe?.scene;
    if (!scene) return false;
    let visible = false;
    scene.traverse((o) => {
      const v = o as unknown as { visible?: boolean; count?: number };
      if (o.name === target && v.visible === true && (v.count === undefined || v.count > 0)) visible = true;
    });
    return visible;
  }, name);
}
