import { act, cleanup, render } from "@testing-library/react";
import { Euler, Vector3 } from "three";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { RIVER_DRIFT_SPEED_FACTOR, RIVER_KRATHONG_SCALE } from "@/config/riverFlow.config";
import type { SplinePathCoord } from "@/core/coordinates";
import { DEFAULT_KRATHONG_APPEARANCE } from "@/core/customization";
import { bobbingPhaseFromId, createBobbingOut, getLoyKrathongRiverLanes, getRiverItemPositionAt, writeBobbingAt } from "@/core/world";
import { TIER_BUDGETS } from "@/config/performance.config";
import { prepareRiverItems, selectVisibleRiverItems } from "@/core/world";
import { useDeviceStore } from "@/store/useDeviceStore";
import { RiverFlow, type RiverFlowItem } from "./RiverFlow";

const r3f = vi.hoisted(() => ({ frame: null as null | (() => void), invalidate: vi.fn() }));

vi.mock("@react-three/fiber", () => ({
  useFrame: (cb: () => void) => {
    r3f.frame = cb;
  },
  useThree: (sel: (s: { invalidate: () => void }) => unknown) => sel({ invalidate: r3f.invalidate }),
}));

vi.mock("@/components/models/loyKrathong", async () => {
  const React = await import("react");
  return {
    KrathongModel: (p: { appearance: { base: string }; shadows: boolean }) =>
      React.createElement("mesh", {
        name: "krathong-model",
        "data-base": p.appearance.base,
        "data-shadows": String(p.shadows),
      }),
  };
});

const vectors = new WeakMap<object, Vector3>();
const eulers = new WeakMap<object, Euler>();

beforeAll(() => {
  Object.defineProperty(HTMLUnknownElement.prototype, "position", {
    configurable: true,
    get() {
      if (!vectors.has(this)) vectors.set(this, new Vector3());
      return vectors.get(this);
    },
  });
  Object.defineProperty(HTMLUnknownElement.prototype, "rotation", {
    configurable: true,
    get() {
      if (!eulers.has(this)) eulers.set(this, new Euler());
      return eulers.get(this);
    },
  });
});

afterAll(() => {
  delete (HTMLUnknownElement.prototype as unknown as Record<string, unknown>).position;
  delete (HTMLUnknownElement.prototype as unknown as Record<string, unknown>).rotation;
});

let NOW = 1_700_000_000_000 + 30_000;
const CREATED = 1_700_000_000_000;
const lanes = getLoyKrathongRiverLanes();
const coord = (laneId: number, spawnProgress: number): SplinePathCoord => ({
  mode: "SPLINE_PATH", laneId, spawnProgress, speedFactor: RIVER_DRIFT_SPEED_FACTOR, lateralOffset: 0.1,
});
const mk = (id: string, laneId = 1, spawnProgress = 0.2): RiverFlowItem => ({
  id, coord: coord(laneId, spawnProgress), createdAtMs: CREATED, appearance: DEFAULT_KRATHONG_APPEARANCE,
});
const itemA = mk("a");
const items = [itemA, mk("b", 1, 0.6), mk("bad", 99)];
const el = (c: HTMLElement, id: string) => c.querySelector(`[name="river-item-${id}"]`) as unknown as { position: Vector3; rotation: Euler };
const ui = (props: { items?: readonly RiverFlowItem[]; reducedMotion?: boolean; shadows?: boolean } = {}) => (
  <RiverFlow items={props.items ?? items} lanes={lanes} shadows={props.shadows ?? true} reducedMotion={props.reducedMotion ?? false} now={() => NOW} />
);

beforeEach(() => {
  r3f.frame = null;
  r3f.invalidate.mockClear();
  NOW = CREATED + 30_000;
});
afterEach(cleanup);

describe("RiverFlow", () => {
  it("renders one model per valid item, scaled, skipping invalid ones", () => {
    const { container } = render(ui());
    expect(container.querySelectorAll('[name^="river-item-"]')).toHaveLength(2);
    for (const id of ["a", "b"]) {
      const g = container.querySelector(`[name="river-item-${id}"]`)!;
      expect(g.querySelectorAll('mesh[name="krathong-model"]')).toHaveLength(1);
      expect(g.getAttribute("scale")).toBe(String(RIVER_KRATHONG_SCALE));
      expect(g.querySelector("mesh")!.getAttribute("data-base")).toBe(DEFAULT_KRATHONG_APPEARANCE.base);
    }
  });

  it("renders nothing and stays idle without items", () => {
    const { container } = render(ui({ items: [] }));
    expect(container.querySelector('[name="river-flow"]')).toBeNull();
    expect(() => r3f.frame!()).not.toThrow();
    expect(r3f.invalidate).not.toHaveBeenCalled();
  });

  it("starts the demand loop on mount with items", () => {
    render(ui());
    expect(r3f.invalidate).toHaveBeenCalled();
  });

  it("moves krathongs each frame with bobbing, then without it under reduced motion", () => {
    const view = render(ui());
    r3f.invalidate.mockClear();
    r3f.frame!();
    const p = getRiverItemPositionAt(itemA, lanes, NOW)!;
    const node = el(view.container, "a");
    const bob = writeBobbingAt(NOW, bobbingPhaseFromId("a"), false, createBobbingOut());
    expect(node.position.x).toBe(p.world.x);
    expect(node.position.z).toBe(p.world.z);
    expect(node.position.y).toBe(p.world.y + bob.offsetY);
    expect(r3f.invalidate).toHaveBeenCalled();

    view.rerender(ui({ reducedMotion: true }));
    r3f.invalidate.mockClear();
    r3f.frame!();
    expect(el(view.container, "a").position.y).toBe(p.world.y);
    expect(el(view.container, "a").rotation.x).toBe(0);
    expect(el(view.container, "a").rotation.z).toBe(0);

    const x0 = el(view.container, "a").position.x;
    NOW += 1000;
    r3f.frame!();
    const p2 = getRiverItemPositionAt(itemA, lanes, NOW)!;
    expect(el(view.container, "a").position.x).toBe(p2.world.x);
    expect(el(view.container, "a").position.x).not.toBe(x0);
    expect(r3f.invalidate).toHaveBeenCalled();
  });

  it("gives identical positions for two frames at the same time", () => {
    const view = render(ui());
    r3f.frame!();
    const first = el(view.container, "b").position.clone();
    r3f.frame!();
    expect(el(view.container, "b").position.equals(first)).toBe(true);
  });

  it("survives a stale frame after unmount and passes shadows through", () => {
    const view = render(ui({ shadows: false }));
    expect(view.container.querySelector("mesh")!.getAttribute("data-shadows")).toBe("false");
    view.unmount();
    expect(() => r3f.frame!()).not.toThrow();
  });
});

describe("river render budget (MFW-25)", () => {
  afterEach(() => useDeviceStore.setState(useDeviceStore.getInitialState(), true));
  const many = (n: number): RiverFlowItem[] =>
    Array.from({ length: n }, (_, k) => mk(`m-${String(k).padStart(3, "0")}`, 1, k / n));
  const groupIds = (c: HTMLElement) =>
    [...c.querySelectorAll('[name^="river-item-"]')].map((g) => g.getAttribute("name")!.replace("river-item-", "")).sort();
  const expectedIds = (list: RiverFlowItem[], cap: number) =>
    selectVisibleRiverItems(prepareRiverItems(list, lanes), cap).map((i) => i.id).sort();

  it("never renders more than ZONE_ITEM_CAP", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const { container } = render(ui({ items: many(85) }));
    expect(container.querySelectorAll('[name^="river-item-"]')).toHaveLength(80);
    expect(container.querySelector('[name="river-flow"]')!.getAttribute("data-visible-cap")).toBe("80");
  });

  it("LOW renders at most its tier cap", () => {
    useDeviceStore.getState().setQualityTier("LOW");
    const list = many(80);
    const { container } = render(ui({ items: list }));
    expect(groupIds(container)).toHaveLength(TIER_BUDGETS.LOW.riverItemCap);
    expect(groupIds(container)).toEqual(expectedIds(list, TIER_BUDGETS.LOW.riverItemCap));
  });

  it("MEDIUM uses its cap", () => {
    useDeviceStore.getState().setQualityTier("MEDIUM");
    const { container } = render(ui({ items: many(80) }));
    expect(container.querySelectorAll('[name^="river-item-"]')).toHaveLength(TIER_BUDGETS.MEDIUM.riverItemCap);
  });

  it("river shadows follow the tier", () => {
    for (const [tier, expected] of [["HIGH", "true"], ["MEDIUM", "false"], ["LOW", "false"]] as const) {
      useDeviceStore.getState().setQualityTier(tier);
      const { container, unmount } = render(ui({ shadows: true }));
      const meshes = container.querySelectorAll("mesh");
      expect(meshes.length).toBeGreaterThan(0);
      for (const m of meshes) expect(m.getAttribute("data-shadows")).toBe(expected);
      unmount();
    }
  });

  it("tier step-down re-selects", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const list = many(80);
    const { container } = render(ui({ items: list }));
    expect(groupIds(container)).toHaveLength(80);
    act(() => useDeviceStore.getState().setQualityTier("LOW"));
    expect(groupIds(container)).toHaveLength(TIER_BUDGETS.LOW.riverItemCap);
    expect(groupIds(container)).toEqual(expectedIds(list, TIER_BUDGETS.LOW.riverItemCap));
    expect(() => r3f.frame!()).not.toThrow();
  });

  it("pinned id survives the cap", () => {
    useDeviceStore.getState().setQualityTier("LOW");
    const list = many(80);
    const shown = new Set(expectedIds(list, TIER_BUDGETS.LOW.riverItemCap));
    const hidden = list.find((i) => !shown.has(i.id))!;
    const { container } = render(
      <RiverFlow items={list} lanes={lanes} shadows reducedMotion={false} now={() => NOW} pinnedIds={[hidden.id]} />,
    );
    expect(container.querySelector(`[name="river-item-${hidden.id}"]`)).not.toBeNull();
    expect(groupIds(container)).toHaveLength(TIER_BUDGETS.LOW.riverItemCap);
  });

  it("frame loop moves only rendered items", () => {
    useDeviceStore.getState().setQualityTier("LOW");
    const list = many(80);
    const { container } = render(ui({ items: list }));
    expect(() => r3f.frame!()).not.toThrow();
    for (const id of groupIds(container)) {
      const item = list.find((i) => i.id === id)!;
      const p = getRiverItemPositionAt(item, lanes, NOW)!;
      const node = el(container, id);
      expect(node.position.x).toBe(p.world.x);
      expect(node.position.z).toBe(p.world.z);
    }
  });

  it("FALLBACK_2D renders nothing", () => {
    useDeviceStore.getState().setQualityTier("FALLBACK_2D");
    const { container } = render(ui({ items: many(5) }));
    expect(container.querySelector('[name="river-flow"]')).toBeNull();
  });
});
