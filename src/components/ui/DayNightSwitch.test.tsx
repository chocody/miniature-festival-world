import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIGHT_PRESET_STORAGE_KEY, LIGHT_PRESET_SWITCH_COPY as COPY } from "@/config/look.config";
import { useDeviceStore } from "@/store/useDeviceStore";
import { DayNightSwitch } from "./DayNightSwitch";

beforeEach(() => {
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
  localStorage.removeItem(LIGHT_PRESET_STORAGE_KEY);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.removeItem(LIGHT_PRESET_STORAGE_KEY);
});

describe("DayNightSwitch", () => {
  it("renders nothing before profiling and on FALLBACK_2D", () => {
    const { container, rerender } = render(<DayNightSwitch />);
    expect(container).toBeEmptyDOMElement();
    act(() => useDeviceStore.getState().setQualityTier("FALLBACK_2D"));
    rerender(<DayNightSwitch />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows three radios on a 3D tier, AUTO checked by default", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    render(<DayNightSwitch />);
    const group = screen.getByRole("radiogroup", { name: COPY.groupLabel });
    expect(group).toHaveAttribute("data-light-preset-choice", "AUTO");
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: COPY.AUTO })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: COPY.DAY })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: COPY.NIGHT })).toHaveAttribute("aria-checked", "false");
  });

  it("a click overrides the preset and keeps it on the device; AUTO removes the key", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    render(<DayNightSwitch />);
    fireEvent.click(screen.getByRole("radio", { name: COPY.NIGHT }));
    expect(useDeviceStore.getState().lightPresetChoice).toBe("NIGHT");
    expect(localStorage.getItem(LIGHT_PRESET_STORAGE_KEY)).toBe("NIGHT");
    expect(screen.getByRole("radio", { name: COPY.NIGHT })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: COPY.AUTO }));
    expect(useDeviceStore.getState().lightPresetChoice).toBe("AUTO");
    expect(localStorage.getItem(LIGHT_PRESET_STORAGE_KEY)).toBeNull();
  });

  it("the store still updates when storage throws", () => {
    useDeviceStore.getState().setQualityTier("MEDIUM");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    render(<DayNightSwitch />);
    fireEvent.click(screen.getByRole("radio", { name: COPY.DAY }));
    expect(useDeviceStore.getState().lightPresetChoice).toBe("DAY");
    expect(screen.getByRole("radio", { name: COPY.DAY })).toHaveAttribute("aria-checked", "true");
  });
});
