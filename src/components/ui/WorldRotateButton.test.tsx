import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WORLD_VIEW_ROTATE_BUTTON_COPY } from "@/config/interaction.config";
import { UI_CLASSES } from "./uiClasses";
import { WORLD_ROTATE_BUTTON_CLASSES, WorldRotateButton } from "./WorldRotateButton";

afterEach(cleanup);

describe("WorldRotateButton (MFW-57)", () => {
  it("is a labelled 44 px icon button on the veil that rotates once per click", () => {
    const onRotate = vi.fn();
    render(<WorldRotateButton onRotate={onRotate} />);
    const button = screen.getByRole("button", { name: WORLD_VIEW_ROTATE_BUTTON_COPY.ariaLabel });
    expect(button).toHaveAttribute("type", "button");
    const glyph = button.querySelector('span[aria-hidden="true"]')!;
    expect(glyph).toHaveTextContent(WORLD_VIEW_ROTATE_BUTTON_COPY.glyph);
    const classes = button.className.split(" ");
    for (const c of ["min-h-11", "min-w-11", "rounded-full", "bg-veil", "shadow-float", "fixed"]) expect(classes).toContain(c);
    expect(classes).not.toContain("bg-paper");
    expect(button.className).toBe(WORLD_ROTATE_BUTTON_CLASSES);
    expect(UI_CLASSES.iconButton).toContain("min-h-11 min-w-11");
    fireEvent.click(button);
    expect(onRotate).toHaveBeenCalledTimes(1);
  });
});
