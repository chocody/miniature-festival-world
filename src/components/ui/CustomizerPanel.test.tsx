import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CUSTOMIZER_COPY, KRATHONG_DESIGN_LABELS } from "@/config/customizer.config";
import { KRATHONG_DESIGN_IDS, krathongDesignThumbnailUrl } from "@/config/krathongDesigns.config";
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
const stored = () => useBuilderStore.getState().appearance;
const valid = () => parseKrathongAppearance(stored() ?? DEFAULT_KRATHONG_APPEARANCE).ok;

describe("CustomizerPanel", () => {
  it("is a fixed, centred, floating bar: a gutter above the bottom edge, not a full-width sheet (MFW-83)", () => {
    setup();
    const panel = screen.getByRole("region", { name: "แต่งกระทง" });
    expect(panel.classList).toContain("fixed");
    expect(panel.classList).toContain("left-1/2");
    expect(panel.classList).toContain("-translate-x-1/2");
    expect(panel.classList).toContain("w-max");
    expect(panel.classList).toContain("bottom-[max(var(--spacing-gutter),env(safe-area-inset-bottom))]");
    for (const c of ["bottom-0", "left-0", "right-0", "rounded-t-sheet"]) expect(panel.classList).not.toContain(c);
  });

  it("is a stage overlay panel with no in-flow spacer (MFW-54)", () => {
    setup();
    expect(screen.queryByTestId("customizer-spacer")).toBeNull();
    expect(screen.getByRole("region", { name: "แต่งกระทง" }).className).toContain(STAGE_LAYOUT_CLASSES.floatBar);
  });

  it("CP1 (MFW-78): one row of five design thumbnails, no text, no tabs", () => {
    setup();
    const buttons = within(screen.getByRole("group", { name: CUSTOMIZER_COPY.designGroupLabel })).getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("data-design-id"))).toEqual([...KRATHONG_DESIGN_IDS]);
    buttons.forEach((b, i) => {
      const id = KRATHONG_DESIGN_IDS[i];
      expect(b.textContent).toBe("");
      expect(b).toHaveAttribute("aria-label", KRATHONG_DESIGN_LABELS[id]);
      const span = b.querySelector("span") as HTMLElement;
      expect(span).toHaveAttribute("aria-hidden", "true");
      expect(span.style.backgroundImage).toContain(krathongDesignThumbnailUrl(id));
    });
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("CP2 (MFW-78): the default design is pressed; tapping a design stores it", () => {
    setup();
    expect(pressed("กระทงใบตอง")).toBe("true");
    fireEvent.click(btn("กระทงพญานาค"));
    expect(stored()?.design).toBe("naga_01");
    expect(pressed("กระทงพญานาค")).toBe("true");
    expect(pressed("กระทงใบตอง")).toBe("false");
    expect(valid()).toBe(true);
  });

  it("CP3 (MFW-78): a no-op design choice keeps the store untouched", () => {
    setup();
    fireEvent.click(btn("กระทงใบตอง"));
    expect(stored()).toBeNull();
    fireEvent.click(btn("กระทงพญานาค"));
    const first = stored();
    fireEvent.click(btn("กระทงพญานาค"));
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
    expect(within(screen.getByRole("group", { name: CUSTOMIZER_COPY.designGroupLabel })).getAllByRole("button")).toHaveLength(5);
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

  it("CP4: other events get the bar without the design row", () => {
    setup({ eventId: "christmas" });
    expect(screen.queryByRole("group", { name: CUSTOMIZER_COPY.designGroupLabel })).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(btn("ถัดไป")).toBeInTheDocument();
  });
});
