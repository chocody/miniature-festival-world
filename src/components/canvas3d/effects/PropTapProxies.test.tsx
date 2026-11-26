import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { BufferGeometry, Material, Object3D, Ray, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DRAG_START_DISTANCE_PX } from "@/config/interaction.config";
import { LOY_KRATHONG_PROP_TAP_TARGETS } from "@/components/models/loyKrathong/riverLayout";
import { SCENE_OBJECT_NAMES } from "../sceneObjectNames";
import { PropTapProxies } from "./PropTapProxies";
import type { PropTapTarget } from "./propTapTargets";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** The props React gave the DOM stub element (so a test can call the R3F onClick with an R3F-like event). */
function reactProps(el: Element): Record<string, unknown> {
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
  if (!key) throw new Error("no React props on the element");
  return (el as unknown as Record<string, Record<string, unknown>>)[key];
}
function named(name: string, x = 0, y = 0, z = 0): Object3D {
  const o = new Object3D();
  o.name = name;
  o.position.set(x, y, z);
  o.updateMatrixWorld(true);
  return o;
}
function click(el: Element, event: Record<string, unknown>) {
  const stopPropagation = vi.fn();
  (reactProps(el).onClick as (e: unknown) => void)({ stopPropagation, ...event });
  return stopPropagation;
}

const target: PropTapTarget = LOY_KRATHONG_PROP_TAP_TARGETS.find((t) => t.kind === "rock")!;
const down = (x: number, z: number) => new Ray(new Vector3(x, 10, z), new Vector3(0, -1, 0));

describe("PropTapProxies (MFW-60)", () => {
  it("PP1: one invisible mesh per target, with its name, position and scale", () => {
    const { container } = render(<PropTapProxies targets={LOY_KRATHONG_PROP_TAP_TARGETS} onPropTapped={vi.fn()} />);
    const els = container.querySelectorAll(`[name^="${SCENE_OBJECT_NAMES.propTapPrefix}"]`);
    expect(els).toHaveLength(LOY_KRATHONG_PROP_TAP_TARGETS.length);
    LOY_KRATHONG_PROP_TAP_TARGETS.forEach((t, i) => {
      expect(els[i].getAttribute("name")).toBe(t.name);
      expect(els[i].getAttribute("position")).toBe([t.center.x, t.center.y, t.center.z].join(","));
      expect(Number(els[i].getAttribute("scale"))).toBe(t.proxyRadius);
      expect(reactProps(els[i]).visible).toBe(false);
    });
  });

  it("PP2: a tap calls onPropTapped(kind, index, null) and stops propagation", () => {
    const onPropTapped = vi.fn();
    const { container } = render(<PropTapProxies targets={[target]} onPropTapped={onPropTapped} />);
    const stop = click(container.querySelector(`[name="${target.name}"]`)!, { delta: 0 });
    expect(onPropTapped).toHaveBeenCalledWith("rock", target.index, null);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("PP3: a drag does nothing", () => {
    const onPropTapped = vi.fn();
    const { container } = render(<PropTapProxies targets={[target]} onPropTapped={onPropTapped} />);
    const stop = click(container.querySelector(`[name="${target.name}"]`)!, { delta: DRAG_START_DISTANCE_PX + 1 });
    expect(onPropTapped).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });

  it("PP4: a river-krathong or lamp proxy on the ray wins: no call, no stop", () => {
    const onPropTapped = vi.fn();
    const { container } = render(<PropTapProxies targets={[target]} onPropTapped={onPropTapped} />);
    const el = container.querySelector(`[name="${target.name}"]`)!;
    for (const other of [`${SCENE_OBJECT_NAMES.riverHitPrefix}a`, `${SCENE_OBJECT_NAMES.lampTapPrefix}1`]) {
      const stop = click(el, { delta: 0, intersections: [{ object: named(target.name) }, { object: named(other) }] });
      expect(stop).not.toHaveBeenCalled();
    }
    expect(onPropTapped).not.toHaveBeenCalled();
  });

  it("PP5: nearest surface water — a ray that misses the body leaves the tap to the river; a body hit takes it", () => {
    const onPropTapped = vi.fn();
    const { container } = render(<PropTapProxies targets={[target]} onPropTapped={onPropTapped} />);
    const el = container.querySelector(`[name="${target.name}"]`)!;
    const self = named(target.name, target.center.x, target.center.y, target.center.z);
    const intersections = [{ object: self }, { object: named(SCENE_OBJECT_NAMES.water) }];
    const miss = down(target.center.x + target.bodyRadius * 2, target.center.z);
    expect(click(el, { delta: 0, intersections, ray: miss, eventObject: self })).not.toHaveBeenCalled();
    expect(onPropTapped).not.toHaveBeenCalled();
    const hit = down(target.center.x + target.bodyRadius / 2, target.center.z);
    expect(click(el, { delta: 0, intersections, ray: hit, eventObject: self })).toHaveBeenCalledTimes(1);
    expect(onPropTapped).toHaveBeenCalledTimes(1);
  });

  it("PP6: the shared proxy geometry and material are disposed on unmount, not per render", () => {
    const g = vi.spyOn(BufferGeometry.prototype, "dispose");
    const m = vi.spyOn(Material.prototype, "dispose");
    const view = render(<PropTapProxies targets={LOY_KRATHONG_PROP_TAP_TARGETS} onPropTapped={vi.fn()} />);
    view.rerender(<PropTapProxies targets={LOY_KRATHONG_PROP_TAP_TARGETS} onPropTapped={vi.fn()} />);
    expect(g).not.toHaveBeenCalled();
    view.unmount();
    expect(g).toHaveBeenCalledTimes(1);
    expect(m).toHaveBeenCalledTimes(1);
    expect(readFileSync(join(__dirname, "PropTapProxies.tsx"), "utf8")).not.toMatch(/useFrame\(/);
  });
});
