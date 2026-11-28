import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CHRISTMAS_COPY } from "@/config/events/christmas.copy";
import { FLOW_STEP_COPY } from "@/config/ui.config";
import { EventCopyProvider } from "./EventCopyContext";
import { FlowStepPlaceholder } from "./FlowStepPlaceholder";

afterEach(cleanup);

describe("FlowStepPlaceholder", () => {
  it("CC9: shows the Loy title without a provider", () => {
    render(<FlowStepPlaceholder step="SHARED_WORLD_EXPLORE" />);
    expect(screen.getByRole("heading", { name: FLOW_STEP_COPY.SHARED_WORLD_EXPLORE.title })).toBeInTheDocument();
  });

  it("CC9: shows the christmas title and hint under the christmas provider", () => {
    render(
      <EventCopyProvider eventId="christmas">
        <FlowStepPlaceholder step="SHARED_WORLD_EXPLORE" />
      </EventCopyProvider>,
    );
    const c = CHRISTMAS_COPY.flowSteps.SHARED_WORLD_EXPLORE;
    expect(screen.getByRole("heading", { name: c.title })).toBeInTheDocument();
    expect(screen.getByText(c.hint!)).toBeInTheDocument();
  });

  it("FP1 the action shares the heading's header row (MFW-154)", () => {
    render(<FlowStepPlaceholder step="SHARED_WORLD_EXPLORE" action={<button type="button">x</button>} />);
    const heading = screen.getByRole("heading", { name: FLOW_STEP_COPY.SHARED_WORLD_EXPLORE.title });
    expect(screen.getByRole("button", { name: "x" }).parentElement).toBe(heading.parentElement);
    cleanup();
    render(<FlowStepPlaceholder step="SHARED_WORLD_EXPLORE" />);
    expect(screen.getByRole("heading", { name: FLOW_STEP_COPY.SHARED_WORLD_EXPLORE.title })).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
