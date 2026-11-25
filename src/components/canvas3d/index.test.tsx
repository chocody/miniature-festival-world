import { createRef } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
import { INITIAL_WORLD_STATE, useWorldStore } from "@/store/useWorldStore";
import type { PublicCreation } from "@/services/api/creationTypes";
import { prepareRiverItems, selectVisibleRiverItems, getLoyKrathongRiverLanes } from "@/core/world";
import { serializeKrathongAppearance } from "@/core/customization";
import { RIVER_DRIFT_SPEED_FACTOR } from "@/config/riverFlow.config";
import { INSPECT_POPUP_COPY } from "@/config/inspect.config";
import { SCENE_OBJECT_NAMES } from "./sceneObjectNames";
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

const r3f = vi.hoisted(() => ({
  cameraProps: [] as unknown[],
  camera: null as OrthographicCamera | null,
  flightStarts: [] as { immediate: boolean }[],
  bounceStarts: [] as { immediate: boolean; from?: { scale: number }; to: { scale: number } }[],
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
    onCreated?: (state: { camera: OrthographicCamera; invalidate: () => void }) => void;
  }) {
    const [camera] = React.useState(() => new THREE.OrthographicCamera());
    r3f.cameraProps.push(props.camera);
    const { onCreated } = props;
    React.useLayoutEffect(() => {
      camera.zoom = props.camera.zoom;
    }, [camera, props.camera]);
    React.useEffect(() => {
      r3f.camera = camera;
      onCreated?.({ camera, invalidate: noop });
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

afterEach(cleanup);

beforeEach(() => {
  tapStub.value = { x: 0.5, z: 0 };
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
  useBuilderStore.setState(useBuilderStore.getInitialState(), true);
  useWorldStore.setState({ ...INITIAL_WORLD_STATE }, true);
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
    fireEvent.click(waterMesh(container));
    fireEvent.click(krathongMesh(container));
    fireEvent.click(lampMesh(container));
    expect(viewport()).not.toHaveAttribute("data-selected-target");
    expect(container.querySelector("ringGeometry")).toBeNull();
    expect(r3f.flightStarts).toHaveLength(0);
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

  it("ritual chip drag releases only past the drag threshold", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const onRelease = vi.fn();
    render(<SceneViewport mode="RITUAL_RELEASE" onGestureRelease={onRelease} />);
    vi.spyOn(viewport(), "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 320, height: 256 }),
    );
    const chip = screen.getByRole("img", { name: "กระทง ลากลงน้ำ" });

    fireEvent.pointerDown(chip, { pointerId: 1, clientX: 160, clientY: 140 });
    fireEvent.pointerMove(chip, { pointerId: 1, clientX: 163, clientY: 144 });
    fireEvent.pointerUp(viewport(), { pointerId: 1, clientX: 163, clientY: 144 });
    expect(onRelease).not.toHaveBeenCalled();

    fireEvent.pointerDown(chip, { pointerId: 2, clientX: 160, clientY: 140 });
    fireEvent.pointerMove(chip, { pointerId: 2, clientX: 160, clientY: 200 });
    fireEvent.pointerUp(viewport(), { pointerId: 2, clientX: 160, clientY: 200 });
    expect(onRelease).toHaveBeenCalledTimes(1);
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
