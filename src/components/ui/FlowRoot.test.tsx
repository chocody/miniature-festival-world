import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBuilderStore } from "@/store/useBuilderStore";
import { useDeviceStore } from "@/store/useDeviceStore";
import { useUIStore } from "@/store/useUIStore";
import { INITIAL_WORLD_STATE, useWorldStore } from "@/store/useWorldStore";
import { WISH_COPY } from "@/config/wish.config";
import { DEVICE_OWNER_TOKEN_STORAGE_KEY } from "@/config/ownership.config";
import { FlowRoot } from "./FlowRoot";
import { OWNERSHIP_LOSS_WARNING } from "./OwnershipNotice";

const zones = vi.hoisted(() => ({
  enterWorld: vi.fn(async () => "loaded"),
  leaveWorld: vi.fn(),
  loadZone: vi.fn(async () => "loaded"),
  retry: vi.fn(async () => "loaded"),
}));
vi.mock("@/services/api/zonePagination", () => ({ getZonePagination: () => zones, loadZone: zones.loadZone }));

const viewSpies = vi.hoisted(() => ({ rotate: vi.fn(), zoom: vi.fn() }));

vi.mock("@/components/canvas3d", async () => {
  const React = await import("react");
  return {
    SceneViewport: ({
      mode,
      onGestureRelease,
      viewControlRef,
    }: {
      mode: string | null;
      onGestureRelease?: () => void;
      viewControlRef?: React.Ref<{ rotate: (d: -1 | 1) => void; zoom: (d: -1 | 1) => void }>;
    }) => {
      React.useImperativeHandle(viewControlRef, () => ({ rotate: viewSpies.rotate, zoom: viewSpies.zoom }));
      return React.createElement("div", { "data-testid": "scene-viewport", "data-mode": mode ?? "", onClick: onGestureRelease });
    },
  };
});

afterEach(cleanup);

beforeEach(() => {
  useUIStore.setState(useUIStore.getInitialState(), true);
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
  useBuilderStore.setState(useBuilderStore.getInitialState(), true);
  useWorldStore.setState({ ...INITIAL_WORLD_STATE }, true);
  viewSpies.rotate.mockClear();
  viewSpies.zoom.mockClear();
  for (const fn of Object.values(zones)) fn.mockClear();
});

const completeWish = (text = "ขอให้ทุกคนมีความสุข") => {
  fireEvent.change(screen.getByRole("textbox", { name: WISH_COPY.textLabel }), { target: { value: text } });
  fireEvent.click(screen.getByRole("radio", { name: WISH_COPY.options.private.label }));
  fireEvent.click(screen.getByRole("button", { name: WISH_COPY.submit }));
};

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
    completeWish();
    expect(stateOf(container)).toBe("RITUAL_RELEASE");
    expect(container.querySelector("[data-flow-state]")).toHaveAttribute("data-interaction-mode", "RITUAL_RELEASE");
    fireEvent.click(screen.getByRole("button", { name: "ปล่อยกระทง" }));
    expect(stateOf(container)).toBe("SHARED_WORLD_EXPLORE");
    expect(container.querySelector("[data-flow-state]")).toHaveAttribute("data-interaction-mode", "WORLD_EXPLORE");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the ownership notice only in WRITE_WISH", () => {
    render(<FlowRoot />);
    expect(screen.queryByRole("note")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Loy Krathong/ }));
    expect(screen.queryByRole("note")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(screen.getByRole("note")).toHaveTextContent(OWNERSHIP_LOSS_WARNING);
    completeWish();
    expect(screen.queryByRole("note")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ปล่อยกระทง" }));
    expect(screen.queryByRole("note")).toBeNull();
    expect(window.localStorage.getItem(DEVICE_OWNER_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it("CUSTOMIZE_OBJECT shows the customizer panel only in that step", () => {
    render(<FlowRoot />);
    expect(screen.queryByRole("region", { name: "แต่งกระทง" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Loy Krathong/ }));
    expect(screen.getByRole("region", { name: "แต่งกระทง" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(screen.queryByRole("region", { name: "แต่งกระทง" })).toBeNull();
  });

  it("3D tier: the bar's view buttons drive the scene", async () => {
    act(() => useDeviceStore.getState().setQualityTier("HIGH"));
    render(<FlowRoot />);
    fireEvent.click(screen.getByRole("button", { name: /Loy Krathong/ }));
    await screen.findByTestId("scene-viewport");
    fireEvent.click(screen.getByRole("button", { name: "หมุนขวา" }));
    expect(viewSpies.rotate).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "ซูมออก" }));
    expect(viewSpies.zoom).toHaveBeenCalledWith(-1);
  });

  it("FALLBACK_2D and unprofiled: bar without view buttons", async () => {
    render(<FlowRoot />);
    fireEvent.click(screen.getByRole("button", { name: /Loy Krathong/ }));
    expect(screen.getByRole("region", { name: "แต่งกระทง" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ซูมเข้า" })).toBeNull();
    act(() => useDeviceStore.getState().setQualityTier("FALLBACK_2D"));
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "ซูมเข้า" })).toBeNull();
    expect(screen.getByRole("region", { name: "แต่งกระทง" })).toBeInTheDocument();
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

    completeWish();
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

  it("enters the shared world only at SHARED_WORLD_EXPLORE and leaves on unmount", () => {
    const { unmount } = render(<FlowRoot />);
    fireEvent.click(screen.getByRole("button", { name: /Loy Krathong/ }));
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    completeWish();
    expect(zones.enterWorld).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "ปล่อยกระทง" }));
    expect(zones.enterWorld).toHaveBeenCalledTimes(1);
    expect(zones.enterWorld).toHaveBeenCalledWith("loy_krathong");
    expect(zones.leaveWorld).not.toHaveBeenCalled();
    unmount();
    expect(zones.leaveWorld).toHaveBeenCalledTimes(1);
  });

  it("shows the zone navigator only at SHARED_WORLD_EXPLORE, without buttons in a 1-zone world", () => {
    render(<FlowRoot />);
    expect(screen.queryByTestId("zone-navigator")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Loy Krathong/ }));
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    completeWish();
    expect(screen.queryByTestId("zone-navigator")).toBeNull();
    act(() => {
      useWorldStore.setState({ eventId: "loy_krathong", currentZoneId: 1, zoneCount: 1, zoneStatus: "ready" });
    });
    fireEvent.click(screen.getByRole("button", { name: "ปล่อยกระทง" }));
    act(() => {
      useWorldStore.setState({ eventId: "loy_krathong", currentZoneId: 1, zoneCount: 1, zoneStatus: "ready" });
    });
    expect(screen.getByTestId("zone-navigator")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("WRITE_WISH renders the wish modal; SUBMIT_WISH needs a valid wish", () => {
    const { container } = render(<FlowRoot />);
    fireEvent.click(screen.getByRole("button", { name: /Loy Krathong/ }));
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(stateOf(container)).toBe("WRITE_WISH");
    expect(screen.getByRole("dialog", { name: WISH_COPY.title })).toBeInTheDocument();
    const next = screen.getByRole("button", { name: WISH_COPY.submit });
    expect(next).toBeDisabled();
    fireEvent.click(next);
    expect(stateOf(container)).toBe("WRITE_WISH");
    completeWish();
    expect(stateOf(container)).toBe("RITUAL_RELEASE");
    expect(screen.queryByRole("dialog", { name: WISH_COPY.title })).toBeNull();
    expect(useBuilderStore.getState().wish).toEqual({ text: "ขอให้ทุกคนมีความสุข", visibility: "private" });
  });

  it("FALLBACK_2D: the wish modal works and no scene mounts", async () => {
    act(() => useDeviceStore.getState().setQualityTier("FALLBACK_2D"));
    const { container } = render(<FlowRoot />);
    fireEvent.click(screen.getByRole("button", { name: /Loy Krathong/ }));
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(stateOf(container)).toBe("WRITE_WISH");
    expect(screen.getByRole("dialog", { name: WISH_COPY.title })).toBeInTheDocument();
    expect(screen.queryByTestId("scene-viewport")).toBeNull();
    completeWish();
    await act(async () => {});
    expect(stateOf(container)).toBe("RITUAL_RELEASE");
    expect(screen.queryByTestId("scene-viewport")).toBeNull();
  });
});
