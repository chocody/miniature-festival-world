import { act, cleanup, render } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FLAME_FLICKER_REDRAW_INTERVAL_MS } from "@/config/krathongModel.config";
import type { RenderTier } from "@/config/performance.config";
import { createFlameFlickerFrame, writeFlameFlickerAt } from "@/core/customization/flameFlicker";
import { useDeviceStore } from "@/store/useDeviceStore";
import { FlameFlicker } from "./FlameFlicker";
import { KrathongAssetsProvider, useKrathongAssets } from "./KrathongAssetsProvider";
import type { KrathongAssets } from "./krathongAssets";

const r3f = vi.hoisted(() => ({ frames: [] as (() => void)[], invalidate: vi.fn() }));
vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: { invalidate: () => void }) => unknown) => selector({ invalidate: r3f.invalidate }),
  useFrame: (cb: () => void) => {
    r3f.frames.push(cb);
  },
}));

const probe = { assets: null as KrathongAssets | null };
function AssetsProbe() {
  const assets = useKrathongAssets();
  useLayoutEffect(() => {
    probe.assets = assets;
  }, [assets]);
  return null;
}

const BASE = 3;
function Scene({ reducedMotion = false, now }: { reducedMotion?: boolean; now?: () => number }) {
  return (
    <KrathongAssetsProvider>
      <AssetsProbe />
      <FlameFlicker baseEmissiveIntensity={BASE} reducedMotion={reducedMotion} now={now} />
    </KrathongAssetsProvider>
  );
}

const lastFrame = () => r3f.frames[r3f.frames.length - 1];

/** jsdom's `document.hidden` stubbed explicitly (MFW-69: the redraw interval pauses while hidden). */
let hidden = false;
beforeEach(() => {
  hidden = false;
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
  useDeviceStore.getState().setQualityTier("HIGH");
});
afterEach(() => {
  cleanup();
  r3f.frames.length = 0;
  r3f.invalidate.mockClear();
  vi.restoreAllMocks();
});

describe("FlameFlicker (MFW-48)", () => {
  it.each(["HIGH", "MEDIUM", "LOW"] as const)("%s: redraws the demand loop at the tier cadence", (tier: RenderTier) => {
    useDeviceStore.getState().setQualityTier(tier);
    const spy = vi.spyOn(window, "setInterval");
    render(<Scene />);
    // The interval comes from the shared idle-redraw ticker (MFW-50 fix round): its handler wraps invalidate.
    expect(spy).toHaveBeenCalledWith(expect.any(Function), FLAME_FLICKER_REDRAW_INTERVAL_MS[tier]);
    expect(r3f.invalidate).toHaveBeenCalled();
  });

  it("writes the shared flicker and the flame emissive per frame (untone-mapped)", () => {
    render(<Scene now={() => 250} />);
    act(() => lastFrame()());
    const want = writeFlameFlickerAt(250, false, createFlameFlickerFrame());
    const assets = probe.assets!;
    expect(assets.flameFlicker).toEqual(want);
    expect(assets.material("flame").emissiveIntensity).toBeCloseTo(BASE * want.emissiveScale, 12);
    expect(assets.material("flame").toneMapped).toBe(false);
  });

  it("reduced motion: no interval, static flame at the base emissive", () => {
    const spy = vi.spyOn(window, "setInterval");
    render(<Scene reducedMotion now={() => 250} />);
    act(() => lastFrame()());
    expect(spy).not.toHaveBeenCalled();
    const assets = probe.assets!;
    expect(assets.flameFlicker).toEqual({ heightScale: 1, widthScale: 1, emissiveScale: 1 });
    expect(assets.material("flame").emissiveIntensity).toBe(BASE);
    expect(r3f.invalidate).toHaveBeenCalledTimes(1);
  });

  it("FALLBACK_2D: no interval", () => {
    useDeviceStore.getState().setQualityTier("FALLBACK_2D");
    const spy = vi.spyOn(window, "setInterval");
    render(<Scene />);
    expect(spy).not.toHaveBeenCalled();
  });

  it("clears the interval on unmount", () => {
    const set = vi.spyOn(window, "setInterval");
    const clear = vi.spyOn(window, "clearInterval");
    const { unmount } = render(<Scene />);
    const id = set.mock.results[0].value;
    unmount();
    expect(clear).toHaveBeenCalledWith(id);
  });

  it("turning reduced motion on clears the interval and makes the flame static", () => {
    const set = vi.spyOn(window, "setInterval");
    const clear = vi.spyOn(window, "clearInterval");
    const { rerender } = render(<Scene now={() => 250} />);
    act(() => lastFrame()());
    const id = set.mock.results[0].value;
    rerender(<Scene reducedMotion now={() => 250} />);
    expect(clear).toHaveBeenCalledWith(id);
    expect(set).toHaveBeenCalledTimes(1);
    expect(probe.assets!.flameFlicker).toEqual({ heightScale: 1, widthScale: 1, emissiveScale: 1 });
    expect(probe.assets!.material("flame").emissiveIntensity).toBe(BASE);
  });

  it("pauses the redraw interval while the document is hidden", () => {
    const set = vi.spyOn(window, "setInterval");
    const clear = vi.spyOn(window, "clearInterval");
    render(<Scene />);
    expect(set).toHaveBeenCalledTimes(1);
    const id = set.mock.results[0].value;
    hidden = true;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(clear).toHaveBeenCalledWith(id);
    hidden = false;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(set).toHaveBeenCalledTimes(2);
  });

  it("removes the visibility listener on unmount", () => {
    const remove = vi.spyOn(document, "removeEventListener");
    const { unmount } = render(<Scene />);
    unmount();
    expect(remove).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  });
});
