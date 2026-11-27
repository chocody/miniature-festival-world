// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  CHRISTMAS_CAMERA_ELEVATION_DEG,
  CHRISTMAS_FRAME_VIEW_SIZE,
  CHRISTMAS_TAP_VIEW_HALF_ANGLE_DEG,
} from "@/config/events/christmas.camera.config";
import { CHRISTMAS_TREE, TREE_ORNAMENT_HIT_RADIUS } from "@/config/events/christmas.tree.config";
import { MIN_TOUCH_TARGET_PX } from "@/config/customizer.config";
import type { WorldVec3 } from "@/core/coordinates/types";
import { getFramedCameraZoom } from "@/core/camera/viewportFraming";
import { slotsOfBand, treeCoordToWorld, treeSlotKey } from "./growingTree";

/*
 * Pure orthographic projection (no three): yaw ψ, elevation φ, focus at the origin (translation-invariant). The camera sits
 * along (sin ψ cos φ, sin φ, cos ψ cos φ) — the CylindricalCoord angle convention (0° = front, +Z).
 */
type Vec3 = readonly [number, number, number];
const DEG = Math.PI / 180;
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function basis(yaw: number, elev: number) {
  const right: Vec3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const up: Vec3 = [-Math.sin(yaw) * Math.sin(elev), Math.cos(elev), -Math.cos(yaw) * Math.sin(elev)];
  const dir: Vec3 = [Math.sin(yaw) * Math.cos(elev), Math.sin(elev), Math.cos(yaw) * Math.cos(elev)];
  return { right, up, dir };
}
function project(p: Vec3, yaw: number, elev: number, zoom: number): readonly [number, number] {
  const { right, up } = basis(yaw, elev);
  return [zoom * dot(p, right), zoom * dot(p, up)];
}

const SIZES = [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
] as const;
const N = 3;
const SLOTS = [1, 2, 3].flatMap((b) => slotsOfBand(CHRISTMAS_TREE, b));
const WORLD = SLOTS.map((s) => {
  const w: WorldVec3 = treeCoordToWorld(CHRISTMAS_TREE, s, N);
  return [w.x, w.y, w.z] as Vec3;
});
const angleDiff = (a: number, b: number) => {
  const d = (((a - b) % 360) + 360) % 360;
  return Math.min(d, 360 - d);
};

describe("growing tree tap separation at the default Christmas framing (MFW-93)", () => {
  it("GP1 projection helper sanity", () => {
    expect(project([1, 0, 0], 0, 0, 1)).toEqual([1, 0]);
    expect(project([0, 1, 0], 0, 0, 1)).toEqual([0, 1]);
    const [x, y] = project([0, 0, 1], 0, 0, 1);
    expect([x + 0, y + 0]).toEqual([0, 0]);
    const { right, up, dir } = basis(30 * DEG, 20 * DEG);
    for (const [a, b, want] of [
      [right, right, 1],
      [up, up, 1],
      [dir, dir, 1],
      [right, up, 0],
      [right, dir, 0],
      [up, dir, 0],
    ] as const) {
      expect(Math.abs(dot(a, b) - want)).toBeLessThanOrEqual(1e-12);
    }
  });

  it("GP2 framed zooms", () => {
    expect(getFramedCameraZoom(SIZES[0], CHRISTMAS_FRAME_VIEW_SIZE)).toBeCloseTo(390 / 4.6, 9);
    expect(getFramedCameraZoom(SIZES[1], CHRISTMAS_FRAME_VIEW_SIZE)).toBeCloseTo(360 / 4.6, 9);
  });

  it("GP3 every visible slot pair is ≥ MIN_TOUCH_TARGET_PX apart on screen", () => {
    const elev = CHRISTMAS_CAMERA_ELEVATION_DEG * DEG;
    for (const size of SIZES) {
      const zoom = getFramedCameraZoom(size, CHRISTMAS_FRAME_VIEW_SIZE);
      for (let step = 0; step < 720; step++) {
        const yawDeg = step / 2;
        const visible = SLOTS.map((s, i) => i).filter(
          (i) => angleDiff(SLOTS[i].angleDeg, yawDeg) <= CHRISTMAS_TAP_VIEW_HALF_ANGLE_DEG,
        );
        const screen = visible.map((i) => project(WORLD[i], yawDeg * DEG, elev, zoom));
        let min = Number.POSITIVE_INFINITY;
        let pair: readonly [number, number] = [-1, -1];
        for (let a = 0; a < screen.length; a++) {
          for (let b = a + 1; b < screen.length; b++) {
            const d = Math.hypot(screen[a][0] - screen[b][0], screen[a][1] - screen[b][1]);
            if (d < min) {
              min = d;
              pair = [visible[a], visible[b]];
            }
          }
        }
        if (min < MIN_TOUCH_TARGET_PX) {
          expect.fail(
            `${size.width}×${size.height} ψ ${yawDeg}°: ${treeSlotKey(SLOTS[pair[0]])} and ${treeSlotKey(SLOTS[pair[1]])} ` +
              `are ${min.toFixed(2)} px apart (< ${MIN_TOUCH_TARGET_PX})`,
          );
        }
      }
    }
  });

  it("GP4 the ornament hit radius covers half a touch target", () => {
    for (const size of SIZES) {
      const zoom = getFramedCameraZoom(size, CHRISTMAS_FRAME_VIEW_SIZE);
      expect(TREE_ORNAMENT_HIT_RADIUS * zoom, `${size.width}×${size.height}`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX / 2);
    }
  });
});
