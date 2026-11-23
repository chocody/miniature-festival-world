import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_QUALITY_TIER } from "@/config/performance.config";
import { useDeviceStore } from "./useDeviceStore";
import { useUIStore } from "./useUIStore";

beforeEach(() => {
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
});

describe("useDeviceStore", () => {
  it("keeps the initial fields", () => {
    expect(useDeviceStore.getState()).toMatchObject({
      fps: null,
      qualityTier: DEFAULT_QUALITY_TIER,
      reducedMotion: false,
      isFallback2D: false,
    });
  });
  it("FALLBACK_2D <=> isFallback2D", () => {
    useDeviceStore.getState().setQualityTier("FALLBACK_2D");
    expect(useDeviceStore.getState().isFallback2D).toBe(true);
    useDeviceStore.getState().setQualityTier("LOW");
    expect(useDeviceStore.getState().isFallback2D).toBe(false);
  });
  it.each(["HIGH", "MEDIUM", "LOW"] as const)("%s is not a fallback", (tier) => {
    useDeviceStore.getState().setQualityTier(tier);
    expect(useDeviceStore.getState().qualityTier).toBe(tier);
    expect(useDeviceStore.getState().isFallback2D).toBe(false);
  });
  it("setFps", () => {
    useDeviceStore.getState().setFps(42);
    expect(useDeviceStore.getState().fps).toBe(42);
    useDeviceStore.getState().setFps(null);
    expect(useDeviceStore.getState().fps).toBeNull();
  });
  it("setReducedMotion", () => {
    useDeviceStore.getState().setReducedMotion(true);
    expect(useDeviceStore.getState().reducedMotion).toBe(true);
  });
  it("leaves other stores untouched", () => {
    const ui = useUIStore.getState();
    useDeviceStore.getState().setQualityTier("LOW");
    expect(useUIStore.getState()).toBe(ui);
  });
});
