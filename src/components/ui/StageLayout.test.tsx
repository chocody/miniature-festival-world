import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OverlaySlot, STAGE_LAYOUT_CLASSES, type OverlaySlotKind } from "./StageLayout";

afterEach(cleanup);

const SLOTS: readonly OverlaySlotKind[] = ["top", "panel", "dialog", "sheet", "debug"];

describe("StageLayout (MFW-54, backlog 10.2)", () => {
  it("OverlaySlot renders its slot hook, its class and its children", () => {
    for (const slot of SLOTS) {
      render(
        <OverlaySlot slot={slot}>
          <span>{`child-${slot}`}</span>
        </OverlaySlot>,
      );
      const el = screen.getByText(`child-${slot}`).parentElement!;
      expect(el).toHaveAttribute("data-overlay-slot", slot);
      expect(el.className).toBe(STAGE_LAYOUT_CLASSES[slot]);
    }
  });

  it("the overlay layer lets touches through; every slot takes its own (AC4)", () => {
    expect(STAGE_LAYOUT_CLASSES.overlay.split(" ")).toContain("pointer-events-none");
    for (const slot of SLOTS) expect(STAGE_LAYOUT_CLASSES[slot].split(" ")).toContain("pointer-events-auto");
  });

  it("the root fills the viewport and never scrolls (AC1)", () => {
    const root = STAGE_LAYOUT_CLASSES.root.split(" ");
    for (const c of ["fixed", "inset-0", "h-dvh", "w-dvw", "overflow-hidden"]) expect(root).toContain(c);
  });

  it("no class animates or blocks touch scrolling", () => {
    for (const classes of Object.values(STAGE_LAYOUT_CLASSES)) {
      expect(classes).not.toMatch(/transition|animate-|touch-none/);
    }
  });

  it("every slot is inset by the safe areas it touches (AC1)", () => {
    const inset = (side: string) => `env(safe-area-inset-${side})`;
    expect(STAGE_LAYOUT_CLASSES.top).toContain(inset("top"));
    expect(STAGE_LAYOUT_CLASSES.top).toContain(inset("left"));
    expect(STAGE_LAYOUT_CLASSES.top).toContain(inset("right"));
    for (const slot of ["panel", "sheet"] as const) {
      for (const side of ["bottom", "left", "right"]) expect(STAGE_LAYOUT_CLASSES[slot]).toContain(inset(side));
    }
    for (const side of ["top", "right", "bottom", "left"]) expect(STAGE_LAYOUT_CLASSES.dialog).toContain(inset(side));
  });
});
