import { createRef } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrthographicCamera, Vector3 } from "three";
import { TIER_ANTIALIAS, TIER_BUDGETS } from "@/config/performance.config";
import { MOON_SHADOW_MAP_SIZE_PX } from "@/config/scene.config";
import { DEFAULT_KRATHONG_APPEARANCE } from "@/core/customization";
import { RIM_SOCKET_COUNT } from "@/config/events/loyKrathong.config";
import { PART_CHANGE_BOUNCE } from "@/config/customizer.config";
import {
  CUSTOMIZE_ROTATE_STEP_RADIANS,
  CUSTOMIZE_ZOOM_STEP_SCALE,
  PINCH_ZOOM_MAX,
  PINCH_ZOOM_MIN,
  ROTATION_RADIANS_PER_PIXEL,
} from "@/config/interaction.config";
import { getPinchZoomFactor, type CustomizeViewControl } from "@/core/interaction";
import { useBuilderStore } from "@/store/useBuilderStore";
import { useDeviceStore } from "@/store/useDeviceStore";
import { useUIStore } from "@/store/useUIStore";
import { INITIAL_RITUAL_STATE, buildReleaseCoord, type RitualState, type SavedRelease } from "@/core/ritual";
import { LOY_KRATHONG_PIER_RELEASE_SPOT } from "@/config/events/loyKrathong.river.config";
import { createRitualDropMapper } from "./ritualSite";
import { INITIAL_WORLD_STATE, useWorldStore } from "@/store/useWorldStore";
import type { PublicCreation } from "@/services/api/creationTypes";
import { prepareRiverItems, selectVisibleRiverItems, getLoyKrathongRiverLanes, getRiverItemPositionAt } from "@/core/world";
import { getCameraFlightPose } from "@/core/camera";
import { HIGHLIGHT_RING_SIZES } from "@/config/camera.config";
import { serializeKrathongAppearance } from "@/core/customization";
import { RIVER_DRIFT_SPEED_FACTOR } from "@/config/riverFlow.config";
import { INSPECT_POPUP_COPY } from "@/config/inspect.config";
import { KRATHONG_INSTANCE_BUCKET_COUNT } from "@/core/customization";
import { PERF_PROBE_GLOBAL_NAME } from "@/config/perfProbe.config";
import { OWNER_WISH_COPY } from "@/config/ownerWish.config";
import { registerOwnedCreationPredicate } from "@/services/auth/ownedCreationHint";
import { SCENE_OBJECT_NAMES } from "./sceneObjectNames";
import { DRAG_START_DISTANCE_PX } from "@/config/interaction.config";
import { SCENE_TAP_HINT_COPY, SCENE_TAP_HINT_SEEN_VALUE, SCENE_TAP_HINT_STORAGE_KEY } from "@/config/gimmicks.config";
import { RIVER_ENVIRONMENT_PARTS } from "@/config/events/loyKrathong.river.config";
import { LOY_KRATHONG_RIVER_LAYOUT, lampHeadPosition } from "@/components/models/loyKrathong/riverLayout";
import {
  getSceneRenderSettings,
  SceneViewport,
  TOY_MATTE_MATERIALS,
  TOY_SCENE_CAMERA,
  TOY_SCENE_CANVAS_CAMERA,
  TOY_SCENE_LIGHTING,
} from "./index";

const assets = vi.hoisted(() => ({ created: 0, disposed: 0 }));

vi.mock("@/components/models/loyKrathong/krathongAssets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/models/loyKrathong/krathongAssets")>();
  return {
    ...actual,
    createKrathongAssets: () => {
      assets.created += 1;
      const real = actual.createKrathongAssets();
      const dispose = real.dispose.bind(real);
      real.dispose = () => {
        assets.disposed += 1;
        dispose();
      };
      return real;
    },
  };
});

const tapStub = vi.hoisted(() => ({ value: { x: 0.5, z: 0 } as { x: number; z: number } | null }));

vi.mock("./effects/tapPoint", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./effects/tapPoint")>()),
  tapPointInParentSpace: () => tapStub.value,
}));

const release = vi.hoisted(() => ({
  starts: [] as { name: string; immediate: boolean; from?: { value: number }; onRest?: () => void }[],
}));

/** Wrap the real release choreography so the test sees what reaches each spring api (and can finish a lowering by hand). */
vi.mock("@/core/ritual/releaseMotion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/ritual/releaseMotion")>();
  return {
    ...actual,
    createReleaseMotion: (apis: Parameters<typeof actual.createReleaseMotion>[0], reduced: boolean, base: number) => {
      const wrap = (name: keyof typeof apis) => ({
        start: (o: Parameters<(typeof apis)["lower"]["start"]>[0]) => {
          release.starts.push({ name, immediate: o.immediate, from: o.from, onRest: o.onRest });
          apis[name].start(o);
        },
      });
      return actual.createReleaseMotion(
        { lower: wrap("lower"), settle: wrap("settle"), bump: wrap("bump"), candle: wrap("candle") },
        reduced,
        base,
      );
    },
  };
});

const riverRenders = vi.hoisted(() => ({ count: 0 }));

/** Counts how often the scene re-renders RiverFlow (memoised: a drag must not do it per pointer-move). */
vi.mock("./RiverFlow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./RiverFlow")>();
  const React = await import("react");
  return {
    ...actual,
    RiverFlow: (props: React.ComponentProps<typeof actual.RiverFlow>) => {
      riverRenders.count += 1;
      return React.createElement(actual.RiverFlow, props);
    },
  };
});

const r3f = vi.hoisted(() => ({
  cameraProps: [] as unknown[],
  camera: null as OrthographicCamera | null,
  flightStarts: [] as { immediate: boolean; to?: object }[],
  bounceStarts: [] as { immediate: boolean; from?: { scale: number }; to: { scale: number } }[],
  gl: {
    info: {
      memory: { geometries: 3, textures: 0 },
      render: { calls: 12, triangles: 400, frame: 7 },
      programs: [{}, {}],
    },
  },
}));

/**
 * Stub R3F context: renders the scene children into the DOM (so their onClick handlers run as R3F onClick
 * would, including bubbling from a mesh to its group), hands a real three OrthographicCamera to onCreated, and
 * re-applies `camera.zoom` whenever the `camera` prop is a different object (a conservative model of R3F
 * re-configuring its default camera). addEffect/applyProps/invalidate exist because @react-spring/three imports them.
 */
vi.mock("@react-three/fiber", async () => {
  const React = await import("react");
  const THREE = await import("three");
  const noop = () => {};
  function Canvas(props: {
    children?: React.ReactNode;
    camera: { zoom: number };
    orthographic?: boolean;
    shadows?: boolean;
    gl?: { antialias?: boolean };
    dpr: readonly [number, number];
    onCreated?: (state: { camera: OrthographicCamera; invalidate: () => void; gl: typeof r3f.gl }) => void;
  }) {
    const [camera] = React.useState(() => new THREE.OrthographicCamera());
    r3f.cameraProps.push(props.camera);
    const { onCreated } = props;
    React.useLayoutEffect(() => {
      camera.zoom = props.camera.zoom;
    }, [camera, props.camera]);
    React.useEffect(() => {
      r3f.camera = camera;
      onCreated?.({ camera, invalidate: noop, gl: r3f.gl });
    }, [camera, onCreated]);
    return React.createElement(
      "div",
      {
        "data-testid": "r3f-canvas",
        "data-orthographic": String(props.orthographic),
        "data-shadows": String(props.shadows),
        "data-antialias": String(props.gl?.antialias),
        "data-dpr": props.dpr.join(","),
      },
      props.children,
    );
  }
  return {
    Canvas,
    useFrame: noop,
    useThree: (selector: (state: { invalidate: () => void }) => unknown) => selector({ invalidate: noop }),
    addEffect: () => noop,
    applyProps: noop,
    invalidate: noop,
  };
});

/** Wrap the real camera controller so the test sees what reaches the spring api (reduced motion → immediate). */
vi.mock("@/core/camera", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/camera")>();
  return {
    ...actual,
    createCameraController: (
      animation: Parameters<typeof actual.createCameraController>[0],
      reducedMotion: boolean,
    ) =>
      actual.createCameraController(
        { start: (options) => { r3f.flightStarts.push(options); animation.start(options); } },
        reducedMotion,
      ),
  };
});

/** Wrap the real bounce controller so the test sees what reaches the spring api. */
vi.mock("@/core/customization/partChangeBounce", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/customization/partChangeBounce")>();
  return {
    ...actual,
    createPartChangeBounce: (api: Parameters<typeof actual.createPartChangeBounce>[0], reducedMotion: boolean) =>
      actual.createPartChangeBounce({ start: (o) => { r3f.bounceStarts.push(o); api.start(o); } }, reducedMotion),
  };
});

const proto = HTMLElement.prototype;
const originalCapture = {
  set: proto.setPointerCapture,
  release: proto.releasePointerCapture,
  has: proto.hasPointerCapture,
};

beforeAll(() => {
  proto.setPointerCapture = () => {};
  proto.releasePointerCapture = () => {};
  proto.hasPointerCapture = () => false;
  Object.defineProperty(HTMLUnknownElement.prototype, "getWorldPosition", {
    configurable: true,
    value(target: Vector3) {
      target.set(0, 0, 0);
      return target;
    },
  });
});

afterAll(() => {
  proto.setPointerCapture = originalCapture.set;
  proto.releasePointerCapture = originalCapture.release;
  proto.hasPointerCapture = originalCapture.has;
  delete (HTMLUnknownElement.prototype as unknown as Record<string, unknown>).getWorldPosition;
});

const viewport = () => screen.getByRole("region", { name: "Toy-like night river preview" });
const waterMesh = (c: HTMLElement) => c.querySelector('[name="scene-water"]')!;
const lampMesh = (c: HTMLElement) => c.querySelector('[name="scene-lamp-heads"]')!;
const krathongMesh = (c: HTMLElement) => c.querySelector('[name="scene-krathong"]')!;

const krathongTarget = (c: HTMLElement) => c.querySelector(`[name="${SCENE_OBJECT_NAMES.krathong}"]`)!;
const yaw = (c: HTMLElement) => Number(krathongTarget(c).getAttribute("rotation")!.split(",")[1]);

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

beforeEach(() => {
  tapStub.value = { x: 0.5, z: 0 };
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
  useBuilderStore.setState(useBuilderStore.getInitialState(), true);
  useWorldStore.setState({ ...INITIAL_WORLD_STATE }, true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  release.starts.length = 0;
  riverRenders.count = 0;
  assets.created = 0;
  assets.disposed = 0;
  r3f.cameraProps.length = 0;
  r3f.camera = null;
  r3f.flightStarts.length = 0;
  r3f.bounceStarts.length = 0;
});

describe("toy-like night scene", () => {
  it("uses an orthographic camera and soft night light with a warm candle light", () => {
    expect(TOY_SCENE_CAMERA.orthographic).toBe(true);
    expect(getPinchZoomFactor(1, 1.5)).toBe(1.5);
    expect(getPinchZoomFactor(1, 10)).toBe(1.6);
    expect(TOY_SCENE_LIGHTING.ambient.color).toBe("#8499c5");
    expect(TOY_SCENE_LIGHTING.candle.color).toBe("#ffb35c");
  });

  it("uses flat matte material settings", () => {
    for (const material of Object.values(TOY_MATTE_MATERIALS)) {
      expect(material.roughness).toBe(1);
      expect(material.metalness).toBe(0);
    }
  });

  it("renders the builder appearance, default when null", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const { container } = render(<SceneViewport mode="CUSTOMIZE" />);
    expect(container.querySelectorAll('mesh[name^="flower_"]')).toHaveLength(RIM_SOCKET_COUNT);
    act(() => {
      useBuilderStore.setState({ appearance: { ...DEFAULT_KRATHONG_APPEARANCE, flowers: ["lotus"] } });
    });
    expect(container.querySelectorAll('mesh[name^="flower_"]')).toHaveLength(1);
  });

  it.each(["HIGH", "MEDIUM", "LOW"] as const)("uses the %s render budget", (tier) => {
    expect(getSceneRenderSettings(tier)).toEqual({
      dpr: [1, TIER_BUDGETS[tier].pixelRatioCap],
      shadows: TIER_BUDGETS[tier].shadows,
      maxTextureSize: TIER_BUDGETS[tier].maxTextureSize,
      antialias: TIER_ANTIALIAS[tier],
      shadowMapSizePx: Math.min(MOON_SHADOW_MAP_SIZE_PX, TIER_BUDGETS[tier].maxTextureSize),
    });
    const settings = getSceneRenderSettings(tier);
    expect(settings.shadowMapSizePx).toBeLessThanOrEqual(settings.maxTextureSize);
  });

  it("lights are not inside the world-view group", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const { container } = render(<SceneViewport mode="CUSTOMIZE" />);
    expect(container.querySelector('[name="scene-world-view"] ambientLight')).toBeNull();
    expect(container.querySelector('[name="scene-world-view"] directionalLight')).toBeNull();
    expect(container.querySelector("ambientLight")).not.toBeNull();
    expect(container.querySelector("directionalLight")).not.toBeNull();
    expect(container.querySelector('[name="scene-krathong"] pointLight')).not.toBeNull();
  });

  it("the candle is the only point light", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const { container } = render(<SceneViewport mode="CUSTOMIZE" />);
    expect(container.querySelectorAll("pointLight, spotLight")).toHaveLength(1);
  });

  it("section background comes from config", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    render(<SceneViewport mode="CUSTOMIZE" />);
    expect(viewport().style.backgroundColor).toBe("rgb(16, 26, 50)");
    expect(viewport().className).not.toContain("bg-[");
  });

  it("does not create a WebGL canvas before profiling or on the 2D tier", () => {
    const { rerender } = render(<SceneViewport />);
    expect(screen.queryByTestId("r3f-canvas")).toBeNull();

    useDeviceStore.getState().setQualityTier("FALLBACK_2D");
    rerender(<SceneViewport />);
    expect(screen.queryByTestId("r3f-canvas")).toBeNull();
  });

  it("creates an orthographic canvas after profiling selects a 3D tier", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    render(<SceneViewport />);
    expect(screen.getByTestId("r3f-canvas")).toHaveAttribute("data-orthographic", "true");
    expect(screen.getByTestId("r3f-canvas")).toHaveAttribute("data-shadows", "true");
    expect(screen.getByTestId("r3f-canvas")).toHaveAttribute("data-dpr", "1,2");
  });
});

describe("scene pointer flow (stub R3F context)", () => {
  it("pinch zoom survives a drag re-render (stable camera options)", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    render(<SceneViewport mode="CUSTOMIZE" />);
    const v = viewport();
    fireEvent.pointerDown(v, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerDown(v, { pointerId: 2, clientX: 30, clientY: 10 });
    fireEvent.pointerMove(v, { pointerId: 2, clientX: 40, clientY: 10 });
    fireEvent.pointerUp(v, { pointerId: 2, clientX: 40, clientY: 10 });
    fireEvent.pointerUp(v, { pointerId: 1, clientX: 10, clientY: 10 });
    expect(r3f.camera!.zoom).toBe(TOY_SCENE_CAMERA.zoom * 1.5);

    const before = r3f.cameraProps.length;
    fireEvent.pointerDown(v, { pointerId: 3, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(v, { pointerId: 3, clientX: 40, clientY: 10 });
    fireEvent.pointerUp(v, { pointerId: 3, clientX: 40, clientY: 10 });
    expect(r3f.cameraProps.length).toBeGreaterThan(before);
    expect(r3f.camera!.zoom).toBe(TOY_SCENE_CAMERA.zoom * 1.5);
    for (const props of r3f.cameraProps) expect(props).toBe(TOY_SCENE_CANVAS_CAMERA);
  });

  it("antialias follows the tier", () => {
    useDeviceStore.getState().setQualityTier("MEDIUM");
    render(<SceneViewport mode="CUSTOMIZE" />);
    expect(screen.getByTestId("r3f-canvas")).toHaveAttribute("data-antialias", "true");
    const v = viewport();
    fireEvent.pointerDown(v, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerDown(v, { pointerId: 2, clientX: 30, clientY: 10 });
    fireEvent.pointerMove(v, { pointerId: 2, clientX: 40, clientY: 10 });
    fireEvent.pointerUp(v, { pointerId: 2, clientX: 40, clientY: 10 });
    fireEvent.pointerUp(v, { pointerId: 1, clientX: 10, clientY: 10 });
    const before = r3f.camera;
    expect(before!.zoom).toBe(TOY_SCENE_CAMERA.zoom * 1.5);

    act(() => useDeviceStore.getState().setQualityTier("LOW"));
    expect(screen.getByTestId("r3f-canvas")).toHaveAttribute("data-antialias", "false");
    expect(r3f.camera).not.toBe(before);
    expect(r3f.camera!.zoom).toBe(TOY_SCENE_CAMERA.zoom * 1.5);
  });

  it.each(["CUSTOMIZE", "RITUAL_RELEASE"] as const)("%s taps never select a target or fly the camera", (mode) => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const { container } = render(<SceneViewport mode={mode} />);
    const before = r3f.flightStarts.length;
    expect(before).toBe(mode === "RITUAL_RELEASE" ? 1 : 0);
    fireEvent.click(waterMesh(container));
    fireEvent.click(krathongMesh(container));
    fireEvent.click(lampMesh(container));
    expect(viewport()).not.toHaveAttribute("data-selected-target");
    expect(container.querySelector("ringGeometry")).toBeNull();
    expect(r3f.flightStarts).toHaveLength(before);
  });

  it("only WORLD_EXPLORE taps select a target and fly the camera", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    fireEvent.click(waterMesh(container));
    expect(viewport()).toHaveAttribute("data-selected-target", "water");
    expect(container.querySelector("ringGeometry")).not.toBeNull();
    expect(r3f.flightStarts).toHaveLength(1);
    fireEvent.click(lampMesh(container));
    expect(viewport()).toHaveAttribute("data-selected-target", "lamp");
    fireEvent.click(krathongMesh(container));
    expect(viewport()).toHaveAttribute("data-selected-target", "krathong");
    expect(r3f.flightStarts).toHaveLength(3);
  });

  it("reduced motion turns the flight into an instant cut", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    useDeviceStore.getState().setReducedMotion(true);
    const first = render(<SceneViewport mode="WORLD_EXPLORE" />);
    fireEvent.click(waterMesh(first.container));
    expect(r3f.flightStarts.at(-1)?.immediate).toBe(true);
    first.unmount();

    useDeviceStore.getState().setReducedMotion(false);
    const second = render(<SceneViewport mode="WORLD_EXPLORE" />);
    fireEvent.click(waterMesh(second.container));
    expect(r3f.flightStarts.at(-1)?.immediate).toBe(false);
  });

  it("clears selection and highlight on every mode change", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const { container, rerender } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    fireEvent.click(waterMesh(container));
    expect(viewport()).toHaveAttribute("data-selected-target", "water");
    rerender(<SceneViewport mode="RITUAL_RELEASE" />);
    expect(viewport()).not.toHaveAttribute("data-selected-target");
    expect(container.querySelector("ringGeometry")).toBeNull();
    rerender(<SceneViewport mode="WORLD_EXPLORE" />);
    expect(viewport()).not.toHaveAttribute("data-selected-target");
    fireEvent.click(lampMesh(container));
    expect(viewport()).toHaveAttribute("data-selected-target", "lamp");
    rerender(<SceneViewport mode="CUSTOMIZE" />);
    expect(viewport()).not.toHaveAttribute("data-selected-target");
    expect(container.querySelector("ringGeometry")).toBeNull();
  });

  const rect = () =>
    vi.spyOn(viewport(), "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 320, height: 256 }));
  const chipEl = () => screen.getByRole("img", { name: "กระทง ลากลงน้ำ" });

  it("a drag onto the water releases there", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const onRelease = vi.fn();
    render(<SceneViewport mode="RITUAL_RELEASE" onReleaseDrop={onRelease} />);
    rect();
    const chip = chipEl();

    fireEvent.pointerDown(chip, { pointerId: 1, clientX: 160, clientY: 140 });
    fireEvent.pointerMove(chip, { pointerId: 1, clientX: 163, clientY: 144 });
    fireEvent.pointerUp(viewport(), { pointerId: 1, clientX: 163, clientY: 144 });
    expect(onRelease).not.toHaveBeenCalled();

    fireEvent.pointerDown(chip, { pointerId: 2, clientX: 160, clientY: 140 });
    fireEvent.pointerMove(chip, { pointerId: 2, clientX: 160, clientY: 100 });
    fireEvent.pointerUp(viewport(), { pointerId: 2, clientX: 160, clientY: 100 });
    expect(onRelease).toHaveBeenCalledTimes(1);
    const want = createRitualDropMapper().mapDrop({ x: 50, y: 50 - (40 / 256) * 100 }, { width: 320, height: 256 }, 1)!.candidate;
    const got = onRelease.mock.calls[0][0];
    expect(got.laneId).toBe(want.laneId);
    expect(got.progress).toBeCloseTo(want.progress, 9);
    expect(got.lateralOffset).toBeCloseTo(want.lateralOffset, 9);
  });

  it("a drag of many pointer-moves does not re-render RiverFlow per move", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    act(() => {
      useWorldStore.setState({
        eventId: "loy_krathong",
        currentZoneId: 1,
        zoneCount: 1,
        zoneStatus: "ready",
        zoneItems: [storeItemFor(1)],
      });
    });
    render(<SceneViewport mode="RITUAL_RELEASE" onReleaseDrop={vi.fn()} />);
    rect();
    const chip = chipEl();
    fireEvent.pointerDown(chip, { pointerId: 1, clientX: 160, clientY: 140 });
    fireEvent.pointerMove(chip, { pointerId: 1, clientX: 160, clientY: 130 });
    const afterStart = riverRenders.count;
    expect(afterStart).toBeGreaterThan(0);
    for (let i = 1; i <= 20; i++) fireEvent.pointerMove(chip, { pointerId: 1, clientX: 160, clientY: 130 - i });
    expect(riverRenders.count).toBe(afterStart);
    expect(chipEl().style.top).not.toBe("50%"); // the chip follows by direct DOM writes
    fireEvent.pointerUp(viewport(), { pointerId: 1, clientX: 160, clientY: 110 });
  });

  it("reserves a slot for the own krathong on the pier (80 shared items give 79)", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    act(() => {
      useWorldStore.setState({
        eventId: "loy_krathong",
        currentZoneId: 1,
        zoneCount: 1,
        zoneStatus: "ready",
        zoneItems: Array.from({ length: 80 }, (_, i) => storeItemFor(i + 1)),
      });
    });
    const { container } = render(<SceneViewport mode="RITUAL_RELEASE" />);
    expect(container.querySelectorAll('[name^="river-item-"]')).toHaveLength(79);
  });

  it("a drop on the bank does not release", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const onRelease = vi.fn();
    render(<SceneViewport mode="RITUAL_RELEASE" onReleaseDrop={onRelease} />);
    rect();
    const chip = chipEl();
    fireEvent.pointerDown(chip, { pointerId: 1, clientX: 160, clientY: 140 });
    fireEvent.pointerMove(chip, { pointerId: 1, clientX: 160, clientY: 200 });
    fireEvent.pointerUp(viewport(), { pointerId: 1, clientX: 160, clientY: 200 });
    expect(onRelease).not.toHaveBeenCalled();
    expect(useUIStore.getState().ritual.hint).toBe("DROP_ON_WATER");
    expect(chipEl()).toHaveStyle({ left: "50%", top: "50%" });
  });
});

const storeItemFor = (i: number): PublicCreation => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  eventId: "loy_krathong",
  zoneId: 1,
  appearance: serializeKrathongAppearance(DEFAULT_KRATHONG_APPEARANCE) as unknown as PublicCreation["appearance"],
  coord: { mode: "SPLINE_PATH", laneId: 1, spawnProgress: (i % 100) / 100, speedFactor: RIVER_DRIFT_SPEED_FACTOR, lateralOffset: 0 },
  publicWishText: null,
  createdAt: "2026-11-24T12:00:00.000Z",
  expiresAt: "2099-01-01T00:00:00.000Z",
  displayName: null,
});

const savedRelease = (patch: Partial<SavedRelease> = {}): SavedRelease => ({
  id: "own-creation",
  zoneId: 1,
  coord: buildReleaseCoord(LOY_KRATHONG_PIER_RELEASE_SPOT),
  createdAtMs: 1_700_000_000_000,
  serverClockOffsetMs: 0,
  movedByServer: false,
  ...patch,
});
const setRitual = (patch: Partial<RitualState>) =>
  act(() => {
    useUIStore.setState({ ritual: { ...INITIAL_RITUAL_STATE, ...patch } });
  });
const ritualStart = () =>
  act(() => {
    useUIStore.getState().dispatchRitual({ type: "RELEASE_STARTED", attempt: 1, origin: { kind: "pier" } });
  });

describe("make and release ritual", () => {
  it("RITUAL_RELEASE frames the pier once", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const { container } = render(<SceneViewport mode="RITUAL_RELEASE" />);
    expect(r3f.flightStarts).toHaveLength(1);
    expect(r3f.flightStarts[0].immediate).toBe(false);
    expect(container.querySelector("ringGeometry")).toBeNull();
    expect(container.querySelector(`[name="${SCENE_OBJECT_NAMES.pierFocus}"]`)).not.toBeNull();
    cleanup();
    r3f.flightStarts.length = 0;
    useDeviceStore.getState().setReducedMotion(true);
    render(<SceneViewport mode="RITUAL_RELEASE" />);
    expect(r3f.flightStarts).toHaveLength(1);
    expect(r3f.flightStarts[0].immediate).toBe(true);
  });

  it("ritual preview: the own krathong stands on the pier with the only point light", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const { container } = render(<SceneViewport mode="RITUAL_RELEASE" />);
    expect(viewport()).toHaveAttribute("data-own-krathong-pose", "PIER");
    expect(container.querySelector('[name="scene-krathong-pose"] [name="scene-krathong"] pointLight')).not.toBeNull();
    expect(container.querySelectorAll("pointLight, spotLight")).toHaveLength(1);
    for (const attr of viewport().getAttributeNames().filter((n) => n.startsWith("data-"))) {
      expect(viewport().getAttribute(attr)).not.toContain("own-creation");
    }
  });

  it("the chip hides while releasing", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    render(<SceneViewport mode="RITUAL_RELEASE" />);
    expect(screen.getByRole("img", { name: "กระทง ลากลงน้ำ" })).toBeInTheDocument();
    ritualStart();
    expect(screen.queryByRole("img", { name: "กระทง ลากลงน้ำ" })).toBeNull();
    expect(viewport()).toHaveAttribute("data-own-krathong-pose", "RELEASING");
  });

  it("touchdown ripples once", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    useDeviceStore.getState().setReducedMotion(true);
    const { rerender } = render(<SceneViewport mode="RITUAL_RELEASE" />);
    ritualStart();
    expect(useUIStore.getState().ritual.touchedDown).toBe(true);
    expect(viewport()).toHaveAttribute("data-last-gimmick", "ripple");
    expect(viewport()).toHaveAttribute("data-gimmick-count", "1");
    rerender(<SceneViewport mode="RITUAL_RELEASE" />);
    expect(viewport()).toHaveAttribute("data-gimmick-count", "1");
  });

  it("the candle brightens at touchdown (instantly under reduced motion) and returns on failure", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    useDeviceStore.getState().setReducedMotion(true);
    render(<SceneViewport mode="RITUAL_RELEASE" />);
    release.starts.length = 0;
    ritualStart();
    const candle = release.starts.filter((o) => o.name === "candle");
    expect(candle).toHaveLength(1);
    expect(candle[0].immediate).toBe(true);
    act(() => {
      useUIStore.getState().dispatchRitual({ type: "SAVE_FAILED", attempt: 1, error: { kind: "network" } });
    });
    expect(release.starts.filter((o) => o.name === "candle")).toHaveLength(2);
  });

  it("bump plays once", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    render(<SceneViewport mode="RITUAL_RELEASE" />);
    ritualStart();
    act(() => {
      useUIStore.getState().dispatchRitual({
        type: "LANDING_RESOLVED",
        attempt: 1,
        landing: LOY_KRATHONG_PIER_RELEASE_SPOT,
        collided: true,
      });
    });
    const bumps = () => release.starts.filter((o) => o.name === "bump" && o.from !== undefined);
    expect(bumps()).toHaveLength(0);
    const lower = release.starts.filter((o) => o.name === "lower" && o.from !== undefined).at(-1)!;
    act(() => lower.onRest!());
    expect(bumps()).toHaveLength(1);
    act(() => {
      useUIStore.getState().dispatchRitual({ type: "SAVED", attempt: 1, saved: savedRelease({ movedByServer: true }) });
    });
    expect(bumps()).toHaveLength(1);
  });

  it("after the release the own krathong rides the river", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    setRitual({ phase: "RELEASED", attempt: 1, saved: savedRelease() });
    const own = {
      id: "own-creation",
      coord: buildReleaseCoord(LOY_KRATHONG_PIER_RELEASE_SPOT),
      createdAtMs: 1_700_000_000_000,
      appearance: DEFAULT_KRATHONG_APPEARANCE,
    };
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" riverItems={[own]} />);
    expect(viewport()).toHaveAttribute("data-own-krathong-pose", "RIVER");
    expect(container.querySelector('[name="river-item-own-creation"]')).toBeNull();
    act(() => {
      useWorldStore.setState({ eventId: "loy_krathong", currentZoneId: 2, zoneCount: 2, zoneStatus: "ready" });
    });
    expect(viewport()).toHaveAttribute("data-own-krathong-pose", "HIDDEN");
  });
});

describe("customizer view handle and part-change bounce", () => {
  it("view handle rotates like a drag and zooms through the pinch clamp", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const ref = createRef<CustomizeViewControl>();
    const { container } = render(<SceneViewport mode="CUSTOMIZE" viewControlRef={ref} />);
    act(() => ref.current!.rotate(1));
    expect(yaw(container)).toBeCloseTo(CUSTOMIZE_ROTATE_STEP_RADIANS, 9);

    const v = viewport();
    fireEvent.pointerDown(v, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(v, { pointerId: 1, clientX: 40, clientY: 10 });
    fireEvent.pointerUp(v, { pointerId: 1, clientX: 40, clientY: 10 });
    expect(yaw(container)).toBeCloseTo(CUSTOMIZE_ROTATE_STEP_RADIANS + 30 * ROTATION_RADIANS_PER_PIXEL, 9);

    act(() => ref.current!.rotate(-1));
    expect(yaw(container)).toBeCloseTo(30 * ROTATION_RADIANS_PER_PIXEL, 9);

    act(() => ref.current!.zoom(1));
    expect(r3f.camera!.zoom).toBeCloseTo(TOY_SCENE_CAMERA.zoom * CUSTOMIZE_ZOOM_STEP_SCALE, 9);
    for (let i = 0; i < 5; i += 1) act(() => ref.current!.zoom(1));
    expect(r3f.camera!.zoom).toBeCloseTo(TOY_SCENE_CAMERA.zoom * PINCH_ZOOM_MAX, 9);
    for (let i = 0; i < 10; i += 1) act(() => ref.current!.zoom(-1));
    expect(r3f.camera!.zoom).toBeCloseTo(TOY_SCENE_CAMERA.zoom * PINCH_ZOOM_MIN, 9);
    for (const props of r3f.cameraProps) expect(props).toBe(TOY_SCENE_CANVAS_CAMERA);
  });

  it("pinch and zoom buttons share one zoom factor", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const ref = createRef<CustomizeViewControl>();
    render(<SceneViewport mode="CUSTOMIZE" viewControlRef={ref} />);
    const v = viewport();
    fireEvent.pointerDown(v, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerDown(v, { pointerId: 2, clientX: 30, clientY: 10 });
    fireEvent.pointerMove(v, { pointerId: 2, clientX: 40, clientY: 10 });
    fireEvent.pointerUp(v, { pointerId: 2, clientX: 40, clientY: 10 });
    fireEvent.pointerUp(v, { pointerId: 1, clientX: 10, clientY: 10 });
    expect(r3f.camera!.zoom).toBeCloseTo(TOY_SCENE_CAMERA.zoom * 1.5, 9);
    act(() => ref.current!.zoom(1));
    expect(r3f.camera!.zoom).toBeCloseTo(
      TOY_SCENE_CAMERA.zoom * Math.min(PINCH_ZOOM_MAX, 1.5 * CUSTOMIZE_ZOOM_STEP_SCALE),
      9,
    );
  });

  it.each(["RITUAL_RELEASE", "WORLD_EXPLORE"] as const)("view handle does nothing outside CUSTOMIZE (%s)", (mode) => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const ref = createRef<CustomizeViewControl>();
    const { container } = render(<SceneViewport mode={mode} viewControlRef={ref} />);
    act(() => ref.current!.rotate(1));
    act(() => ref.current!.zoom(1));
    expect(yaw(container)).toBe(0);
    expect(r3f.camera!.zoom).toBe(TOY_SCENE_CAMERA.zoom);
  });

  it("bounce group wraps the krathong model", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const { container } = render(<SceneViewport mode="CUSTOMIZE" />);
    const target = krathongTarget(container);
    expect(target.querySelector('[name="part-change-bounce"] [name="krathong-model"]')).not.toBeNull();
    expect(target.querySelector('[name="part-change-bounce"] pointLight')).toBeNull();
    expect(target.querySelector("pointLight")).not.toBeNull();
  });

  it("bounces on an appearance change, not on mount or on a no-op", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    render(<SceneViewport mode="CUSTOMIZE" />);
    expect(r3f.bounceStarts).toHaveLength(0);
    act(() => void useBuilderStore.getState().chooseKrathong({ part: "base", value: "toy_bread_01" }));
    expect(r3f.bounceStarts).toHaveLength(1);
    const last = r3f.bounceStarts[0];
    expect(last.immediate).toBe(false);
    expect(last.from?.scale).toBe(PART_CHANGE_BOUNCE.fromScale);
    expect(last.to.scale).toBe(PART_CHANGE_BOUNCE.restScale);
    act(() => void useBuilderStore.getState().chooseKrathong({ part: "base", value: "toy_bread_01" }));
    expect(r3f.bounceStarts).toHaveLength(1);
    act(() => void useBuilderStore.getState().chooseKrathong({ part: "candleColor", value: "#FF9F6B" }));
    expect(r3f.bounceStarts).toHaveLength(2);
  });

  it("reduced motion: the part change does not animate", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    useDeviceStore.getState().setReducedMotion(true);
    render(<SceneViewport mode="CUSTOMIZE" />);
    act(() => void useBuilderStore.getState().chooseKrathong({ part: "base", value: "toy_bread_01" }));
    expect(r3f.bounceStarts.at(-1)).toStrictEqual({ to: { scale: PART_CHANGE_BOUNCE.restScale }, immediate: true });
    expect(r3f.bounceStarts.some((o) => !o.immediate)).toBe(false);

    act(() => useDeviceStore.getState().setReducedMotion(false));
    act(() => void useBuilderStore.getState().chooseKrathong({ part: "base", value: "lotus_petal_01" }));
    expect(r3f.bounceStarts.at(-1)?.immediate).toBe(false);
  });
});

describe("river flow in the scene", () => {
  it("renders no river krathongs by default", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    expect(container.querySelector('[name="river-flow"]')).toBeNull();
  });

  it("passes river items into the world-view group", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const riverItems = [
      {
        id: "a",
        coord: { mode: "SPLINE_PATH" as const, laneId: 1, spawnProgress: 0.2, speedFactor: RIVER_DRIFT_SPEED_FACTOR, lateralOffset: 0 },
        createdAtMs: 1_700_000_000_000,
        appearance: DEFAULT_KRATHONG_APPEARANCE,
      },
    ];
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" riverItems={riverItems} />);
    const worldView = container.querySelector(`[name="${SCENE_OBJECT_NAMES.worldView}"]`)!;
    expect(worldView.querySelector('[name="river-item-a"]')).not.toBeNull();
  });
  const storeItem = (zoneId: number, i: number): PublicCreation => ({
    id: `00000000-0000-4000-8000-${String(zoneId * 1000 + i).padStart(12, "0")}`,
    eventId: "loy_krathong",
    zoneId,
    appearance: serializeKrathongAppearance(DEFAULT_KRATHONG_APPEARANCE) as unknown as PublicCreation["appearance"],
    coord: { mode: "SPLINE_PATH", laneId: 1, spawnProgress: (i % 100) / 100, speedFactor: RIVER_DRIFT_SPEED_FACTOR, lateralOffset: 0 },
    publicWishText: null,
    createdAt: "2026-11-24T12:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
    displayName: null,
  });
  const setWorld = (zoneId: number, items: PublicCreation[]) =>
    act(() => {
      useWorldStore.setState({ eventId: "loy_krathong", currentZoneId: zoneId, zoneCount: 3, zoneStatus: "ready", zoneItems: items });
    });
  const riverGroups = (c: HTMLElement) => [...c.querySelectorAll('[name^="river-item-"]')];

  it("renders the visible zone from the store", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    setWorld(2, [storeItem(2, 1), storeItem(2, 2)]);
    const { container, rerender } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    expect(riverGroups(container)).toHaveLength(2);
    expect(viewport()).toHaveAttribute("data-river-item-count", "2");
    expect(viewport()).toHaveAttribute("data-zone-id", "2");
    rerender(<SceneViewport mode="CUSTOMIZE" />);
    expect(riverGroups(container)).toHaveLength(0);
    expect(viewport()).toHaveAttribute("data-river-item-count", "0");
  });

  it("renders at most 80 river items from the store", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    setWorld(2, Array.from({ length: 85 }, (_, i) => storeItem(2, i + 1)));
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    expect(riverGroups(container)).toHaveLength(80);
    expect(viewport()).toHaveAttribute("data-river-item-count", "80");
  });

  it.each([false, true])("zone switch swaps river items (reducedMotion %s)", (reduced) => {
    useDeviceStore.setState({ reducedMotion: reduced });
    useDeviceStore.getState().setQualityTier("HIGH");
    setWorld(2, [storeItem(2, 1), storeItem(2, 2)]);
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    const flights = r3f.flightStarts.length;
    const target = viewport().getAttribute("data-selected-target");
    const oldIds = riverGroups(container).map((g) => g.getAttribute("name"));
    setWorld(3, []);
    expect(riverGroups(container)).toHaveLength(0);
    setWorld(3, [storeItem(3, 1)]);
    const newIds = riverGroups(container).map((g) => g.getAttribute("name"));
    expect(newIds).toHaveLength(1);
    expect(oldIds).not.toContain(newIds[0]);
    expect(r3f.flightStarts.length).toBe(flights);
    expect(viewport().getAttribute("data-selected-target")).toBe(target);
  });

  it("zone switch reuses the one krathong asset set", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    setWorld(2, [storeItem(2, 1)]);
    const { unmount } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    setWorld(3, [storeItem(3, 1), storeItem(3, 2)]);
    setWorld(1, []);
    expect(assets.created).toBe(1);
    expect(assets.disposed).toBe(0);
    unmount();
    expect(assets.disposed).toBe(1);
  });

  it("a focused creation is rendered even when the tier cap hides it", () => {
    useDeviceStore.getState().setQualityTier("LOW");
    const items = Array.from({ length: 80 }, (_, i) => storeItem(2, i + 1));
    const cap = TIER_BUDGETS.LOW.riverItemCap;
    const lanes = getLoyKrathongRiverLanes();
    const prepared = prepareRiverItems(
      items.map((c) => ({ id: c.id, coord: c.coord as never, createdAtMs: Date.parse(c.createdAt) })),
      lanes,
    );
    const shown = new Set(selectVisibleRiverItems(prepared, cap).map((i) => i.id));
    const hidden = items.find((c) => !shown.has(c.id))!;
    setWorld(2, items);
    act(() => useWorldStore.setState({ focusedCreationId: hidden.id }));
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    expect(container.querySelector(`[name="river-item-${hidden.id}"]`)).not.toBeNull();
    expect(riverGroups(container)).toHaveLength(cap);
  });

  it("the riverItems prop overrides the store", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    setWorld(2, [storeItem(2, 1)]);
    const x = {
      id: "x",
      coord: { mode: "SPLINE_PATH" as const, laneId: 1, spawnProgress: 0.2, speedFactor: RIVER_DRIFT_SPEED_FACTOR, lateralOffset: 0 },
      createdAtMs: 1_700_000_000_000,
      appearance: DEFAULT_KRATHONG_APPEARANCE,
    };
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" riverItems={[x]} />);
    expect(riverGroups(container).map((g) => g.getAttribute("name"))).toEqual(["river-item-x"]);
  });
});

describe("scene gimmicks (MFW-28)", () => {
  const ITEM_ID = "950118ce-7d93-4cb6-bd84-44d91c5de9e3";
  const WISH = "ขอให้ครอบครัวมีความสุข";
  const item = () => ({
    id: ITEM_ID,
    coord: { mode: "SPLINE_PATH" as const, laneId: 1, spawnProgress: 0.2, speedFactor: RIVER_DRIFT_SPEED_FACTOR, lateralOffset: 0 },
    createdAtMs: 1_700_000_000_000,
    appearance: DEFAULT_KRATHONG_APPEARANCE,
    publicWishText: WISH,
  });
  const hit = (c: HTMLElement) => c.querySelector(`[name="river-hit-${ITEM_ID}"]`)!;

  beforeEach(() => useDeviceStore.getState().setQualityTier("HIGH"));

  it("water tap in WORLD_EXPLORE spawns a ripple", () => {
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    fireEvent.click(waterMesh(container));
    expect(viewport()).toHaveAttribute("data-last-gimmick", "ripple");
    expect(viewport()).toHaveAttribute("data-gimmick-count", "1");
    expect(viewport()).toHaveAttribute("data-selected-target", "water");
  });

  it("a water tap without a hit point selects but spawns nothing", () => {
    tapStub.value = null;
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    fireEvent.click(waterMesh(container));
    expect(viewport()).toHaveAttribute("data-selected-target", "water");
    expect(viewport()).not.toHaveAttribute("data-last-gimmick");
  });

  it("lamp tap lights the lamp", () => {
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    const flights = r3f.flightStarts.length;
    fireEvent.click(lampMesh(container));
    expect(viewport()).toHaveAttribute("data-last-gimmick", "lamp-glow");
    expect(viewport()).toHaveAttribute("data-selected-target", "lamp");
    expect(r3f.flightStarts.length).toBe(flights + 1);
  });

  it.each(["CUSTOMIZE", "RITUAL_RELEASE"] as const)("%s taps spawn no gimmick", (mode) => {
    const { container } = render(<SceneViewport mode={mode} riverItems={[item()]} />);
    fireEvent.click(waterMesh(container));
    fireEvent.click(lampMesh(container));
    expect(viewport()).not.toHaveAttribute("data-last-gimmick");
    expect(container.querySelectorAll('[name^="river-hit-"]')).toHaveLength(0);
  });

  it("river krathong tap opens the inspect popup", () => {
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" riverItems={[item()]} />);
    fireEvent.click(hit(container));
    const dialog = screen.getByRole("dialog", { name: INSPECT_POPUP_COPY.dialogTitle });
    expect(dialog).toHaveTextContent(WISH);
    expect(viewport()).toHaveAttribute("data-last-gimmick", "inspect");
    expect(viewport().contains(dialog)).toBe(false);
    for (const attr of viewport().getAttributeNames().filter((n) => n.startsWith("data-"))) {
      const value = viewport().getAttribute(attr)!;
      expect(value).not.toContain(ITEM_ID);
      expect(value).not.toContain(WISH);
    }
    fireEvent.click(screen.getByRole("button", { name: INSPECT_POPUP_COPY.close }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the popup closes on mode change and when the item leaves", () => {
    const items = [item()];
    const { container, rerender } = render(<SceneViewport mode="WORLD_EXPLORE" riverItems={items} />);
    fireEvent.click(hit(container));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    rerender(<SceneViewport mode="RITUAL_RELEASE" riverItems={items} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<SceneViewport mode="WORLD_EXPLORE" riverItems={items} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(hit(container));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    rerender(<SceneViewport mode="WORLD_EXPLORE" riverItems={[]} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("owner private wish reveal in the popup (MFW-31)", () => {
  const ITEM_ID = "950118ce-7d93-4cb6-bd84-44d91c5de9e3";
  const item = (publicWishText: string | null) => ({
    id: ITEM_ID,
    coord: { mode: "SPLINE_PATH" as const, laneId: 1, spawnProgress: 0.2, speedFactor: RIVER_DRIFT_SPEED_FACTOR, lateralOffset: 0 },
    createdAtMs: 1_700_000_000_000,
    appearance: DEFAULT_KRATHONG_APPEARANCE,
    publicWishText,
  });
  const hit = (c: HTMLElement) => c.querySelector(`[name="river-hit-${ITEM_ID}"]`)!;
  let unregister: (() => void) | null = null;
  beforeEach(() => useDeviceStore.getState().setQualityTier("HIGH"));
  afterEach(() => {
    unregister?.();
    unregister = null;
    vi.restoreAllMocks();
  });

  it("AC1: someone else's private krathong shows no reveal", () => {
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" riverItems={[item(null)]} />);
    fireEvent.click(hit(container));
    expect(screen.getByRole("dialog")).toHaveTextContent(INSPECT_POPUP_COPY.noPublicWish);
    expect(screen.queryByRole("button", { name: OWNER_WISH_COPY.reveal })).toBeNull();
  });

  it("AC2: own private krathong offers the reveal, with no request before the tap", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    unregister = registerOwnedCreationPredicate((id) => id === ITEM_ID);
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" riverItems={[item(null)]} />);
    fireEvent.click(hit(container));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: OWNER_WISH_COPY.reveal })).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("own public krathong shows no reveal", () => {
    unregister = registerOwnedCreationPredicate((id) => id === ITEM_ID);
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" riverItems={[item("ขอให้ทุกคนมีความสุข")]} />);
    fireEvent.click(hit(container));
    expect(screen.queryByRole("button", { name: OWNER_WISH_COPY.reveal })).toBeNull();
  });
});

describe("Find My (MFW-30)", () => {
  const storeItem = (zoneId: number, i: number): PublicCreation => ({
    id: `00000000-0000-4000-8000-${String(zoneId * 1000 + i).padStart(12, "0")}`,
    eventId: "loy_krathong",
    zoneId,
    appearance: serializeKrathongAppearance(DEFAULT_KRATHONG_APPEARANCE) as unknown as PublicCreation["appearance"],
    coord: { mode: "SPLINE_PATH", laneId: 1, spawnProgress: (i % 100) / 100, speedFactor: RIVER_DRIFT_SPEED_FACTOR, lateralOffset: 0 },
    publicWishText: null,
    createdAt: "2026-11-24T12:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
    displayName: null,
  });
  const setWorld = (zoneId: number, items: PublicCreation[]) =>
    act(() => {
      useWorldStore.setState({ eventId: "loy_krathong", currentZoneId: zoneId, zoneCount: 3, zoneStatus: "ready", zoneItems: items });
    });
  const focus = (id: string | null, request: number) =>
    act(() => useWorldStore.setState({ focusedCreationId: id, focusRequestId: request }));
  const riverGroups = (c: HTMLElement) => [...c.querySelectorAll('[name^="river-item-"]')];
  const anchor = (c: HTMLElement) => c.querySelector(`[name="${SCENE_OBJECT_NAMES.findMyAnchor}"]`);
  const expectedWorld = (c: PublicCreation) => {
    const lanes = getLoyKrathongRiverLanes();
    const [prepared] = prepareRiverItems([{ id: c.id, coord: c.coord as never, createdAtMs: Date.parse(c.createdAt) }], lanes);
    return getRiverItemPositionAt(prepared, lanes, Date.now())!.world;
  };
  const useAttributePositions = () =>
    Object.defineProperty(HTMLUnknownElement.prototype, "getWorldPosition", {
      configurable: true,
      value(this: Element, target: Vector3) {
        const [x = 0, y = 0, z = 0] = (this.getAttribute("position") ?? "0,0,0").split(",").map(Number);
        target.set(x, y, z);
        return target;
      },
    });
  const restoreStub = () =>
    Object.defineProperty(HTMLUnknownElement.prototype, "getWorldPosition", {
      configurable: true,
      value(target: Vector3) {
        target.set(0, 0, 0);
        return target;
      },
    });
  const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-11-24T12:00:30.000Z"));
    useDeviceStore.getState().setQualityTier("HIGH");
    useAttributePositions();
  });
  afterEach(() => {
    vi.useRealTimers();
    restoreStub();
  });

  it("a focus request flies to the krathong's current position", () => {
    const items = [storeItem(2, 1), storeItem(2, 2)];
    setWorld(2, items);
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    const before = r3f.flightStarts.length;
    focus(items[1].id, 1);
    expect(viewport()).toHaveAttribute("data-selected-target", "riverKrathong");
    expect(viewport()).toHaveAttribute("data-find-my", "following");
    const node = anchor(container)!;
    expect(container.querySelector(`[name="${SCENE_OBJECT_NAMES.worldView}"]`)!.contains(node)).toBe(true);
    const world = expectedWorld(items[1]);
    const [x, y, z] = node.getAttribute("position")!.split(",").map(Number);
    near(x, world.x);
    near(y, world.y);
    near(z, world.z);
    expect(r3f.flightStarts).toHaveLength(before + 1);
    const flight = r3f.flightStarts[before];
    expect(flight.immediate).toBe(false);
    const pose = getCameraFlightPose(world);
    for (const [k, v] of Object.entries(pose)) near((flight.to as Record<string, number>)[k], v);
  });

  it("reduced motion: the Find My flight is an instant cut", () => {
    useDeviceStore.setState({ reducedMotion: true });
    const items = [storeItem(2, 1)];
    setWorld(2, items);
    render(<SceneViewport mode="WORLD_EXPLORE" />);
    const before = r3f.flightStarts.length;
    focus(items[0].id, 1);
    expect(r3f.flightStarts).toHaveLength(before + 1);
    expect(r3f.flightStarts[before].immediate).toBe(true);
  });

  it("selecting the same krathong again flies again", () => {
    const items = [storeItem(2, 1)];
    setWorld(2, items);
    render(<SceneViewport mode="WORLD_EXPLORE" />);
    const before = r3f.flightStarts.length;
    focus(items[0].id, 1);
    focus(items[0].id, 2);
    expect(r3f.flightStarts).toHaveLength(before + 2);
  });

  it("the highlight targets the focused krathong", () => {
    const items = [storeItem(2, 1), storeItem(2, 2)];
    setWorld(2, items);
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    expect(container.querySelector("ringgeometry")).toBeNull();
    focus(items[1].id, 1);
    expect(viewport()).toHaveAttribute("data-selected-target", "riverKrathong");
    const ring = container.querySelector("ringgeometry")!;
    const { innerRadius, outerRadius } = HIGHLIGHT_RING_SIZES.riverKrathong;
    expect(ring.getAttribute("args")!.startsWith(`${innerRadius},${outerRadius},`)).toBe(true);
    fireEvent.click(waterMesh(container));
    expect(viewport()).toHaveAttribute("data-selected-target", "water");
    expect(viewport()).not.toHaveAttribute("data-find-my");
    expect(container.querySelector(`[name="river-item-${items[1].id}"]`)).not.toBeNull();
  });

  it("a zone switch drops the focus", () => {
    const items = [storeItem(2, 1)];
    setWorld(2, items);
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    focus(items[0].id, 1);
    expect(anchor(container)).not.toBeNull();
    act(() => useWorldStore.setState({ focusedCreationId: null, zoneItems: [storeItem(3, 1)], currentZoneId: 3 }));
    expect(anchor(container)).toBeNull();
    expect(viewport()).not.toHaveAttribute("data-selected-target");
    expect(viewport()).not.toHaveAttribute("data-find-my");
  });

  it("an unknown id does not fly", () => {
    setWorld(2, [storeItem(2, 1)]);
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    const before = r3f.flightStarts.length;
    focus("00000000-0000-4000-8000-999999999999", 1);
    expect(r3f.flightStarts).toHaveLength(before);
    expect(anchor(container)).toBeNull();
  });

  it("outside WORLD_EXPLORE nothing happens", () => {
    const items = [storeItem(2, 1)];
    setWorld(2, items);
    const { container } = render(<SceneViewport mode="CUSTOMIZE" />);
    const before = r3f.flightStarts.length;
    focus(items[0].id, 1);
    expect(anchor(container)).toBeNull();
    expect(r3f.flightStarts).toHaveLength(before);
  });

  it("a tier-hidden focus is pinned and followed", () => {
    useDeviceStore.getState().setQualityTier("LOW");
    const items = Array.from({ length: 80 }, (_, i) => storeItem(2, i + 1));
    const cap = TIER_BUDGETS.LOW.riverItemCap;
    const prepared = prepareRiverItems(
      items.map((c) => ({ id: c.id, coord: c.coord as never, createdAtMs: Date.parse(c.createdAt) })),
      getLoyKrathongRiverLanes(),
    );
    const shown = new Set(selectVisibleRiverItems(prepared, cap).map((i) => i.id));
    const hidden = items.find((c) => !shown.has(c.id))!;
    setWorld(2, items);
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    focus(hidden.id, 1);
    expect(container.querySelector(`[name="river-item-${hidden.id}"]`)).not.toBeNull();
    expect(anchor(container)).not.toBeNull();
    expect(riverGroups(container)).toHaveLength(cap);
  });

  it("no data-* attribute contains the focused id", () => {
    const items = [storeItem(2, 1)];
    setWorld(2, items);
    render(<SceneViewport mode="WORLD_EXPLORE" />);
    focus(items[0].id, 1);
    for (const attr of viewport().getAttributeNames().filter((n) => n.startsWith("data-"))) {
      expect(viewport().getAttribute(attr)).not.toContain(items[0].id);
    }
  });
});

describe("river batch and perf probe (MFW-34)", () => {
  const riverItem = (id: string) => ({
    id,
    coord: { mode: "SPLINE_PATH" as const, laneId: 1, spawnProgress: 0.2, speedFactor: RIVER_DRIFT_SPEED_FACTOR, lateralOffset: 0 },
    createdAtMs: 1_700_000_000_000,
    appearance: DEFAULT_KRATHONG_APPEARANCE,
  });
  const probe = (c: HTMLElement) => c.querySelector('[data-testid="perf-probe"]');
  const probeHook = () =>
    (window as unknown as Record<string, { sample(): Record<string, unknown> | null } | undefined>)[PERF_PROBE_GLOBAL_NAME];

  it("river krathongs render through one persistent batch", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const items = [riverItem("a"), riverItem("b"), riverItem("c")];
    const { container, rerender } = render(<SceneViewport mode="WORLD_EXPLORE" riverItems={items} />);
    const groups = container.querySelectorAll('[name^="river-item-"]');
    expect(groups).toHaveLength(3);
    for (const g of groups) expect(g.querySelector('mesh:not([name^="river-hit-"])')).toBeNull(); // only MFW-28 hit proxies remain
    const batch = container.querySelectorAll('[name="river-krathong-batch"]');
    expect(batch).toHaveLength(1);
    expect(batch[0].querySelectorAll("primitive")).toHaveLength(KRATHONG_INSTANCE_BUCKET_COUNT);
    rerender(<SceneViewport mode="WORLD_EXPLORE" riverItems={[]} />);
    expect(container.querySelector('[name="river-krathong-batch"]')).toBe(batch[0]);
  });

  it("perf probe is off by default", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    expect(probe(container)).toBeNull();
    expect(probeHook()).toBeUndefined();
  });

  it("perf probe with ?perfProbe=1 sits beside the viewport and reads the renderer", () => {
    window.history.replaceState(null, "", "/?perfProbe=1");
    useDeviceStore.getState().setQualityTier("HIGH");
    const { container, rerender } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    const panel = probe(container)!;
    expect(panel).not.toBeNull();
    expect(viewport().contains(panel)).toBe(false);
    expect(probeHook()!.sample()).toMatchObject({ geometries: 3, calls: 12, programs: 2 });
    act(() => useDeviceStore.getState().setQualityTier("FALLBACK_2D"));
    rerender(<SceneViewport mode="WORLD_EXPLORE" />);
    expect(probe(container)).toBeNull();
    expect(screen.queryByTestId("r3f-canvas")).toBeNull();
  });

  it("the soak button exists only in WORLD_EXPLORE", () => {
    window.history.replaceState(null, "", "/?perfProbe=1");
    useDeviceStore.getState().setQualityTier("HIGH");
    const { rerender } = render(<SceneViewport mode="CUSTOMIZE" />);
    expect(screen.queryByRole("button", { name: "Run zone-switch soak" })).toBeNull();
    rerender(<SceneViewport mode="WORLD_EXPLORE" />);
    expect(screen.getByRole("button", { name: "Run zone-switch soak" })).toBeTruthy();
  });
});

describe("pointer capture (MFW-59)", () => {
  let setSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    useDeviceStore.getState().setQualityTier("HIGH");
    setSpy = vi.spyOn(HTMLElement.prototype, "setPointerCapture");
  });
  afterEach(() => setSpy.mockRestore());

  it("a short WORLD_EXPLORE tap never captures", () => {
    render(<SceneViewport mode="WORLD_EXPLORE" />);
    fireEvent.pointerDown(viewport(), { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(viewport(), { pointerId: 1, clientX: 100, clientY: 100 });
    expect(setSpy).not.toHaveBeenCalled();
    expect(viewport()).toHaveAttribute("data-last-interaction", "water");
  });

  it("a WORLD_EXPLORE drag captures once it becomes a drag", () => {
    render(<SceneViewport mode="WORLD_EXPLORE" />);
    fireEvent.pointerDown(viewport(), { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(viewport(), { pointerId: 1, clientX: 100 + DRAG_START_DISTANCE_PX - 1, clientY: 100 });
    expect(setSpy).not.toHaveBeenCalled();
    fireEvent.pointerMove(viewport(), { pointerId: 1, clientX: 100 + DRAG_START_DISTANCE_PX, clientY: 100 });
    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledWith(1);
    const hasSpy = vi.spyOn(HTMLElement.prototype, "hasPointerCapture").mockReturnValue(true);
    fireEvent.pointerMove(viewport(), { pointerId: 1, clientX: 100 + DRAG_START_DISTANCE_PX + 20, clientY: 100 });
    expect(setSpy).toHaveBeenCalledTimes(1);
    hasSpy.mockRestore();
  });

  it("CUSTOMIZE captures on pointerdown", () => {
    render(<SceneViewport mode="CUSTOMIZE" />);
    fireEvent.pointerDown(viewport(), { pointerId: 1, clientX: 100, clientY: 100 });
    expect(setSpy).toHaveBeenCalledTimes(1);
  });

  it("RITUAL_RELEASE captures on pointerdown on the chip", () => {
    const { container } = render(<SceneViewport mode="RITUAL_RELEASE" onReleaseDrop={vi.fn()} />);
    fireEvent.pointerDown(container.querySelector('[data-input-target="krathong"]')!, { pointerId: 1, clientX: 100, clientY: 100 });
    expect(setSpy).toHaveBeenCalledTimes(1);
  });

  it("lamp proxy tap lights that lamp", () => {
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    fireEvent.click(container.querySelector('[name="scene-lamp-tap-3"]')!);
    expect(viewport()).toHaveAttribute("data-last-gimmick", "lamp-glow");
    expect(viewport()).toHaveAttribute("data-selected-target", "lamp");
    const want = lampHeadPosition(LOY_KRATHONG_RIVER_LAYOUT.lamps[3], RIVER_ENVIRONMENT_PARTS.lampHead.yOffset).join(",");
    expect(container.querySelector('[name="scene-lamp-focus"]')!.getAttribute("position")).toBe(want);
  });
});

describe("scene tap hint (MFW-59)", () => {
  beforeEach(() => {
    localStorage.clear();
    useDeviceStore.getState().setQualityTier("HIGH");
  });
  const hintEl = () => screen.queryByTestId("scene-tap-hint");

  it("shows a pulsing, tap-through hint in WORLD_EXPLORE", () => {
    render(<SceneViewport mode="WORLD_EXPLORE" />);
    const el = screen.getByTestId("scene-tap-hint");
    expect(el).toHaveTextContent(SCENE_TAP_HINT_COPY.scene3d);
    expect(el.className).toContain("pointer-events-none");
    expect(el).toHaveAttribute("data-motion", "pulse");
    expect(el.className).toContain("animate-pulse");
  });

  it("is static under reduced motion", () => {
    act(() => useDeviceStore.getState().setReducedMotion(true));
    render(<SceneViewport mode="WORLD_EXPLORE" />);
    const el = screen.getByTestId("scene-tap-hint");
    expect(el).toHaveAttribute("data-motion", "static");
    expect(el.className).not.toContain("animate-pulse");
  });

  it("goes away after a short tap and is remembered", () => {
    render(<SceneViewport mode="WORLD_EXPLORE" />);
    fireEvent.pointerDown(viewport(), { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(viewport(), { pointerId: 1, clientX: 100, clientY: 100 });
    expect(hintEl()).toBeNull();
    expect(localStorage.getItem(SCENE_TAP_HINT_STORAGE_KEY)).toBe(SCENE_TAP_HINT_SEEN_VALUE);
  });

  it("is not shown to a returning visitor", () => {
    localStorage.setItem(SCENE_TAP_HINT_STORAGE_KEY, SCENE_TAP_HINT_SEEN_VALUE);
    render(<SceneViewport mode="WORLD_EXPLORE" />);
    expect(hintEl()).toBeNull();
  });

  it.each(["CUSTOMIZE", "RITUAL_RELEASE"] as const)("is not shown in %s", (mode) => {
    render(<SceneViewport mode={mode} />);
    expect(hintEl()).toBeNull();
  });

  it("dismissing it does not re-render RiverFlow beyond one render", () => {
    render(<SceneViewport mode="WORLD_EXPLORE" />);
    const before = riverRenders.count;
    fireEvent.pointerDown(viewport(), { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(viewport(), { pointerId: 1, clientX: 100, clientY: 100 });
    expect(hintEl()).toBeNull();
    // interaction state (lastInteraction) already re-renders the viewport once per tap; the hint adds no extra render
    expect(riverRenders.count - before).toBeLessThanOrEqual(1);
  });
});
