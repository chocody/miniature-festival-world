import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OWNER_WISH_COPY as COPY } from "@/config/ownerWish.config";
import type { OwnerWishRevealOutcome, OwnerWishRevealer } from "@/services/api/ownerWishClient";
import { useBuilderStore } from "@/store/useBuilderStore";
import { useDeviceStore } from "@/store/useDeviceStore";
import { useUIStore } from "@/store/useUIStore";
import { useWorldStore } from "@/store/useWorldStore";
import { PrivateWishReveal } from "./PrivateWishReveal";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ID = "950118ce-7d93-4cb6-bd84-44d91c5de9e3";

function fake() {
  let resolve!: (o: OwnerWishRevealOutcome) => void;
  const reveal = vi.fn(() => new Promise<OwnerWishRevealOutcome>((r) => {
    resolve = r;
  }));
  const revealer: OwnerWishRevealer = { reveal };
  return { revealer, reveal, resolve: (o: OwnerWishRevealOutcome) => act(async () => resolve(o)) };
}
const stateAttr = (c: HTMLElement) => c.querySelector("[data-owner-wish-state]")!.getAttribute("data-owner-wish-state");

describe("PrivateWishReveal", () => {
  it("idle, loading and no second request while loading", () => {
    const f = fake();
    const { container } = render(<PrivateWishReveal creationId={ID} revealer={f.revealer} />);
    expect(screen.getByText(COPY.heading)).toBeInTheDocument();
    expect(screen.getByText(COPY.deviceOnlyNote)).toBeInTheDocument();
    expect(stateAttr(container)).toBe("idle");
    fireEvent.click(screen.getByRole("button", { name: COPY.reveal }));
    expect(f.reveal).toHaveBeenCalledTimes(1);
    expect(f.reveal).toHaveBeenCalledWith(ID);
    const loading = screen.getByRole("button", { name: COPY.revealing });
    expect(loading).toBeDisabled();
    fireEvent.click(loading);
    expect(f.reveal).toHaveBeenCalledTimes(1);
    expect(stateAttr(container)).toBe("loading");
  });

  it("shows the text as text, then hides it", async () => {
    const f = fake();
    const wish = "<b>x</b><img src=x onerror=alert(1)>";
    const { container } = render(<PrivateWishReveal creationId={ID} revealer={f.revealer} />);
    fireEvent.click(screen.getByRole("button", { name: COPY.reveal }));
    await f.resolve({ kind: "revealed", wishText: wish });
    expect(container.textContent).toContain(wish);
    expect(container.querySelector("b, img")).toBeNull();
    expect(stateAttr(container)).toBe("revealed");
    const attrs = container.innerHTML.match(/data-owner-wish-state="[^"]*"/g)!.join();
    expect(attrs).not.toContain(ID);
    fireEvent.click(screen.getByRole("button", { name: COPY.hide }));
    expect(container.textContent).not.toContain(wish);
    expect(screen.getByRole("button", { name: COPY.reveal })).toBeInTheDocument();
  });

  it("none shows the not-found text without retry; failed offers retry", async () => {
    const none = fake();
    const first = render(<PrivateWishReveal creationId={ID} revealer={none.revealer} />);
    fireEvent.click(screen.getByRole("button", { name: COPY.reveal }));
    await none.resolve({ kind: "none" });
    expect(first.container).toHaveTextContent(COPY.none);
    expect(screen.queryByRole("button", { name: COPY.retry })).toBeNull();
    cleanup();

    const failed = fake();
    render(<PrivateWishReveal creationId={ID} revealer={failed.revealer} />);
    fireEvent.click(screen.getByRole("button", { name: COPY.reveal }));
    await failed.resolve({ kind: "failed" });
    expect(screen.getByText(COPY.failed)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: COPY.retry }));
    expect(failed.reveal).toHaveBeenCalledTimes(2);
  });

  it("keeps the text out of stores and storage", async () => {
    const f = fake();
    const wish = "ความลับที่ไม่ควรถูกเก็บ";
    render(<PrivateWishReveal creationId={ID} revealer={f.revealer} />);
    fireEvent.click(screen.getByRole("button", { name: COPY.reveal }));
    await f.resolve({ kind: "revealed", wishText: wish });
    for (const store of [useBuilderStore, useWorldStore, useUIStore, useDeviceStore]) {
      expect(JSON.stringify(store.getState())).not.toContain(wish);
    }
    expect(JSON.stringify({ ...localStorage })).not.toContain(wish);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(wish);
  });

  it("a late answer after unmount is dropped quietly", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const f = fake();
    const { unmount } = render(<PrivateWishReveal creationId={ID} revealer={f.revealer} />);
    fireEvent.click(screen.getByRole("button", { name: COPY.reveal }));
    unmount();
    await f.resolve({ kind: "revealed", wishText: "late" });
    expect(errors).not.toHaveBeenCalled();
  });
});
