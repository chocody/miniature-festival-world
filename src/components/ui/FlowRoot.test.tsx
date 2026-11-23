import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useUIStore } from "@/store/useUIStore";
import { FlowRoot } from "./FlowRoot";

afterEach(cleanup);

beforeEach(() => {
  useUIStore.setState(useUIStore.getInitialState(), true);
});

const stateOf = (container: HTMLElement) =>
  container.querySelector("[data-flow-state]")?.getAttribute("data-flow-state");

describe("FlowRoot", () => {
  it("clicks through all 5 states", () => {
    const { container } = render(<FlowRoot />);
    expect(stateOf(container)).toBe("LANDING_EVENT_SELECT");
    fireEvent.click(screen.getByRole("button", { name: /Loy Krathong/ }));
    expect(stateOf(container)).toBe("CUSTOMIZE_OBJECT");
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(stateOf(container)).toBe("WRITE_WISH");
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(stateOf(container)).toBe("RITUAL_RELEASE");
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(stateOf(container)).toBe("SHARED_WORLD_EXPLORE");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("clicking a Coming Soon festival keeps landing", () => {
    const { container } = render(<FlowRoot />);
    fireEvent.click(screen.getByRole("button", { name: /Christmas/ }));
    expect(stateOf(container)).toBe("LANDING_EVENT_SELECT");
  });
});
