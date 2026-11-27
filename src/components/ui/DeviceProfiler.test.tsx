import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeCanvas, fakeMql, type FakeMql } from "@/core/performance/testFakes";
import { useDeviceStore } from "@/store/useDeviceStore";
import { LIGHT_PRESET_STORAGE_KEY } from "@/config/look.config";
import { SKY_LAUNCH_CHOICE_STORAGE_KEY, SKY_LAUNCH_DEFAULT_KIND } from "@/config/gimmicks.config";
import { DeviceProfiler } from "./DeviceProfiler";

let mql: FakeMql;
let raf: ReturnType<typeof vi.fn>;
let caf: ReturnType<typeof vi.fn>;

function stubWebGL(available: boolean) {
  const f = fakeCanvas({ webgl2: available });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(((id: string) =>
    f.canvas.getContext(id)) as never);
}

beforeEach(() => {
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
  mql = fakeMql(true);
  raf = vi.fn(() => 1);
  caf = vi.fn();
  vi.stubGlobal("requestAnimationFrame", raf);
  vi.stubGlobal("cancelAnimationFrame", caf);
  vi.stubGlobal("matchMedia", () => mql);
  Object.defineProperty(navigator, "deviceMemory", { configurable: true, get: () => 8 });
  Object.defineProperty(navigator, "hardwareConcurrency", { configurable: true, get: () => 8 });
  stubWebGL(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "deviceMemory");
  Reflect.deleteProperty(navigator, "hardwareConcurrency");
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
  localStorage.removeItem(LIGHT_PRESET_STORAGE_KEY);
  localStorage.removeItem(SKY_LAUNCH_CHOICE_STORAGE_KEY);
});

describe("DeviceProfiler", () => {
  it("renders nothing and writes the detected state to the store", () => {
    const { container } = render(<DeviceProfiler />);
    expect(container).toBeEmptyDOMElement();
    const s = useDeviceStore.getState();
    expect(s.qualityTier).toBe("HIGH");
    expect(s.reducedMotion).toBe(true);
    expect(s.webglAvailable).toBe(true);
  });
  it("DP1: hydrates the stored sky launch choice; garbage falls back to the default (MFW-85)", () => {
    localStorage.setItem(SKY_LAUNCH_CHOICE_STORAGE_KEY, "skyLantern");
    const first = render(<DeviceProfiler />);
    expect(useDeviceStore.getState().skyLaunchChoice).toBe("skyLantern");
    first.unmount();
    useDeviceStore.setState(useDeviceStore.getInitialState(), true);
    localStorage.setItem(SKY_LAUNCH_CHOICE_STORAGE_KEY, "garbage");
    render(<DeviceProfiler />);
    expect(useDeviceStore.getState().skyLaunchChoice).toBe(SKY_LAUNCH_DEFAULT_KIND);
  });
  it("D1: no WebGL -> LOW and webglAvailable false", () => {
    vi.restoreAllMocks();
    stubWebGL(false);
    render(<DeviceProfiler />);
    expect(useDeviceStore.getState().qualityTier).toBe("LOW");
    expect(useDeviceStore.getState().webglAvailable).toBe(false);
    expect(useDeviceStore.getState().profiled).toBe(true);
  });
  it("follows reduced-motion changes", () => {
    render(<DeviceProfiler />);
    act(() => mql.emit(false));
    expect(useDeviceStore.getState().reducedMotion).toBe(false);
  });
  it("hydrates the per-device light preset choice once (MFW-47)", () => {
    localStorage.setItem(LIGHT_PRESET_STORAGE_KEY, "DAY");
    render(<DeviceProfiler />);
    expect(useDeviceStore.getState().lightPresetChoice).toBe("DAY");
  });
  it("?pinTier=1 keeps the initial tier (no FPS meter)", () => {
    window.history.replaceState(null, "", "/?pinTier=1");
    try {
      render(<DeviceProfiler />);
      expect(useDeviceStore.getState().qualityTier).toBe("HIGH");
      expect(raf).not.toHaveBeenCalled();
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });
  it("without the flag the FPS meter starts", () => {
    render(<DeviceProfiler />);
    expect(raf).toHaveBeenCalled();
  });
  it("cleans up on unmount", () => {
    const { unmount } = render(<DeviceProfiler />);
    expect(mql.listeners.size).toBe(1);
    unmount();
    expect(caf).toHaveBeenCalled();
    expect(mql.listeners.size).toBe(0);
  });
});
