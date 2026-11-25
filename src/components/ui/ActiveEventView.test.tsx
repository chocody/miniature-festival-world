import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getEventConfig } from "@/config/events";
import { NO_ACTIVE_EVENT_COPY } from "@/config/noActiveEvent.config";
import { ActiveEventView } from "./ActiveEventView";

vi.mock("./FlowRoot", () => ({
  FlowRoot: ({ eventId }: { eventId: string }) => <div data-testid="flow-root" data-event={eventId} />,
}));

afterEach(cleanup);

describe("ActiveEventView", () => {
  it("active → FlowRoot for that event", () => {
    render(<ActiveEventView resolution={{ kind: "active", eventId: "loy_krathong", source: "override" }} />);
    expect(screen.getByTestId("flow-root")).toHaveAttribute("data-event", "loy_krathong");
    expect(screen.queryByTestId("no-active-event")).toBeNull();
  });

  it("none → calm screen with the nearest festival", () => {
    const window = getEventConfig("christmas")!.dateWindows[0];
    render(<ActiveEventView resolution={{ kind: "none", nearest: { eventId: "christmas", window } }} />);
    expect(screen.getByText("คริสต์มาส")).toBeInTheDocument();
    expect(screen.getByText("20–26 ธ.ค. 2026")).toBeInTheDocument();
    expect(screen.queryByTestId("flow-root")).toBeNull();
  });

  it("none without a nearest festival → lead line only", () => {
    render(<ActiveEventView resolution={{ kind: "none", nearest: null }} />);
    expect(screen.getByText(NO_ACTIVE_EVENT_COPY.lead)).toBeInTheDocument();
    expect(screen.queryByRole("heading")).toBeNull();
  });
});
