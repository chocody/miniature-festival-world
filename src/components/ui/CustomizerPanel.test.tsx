import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CUSTOMIZER_COPY,
  CUSTOMIZER_TABS,
  FLOWER_KIND_LABELS,
  KRATHONG_BASE_LABELS,
} from "@/config/customizer.config";
import { FLOWER_KINDS, KRATHONG_BASE_IDS, RIM_SOCKET_COUNT } from "@/config/events/loyKrathong.config";
import { DEFAULT_KRATHONG_APPEARANCE, parseKrathongAppearance } from "@/core/customization";
import type { CustomizeViewControl } from "@/core/interaction";
import { useBuilderStore } from "@/store/useBuilderStore";
import { CustomizerPanel } from "./CustomizerPanel";
import { STAGE_LAYOUT_CLASSES } from "./StageLayout";

afterEach(cleanup);
beforeEach(() => {
  useBuilderStore.setState(useBuilderStore.getInitialState(), true);
});

function setup(props: { eventId?: "loy_krathong" | "christmas"; withView?: boolean } = {}) {
  const onDone = vi.fn();
  const handle = { rotate: vi.fn(), zoom: vi.fn() };
  const ref = { current: handle as CustomizeViewControl | null };
  const utils = render(
    <CustomizerPanel
      eventId={props.eventId ?? "loy_krathong"}
      onDone={onDone}
      viewControlRef={props.withView === false ? null : ref}
    />,
  );
  return { ...utils, onDone, handle, ref };
}

const btn = (name: string) => screen.getByRole("button", { name });
const pressed = (name: string) => btn(name).getAttribute("aria-pressed");
const tab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));
const stored = () => useBuilderStore.getState().appearance;
const valid = () => parseKrathongAppearance(stored() ?? DEFAULT_KRATHONG_APPEARANCE).ok;

describe("CustomizerPanel", () => {
  it("is a fixed bottom region with four tabs", () => {
    setup();
    const panel = screen.getByRole("region", { name: "แต่งกระทง" });
    expect(panel.classList).toContain("fixed");
    expect(panel.classList).toContain("bottom-0");
    const tabs = within(screen.getByRole("tablist", { name: "ส่วนประกอบกระทง" })).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(CUSTOMIZER_TABS.map((t) => t.label));
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", tabs[0].id);
  });

  it("is a stage overlay panel with no in-flow spacer (MFW-54)", () => {
    setup();
    expect(screen.queryByTestId("customizer-spacer")).toBeNull();
    expect(screen.getByRole("region", { name: "แต่งกระทง" }).className).toContain(STAGE_LAYOUT_CLASSES.panel);
  });

  it("base tab picks a base", () => {
    setup();
    const group = screen.getByRole("group", { name: "ฐานกระทง" });
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual(
      KRATHONG_BASE_IDS.map((id) => KRATHONG_BASE_LABELS[id]),
    );
    expect(pressed("หยวกกล้วย")).toBe("true");
    fireEvent.click(btn("ขนมปัง"));
    expect(stored()?.base).toBe("toy_bread_01");
    expect(pressed("ขนมปัง")).toBe("true");
    expect(pressed("หยวกกล้วย")).toBe("false");
    expect(valid()).toBe(true);
  });

  it("leaves tab picks fold style and colour", () => {
    setup();
    tab("ใบตอง");
    expect(within(screen.getByRole("group", { name: "แบบพับใบตอง" })).getAllByRole("button")).toHaveLength(2);
    expect(within(screen.getByRole("group", { name: "สีใบตอง" })).getAllByRole("button")).toHaveLength(3);
    fireEvent.click(btn("พับมน"));
    expect(stored()?.lotusFold).toBe("style_02");
    fireEvent.click(btn("เขียวเข้ม"));
    expect(stored()?.leafColor).toBe("#3F6B4A");
    expect(valid()).toBe(true);
  });

  it("flowers tab fills all sockets, empties them and shows a mix as unpressed", () => {
    setup();
    tab("ดอกไม้");
    const names = [...FLOWER_KINDS.map((k) => FLOWER_KIND_LABELS[k]), "ไม่ใส่"];
    expect(within(screen.getByRole("group", { name: "ดอกไม้รอบขอบ" })).getAllByRole("button").map((b) => b.textContent)).toEqual(names);
    expect(pressed("ดาวเรือง")).toBe("true");
    fireEvent.click(btn("กล้วยไม้"));
    expect(stored()?.flowers).toHaveLength(RIM_SOCKET_COUNT);
    expect(stored()?.flowers.every((f) => f === "orchid")).toBe(true);
    expect(pressed("กล้วยไม้")).toBe("true");
    fireEvent.click(btn("ไม่ใส่"));
    expect(stored()?.flowers).toEqual([]);
    expect(pressed("ไม่ใส่")).toBe("true");
    expect(valid()).toBe(true);
    act(() => useBuilderStore.setState({ appearance: { ...DEFAULT_KRATHONG_APPEARANCE, flowers: ["orchid"] } }));
    for (const n of names) expect(pressed(n)).toBe("false");
  });

  it("candle tab picks a colour", () => {
    setup();
    tab("เทียน");
    expect(within(screen.getByRole("group", { name: "สีเทียน" })).getAllByRole("button")).toHaveLength(3);
    fireEvent.click(btn("ขาวนวล"));
    expect(stored()?.candleColor).toBe("#FFF1D6");
    expect(valid()).toBe(true);
  });

  it("a no-op choice keeps the store untouched", () => {
    setup();
    fireEvent.click(btn("หยวกกล้วย"));
    expect(stored()).toBeNull();
    fireEvent.click(btn("ขนมปัง"));
    const first = stored();
    fireEvent.click(btn("ขนมปัง"));
    expect(stored()).toBe(first);
  });

  it("view buttons call the handle and show the hint", () => {
    const { handle, ref } = setup();
    fireEvent.click(btn("หมุนซ้าย"));
    fireEvent.click(btn("หมุนขวา"));
    fireEvent.click(btn("ซูมเข้า"));
    fireEvent.click(btn("ซูมออก"));
    expect(handle.rotate.mock.calls).toEqual([[-1], [1]]);
    expect(handle.zoom.mock.calls).toEqual([[1], [-1]]);
    expect(screen.getByText(CUSTOMIZER_COPY.gestureHint)).toBeInTheDocument();
    ref.current = null;
    expect(() => fireEvent.click(btn("หมุนขวา"))).not.toThrow();
  });

  it("without a view handle there are no view buttons or hint", () => {
    setup({ withView: false });
    expect(screen.queryByRole("group", { name: "มุมมอง" })).toBeNull();
    for (const n of ["หมุนซ้าย", "หมุนขวา", "ซูมเข้า", "ซูมออก"]) expect(screen.queryByRole("button", { name: n })).toBeNull();
    expect(screen.queryByText(CUSTOMIZER_COPY.gestureHint)).toBeNull();
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(btn("ถัดไป")).toBeInTheDocument();
  });

  it("done fires once and is the only ถัดไป button", () => {
    const { onDone } = setup();
    expect(screen.getAllByRole("button", { name: /ถัดไป/ })).toHaveLength(1);
    fireEvent.click(btn("ถัดไป"));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("follows the touch and semantics rules", () => {
    const { container } = setup();
    expect(container.querySelector(".touch-none")).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
    for (const b of container.querySelectorAll("button")) {
      expect(b.getAttribute("type")).toBe("button");
      expect(b.classList).toContain("min-h-11");
      expect(b.classList).toContain("min-w-11");
    }
  });

  it("other events get the bar without part tabs", () => {
    setup({ eventId: "christmas" });
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(btn("ถัดไป")).toBeInTheDocument();
  });
});
