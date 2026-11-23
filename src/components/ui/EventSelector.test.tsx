import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FESTIVAL_EVENTS } from "@/config/events";
import { EVENT_FEATURE_FLAGS } from "@/config/featureFlags.config";
import { EventSelector } from "./EventSelector";

afterEach(cleanup);

describe("EventSelector", () => {
  it("renders 8 festival buttons in roadmap order", () => {
    render(<EventSelector onSelect={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(8);
    buttons.forEach((b, i) => {
      expect(b).toHaveTextContent(FESTIVAL_EVENTS[i].name);
      expect(b).toHaveTextContent(FESTIVAL_EVENTS[i].nameTh);
    });
  });

  it("Loy Krathong is enabled, has no Coming Soon, and calls onSelect", () => {
    const onSelect = vi.fn();
    render(<EventSelector onSelect={onSelect} />);
    const btn = screen.getByRole("button", { name: /Loy Krathong/ });
    expect(btn).toBeEnabled();
    expect(within(btn).queryByText("Coming Soon")).toBeNull();
    fireEvent.click(btn);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("loy_krathong");
  });

  it("the 7 others are disabled, show Coming Soon and never call onSelect", () => {
    const onSelect = vi.fn();
    render(<EventSelector onSelect={onSelect} />);
    for (const event of FESTIVAL_EVENTS.slice(1)) {
      const btn = screen.getByRole("button", { name: new RegExp(`^${event.name}`) });
      expect(btn).toBeDisabled();
      expect(within(btn).getByText("Coming Soon")).toBeInTheDocument();
      fireEvent.click(btn);
    }
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getAllByText("Coming Soon")).toHaveLength(7);
  });

  it("a flag override enables Christmas", () => {
    const onSelect = vi.fn();
    render(<EventSelector flags={{ ...EVENT_FEATURE_FLAGS, christmas: true }} onSelect={onSelect} />);
    const btn = screen.getByRole("button", { name: /Christmas/ });
    expect(btn).toBeEnabled();
    expect(within(btn).queryByText("Coming Soon")).toBeNull();
    fireEvent.click(btn);
    expect(onSelect).toHaveBeenCalledWith("christmas");
  });
});
