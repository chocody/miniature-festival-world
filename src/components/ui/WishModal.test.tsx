import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MODERATION_COPY } from "@/config/moderation.config";
import { WISH_COPY, WISH_TEXT_MAX_LENGTH, type WishVisibility } from "@/config/wish.config";
import { useBuilderStore } from "@/store/useBuilderStore";
import { useDeviceStore } from "@/store/useDeviceStore";
import { OWNERSHIP_LOSS_WARNING } from "./OwnershipNotice";
import { WishModal } from "./WishModal";

const CLEAN = "ขอให้ทุกคนมีความสุข";
const PHONE = "โทรหาฉัน 081-234-5678";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  useBuilderStore.setState(useBuilderStore.getInitialState(), true);
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
  window.localStorage.clear();
  window.sessionStorage.clear();
});

const dialog = () => screen.getByRole("dialog", { name: WISH_COPY.title });
const textbox = () => screen.getByRole("textbox", { name: WISH_COPY.textLabel });
const radio = (v: WishVisibility) => screen.getByRole("radio", { name: WISH_COPY.options[v].label });
const submit = () => screen.getByRole("button", { name: WISH_COPY.submit });
const type = (value: string) => fireEvent.change(textbox(), { target: { value } });

describe("WishModal", () => {
  it("renders the dialog with no choice preselected", () => {
    render(<WishModal onSubmitted={vi.fn()} />);
    expect(dialog()).toBeInTheDocument();
    expect(radio("private")).not.toBeChecked();
    expect(radio("public")).not.toBeChecked();
    expect(submit()).toBeDisabled();
    expect(screen.getByTestId("wish-status")).toHaveTextContent(WISH_COPY.issues.text_empty);
    expect(within(dialog()).getByRole("note")).toHaveTextContent(OWNERSHIP_LOSS_WARNING);
    expect(textbox()).toHaveAttribute("maxLength", String(WISH_TEXT_MAX_LENGTH));
  });

  it("explicit choice is required", () => {
    const onSubmitted = vi.fn();
    render(<WishModal onSubmitted={onSubmitted} />);
    type(CLEAN);
    expect(submit()).toBeDisabled();
    expect(screen.getByTestId("wish-status")).toHaveTextContent(WISH_COPY.issues.visibility_missing);
    fireEvent.click(radio("private"));
    expect(submit()).toBeEnabled();
    expect(screen.queryByTestId("wish-status")).toBeNull();
    fireEvent.click(submit());
    expect(onSubmitted).toHaveBeenCalledTimes(1);
    expect(useBuilderStore.getState().wish).toEqual({ text: CLEAN, visibility: "private" });
  });

  it("public hint is shown only for public", () => {
    render(<WishModal onSubmitted={vi.fn()} />);
    expect(screen.queryByTestId("wish-public-hint")).toBeNull();
    fireEvent.click(radio("public"));
    expect(screen.getByTestId("wish-public-hint")).toHaveTextContent(MODERATION_COPY.publicHint);
    fireEvent.click(radio("private"));
    expect(screen.queryByTestId("wish-public-hint")).toBeNull();
  });

  it("Thai phone number blocks publishing", () => {
    const onSubmitted = vi.fn();
    render(<WishModal onSubmitted={onSubmitted} />);
    type(PHONE);
    fireEvent.click(radio("public"));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(MODERATION_COPY.blockedTitle);
    expect(alert).toHaveTextContent(MODERATION_COPY.reasons.phone);
    expect(alert).toHaveTextContent(MODERATION_COPY.fixHint);
    expect(textbox()).toHaveAttribute("aria-invalid", "true");
    expect(submit()).toBeDisabled();
    fireEvent.submit(dialog().querySelector("form")!);
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(useBuilderStore.getState().wish).toBeNull();
  });

  it("English email and profanity block publishing", () => {
    render(<WishModal onSubmitted={vi.fn()} />);
    fireEvent.click(radio("public"));
    type("email me at someone@example.com");
    expect(screen.getByRole("alert")).toHaveTextContent(MODERATION_COPY.reasons.email);
    type("fuck this");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(MODERATION_COPY.reasons.profanity);
    expect(alert).not.toHaveTextContent(MODERATION_COPY.reasons.email);
  });

  it("fixing the text unblocks publishing", () => {
    render(<WishModal onSubmitted={vi.fn()} />);
    type(PHONE);
    fireEvent.click(radio("public"));
    type(CLEAN);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(submit()).toBeEnabled();
    fireEvent.click(submit());
    expect(useBuilderStore.getState().wish?.visibility).toBe("public");
  });

  it("switching to private allows the same text", () => {
    render(<WishModal onSubmitted={vi.fn()} />);
    type(PHONE);
    fireEvent.click(radio("public"));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(radio("private"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByTestId("wish-public-hint")).toBeNull();
    expect(submit()).toBeEnabled();
    fireEvent.click(submit());
    expect(useBuilderStore.getState().wish).toEqual({ text: PHONE, visibility: "private" });
  });

  it("server reasons block until the user edits", () => {
    useBuilderStore.setState({ wish: { text: CLEAN, visibility: "public" } });
    useBuilderStore.getState().rejectWishFromServer({ error: "moderation_blocked", reasons: ["email"] });
    render(<WishModal onSubmitted={vi.fn()} />);
    expect(textbox()).toHaveValue(CLEAN);
    expect(radio("public")).toBeChecked();
    expect(screen.getByRole("alert")).toHaveTextContent(MODERATION_COPY.reasons.email);
    expect(submit()).toBeDisabled();
    type(`${CLEAN}มาก`);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(submit()).toBeEnabled();
  });

  it("rejects text over the limit", () => {
    render(<WishModal onSubmitted={vi.fn()} />);
    type("ก".repeat(WISH_TEXT_MAX_LENGTH + 1));
    fireEvent.click(radio("private"));
    expect(screen.getByTestId("wish-status")).toHaveTextContent(WISH_COPY.issues.text_too_long);
    expect(submit()).toBeDisabled();
    expect(screen.getByText(`${WISH_TEXT_MAX_LENGTH + 1}/${WISH_TEXT_MAX_LENGTH}`)).toBeInTheDocument();
  });

  it("reduced motion removes transitions", () => {
    act(() => useDeviceStore.getState().setReducedMotion(true));
    const { unmount } = render(<WishModal onSubmitted={vi.fn()} />);
    expect(dialog()).toHaveAttribute("data-reduced-motion", "true");
    expect(dialog().querySelectorAll('[class*="transition"]').length).toBe(0);
    unmount();
    act(() => useDeviceStore.getState().setReducedMotion(false));
    render(<WishModal onSubmitted={vi.fn()} />);
    expect(dialog()).toHaveAttribute("data-reduced-motion", "false");
    expect(dialog().querySelectorAll('[class*="transition"]').length).toBeGreaterThan(0);
  });

  it("makes no request and stores nothing in the browser", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const first = render(<WishModal onSubmitted={vi.fn()} />);
    type(CLEAN);
    fireEvent.click(radio("private"));
    fireEvent.click(submit());
    first.unmount();
    useBuilderStore.setState(useBuilderStore.getInitialState(), true);
    render(<WishModal onSubmitted={vi.fn()} />);
    type(CLEAN);
    fireEvent.click(radio("public"));
    fireEvent.click(submit());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("re-opening shows the composed wish", () => {
    const first = render(<WishModal onSubmitted={vi.fn()} />);
    type(CLEAN);
    fireEvent.click(radio("private"));
    fireEvent.click(submit());
    first.unmount();
    render(<WishModal onSubmitted={vi.fn()} />);
    expect(textbox()).toHaveValue(CLEAN);
    expect(radio("private")).toBeChecked();
  });
});
