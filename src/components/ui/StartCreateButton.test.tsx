import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHRISTMAS_COPY } from "@/config/events/christmas.copy";
import { LOY_KRATHONG_COPY } from "@/config/events/loyKrathong.copy";
import { EventCopyProvider } from "./EventCopyContext";
import { StartCreateButton } from "./StartCreateButton";

afterEach(cleanup);

describe("StartCreateButton (MFW-154)", () => {
  it("SC1 the Loy label is the accessible name and it is the primary action", () => {
    render(
      <EventCopyProvider eventId="loy_krathong">
        <StartCreateButton onPress={vi.fn()} />
      </EventCopyProvider>,
    );
    const button = screen.getByRole("button", { name: LOY_KRATHONG_COPY.create.start });
    expect(button).toHaveAttribute("data-ui-emphasis", "primary");
    expect(button).not.toHaveAttribute("aria-label");
  });

  it("SC2 another event gets its own label", () => {
    render(
      <EventCopyProvider eventId="christmas">
        <StartCreateButton onPress={vi.fn()} />
      </EventCopyProvider>,
    );
    expect(screen.getByRole("button", { name: CHRISTMAS_COPY.create.start })).toBeInTheDocument();
  });

  it("SC3 one click calls onPress once; the target is at least 44 px", () => {
    const onPress = vi.fn();
    render(
      <EventCopyProvider eventId="loy_krathong">
        <StartCreateButton onPress={onPress} />
      </EventCopyProvider>,
    );
    const button = screen.getByRole("button", { name: LOY_KRATHONG_COPY.create.start });
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(button.classList).toContain("min-h-11");
    expect(button.classList).toContain("min-w-11");
  });
});
