import type { Page } from "@playwright/test";
import type { ScreenPoint } from "./sceneProbe";

/*
 * MFW-57 camera probe on the production build. Reads `window.__mfwProbe` (installed by installSceneProbe in sceneProbe.ts).
 * Never imports src/ (tests/unit/camera-travel-e2e-literals.test.ts pins the literals below to the app constants).
 */
export const E2E_WORLD_VIEW_NAME = "scene-world-view"; // = SCENE_OBJECT_NAMES.worldView
export const E2E_WORLD_ROTATE_BUTTON_NAME = "หมุนมุมมอง"; // = WORLD_VIEW_ROTATE_BUTTON_COPY.ariaLabel

export interface WorldPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
export interface CameraReading extends WorldPoint {
  readonly zoom: number;
}
export interface WorldViewTransform {
  readonly position: [number, number, number];
  readonly rotation: [number, number, number];
}

/** Browser-side structural types (three is not importable from the test runner). */
interface Vec3 {
  x: number;
  y: number;
  z: number;
  clone(): Vec3;
  set(x: number, y: number, z: number): Vec3;
  project(camera: unknown): Vec3;
  unproject(camera: unknown): Vec3;
}
interface ProbeObject {
  name: string;
  position: Vec3;
  rotation: { x: number; y: number; z: number };
}
interface ProbeCamera {
  position: Vec3;
  zoom: number;
}
interface ProbeWindow {
  __mfwProbe?: { scene: { traverse(visit: (o: ProbeObject) => void): void } | null; camera: ProbeCamera | null };
}

export async function readCamera(page: Page): Promise<CameraReading | null> {
  return page.evaluate(() => {
    const camera = (window as unknown as ProbeWindow).__mfwProbe?.camera;
    if (!camera) return null;
    return { x: camera.position.x, y: camera.position.y, z: camera.position.z, zoom: camera.zoom };
  });
}

/** A world point on the view ray under the client point (any point of the ray projects back to it). */
export async function worldPointUnder(page: Page, p: ScreenPoint): Promise<WorldPoint | null> {
  return page.evaluate((point) => {
    const camera = (window as unknown as ProbeWindow).__mfwProbe?.camera;
    const canvas = document.querySelector("canvas");
    if (!camera || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((point.x - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((point.y - rect.top) / rect.height) * 2 + 1;
    const w = camera.position.clone().set(ndcX, ndcY, 0).unproject(camera);
    return { x: w.x, y: w.y, z: w.z };
  }, p);
}

export async function projectToClient(page: Page, w: WorldPoint): Promise<ScreenPoint | null> {
  return page.evaluate((world) => {
    const camera = (window as unknown as ProbeWindow).__mfwProbe?.camera;
    const canvas = document.querySelector("canvas");
    if (!camera || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const v = camera.position.clone().set(world.x, world.y, world.z).project(camera);
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }, w);
}

export async function readWorldViewTransform(page: Page): Promise<WorldViewTransform | null> {
  return page.evaluate((name) => {
    const scene = (window as unknown as ProbeWindow).__mfwProbe?.scene;
    if (!scene) return null;
    let found: ProbeObject | null = null;
    scene.traverse((o) => {
      if (o.name === name) found = o;
    });
    const group = found as ProbeObject | null;
    if (!group) return null;
    return {
      position: [group.position.x, group.position.y, group.position.z] as [number, number, number],
      rotation: [group.rotation.x, group.rotation.y, group.rotation.z] as [number, number, number],
    };
  }, E2E_WORLD_VIEW_NAME);
}

/** A one-finger touch drag through CDP (real touch → pointer events). Call `end()` to lift the finger. */
export async function touchDrag(
  page: Page,
  from: ScreenPoint,
  delta: ScreenPoint,
  steps: number,
): Promise<{ end: () => Promise<void> }> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: from.x + (delta.x * i) / steps, y: from.y + (delta.y * i) / steps, id: 1 }],
    });
  }
  return {
    end: async () => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await cdp.detach();
    },
  };
}

/** A mouse drag that keeps the button down; the caller calls `page.mouse.up()`. */
export async function mouseDragHold(page: Page, from: ScreenPoint, delta: ScreenPoint, steps: number): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + delta.x, from.y + delta.y, { steps });
}
