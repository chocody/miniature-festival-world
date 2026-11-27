import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef, type RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INSPECT_POPUP_COPY as COPY, WISH_BUBBLE_ANNOUNCE_DELAY_MS as ANNOUNCE, WISH_BUBBLE_TIMING as T } from "@/config/inspect.config";
import { DISPLAY_NAME_FALLBACK } from "@/config/wish.config";
import { DEFAULT_KRATHONG_APPEARANCE } from "@/core/customization";
import type { ReportSession, ReportSubmitOutcome } from "@/services/api/reportClient";
import { pickInspectedCreation, type InspectedCreation } from "./inspectedCreation";
import { WishBubble } from "./WishBubble";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const ID = "950118ce-7d93-4cb6-bd84-44d91c5de9e3";
const WISH = "ขอให้ครอบครัวมีความสุข";
const creation = (wish = WISH, displayName: string | null = "น้องมะลิ"): InspectedCreation =>
  pickInspectedCreation({ id: ID, appearance: DEFAULT_KRATHONG_APPEARANCE, publicWishText: wish, displayName });

function fakeSession(reported = false) {
  let resolve!: (o: ReportSubmitOutcome) => void;
  const submit = vi.fn(() => new Promise<ReportSubmitOutcome>((r) => { resolve = r; }));
  const session: ReportSession = { hasReported: vi.fn(() => reported), submit };
  return { session, resolve: (o: ReportSubmitOutcome) => act(async () => resolve(o)) };
}
function setup(over: { creation?: InspectedCreation; reducedMotion?: boolean; session?: ReportSession } = {}) {
  const onDone = vi.fn();
  const bubbleRef = createRef<HTMLDivElement>() as RefObject<HTMLDivElement | null>;
  const session = over.session ?? fakeSession().session;
  const props = { creation: over.creation ?? creation(), reducedMotion: over.reducedMotion ?? false, bubbleRef, onDone, reportSession: session };
  const view = render(<WishBubble {...props} />);
  bubbleRef.current!.style.visibility = "visible"; // what the canvas anchor does; a hidden element has no accessible name
  return { ...view, onDone, bubbleRef, props };
}
const btn = (name: string) => screen.getByRole("button", { name });
const card = () => screen.getByTestId("wish-bubble");
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe("WishBubble (MFW-80)", () => {
  it("B1: shows the wish and the name; no name falls back; HTML renders as text", () => {
    setup();
    advance(ANNOUNCE);
    expect(card()).toHaveTextContent(WISH);
    expect(card()).toHaveTextContent("น้องมะลิ");
    cleanup();
    setup({ creation: creation(WISH, null) });
    advance(ANNOUNCE);
    expect(card()).toHaveTextContent(DISPLAY_NAME_FALLBACK);
    cleanup();
    const html = "<b>bold</b><img src=x onerror=alert(1)>";
    const { container } = setup({ creation: creation(html) });
    advance(ANNOUNCE);
    expect(screen.getByText(html)).toBeInTheDocument();
    expect(container.querySelector("b, img")).toBeNull();
  });

  it("B2: no private data and no id in the DOM", () => {
    const source = {
      id: ID,
      appearance: DEFAULT_KRATHONG_APPEARANCE,
      publicWishText: WISH,
      displayName: "n",
      private_wish_text: "SECRET",
      owner_token: "TOKEN",
      owner_token_hash: "HASH",
    };
    const { container } = setup({ creation: pickInspectedCreation(source as never) });
    advance(ANNOUNCE);
    expect(container.innerHTML).toContain(WISH);
    for (const bad of ["SECRET", "TOKEN", "HASH", ID]) expect(container.innerHTML).not.toContain(bad);
  });

  it("B3: full motion fades after visibleMs and finishes after the fade", () => {
    const { onDone } = setup();
    advance(T.visibleMs - 1);
    expect(card()).toHaveAttribute("data-wish-bubble-phase", "shown");
    advance(1);
    expect(card()).toHaveAttribute("data-wish-bubble-phase", "fading");
    expect(card().className).toContain("transition-opacity");
    expect(card().className).toContain("opacity-0");
    expect(card().style.transitionDuration).toBe(`${T.fadeMs}ms`);
    expect(onDone).not.toHaveBeenCalled();
    advance(T.fadeMs);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("B4: reduced motion never fades and ends at visibleMs", () => {
    const { onDone } = setup({ reducedMotion: true });
    expect(card()).toHaveAttribute("data-motion", "reduced");
    advance(T.visibleMs - 1);
    expect(onDone).not.toHaveBeenCalled();
    advance(1);
    expect(card()).toHaveAttribute("data-wish-bubble-phase", "shown");
    expect(card().className).not.toContain("transition-");
    expect(onDone).toHaveBeenCalledTimes(1);
    advance(10 * T.visibleMs);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("B5: an open report keeps the bubble; cancelling restarts the lifetime", () => {
    const { onDone } = setup();
    fireEvent.click(btn(COPY.report));
    advance(3 * T.visibleMs);
    expect(onDone).not.toHaveBeenCalled();
    expect(card()).toHaveAttribute("data-wish-bubble-phase", "shown");
    fireEvent.click(btn(COPY.reportCancel));
    advance(T.visibleMs + T.fadeMs - 1);
    expect(onDone).not.toHaveBeenCalled();
    advance(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("B6: a received report shows the thanks, then the bubble goes after the lifetime", async () => {
    const { session, resolve } = fakeSession();
    const { onDone } = setup({ session });
    fireEvent.click(btn(COPY.report));
    fireEvent.click(btn(COPY.reportConfirm));
    await resolve("received");
    expect(card()).toHaveTextContent(COPY.reportReceived);
    advance(T.visibleMs + T.fadeMs - 1);
    expect(onDone).not.toHaveBeenCalled();
    advance(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("B7: an already reported wish has no report button", () => {
    setup({ session: fakeSession(true).session });
    expect(screen.queryByRole("button", { name: COPY.report })).toBeNull();
  });

  it("B8: the outer element starts hidden and keeps an externally written transform across a re-render", () => {
    const bubbleRef = createRef<HTMLDivElement>() as RefObject<HTMLDivElement | null>;
    const props = { creation: creation(), reducedMotion: false, bubbleRef, onDone: vi.fn(), reportSession: fakeSession().session };
    const { rerender } = render(<WishBubble {...props} />);
    const outer = bubbleRef.current!;
    expect(outer.style.visibility).toBe("hidden");
    outer.style.transform = "translate3d(1px, 2px, 0)";
    outer.style.visibility = "visible";
    rerender(<WishBubble {...props} creation={creation("ขอให้สอบผ่าน")} />);
    expect(outer.style.transform).toBe("translate3d(1px, 2px, 0px)");
    expect(outer.style.visibility).toBe("visible");
  });

  it("B9: unmounting early never calls onDone", () => {
    const { onDone, unmount } = setup();
    advance(T.visibleMs - 1);
    unmount();
    vi.runAllTimers();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("B10: a stable role=status outer element; the text is inserted after mount, not at mount", () => {
    const { bubbleRef } = setup();
    expect(bubbleRef.current).toHaveAttribute("role", "status");
    expect(card()).not.toHaveTextContent(WISH);
    advance(ANNOUNCE);
    expect(bubbleRef.current).toHaveAttribute("role", "status");
    expect(card()).toHaveTextContent(WISH);
  });

  it("B11: pointer or focus inside pauses the lifetime and resumes it on leave", () => {
    const { onDone } = setup();
    fireEvent.pointerEnter(card());
    advance(3 * T.visibleMs);
    expect(onDone).not.toHaveBeenCalled();
    expect(card()).toHaveAttribute("data-wish-bubble-phase", "shown");
    fireEvent.pointerLeave(card());
    advance(T.visibleMs + T.fadeMs - 1);
    expect(onDone).not.toHaveBeenCalled();
    advance(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    cleanup();
    const second = setup();
    fireEvent.focus(btn(COPY.report));
    advance(3 * T.visibleMs);
    expect(second.onDone).not.toHaveBeenCalled();
    fireEvent.blur(btn(COPY.report), { relatedTarget: document.body });
    advance(T.visibleMs + T.fadeMs);
    expect(second.onDone).toHaveBeenCalledTimes(1);
  });

  it("B12: the card takes no pointer events while fading", () => {
    setup();
    expect(card().className).toContain("pointer-events-auto");
    advance(T.visibleMs);
    expect(card().className).toContain("pointer-events-none");
    expect(card().className).not.toContain("pointer-events-auto");
  });
});
