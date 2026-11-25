import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OWNER_WISH_COPY } from "@/config/ownerWish.config";
import type { OwnerWishRevealer } from "@/services/api/ownerWishClient";
import { registerOwnedCreationPredicate } from "@/services/auth/ownedCreationHint";
import { DEFAULT_KRATHONG_APPEARANCE } from "@/core/customization";
import { OwnerWishSection, shouldOfferOwnerWishReveal } from "./OwnerWishSection";

const ID = "950118ce-7d93-4cb6-bd84-44d91c5de9e3";
const creation = (wish: string | null) => ({ id: ID, appearance: DEFAULT_KRATHONG_APPEARANCE, publicWishText: wish });
let unregister: (() => void) | null = null;
afterEach(() => {
  cleanup();
  unregister?.();
  unregister = null;
});

describe("shouldOfferOwnerWishReveal", () => {
  it("offers only for an owned creation without a public wish", () => {
    const yes = () => true;
    const no = () => false;
    expect(shouldOfferOwnerWishReveal({ id: ID, publicWishText: null }, yes)).toBe(true);
    expect(shouldOfferOwnerWishReveal({ id: ID, publicWishText: "wish" }, yes)).toBe(false);
    expect(shouldOfferOwnerWishReveal({ id: ID, publicWishText: null }, no)).toBe(false);
    expect(shouldOfferOwnerWishReveal({ id: ID, publicWishText: "wish" }, no)).toBe(false);
  });
});

describe("OwnerWishSection", () => {
  it("not owned renders nothing and never calls the revealer", () => {
    const revealer: OwnerWishRevealer = { reveal: vi.fn() };
    const { container } = render(<OwnerWishSection creation={creation(null)} isOwned={() => false} revealer={revealer} />);
    expect(container).toBeEmptyDOMElement();
    expect(revealer.reveal).not.toHaveBeenCalled();
  });
  it("owned and private shows the reveal button", () => {
    render(<OwnerWishSection creation={creation(null)} isOwned={() => true} />);
    expect(screen.getByRole("button", { name: OWNER_WISH_COPY.reveal })).toBeInTheDocument();
  });
  it("uses the registered device hint by default", () => {
    unregister = registerOwnedCreationPredicate((id) => id === ID);
    render(<OwnerWishSection creation={creation(null)} />);
    expect(screen.getByRole("button", { name: OWNER_WISH_COPY.reveal })).toBeInTheDocument();
  });
});
