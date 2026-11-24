import { beforeEach, describe, expect, it } from "vitest";
import { ALL_RIM_SOCKETS, DEFAULT_KRATHONG_APPEARANCE, parseKrathongAppearance } from "@/core/customization";
import { useBuilderStore } from "./useBuilderStore";
import { useDeviceStore } from "./useDeviceStore";
import { useUIStore } from "./useUIStore";

beforeEach(() => {
  useBuilderStore.setState(useBuilderStore.getInitialState(), true);
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
