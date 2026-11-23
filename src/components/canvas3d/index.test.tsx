import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TIER_BUDGETS } from "@/config/performance.config";
import { useDeviceStore } from "@/store/useDeviceStore";
import { getSceneRenderSettings, SceneViewport, TOY_MATTE_MATERIALS, TOY_SCENE_CAMERA, TOY_SCENE_LIGHTING } from "./index";

vi.mock("@react-three/fiber", async () => {
  const React = await import("react");
  return {
    Canvas: ({
      orthographic,
      shadows,
      dpr,
    }: {
      children: React.ReactNode;
      orthographic: boolean;
      shadows: boolean;
      dpr: readonly [number, number];
    }) =>
      React.createElement("div", {
        "data-testid": "r3f-canvas",
        "data-orthographic": String(orthographic),
        "data-shadows": String(shadows),
        "data-dpr": dpr.join(","),
      }),
  };
});

afterEach(cleanup);

beforeEach(() => {
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
});

describe("toy-like night scene", () => {
  it("uses an orthographic camera and soft night light with a warm candle light", () => {
    expect(TOY_SCENE_CAMERA.orthographic).toBe(true);
    expect(TOY_SCENE_LIGHTING.ambient.color).toBe("#8499c5");
    expect(TOY_SCENE_LIGHTING.candle.color).toBe("#ffb35c");
  });

  it("uses flat matte material settings", () => {
    for (const material of Object.values(TOY_MATTE_MATERIALS)) {
      expect(material.roughness).toBe(1);
      expect(material.metalness).toBe(0);
    }
  });

  it.each(["HIGH", "MEDIUM", "LOW"] as const)("uses the %s render budget", (tier) => {
    expect(getSceneRenderSettings(tier)).toEqual({
      dpr: [1, TIER_BUDGETS[tier].pixelRatioCap],
      shadows: TIER_BUDGETS[tier].shadows,
      maxTextureSize: TIER_BUDGETS[tier].maxTextureSize,
    });
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
