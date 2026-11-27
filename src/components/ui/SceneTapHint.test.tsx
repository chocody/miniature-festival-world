import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CHRISTMAS_COPY } from "@/config/events/christmas.copy";
import { SCENE_TAP_HINT_COPY } from "@/config/gimmicks.config";
import { EventCopyProvider } from "./EventCopyContext";
import { SceneTapHint } from "./SceneTapHint";

afterEach(cleanup);

describe("SceneTapHint", () => {
  it("pulses unless reduced motion, and never takes a tap", () => {
    const { rerender } = render(<SceneTapHint reducedMotion={false} />);
    const el = screen.getByTestId("scene-tap-hint");
    expect(el).toHaveTextContent(SCENE_TAP_HINT_COPY.scene3d);
    expect(el).toHaveAttribute("role", "status");
    expect(el.className).toContain("pointer-events-none");
    expect(el).toHaveAttribute("data-motion", "pulse");
    expect(el.className).toContain("animate-pulse");
    rerender(<SceneTapHint reducedMotion />);
    const still = screen.getByTestId("scene-tap-hint");
    expect(still).toHaveAttribute("data-motion", "static");
    expect(still.className).not.toContain("animate-pulse");
    expect(still.className).toContain("pointer-events-none");
  });

  it("CC7 (MFW-91): shows the christmas text under the christmas provider", () => {
    render(
      <EventCopyProvider eventId="christmas">
        <SceneTapHint reducedMotion={false} />
      </EventCopyProvider>,
    );
    expect(screen.getByTestId("scene-tap-hint")).toHaveTextContent(CHRISTMAS_COPY.sceneTapHint);
  });
});
