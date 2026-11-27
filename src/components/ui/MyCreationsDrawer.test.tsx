import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MY_CREATIONS_COPY as COPY } from "@/config/myCreations.config";
import type { FindMyOutcome } from "@/services/api/findMyCreation";
import type { MyCreationEntry } from "@/services/auth/myCreationsVault";
import { INITIAL_WORLD_STATE, useWorldStore } from "@/store/useWorldStore";
import { formatPickerDate, formatPickerTime, MyCreationsDrawer } from "./MyCreationsDrawer";

const NOW = Date.parse("2026-11-26T13:30:00.000Z");
const local = (y: number, m: number, d: number, h: number, mi: number) => new Date(y, m, d, h, mi).toISOString();
const entry = (n: number, zoneId: number, createdAt: string): MyCreationEntry => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  eventId: "loy_krathong",
  zoneId,
  createdAt,
  expiresAt: "2099-01-01T00:00:00.000Z",
});
const newer = entry(2, 2, local(2026, 10, 26, 21, 5));
const older = entry(1, 1, local(2026, 10, 25, 9, 40));

let entries: MyCreationEntry[];
const vault = { list: vi.fn(() => entries), subscribe: vi.fn(() => () => {}) };
const find = vi.fn<(e: MyCreationEntry) => Promise<FindMyOutcome>>();
const view = () => render(<MyCreationsDrawer vault={vault} finder={{ find }} now={() => NOW} />);
const findMyButton = () => screen.getByRole("button", { name: COPY.openButton });
const rows = () => screen.getAllByRole("listitem").map((li) => li.querySelector("button")!);
const status = () => screen.getByTestId("find-my-status");

beforeEach(() => {
  entries = [newer, older];
  vault.list.mockClear();
  find.mockReset();
  useWorldStore.setState({ ...INITIAL_WORLD_STATE, eventId: "loy_krathong" }, true);
});
afterEach(() => {
  cleanup();
  useWorldStore.setState({ ...INITIAL_WORLD_STATE }, true);
});

describe("MyCreationsDrawer (MFW-74 picker)", () => {
  it("M1 renders nothing without a world or without entries", () => {
    entries = [];
    const { container } = view();
    expect(screen.queryByRole("button", { name: COPY.openButton })).toBeNull();
    expect(container).toBeEmptyDOMElement();
    cleanup();
    entries = [newer];
    useWorldStore.setState({ eventId: null });
    expect(view().container).toBeEmptyDOMElement();
  });

  it("M2 one entry: a click finds it directly and no picker opens", async () => {
    entries = [newer];
    find.mockResolvedValue("focused");
    view();
    expect(findMyButton()).not.toHaveAttribute("aria-expanded");
    await act(async () => fireEvent.click(findMyButton()));
    expect(find).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledWith(newer);
    expect(screen.queryByTestId("my-creations-list")).toBeNull();
    expect(screen.getByTestId("my-creations")).toHaveAttribute("data-open", "false");
  });

  it("M3 two entries: the picker shows a krathong icon, an English date and a 24 h time per row, nothing else", () => {
    view();
    expect(findMyButton()).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(findMyButton());
    expect(findMyButton()).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByTestId("my-creations-list");
    expect(rows()).toHaveLength(2);
    expect(rows()[0].textContent).toBe("26 NOV 2026 21:05");
    expect(rows()[1].textContent).toBe("25 NOV 2026 09:40");
    expect(rows()[0].querySelector('svg[data-glyph="krathong"]')).not.toBeNull();
    expect(list.textContent).not.toMatch(/คุ้งน้ำ|กระทงที่|MON|TUE|WED|THU|FRI|SAT|SUN|จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์|อาทิตย์/);
    expect(list.querySelector("h1,h2,h3,p")).toBeNull();
    expect(list).toHaveAttribute("aria-label", COPY.title);
  });

  it("M4 choosing a row finds it, then closes the picker and reports found", async () => {
    find.mockResolvedValue("focused");
    view();
    fireEvent.click(findMyButton());
    await act(async () => fireEvent.click(rows()[1]));
    expect(find).toHaveBeenCalledWith(older);
    await waitFor(() => expect(screen.queryByTestId("my-creations-list")).toBeNull());
    expect(status()).toHaveAttribute("data-find-my-status", "found");
    expect(status()).toHaveTextContent(COPY.found(1));
  });

  it("M5 not found keeps the picker open; the status is screen-reader only", async () => {
    find.mockResolvedValue("not_found");
    view();
    fireEvent.click(findMyButton());
    await act(async () => fireEvent.click(rows()[0]));
    expect(screen.getByTestId("my-creations-list")).toBeInTheDocument();
    expect(status()).toHaveTextContent(COPY.notFound);
    expect(status().className).toContain("sr-only");
  });

  it("M6 Escape closes the picker and focuses the button; a second click closes it too", () => {
    view();
    fireEvent.click(findMyButton());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("my-creations-list")).toBeNull();
    expect(findMyButton()).toHaveFocus();
    fireEvent.click(findMyButton());
    expect(screen.getByTestId("my-creations-list")).toBeInTheDocument();
    fireEvent.click(findMyButton());
    expect(screen.queryByTestId("my-creations-list")).toBeNull();
  });

  it("M6b the document keydown listener is removed on close and on unmount; Escape with the picker closed leaves focus alone; a handled Escape is ignored", () => {
    const add = vi.spyOn(document, "addEventListener");
    const remove = vi.spyOn(document, "removeEventListener");
    const keydownCalls = (spy: typeof add) => spy.mock.calls.filter((c) => c[0] === "keydown").length;
    const { unmount } = view();
    expect(keydownCalls(add)).toBe(0);
    fireEvent.click(findMyButton());
    expect(keydownCalls(add)).toBe(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(keydownCalls(remove)).toBe(1);
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.activeElement).toBe(outside);
    // a handled Escape (defaultPrevented) does not close the picker or move focus
    fireEvent.click(findMyButton());
    outside.focus();
    const handled = new KeyboardEvent("keydown", { key: "Escape", cancelable: true, bubbles: true });
    handled.preventDefault();
    document.dispatchEvent(handled);
    expect(screen.getByTestId("my-creations-list")).toBeInTheDocument();
    expect(document.activeElement).toBe(outside);
    const before = keydownCalls(remove);
    unmount();
    expect(keydownCalls(remove)).toBe(before + 1);
    outside.remove();
    add.mockRestore();
    remove.mockRestore();
  });

  it("M7 date and time are device-local and independent of Intl data", () => {
    expect(formatPickerDate(local(2026, 10, 26, 21, 5))).toBe("26 NOV 2026");
    expect(formatPickerTime(local(2026, 10, 26, 21, 5))).toBe("21:05");
    expect(formatPickerDate(local(2026, 0, 3, 9, 0))).toBe("3 JAN 2026");
    expect(formatPickerTime(local(2026, 0, 3, 9, 0))).toBe("09:00");
    expect(formatPickerDate(local(2026, 11, 31, 0, 0))).toBe("31 DEC 2026");
    expect(formatPickerTime(local(2026, 11, 31, 0, 0))).toBe("00:00");
  });

  it("M8 the button is an icon only, 44 px", () => {
    view();
    const button = findMyButton();
    expect(button.textContent).toBe("");
    expect(button.querySelector('svg[data-glyph="search"]')).not.toBeNull();
    expect(button.className).toContain("min-h-11 min-w-11");
  });

  it("re-reads the list when the picker opens", () => {
    view();
    vault.list.mockClear();
    fireEvent.click(findMyButton());
    expect(vault.list).toHaveBeenCalledWith("loy_krathong", NOW);
  });

  it("not found / failed / invalid / superseded / throw set the status", async () => {
    const cases: [FindMyOutcome | "throw", string, string][] = [
      ["failed", "failed", COPY.failed],
      ["invalid", "failed", COPY.failed],
      ["superseded", "idle", ""],
      ["throw", "failed", COPY.failed],
    ];
    view();
    fireEvent.click(findMyButton());
    for (const [outcome, kind, text] of cases) {
      if (outcome === "throw") find.mockRejectedValueOnce(new Error("x"));
      else find.mockResolvedValueOnce(outcome);
      await act(async () => fireEvent.click(rows()[0]));
      await waitFor(() => expect(status()).toHaveAttribute("data-find-my-status", kind));
      expect(status().textContent).toBe(text);
    }
  });

  it("a stale result is ignored", async () => {
    const resolvers: ((o: FindMyOutcome) => void)[] = [];
    find.mockImplementation(() => new Promise((r) => resolvers.push(r)));
    view();
    fireEvent.click(findMyButton());
    fireEvent.click(rows()[0]);
    fireEvent.click(rows()[1]);
    await act(async () => resolvers[1]("not_found"));
    await act(async () => resolvers[0]("focused"));
    expect(status()).toHaveAttribute("data-find-my-status", "not_found");
  });

  it("never shows wish or coordinate data", () => {
    const { container } = view();
    fireEvent.click(findMyButton());
    for (const e of entries) expect(Object.keys(e)).toEqual(["id", "eventId", "zoneId", "createdAt", "expiresAt"]);
    expect(container.textContent).not.toMatch(/spawnProgress|coord|ขอให้/);
  });
});
