import { beforeEach, describe, expect, it } from "vitest";
import { ALL_RIM_SOCKETS, DEFAULT_KRATHONG_APPEARANCE, parseKrathongAppearance } from "@/core/customization";
import { useBuilderStore } from "./useBuilderStore";
import { useDeviceStore } from "./useDeviceStore";
import { useUIStore } from "./useUIStore";

beforeEach(() => {
  useBuilderStore.setState(useBuilderStore.getInitialState(), true);
  window.localStorage.clear();
});

const choose = useBuilderStore.getState().chooseKrathong;

describe("useBuilderStore.chooseKrathong", () => {
  it("starts with a null appearance", () => {
    expect(useBuilderStore.getState().appearance).toBeNull();
  });

  it("applies a choice on top of the default", () => {
    expect(choose({ part: "base", value: "toy_bread_01" }).ok).toBe(true);
    const appearance = useBuilderStore.getState().appearance;
    expect(appearance).toEqual({ ...DEFAULT_KRATHONG_APPEARANCE, base: "toy_bread_01" });
    expect(parseKrathongAppearance(appearance).ok).toBe(true);
  });

  it("keeps null when the default is chosen", () => {
    expect(choose({ part: "base", value: "banana_trunk_01" }).ok).toBe(true);
    expect(useBuilderStore.getState().appearance).toBeNull();
  });

  it("BS1 (MFW-78): choosing the default design is a no-op; a new design is stored once", () => {
    expect(choose({ part: "design", value: "banana_leaf_01" }).ok).toBe(true);
    expect(useBuilderStore.getState().appearance).toBeNull();
    expect(choose({ part: "design", value: "naga_01" }).ok).toBe(true);
    const first = useBuilderStore.getState().appearance;
    expect(first?.design).toBe("naga_01");
    choose({ part: "design", value: "naga_01" });
    expect(useBuilderStore.getState().appearance).toBe(first);
  });

  it("keeps the same reference for a repeated choice", () => {
    choose({ part: "base", value: "toy_bread_01" });
    const first = useBuilderStore.getState().appearance;
    choose({ part: "base", value: "toy_bread_01" });
    expect(useBuilderStore.getState().appearance).toBe(first);
  });

  it("accumulates choices", () => {
    choose({ part: "base", value: "toy_bread_01" });
    choose({ part: "candleColor", value: "#FF9F6B" });
    expect(useBuilderStore.getState().appearance).toMatchObject({ base: "toy_bread_01", candleColor: "#FF9F6B" });
  });

  it("rejects an invalid choice without touching the store", () => {
    const before = useBuilderStore.getState();
    expect(choose({ part: "base", value: "x" as never }).ok).toBe(false);
    expect(useBuilderStore.getState()).toBe(before);
  });

  it("fills and empties all flowers", () => {
    choose({ part: "flower", target: ALL_RIM_SOCKETS, value: "orchid" });
    expect(useBuilderStore.getState().appearance?.flowers.every((f) => f === "orchid")).toBe(true);
    choose({ part: "flower", target: ALL_RIM_SOCKETS, value: null });
    expect(useBuilderStore.getState().appearance?.flowers).toEqual([]);
  });

  it("leaves other stores alone", () => {
    const ui = useUIStore.getState();
    const device = useDeviceStore.getState();
    choose({ part: "base", value: "toy_bread_01" });
    expect(useUIStore.getState()).toBe(ui);
    expect(useDeviceStore.getState()).toBe(device);
  });
});

describe("wish", () => {
  const CLEAN = "ขอให้ทุกคนมีความสุข";
  const PII = "โทรหาฉัน 081-234-5678";

  it("starts with no wish, no name and no server reasons", () => {
    expect(useBuilderStore.getState().wish).toBeNull();
    expect(useBuilderStore.getState().wishDisplayName).toBeNull();
    expect(useBuilderStore.getState().wishServerReasons).toBeNull();
  });

  it("submitWish stores the trimmed composed wish", () => {
    const result = useBuilderStore.getState().submitWish({ text: `  ${CLEAN} `, open: false, displayName: null });
    expect(result.ok).toBe(true);
    expect(useBuilderStore.getState().wish).toEqual({ text: CLEAN, visibility: "private" });
  });

  it("submitWish stores the trimmed name (MFW-63); an empty name is stored as null", () => {
    useBuilderStore.getState().submitWish({ text: CLEAN, open: true, displayName: "  น้องมะลิ " });
    expect(useBuilderStore.getState().wishDisplayName).toBe("น้องมะลิ");
    expect(useBuilderStore.getState().wish).toEqual({ text: CLEAN, visibility: "public" });
    useBuilderStore.getState().submitWish({ text: CLEAN, open: false, displayName: "   " });
    expect(useBuilderStore.getState().wishDisplayName).toBeNull();
  });

  it("a blocked name leaves the state reference unchanged, even with the switch off", () => {
    const before = useBuilderStore.getState();
    const result = useBuilderStore.getState().submitWish({ text: CLEAN, open: false, displayName: "someone@example.com" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.nameModerationReasons).toEqual(["email"]);
    expect(useBuilderStore.getState()).toBe(before);
  });

  it("an invalid draft is returned and the state reference is unchanged", () => {
    const before = useBuilderStore.getState();
    const result = useBuilderStore.getState().submitWish({ text: PII, open: true, displayName: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.wishModerationReasons).toEqual(["phone"]);
    expect(useBuilderStore.getState()).toBe(before);
  });

  it("rejectWishFromServer", () => {
    const { submitWish, rejectWishFromServer } = useBuilderStore.getState();
    submitWish({ text: CLEAN, open: true, displayName: null });
    const wish = useBuilderStore.getState().wish;
    expect(rejectWishFromServer({ error: "moderation_blocked", reasons: ["email"] })).toBe(true);
    expect(useBuilderStore.getState().wishServerReasons).toEqual(["email"]);
    expect(useBuilderStore.getState().wish).toBe(wish);
    const before = useBuilderStore.getState();
    expect(rejectWishFromServer({ error: "unavailable" })).toBe(false);
    expect(rejectWishFromServer(null)).toBe(false);
    expect(useBuilderStore.getState()).toBe(before);
  });

  it("a following valid submitWish clears server reasons", () => {
    const { submitWish, rejectWishFromServer } = useBuilderStore.getState();
    submitWish({ text: CLEAN, open: true, displayName: null });
    rejectWishFromServer({ error: "moderation_blocked", reasons: ["email"] });
    submitWish({ text: `${CLEAN}มาก`, open: true, displayName: null });
    expect(useBuilderStore.getState().wishServerReasons).toBeNull();
  });

  it("wish and appearance are independent; other stores keep their references", () => {
    const ui = useUIStore.getState();
    const device = useDeviceStore.getState();
    useBuilderStore.getState().submitWish({ text: CLEAN, open: false, displayName: null });
    expect(useBuilderStore.getState().appearance).toBeNull();
    const wish = useBuilderStore.getState().wish;
    useBuilderStore.getState().chooseKrathong({ part: "base", value: "toy_bread_01" });
    expect(useBuilderStore.getState().wish).toBe(wish);
    expect(useUIStore.getState()).toBe(ui);
    expect(useDeviceStore.getState()).toBe(device);
  });

  it("writes nothing to localStorage", () => {
    const { submitWish, rejectWishFromServer } = useBuilderStore.getState();
    submitWish({ text: CLEAN, open: false, displayName: null });
    submitWish({ text: PII, open: true, displayName: null });
    rejectWishFromServer({ error: "moderation_blocked", reasons: ["phone"] });
    submitWish({ text: CLEAN, open: true, displayName: null });
    expect(window.localStorage.length).toBe(0);
  });
});
