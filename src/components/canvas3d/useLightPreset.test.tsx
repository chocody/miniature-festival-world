import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDeviceStore } from "@/store/useDeviceStore";
import { useResolvedLightPreset } from "./useLightPreset";

beforeEach(() => {
  vi.useFakeTimers();
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useResolvedLightPreset", () => {
  it("AUTO switches at the local boundary without per-frame work", () => {
    vi.setSystemTime(new Date(2026, 10, 25, 17, 59, 0));
    const { result } = renderHook(() => useResolvedLightPreset());
    expect(result.current).toBe("DAY");
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe("NIGHT");
  });

  it("an override wins; AUTO returns to the clock", () => {
    vi.setSystemTime(new Date(2026, 10, 25, 12, 0, 0));
    useDeviceStore.getState().setLightPresetChoice("NIGHT");
    const { result } = renderHook(() => useResolvedLightPreset());
    expect(result.current).toBe("NIGHT");
    act(() => useDeviceStore.getState().setLightPresetChoice("AUTO"));
    expect(result.current).toBe("DAY");
  });

  it("re-reads the clock when the page becomes visible", () => {
    vi.setSystemTime(new Date(2026, 10, 25, 12, 0, 0));
    const { result } = renderHook(() => useResolvedLightPreset());
    expect(result.current).toBe("DAY");
    vi.setSystemTime(new Date(2026, 10, 25, 21, 0, 0)); // a sleeping background tab skipped the timer
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toBe("NIGHT");
  });

  it("unmount clears the boundary timer", () => {
    vi.setSystemTime(new Date(2026, 10, 25, 12, 0, 0));
    const before = vi.getTimerCount();
    const { unmount } = renderHook(() => useResolvedLightPreset());
    expect(vi.getTimerCount()).toBe(before + 1);
    unmount();
    expect(vi.getTimerCount()).toBe(before);
  });
});
