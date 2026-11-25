import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INSPECT_POPUP_COPY as COPY } from "@/config/inspect.config";
import { OWNER_WISH_COPY } from "@/config/ownerWish.config";
import { DISPLAY_NAME_FALLBACK } from "@/config/wish.config";
import { DEFAULT_KRATHONG_APPEARANCE } from "@/core/customization";
import type { ReportSession, ReportSubmitOutcome } from "@/services/api/reportClient";
import { InspectPopup } from "./InspectPopup";
import { describeKrathongAppearance } from "./krathongAppearanceSummary";

afterEach(cleanup);

const ID = "950118ce-7d93-4cb6-bd84-44d91c5de9e3";
const NAME = "น้องมะลิ";
const creation = (wish: string | null = "ขอให้ครอบครัวมีความสุข", displayName: string | null = wish === null ? null : NAME) => ({
  id: ID,
  appearance: DEFAULT_KRATHONG_APPEARANCE,
  publicWishText: wish,
  displayName,
});

function fakeSession(reported = false) {
  let resolve!: (o: ReportSubmitOutcome) => void;
  const submit = vi.fn(() => new Promise<ReportSubmitOutcome>((r) => { resolve = r; }));
  const session: ReportSession = { hasReported: vi.fn(() => reported), submit };
  return { session, submit, resolve: (o: ReportSubmitOutcome) => act(async () => resolve(o)) };
}
const btn = (name: string) => screen.getByRole("button", { name });

describe("InspectPopup", () => {
  it("open wish shows name, wish and Report", () => {
    const { session } = fakeSession();
    const { container } = render(<InspectPopup creation={creation()} onClose={vi.fn()} reportSession={session} />);
    const dialog = screen.getByRole("dialog", { name: COPY.dialogTitle });
    expect(screen.getByTestId("inspect-display-name")).toHaveTextContent(`${COPY.fromLabel} ${NAME}`);
    expect(dialog).toHaveTextContent(COPY.wishHeading);
    expect(btn(COPY.report)).toBeInTheDocument();
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

  it("closed wish shows only the krathong", () => {
    const { session, submit } = fakeSession();
    render(<InspectPopup creation={creation(null)} onClose={vi.fn()} reportSession={session} />);
    const dialog = screen.getByRole("dialog", { name: COPY.dialogTitle });
    for (const row of describeKrathongAppearance(DEFAULT_KRATHONG_APPEARANCE)) {
      expect(dialog).toHaveTextContent(row.label);
      expect(dialog).toHaveTextContent(row.value);
    }
    expect(dialog).not.toHaveTextContent(COPY.wishHeading);
    expect(dialog).not.toHaveTextContent(DISPLAY_NAME_FALLBACK);
    expect(dialog).not.toHaveTextContent(COPY.fromLabel);
    expect(screen.queryByTestId("inspect-display-name")).toBeNull();
    expect(screen.queryByRole("button", { name: COPY.report })).toBeNull();
    expect(submit).not.toHaveBeenCalled();
  });

  it("open wish without a name shows ไม่ระบุชื่อ", () => {
    const { session } = fakeSession();
    render(<InspectPopup creation={creation("ขอให้สมหวัง", null)} onClose={vi.fn()} reportSession={session} />);
    expect(screen.getByTestId("inspect-display-name")).toHaveTextContent(DISPLAY_NAME_FALLBACK);
  });

  it("a name is never shown without an open wish", () => {
    const { session } = fakeSession();
    render(<InspectPopup creation={creation(null, "x-bogus-name")} onClose={vi.fn()} reportSession={session} />);
    expect(screen.getByRole("dialog")).not.toHaveTextContent("x-bogus-name");
    expect(screen.queryByTestId("inspect-display-name")).toBeNull();
  });

  it("shows a name with HTML as text", () => {
    const { session } = fakeSession();
    const { container } = render(
      <InspectPopup creation={creation("ขอให้สมหวัง", "<b>n</b>")} onClose={vi.fn()} reportSession={session} />,
    );
    expect(screen.getByTestId("inspect-display-name")).toHaveTextContent("<b>n</b>");
    expect(container.querySelector("b")).toBeNull();
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

describe("InspectPopup owner section (MFW-31)", () => {
  it("AC1: no owner section by default", () => {
    const { session } = fakeSession();
    render(<InspectPopup creation={creation(null)} onClose={vi.fn()} reportSession={session} />);
    const dialog = screen.getByRole("dialog");
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([COPY.close]);
    expect(dialog).not.toHaveTextContent(OWNER_WISH_COPY.heading);
  });

  it("renders the owner section inside the dialog after the wish and before Report", () => {
    const { session } = fakeSession();
    const wishText = "ขอให้ครอบครัวมีความสุข";
    render(<InspectPopup creation={creation(wishText)} onClose={vi.fn()} reportSession={session} ownerSection={<p>owner-slot</p>} />);
    const dialog = screen.getByRole("dialog");
    const slot = screen.getByText("owner-slot");
    const wish = screen.getByText(wishText);
    expect(dialog).toContainElement(slot);
    expect(wish.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(slot.compareDocumentPosition(btn(COPY.report)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders the owner section for a closed wish after the appearance", () => {
    const { session } = fakeSession();
    render(<InspectPopup creation={creation(null)} onClose={vi.fn()} reportSession={session} ownerSection={<p>owner-slot</p>} />);
    expect(screen.getByRole("dialog")).toContainElement(screen.getByText("owner-slot"));
  });
});
