import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MIN_TOUCH_TARGET_PX } from "@/config/customizer.config";
import { WORLD_VIEW_ROTATE_BUTTON_COPY } from "@/config/interaction.config";
import { WorldRotateButton } from "./WorldRotateButton";

afterEach(cleanup);

describe("WorldRotateButton (MFW-57)", () => {
  it("is a labelled touch-sized button that rotates once per click", () => {
    const onRotate = vi.fn();
    render(<WorldRotateButton onRotate={onRotate} />);
    const button = screen.getByRole("button", { name: WORLD_VIEW_ROTATE_BUTTON_COPY.ariaLabel });
    expect(button).toHaveTextContent(WORLD_VIEW_ROTATE_BUTTON_COPY.label);
    expect(button).toHaveAttribute("type", "button");
    expect(button.style.minWidth).toBe(`${MIN_TOUCH_TARGET_PX}px`);
    expect(button.style.minHeight).toBe(`${MIN_TOUCH_TARGET_PX}px`);
    fireEvent.click(button);
    expect(onRotate).toHaveBeenCalledTimes(1);
  });
});
