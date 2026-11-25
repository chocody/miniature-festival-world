import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NO_ACTIVE_EVENT_COPY } from "@/config/noActiveEvent.config";
import { NoActiveEventScreen } from "./NoActiveEventScreen";

afterEach(cleanup);

const CHRISTMAS = { eventId: "christmas", name: "Christmas", nameTh: "คริสต์มาส", datesLabel: "20–26 ธ.ค. 2026" } as const;

describe("NoActiveEventScreen", () => {
  it("shows the nearest festival's name and dates and nothing to do", () => {
    const { container } = render(<NoActiveEventScreen festival={CHRISTMAS} />);
    expect(screen.getByRole("region", { name: NO_ACTIVE_EVENT_COPY.regionLabel })).toHaveAttribute(
      "data-nearest-event",
      "christmas",
    );
    expect(screen.getByRole("heading", { name: "คริสต์มาส" })).toBeInTheDocument();
    expect(screen.getByText("Christmas")).toBeInTheDocument();
    expect(screen.getByText("20–26 ธ.ค. 2026")).toBeInTheDocument();
    expect(screen.getByText(NO_ACTIVE_EVENT_COPY.lead)).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(container.querySelector("form")).toBeNull();
    expect(screen.queryByText("Coming Soon")).toBeNull();
  });

  it("omits the dates line when there is no label", () => {
    render(<NoActiveEventScreen festival={{ ...CHRISTMAS, datesLabel: null }} />);
    expect(screen.queryByTestId("no-active-event-dates")).toBeNull();
  });

  it("without a festival shows the lead line only", () => {
    render(<NoActiveEventScreen festival={null} />);
    expect(screen.getByText(NO_ACTIVE_EVENT_COPY.lead)).toBeInTheDocument();
    expect(screen.queryByRole("heading")).toBeNull();
  });
});
