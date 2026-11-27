import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INSPECT_POPUP_COPY as COPY } from "@/config/inspect.config";
import type { ReportSession, ReportSubmitOutcome } from "@/services/api/reportClient";
import { WishReportControl } from "./WishReportControl";

afterEach(cleanup);
const ID = "950118ce-7d93-4cb6-bd84-44d91c5de9e3";

function fakeSession(reported = false) {
  let resolve!: (o: ReportSubmitOutcome) => void;
  const submit = vi.fn(() => new Promise<ReportSubmitOutcome>((r) => { resolve = r; }));
  const session: ReportSession = { hasReported: vi.fn(() => reported), submit };
  return { session, submit, resolve: (o: ReportSubmitOutcome) => act(async () => resolve(o)) };
}
const btn = (name: string) => screen.getByRole("button", { name });

describe("WishReportControl (MFW-80)", () => {
  it("R1: icon variant is one flag button with no text; confirm prompt and cancel report the active state", () => {
    const { session, submit } = fakeSession();
    const onActiveChange = vi.fn();
    render(<WishReportControl creationId={ID} session={session} variant="icon" onActiveChange={onActiveChange} />);
    const button = btn(COPY.report);
    expect(button.querySelector('svg[data-glyph="flag"]')).not.toBeNull();
    expect(button.textContent).toBe("");
    expect(onActiveChange).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(screen.getByText(COPY.reportPrompt)).toBeInTheDocument();
    expect(onActiveChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(btn(COPY.reportCancel));
    expect(onActiveChange).toHaveBeenLastCalledWith(false);
    expect(submit).not.toHaveBeenCalled();
  });

  it("R2: icon variant renders nothing when already reported", () => {
    const { session } = fakeSession(true);
    const { container } = render(<WishReportControl creationId={ID} session={session} variant="icon" />);
    expect(container.innerHTML).toBe("");
  });

  it("R3: confirm submits the id; received shows the thanks and ends the active state", async () => {
    const { session, submit, resolve } = fakeSession();
    const onActiveChange = vi.fn();
    render(<WishReportControl creationId={ID} session={session} variant="icon" onActiveChange={onActiveChange} />);
    fireEvent.click(btn(COPY.report));
    fireEvent.click(btn(COPY.reportConfirm));
    expect(submit).toHaveBeenCalledWith(ID);
    await resolve("received");
    expect(screen.getByText(COPY.reportReceived)).toBeInTheDocument();
    expect(onActiveChange).toHaveBeenLastCalledWith(false);
  });

  it("R4: a failed report shows retry and stays active", async () => {
    const { session, resolve } = fakeSession();
    const onActiveChange = vi.fn();
    render(<WishReportControl creationId={ID} session={session} variant="icon" onActiveChange={onActiveChange} />);
    fireEvent.click(btn(COPY.report));
    onActiveChange.mockClear();
    fireEvent.click(btn(COPY.reportConfirm));
    await resolve("failed");
    expect(btn(COPY.reportRetry)).toBeInTheDocument();
    expect(onActiveChange).not.toHaveBeenCalledWith(false);
  });

  it("text variant keeps the labelled button", () => {
    const { session } = fakeSession();
    render(<WishReportControl creationId={ID} session={session} variant="text" />);
    expect(btn(COPY.report)).toHaveTextContent(COPY.report);
  });
});
