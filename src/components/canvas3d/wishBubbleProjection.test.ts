// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Group, Object3D, OrthographicCamera, Vector3 } from "three";
import { isInsideViewport, ndcToViewportPx, projectObjectToViewport, shouldMoveBubble } from "./wishBubbleProjection";

describe("wishBubbleProjection (MFW-80)", () => {
  it("P1: ndcToViewportPx maps NDC to viewport pixels and returns out", () => {
    const rect = { left: 0, top: 0, width: 400, height: 800 };
    const out = { x: 0, y: 0 };
    expect(ndcToViewportPx(0, 0, rect, out)).toBe(out);
    expect(out).toEqual({ x: 200, y: 400 });
    expect(ndcToViewportPx(-1, 1, rect, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(ndcToViewportPx(1, -1, rect, { x: 0, y: 0 })).toEqual({ x: 400, y: 800 });
    expect(ndcToViewportPx(0, 0, { ...rect, left: 10, top: 20 }, { x: 0, y: 0 })).toEqual({ x: 210, y: 420 });
  });

  it("P2: shouldMoveBubble", () => {
    expect(shouldMoveBubble(null, { x: 1, y: 1 }, 0.5)).toBe(true);
    expect(shouldMoveBubble({ x: 0, y: 0 }, { x: 0.3, y: 0 }, 0.5)).toBe(false);
    expect(shouldMoveBubble({ x: 0, y: 0 }, { x: 0, y: 0.6 }, 0.5)).toBe(true);
  });

  it("P3: projects a nested object's world position plus a world-space lift (round trip: world to pixel)", () => {
    const camera = new OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    camera.position.set(0, 0, 50);
    camera.lookAt(0, 0, 0); // no manual matrix update: the projection refreshes it
    const parent = new Group();
    parent.position.set(3, 0, 0);
    const child = new Object3D();
    parent.add(child);
    const rect = { left: 0, top: 0, width: 400, height: 400 };
    const scratch = new Vector3();
    const out = { x: 0, y: 0 };
    projectObjectToViewport(child, 0, camera, rect, scratch, out);
    expect(out.x).toBeCloseTo(260, 6);
    expect(out.y).toBeCloseTo(200, 6);
    projectObjectToViewport(child, 2, camera, rect, scratch, out);
    expect(out.x).toBeCloseTo(260, 6);
    expect(out.y).toBeCloseTo(160, 6);
  });

  it("P4: isInsideViewport has inclusive bounds", () => {
    const rect = { left: 10, top: 20, width: 100, height: 50 };
    expect(isInsideViewport({ x: 10, y: 20 }, rect)).toBe(true);
    expect(isInsideViewport({ x: 110, y: 70 }, rect)).toBe(true);
    expect(isInsideViewport({ x: 9, y: 30 }, rect)).toBe(false);
    expect(isInsideViewport({ x: 50, y: 71 }, rect)).toBe(false);
  });
});
