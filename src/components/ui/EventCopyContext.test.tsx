import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EventCopyProvider, useEventCopy } from "./EventCopyContext";

afterEach(cleanup);

function Probe() {
  return <p data-testid="probe">{useEventCopy().customizer.panelLabel}</p>;
}

describe("EventCopyContext", () => {
  it("EP1: without a provider it shows the Loy text", () => {
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("แต่งกระทง");
  });

  it("EP2: under the christmas provider it shows the christmas text", () => {
    render(
      <EventCopyProvider eventId="christmas">
        <Probe />
      </EventCopyProvider>,
    );
    expect(screen.getByTestId("probe")).toHaveTextContent("แต่งของประดับ");
  });

  it("EP3: an event without a row, or null, falls back to Loy", () => {
    render(
      <EventCopyProvider eventId="new_year">
        <Probe />
      </EventCopyProvider>,
    );
    expect(screen.getByTestId("probe")).toHaveTextContent("แต่งกระทง");
    cleanup();
    render(
      <EventCopyProvider eventId={null}>
        <Probe />
      </EventCopyProvider>,
    );
    expect(screen.getByTestId("probe")).toHaveTextContent("แต่งกระทง");
  });
});
