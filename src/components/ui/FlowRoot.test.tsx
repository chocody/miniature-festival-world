import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDeviceStore } from "@/store/useDeviceStore";
import { useUIStore } from "@/store/useUIStore";
import { FlowRoot } from "./FlowRoot";

vi.mock("@/components/canvas3d", async () => {
  const React = await import("react");
  return {
    SceneViewport: ({ mode, onGestureRelease }: { mode: string | null; onGestureRelease?: () => void }) =>
      React.createElement("div", { "data-testid": "scene-viewport", "data-mode": mode ?? "", onClick: onGestureRelease }),
  };
});

afterEach(cleanup);

beforeEach(() => {
  useUIStore.setState(useUIStore.getInitialState(), true);
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
});

const stateOf = (container: HTMLElement) =>
  container.querySelector("[data-flow-state]")?.getAttribute("data-flow-state");

describe("FlowRoot", () => {
  it("clicks through all 5 states", () => {
    const { container } = render(<FlowRoot />);
    expect(stateOf(container)).toBe("LANDING_EVENT_SELECT");
    expect(container.querySelector("[data-flow-state]")).not.toHaveAttribute("data-interaction-mode");
    fireEvent.click(screen.getByRole("button", { name: /Loy Krathong/ }));
    expect(stateOf(container)).toBe("CUSTOMIZE_OBJECT");
    expect(container.querySelector("[data-flow-state]")).toHaveAttribute("data-interaction-mode", "CUSTOMIZE");
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(stateOf(container)).toBe("WRITE_WISH");
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(stateOf(container)).toBe("RITUAL_RELEASE");
    expect(container.querySelector("[data-flow-state]")).toHaveAttribute("data-interaction-mode", "RITUAL_RELEASE");
    fireEvent.click(screen.getByRole("button", { name: "ปล่อยกระทง" }));
    expect(stateOf(container)).toBe("SHARED_WORLD_EXPLORE");
    expect(container.querySelector("[data-flow-state]")).toHaveAttribute("data-interaction-mode", "WORLD_EXPLORE");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("clicking a Coming Soon festival keeps landing", () => {
    const { container } = render(<FlowRoot />);
    fireEvent.click(screen.getByRole("button", { name: /Christmas/ }));
    expect(stateOf(container)).toBe("LANDING_EVENT_SELECT");
  });

  it("exposes quality tier and reduced motion from the device store", () => {
    const { container } = render(<FlowRoot />);
    const root = container.querySelector("[data-flow-state]")!;
    expect(root).toHaveAttribute("data-quality-tier", "MEDIUM");
    expect(root).toHaveAttribute("data-reduced-motion", "false");
    act(() => {
      useDeviceStore.getState().setQualityTier("LOW");
      useDeviceStore.getState().setReducedMotion(true);
    });
    expect(root).toHaveAttribute("data-quality-tier", "LOW");
    expect(root).toHaveAttribute("data-reduced-motion", "true");
  });

  it("mounts the lazy scene only in canvas modes on a profiled 3D tier", async () => {
    act(() => useDeviceStore.getState().setQualityTier("HIGH"));
    const { container } = render(<FlowRoot />);
    await act(async () => {});
    expect(screen.queryByTestId("scene-viewport")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Loy Krathong/ }));
    expect(await screen.findByTestId("scene-viewport")).toHaveAttribute("data-mode", "CUSTOMIZE");

    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(screen.queryByTestId("scene-viewport")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    const marker = await screen.findByTestId("scene-viewport");
    expect(marker).toHaveAttribute("data-mode", "RITUAL_RELEASE");

    fireEvent.click(marker);
    expect(await screen.findByTestId("scene-viewport")).toHaveAttribute("data-mode", "WORLD_EXPLORE");
    expect(stateOf(container)).toBe("SHARED_WORLD_EXPLORE");
  });

  it("never mounts the scene before profiling or on FALLBACK_2D", async () => {
    render(<FlowRoot />);
    fireEvent.click(screen.getByRole("button", { name: /Loy Krathong/ }));
    await act(async () => {});
    expect(screen.queryByTestId("scene-viewport")).toBeNull();

    act(() => useDeviceStore.getState().setQualityTier("FALLBACK_2D"));
    await act(async () => {});
    expect(screen.queryByTestId("scene-viewport")).toBeNull();
  });
});
