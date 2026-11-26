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
  it("renders nothing before profiling; renders the three radios once profiled (MFW-51)", () => {
    const { container, rerender } = render(<DayNightSwitch />);
    expect(container).toBeEmptyDOMElement();
    act(() => useDeviceStore.getState().setQualityTier("LOW"));
    rerender(<DayNightSwitch />);
    expect(screen.getByRole("radiogroup", { name: COPY.groupLabel })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
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

  describe("roving keyboard (MFW-55)", () => {
    const radio = (choice: "AUTO" | "DAY" | "NIGHT") => screen.getByRole("radio", { name: COPY[choice] });
    const renderHigh = () => {
      useDeviceStore.getState().setQualityTier("HIGH");
      render(<DayNightSwitch />);
    };

    it("only the checked radio is a tab stop", () => {
      renderHigh();
      expect(radio("AUTO").tabIndex).toBe(0);
      expect(radio("DAY").tabIndex).toBe(-1);
      expect(radio("NIGHT").tabIndex).toBe(-1);
    });

    it("ArrowRight moves to the next choice, focuses it and stores it", () => {
      renderHigh();
      fireEvent.keyDown(radio("AUTO"), { key: "ArrowRight" });
      expect(radio("DAY")).toHaveAttribute("aria-checked", "true");
      expect(document.activeElement).toBe(radio("DAY"));
      expect(useDeviceStore.getState().lightPresetChoice).toBe("DAY");
      expect(localStorage.getItem(LIGHT_PRESET_STORAGE_KEY)).toBe("DAY");
      expect(radio("DAY").tabIndex).toBe(0);
      expect(radio("AUTO").tabIndex).toBe(-1);
    });

    it("ArrowLeft wraps from the first to the last", () => {
      renderHigh();
      fireEvent.keyDown(radio("AUTO"), { key: "ArrowLeft" });
      expect(radio("NIGHT")).toHaveAttribute("aria-checked", "true");
      expect(document.activeElement).toBe(radio("NIGHT"));
      expect(useDeviceStore.getState().lightPresetChoice).toBe("NIGHT");
    });

    it("ArrowDown / ArrowUp act like Right / Left", () => {
      renderHigh();
      fireEvent.keyDown(radio("AUTO"), { key: "ArrowDown" });
      expect(radio("DAY")).toHaveAttribute("aria-checked", "true");
      expect(document.activeElement).toBe(radio("DAY"));
      fireEvent.keyDown(radio("DAY"), { key: "ArrowUp" });
      expect(radio("AUTO")).toHaveAttribute("aria-checked", "true");
      expect(document.activeElement).toBe(radio("AUTO"));
      fireEvent.keyDown(radio("AUTO"), { key: "ArrowUp" });
      expect(radio("NIGHT")).toHaveAttribute("aria-checked", "true");
      fireEvent.keyDown(radio("NIGHT"), { key: "ArrowDown" });
      expect(radio("AUTO")).toHaveAttribute("aria-checked", "true");
    });

    it("Home and End jump to the first and last", () => {
      renderHigh();
      fireEvent.click(radio("DAY"));
      fireEvent.keyDown(radio("DAY"), { key: "End" });
      expect(radio("NIGHT")).toHaveAttribute("aria-checked", "true");
      expect(document.activeElement).toBe(radio("NIGHT"));
      expect(localStorage.getItem(LIGHT_PRESET_STORAGE_KEY)).toBe("NIGHT");
      fireEvent.keyDown(radio("NIGHT"), { key: "Home" });
      expect(radio("AUTO")).toHaveAttribute("aria-checked", "true");
      expect(document.activeElement).toBe(radio("AUTO"));
      expect(useDeviceStore.getState().lightPresetChoice).toBe("AUTO");
      expect(localStorage.getItem(LIGHT_PRESET_STORAGE_KEY)).toBeNull();
    });

    it("other keys do nothing", () => {
      renderHigh();
      const notPrevented = fireEvent.keyDown(radio("AUTO"), { key: "a" });
      fireEvent.keyDown(radio("AUTO"), { key: "constructor" });
      expect(notPrevented).toBe(true);
      expect(radio("AUTO")).toHaveAttribute("aria-checked", "true");
      expect(useDeviceStore.getState().lightPresetChoice).toBe("AUTO");
      expect(localStorage.getItem(LIGHT_PRESET_STORAGE_KEY)).toBeNull();
    });
  });
});
