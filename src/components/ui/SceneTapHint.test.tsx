import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SceneTapHint } from "./SceneTapHint";

describe("SceneTapHint", () => {
  it("pulses unless reduced motion, and never takes a tap", () => {
    const { rerender } = render(<SceneTapHint text="hello" reducedMotion={false} />);
    const el = screen.getByTestId("scene-tap-hint");
    expect(el).toHaveTextContent("hello");
    expect(el).toHaveAttribute("role", "status");
    expect(el.className).toContain("pointer-events-none");
    expect(el).toHaveAttribute("data-motion", "pulse");
    expect(el.className).toContain("animate-pulse");
    rerender(<SceneTapHint text="hello" reducedMotion />);
    const still = screen.getByTestId("scene-tap-hint");
    expect(still).toHaveAttribute("data-motion", "static");
    expect(still.className).not.toContain("animate-pulse");
    expect(still.className).toContain("pointer-events-none");
  });
});
