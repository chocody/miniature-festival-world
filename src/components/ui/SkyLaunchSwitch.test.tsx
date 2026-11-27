import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SKY_LAUNCH_CHOICE_STORAGE_KEY, SKY_LAUNCH_SWITCH_COPY as COPY } from "@/config/gimmicks.config";
import { useDeviceStore } from "@/store/useDeviceStore";
import { SkyLaunchSwitch } from "./SkyLaunchSwitch";

const toggle = () => screen.getByTestId("sky-launch-switch");

beforeEach(() => {
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
  localStorage.removeItem(SKY_LAUNCH_CHOICE_STORAGE_KEY);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.removeItem(SKY_LAUNCH_CHOICE_STORAGE_KEY);
});

describe("SkyLaunchSwitch (MFW-85)", () => {
  it("SW1: one icon button, no text, the firework glyph and its Thai label by default", () => {
    render(<SkyLaunchSwitch />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(toggle().textContent).toBe("");
    expect(toggle()).toHaveAttribute("aria-label", COPY.firework);
    expect(toggle()).toHaveAttribute("data-sky-launch", "firework");
    expect(toggle().querySelector('[data-glyph="firework"]')).not.toBeNull();
    expect(toggle().querySelector('[data-glyph="sky-lantern"]')).toBeNull();
  });

  it("SW2: a click switches to the lantern and stores it; the next click returns to the firework", () => {
    render(<SkyLaunchSwitch />);
    fireEvent.click(toggle());
    expect(useDeviceStore.getState().skyLaunchChoice).toBe("skyLantern");
    expect(localStorage.getItem(SKY_LAUNCH_CHOICE_STORAGE_KEY)).toBe("skyLantern");
    expect(toggle()).toHaveAttribute("aria-label", COPY.skyLantern);
    expect(toggle().querySelector('[data-glyph="sky-lantern"]')).not.toBeNull();
    expect(toggle().querySelector('[data-glyph="firework"]')).toBeNull();
    fireEvent.click(toggle());
    expect(useDeviceStore.getState().skyLaunchChoice).toBe("firework");
    expect(localStorage.getItem(SKY_LAUNCH_CHOICE_STORAGE_KEY)).toBe("firework");
  });

  it("SW3: a lantern choice in the store before render shows the lantern glyph and label", () => {
    useDeviceStore.getState().setSkyLaunchChoice("skyLantern");
    render(<SkyLaunchSwitch />);
    expect(toggle().querySelector('[data-glyph="sky-lantern"]')).not.toBeNull();
    expect(toggle()).toHaveAttribute("aria-label", COPY.skyLantern);
  });

  it("SW4: a round 44 px touch target (MIN_TOUCH_TARGET_PX)", () => {
    render(<SkyLaunchSwitch />);
    const classes = toggle().className.split(/\s+/);
    expect(classes).toContain("min-h-11");
    expect(classes).toContain("min-w-11");
    expect(classes).toContain("rounded-full");
  });

  it("SW5: storage that throws still switches the choice for the session", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    render(<SkyLaunchSwitch />);
    expect(() => fireEvent.click(toggle())).not.toThrow();
    expect(useDeviceStore.getState().skyLaunchChoice).toBe("skyLantern");
  });
});
