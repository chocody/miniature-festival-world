import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_QUALITY_TIER, QUALITY_TIERS } from "@/config/performance.config";
import { useBuilderStore } from "./useBuilderStore";
import { useDeviceStore } from "./useDeviceStore";
import { useUIStore } from "./useUIStore";
import { useWorldStore } from "./useWorldStore";

const all = [useUIStore, useBuilderStore, useWorldStore, useDeviceStore];

beforeEach(() => {
  useUIStore.setState(useUIStore.getInitialState(), true);
  useBuilderStore.setState(useBuilderStore.getInitialState(), true);
  useWorldStore.setState(useWorldStore.getInitialState(), true);
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
});

describe("zustand stores", () => {
  it("are four distinct stores", () => {
    expect(new Set(all).size).toBe(4);
  });

  it("have the specified initial shapes", () => {
    expect(useBuilderStore.getState()).toEqual({ appearance: null });
    expect(useWorldStore.getState()).toEqual({ currentZoneId: null, participantCount: null });
    expect(useDeviceStore.getState()).toEqual({
      fps: null,
      qualityTier: DEFAULT_QUALITY_TIER,
      reducedMotion: false,
      isFallback2D: false,
    });
    expect(QUALITY_TIERS).toContain(useDeviceStore.getState().qualityTier);
    expect(useDeviceStore.getState().qualityTier).toBe(DEFAULT_QUALITY_TIER);
  });

  it("mutating one store leaves the others unchanged", () => {
    const ui = useUIStore.getState();
    const builder = useBuilderStore.getState();
    const world = useWorldStore.getState();
    useDeviceStore.setState({ qualityTier: "LOW", reducedMotion: true });
    expect(useUIStore.getState()).toBe(ui);
    expect(useBuilderStore.getState()).toBe(builder);
    expect(useWorldStore.getState()).toBe(world);

    useWorldStore.setState({ currentZoneId: 3 });
    expect(useDeviceStore.getState().qualityTier).toBe("LOW");
    expect(useUIStore.getState()).toBe(ui);
    expect(useBuilderStore.getState()).toBe(builder);
  });
});
