import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WISH_SWITCH_COPY } from "@/config/wish.config";
import { WishVisibilitySwitch } from "./WishVisibilitySwitch";

afterEach(cleanup);

const sw = () => screen.getByRole("switch", { name: WISH_SWITCH_COPY.label });

describe("WishVisibilitySwitch", () => {
  it("is a labelled switch described by the helper text", () => {
    render(<WishVisibilitySwitch checked={false} onToggle={vi.fn()} animate={false} />);
    expect(sw()).toHaveAttribute("aria-checked", "false");
    expect(sw()).toHaveAccessibleDescription(expect.stringContaining(WISH_SWITCH_COPY.helper));
    expect(screen.getByTestId("wish-visibility-switch")).toHaveAttribute("data-checked", "false");
  });

  it("reflects the checked state", () => {
    render(<WishVisibilitySwitch checked onToggle={vi.fn()} animate={false} />);
    expect(sw()).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("wish-visibility-switch")).toHaveAttribute("data-checked", "true");
  });

  it("a click calls onToggle once", () => {
    const onToggle = vi.fn();
    render(<WishVisibilitySwitch checked={false} onToggle={onToggle} animate={false} />);
    fireEvent.click(sw());
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("disabled ignores clicks", () => {
    const onToggle = vi.fn();
    render(<WishVisibilitySwitch checked={false} onToggle={onToggle} disabled animate={false} />);
    expect(sw()).toBeDisabled();
    fireEvent.click(sw());
    expect(onToggle).not.toHaveBeenCalled();
    expect(sw()).not.toHaveAttribute("aria-busy");
  });

  it("busy sets aria-busy and disables", () => {
    const onToggle = vi.fn();
    render(<WishVisibilitySwitch checked onToggle={onToggle} busy animate={false} />);
    expect(sw()).toHaveAttribute("aria-busy", "true");
    expect(sw()).toBeDisabled();
    fireEvent.click(sw());
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("appends extra description ids after the helper", () => {
    render(
      <>
        <WishVisibilitySwitch checked={false} onToggle={vi.fn()} animate={false} describedBy="extra-status" />
        <p id="extra-status">saved</p>
      </>,
    );
    expect(sw()).toHaveAccessibleDescription(`${WISH_SWITCH_COPY.helper} saved`);
  });

  it("animate={false} has no transition class anywhere; animate adds colour transitions only on the button", () => {
    const { container, unmount } = render(<WishVisibilitySwitch checked onToggle={vi.fn()} animate={false} />);
    for (const el of container.querySelectorAll("*")) expect(el.getAttribute("class") ?? "").not.toMatch(/transition/);
    unmount();
    render(<WishVisibilitySwitch checked onToggle={vi.fn()} animate />);
    expect(sw().className).toContain("transition-colors");
    expect(sw().querySelector("span")!.className).not.toMatch(/transition/);
  });

  it("has a 44 px touch target", () => {
    render(<WishVisibilitySwitch checked={false} onToggle={vi.fn()} animate={false} />);
    expect(sw().className).toContain("min-h-11");
    expect(sw().className).toContain("min-w-11");
  });

  it("MFW-83: the knob has an equal inset on both sides in both states and sits fully inside the track", () => {
    const px = (cls: string, prefix: string) => {
      const m = cls.split(" ").map((c) => c.match(new RegExp(`^${prefix}(\\d+)$`))).find(Boolean);
      return Number(m![1]) * 4; // Tailwind spacing step = 4 px
    };
    for (const checked of [false, true]) {
      const { unmount } = render(<WishVisibilitySwitch checked={checked} onToggle={vi.fn()} animate={false} />);
      const track = sw().className;
      const knob = screen.getByTestId("wish-switch-knob").className;
      expect(knob).toContain("absolute");
      const trackW = px(track, "w-");
      const trackH = px(track, "h-");
      const size = px(knob, "size-");
      const left = px(knob, "left-") + (checked ? px(knob, "translate-x-") : 0);
      const right = trackW - left - size;
      const top = px(knob, "top-");
      const bottom = trackH - top - size;
      const rest = checked ? right : left; // the inset on the side the knob rests against
      const other = checked ? left : right;
      expect(top).toBe(bottom);
      expect(rest).toBe(top); // the same inset as top and bottom, in both states
      expect(rest).toBeGreaterThan(0); // fully inside, never touching or crossing the edge
      expect(other).toBe(trackW - 2 * top - size + top); // the travel is exactly track - knob - 2 × inset
      unmount();
    }
  });
});
