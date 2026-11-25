// @vitest-environment node
import { Object3D, Ray, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { hasTapProxyHit, pickNearestRiverHitId } from "./riverHitPick";

function proxy(name: string, x: number): Object3D {
  const o = new Object3D();
  o.name = name;
  o.position.set(x, 0, 0);
  o.updateMatrixWorld(true);
  return o;
}

const A = proxy("river-hit-A", 0);
const B = proxy("river-hit-B", 1);
const rayAt = (x: number) => new Ray(new Vector3(x, 10, 0), new Vector3(0, -1, 0));

describe("pickNearestRiverHitId", () => {
  it("picks the proxy whose centre is nearest the ray, whatever the order", () => {
    expect(pickNearestRiverHitId([{ eventObject: A }, { eventObject: B }], rayAt(0.9))).toBe("B");
    expect(pickNearestRiverHitId([{ eventObject: B }, { eventObject: A }], rayAt(0.9))).toBe("B");
    expect(pickNearestRiverHitId([{ eventObject: B }, { eventObject: A }], rayAt(0.1))).toBe("A");
  });
  it("returns null without a river proxy, an array or a Ray", () => {
    expect(pickNearestRiverHitId([{ eventObject: proxy("scene-water", 0) }], rayAt(0))).toBeNull();
    expect(pickNearestRiverHitId({}, rayAt(0))).toBeNull();
    expect(pickNearestRiverHitId([{ eventObject: A }], {})).toBeNull();
  });
  it("reads entries that only carry `object`", () => {
    expect(pickNearestRiverHitId([{ object: A }, { object: B }], rayAt(0.9))).toBe("B");
  });
});

describe("hasTapProxyHit", () => {
  it("is true when a river or lamp proxy is among the hits, even behind the water", () => {
    const water = proxy("scene-water", 0);
    expect(hasTapProxyHit([{ eventObject: water }, { eventObject: A }])).toBe(true);
    expect(hasTapProxyHit([{ eventObject: water }, { object: proxy("scene-lamp-tap-2", 0) }])).toBe(true);
  });
  it("is false without a proxy or without an array", () => {
    expect(hasTapProxyHit([{ eventObject: proxy("scene-water", 0) }])).toBe(false);
    expect(hasTapProxyHit(undefined)).toBe(false);
  });
});
