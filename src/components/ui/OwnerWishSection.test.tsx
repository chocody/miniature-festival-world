import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OWNER_WISH_COPY } from "@/config/ownerWish.config";
import { WISH_SWITCH_COPY } from "@/config/wish.config";
import type { WishVisibilitySwitcher } from "@/services/api/wishVisibilityClient";
import type { OwnerWishRevealer } from "@/services/api/ownerWishClient";
import { registerOwnedCreationPredicate } from "@/services/auth/ownedCreationHint";
import { DEFAULT_KRATHONG_APPEARANCE } from "@/core/customization";
import { OwnerWishSection, shouldOfferOwnerControls } from "./OwnerWishSection";
import { CHRISTMAS_COPY } from "@/config/events/christmas.copy";
import { EventCopyProvider } from "./EventCopyContext";

const ID = "950118ce-7d93-4cb6-bd84-44d91c5de9e3";
const creation = (wish: string | null) => ({ id: ID, appearance: DEFAULT_KRATHONG_APPEARANCE, publicWishText: wish, displayName: null });
const sw = () => screen.getByRole("switch", { name: WISH_SWITCH_COPY.label });
let unregister: (() => void) | null = null;
afterEach(() => {
  cleanup();
  unregister?.();
  unregister = null;
});

describe("shouldOfferOwnerControls", () => {
  it("offers for every owned creation, open or closed", () => {
    const yes = () => true;
    const no = () => false;
    expect(shouldOfferOwnerControls({ id: ID }, yes)).toBe(true);
    expect(shouldOfferOwnerControls({ id: ID }, no)).toBe(false);
  });
});

describe("OwnerWishSection", () => {
  it("not owned renders nothing and never calls the revealer", () => {
    const revealer: OwnerWishRevealer = { reveal: vi.fn() };
    const { container } = render(<OwnerWishSection creation={creation(null)} isOwned={() => false} revealer={revealer} />);
    expect(container).toBeEmptyDOMElement();
    expect(revealer.reveal).not.toHaveBeenCalled();
  });
  it("owned and private shows the unchecked switch and the reveal button", () => {
    const switcher: WishVisibilitySwitcher = { setOpen: vi.fn() };
    render(<OwnerWishSection creation={creation(null)} isOwned={() => true} switcher={switcher} />);
    expect(sw()).toHaveAttribute("aria-checked", "false");
    expect(sw()).toBeEnabled();
    expect(screen.getByRole("button", { name: OWNER_WISH_COPY.reveal })).toBeInTheDocument();
    expect(switcher.setOpen).not.toHaveBeenCalled();
  });
  it("owned and open shows the checked switch and no reveal", () => {
    render(<OwnerWishSection creation={creation("ขอให้สมหวัง")} isOwned={() => true} />);
    expect(sw()).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("button", { name: OWNER_WISH_COPY.reveal })).toBeNull();
  });
  it("not owned and open renders nothing", () => {
    const { container } = render(<OwnerWishSection creation={creation("ขอให้สมหวัง")} isOwned={() => false} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("uses the registered device hint by default", () => {
    unregister = registerOwnedCreationPredicate((id) => id === ID);
    render(<OwnerWishSection creation={creation(null)} />);
    expect(screen.getByRole("button", { name: OWNER_WISH_COPY.reveal })).toBeInTheDocument();
  });

  it("CC6 (MFW-91): christmas copy: reveal button, device note and switch heading", () => {
    render(
      <EventCopyProvider eventId="christmas">
        <OwnerWishSection creation={creation(null)} isOwned={() => true} />
      </EventCopyProvider>,
    );
    expect(screen.getByRole("button", { name: CHRISTMAS_COPY.ownerWish.reveal })).toBeInTheDocument();
    expect(screen.getByText(CHRISTMAS_COPY.ownerWish.deviceOnlyNote)).toBeInTheDocument();
    expect(screen.getByText(CHRISTMAS_COPY.ownerSwitch.heading)).toBeInTheDocument();
  });
});
