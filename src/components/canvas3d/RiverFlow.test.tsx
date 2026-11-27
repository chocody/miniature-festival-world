import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { BufferGeometry, Euler, Matrix4, Quaternion, Vector3 } from "three";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GIMMICK_BOUNCE, KRATHONG_MARK_CUE } from "@/config/gimmicks.config";
import { createBounceFrame, writeBounceAt } from "@/core/effects";
import { RIVER_DRIFT_SPEED_FACTOR, RIVER_KRATHONG_SCALE } from "@/config/riverFlow.config";
import type { SplinePathCoord } from "@/core/coordinates";
import { assembleKrathong, DEFAULT_KRATHONG_APPEARANCE } from "@/core/customization";
import { bobbingPhaseFromId, createBobbingOut, getLoyKrathongRiverLanes, getRiverItemPositionAt, writeBobbingAt } from "@/core/world";
import { TIER_BUDGETS } from "@/config/performance.config";
import { prepareRiverItems, selectVisibleRiverItems } from "@/core/world";
import { useDeviceStore } from "@/store/useDeviceStore";
import { RiverFlow, type RiverFlowItem } from "./RiverFlow";
import { BLOB_SHADOW_LOOK } from "@/config/look.config";
import { RIVER_WATER_HIGHLIGHTS } from "@/config/events/loyKrathong.river.config";
import { SCENE_OBJECT_NAMES } from "./sceneObjectNames";

const pick = vi.hoisted(() => ({ override: null as string | null }));
// The DOM stub's click cannot carry R3F's `intersections` / `ray`: this makes the wiring testable (the real picker has its own tests).
vi.mock("./effects/riverHitPick", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./effects/riverHitPick")>();
  return { pickNearestRiverHitId: (...args: Parameters<typeof actual.pickNearestRiverHitId>) => pick.override ?? actual.pickNearestRiverHitId(...args) };
});

const r3f = vi.hoisted(() => ({ frame: null as null | (() => void), invalidate: vi.fn() }));

vi.mock("@react-three/fiber", () => ({
  useFrame: (cb: () => void) => {
    r3f.frame = cb;
  },
  useThree: (sel: (s: { invalidate: () => void }) => unknown) => sel({ invalidate: r3f.invalidate }),
}));

const batch = vi.hoisted(() => ({
  props: null as null | { plan: { items: readonly unknown[] }; shadows: boolean },
  writeItem: vi.fn(),
  commit: vi.fn(),
}));

const NO_DESIGNS = vi.hoisted(() => ({ flames: () => null }));
vi.mock("@/components/models/loyKrathong", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/models/loyKrathong")>();
  const React = await import("react");
  return {
    ...actual,
    // MFW-65: no assets provider here; no design is ever loaded, so RiverFlow plans the procedural parts.
    useKrathongDesignPlanSource: () => NO_DESIGNS,
    RiverKrathongBatch: (p: { plan: { items: readonly unknown[] }; shadows: boolean; ref?: React.Ref<unknown> }) => {
      batch.props = p;
      React.useImperativeHandle(p.ref, () => ({ meshes: [], writeItem: batch.writeItem, commit: batch.commit }));
      return React.createElement("group", {
        name: "river-krathong-batch",
        "data-items": String(p.plan.items.length),
        "data-shadows": String(p.shadows),
      });
    },
  };
});

const blobMeshes = vi.hoisted(() => ({ list: [] as import("three").InstancedMesh[] }));
/** Latest recorded fan mesh with this name (since MFW-49 the krathong ripples share the blob mesh factory). */
const fanMesh = (name: string) => [...blobMeshes.list].reverse().find((m) => m.name === name);

/** Records the river blob mesh so the test can read its instances (the DOM stub cannot). */
vi.mock("./blobShadowMeshes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./blobShadowMeshes")>();
  return {
    ...actual,
    createBlobShadowInstances: (...args: Parameters<typeof actual.createBlobShadowInstances>) => {
      const mesh = actual.createBlobShadowInstances(...args);
      blobMeshes.list.push(mesh);
      return mesh;
    },
  };
});

const vectors = new WeakMap<object, Vector3>();
const eulers = new WeakMap<object, Euler>();
const scales = new WeakMap<object, Vector3>();
const quaternions = new WeakMap<object, Quaternion>();
const matrices = new WeakMap<object, Matrix4>();

beforeAll(() => {
  Object.defineProperty(HTMLUnknownElement.prototype, "position", {
    configurable: true,
    get() {
      if (!vectors.has(this)) vectors.set(this, new Vector3());
      return vectors.get(this);
    },
  });
  Object.defineProperty(HTMLUnknownElement.prototype, "scale", {
    configurable: true,
    get() {
      if (!scales.has(this)) scales.set(this, new Vector3(1, 1, 1));
      return scales.get(this);
    },
  });
  Object.defineProperty(HTMLUnknownElement.prototype, "rotation", {
    configurable: true,
    get() {
      if (!eulers.has(this)) eulers.set(this, new Euler());
      return eulers.get(this);
    },
  });
  Object.defineProperty(HTMLUnknownElement.prototype, "quaternion", {
    configurable: true,
    get() {
      if (!quaternions.has(this)) quaternions.set(this, new Quaternion());
      return quaternions.get(this);
    },
  });
  Object.defineProperty(HTMLUnknownElement.prototype, "matrix", {
    configurable: true,
    get() {
      if (!matrices.has(this)) matrices.set(this, new Matrix4());
      return matrices.get(this);
    },
  });
  Object.defineProperty(HTMLUnknownElement.prototype, "updateMatrix", {
    configurable: true,
    value(this: { quaternion: Quaternion; rotation: Euler; matrix: Matrix4; position: Vector3; getAttribute(n: string): string | null }) {
      this.quaternion.setFromEuler(this.rotation);
      this.matrix.compose(this.position, this.quaternion, new Vector3().setScalar(Number(this.getAttribute("scale"))));
    },
  });
});

afterAll(() => {
  delete (HTMLUnknownElement.prototype as unknown as Record<string, unknown>).position;
  delete (HTMLUnknownElement.prototype as unknown as Record<string, unknown>).rotation;
  delete (HTMLUnknownElement.prototype as unknown as Record<string, unknown>).scale;
  delete (HTMLUnknownElement.prototype as unknown as Record<string, unknown>).quaternion;
  delete (HTMLUnknownElement.prototype as unknown as Record<string, unknown>).matrix;
  delete (HTMLUnknownElement.prototype as unknown as Record<string, unknown>).updateMatrix;
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
const ui = (
  props: {
    items?: readonly RiverFlowItem[];
    reducedMotion?: boolean;
    shadows?: boolean;
    onItemTapped?: (id: string) => void;
    markedId?: string | null;
  } = {},
) => (
  <RiverFlow
    items={props.items ?? items}
    lanes={lanes}
    shadows={props.shadows ?? true}
    reducedMotion={props.reducedMotion ?? false}
    now={() => NOW}
    onItemTapped={props.onItemTapped}
    markedId={props.markedId}
  />
);

beforeEach(() => {
  r3f.frame = null;
  r3f.invalidate.mockClear();
  batch.writeItem.mockReset();
  batch.commit.mockReset();
  batch.props = null;
  NOW = CREATED + 30_000;
});
afterEach(cleanup);

describe("RiverFlow", () => {
  it("renders one anchor per valid item, scaled, skipping invalid ones", () => {
    const { container } = render(ui());
    expect(container.querySelectorAll('[name^="river-item-"]')).toHaveLength(2);
    for (const id of ["a", "b"]) {
      const g = container.querySelector(`[name="river-item-${id}"]`)!;
      expect(g.querySelector("mesh")).toBeNull(); // only MFW-28's empty bounce group is left inside
      expect(g.querySelector(`[name="river-bounce-${id}"]`)!.children).toHaveLength(0);
      expect(g.getAttribute("scale")).toBe(String(RIVER_KRATHONG_SCALE));
    }
    expect(container.querySelector('[name="river-krathong-batch"]')!.getAttribute("data-items")).toBe("2");
    const assembly = assembleKrathong(DEFAULT_KRATHONG_APPEARANCE);
    const planned = batch.props!.plan.items[0] as { parts: readonly unknown[] };
    expect(planned.parts).toHaveLength(assembly.body.length + assembly.centerAnchor.parts.length);
  });

  it("renders nothing and stays idle without items", () => {
    const { container } = render(ui({ items: [] }));
    expect(container.querySelector('[name="river-flow"]')).toBeNull();
    expect(container.querySelector('[name="river-krathong-batch"]')!.getAttribute("data-items")).toBe("0");
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
    expect(view.container.querySelector('[name="river-krathong-batch"]')!.getAttribute("data-shadows")).toBe("false");
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
      expect(container.querySelector('[name="river-krathong-batch"]')!.getAttribute("data-shadows")).toBe(expected);
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
});

describe("river krathong batch (MFW-34)", () => {
  afterEach(() => useDeviceStore.setState(useDeviceStore.getInitialState(), true));
  const three = [mk("a"), mk("b", 1, 0.5), mk("c", 1, 0.8)];

  it("items are anchors, parts are one batch", () => {
    const { container } = render(ui({ items: three }));
    expect(container.querySelectorAll('[name^="river-item-"]')).toHaveLength(3);
    for (const g of container.querySelectorAll('[name^="river-item-"]')) {
      expect(g.querySelector("mesh")).toBeNull();
      expect(g.querySelector('[name^="river-bounce-"]')!.children).toHaveLength(0);
    }
    expect(container.querySelectorAll('[name="river-krathong-batch"]')).toHaveLength(1);
    expect(batch.props!.plan.items).toHaveLength(3);
    expect(container.querySelector('mesh[name="krathong-model"]')).toBeNull();
  });

  it("each frame writes every rendered item, then commits once", () => {
    const { container } = render(ui({ items: three }));
    r3f.frame!();
    expect(batch.writeItem).toHaveBeenCalledTimes(3);
    ["a", "b", "c"].forEach((id, i) => {
      const node = container.querySelector(`[name="river-item-${id}"]`) as unknown as { matrix: Matrix4; quaternion: Quaternion };
      expect(batch.writeItem.mock.calls[i][0]).toBe(i);
      expect(batch.writeItem.mock.calls[i][1]).toBe(node.matrix);
      expect(batch.writeItem.mock.calls[i][2]).toBe(node.quaternion);
    });
    expect(batch.commit).toHaveBeenCalledTimes(1);
    expect(batch.commit.mock.invocationCallOrder[0]).toBeGreaterThan(batch.writeItem.mock.invocationCallOrder[2]);
  });

  it("reduced motion: the batch receives untilted transforms", () => {
    render(ui({ items: three, reducedMotion: true }));
    r3f.frame!();
    expect(batch.writeItem).toHaveBeenCalledTimes(3);
    for (const call of batch.writeItem.mock.calls) {
      const up = new Vector3(0, 1, 0).applyQuaternion(call[2] as Quaternion);
      expect(up.x).toBeCloseTo(0, 9);
      expect(up.y).toBeCloseTo(1, 9);
      expect(up.z).toBeCloseTo(0, 9);
    }
  });

  it("the batch survives an empty zone", () => {
    const view = render(ui({ items: three }));
    const node = view.container.querySelector('[name="river-krathong-batch"]');
    view.rerender(ui({ items: [] }));
    expect(view.container.querySelector('[name="river-flow"]')).toBeNull();
    expect(view.container.querySelector('[name="river-krathong-batch"]')).toBe(node);
    view.rerender(ui({ items: three }));
    expect(view.container.querySelector('[name="river-flow"]')).not.toBeNull();
    expect(view.container.querySelector('[name="river-krathong-batch"]')).toBe(node);
  });

  it("never plans more than ZONE_ITEM_CAP", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const many = Array.from({ length: 85 }, (_, k) => mk(`m-${String(k).padStart(3, "0")}`, 1, k / 85));
    render(ui({ items: many }));
    expect(batch.props!.plan.items).toHaveLength(80);
  });

  it("a bouncing krathong reaches the batch scaled about its anchor", () => {
    const { container } = render(ui({ items: three, onItemTapped: vi.fn() }));
    fireEvent.click(container.querySelector('[name="river-hit-a"]')!);
    NOW += GIMMICK_BOUNCE.periodMs / 4;
    r3f.frame!();
    const node = container.querySelector('[name="river-item-a"]') as unknown as { matrix: Matrix4 };
    const factor = writeBounceAt(GIMMICK_BOUNCE.periodMs / 4, false, createBounceFrame()).scale;
    const sent = batch.writeItem.mock.calls[0][1] as Matrix4;
    expect(sent).not.toBe(node.matrix);
    expect(sent.elements[0]).toBeCloseTo(node.matrix.elements[0] * factor, 9);
    expect(batch.writeItem.mock.calls[1][1]).toBe(
      (container.querySelector('[name="river-item-b"]') as unknown as { matrix: Matrix4 }).matrix,
    );
  });
});

describe("bounce reaches the batch (MFW-34)", () => {
  const three = [mk("a"), mk("b", 1, 0.5), mk("c", 1, 0.8)];
  const matrixOf = (c: HTMLElement, id: string) => (c.querySelector(`[name="river-item-${id}"]`) as unknown as { matrix: Matrix4 }).matrix;
  const byIndex = (i: number) => batch.writeItem.mock.calls.filter((call) => call[0] === i).at(-1)![1] as Matrix4;

  it("a tap on a then b: a is plain, b is scaled", () => {
    const { container } = render(ui({ items: three, onItemTapped: vi.fn() }));
    fireEvent.click(container.querySelector('[name="river-hit-a"]')!);
    NOW += GIMMICK_BOUNCE.periodMs / 4;
    r3f.frame!();
    fireEvent.click(container.querySelector('[name="river-hit-b"]')!);
    NOW += GIMMICK_BOUNCE.periodMs / 4;
    batch.writeItem.mockClear();
    r3f.frame!();
    expect(byIndex(0)).toBe(matrixOf(container, "a"));
    expect(byIndex(1)).not.toBe(matrixOf(container, "b"));
    const factor = writeBounceAt(GIMMICK_BOUNCE.periodMs / 4, false, createBounceFrame()).scale;
    expect(byIndex(1).elements[0]).toBeCloseTo(matrixOf(container, "b").elements[0] * factor, 9);
  });

  it("the last frame of a bounce sends factor 1", () => {
    const { container } = render(ui({ items: three, onItemTapped: vi.fn() }));
    fireEvent.click(container.querySelector('[name="river-hit-a"]')!);
    NOW += GIMMICK_BOUNCE.durationMs;
    r3f.frame!();
    expect(byIndex(0).elements[0]).toBeCloseTo(matrixOf(container, "a").elements[0], 9);
    r3f.frame!();
    expect(byIndex(0)).toBe(matrixOf(container, "a"));
  });
});

describe("river krathong tap (MFW-28)", () => {
  const scaleX = (c: HTMLElement, id: string) => (c.querySelector(`[name="river-bounce-${id}"]`) as unknown as { scale: Vector3 }).scale.x;
  const tap = (c: HTMLElement, id: string) => fireEvent.click(c.querySelector(`[name="river-hit-${id}"]`)!);

  it("has no hit proxies without onItemTapped", () => {
    const { container } = render(ui());
    expect(container.querySelectorAll('[name^="river-hit-"]')).toHaveLength(0);
  });

  it("renders one invisible hit proxy per item after the bounce group", () => {
    const { container } = render(ui({ onItemTapped: vi.fn() }));
    const proxies = container.querySelectorAll('[name^="river-hit-"]');
    expect(proxies).toHaveLength(2);
    for (const p of proxies) {
      expect(p.previousElementSibling?.getAttribute("name")).toMatch(/^river-bounce-/);
    }
    expect(container.querySelectorAll('[name^="river-item-"]')).toHaveLength(2);
    // React's DOM stub drops visible={false}, so the invisibility is pinned in the source instead.
    expect(readFileSync(join(process.cwd(), "src/components/canvas3d/RiverFlow.tsx"), "utf8")).toMatch(/name=\{`\$\{SCENE_OBJECT_NAMES\.riverHitPrefix\}\$\{item\.id\}`\}[\s\S]{0,200}visible=\{false\}/);
  });

  it("bounces once and inspects", () => {
    const onItemTapped = vi.fn();
    const { container } = render(ui({ onItemTapped }));
    r3f.invalidate.mockClear();
    tap(container, "a");
    expect(onItemTapped).toHaveBeenCalledTimes(1);
    expect(onItemTapped).toHaveBeenCalledWith("a");
    expect(r3f.invalidate).toHaveBeenCalled();
    r3f.frame!();
    expect(scaleX(container, "a")).toBe(1);
    NOW += GIMMICK_BOUNCE.periodMs / 4;
    r3f.frame!();
    expect(scaleX(container, "a")).toBe(writeBounceAt(GIMMICK_BOUNCE.periodMs / 4, false, createBounceFrame()).scale);
    expect(scaleX(container, "a")).toBeGreaterThan(1);
    NOW += GIMMICK_BOUNCE.durationMs;
    r3f.frame!();
    expect(scaleX(container, "a")).toBe(1);
    r3f.frame!();
    expect(scaleX(container, "a")).toBe(1);
  });

  it("reduced motion: inspects but never scales", () => {
    const onItemTapped = vi.fn();
    const { container } = render(ui({ onItemTapped, reducedMotion: true }));
    tap(container, "a");
    expect(onItemTapped).toHaveBeenCalledWith("a");
    NOW += GIMMICK_BOUNCE.periodMs / 4;
    r3f.frame!();
    expect(scaleX(container, "a")).toBe(1);
  });

  it("a proxy click reports the nearest krathong (MFW-59)", () => {
    const onItemTapped = vi.fn();
    const { container } = render(ui({ onItemTapped }));
    pick.override = "b";
    try {
      tap(container, "a");
    } finally {
      pick.override = null;
    }
    expect(onItemTapped).toHaveBeenCalledTimes(1);
    expect(onItemTapped).toHaveBeenCalledWith("b");
  });

  it("a tap on another krathong settles the first", () => {
    const { container } = render(ui({ onItemTapped: vi.fn() }));
    tap(container, "a");
    NOW += GIMMICK_BOUNCE.periodMs / 4;
    r3f.frame!();
    expect(scaleX(container, "a")).toBeGreaterThan(1);
    tap(container, "b");
    r3f.frame!();
    expect(scaleX(container, "a")).toBe(1);
  });

  it("creates the proxy assets once and disposes them on unmount", () => {
    const spy = vi.spyOn(BufferGeometry.prototype, "dispose");
    const view = render(ui({ onItemTapped: vi.fn() }));
    view.rerender(ui({ onItemTapped: vi.fn(), items: [itemA, mk("c", 1, 0.8)] }));
    expect(spy).toHaveBeenCalledTimes(0);
    view.unmount();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe("R3F props (QA crash regression)", () => {
  it("RiverFlow puts no dashed data-* prop on a three.js element (R3F reads dashes as a pierce path and crashes)", () => {
    const src = readFileSync(join(__dirname, "RiverFlow.tsx"), "utf8");
    expect(src).not.toMatch(/\sdata-[a-z-]+=\{/);
  });
});

describe("river blob shadows (MFW-47)", () => {
  const three = [mk("a"), mk("b", 1, 0.5), mk("c", 1, 0.7)];
  const withBlobs = (list: readonly RiverFlowItem[]) => (
    <RiverFlow items={list} lanes={lanes} shadows reducedMotion={false} now={() => NOW} shadowSurfaceY={-0.24} />
  );
  beforeEach(() => {
    blobMeshes.list.length = 0;
  });

  it("one blob follows each krathong on the water", () => {
    const view = render(withBlobs(three));
    expect(view.container.querySelectorAll(`[name="${SCENE_OBJECT_NAMES.riverBlobShadows}"]`)).toHaveLength(1);
    r3f.frame!();
    const mesh = fanMesh(SCENE_OBJECT_NAMES.riverBlobShadows)!;
    expect(mesh.count).toBe(3);
    const m = new Matrix4();
    mesh.getMatrixAt(0, m);
    const p = new Vector3().setFromMatrixPosition(m);
    const node = el(view.container, "a");
    expect(p.x).toBeCloseTo(node.position.x, 5);
    expect(p.z).toBeCloseTo(node.position.z, 5);
    expect(p.y).toBeCloseTo(-0.24 + BLOB_SHADOW_LOOK.liftY, 6);
  });

  it("an empty river shows no blobs", () => {
    render(withBlobs([]));
    r3f.frame!();
    expect(fanMesh(SCENE_OBJECT_NAMES.riverBlobShadows)!.count).toBe(0);
  });

  it("without shadowSurfaceY there is no blob mesh", () => {
    const view = render(ui());
    expect(view.container.querySelector(`[name="${SCENE_OBJECT_NAMES.riverBlobShadows}"]`)).toBeNull();
    expect(blobMeshes.list).toHaveLength(0);
  });
});

describe("krathong ripples (MFW-49 AC4)", () => {
  const three = [mk("a"), mk("b", 1, 0.5), mk("c", 1, 0.7)];
  const withRipples = (list: readonly RiverFlowItem[], reducedMotion = false, surface: { y?: number } = { y: -0.24 }) => (
    <RiverFlow items={list} lanes={lanes} shadows reducedMotion={reducedMotion} now={() => NOW} shadowSurfaceY={surface.y} />
  );
  const sel = `[name="${SCENE_OBJECT_NAMES.krathongRipples}"]`;
  beforeEach(() => {
    blobMeshes.list.length = 0;
  });
  afterEach(() => useDeviceStore.setState(useDeviceStore.getInitialState(), true));

  it.each(["HIGH", "MEDIUM"] as const)("%s with shadowSurfaceY renders the ripple rings", (tier) => {
    useDeviceStore.getState().setQualityTier(tier);
    const view = render(withRipples(three));
    expect(view.container.querySelectorAll(sel)).toHaveLength(1);
  });

  it("LOW (the cheap variant) has no ripples", () => {
    useDeviceStore.getState().setQualityTier("LOW");
    const view = render(withRipples(three));
    expect(view.container.querySelector(sel)).toBeNull();
    expect(fanMesh(SCENE_OBJECT_NAMES.krathongRipples)).toBeUndefined();
  });

  it("no shadowSurfaceY: no ripples", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const view = render(withRipples(three, false, {}));
    expect(view.container.querySelector(sel)).toBeNull();
  });

  it("a frame writes one ring at each krathong's xz, on the water", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const view = render(withRipples(three));
    r3f.frame!();
    const mesh = fanMesh(SCENE_OBJECT_NAMES.krathongRipples)!;
    expect(mesh.count).toBe(3);
    const m = new Matrix4();
    ["a", "b", "c"].forEach((id, i) => {
      mesh.getMatrixAt(i, m);
      const p = new Vector3().setFromMatrixPosition(m);
      const node = el(view.container, id);
      expect(p.x).toBeCloseTo(node.position.x, 5);
      expect(p.z).toBeCloseTo(node.position.z, 5);
      expect(p.y).toBeCloseTo(-0.24 + RIVER_WATER_HIGHLIGHTS.liftY, 6);
    });
  });

  it("reduced motion: the ring keeps the constant radius on two different frames", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    render(withRipples(three, true));
    const radiusAt = () => {
      r3f.frame!();
      const m = new Matrix4();
      fanMesh(SCENE_OBJECT_NAMES.krathongRipples)!.getMatrixAt(0, m);
      return new Vector3().setFromMatrixScale(m).x;
    };
    const first = radiusAt();
    NOW += 700;
    const second = radiusAt();
    expect(first).toBeCloseTo(RIVER_WATER_HIGHLIGHTS.ripple.radius, 6);
    expect(second).toBeCloseTo(RIVER_WATER_HIGHLIGHTS.ripple.radius, 6);
  });

  it("motion on: the ring pulses between frames", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    render(withRipples(three, false));
    const radiusAt = () => {
      r3f.frame!();
      const m = new Matrix4();
      fanMesh(SCENE_OBJECT_NAMES.krathongRipples)!.getMatrixAt(0, m);
      return new Vector3().setFromMatrixScale(m).x;
    };
    const first = radiusAt();
    NOW += 700;
    expect(radiusAt()).not.toBeCloseTo(first, 4);
  });

  it("an empty river commits zero rings", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    render(withRipples([]));
    r3f.frame!();
    expect(fanMesh(SCENE_OBJECT_NAMES.krathongRipples)!.count).toBe(0);
  });
});

describe("mark cue reaches the batch (MFW-67)", () => {
  const three = [mk("a"), mk("b", 1, 0.5), mk("c", 1, 0.8)];
  const P = GIMMICK_BOUNCE.periodMs;
  const cue = KRATHONG_MARK_CUE.scale;
  const bounceAt = (t: number) => writeBounceAt(t, false, createBounceFrame()).scale;
  const matrixOf = (c: HTMLElement, id: string) => (c.querySelector(`[name="river-item-${id}"]`) as unknown as { matrix: Matrix4 }).matrix;
  const byIndex = (i: number) => batch.writeItem.mock.calls.filter((call) => call[0] === i).at(-1)![1] as Matrix4;
  const factorOf = (c: HTMLElement, i: number, id: string) => byIndex(i).elements[0] / matrixOf(c, id).elements[0];

  it("(a) marks only the Find My krathong, (b) follows it while it drifts, (e) unmark restores it", () => {
    const { container, rerender } = render(ui({ items: three, markedId: "b" }));
    r3f.frame!();
    NOW += GIMMICK_BOUNCE.durationMs;
    r3f.frame!();
    expect(byIndex(1).elements[0]).toBeCloseTo(matrixOf(container, "b").elements[0] * cue, 9);
    expect(byIndex(0)).toBe(matrixOf(container, "a"));
    expect(byIndex(2)).toBe(matrixOf(container, "c"));
    const before = [12, 13, 14].map((k) => byIndex(1).elements[k]);
    NOW += 10_000;
    r3f.frame!();
    const node = matrixOf(container, "b");
    for (const k of [12, 13, 14]) expect(byIndex(1).elements[k]).toBeCloseTo(node.elements[k], 9);
    expect([12, 13, 14].map((k) => byIndex(1).elements[k])).not.toEqual(before);
    expect(factorOf(container, 1, "b")).toBeCloseTo(cue, 9);
    rerender(ui({ items: three, markedId: null }));
    r3f.frame!();
    expect(byIndex(1)).toBe(matrixOf(container, "b"));
  });

  it("(c) motion on: one bounce on top of the cue", () => {
    const { container } = render(ui({ items: three, markedId: "b" }));
    r3f.frame!();
    expect(factorOf(container, 1, "b")).toBeCloseTo(cue, 9);
    NOW += P / 4;
    r3f.frame!();
    expect(factorOf(container, 1, "b")).toBeCloseTo(cue * bounceAt(P / 4), 9);
    expect(factorOf(container, 1, "b")).toBeGreaterThan(cue);
  });

  it("(d) reduced motion: the steady size-up only", () => {
    const { container } = render(ui({ items: three, markedId: "b", reducedMotion: true }));
    r3f.frame!();
    expect(factorOf(container, 1, "b")).toBeCloseTo(cue, 12);
    NOW += P / 4;
    r3f.frame!();
    expect(factorOf(container, 1, "b")).toBeCloseTo(cue, 12);
  });

  it("(f) a tap on the marked krathong multiplies bounce and cue", () => {
    const { container } = render(ui({ items: three, markedId: "b", onItemTapped: vi.fn() }));
    r3f.frame!();
    NOW += GIMMICK_BOUNCE.durationMs;
    r3f.frame!();
    fireEvent.click(container.querySelector('[name="river-hit-b"]')!);
    NOW += P / 4;
    r3f.frame!();
    expect(factorOf(container, 1, "b")).toBeCloseTo(cue * bounceAt(P / 4), 9);
  });

  it("(g) a new Find My target restarts the bounce", () => {
    const { container, rerender } = render(ui({ items: three, markedId: "a" }));
    r3f.frame!();
    NOW += GIMMICK_BOUNCE.durationMs;
    r3f.frame!();
    rerender(ui({ items: three, markedId: "b" }));
    r3f.frame!();
    NOW += P / 4;
    r3f.frame!();
    expect(byIndex(0)).toBe(matrixOf(container, "a"));
    expect(factorOf(container, 1, "b")).toBeCloseTo(cue * bounceAt(P / 4), 9);
  });
});
