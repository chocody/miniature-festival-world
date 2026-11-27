import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIGHT_PRESET_STORAGE_KEY, LIGHT_PRESET_TOGGLE_COPY as COPY } from "@/config/look.config";
import { useDeviceStore } from "@/store/useDeviceStore";
import { DayNightSwitch } from "./DayNightSwitch";

const setClock = (h: number) => vi.setSystemTime(new Date(2026, 10, 26, h, 0));
const toggle = () => screen.getByTestId("day-night-toggle");

beforeEach(() => {
  vi.useFakeTimers();
  setClock(20);
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
  useDeviceStore.getState().setQualityTier("HIGH"); // profiled
  localStorage.removeItem(LIGHT_PRESET_STORAGE_KEY);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.removeItem(LIGHT_PRESET_STORAGE_KEY);
});

describe("DayNightSwitch (MFW-74 toggle)", () => {
  it("D1 one icon button, no radiogroup, moon at 20:00 with a Thai label and no text", () => {
    render(<DayNightSwitch />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(toggle().querySelector('[data-glyph="moon"]')).not.toBeNull();
    expect(toggle()).toHaveAttribute("aria-label", COPY.NIGHT);
    expect(toggle()).toHaveAttribute("data-light-preset", "NIGHT");
    expect(toggle().textContent).toBe("");
  });

  it("D2 a click switches to DAY and stores it; the next click returns to AUTO and removes the key", () => {
    render(<DayNightSwitch />);
    fireEvent.click(toggle());
    expect(useDeviceStore.getState().lightPresetChoice).toBe("DAY");
    expect(localStorage.getItem(LIGHT_PRESET_STORAGE_KEY)).toBe("DAY");
    expect(toggle().querySelector('[data-glyph="sun"]')).not.toBeNull();
    expect(toggle()).toHaveAttribute("aria-label", COPY.DAY);
    fireEvent.click(toggle());
    expect(useDeviceStore.getState().lightPresetChoice).toBe("AUTO");
    expect(localStorage.getItem(LIGHT_PRESET_STORAGE_KEY)).toBeNull();
    expect(toggle().querySelector('[data-glyph="moon"]')).not.toBeNull();
  });

  it("D3 at 10:00 with AUTO a click stores NIGHT", () => {
    setClock(10);
    render(<DayNightSwitch />);
    expect(toggle()).toHaveAttribute("data-light-preset", "DAY");
    fireEvent.click(toggle());
    expect(useDeviceStore.getState().lightPresetChoice).toBe("NIGHT");
    expect(localStorage.getItem(LIGHT_PRESET_STORAGE_KEY)).toBe("NIGHT");
  });

  it("D4 renders nothing before profiling", () => {
    useDeviceStore.setState(useDeviceStore.getInitialState(), true);
    const { container } = render(<DayNightSwitch />);
    expect(container).toBeEmptyDOMElement();
    act(() => useDeviceStore.getState().setQualityTier("LOW"));
    expect(screen.getByTestId("day-night-toggle")).toBeInTheDocument();
  });

  it("D5 is a 44 px round button on the veil", () => {
    render(<DayNightSwitch />);
    for (const c of ["min-h-11", "min-w-11", "rounded-full", "bg-veil", "shadow-float"]) expect(toggle().className.split(" ")).toContain(c);
  });

  it("D6 the choice still changes when storage throws", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    try {
      render(<DayNightSwitch />);
      expect(() => fireEvent.click(toggle())).not.toThrow();
      expect(useDeviceStore.getState().lightPresetChoice).toBe("DAY");
      expect(toggle().querySelector('[data-glyph="sun"]')).not.toBeNull();
      expect(toggle()).toHaveAttribute("aria-label", COPY.DAY);
    } finally {
      spy.mockRestore();
    }
  });
});
