import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INSPECT_POPUP_COPY as COPY } from "@/config/inspect.config";
import { DEFAULT_KRATHONG_APPEARANCE } from "@/core/customization";
import type { ReportSession, ReportSubmitOutcome } from "@/services/api/reportClient";
import { InspectPopup } from "./InspectPopup";
import { describeKrathongAppearance } from "./krathongAppearanceSummary";

afterEach(cleanup);

const ID = "950118ce-7d93-4cb6-bd84-44d91c5de9e3";
const creation = (wish: string | null = "ขอให้ครอบครัวมีความสุข") => ({ id: ID, appearance: DEFAULT_KRATHONG_APPEARANCE, publicWishText: wish });

function fakeSession(reported = false) {
  let resolve!: (o: ReportSubmitOutcome) => void;
  const submit = vi.fn(() => new Promise<ReportSubmitOutcome>((r) => { resolve = r; }));
  const session: ReportSession = { hasReported: vi.fn(() => reported), submit };
  return { session, submit, resolve: (o: ReportSubmitOutcome) => act(async () => resolve(o)) };
}
const btn = (name: string) => screen.getByRole("button", { name });

describe("InspectPopup", () => {
  it("shows the anonymous card with appearance and wish", () => {
    const { session } = fakeSession();
    const { container } = render(<InspectPopup creation={creation()} onClose={vi.fn()} reportSession={session} />);
    const dialog = screen.getByRole("dialog", { name: COPY.dialogTitle });
    expect(dialog).toHaveTextContent(COPY.anonymousNote);
    for (const row of describeKrathongAppearance(DEFAULT_KRATHONG_APPEARANCE)) {
      expect(dialog).toHaveTextContent(row.label);
      expect(dialog).toHaveTextContent(row.value);
    }
    expect(dialog).toHaveTextContent("ขอให้ครอบครัวมีความสุข");
    expect(document.activeElement).toBe(dialog);
    expect(container.textContent).not.toContain(ID);
    expect(container.innerHTML).not.toContain(ID);
  });

  it("shows HTML as text", () => {
    const wish = "<b>bold</b><img src=x onerror=alert(1)>";
    const { session } = fakeSession();
    const { container } = render(<InspectPopup creation={creation(wish)} onClose={vi.fn()} reportSession={session} />);
    expect(screen.getByText(wish)).toBeInTheDocument();
    expect(container.querySelector("b, img")).toBeNull();
  });

  it("offers no report without a public wish", () => {
    const { session, submit } = fakeSession();
    render(<InspectPopup creation={creation(null)} onClose={vi.fn()} reportSession={session} />);
    expect(screen.getByText(COPY.noPublicWish)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: COPY.report })).toBeNull();
    expect(submit).not.toHaveBeenCalled();
  });

  it("confirms, sends and shows received", async () => {
    const { session, submit, resolve } = fakeSession();
    render(<InspectPopup creation={creation()} onClose={vi.fn()} reportSession={session} />);
    fireEvent.click(btn(COPY.report));
    expect(screen.getByText(COPY.reportPrompt)).toBeInTheDocument();
    fireEvent.click(btn(COPY.reportConfirm));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith(ID);
    expect(btn(COPY.reportSending)).toBeDisabled();
    await resolve("received");
    expect(screen.getByText(COPY.reportReceived)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: COPY.report })).toBeNull();
  });

  it("cancel returns to the report button without sending", () => {
    const { session, submit } = fakeSession();
    render(<InspectPopup creation={creation()} onClose={vi.fn()} reportSession={session} />);
    fireEvent.click(btn(COPY.report));
    fireEvent.click(btn(COPY.reportCancel));
    expect(btn(COPY.report)).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });

  it("failure offers a retry", async () => {
    const { session, submit, resolve } = fakeSession();
    render(<InspectPopup creation={creation()} onClose={vi.fn()} reportSession={session} />);
    fireEvent.click(btn(COPY.report));
    fireEvent.click(btn(COPY.reportConfirm));
    await resolve("failed");
    expect(screen.getByText(COPY.reportFailed)).toBeInTheDocument();
    fireEvent.click(btn(COPY.reportRetry));
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it("starts as received when already reported", () => {
    const { session } = fakeSession(true);
    render(<InspectPopup creation={creation()} onClose={vi.fn()} reportSession={session} />);
    expect(screen.getByText(COPY.reportReceived)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: COPY.report })).toBeNull();
  });

  it("closes from the button and Escape", () => {
    const { session } = fakeSession();
    const onClose = vi.fn();
    render(<InspectPopup creation={creation()} onClose={onClose} reportSession={session} />);
    fireEvent.click(btn(COPY.close));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("has touch-sized buttons and no animation classes", () => {
    const { session } = fakeSession();
    const { container } = render(<InspectPopup creation={creation()} onClose={vi.fn()} reportSession={session} />);
    for (const b of container.querySelectorAll("button")) {
      expect(b.className).toContain("min-h-11");
      expect(b.className).toContain("min-w-11");
    }
    for (const el of container.querySelectorAll("*")) expect(el.className.toString()).not.toMatch(/\banimate-|\btransition\b/);
  });
});
