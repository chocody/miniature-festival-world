import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RELEASE_SCENE_WATCHDOG_MS, RITUAL_COPY } from "@/config/ritual.config";
import { RITUAL_ERROR_KINDS, type RitualEvent } from "@/core/ritual";
import { useDeviceStore } from "@/store/useDeviceStore";
import { useUIStore } from "@/store/useUIStore";
import { RitualReleasePanel } from "./RitualReleasePanel";
import { CHRISTMAS_COPY } from "@/config/events/christmas.copy";
import { EventCopyProvider } from "./EventCopyContext";

afterEach(cleanup);
beforeEach(() => {
  useUIStore.setState(useUIStore.getInitialState(), true);
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
});

const ritual = () => useUIStore.getState().ritual;
const dispatch = (e: RitualEvent) => act(() => useUIStore.getState().dispatchRitual(e));

describe("RitualReleasePanel", () => {
  it("the button releases from the pier", () => {
    const release = vi.fn(async () => "saved" as const);
    render(<RitualReleasePanel animateInScene releaser={{ release }} />);
    fireEvent.click(screen.getByRole("button", { name: RITUAL_COPY.releaseButton }));
    expect(release).toHaveBeenCalledWith({ kind: "pier" });
  });

  it("disables the button while releasing and shows the status", () => {
    render(<RitualReleasePanel animateInScene releaser={{ release: vi.fn() }} />);
    dispatch({ type: "RELEASE_STARTED", attempt: 1, origin: { kind: "pier" } });
    expect(screen.getByRole("button", { name: RITUAL_COPY.releaseButton })).toBeDisabled();
    expect(screen.getByTestId("ritual-status")).toHaveTextContent(RITUAL_COPY.releasing);
  });

  it.each(RITUAL_ERROR_KINDS)("shows the %s error", (kind) => {
    render(<RitualReleasePanel animateInScene releaser={{ release: vi.fn() }} />);
    dispatch({ type: "RELEASE_STARTED", attempt: 1, origin: { kind: "pier" } });
    dispatch({ type: "SAVE_FAILED", attempt: 1, error: { kind } });
    expect(screen.getByTestId("ritual-status")).toHaveTextContent(RITUAL_COPY.errors[kind]);
    expect(screen.getByRole("button", { name: RITUAL_COPY.releaseButton })).toBeEnabled();
  });

  it("shows the drop hint", () => {
    render(<RitualReleasePanel animateInScene releaser={{ release: vi.fn() }} />);
    dispatch({ type: "DROP_REJECTED" });
    expect(screen.getByTestId("ritual-status")).toHaveTextContent(RITUAL_COPY.dropOnWater);
  });

  it("completes without animation when no scene animates", () => {
    const { rerender } = render(<RitualReleasePanel animateInScene releaser={{ release: vi.fn() }} />);
    expect(ritual().instant).toBe(false);
    rerender(<RitualReleasePanel animateInScene={false} releaser={{ release: vi.fn() }} />);
    expect(ritual().instant).toBe(true);
  });

  it("reduced motion removes the colour transition", () => {
    const { rerender } = render(<RitualReleasePanel animateInScene releaser={{ release: vi.fn() }} />);
    expect(screen.getByRole("button").className).toContain("transition-colors");
    act(() => useDeviceStore.getState().setReducedMotion(true));
    rerender(<RitualReleasePanel animateInScene releaser={{ release: vi.fn() }} />);
    expect(screen.getByRole("button").className).not.toContain("transition-colors");
  });

  it("watchdog: saved but never settled skips the animation after the timeout", () => {
    vi.useFakeTimers();
    try {
      render(<RitualReleasePanel animateInScene releaser={{ release: vi.fn() }} />);
      dispatch({ type: "RELEASE_STARTED", attempt: 1, origin: { kind: "pier" } });
      act(() => void vi.advanceTimersByTime(RELEASE_SCENE_WATCHDOG_MS * 2));
      expect(ritual().phase).toBe("RELEASING"); // not saved yet: the request may still be pending
      dispatch({
        type: "SAVED",
        attempt: 1,
        saved: {
          id: "x",
          zoneId: 1,
          coord: { mode: "SPLINE_PATH", laneId: 1, spawnProgress: 0.4, speedFactor: 0.008, lateralOffset: 0 },
          createdAtMs: 1,
          serverClockOffsetMs: 0,
          movedByServer: false,
        },
      });
      act(() => void vi.advanceTimersByTime(RELEASE_SCENE_WATCHDOG_MS - 1));
      expect(ritual().phase).toBe("RELEASING");
      act(() => void vi.advanceTimersByTime(1));
      expect(ritual().phase).toBe("RELEASED");
    } finally {
      vi.useRealTimers();
    }
  });

  it("fits a 360 px container", () => {
    const { container } = render(
      <div style={{ width: 360 }}>
        <RitualReleasePanel animateInScene releaser={{ release: vi.fn() }} />
      </div>,
    );
    expect(container.querySelector("button")!.scrollWidth).toBeLessThanOrEqual(360);
  });

  it("CC2 (MFW-91): christmas copy: panel, release button and hint", () => {
    render(
      <EventCopyProvider eventId="christmas">
        <RitualReleasePanel animateInScene releaser={{ release: vi.fn() }} />
      </EventCopyProvider>,
    );
    const c = CHRISTMAS_COPY.ritual;
    expect(screen.getByRole("region", { name: c.panelLabel })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: c.releaseButton })).toBeInTheDocument();
    expect(screen.getByText(c.hint)).toBeInTheDocument();
  });
});
