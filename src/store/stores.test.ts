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
    const builder = useBuilderStore.getState();
    expect(builder.appearance).toBeNull();
    expect(Object.keys(builder).sort()).toEqual(["appearance", "chooseKrathong"]);
    expect(typeof builder.chooseKrathong).toBe("function");
    expect(useWorldStore.getState()).toEqual({
      currentZoneId: null, participantCount: null, eventId: null, zoneCount: null,
      zoneStatus: "idle", zoneItems: [], focusedCreationId: null,
    });
    expect(useDeviceStore.getState()).toMatchObject({
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
