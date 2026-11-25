import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MODERATION_COPY } from "@/config/moderation.config";
import {
  DISPLAY_NAME_FALLBACK,
  DISPLAY_NAME_MAX_LENGTH,
  WISH_COPY,
  WISH_SWITCH_COPY,
  WISH_TEXT_MAX_LENGTH,
} from "@/config/wish.config";
import { useBuilderStore } from "@/store/useBuilderStore";
import { useDeviceStore } from "@/store/useDeviceStore";
import { OWNERSHIP_LOSS_WARNING } from "./OwnershipNotice";
import { WishModal } from "./WishModal";

const CLEAN = "ขอให้ทุกคนมีความสุข";
const PHONE = "โทรหาฉัน 081-234-5678";
const NAME = "น้องมะลิ";

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
const nameBox = () => screen.getByRole("textbox", { name: WISH_COPY.nameLabel });
const sw = () => screen.getByRole("switch", { name: WISH_SWITCH_COPY.label });
const submit = () => screen.getByRole("button", { name: WISH_COPY.submit });
const type = (value: string) => fireEvent.change(textbox(), { target: { value } });
const typeName = (value: string) => fireEvent.change(nameBox(), { target: { value } });

describe("WishModal", () => {
  it("renders name, wish and the switch off by default", () => {
    render(<WishModal onSubmitted={vi.fn()} />);
    expect(dialog()).toBeInTheDocument();
    expect(nameBox()).toHaveValue("");
    expect(nameBox()).toHaveAttribute("maxLength", String(DISPLAY_NAME_MAX_LENGTH));
    expect(sw()).toHaveAttribute("aria-checked", "false");
    expect(submit()).toBeDisabled();
    expect(screen.getByTestId("wish-status")).toHaveTextContent(WISH_COPY.issues.text_empty);
    expect(within(dialog()).getByRole("note")).toHaveTextContent(OWNERSHIP_LOSS_WARNING);
    expect(textbox()).toHaveAttribute("maxLength", String(WISH_TEXT_MAX_LENGTH));
    // Order: name field, wish, switch.
    const name = nameBox();
    const wish = textbox();
    expect(name.compareDocumentPosition(wish) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(wish.compareDocumentPosition(sw()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("no radio choice is left", () => {
    render(<WishModal onSubmitted={vi.fn()} />);
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.queryAllByRole("switch")).toHaveLength(1);
    expect(dialog().querySelector("fieldset")).toBeNull();
  });

  it("helper text says everyone sees name and wish", () => {
    render(<WishModal onSubmitted={vi.fn()} />);
    expect(sw()).toHaveAccessibleDescription(expect.stringContaining(WISH_SWITCH_COPY.helper));
    expect(WISH_SWITCH_COPY.helper).toMatch(/ชื่อและคำอธิษฐาน/);
  });

  it("clean text submits private by default", () => {
    const onSubmitted = vi.fn();
    render(<WishModal onSubmitted={onSubmitted} />);
    type(CLEAN);
    expect(submit()).toBeEnabled();
    expect(screen.queryByTestId("wish-status")).toBeNull();
    fireEvent.click(submit());
    expect(onSubmitted).toHaveBeenCalledTimes(1);
    expect(useBuilderStore.getState().wish).toEqual({ text: CLEAN, visibility: "private" });
    expect(useBuilderStore.getState().wishDisplayName).toBeNull();
  });

  it("switch on stores a public wish with the trimmed name", () => {
    const onSubmitted = vi.fn();
    render(<WishModal onSubmitted={onSubmitted} />);
    typeName(`  ${NAME} `);
    type(CLEAN);
    fireEvent.click(sw());
    expect(sw()).toHaveAttribute("aria-checked", "true");
    fireEvent.click(submit());
    expect(onSubmitted).toHaveBeenCalledTimes(1);
    expect(useBuilderStore.getState().wish).toEqual({ text: CLEAN, visibility: "public" });
    expect(useBuilderStore.getState().wishDisplayName).toBe(NAME);
  });

  it("empty name is stored as null and the hint names the fallback", () => {
    render(<WishModal onSubmitted={vi.fn()} />);
    expect(nameBox()).toHaveAccessibleDescription(expect.stringContaining(DISPLAY_NAME_FALLBACK));
    typeName("   ");
    type(CLEAN);
    fireEvent.click(sw());
    fireEvent.click(submit());
    expect(useBuilderStore.getState().wishDisplayName).toBeNull();
    expect(useBuilderStore.getState().wish?.visibility).toBe("public");
  });

  it("PII in the name blocks submit even when private (Thai + English)", () => {
    const onSubmitted = vi.fn();
    render(<WishModal onSubmitted={onSubmitted} />);
    type(CLEAN);
    expect(sw()).toHaveAttribute("aria-checked", "false");
    typeName("ไลน์ somchai99");
    expect(screen.getByRole("alert")).toHaveTextContent(MODERATION_COPY.reasons.line_id);
    expect(nameBox()).toHaveAttribute("aria-invalid", "true");
    expect(textbox()).not.toHaveAttribute("aria-invalid");
    expect(submit()).toBeDisabled();
    typeName("someone@example.com");
    expect(screen.getByRole("alert")).toHaveTextContent(MODERATION_COPY.reasons.email);
    expect(submit()).toBeDisabled();
    fireEvent.submit(dialog().querySelector("form")!);
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(useBuilderStore.getState().wish).toBeNull();
    typeName(NAME);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(nameBox()).not.toHaveAttribute("aria-invalid");
    expect(submit()).toBeEnabled();
  });

  it("a name over the limit or with a control character shows its status", () => {
    render(<WishModal onSubmitted={vi.fn()} />);
    type(CLEAN);
    typeName("a\tb");
    expect(screen.getByTestId("wish-status")).toHaveTextContent(WISH_COPY.issues.name_invalid);
    expect(submit()).toBeDisabled();
    typeName("ก".repeat(DISPLAY_NAME_MAX_LENGTH + 1));
    expect(screen.getByTestId("wish-status")).toHaveTextContent(WISH_COPY.issues.name_too_long);
    expect(submit()).toBeDisabled();
  });

  it("public hint is shown only when the switch is on", () => {
    render(<WishModal onSubmitted={vi.fn()} />);
    expect(screen.queryByTestId("wish-public-hint")).toBeNull();
    fireEvent.click(sw());
    expect(screen.getByTestId("wish-public-hint")).toHaveTextContent(MODERATION_COPY.publicHint);
    fireEvent.click(sw());
    expect(screen.queryByTestId("wish-public-hint")).toBeNull();
  });

  it("PII in the wish blocks only when on (Thai phone number)", () => {
    const onSubmitted = vi.fn();
    render(<WishModal onSubmitted={onSubmitted} />);
    type(PHONE);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(submit()).toBeEnabled();
    fireEvent.click(sw());
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
    fireEvent.click(sw());
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
    fireEvent.click(sw());
    type(CLEAN);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(submit()).toBeEnabled();
    fireEvent.click(submit());
    expect(useBuilderStore.getState().wish?.visibility).toBe("public");
  });

  it("switching to private allows the same text", () => {
    render(<WishModal onSubmitted={vi.fn()} />);
    type(PHONE);
    fireEvent.click(sw());
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(sw());
    expect(sw()).toHaveAttribute("aria-checked", "false");
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
    expect(sw()).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(MODERATION_COPY.reasons.email);
    expect(submit()).toBeDisabled();
    type(`${CLEAN}มาก`);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(submit()).toBeEnabled();
  });

  it("a name edit clears server reasons", () => {
    useBuilderStore.setState({ wish: { text: CLEAN, visibility: "public" }, wishDisplayName: NAME });
    useBuilderStore.getState().rejectWishFromServer({ error: "moderation_blocked", reasons: ["email"] });
    render(<WishModal onSubmitted={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent(MODERATION_COPY.reasons.email);
    expect(submit()).toBeDisabled();
    typeName(`${NAME}จ้า`);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(submit()).toBeEnabled();
  });

  it("rejects text over the limit", () => {
    render(<WishModal onSubmitted={vi.fn()} />);
    type("ก".repeat(WISH_TEXT_MAX_LENGTH + 1));
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
    expect(sw().className).toContain("transition-colors");
  });

  it("makes no request and stores nothing in the browser", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const first = render(<WishModal onSubmitted={vi.fn()} />);
    typeName(NAME);
    type(CLEAN);
    fireEvent.click(submit());
    first.unmount();
    useBuilderStore.setState(useBuilderStore.getInitialState(), true);
    render(<WishModal onSubmitted={vi.fn()} />);
    typeName(NAME);
    type(CLEAN);
    fireEvent.click(sw());
    fireEvent.click(submit());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("re-opening shows name, text and switch state", () => {
    const first = render(<WishModal onSubmitted={vi.fn()} />);
    typeName(NAME);
    type(CLEAN);
    fireEvent.click(sw());
    fireEvent.click(submit());
    first.unmount();
    render(<WishModal onSubmitted={vi.fn()} />);
    expect(nameBox()).toHaveValue(NAME);
    expect(textbox()).toHaveValue(CLEAN);
    expect(sw()).toHaveAttribute("aria-checked", "true");
  });
});
