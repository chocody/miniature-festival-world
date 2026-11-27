import { createRef } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BufferGeometry, OrthographicCamera, type Vector3 } from "three";
import { EFFECT_POOL_CAPS, LIVING_WORLD_TIERS, TIER_ANTIALIAS, TIER_BUDGETS, TIER_MAX_RENDER_PIXELS } from "@/config/performance.config";
import { MOON_SHADOW_MAP_SIZE_PX } from "@/config/scene.config";
import { LIGHT_PRESETS } from "@/config/look.config";
import { CANVAS_GL_OPTIONS } from "./sceneLook";
import { DEFAULT_KRATHONG_APPEARANCE } from "@/core/customization";
import { RIM_SOCKET_COUNT } from "@/config/events/loyKrathong.config";
import { PART_CHANGE_BOUNCE } from "@/config/customizer.config";
import {
  CUSTOMIZE_ROTATE_STEP_RADIANS,
  CUSTOMIZE_ZOOM_STEP_SCALE,
  PINCH_ZOOM_MAX,
  PINCH_ZOOM_MIN,
  ROTATION_RADIANS_PER_PIXEL,
  TWIST_START_RADIANS,
  WORLD_VIEW_ROTATE_BUTTON_COPY,
  WORLD_VIEW_ROTATE_STEP_RADIANS,
} from "@/config/interaction.config";
import { getPinchZoomFactor, getWheelZoomScale, type CustomizeViewControl } from "@/core/interaction";
import { useBuilderStore } from "@/store/useBuilderStore";
import { useDeviceStore } from "@/store/useDeviceStore";
import { useUIStore } from "@/store/useUIStore";
import { INITIAL_RITUAL_STATE, buildReleaseCoord, type RitualState, type SavedRelease } from "@/core/ritual";
import { LOY_KRATHONG_PIER_RELEASE_SPOT } from "@/config/events/loyKrathong.river.config";
import { createRitualDropMapper } from "./ritualSite";
import { INITIAL_WORLD_STATE, useWorldStore } from "@/store/useWorldStore";
import type { PublicCreation } from "@/services/api/creationTypes";
import {
  getLoyKrathongEndlessRiverFrame,
  getLoyKrathongRiverLanes,
  getRiverItemPositionAt,
  prepareRiverItems,
  selectVisibleRiverItems,
  zoneIdForStretch,
} from "@/core/world";
import { getZonePagination } from "@/services/api/zonePagination";
import {
  applyCameraRigPose,
  applyPanDrag,
  createCameraRigState,
  getCameraRigPose,
  getFramedCameraZoom,
  getRotatedCameraOffsetInto,
  isInsidePanBounds,
  twistCameraRig,
  type CameraRigState,
} from "@/core/camera";
import { SCENE_CAMERA_ZOOM } from "@/config/camera.config";
import { serializeKrathongAppearance } from "@/core/customization";
import { RIVER_DRIFT_SPEED_FACTOR, RIVER_KRATHONG_SCALE } from "@/config/riverFlow.config";
import { INSPECT_POPUP_COPY, WISH_BUBBLE_TIMING } from "@/config/inspect.config";
import { WISH_BUBBLE_ANCHOR_NAME } from "./WishBubbleAnchor";
import { KRATHONG_INSTANCE_BUCKET_COUNT } from "@/core/customization";
import { FLAME_FLICKER_REDRAW_INTERVAL_MS } from "@/config/krathongModel.config";
import { PERF_PROBE_GLOBAL_NAME } from "@/config/perfProbe.config";
import { OWNER_WISH_COPY } from "@/config/ownerWish.config";
import { registerOwnedCreationPredicate } from "@/services/auth/ownedCreationHint";
import { SCENE_OBJECT_NAMES } from "./sceneObjectNames";
import { DRAG_START_DISTANCE_PX } from "@/config/interaction.config";
import {
  SCENE_TAP_HINT_COPY,
  SCENE_TAP_HINT_SEEN_VALUE,
  SCENE_TAP_HINT_STORAGE_KEY,
  SKY_LAUNCH_SEED,
  SKY_LAUNCH_SEED_GLOBAL_NAME,
} from "@/config/gimmicks.config";
import { RIVER_ENVIRONMENT_PARTS } from "@/config/events/loyKrathong.river.config";
import { LOY_KRATHONG_RIVER_LAYOUT, lampHeadPosition } from "@/components/models/loyKrathong/riverLayout";
import {
  getSceneRenderSettings,
  SceneViewport,
  TOY_MATTE_MATERIALS,
  TOY_SCENE_CAMERA,
  TOY_SCENE_CANVAS_CAMERA,
  TOY_SCENE_LIGHTING,
  WORLD_PAN_BOUNDS,
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

/** MFW-60: records every effect pool manager the scene creates (so a test can read the pooled sky lantern / firework / nudge counts). */
const poolManagers = vi.hoisted(() => [] as import("@/core/effects").ObjectPoolManager[]);
vi.mock("@/core/effects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/effects")>();
  return {
    ...actual,
    createObjectPoolManager: (...args: Parameters<typeof actual.createObjectPoolManager>) => {
      const m = actual.createObjectPoolManager(...args);
      poolManagers.push(m);
      return m;
    },
  };
});

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

const riverRenders = vi.hoisted(() => ({ count: 0, last: null as Record<string, unknown> | null }));

/** Counts how often the scene re-renders RiverFlow (memoised: a drag must not do it per pointer-move); keeps its last props. */
vi.mock("./RiverFlow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./RiverFlow")>();
  const React = await import("react");
  return {
    ...actual,
    RiverFlow: (props: React.ComponentProps<typeof actual.RiverFlow>) => {
      riverRenders.count += 1;
      riverRenders.last = props as unknown as Record<string, unknown>;
      return React.createElement(actual.RiverFlow, props);
    },
  };
});

const ownRenders = vi.hoisted(() => ({ last: null as Record<string, unknown> | null }));

/** Keeps the real OwnKrathong and records its last props (MFW-67 mark cue). */
vi.mock("./OwnKrathong", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./OwnKrathong")>();
  const React = await import("react");
  return {
    ...actual,
    OwnKrathong: (props: React.ComponentProps<typeof actual.OwnKrathong>) => {
      ownRenders.last = props as unknown as Record<string, unknown>;
      return React.createElement(actual.OwnKrathong, props);
    },
  };
});

const tickers = vi.hoisted(() => ({ mounted: 0 }));

/** MFW-58: counts AmbientTicker mounts (the idle-redraw registration must exist once per canvas, not per stretch slot). */
vi.mock("./AmbientLife", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./AmbientLife")>();
  const React = await import("react");
  return {
    ...actual,
    AmbientTicker: (props: React.ComponentProps<typeof actual.AmbientTicker>) => {
      React.useEffect(() => {
        tickers.mounted += 1;
        return () => {
          tickers.mounted -= 1;
        };
      }, []);
      return React.createElement(actual.AmbientTicker, props);
    },
  };
});

const r3f = vi.hoisted(() => ({
  cameraProps: [] as unknown[],
  glProps: [] as unknown[],
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
    r3f.glProps.push(props.gl);
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
/** MFW-58: the stretch slot groups, in render order (current first). */
const stretchSlots = (c: HTMLElement) => Array.from(c.querySelectorAll('[name^="river-stretch-"]'));
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
  riverRenders.last = null;
  ownRenders.last = null;
  assets.created = 0;
  assets.disposed = 0;
  r3f.cameraProps.length = 0;
  r3f.glProps.length = 0;
  r3f.camera = null;
  r3f.flightStarts.length = 0;
  r3f.bounceStarts.length = 0;
});

describe("toy-like night scene", () => {
  it("uses an orthographic camera and soft night light with a warm candle light", () => {
    expect(TOY_SCENE_CAMERA.orthographic).toBe(true);
    expect(getPinchZoomFactor(1, 1.5)).toBe(1.5);
    expect(getPinchZoomFactor(1, 10)).toBe(1.6);
    expect(LIGHT_PRESETS.NIGHT.ambient.color).toBe("#8FA2D6");
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
    expect(container.querySelector('[name="scene-world-view"] hemisphereLight')).toBeNull();
    expect(container.querySelector("ambientLight")).not.toBeNull();
    expect(container.querySelector("hemisphereLight")).not.toBeNull();
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
    useDeviceStore.getState().setLightPresetChoice("NIGHT");
    const { rerender } = render(<SceneViewport mode="CUSTOMIZE" />);
    expect(viewport().style.backgroundColor).toBe("rgb(46, 62, 99)");
    expect(viewport()).toHaveAttribute("data-light-preset", "NIGHT");
    expect(viewport().className).not.toContain("bg-[");
    act(() => useDeviceStore.getState().setLightPresetChoice("DAY"));
    rerender(<SceneViewport mode="CUSTOMIZE" />);
    expect(viewport().style.backgroundColor).toBe("rgb(216, 228, 207)");
    expect(viewport()).toHaveAttribute("data-light-preset", "DAY");
  });

  it.each(["HIGH", "MEDIUM", "LOW"] as const)("%s: soft blob shadows under the props and the own krathong (AC2)", (tier) => {
    useDeviceStore.getState().setQualityTier(tier);
    const { container } = render(<SceneViewport mode="CUSTOMIZE" />);
    // MFW-58: one environment / river blob-shadow mesh per stretch slot (3 slots); one for the own krathong.
    const slots = stretchSlots(container);
    expect(slots).toHaveLength(3);
    for (const slot of slots) {
      expect(slot.querySelectorAll(`[name="${SCENE_OBJECT_NAMES.environmentBlobShadows}"]`)).toHaveLength(1);
      expect(slot.querySelectorAll(`[name="${SCENE_OBJECT_NAMES.riverBlobShadows}"]`)).toHaveLength(1);
    }
    expect(container.querySelectorAll(`[name="${SCENE_OBJECT_NAMES.krathongBlobShadow}"]`)).toHaveLength(1);
  });

  it("AUTO follows the device's local time (AC3)", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      useDeviceStore.getState().setQualityTier("HIGH");
      vi.setSystemTime(new Date(2026, 10, 25, 10, 0, 0));
      render(<SceneViewport mode="CUSTOMIZE" />);
      expect(viewport()).toHaveAttribute("data-light-preset", "DAY");
      cleanup();
      vi.setSystemTime(new Date(2026, 10, 25, 20, 0, 0));
      render(<SceneViewport mode="CUSTOMIZE" />);
      expect(viewport()).toHaveAttribute("data-light-preset", "NIGHT");
    } finally {
      vi.useRealTimers();
    }
  });

  it("the Canvas gl options are the stable tone-mapped objects", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    render(<SceneViewport mode="CUSTOMIZE" />);
    expect(r3f.glProps.at(-1)).toBe(CANVAS_GL_OPTIONS.on);
    cleanup();
    useDeviceStore.getState().setQualityTier("LOW");
    render(<SceneViewport mode="CUSTOMIZE" />);
    expect(r3f.glProps.at(-1)).toBe(CANVAS_GL_OPTIONS.off);
  });

  it("reduced motion renders the same lights and blobs", () => {
    const snapshot = (reduced: boolean) => {
      useDeviceStore.getState().setQualityTier("HIGH");
      useDeviceStore.getState().setReducedMotion(reduced);
      useDeviceStore.getState().setLightPresetChoice("NIGHT");
      const { container } = render(<SceneViewport mode="CUSTOMIZE" />);
      const selector = [
        "color",
        "hemisphereLight",
        "ambientLight",
        "directionalLight",
        "pointLight",
        `[name="${SCENE_OBJECT_NAMES.environmentBlobShadows}"]`,
        `[name="${SCENE_OBJECT_NAMES.krathongBlobShadow}"]`,
        `[name="${SCENE_OBJECT_NAMES.riverBlobShadows}"]`,
      ].join(", ");
      const out = [...container.querySelectorAll(selector)].map((el) => el.outerHTML);
      cleanup();
      return out;
    };
    const motion = snapshot(false);
    expect(motion.length).toBeGreaterThanOrEqual(8);
    expect(snapshot(true)).toEqual(motion);
  });

  it("does not create a WebGL canvas before profiling or without WebGL", () => {
    const { rerender } = render(<SceneViewport />);
    expect(screen.queryByTestId("r3f-canvas")).toBeNull();

    act(() => {
      useDeviceStore.getState().setWebglAvailable(false);
      useDeviceStore.getState().setQualityTier("LOW");
    });
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

  it("only WORLD_EXPLORE taps select a target; lamp and krathong fly the camera, water does not (MFW-69)", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    fireEvent.click(waterMesh(container));
    expect(viewport()).toHaveAttribute("data-selected-target", "water");
    expect(container.querySelector("ringGeometry")).toBeNull();
    expect(r3f.flightStarts).toHaveLength(0);
    fireEvent.click(lampMesh(container));
    expect(viewport()).toHaveAttribute("data-selected-target", "lamp");
    fireEvent.click(krathongMesh(container));
    expect(viewport()).toHaveAttribute("data-selected-target", "krathong");
    expect(r3f.flightStarts).toHaveLength(2);
  });

  it("a water tap after a flight keeps the camera target: no flight re-fires (MFW-69)", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    fireEvent.click(lampMesh(container));
    expect(r3f.flightStarts).toHaveLength(1);
    for (let i = 0; i < 5; i++) fireEvent.click(waterMesh(container));
    expect(viewport()).toHaveAttribute("data-selected-target", "water");
    expect(r3f.flightStarts).toHaveLength(1);
    fireEvent.click(lampMesh(container));
    expect(r3f.flightStarts).toHaveLength(2);
  });

  it("reduced motion turns the flight into an instant cut", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    useDeviceStore.getState().setReducedMotion(true);
    const first = render(<SceneViewport mode="WORLD_EXPLORE" />);
    fireEvent.click(lampMesh(first.container));
    expect(r3f.flightStarts.at(-1)?.immediate).toBe(true);
    first.unmount();

    useDeviceStore.getState().setReducedMotion(false);
    const second = render(<SceneViewport mode="WORLD_EXPLORE" />);
    fireEvent.click(lampMesh(second.container));
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

  describe("MFW-80 wish bubble", () => {
    afterEach(() => {
      vi.useRealTimers();
      useDeviceStore.setState({ reducedMotion: false });
    });
    const bubble = () => screen.queryByTestId("wish-bubble");

    it("S1: another person's open wish shows only a bubble, no dialog and no sheet slot", async () => {
      const { container } = render(<SceneViewport mode="WORLD_EXPLORE" riverItems={[item()]} />);
      fireEvent.click(hit(container));
      const el = screen.getByTestId("wish-bubble");
      expect(await screen.findByText(WISH)).toBeInTheDocument(); // inserted shortly after mount (live region)
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.querySelector('[data-overlay-slot="sheet"]')).toBeNull();
      expect(viewport()).toHaveAttribute("data-last-gimmick", "inspect");
      expect(viewport().contains(el)).toBe(false);
      for (const attr of viewport().getAttributeNames().filter((n) => n.startsWith("data-"))) {
        const value = viewport().getAttribute(attr)!;
        expect(value).not.toContain(ITEM_ID);
        expect(value).not.toContain(WISH);
      }
      expect(container.querySelector(`[name="${WISH_BUBBLE_ANCHOR_NAME}"]`)).not.toBeNull();
    });

    it("S2: another person's closed wish shows nothing but still counts the inspect gimmick", () => {
      const { container } = render(<SceneViewport mode="WORLD_EXPLORE" riverItems={[{ ...item(), publicWishText: null }]} />);
      fireEvent.click(hit(container));
      expect(bubble()).toBeNull();
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.queryByRole("button", { name: OWNER_WISH_COPY.reveal })).toBeNull();
      expect(viewport()).toHaveAttribute("data-last-gimmick", "inspect");
    });

    it("S3: your own krathong opens the popup in the sheet slot, no bubble", () => {
      const unregister = registerOwnedCreationPredicate((id) => id === ITEM_ID);
      try {
        const { container } = render(<SceneViewport mode="WORLD_EXPLORE" riverItems={[item()]} />);
        fireEvent.click(hit(container));
        const dialog = screen.getByRole("dialog", { name: INSPECT_POPUP_COPY.dialogTitle });
        expect(dialog.closest('[data-overlay-slot="sheet"]')).not.toBeNull();
        expect(bubble()).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: INSPECT_POPUP_COPY.close }));
        expect(screen.queryByRole("dialog")).toBeNull();
      } finally {
        unregister();
      }
    });

    it("S4: the bubble goes on mode change, when the item leaves and after its lifetime; a new tap shows it again", () => {
      vi.useFakeTimers();
      const items = [item()];
      const { container, rerender } = render(<SceneViewport mode="WORLD_EXPLORE" riverItems={items} />);
      fireEvent.click(hit(container));
      expect(bubble()).not.toBeNull();
      rerender(<SceneViewport mode="RITUAL_RELEASE" riverItems={items} />);
      expect(bubble()).toBeNull();
      rerender(<SceneViewport mode="WORLD_EXPLORE" riverItems={items} />);
      expect(bubble()).toBeNull();
      fireEvent.click(hit(container));
      expect(bubble()).not.toBeNull();
      rerender(<SceneViewport mode="WORLD_EXPLORE" riverItems={[]} />);
      expect(bubble()).toBeNull();
      rerender(<SceneViewport mode="WORLD_EXPLORE" riverItems={items} />);
      fireEvent.click(hit(container));
      expect(bubble()).not.toBeNull();
      act(() => {
        vi.advanceTimersByTime(WISH_BUBBLE_TIMING.visibleMs + WISH_BUBBLE_TIMING.fadeMs);
      });
      expect(bubble()).toBeNull();
      fireEvent.click(hit(container));
      expect(bubble()).not.toBeNull();
    });

    it("S5: two taps give one bubble and restart its lifetime", () => {
      vi.useFakeTimers();
      const { container } = render(<SceneViewport mode="WORLD_EXPLORE" riverItems={[item()]} />);
      fireEvent.click(hit(container));
      act(() => {
        vi.advanceTimersByTime(WISH_BUBBLE_TIMING.visibleMs - 1);
      });
      fireEvent.click(hit(container));
      expect(screen.getAllByTestId("wish-bubble")).toHaveLength(1);
      act(() => {
        vi.advanceTimersByTime(WISH_BUBBLE_TIMING.visibleMs - 1);
      });
      expect(bubble()).toHaveAttribute("data-wish-bubble-phase", "shown");
    });

    it("S6: reduced motion gives a bubble with data-motion=reduced", () => {
      useDeviceStore.setState({ reducedMotion: true });
      const { container } = render(<SceneViewport mode="WORLD_EXPLORE" riverItems={[item()]} />);
      fireEvent.click(hit(container));
      expect(bubble()).toHaveAttribute("data-motion", "reduced");
    });

    it.each(["HIGH", "LOW"] as const)("S7: the %s tier shows the same bubble", async (tier) => {
      useDeviceStore.getState().setQualityTier(tier);
      const { container } = render(<SceneViewport mode="WORLD_EXPLORE" riverItems={[item()]} />);
      fireEvent.click(hit(container));
      expect(await screen.findByText(WISH)).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});

describe("scene reactions (MFW-60)", () => {
  const pools = () => poolManagers.at(-1)!;
  const ground = (c: HTMLElement) => c.querySelector(`[name="${SCENE_OBJECT_NAMES.ground}"]`)!;
  const seam = globalThis as unknown as Record<string, unknown>;
  beforeEach(() => {
    useDeviceStore.getState().setQualityTier("HIGH");
    poolManagers.length = 0;
    seam[SKY_LAUNCH_SEED_GLOBAL_NAME] = SKY_LAUNCH_SEED; // MFW-75: the first sky launch of a mount is a firework
  });
  afterEach(() => {
    delete seam[SKY_LAUNCH_SEED_GLOBAL_NAME];
  });

  it("IX1: in WORLD_EXPLORE a ground tap launches a firework, counts once and changes no selection or camera", () => {
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    const flights = r3f.flightStarts.length;
    const selected = viewport().getAttribute("data-selected-target");
    fireEvent.click(ground(container));
    expect(viewport()).toHaveAttribute("data-last-gimmick", "firework");
    expect(viewport()).toHaveAttribute("data-gimmick-count", "1");
    expect(viewport().getAttribute("data-selected-target")).toBe(selected);
    expect(r3f.flightStarts.length).toBe(flights);
    expect(pools().activeCount("firework")).toBe(1);
  });

  it("IX2: a prop proxy tap lights the house; a tree tap shakes it; the pier and a villager react too", () => {
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    fireEvent.click(container.querySelector(`[name="${SCENE_OBJECT_NAMES.propTapPrefix}house-0"]`)!);
    expect(viewport()).toHaveAttribute("data-last-gimmick", "house-lights");
    expect(pools().activeCount("windowGlow")).toBe(1);
    fireEvent.click(container.querySelector(`[name="${SCENE_OBJECT_NAMES.propTapPrefix}tree-1"]`)!);
    expect(viewport()).toHaveAttribute("data-last-gimmick", "tree-shake");
    fireEvent.click(container.querySelector(`[name="${SCENE_OBJECT_NAMES.pierDeck}"]`)!);
    expect(viewport()).toHaveAttribute("data-last-gimmick", "pier-bounce");
    fireEvent.click(container.querySelector(`[name^="${SCENE_OBJECT_NAMES.propTapPrefix}villager-"]`)!);
    expect(viewport()).toHaveAttribute("data-last-gimmick", "villager-hop");
    expect(viewport()).toHaveAttribute("data-gimmick-count", "4");
    expect(pools().activeCount("nudge")).toBe(3);
    expect(viewport()).not.toHaveAttribute("data-selected-target");
  });

  it.each(["CUSTOMIZE", "RITUAL_RELEASE"] as const)("IX3 %s: no prop proxies and a ground tap records nothing", (mode) => {
    const { container } = render(<SceneViewport mode={mode} />);
    expect(container.querySelectorAll(`[name^="${SCENE_OBJECT_NAMES.propTapPrefix}"]`)).toHaveLength(0);
    fireEvent.click(ground(container));
    fireEvent.click(container.querySelector(`[name="${SCENE_OBJECT_NAMES.pierDeck}"]`)!);
    expect(viewport()).not.toHaveAttribute("data-last-gimmick");
  });

  it("IX4: a lamp tap records lamp-glow, still selects and flies, and releases no sky lantern (MFW-75)", () => {
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    const flights = r3f.flightStarts.length;
    fireEvent.click(lampMesh(container));
    expect(viewport()).toHaveAttribute("data-last-gimmick", "lamp-glow");
    expect(viewport()).toHaveAttribute("data-selected-target", "lamp");
    expect(r3f.flightStarts.length).toBe(flights + 1);
    expect(pools().activeCount("glow")).toBe(1);
    expect(pools().activeCount("skyLantern")).toBe(0);
  });

  it("IX5: a water tap still records a ripple through the registry", () => {
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    fireEvent.click(waterMesh(container));
    expect(viewport()).toHaveAttribute("data-last-gimmick", "ripple");
    expect(pools().activeCount("ripple")).toBe(1);
  });

  it("LOW tier: the cheap variant uses the LOW caps and sparks", () => {
    useDeviceStore.getState().setQualityTier("LOW");
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    fireEvent.click(ground(container));
    expect(viewport()).toHaveAttribute("data-last-gimmick", "firework");
    expect(pools().firework.capacity).toBe(EFFECT_POOL_CAPS.LOW.firework);
  });

  it("IX6 (MFW-72): a house tap also puffs smoke, a tree tap drops leaves; reduced motion: neither, gimmicks still recorded; LOW caps", () => {
    const proxy = (c: HTMLElement, name: string) => c.querySelector(`[name="${SCENE_OBJECT_NAMES.propTapPrefix}${name}"]`)!;
    const first = render(<SceneViewport mode="WORLD_EXPLORE" />);
    fireEvent.click(proxy(first.container, "house-0"));
    expect(viewport()).toHaveAttribute("data-last-gimmick", "house-lights");
    expect(pools().activeCount("chimneySmoke")).toBe(1);
    fireEvent.click(proxy(first.container, "tree-1"));
    expect(viewport()).toHaveAttribute("data-last-gimmick", "tree-shake");
    expect(pools().activeCount("fallingLeaves")).toBe(1);
    first.unmount();
    useDeviceStore.getState().setReducedMotion(true);
    try {
      const reduced = render(<SceneViewport mode="WORLD_EXPLORE" />);
      fireEvent.click(proxy(reduced.container, "house-0"));
      expect(viewport()).toHaveAttribute("data-last-gimmick", "house-lights");
      expect(pools().activeCount("windowGlow")).toBe(1);
      expect(pools().activeCount("chimneySmoke")).toBe(0);
      fireEvent.click(proxy(reduced.container, "tree-1"));
      expect(viewport()).toHaveAttribute("data-last-gimmick", "tree-shake");
      expect(pools().activeCount("nudge")).toBe(1);
      expect(pools().activeCount("fallingLeaves")).toBe(0);
      reduced.unmount();
    } finally {
      useDeviceStore.getState().setReducedMotion(false);
    }
    useDeviceStore.getState().setQualityTier("LOW");
    render(<SceneViewport mode="WORLD_EXPLORE" />);
    expect(pools().chimneySmoke.capacity).toBe(EFFECT_POOL_CAPS.LOW.chimneySmoke);
    expect(pools().fallingLeaves.capacity).toBe(EFFECT_POOL_CAPS.LOW.fallingLeaves);
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
    expect(screen.queryByRole("dialog")).toBeNull(); // MFW-80: another person's closed wish shows nothing
    expect(screen.queryByTestId("wish-bubble")).toBeNull();
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
    const pose = getCameraRigPose(world, 0);
    for (const [k, v] of Object.entries(pose)) near((flight.to as Record<string, number>)[k], v);
  });

  it("Find My after a pan flies to the krathong (MFW-57)", () => {
    const items = [storeItem(2, 1), storeItem(2, 2)];
    setWorld(2, items);
    render(<SceneViewport mode="WORLD_EXPLORE" />);
    const v = viewport();
    fireEvent.pointerDown(v, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(v, { pointerId: 1, clientX: 140, clientY: 120 });
    fireEvent.pointerUp(v, { pointerId: 1, clientX: 140, clientY: 120 });
    const before = r3f.flightStarts.length;
    focus(items[1].id, 1);
    expect(r3f.flightStarts).toHaveLength(before + 1);
    const pose = getCameraRigPose(expectedWorld(items[1]), 0);
    for (const [k, val] of Object.entries(pose)) near((r3f.flightStarts[before].to as Record<string, number>)[k], val);
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

  it("Find My marks the focused krathong without a ring", () => {
    const items = [storeItem(2, 1), storeItem(2, 2)];
    setWorld(2, items);
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    expect(riverRenders.last!.markedId).toBeNull();
    focus(items[1].id, 1);
    expect(viewport()).toHaveAttribute("data-selected-target", "riverKrathong");
    expect(riverRenders.last!.markedId).toBe(items[1].id);
    expect(ownRenders.last!.marked).toBe(false);
    expect(container.querySelector("ringgeometry")).toBeNull();
    fireEvent.click(waterMesh(container));
    expect(viewport()).toHaveAttribute("data-selected-target", "water");
    expect(riverRenders.last!.markedId).toBeNull();
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
    const current = stretchSlots(container)[0]; // MFW-58: the camera's stretch (one persistent batch per slot, 3 slots)
    const groups = current.querySelectorAll('[name^="river-item-"]');
    expect(groups).toHaveLength(3);
    for (const g of groups) expect(g.querySelector('mesh:not([name^="river-hit-"])')).toBeNull(); // only MFW-28 hit proxies remain
    expect(container.querySelectorAll('[name="river-krathong-batch"]')).toHaveLength(stretchSlots(container).length);
    const batch = current.querySelectorAll('[name="river-krathong-batch"]');
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
    act(() => {
      useDeviceStore.getState().setWebglAvailable(false);
      useDeviceStore.getState().setQualityTier("LOW");
    });
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
    expect(el.closest('[data-overlay-slot="hint"]')).not.toBeNull(); // MFW-54: floats above the bottom sheet
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

describe("full-screen stage framing (MFW-54, backlog 10.2)", () => {
  /** jsdom has no ResizeObserver: a stub that records the callback, the observed elements and disconnects. */
  class FakeResizeObserver {
    static last: FakeResizeObserver | null = null;
    readonly observed: Element[] = [];
    readonly disconnect = vi.fn();
    constructor(readonly callback: ResizeObserverCallback) {
      FakeResizeObserver.last = this;
    }
    observe(el: Element) {
      this.observed.push(el);
    }
    unobserve() {}
  }
  const resize = (width: number, height: number) => {
    const ro = FakeResizeObserver.last!;
    act(() =>
      ro.callback([{ contentRect: { width, height } } as ResizeObserverEntry], ro as unknown as ResizeObserver),
    );
  };
  const pinchTo15 = () => {
    const v = viewport();
    fireEvent.pointerDown(v, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerDown(v, { pointerId: 2, clientX: 30, clientY: 10 });
    fireEvent.pointerMove(v, { pointerId: 2, clientX: 40, clientY: 10 });
    fireEvent.pointerUp(v, { pointerId: 2, clientX: 40, clientY: 10 });
    fireEvent.pointerUp(v, { pointerId: 1, clientX: 10, clientY: 10 });
  };

  beforeEach(() => {
    FakeResizeObserver.last = null;
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("framed zoom follows the viewport and keeps the pinch factor", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    render(<SceneViewport mode="CUSTOMIZE" />);
    expect(FakeResizeObserver.last!.observed).toEqual([viewport()]);
    const camera = r3f.camera;

    resize(390, 844);
    const portrait = getFramedCameraZoom({ width: 390, height: 844 });
    expect(r3f.camera!.zoom).toBeCloseTo(portrait, 9);
    expect(viewport().dataset.cameraZoom).toBe(String(portrait));

    pinchTo15();
    expect(r3f.camera!.zoom).toBeCloseTo(portrait * 1.5, 9);

    const rendersBeforeRotation = riverRenders.count;
    resize(844, 390);
    expect(r3f.camera!.zoom).toBeCloseTo(getFramedCameraZoom({ width: 844, height: 390 }) * 1.5, 9);
    expect(viewport().dataset.cameraZoom).toBe(String(getFramedCameraZoom({ width: 844, height: 390 })));
    expect(r3f.camera).toBe(camera);
    expect(riverRenders.count).toBe(rendersBeforeRotation);
  });

  it("the first resize re-renders nothing", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    render(<SceneViewport mode="CUSTOMIZE" />);
    const renders = riverRenders.count;
    expect(renders).toBeGreaterThan(0); // RiverFlow is mounted, so a re-render would be counted
    resize(390, 844);
    resize(1440, 900);
    expect(riverRenders.count).toBe(renders);
  });

  it("a resize keeps the selection and starts no flight", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    useDeviceStore.setState({ reducedMotion: true });
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    fireEvent.click(waterMesh(container));
    expect(viewport()).toHaveAttribute("data-selected-target", "water");
    const flights = r3f.flightStarts.length;
    const flow = useUIStore.getState().flowState;

    resize(844, 390);
    expect(viewport()).toHaveAttribute("data-selected-target", "water");
    expect(r3f.flightStarts).toHaveLength(flights);
    expect(useUIStore.getState().flowState).toBe(flow);
    expect(r3f.camera!.zoom).toBeCloseTo(getFramedCameraZoom({ width: 844, height: 390 }), 9);
  });

  it("unmount disconnects the observer", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const { unmount } = render(<SceneViewport mode="CUSTOMIZE" />);
    const ro = FakeResizeObserver.last!;
    expect(ro.disconnect).not.toHaveBeenCalled();
    unmount();
    expect(ro.disconnect).toHaveBeenCalledTimes(1);
  });

  it("the section fills its stage parent", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    render(<SceneViewport mode="CUSTOMIZE" />);
    const classes = viewport().className.split(" ");
    expect(classes).toContain("h-full");
    expect(classes).toContain("w-full");
    for (const old of ["h-64", "mb-8", "rounded-3xl", "border"]) expect(classes).not.toContain(old);
  });

  it("the inspect popup sits in the sheet slot", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const unregister = registerOwnedCreationPredicate((id) => id === "950118ce-7d93-4cb6-bd84-44d91c5de9e3");
    const ITEM_ID = "950118ce-7d93-4cb6-bd84-44d91c5de9e3";
    const items = [
      {
        id: ITEM_ID,
        coord: { mode: "SPLINE_PATH" as const, laneId: 1, spawnProgress: 0.2, speedFactor: RIVER_DRIFT_SPEED_FACTOR, lateralOffset: 0 },
        createdAtMs: 1_700_000_000_000,
        appearance: DEFAULT_KRATHONG_APPEARANCE,
        publicWishText: "ขอให้ครอบครัวมีความสุข",
      },
    ];
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" riverItems={items} />);
    fireEvent.click(container.querySelector(`[name="river-hit-${ITEM_ID}"]`)!);
    expect(screen.getByRole("dialog").closest('[data-overlay-slot="sheet"]')).not.toBeNull();
    unregister();
  });

  it("LOW and HIGH render a big screen within their pixel budget", () => {
    vi.stubGlobal("screen", { width: 1440, height: 900 });
    useDeviceStore.getState().setQualityTier("LOW");
    const { unmount } = render(<SceneViewport mode="CUSTOMIZE" />);
    const ratio = Math.sqrt(TIER_MAX_RENDER_PIXELS.LOW! / (1440 * 900));
    expect(screen.getByTestId("r3f-canvas")).toHaveAttribute("data-dpr", `${ratio},${ratio}`);
    unmount();
    useDeviceStore.setState(useDeviceStore.getInitialState(), true);
    useDeviceStore.getState().setQualityTier("HIGH");
    render(<SceneViewport mode="CUSTOMIZE" />);
    const highRatio = Math.sqrt(TIER_MAX_RENDER_PIXELS.HIGH! / (1440 * 900));
    expect(screen.getByTestId("r3f-canvas")).toHaveAttribute("data-dpr", `1,${highRatio}`);
  });

  it("the perf probe sits in the debug slot", () => {
    window.history.replaceState(null, "", "/?perfProbe=1");
    useDeviceStore.getState().setQualityTier("HIGH");
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    const panel = container.querySelector('[data-testid="perf-probe"]')!;
    expect(panel.closest('[data-overlay-slot="debug"]')).not.toBeNull();
  });
});

describe("krathong model v2 (MFW-48)", () => {
  const otherItem = (id: string) => ({
    id,
    coord: { mode: "SPLINE_PATH" as const, laneId: 1, spawnProgress: 0.2, speedFactor: RIVER_DRIFT_SPEED_FACTOR, lateralOffset: 0 },
    createdAtMs: 1_700_000_000_000,
    appearance: DEFAULT_KRATHONG_APPEARANCE,
  });
  const expectOneV2Model = (c: HTMLElement) => {
    expect(c.querySelectorAll('[name="krathong-model"]')).toHaveLength(1);
    expect(c.querySelectorAll('[name="krathong-model"] mesh[name^="flowerCentre_"]')).toHaveLength(RIM_SOCKET_COUNT);
    expect(c.querySelectorAll('mesh[name="flame"]')).toHaveLength(1);
  };

  it("AC3: one v2 krathong model in CUSTOMIZE, on the pier and on the river", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const customize = render(<SceneViewport mode="CUSTOMIZE" />);
    expectOneV2Model(customize.container);
    cleanup();

    const pier = render(<SceneViewport mode="RITUAL_RELEASE" />);
    expect(viewport()).toHaveAttribute("data-own-krathong-pose", "PIER");
    expectOneV2Model(pier.container);
    cleanup();

    setRitual({ phase: "RELEASED", attempt: 1, saved: savedRelease() });
    const own = { ...otherItem("own-creation"), coord: buildReleaseCoord(LOY_KRATHONG_PIER_RELEASE_SPOT) };
    const river = render(<SceneViewport mode="WORLD_EXPLORE" riverItems={[own, otherItem("a"), otherItem("b")]} />);
    expect(viewport()).toHaveAttribute("data-own-krathong-pose", "RIVER");
    expectOneV2Model(river.container);
    const batch = stretchSlots(river.container)[0].querySelectorAll('[name="river-krathong-batch"]'); // MFW-58: one per stretch slot
    expect(batch).toHaveLength(1);
    expect(batch[0].querySelectorAll("primitive")).toHaveLength(KRATHONG_INSTANCE_BUCKET_COUNT);
  });

  it("flame flicker follows reduced motion", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const spy = vi.spyOn(window, "setInterval");
    render(<SceneViewport mode="CUSTOMIZE" />);
    expect(spy.mock.calls.some((call) => call[1] === FLAME_FLICKER_REDRAW_INTERVAL_MS.HIGH)).toBe(true);
    cleanup();
    spy.mockClear();
    useDeviceStore.getState().setReducedMotion(true);
    render(<SceneViewport mode="CUSTOMIZE" />);
    expect(spy.mock.calls.some((call) => call[1] === FLAME_FLICKER_REDRAW_INTERVAL_MS.HIGH)).toBe(false);
    spy.mockRestore();
  });

  it("IX1 the living world (MFW-50) renders inside the world-view group on HIGH", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    const worldView = container.querySelector(`[name="${SCENE_OBJECT_NAMES.worldView}"]`)!;
    // MFW-58: villagers are per stretch (open question 9 of the spec): one set per slot, 3 slots.
    const slots = stretchSlots(container);
    expect(slots).toHaveLength(3);
    for (const slot of slots) {
      expect(worldView.contains(slot)).toBe(true);
      expect(slot.querySelectorAll(`[name="${SCENE_OBJECT_NAMES.villagers}"]`)).toHaveLength(1);
      expect(slot.querySelectorAll(`[name="${SCENE_OBJECT_NAMES.villagerBlobShadows}"]`)).toHaveLength(1);
    }
    expect(worldView.querySelectorAll("primitive").length).toBeGreaterThan(0);
  });

  it("IX2 the living-world idle redraw runs in the shared world view and follows reduced motion (MFW-50 AC4)", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const spy = vi.spyOn(window, "setInterval");
    render(<SceneViewport mode="WORLD_EXPLORE" />);
    expect(spy.mock.calls.some((call) => call[1] === LIVING_WORLD_TIERS.HIGH.idleRedrawIntervalMs)).toBe(true);
    cleanup();
    spy.mockClear();
    useDeviceStore.getState().setReducedMotion(true);
    render(<SceneViewport mode="WORLD_EXPLORE" />);
    expect(spy.mock.calls.some((call) => call[1] === LIVING_WORLD_TIERS.HIGH.idleRedrawIntervalMs)).toBe(false);
    spy.mockRestore();
  });

  it.each(["CUSTOMIZE", "RITUAL_RELEASE"] as const)(
    "IX3 %s: no living-world idle redraw; only the shared ticker at the flame cadence (MFW-50 fix round)",
    (mode) => {
      useDeviceStore.getState().setQualityTier("HIGH");
      const spy = vi.spyOn(window, "setInterval");
      render(<SceneViewport mode={mode} />);
      const intervals = spy.mock.calls.map((call) => call[1]);
      expect(intervals).not.toContain(LIVING_WORLD_TIERS.HIGH.idleRedrawIntervalMs);
      expect(intervals.filter((ms) => ms === FLAME_FLICKER_REDRAW_INTERVAL_MS.HIGH)).toHaveLength(1);
      spy.mockRestore();
    },
  );
});

describe("camera drag-to-travel (MFW-57)", () => {
  // MFW-58: the scene's own bounds — the endless-river corridor (unbounded along, the channel corridor across).
  const BOUNDS = WORLD_PAN_BOUNDS;
  const ZOOM = SCENE_CAMERA_ZOOM; // jsdom has no ResizeObserver: the base zoom stays SCENE_CAMERA_ZOOM
  type Move = readonly [number, number];
  /** One-pointer drag through the separator's eyes: the first PAN_RIVER carries the whole displacement since down. */
  const expectedAfterDrag = (from: Move, moves: readonly Move[], rig: CameraRigState = createCameraRigState()) => {
    let prev = from;
    let started = false;
    let t = 0;
    for (const m of moves) {
      if (!started) {
        if (Math.hypot(m[0] - from[0], m[1] - from[1]) < DRAG_START_DISTANCE_PX) continue;
        started = true;
        applyPanDrag(rig, m[0] - from[0], m[1] - from[1], ZOOM, (t += 1), BOUNDS);
      } else {
        applyPanDrag(rig, m[0] - prev[0], m[1] - prev[1], ZOOM, (t += 1), BOUNDS);
      }
      prev = m;
    }
    return rig;
  };
  const cameraFor = (rig: CameraRigState) => {
    const camera = new OrthographicCamera();
    applyCameraRigPose(rig, camera);
    return camera;
  };
  const expectCameraAt = (rig: CameraRigState) => {
    const want = cameraFor(rig).position;
    const got = r3f.camera!.position;
    expect(got.x).toBeCloseTo(want.x, 9);
    expect(got.y).toBeCloseTo(want.y, 9);
    expect(got.z).toBeCloseTo(want.z, 9);
  };
  const drag = (from: Move, moves: readonly Move[], pointerId = 1) => {
    const v = viewport();
    fireEvent.pointerDown(v, { pointerId, clientX: from[0], clientY: from[1] });
    for (const m of moves) fireEvent.pointerMove(v, { pointerId, clientX: m[0], clientY: m[1] });
    const last = moves.at(-1) ?? from;
    fireEvent.pointerUp(v, { pointerId, clientX: last[0], clientY: last[1] });
  };
  /** Second pointer at `angle` around (100, 100), 100 px away (y-down screen). */
  const around = (angle: number) => ({ clientX: 100 + 100 * Math.cos(angle), clientY: 100 + 100 * Math.sin(angle) });
  const twist = (rad: number) => {
    const v = viewport();
    fireEvent.pointerDown(v, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerDown(v, { pointerId: 2, ...around(0) });
    fireEvent.pointerMove(v, { pointerId: 2, ...around(TWIST_START_RADIANS + 0.01) });
    fireEvent.pointerMove(v, { pointerId: 2, ...around(TWIST_START_RADIANS + 0.01 + rad) });
    fireEvent.pointerUp(v, { pointerId: 2, ...around(TWIST_START_RADIANS + 0.01 + rad) });
    fireEvent.pointerUp(v, { pointerId: 1, clientX: 100, clientY: 100 });
  };
  const focusOfCamera = () => {
    const o = getRotatedCameraOffsetInto(0, { x: 0, y: 0, z: 0 });
    const p = r3f.camera!.position;
    return { x: p.x - o.x, z: p.z - o.z };
  };
  const rotateButton = () => screen.queryByRole("button", { name: WORLD_VIEW_ROTATE_BUTTON_COPY.ariaLabel });

  beforeEach(() => useDeviceStore.getState().setQualityTier("HIGH"));

  it("WORLD_EXPLORE drag moves the camera, not the world group", () => {
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    const moves: Move[] = [
      [110, 100],
      [130, 120],
    ];
    drag([100, 100], moves);
    const rig = expectedAfterDrag([100, 100], moves);
    expect(rig.focusX).not.toBe(0);
    expectCameraAt(rig);
    const world = container.querySelector('[name="scene-world-view"]')!;
    expect(world.hasAttribute("position")).toBe(false);
    expect(world.hasAttribute("rotation")).toBe(false);
  });

  it("a WORLD_EXPLORE drag interacts with nothing", () => {
    render(<SceneViewport mode="WORLD_EXPLORE" />);
    const count = viewport().getAttribute("data-gimmick-count");
    const selected = viewport().getAttribute("data-selected-target");
    const flights = r3f.flightStarts.length;
    drag([100, 100], [
      [120, 100],
      [150, 130],
    ]);
    expect(viewport().getAttribute("data-gimmick-count")).toBe(count);
    expect(viewport().getAttribute("data-selected-target")).toBe(selected);
    expect(viewport()).not.toHaveAttribute("data-last-interaction");
    expect(r3f.flightStarts).toHaveLength(flights);
  });

  it("a WORLD_EXPLORE drag of many moves does not re-render RiverFlow", () => {
    render(<SceneViewport mode="WORLD_EXPLORE" />);
    const v = viewport();
    fireEvent.pointerDown(v, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(v, { pointerId: 1, clientX: 100, clientY: 120 });
    const afterStart = riverRenders.count;
    expect(afterStart).toBeGreaterThan(0);
    for (let i = 1; i <= 20; i++) fireEvent.pointerMove(v, { pointerId: 1, clientX: 100 + i, clientY: 120 + i });
    expect(riverRenders.count).toBe(afterStart);
    fireEvent.pointerUp(v, { pointerId: 1, clientX: 120, clientY: 140 });
    expect(riverRenders.count).toBe(afterStart);
  });

  it("WORLD_EXPLORE pinch zooms", () => {
    render(<SceneViewport mode="WORLD_EXPLORE" />);
    const v = viewport();
    fireEvent.pointerDown(v, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerDown(v, { pointerId: 2, clientX: 30, clientY: 10 });
    fireEvent.pointerMove(v, { pointerId: 2, clientX: 40, clientY: 10 });
    fireEvent.pointerUp(v, { pointerId: 2, clientX: 40, clientY: 10 });
    fireEvent.pointerUp(v, { pointerId: 1, clientX: 10, clientY: 10 });
    expect(r3f.camera!.zoom).toBeCloseTo(SCENE_CAMERA_ZOOM * 1.5, 9);
    expectCameraAt(createCameraRigState()); // no pan
  });

  it("twist turns the camera", () => {
    render(<SceneViewport mode="WORLD_EXPLORE" />);
    twist(0.25);
    const rig = createCameraRigState();
    twistCameraRig(rig, 0.25);
    expectCameraAt(rig);
  });

  it("a flight after a twist keeps the user's yaw", () => {
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    twist(0.25);
    fireEvent.click(lampMesh(container));
    expect(r3f.flightStarts.at(-1)!.to).toMatchObject({ yawRad: expect.closeTo(0.25, 9) });
  });

  it("water tap after a pan ripples without moving the camera and draws no ring", () => {
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    drag([100, 100], [[160, 140]]);
    const flights = r3f.flightStarts.length;
    const panned = r3f.camera!.position.clone();
    tapStub.value = { x: 0.5, z: 0 };
    fireEvent.click(waterMesh(container));
    expect(viewport()).toHaveAttribute("data-last-gimmick", "ripple");
    expect(viewport()).toHaveAttribute("data-selected-target", "water");
    expect(r3f.flightStarts).toHaveLength(flights);
    expect(r3f.camera!.position.distanceTo(panned)).toBeLessThan(1e-9);
    expect(container.querySelector("ringGeometry")).toBeNull();
  });

  it("S5 the scene renders no rotate button (it lives in the HUD column, MFW-74)", () => {
    for (const mode of ["CUSTOMIZE", "RITUAL_RELEASE", "WORLD_EXPLORE"] as const) {
      render(<SceneViewport mode={mode} />);
      expect(rotateButton()).toBeNull();
      cleanup();
    }
  });

  it("S4 mounted at a request id does not rotate; a new request turns the view once (instant under reduced motion)", () => {
    useUIStore.setState({ viewRotateRequestId: 3 });
    r3f.flightStarts.length = 0;
    render(<SceneViewport mode="WORLD_EXPLORE" />);
    expect(r3f.flightStarts).toHaveLength(0);
    act(() => useUIStore.getState().requestViewRotate());
    expect(r3f.flightStarts).toHaveLength(1);
    expect(r3f.flightStarts[0].immediate).toBe(false);
    expect(r3f.flightStarts[0].to).toMatchObject({ yawRad: expect.closeTo(WORLD_VIEW_ROTATE_STEP_RADIANS, 9) });
    cleanup();

    useDeviceStore.getState().setReducedMotion(true);
    render(<SceneViewport mode="WORLD_EXPLORE" />);
    act(() => useUIStore.getState().requestViewRotate());
    expect(r3f.flightStarts.at(-1)!.immediate).toBe(true);
    cleanup();

    const before = r3f.flightStarts.length;
    render(<SceneViewport mode="CUSTOMIZE" />);
    act(() => useUIStore.getState().requestViewRotate());
    expect(r3f.flightStarts).toHaveLength(before); // only the world view rotates
  });

  it("wheel zooms only in WORLD_EXPLORE", () => {
    render(<SceneViewport mode="WORLD_EXPLORE" />);
    expect(fireEvent.wheel(viewport(), { deltaY: -100 })).toBe(false); // default prevented
    const h = viewport().clientHeight;
    expect(r3f.camera!.zoom).toBeCloseTo(SCENE_CAMERA_ZOOM * getPinchZoomFactor(1, getWheelZoomScale(-100, 0, h)), 9);
    expect(r3f.camera!.zoom).toBeGreaterThan(SCENE_CAMERA_ZOOM);
    cleanup();

    render(<SceneViewport mode="CUSTOMIZE" />);
    expect(fireEvent.wheel(viewport(), { deltaY: -100 })).toBe(true);
    expect(r3f.camera!.zoom).toBe(SCENE_CAMERA_ZOOM);
  });

  it("CUSTOMIZE and RITUAL_RELEASE never move the camera rig", () => {
    const custom = render(<SceneViewport mode="CUSTOMIZE" />);
    const start = r3f.camera!.position.clone();
    drag([10, 10], [[40, 30]]);
    expect(yaw(custom.container)).toBeCloseTo(30 * ROTATION_RADIANS_PER_PIXEL, 9);
    expect(r3f.camera!.position.toArray()).toEqual(start.toArray());
    cleanup();

    r3f.flightStarts.length = 0;
    render(<SceneViewport mode="RITUAL_RELEASE" onReleaseDrop={vi.fn()} />);
    expect(r3f.flightStarts[0].to).toMatchObject({ yawRad: 0 });
    const ritualStartPos = r3f.camera!.position.clone();
    vi.spyOn(viewport(), "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 320, height: 256 }));
    const chip = screen.getByRole("img", { name: "กระทง ลากลงน้ำ" });
    fireEvent.pointerDown(chip, { pointerId: 1, clientX: 160, clientY: 140 });
    fireEvent.pointerMove(chip, { pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerUp(viewport(), { pointerId: 1, clientX: 200, clientY: 100 });
    expect(r3f.camera!.position.toArray()).toEqual(ritualStartPos.toArray());
    // a drag on the water (not the chip) does not pan either
    fireEvent.pointerDown(viewport(), { pointerId: 2, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(viewport(), { pointerId: 2, clientX: 120, clientY: 90 });
    fireEvent.pointerUp(viewport(), { pointerId: 2, clientX: 120, clientY: 90 });
    expect(r3f.camera!.position.toArray()).toEqual(ritualStartPos.toArray());
  });

  it("reduced motion: release snaps into bounds at once", () => {
    const outward = Array.from({ length: 50 }, (_, i): Move => [100, 100 + (i + 1) * 100]);
    useDeviceStore.getState().setReducedMotion(true);
    render(<SceneViewport mode="WORLD_EXPLORE" />);
    drag([100, 100], outward);
    const reduced = focusOfCamera();
    // The focus is read back as camera position − offset, so allow float round-off at the snapped edge (MFW-49: with the wider
    // channel the bound is −2.9, read back as −2.9000000000000004).
    const EPS = 1e-9;
    const loose = { ...BOUNDS, minX: BOUNDS.minX - EPS, maxX: BOUNDS.maxX + EPS, minZ: BOUNDS.minZ - EPS, maxZ: BOUNDS.maxZ + EPS };
    expect(isInsidePanBounds(reduced.x, reduced.z, loose)).toBe(true);
    cleanup();

    useDeviceStore.getState().setReducedMotion(false);
    render(<SceneViewport mode="WORLD_EXPLORE" />);
    drag([100, 100], outward);
    const eased = focusOfCamera(); // still beyond: it eases back in frames (useFrame is a no-op in this stub)
    expect(isInsidePanBounds(eased.x, eased.z, BOUNDS)).toBe(false);
  });

  it("tier change keeps the panned camera", () => {
    render(<SceneViewport mode="WORLD_EXPLORE" />);
    const moves: Move[] = [
      [130, 100],
      [150, 140],
    ];
    drag([100, 100], moves);
    const before = r3f.camera;
    act(() => useDeviceStore.getState().setQualityTier("LOW"));
    expect(r3f.camera).not.toBe(before);
    expectCameraAt(expectedAfterDrag([100, 100], moves));
  });
});

describe("natural look, no rings (MFW-67)", () => {
  const chip = () => screen.getByRole("img", { name: "กระทง ลากลงน้ำ" });
  const candle = (c: HTMLElement) => c.querySelector('[name="scene-krathong"] pointLight')!;

  it("no ring and no basic material on any selection (MFW-67)", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    for (const [hit, target] of [
      [waterMesh, "water"],
      [lampMesh, "lamp"],
      [krathongMesh, "krathong"],
    ] as const) {
      fireEvent.click(hit(container));
      expect(viewport()).toHaveAttribute("data-selected-target", target);
      expect(container.querySelector("ringGeometry")).toBeNull();
      expect(container.querySelector("meshBasicMaterial")).toBeNull();
    }
  });

  it("tapping the own krathong marks it", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    expect(ownRenders.last!.marked).toBe(false);
    fireEvent.click(krathongMesh(container));
    expect(ownRenders.last!.marked).toBe(true);
    expect(riverRenders.last!.markedId).toBeNull();
    expect(container.querySelector(`[name="${SCENE_OBJECT_NAMES.krathongMarkCue}"]`)).not.toBeNull();
    fireEvent.click(waterMesh(container));
    expect(ownRenders.last!.marked).toBe(false);
  });

  it("candle light scales with the pose (MFW-67)", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const { container } = render(<SceneViewport mode="CUSTOMIZE" />);
    expect(candle(container)).toHaveAttribute("distance", String(TOY_SCENE_LIGHTING.candle.distance));
    expect(candle(container)).toHaveAttribute("decay", "2");
    cleanup();
    const pier = render(<SceneViewport mode="RITUAL_RELEASE" />);
    expect(viewport()).toHaveAttribute("data-own-krathong-pose", "PIER");
    expect(candle(pier.container)).toHaveAttribute(
      "distance",
      String(TOY_SCENE_LIGHTING.candle.distance * RIVER_KRATHONG_SCALE),
    );
  });

  it("the drag chip draws no ring", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    render(<SceneViewport mode="RITUAL_RELEASE" />);
    expect(chip().className).not.toMatch(/\b(border|shadow|ring|outline)(-|\b)/);
  });
});

describe("endless river (MFW-58)", () => {
  const frame = getLoyKrathongEndlessRiverFrame();
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
  const zones = { 1: [storeItem(1, 1)], 2: [storeItem(2, 1), storeItem(2, 2)], 3: [storeItem(3, 1), storeItem(3, 2), storeItem(3, 3)] };
  /** World of 3 zones, anchor {anchorStretch, anchorZone}, camera in stretch s; every zone streamed. */
  const setWorld = (s: number, anchorStretch = 0, anchorZone = 3, zoneCount = 3) => {
    const anchor = { stretchIndex: anchorStretch, zoneId: anchorZone };
    const zoneId = zoneIdForStretch(s, anchor, zoneCount)!;
    const streamed: Record<number, readonly PublicCreation[]> = zoneCount === 1 ? { 1: zones[1] } : zones;
    act(() =>
      useWorldStore.setState({
        eventId: "loy_krathong",
        zoneCount,
        zoneStatus: "ready",
        currentStretchIndex: s,
        stretchAnchor: anchor,
        currentZoneId: zoneId,
        zoneItems: streamed[zoneId] ?? [],
        streamedZoneItems: streamed,
      }),
    );
  };
  const names = (c: HTMLElement) => stretchSlots(c).map((g) => g.getAttribute("name"));
  /** Sums the `position` attributes of the element and its ancestors (the DOM stub of a three world position). */
  const sumPositions = (start: Element): [number, number, number] => {
    const sum: [number, number, number] = [0, 0, 0];
    for (let el: Element | null = start; el !== null; el = el.parentElement) {
      const p = el.getAttribute("position");
      if (p === null) continue;
      p.split(",").map(Number).forEach((v, k) => (sum[k] += v));
    }
    return sum;
  };
  const useHierarchyPositions = () =>
    Object.defineProperty(HTMLUnknownElement.prototype, "getWorldPosition", {
      configurable: true,
      value(this: Element, target: Vector3) {
        return target.set(...sumPositions(this));
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
    useHierarchyPositions();
  });
  afterEach(() => {
    vi.useRealTimers();
    restoreStub();
  });

  it("renders 3 stretch slots, current first; the slot elements are re-used (ring) when the camera crosses a seam", () => {
    setWorld(0);
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    expect(names(container)).toEqual(["river-stretch-0", "river-stretch--1", "river-stretch-1"]);
    expect(viewport()).toHaveAttribute("data-stretch-index", "0");
    expect(viewport()).toHaveAttribute("data-streamed-zone-ids", "3,2,1");
    const one = container.querySelector('[name="river-stretch-1"]');
    const zero = container.querySelector('[name="river-stretch-0"]');
    setWorld(1);
    expect(names(container)).toEqual(["river-stretch-1", "river-stretch-0", "river-stretch-2"]);
    expect(container.querySelector('[name="river-stretch-1"]')).toBe(one);
    expect(container.querySelector('[name="river-stretch-0"]')).toBe(zero);
    expect(viewport()).toHaveAttribute("data-stretch-index", "1");
    expect(viewport()).toHaveAttribute("data-streamed-zone-ids", "1,3,2");
    expect(viewport()).toHaveAttribute("data-zone-id", "1");
    expect(container.querySelector('[name="river-stretch-2"]')!.getAttribute("position")).toBe(`${2 * frame.periodX},0,${2 * frame.periodZ}`);
  });

  it("neighbour slots show their streamed zones (current: the store's zone); with one zone every slot shows it", () => {
    setWorld(0);
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    const counts = () => stretchSlots(container).map((g) => g.querySelectorAll('[name^="river-item-"]').length);
    expect(counts()).toEqual([3, 2, 1]);
    expect(viewport()).toHaveAttribute("data-river-item-count", "3");
    cleanup();
    setWorld(5, 0, 1, 1);
    const single = render(<SceneViewport mode="WORLD_EXPLORE" />);
    expect(stretchSlots(single.container).map((g) => g.querySelectorAll('[name^="river-item-"]').length)).toEqual([1, 1, 1]);
    expect(viewport()).toHaveAttribute("data-streamed-zone-ids", "1,1,1");
  });

  it("outside WORLD_EXPLORE / RITUAL_RELEASE the neighbour slots draw scenery only; no data-stretch-index", () => {
    setWorld(0);
    const { container } = render(<SceneViewport mode="CUSTOMIZE" />);
    expect(stretchSlots(container)).toHaveLength(3);
    expect(container.querySelectorAll('[name^="river-item-"]')).toHaveLength(0);
    expect(viewport()).not.toHaveAttribute("data-stretch-index");
  });

  it("a seam crossing creates no geometry (persistent slots; only the leapfrogged slot re-plans its krathongs)", () => {
    setWorld(0);
    render(<SceneViewport mode="WORLD_EXPLORE" />);
    setWorld(1); // warm-up crossing
    setWorld(0);
    const attrs = vi.spyOn(BufferGeometry.prototype, "setAttribute");
    const index = vi.spyOn(BufferGeometry.prototype, "setIndex");
    for (const s of [1, 2, 3, 2, 1]) setWorld(s);
    expect(attrs).not.toHaveBeenCalled();
    expect(index).not.toHaveBeenCalled();
    attrs.mockRestore();
    index.mockRestore();
  });

  it("Find My after travel flies to the lane pose + S·T of the current stretch", () => {
    setWorld(2, 2, 1, 1);
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    const before = r3f.flightStarts.length;
    act(() => useWorldStore.setState({ focusedCreationId: zones[1][0].id, focusRequestId: 1 }));
    expect(viewport()).toHaveAttribute("data-find-my", "following");
    const anchor = container.querySelector(`[name="${SCENE_OBJECT_NAMES.findMyAnchor}"]`)!;
    expect(container.querySelector('[name="river-stretch-2"]')!.contains(anchor)).toBe(true);
    const lanes = getLoyKrathongRiverLanes();
    const [prepared] = prepareRiverItems([{ id: zones[1][0].id, coord: zones[1][0].coord as never, createdAtMs: Date.parse(zones[1][0].createdAt) }], lanes);
    const local = getRiverItemPositionAt(prepared, lanes, Date.now())!.world;
    expect(r3f.flightStarts).toHaveLength(before + 1);
    const to = r3f.flightStarts[before].to as Record<string, number>;
    near(to.focusX, local.x + 2 * frame.periodX);
    near(to.focusY, local.y);
    near(to.focusZ, local.z + 2 * frame.periodZ);
  });

  it("the camera never flies on its own when the Find My krathong leaves the stretch window", () => {
    const five = (s: number) => setWorld(s, 0, 3, 5); // 5 zones: the window of 3 stretches does not always show zone 3
    five(0);
    render(<SceneViewport mode="WORLD_EXPLORE" />);
    act(() => useWorldStore.setState({ focusedCreationId: zones[3][0].id, focusRequestId: 1 }));
    expect(viewport()).toHaveAttribute("data-find-my", "following");
    const after = r3f.flightStarts.length;
    five(1); // zone 3 is now the slot behind: still followed
    expect(viewport()).toHaveAttribute("data-find-my", "following");
    five(2); // zone 3 is 2 stretches behind: out of the window
    expect(viewport()).not.toHaveAttribute("data-find-my");
    five(5); // zone 3 again in the current slot (5 stretches on): no flight without a new request
    expect(r3f.flightStarts).toHaveLength(after);
  });

  it("the navigator jump is a camera flight by ±T, an instant cut under reduced motion; unregistered outside WORLD_EXPLORE", () => {
    setWorld(0);
    useDeviceStore.getState().setReducedMotion(true);
    const { rerender } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    const before = r3f.flightStarts.length;
    act(() => getZonePagination().jumpBy(1));
    expect(r3f.flightStarts).toHaveLength(before + 1);
    const flight = r3f.flightStarts[before];
    expect(flight.immediate).toBe(true);
    const to = flight.to as Record<string, number>;
    expect(to.focusX - frame.periodX).toBeCloseTo(0, 6); // the rig starts at the origin in this stub (no frames)
    expect(to.focusZ - frame.periodZ).toBeCloseTo(0, 6);
    rerender(<SceneViewport mode="CUSTOMIZE" />);
    const n = r3f.flightStarts.length;
    act(() => getZonePagination().jumpBy(1)); // no driver: pages the store instead
    expect(r3f.flightStarts.length).toBe(n);
    expect(useWorldStore.getState().currentStretchIndex).toBe(1);
  });

  it("prop proxies and villagers are per slot; the idle-redraw ticker is mounted once per canvas", () => {
    setWorld(0);
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    for (const slot of stretchSlots(container)) {
      expect(slot.querySelectorAll(`[name="${SCENE_OBJECT_NAMES.propTapPrefix}house-0"]`)).toHaveLength(1);
      expect(slot.querySelectorAll(`[name="${SCENE_OBJECT_NAMES.villagers}"]`)).toHaveLength(1);
    }
    expect(tickers.mounted).toBe(1);
  });

  it("a lamp tap in the slot ahead flies to that slot's lamp and glows there", () => {
    setWorld(0);
    const { container } = render(<SceneViewport mode="WORLD_EXPLORE" />);
    const ahead = stretchSlots(container)[2];
    expect(ahead.getAttribute("name")).toBe("river-stretch-1");
    const before = r3f.flightStarts.length;
    fireEvent.click(ahead.querySelector('[name="scene-lamp-tap-3"]')!);
    expect(viewport()).toHaveAttribute("data-last-gimmick", "lamp-glow");
    expect(r3f.flightStarts.length).toBe(before + 1);
    const head = lampHeadPosition(LOY_KRATHONG_RIVER_LAYOUT.lamps[3], RIVER_ENVIRONMENT_PARTS.lampHead.yOffset);
    const to = r3f.flightStarts[before].to as Record<string, number>;
    near(to.focusX, head[0] + frame.periodX);
    near(to.focusZ, head[2] + frame.periodZ);
    const glow = poolManagers.at(-1)!.glow;
    const lit = Array.from({ length: glow.capacity }, (_, i) => glow.entryAt(i)).find((e) => e.active)!;
    expect(lit.state).toEqual({ lampIndex: 3, stretchIndex: 1 });
  });
});
