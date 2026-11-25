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
});
