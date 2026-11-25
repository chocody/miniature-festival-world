import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MODERATION_COPY } from "@/config/moderation.config";
import { OWNER_SWITCH_COPY, OWNER_WISH_COPY } from "@/config/ownerWish.config";
import { WISH_SWITCH_COPY } from "@/config/wish.config";
import type { OwnedWishState, OwnedWishStateReader } from "@/services/api/ownedWishState";
import type { OwnerWishRevealer } from "@/services/api/ownerWishClient";
import type { WishVisibilityOutcome, WishVisibilitySwitcher } from "@/services/api/wishVisibilityClient";
import { OwnerWishControls } from "./OwnerWishControls";

const ID = "950118ce-7d93-4cb6-bd84-44d91c5de9e3";
const ZONE = { eventId: "loy_krathong", zoneId: 3 } as const;

function fakeSwitcher() {
  const pending: ((o: WishVisibilityOutcome) => void)[] = [];
  const setOpen = vi.fn(
    (creationId: string, open: boolean) =>
      new Promise<WishVisibilityOutcome>((r) => {
        void creationId;
        void open;
        pending.push(r);
      }),
  );
  const switcher: WishVisibilitySwitcher = { setOpen };
  const answer = (o: WishVisibilityOutcome) => act(async () => pending.shift()!(o));
  return { switcher, setOpen, answer };
}
function fakeReader() {
  const pending: ((s: OwnedWishState) => void)[] = [];
  const read = vi.fn(
    () =>
      new Promise<OwnedWishState>((r) => {
        pending.push(r);
      }),
  );
  const reader: OwnedWishStateReader = { read };
  const answer = (s: OwnedWishState) => act(async () => pending.shift()!(s));
  return { reader, read, answer };
}
const revealer = (): OwnerWishRevealer => ({ reveal: vi.fn(async () => ({ kind: "none" as const })) });

const sw = () => screen.getByRole("switch", { name: WISH_SWITCH_COPY.label });
const status = () => screen.getByTestId("owner-wish-controls").querySelector('[aria-live="polite"]')!;
const revealButton = () => screen.queryByRole("button", { name: OWNER_WISH_COPY.reveal });

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error");
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  errorSpy.mockRestore();
});

describe("OwnerWishControls", () => {
  it("1. knownOpen=false: unchecked, enabled, reveal offered; nothing called", () => {
    const s = fakeSwitcher();
    const r = fakeReader();
    const rv = revealer();
    render(<OwnerWishControls creationId={ID} knownOpen={false} switcher={s.switcher} stateReader={r.reader} revealer={rv} />);
    expect(sw()).toHaveAttribute("aria-checked", "false");
    expect(sw()).toBeEnabled();
    expect(revealButton()).toBeInTheDocument();
    expect(screen.getByText(OWNER_SWITCH_COPY.heading)).toBeInTheDocument();
    expect(s.setOpen).not.toHaveBeenCalled();
    expect(r.read).not.toHaveBeenCalled();
    expect(rv.reveal).not.toHaveBeenCalled();
  });

  it("2. knownOpen=true: checked, no reveal", () => {
    render(<OwnerWishControls creationId={ID} knownOpen switcher={fakeSwitcher().switcher} />);
    expect(sw()).toHaveAttribute("aria-checked", "true");
    expect(revealButton()).toBeNull();
  });

  it("3. off → on", async () => {
    const s = fakeSwitcher();
    const onSwitched = vi.fn();
    render(<OwnerWishControls creationId={ID} knownOpen={false} switcher={s.switcher} onSwitched={onSwitched} />);
    fireEvent.click(sw());
    expect(s.setOpen).toHaveBeenCalledTimes(1);
    expect(s.setOpen).toHaveBeenCalledWith(ID, true);
    expect(sw()).toBeDisabled();
    expect(sw()).toHaveAttribute("aria-busy", "true");
    expect(status()).toHaveTextContent(OWNER_SWITCH_COPY.saving);
    expect(screen.getByTestId("owner-wish-controls")).toHaveAttribute("data-switch-pending", "true");
    await s.answer({ kind: "switched", open: true });
    expect(sw()).toHaveAttribute("aria-checked", "true");
    expect(sw()).toBeEnabled();
    expect(status()).toHaveTextContent(OWNER_SWITCH_COPY.switchedOn);
    expect(onSwitched).toHaveBeenCalledTimes(1);
    expect(onSwitched).toHaveBeenCalledWith(ID, true);
    expect(revealButton()).toBeNull();
    expect(screen.getByTestId("owner-wish-controls")).toHaveAttribute("data-wish-open", "true");
  });

  it("4. on → off", async () => {
    const s = fakeSwitcher();
    const onSwitched = vi.fn();
    render(<OwnerWishControls creationId={ID} knownOpen switcher={s.switcher} onSwitched={onSwitched} />);
    fireEvent.click(sw());
    expect(s.setOpen).toHaveBeenCalledWith(ID, false);
    await s.answer({ kind: "switched", open: false });
    expect(sw()).toHaveAttribute("aria-checked", "false");
    expect(status()).toHaveTextContent(OWNER_SWITCH_COPY.switchedOff);
    expect(onSwitched).toHaveBeenCalledWith(ID, false);
    expect(revealButton()).toBeInTheDocument();
  });

  it("5. moderation_blocked shows the reasons and the wish stays private", async () => {
    const s = fakeSwitcher();
    const onSwitched = vi.fn();
    render(<OwnerWishControls creationId={ID} knownOpen={false} switcher={s.switcher} onSwitched={onSwitched} />);
    fireEvent.click(sw());
    await s.answer({ kind: "moderation_blocked", reasons: ["phone"] });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(MODERATION_COPY.reasons.phone);
    expect(alert).toHaveTextContent(OWNER_SWITCH_COPY.stayedPrivate);
    expect(sw()).toHaveAttribute("aria-checked", "false");
    expect(sw()).toBeEnabled();
    expect(onSwitched).not.toHaveBeenCalled();
    fireEvent.click(sw());
    expect(screen.queryByRole("alert")).toBeNull();
    await s.answer({ kind: "moderation_blocked", reasons: ["email", "profanity"] });
    const second = screen.getByRole("alert");
    expect(second).toHaveTextContent(MODERATION_COPY.reasons.email);
    expect(second).toHaveTextContent(MODERATION_COPY.reasons.profanity);
  });

  it("6. hidden locks the switch off", async () => {
    const s = fakeSwitcher();
    render(<OwnerWishControls creationId={ID} knownOpen={false} switcher={s.switcher} />);
    fireEvent.click(sw());
    await s.answer({ kind: "hidden" });
    expect(status()).toHaveTextContent(OWNER_SWITCH_COPY.hidden);
    expect(sw()).toHaveAttribute("aria-checked", "false");
    expect(sw()).toBeDisabled();
    fireEvent.click(sw());
    expect(s.setOpen).toHaveBeenCalledTimes(1);
  });

  it("7. not_found locks the switch", async () => {
    const s = fakeSwitcher();
    render(<OwnerWishControls creationId={ID} knownOpen switcher={s.switcher} />);
    fireEvent.click(sw());
    await s.answer({ kind: "not_found" });
    expect(status()).toHaveTextContent(OWNER_SWITCH_COPY.notFound);
    expect(sw()).toBeDisabled();
    expect(sw()).toHaveAttribute("aria-checked", "true");
  });

  it("8. failed keeps the state; a tap retries", async () => {
    const s = fakeSwitcher();
    render(<OwnerWishControls creationId={ID} knownOpen={false} switcher={s.switcher} />);
    fireEvent.click(sw());
    await s.answer({ kind: "failed" });
    expect(status()).toHaveTextContent(OWNER_SWITCH_COPY.failed);
    expect(sw()).toHaveAttribute("aria-checked", "false");
    expect(sw()).toBeEnabled();
    fireEvent.click(sw());
    expect(s.setOpen).toHaveBeenCalledTimes(2);
    expect(s.setOpen).toHaveBeenLastCalledWith(ID, true);
  });

  it("9. two clicks while pending send one request", () => {
    const s = fakeSwitcher();
    render(<OwnerWishControls creationId={ID} knownOpen={false} switcher={s.switcher} />);
    fireEvent.click(sw());
    fireEvent.click(sw());
    expect(s.setOpen).toHaveBeenCalledTimes(1);
  });

  it("10. drawer mode reads the state from the zone; unknown offers a reload", async () => {
    const r = fakeReader();
    const { unmount } = render(<OwnerWishControls creationId={ID} zone={ZONE} stateReader={r.reader} switcher={fakeSwitcher().switcher} />);
    expect(status()).toHaveTextContent(OWNER_SWITCH_COPY.loading);
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByTestId("owner-wish-controls")).toHaveAttribute("data-wish-open", "unknown");
    expect(r.read).toHaveBeenCalledTimes(1);
    expect(r.read).toHaveBeenCalledWith(ID, ZONE);
    await r.answer("open");
    expect(sw()).toHaveAttribute("aria-checked", "true");
    unmount();

    const r2 = fakeReader();
    render(<OwnerWishControls creationId={ID} zone={ZONE} stateReader={r2.reader} switcher={fakeSwitcher().switcher} />);
    await r2.answer("unknown");
    expect(status()).toHaveTextContent(OWNER_SWITCH_COPY.loadFailed);
    expect(screen.queryByRole("switch")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: OWNER_SWITCH_COPY.retryLoad }));
    expect(status()).toHaveTextContent(OWNER_SWITCH_COPY.loading);
    expect(r2.read).toHaveBeenCalledTimes(2);
    await r2.answer("closed");
    expect(sw()).toHaveAttribute("aria-checked", "false");
    expect(revealButton()).toBeInTheDocument();
  });

  it("11. unmount before an answer: no error", async () => {
    const s = fakeSwitcher();
    const r = fakeReader();
    const a = render(<OwnerWishControls creationId={ID} knownOpen={false} switcher={s.switcher} />);
    fireEvent.click(sw());
    a.unmount();
    await s.answer({ kind: "switched", open: true });
    const b = render(<OwnerWishControls creationId={ID} zone={ZONE} stateReader={r.reader} />);
    b.unmount();
    await r.answer("open");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("12. a new knownOpen is adopted while idle, ignored while pending until the answer", async () => {
    const s = fakeSwitcher();
    const { rerender } = render(<OwnerWishControls creationId={ID} knownOpen={false} switcher={s.switcher} />);
    rerender(<OwnerWishControls creationId={ID} knownOpen switcher={s.switcher} />);
    expect(sw()).toHaveAttribute("aria-checked", "true");
    rerender(<OwnerWishControls creationId={ID} knownOpen={false} switcher={s.switcher} />);
    expect(sw()).toHaveAttribute("aria-checked", "false");
    fireEvent.click(sw()); // asks for open
    rerender(<OwnerWishControls creationId={ID} knownOpen switcher={s.switcher} />);
    rerender(<OwnerWishControls creationId={ID} knownOpen={false} switcher={s.switcher} />);
    expect(sw()).toHaveAttribute("aria-checked", "false");
    expect(sw()).toHaveAttribute("aria-busy", "true");
    await s.answer({ kind: "switched", open: true });
    expect(sw()).toHaveAttribute("aria-checked", "true");
  });

  it("13. static UI with touch-sized buttons", async () => {
    const r = fakeReader();
    const { container } = render(<OwnerWishControls creationId={ID} zone={ZONE} stateReader={r.reader} revealer={revealer()} />);
    await r.answer("unknown");
    const check = () => {
      for (const el of container.querySelectorAll("*")) {
        expect(el.getAttribute("class") ?? "").not.toMatch(/\btransition\b|\btransition-|\banimate-/);
      }
      for (const b of container.querySelectorAll("button")) {
        expect(b.className).toContain("min-h-11");
        expect(b.className).toContain("min-w-11");
      }
    };
    check();
    fireEvent.click(screen.getByRole("button", { name: OWNER_SWITCH_COPY.retryLoad }));
    await r.answer("closed");
    check();
  });

  it("14. a full on/off cycle touches no browser storage and reports only (id, boolean)", async () => {
    window.localStorage.setItem("unrelated", "1");
    const before = { local: window.localStorage.length, session: window.sessionStorage.length };
    const s = fakeSwitcher();
    const onSwitched = vi.fn();
    render(<OwnerWishControls creationId={ID} knownOpen={false} switcher={s.switcher} onSwitched={onSwitched} revealer={revealer()} />);
    fireEvent.click(sw());
    await s.answer({ kind: "switched", open: true });
    fireEvent.click(sw());
    await s.answer({ kind: "switched", open: false });
    expect(window.localStorage.length).toBe(before.local);
    expect(window.sessionStorage.length).toBe(before.session);
    expect(onSwitched.mock.calls).toEqual([
      [ID, true],
      [ID, false],
    ]);
  });
});
