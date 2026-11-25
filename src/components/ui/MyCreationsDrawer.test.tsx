import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MY_CREATIONS_COPY as COPY } from "@/config/myCreations.config";
import type { FindMyOutcome } from "@/services/api/findMyCreation";
import type { MyCreationEntry } from "@/services/auth/myCreationsVault";
import { INITIAL_WORLD_STATE, useWorldStore } from "@/store/useWorldStore";
import { formatReleaseTime, MyCreationsDrawer } from "./MyCreationsDrawer";

const NOW = Date.parse("2026-11-25T13:30:00.000Z");
const entry = (n: number, zoneId: number, createdAt: string): MyCreationEntry => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  eventId: "loy_krathong",
  zoneId,
  createdAt,
  expiresAt: "2099-01-01T00:00:00.000Z",
});
const newer = entry(2, 2, "2026-11-25T13:05:00.000Z");
const older = entry(1, 1, "2026-11-25T12:40:00.000Z");

let entries: MyCreationEntry[];
let notify: () => void;
const vault = {
  list: vi.fn(() => entries),
  subscribe: vi.fn((l: () => void) => {
    notify = l;
    return () => {};
  }),
};
const find = vi.fn<(e: MyCreationEntry) => Promise<FindMyOutcome>>();
const now = () => NOW;
const view = (extra?: Parameters<typeof MyCreationsDrawer>[0]["renderEntryExtra"]) =>
  render(<MyCreationsDrawer vault={vault} finder={{ find }} now={now} renderEntryExtra={extra} />);
const openList = () => fireEvent.click(screen.getByRole("button", { name: COPY.openButton }));
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

describe("MyCreationsDrawer", () => {
  it("renders nothing without a world", () => {
    useWorldStore.setState({ eventId: null });
    const { container } = view();
    expect(container).toBeEmptyDOMElement();
  });

  it("one closed button", () => {
    view();
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName(COPY.openButton);
    expect(buttons[0]).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("my-creations-list")).toBeNull();
  });

  it("shows the empty state", () => {
    entries = [];
    view();
    openList();
    expect(screen.getByText(COPY.empty)).toBeInTheDocument();
    expect(screen.getByText(COPY.deviceOnly)).toBeInTheDocument();
  });

  it("lists entries newest first", () => {
    view();
    openList();
    const labels = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(labels).toEqual([
      COPY.itemLabel(2, 2, formatReleaseTime(newer.createdAt)),
      COPY.itemLabel(1, 1, formatReleaseTime(older.createdAt)),
    ]);
  });

  it("re-reads the list when opened", () => {
    view();
    vault.list.mockClear();
    openList();
    expect(vault.list).toHaveBeenCalledWith("loy_krathong", NOW);
    expect(vault.list).toHaveBeenCalledTimes(1);
  });

  it("updates when a creation is recorded", () => {
    entries = [];
    view();
    openList();
    entries = [older];
    act(() => notify());
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("selecting an entry finds it", async () => {
    let resolve!: (o: FindMyOutcome) => void;
    find.mockReturnValue(new Promise((r) => (resolve = r)));
    view();
    openList();
    fireEvent.click(screen.getAllByRole("listitem")[0].querySelector("button")!);
    expect(find).toHaveBeenCalledWith(newer);
    expect(status()).toHaveAttribute("data-find-my-status", "searching");
    expect(status()).toHaveTextContent(COPY.searching);
    await act(async () => resolve("focused"));
    expect(status()).toHaveAttribute("data-find-my-status", "found");
    expect(status()).toHaveTextContent(COPY.found(2));
    expect(screen.getByTestId("my-creations")).toHaveAttribute("data-open", "false");
  });

  it("not found / failed / invalid / superseded / throw", async () => {
    const cases: [FindMyOutcome | "throw", string, string][] = [
      ["not_found", "not_found", COPY.notFound],
      ["failed", "failed", COPY.failed],
      ["invalid", "failed", COPY.failed],
      ["superseded", "idle", ""],
      ["throw", "failed", COPY.failed],
    ];
    view();
    for (const [outcome, kind, text] of cases) {
      if (outcome === "throw") find.mockRejectedValueOnce(new Error("x"));
      else find.mockResolvedValueOnce(outcome);
      if (!screen.queryByTestId("my-creations-list")) openList();
      await act(async () => fireEvent.click(screen.getAllByRole("listitem")[0].querySelector("button")!));
      await waitFor(() => expect(status()).toHaveAttribute("data-find-my-status", kind));
      expect(status().textContent).toBe(text);
    }
  });

  it("a stale result is ignored", async () => {
    const resolvers: ((o: FindMyOutcome) => void)[] = [];
    find.mockImplementation(() => new Promise((r) => resolvers.push(r)));
    view();
    openList();
    const buttons = () => screen.getAllByRole("listitem").map((li) => li.querySelector("button")!);
    fireEvent.click(buttons()[0]);
    fireEvent.click(buttons()[1]);
    await act(async () => resolvers[1]("not_found"));
    await act(async () => resolvers[0]("focused"));
    expect(status()).toHaveAttribute("data-find-my-status", "not_found");
  });

  it("renderEntryExtra", () => {
    view((e) => <span data-testid="extra">{e.zoneId}</span>);
    openList();
    for (const li of screen.getAllByRole("listitem")) expect(li.querySelector('[data-testid="extra"]')).not.toBeNull();
  });

  it("has no animation classes", () => {
    const { container } = view();
    openList();
    for (const el of container.querySelectorAll("*")) expect(el.getAttribute("class") ?? "").not.toMatch(/\b(transition|animate)/);
  });

  it("never shows wish or coordinate data", () => {
    const { container } = view();
    openList();
    for (const e of entries) expect(Object.keys(e)).toEqual(["id", "eventId", "zoneId", "createdAt", "expiresAt"]);
    expect(container.textContent).not.toMatch(/spawnProgress|coord|ขอให้/);
  });
});
