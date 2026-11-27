import { createRef, type RefObject } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstancedMesh, OrthographicCamera, type Group, type Mesh } from "three";
import { EFFECT_POOL_CAPS } from "@/config/performance.config";
import { createCameraRigState, type CameraRigState } from "@/core/camera";
import { frameToWorldInto } from "@/core/coordinates/endlessRiverFrame";
import { createObjectPoolManager, type NudgeSource } from "@/core/effects";
import { getLoyKrathongEndlessRiverFrame } from "@/core/world/endlessRiver";
import { KrathongAssetsProvider } from "@/components/models/loyKrathong";
import { useDeviceStore } from "@/store/useDeviceStore";
import { RiverStretch, RIVER_STRETCH_NAME_PREFIX, type RiverStretchProps } from "./RiverStretch";
import { SCENE_OBJECT_NAMES } from "./sceneObjectNames";
import { NO_PINNED_RIVER_IDS } from "@/core/world";
import { DEFAULT_KRATHONG_APPEARANCE } from "@/core/customization";
import { RIVER_DRIFT_SPEED_FACTOR } from "@/config/riverFlow.config";
import { WISH_BUBBLE_ANCHOR_NAME } from "./WishBubbleAnchor";

const frames = vi.hoisted(() => [] as { cb: (state: { camera: unknown }) => void; priority: number }[]);
vi.mock("@react-three/fiber", () => {
  const noop = () => {};
  return {
    useFrame: (cb: (state: { camera: unknown }) => void, priority = 0) => {
      frames.push({ cb, priority });
    },
    useThree: (sel: (s: { invalidate: () => void }) => unknown) => sel({ invalidate: noop }),
    addEffect: () => noop,
    applyProps: noop,
    invalidate: noop,
  };
});
vi.mock("./effects/tapPoint", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./effects/tapPoint")>()),
  tapPointInParentSpace: () => ({ x: 0.5, z: -0.25 }),
}));

const FRAME = getLoyKrathongEndlessRiverFrame();
let rig: CameraRigState;
const getRig = () => rig;
const nudges: NudgeSource = { pool: createObjectPoolManager(EFFECT_POOL_CAPS.HIGH).nudge, now: () => 0 };
const camera = () => {
  const c = new OrthographicCamera(-180, 180, 320, -320, 0.1, 40);
  c.zoom = 52;
  return c;
};

function renderSlot(patch: Partial<RiverStretchProps> = {}) {
  const props: RiverStretchProps = {
    stretchIndex: 1,
    offsetX: FRAME.periodX,
    offsetZ: FRAME.periodZ,
    isCurrent: false,
    getRig,
    riverItems: [],
    markedRiverId: null,
    findMyItem: null,
    findMyAnchorRef: createRef<Group | null>() as RefObject<Group | null>,
    lampFocusRef: null,
    selectedLampIndex: 0,
    waterTargetRef: null,
    onWaterSelected: vi.fn(),
    onLampSelected: vi.fn(),
    onPropTapped: vi.fn(),
    onRiverItemTapped: undefined,
    bubbleItem: null,
    wishBubbleRef: createRef<HTMLDivElement | null>() as RefObject<HTMLDivElement | null>,
    nudges,
    lightPreset: "NIGHT",
    shadows: false,
    reducedMotion: false,
    riverNow: () => 1_700_000_000_000,
    pinnedRiverIds: NO_PINNED_RIVER_IDS,
    ...patch,
  };
  const view = render(
    <KrathongAssetsProvider>
      <RiverStretch {...props} />
    </KrathongAssetsProvider>,
  );
  return { ...view, props };
}
const slotGroup = (c: HTMLElement, s: number) => c.querySelector(`[name="${RIVER_STRETCH_NAME_PREFIX}${s}"]`)! as HTMLElement & { visible?: boolean };
const cull = () => frames.filter((f) => f.priority === -1);

beforeEach(() => {
  frames.length = 0;
  rig = createCameraRigState();
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
  useDeviceStore.getState().setQualityTier("HIGH");
});
afterEach(cleanup);

describe("RiverStretch (MFW-58)", () => {
  it("sits at its offset s·T and is named by its stretch", () => {
    const { container } = renderSlot();
    const g = slotGroup(container, 1);
    expect(g).not.toBeNull();
    expect(g.getAttribute("position")).toBe(`${FRAME.periodX},0,${FRAME.periodZ}`);
    expect(g.querySelector(`[name="${SCENE_OBJECT_NAMES.water}"]`)).not.toBeNull();
    expect(g.querySelector(`[name="${SCENE_OBJECT_NAMES.villagers}"]`)).not.toBeNull();
  });

  it("a water tap in the slot of stretch 1 reports the world-view point local + T and the stretch", () => {
    const { container, props } = renderSlot();
    fireEvent.click(container.querySelector(`[name="${SCENE_OBJECT_NAMES.water}"]`)!);
    expect(props.onWaterSelected).toHaveBeenCalledWith({ x: 0.5 + FRAME.periodX, z: -0.25 + FRAME.periodZ }, 1);
  });

  it("a land tap gives at = local + T; a prop proxy tap gives (kind, index, null, s); a lamp tap gives (i, s)", () => {
    const { container, props } = renderSlot({ stretchIndex: -2, offsetX: -2 * FRAME.periodX, offsetZ: -2 * FRAME.periodZ });
    fireEvent.click(container.querySelector(`[name="${SCENE_OBJECT_NAMES.ground}"]`)!);
    expect(props.onPropTapped).toHaveBeenLastCalledWith("sky", 0, { x: 0.5 - 2 * FRAME.periodX, z: -0.25 - 2 * FRAME.periodZ }, -2);
    fireEvent.click(container.querySelector(`[name="${SCENE_OBJECT_NAMES.propTapPrefix}house-0"]`)!);
    expect(props.onPropTapped).toHaveBeenLastCalledWith("house", 0, null, -2);
    fireEvent.click(container.querySelector(`[name="${SCENE_OBJECT_NAMES.lampTapPrefix}2"]`)!);
    expect(props.onLampSelected).toHaveBeenLastCalledWith(2, -2);
  });

  it("without onPropTapped there are no prop proxies (CUSTOMIZE / RITUAL)", () => {
    const { container } = renderSlot({ onPropTapped: undefined });
    expect(container.querySelectorAll(`[name^="${SCENE_OBJECT_NAMES.propTapPrefix}"]`)).toHaveLength(0);
  });

  it("culling: hidden when the camera focus is 3 stretches away, visible again when it comes back; writes only on change", () => {
    const { container } = renderSlot();
    const g = slotGroup(container, 1);
    expect(cull()).toHaveLength(1);
    const run = () => cull()[0].cb({ camera: camera() });
    const p = frameToWorldInto(FRAME, 1.5 * FRAME.length, 0, { x: 0, z: 0 });
    rig.focusX = p.x;
    rig.focusZ = p.z;
    run();
    expect(g.visible).toBeUndefined(); // in view from the start: nothing written
    const far = frameToWorldInto(FRAME, 4.5 * FRAME.length, 0, { x: 0, z: 0 });
    rig.focusX = far.x;
    rig.focusZ = far.z;
    run();
    expect(g.visible).toBe(false);
    rig.focusX = p.x;
    rig.focusZ = p.z;
    run();
    expect(g.visible).toBe(true);
  });

  it("only the current slot uses the scene's water and lamp targets; others use local refs", () => {
    const waterTargetRef = createRef<Mesh | null>() as RefObject<Mesh | null>;
    const lampFocusRef = createRef<Group | null>() as RefObject<Group | null>;
    renderSlot({ isCurrent: false, waterTargetRef: null, lampFocusRef: null });
    expect(waterTargetRef.current).toBeNull();
    cleanup();
    renderSlot({ isCurrent: true, stretchIndex: 0, offsetX: 0, offsetZ: 0, waterTargetRef, lampFocusRef });
    expect(waterTargetRef.current).not.toBeNull();
    expect((waterTargetRef.current as unknown as Element).getAttribute("name")).toBe(SCENE_OBJECT_NAMES.water);
    expect((lampFocusRef.current as unknown as Element).getAttribute("name")).toBe(SCENE_OBJECT_NAMES.lampFocus);
  });

  it("a hidden slot skips its per-frame writes (villagers, motes, sway, glints); a visible one writes", () => {
    renderSlot(); // (RiverFlow's anchors need real three groups; its early return is the same visibility check)
    const children = () => frames.filter((f) => f.priority === 0);
    expect(children().length).toBeGreaterThan(3);
    const writes = vi.spyOn(InstancedMesh.prototype, "setMatrixAt");
    const near = frameToWorldInto(FRAME, 1.5 * FRAME.length, 0, { x: 0, z: 0 });
    rig.focusX = near.x;
    rig.focusZ = near.z;
    cull()[0].cb({ camera: camera() });
    for (const f of children()) f.cb({ camera: camera() });
    expect(writes.mock.calls.length).toBeGreaterThan(0);
    writes.mockClear();
    const far = frameToWorldInto(FRAME, 10 * FRAME.length, 0, { x: 0, z: 0 });
    rig.focusX = far.x;
    rig.focusZ = far.z;
    cull()[0].cb({ camera: camera() });
    for (const f of children()) f.cb({ camera: camera() });
    expect(writes).not.toHaveBeenCalled();
    writes.mockRestore();
  });

  it("RS1: a krathong tap reports (id, stretchIndex); the wish bubble anchor exists only with bubbleItem", () => {
    const item = {
      id: "rs1",
      coord: { mode: "SPLINE_PATH" as const, laneId: 1, spawnProgress: 0.2, speedFactor: RIVER_DRIFT_SPEED_FACTOR, lateralOffset: 0 },
      createdAtMs: 1_700_000_000_000,
      appearance: DEFAULT_KRATHONG_APPEARANCE,
      publicWishText: "x",
    };
    const onRiverItemTapped = vi.fn();
    const { container } = renderSlot({ riverItems: [item], onRiverItemTapped, bubbleItem: item });
    fireEvent.click(container.querySelector('[name="river-hit-rs1"]')!);
    expect(onRiverItemTapped).toHaveBeenCalledWith("rs1", 1);
    expect(container.querySelector(`[name="${WISH_BUBBLE_ANCHOR_NAME}"]`)).not.toBeNull();
    cleanup();
    const without = renderSlot({ riverItems: [item], onRiverItemTapped, bubbleItem: null });
    expect(without.container.querySelector(`[name="${WISH_BUBBLE_ANCHOR_NAME}"]`)).toBeNull();
  });
});
