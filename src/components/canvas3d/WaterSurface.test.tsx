import { act, cleanup, render } from "@testing-library/react";
import { createRef, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BufferAttribute, BufferGeometry, Mesh } from "three";
import { LOY_KRATHONG_RIVER_LAYOUT as layout } from "@/components/models/loyKrathong/riverLayout";
import { RIVER_WATER_WAVES } from "@/config/events/loyKrathong.river.config";
import type { RenderTier } from "@/config/performance.config";
import { writeWaterWaveNormals } from "@/core/world";
import { getLoyKrathongEndlessRiverFrame } from "@/core/world/endlessRiver";
import { useDeviceStore } from "@/store/useDeviceStore";
import { SCENE_OBJECT_NAMES } from "./sceneObjectNames";
import { StretchVisibilityContext } from "./stretchVisibility";
import { WaterSurface, type WaterSurfaceProps } from "./WaterSurface";

const created = vi.hoisted(() => ({ geometries: [] as BufferGeometry[] }));
const r3f = vi.hoisted(() => ({ frames: [] as (() => void)[], invalidate: null as null | (() => void) }));

vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: { invalidate: () => void }) => unknown) => selector({ invalidate: r3f.invalidate! }),
  useFrame: (cb: () => void) => {
    r3f.frames.push(cb);
  },
}));

vi.mock("./geometry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./geometry")>();
  return {
    ...actual,
    createWaterSurfaceGeometry: (...a: Parameters<typeof actual.createWaterSurfaceGeometry>) => {
      const g = actual.createWaterSurfaceGeometry(...a);
      created.geometries.push(g);
      return g;
    },
  };
});

const frame = getLoyKrathongEndlessRiverFrame();
const T0 = 1_700_000_000_000;
let NOW = T0;
const now = () => NOW;
const invalidate = vi.fn();
const onClick = vi.fn();

const geometry = () => created.geometries.at(-1)!;
const normal = () => geometry().getAttribute("normal") as BufferAttribute;
const normals = () => Array.from(normal().array);
const lastFrame = () => r3f.frames.at(-1)!;
const expected = (timeMs: number) =>
  Array.from(
    writeWaterWaveNormals(
      layout.water.positions,
      layout.water.vertexCount,
      frame,
      timeMs,
      RIVER_WATER_WAVES,
      new Float32Array(layout.water.vertexCount * 3),
    ),
  );
const allUp = (a: readonly number[]) => a.every((v, i) => (i % 3 === 1 ? v === 1 : v === 0));

function props(overrides: Partial<WaterSurfaceProps> = {}): WaterSurfaceProps {
  return {
    data: layout.water,
    surfaceY: layout.waterSurfaceY,
    frame,
    shadows: true,
    waterRef: createRef<Mesh>(),
    now,
    onClick,
    ...overrides,
  };
}
const setTier = (tier: RenderTier, reducedMotion = false) => {
  useDeviceStore.getState().setQualityTier(tier);
  useDeviceStore.getState().setReducedMotion(reducedMotion);
};
/** The props React gave a DOM stub element. */
function reactProps(el: Element): Record<string, unknown> {
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
  if (!key) throw new Error("no React props on the element");
  return (el as unknown as Record<string, Record<string, unknown>>)[key];
}

beforeEach(() => {
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
  created.geometries.length = 0;
  r3f.frames.length = 0;
  r3f.invalidate = invalidate;
  invalidate.mockClear();
  onClick.mockClear();
  NOW = T0;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Mounted surface: moves the clock by 1 s, runs a frame and reports whether the normals changed. */
function stepFrame() {
  const before = normals();
  const version = normal().version;
  NOW += 1_000;
  lastFrame()();
  return { changed: normals().some((v, i) => v !== before[i]), versionDelta: normal().version - version };
}

function expectMoving() {
  expect(normals()).toEqual(expected(T0));
  expect(allUp(normals())).toBe(false);
  expect(invalidate).toHaveBeenCalledTimes(1);
  const { changed, versionDelta } = stepFrame();
  expect(changed).toBe(true);
  expect(versionDelta).toBe(1);
  expect(normals()).toEqual(expected(NOW));
  expect(invalidate).toHaveBeenCalledTimes(1); // the frame never invalidates (rule D7)
}

function expectStill() {
  expect(normals()).toEqual(expected(0));
  expect(allUp(normals())).toBe(false); // static swells still shade the water
  const { changed, versionDelta } = stepFrame();
  expect(changed).toBe(false);
  expect(versionDelta).toBe(0);
}

describe("WaterSurface (MFW-79)", () => {
  it("WS1: HIGH — one water mesh; the swells match writeWaterWaveNormals and drift per frame without invalidate", () => {
    setTier("HIGH");
    const { container } = render(<WaterSurface {...props()} />);
    expect(container.querySelectorAll(`mesh[name="${SCENE_OBJECT_NAMES.water}"]`)).toHaveLength(1);
    expectMoving();
  });

  it("WS2: reduced motion keeps the water still (t = 0), also when it flips on a mounted HIGH surface", () => {
    setTier("HIGH", true);
    render(<WaterSurface {...props()} />);
    expectStill();
    cleanup();
    NOW = T0;
    setTier("HIGH", false);
    render(<WaterSurface {...props()} />);
    expect(normals()).toEqual(expected(T0));
    act(() => useDeviceStore.getState().setReducedMotion(true));
    expectStill();
  });

  it("WS3: LOW is static at t = 0 and writes nothing per frame; MEDIUM drifts like HIGH", () => {
    setTier("LOW");
    render(<WaterSurface {...props()} />);
    expectStill();
    cleanup();
    invalidate.mockClear();
    NOW = T0;
    setTier("MEDIUM");
    render(<WaterSurface {...props()} />);
    expectMoving();
  });

  it("WS4: a culled stretch copy writes nothing in its frame", () => {
    setTier("HIGH");
    const ui: ReactElement = (
      <StretchVisibilityContext.Provider value={{ visible: false }}>
        <WaterSurface {...props()} />
      </StretchVisibilityContext.Provider>
    );
    render(ui);
    expect(normals()).toEqual(expected(T0));
    expect(stepFrame().versionDelta).toBe(0);
  });

  it("WS5: without a clock, HIGH is static at t = 0", () => {
    setTier("HIGH");
    render(<WaterSurface {...props({ now: undefined })} />);
    expectStill();
  });

  it("WS6: re-rendering with the same props keeps the geometry; unmount disposes it once", () => {
    setTier("HIGH");
    const p = props();
    const { rerender, unmount } = render(<WaterSurface {...p} />);
    const g = geometry();
    const dispose = vi.spyOn(g, "dispose");
    rerender(<WaterSurface {...p} />);
    expect(created.geometries).toHaveLength(1);
    expect(dispose).not.toHaveBeenCalled();
    unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("WS7: the mesh carries the surface height, receiveShadow and the given onClick", () => {
    setTier("HIGH");
    for (const shadows of [true, false]) {
      const { container } = render(<WaterSurface {...props({ shadows })} />);
      const el = container.querySelector(`mesh[name="${SCENE_OBJECT_NAMES.water}"]`)!;
      const p = reactProps(el);
      expect(p.position).toEqual([0, layout.waterSurfaceY, 0]);
      expect(p.receiveShadow).toBe(shadows);
      expect(p.onClick).toBe(onClick);
      cleanup();
    }
  });
});
