import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_WORLD_STATE, useWorldStore, type WorldState } from "@/store/useWorldStore";
import { ZONE_NAV_COPY, ZoneNavigator } from "./ZoneNavigator";

const pagination = { loadZone: vi.fn(async () => "loaded" as const), retry: vi.fn(async () => "loaded" as const) };
const setWorld = (partial: Partial<WorldState>) => act(() => useWorldStore.setState(partial));
const base: Partial<WorldState> = { eventId: "loy_krathong", zoneStatus: "ready" };

beforeEach(() => {
  useWorldStore.setState({ ...INITIAL_WORLD_STATE }, true);
  pagination.loadZone.mockClear();
  pagination.retry.mockClear();
});
afterEach(cleanup);

describe("ZoneNavigator", () => {
  it("renders nothing without an event", () => {
    const { container } = render(<ZoneNavigator pagination={pagination} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("1 of 1: label only, no buttons", () => {
    setWorld({ ...base, currentZoneId: 1, zoneCount: 1 });
    render(<ZoneNavigator pagination={pagination} />);
    expect(screen.getByText("คุ้งน้ำที่ 1 จาก 1")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("2 of 3: both buttons are wired", () => {
    setWorld({ ...base, currentZoneId: 2, zoneCount: 3 });
    render(<ZoneNavigator pagination={pagination} />);
    fireEvent.click(screen.getByRole("button", { name: /คุ้งน้ำก่อนหน้า/ }));
    expect(pagination.loadZone).toHaveBeenLastCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: /คุ้งน้ำถัดไป/ }));
    expect(pagination.loadZone).toHaveBeenLastCalledWith(3);
  });

  it("zone buttons are icon buttons named by the copy (MFW-55)", () => {
    setWorld({ ...base, currentZoneId: 2, zoneCount: 3 });
    render(<ZoneNavigator pagination={pagination} />);
    const up = screen.getByRole("button", { name: ZONE_NAV_COPY.upstream });
    const down = screen.getByRole("button", { name: ZONE_NAV_COPY.downstream });
    expect(up).toHaveAttribute("aria-label", ZONE_NAV_COPY.upstream);
    expect(down).toHaveAttribute("aria-label", ZONE_NAV_COPY.downstream);
    expect(up.querySelector('[aria-hidden="true"]')).toHaveTextContent("‹");
    expect(down.querySelector('[aria-hidden="true"]')).toHaveTextContent("›");
    expect(screen.getAllByRole("button")).toEqual([up, down]);
  });

  it("edges", () => {
    setWorld({ ...base, currentZoneId: 3, zoneCount: 3 });
    const { unmount } = render(<ZoneNavigator pagination={pagination} />);
    expect(screen.getByRole("button", { name: /คุ้งน้ำก่อนหน้า/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /คุ้งน้ำถัดไป/ })).toBeNull();
    unmount();
    setWorld({ ...base, currentZoneId: 1, zoneCount: 3 });
    render(<ZoneNavigator pagination={pagination} />);
    expect(screen.queryByRole("button", { name: /คุ้งน้ำก่อนหน้า/ })).toBeNull();
    expect(screen.getByRole("button", { name: /คุ้งน้ำถัดไป/ })).toBeInTheDocument();
  });

  it("loading text without buttons", () => {
    setWorld({ eventId: "loy_krathong", zoneStatus: "loading", currentZoneId: null, zoneCount: null });
    render(<ZoneNavigator pagination={pagination} />);
    expect(screen.getByText(ZONE_NAV_COPY.loading)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("error text with a wired retry", () => {
    setWorld({ eventId: "loy_krathong", zoneStatus: "error", currentZoneId: 1, zoneCount: 1 });
    render(<ZoneNavigator pagination={pagination} />);
    expect(screen.getByText(ZONE_NAV_COPY.error)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: ZONE_NAV_COPY.retry }));
    expect(pagination.retry).toHaveBeenCalledTimes(1);
  });

  it("exposes data attributes", () => {
    setWorld({ ...base, currentZoneId: 2, zoneCount: 3, zoneItems: [{ id: "a" }, { id: "b" }] as never });
    render(<ZoneNavigator pagination={pagination} />);
    const nav = screen.getByTestId("zone-navigator");
    expect(nav).toHaveAttribute("data-zone-id", "2");
    expect(nav).toHaveAttribute("data-zone-count", "3");
    expect(nav).toHaveAttribute("data-zone-status", "ready");
    expect(nav).toHaveAttribute("data-zone-item-count", "2");
  });

  it("uses no animation classes", () => {
    setWorld({ ...base, currentZoneId: 2, zoneCount: 3 });
    const { container } = render(<ZoneNavigator pagination={pagination} />);
    expect(container.innerHTML).not.toMatch(/animate-|transition/);
  });
});
