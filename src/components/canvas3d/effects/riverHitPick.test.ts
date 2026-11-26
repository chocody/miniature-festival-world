// @vitest-environment node
import { Object3D, Ray, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { hasAnyTapProxyHit, hasTapProxyHit, isPropTapProxyName, nearestSurfaceName, pickNearestRiverHitId, propProxyTakesTap } from "./riverHitPick";

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

describe("MFW-60 tap priority helpers", () => {
  const water = proxy("scene-water", 0);
  const ground = proxy("scene-ground", 0);
  const house = proxy("scene-prop-tap-house-2", 0);

  it("RH1: hasAnyTapProxyHit covers the river, lamp and prop prefixes", () => {
    expect(isPropTapProxyName("scene-prop-tap-tree-0")).toBe(true);
    expect(isPropTapProxyName("scene-lamp-tap-0")).toBe(false);
    expect(hasAnyTapProxyHit([{ object: ground }, { object: A }])).toBe(true);
    expect(hasAnyTapProxyHit([{ object: ground }, { object: proxy("scene-lamp-tap-1", 0) }])).toBe(true);
    expect(hasAnyTapProxyHit([{ object: ground }, { eventObject: house }])).toBe(true);
    expect(hasAnyTapProxyHit([{ object: ground }, { object: water }])).toBe(false);
    expect(hasAnyTapProxyHit(null)).toBe(false);
    expect(hasTapProxyHit([{ object: house }])).toBe(false); // the water still ignores prop proxies
  });

  it("RH2: nearestSurfaceName skips proxies and handles non-arrays", () => {
    expect(nearestSurfaceName([{ object: house }, { object: A }, { object: water }, { object: ground }])).toBe("scene-water");
    expect(nearestSurfaceName([{ object: ground }, { object: water }])).toBe("scene-ground");
    expect(nearestSurfaceName([{ object: house }])).toBeNull();
    expect(nearestSurfaceName("x")).toBeNull();
    expect(nearestSurfaceName([null, {}])).toBeNull();
  });

  it("propProxyTakesTap: krathong / lamp proxies win; the river keeps taps that miss the body", () => {
    const self = proxy("scene-prop-tap-rock-0", 2);
    const r = 0.1;
    expect(propProxyTakesTap({ intersections: [{ object: self }, { object: ground }], ray: rayAt(5), eventObject: self }, r)).toBe(true);
    expect(propProxyTakesTap({ intersections: [{ object: self }, { object: A }], ray: rayAt(2), eventObject: self }, r)).toBe(false);
    expect(propProxyTakesTap({ intersections: [{ object: self }, { object: water }], ray: rayAt(2.5), eventObject: self }, r)).toBe(false);
    expect(propProxyTakesTap({ intersections: [{ object: self }, { object: water }], ray: rayAt(2.05), eventObject: self }, r)).toBe(true);
    expect(propProxyTakesTap({ intersections: [{ object: self }, { object: water }] }, r)).toBe(false);
    expect(propProxyTakesTap({}, r)).toBe(true); // nothing known about the ray: the proxy that was hit takes it
  });
});
