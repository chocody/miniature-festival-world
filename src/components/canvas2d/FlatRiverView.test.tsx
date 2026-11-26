import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FLAT_RIVER_FRAME_INTERVAL_MS, FLAT_RIVER_MARK_SCALE, FLAT_RIVER_VIEW_HEIGHT_PX } from "@/config/fallback2d.config";
import { LOY_KRATHONG_PIER_RELEASE_SPOT, LOY_KRATHONG_RIVER_LANE_ID } from "@/config/events/loyKrathong.river.config";
import { MIN_TOUCH_TARGET_PX } from "@/config/customizer.config";
import { RIPPLE_LOOK, SCENE_TAP_HINT_COPY } from "@/config/gimmicks.config";
import { INSPECT_POPUP_COPY } from "@/config/inspect.config";
import { WISH_SWITCH_COPY } from "@/config/wish.config";
import { FALLBACK_2D_EFFECT_POOL_CAPS } from "@/config/performance.config";
import { ZONE_ITEM_CAP } from "@/config/world.config";
import {
  createCanvasPointOut,
  createFlatCanvasScratch,
  flatProgressToCanvasInto,
  flatRiverScrollLeft,
  flatRiverScrollLeftAfterRescale,
  getLoyKrathongFlatRiver,
} from "@/core/fallback2d/flat";
import { getRiverItemCanvasPositionAt } from "@/core/fallback2d/riverTopDown"; // three-based reference (tests only)
import { getLoyKrathongRiverLanes } from "@/core/world/riverLanes";
import { makePublicCreation } from "@/core/fallback2d/__fixtures__/flatRiverItems";
import { INITIAL_RITUAL_STATE, type SavedRelease } from "@/core/ritual";
import type { SplinePathCoord } from "@/core/coordinates/SplinePathCoord";
import type { PublicCreation } from "@/services/api/creationTypes";
import { registerOwnedCreationPredicate } from "@/services/auth/ownedCreationHint";
import { useBuilderStore } from "@/store/useBuilderStore";
import { useDeviceStore } from "@/store/useDeviceStore";
import { useUIStore } from "@/store/useUIStore";
import { INITIAL_WORLD_STATE, useWorldStore } from "@/store/useWorldStore";
import { FlatRiverView, type FrameScheduler } from "./FlatRiverView";

const T = 1_800_000_000_000;
/** One throttled frame later (the +1 absorbs float error of the epoch-ms subtraction). */
const STEP = FLAT_RIVER_FRAME_INTERVAL_MS + 1;
const { projection, scene, lanes } = getLoyKrathongFlatRiver();
const W = projection.viewport.width;

let clock = T;
let queue: (() => void)[] = [];
let handleCounter = 0;
const cancel = vi.fn();
const frames: FrameScheduler = {
  request: (cb) => {
    queue.push(cb);
    return ++handleCounter;
  },
  cancel,
};
const now = () => clock;
function runFrame(at: number) {
  clock = at;
  const callbacks = queue;
  queue = [];
  act(() => callbacks.forEach((cb) => cb()));
}

const getRiverItemCanvasPositionAtForTest = (item: { coord: SplinePathCoord; createdAtMs: number }, at: number) =>
  getRiverItemCanvasPositionAt(item, getLoyKrathongRiverLanes(), at, projection)!;
const items = (n: number) => Array.from({ length: n }, (_, i) => makePublicCreation(i + 1));
function setWorld(zoneItems: readonly PublicCreation[], zoneId = 1) {
  useWorldStore.setState({ ...INITIAL_WORLD_STATE, eventId: "loy_krathong", currentZoneId: zoneId, zoneItems, zoneStatus: "ready" });
}
function savedRelease(overrides: Partial<SavedRelease> = {}): SavedRelease {
  return {
    id: "00000000-0000-4000-8000-0000000000aa",
    zoneId: 1,
    coord: { mode: "SPLINE_PATH", laneId: LOY_KRATHONG_RIVER_LANE_ID, spawnProgress: 0.77, speedFactor: 0.008, lateralOffset: 0.1 },
    createdAtMs: T,
    serverClockOffsetMs: 0,
    movedByServer: false,
    ...overrides,
  };
}
function setRitual(ritual: Partial<typeof INITIAL_RITUAL_STATE>) {
  useUIStore.setState({ ritual: { ...INITIAL_RITUAL_STATE, ...ritual } });
}
const mount = (mode: "RITUAL_RELEASE" | "WORLD_EXPLORE" = "WORLD_EXPLORE") =>
  render(<FlatRiverView mode={mode} now={now} frames={frames} />);
const transformOf = (el: Element) => el.getAttribute("transform");
const expectedTransform = (c: PublicCreation, at: number) => {
  const p = getRiverItemCanvasPositionAtForTest({ coord: c.coord as never, createdAtMs: Date.parse(c.createdAt) }, at);
  return "translate(" + p.x + " " + p.y + ")";
};
const xOf = (el: Element) => Number(/translate\(([-\d.e]+) /.exec(transformOf(el)!)![1]);
const tap = (el: Element, id = 1) => {
  fireEvent.pointerDown(el, { pointerId: id, clientX: 30, clientY: 40, pointerType: "touch" });
  fireEvent.pointerUp(el, { pointerId: id, clientX: 30, clientY: 40, pointerType: "touch" });
};
const ripples = (container: HTMLElement) => [...container.querySelectorAll('[data-testid="flat-ripple"]')];
const visibleRipples = (container: HTMLElement) => ripples(container).filter((r) => r.getAttribute("visibility") === "visible");
const water = (container: HTMLElement) => container.querySelector('[data-input-target="water"]')!;

let scrollTo: ReturnType<typeof vi.fn>;
beforeEach(() => {
  clock = T;
  queue = [];
  handleCounter = 0;
  cancel.mockClear();
  scrollTo = vi.fn();
  HTMLElement.prototype.scrollTo = scrollTo as unknown as typeof HTMLElement.prototype.scrollTo;
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
  useDeviceStore.getState().setQualityTier("FALLBACK_2D");
  useUIStore.setState(useUIStore.getInitialState(), true);
  useBuilderStore.setState(useBuilderStore.getInitialState(), true);
  setWorld(items(5));
});
afterEach(() => {
  cleanup();
  // @ts-expect-error test cleanup of the jsdom gap
  delete HTMLElement.prototype.scrollTo;
});

describe("FlatRiverView tap targets and hint (MFW-59)", () => {
  beforeEach(() => localStorage.clear());

  it("krathong hit circles are at least MIN_TOUCH_TARGET_PX wide", () => {
    const { container } = mount();
    const circles = container.querySelectorAll('[data-input-target="krathong"]');
    expect(circles.length).toBeGreaterThan(0);
    for (const c of circles) expect(2 * Number(c.getAttribute("r"))).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  });

  it("tap hint shows in WORLD_EXPLORE, is tap-through, and goes after a water tap", () => {
    const { container } = mount();
    const hint = screen.getByTestId("scene-tap-hint");
    expect(hint).toHaveTextContent(SCENE_TAP_HINT_COPY.flat2d);
    expect(hint.className).toContain("pointer-events-none");
    expect(hint).toHaveAttribute("data-motion", "pulse");
    expect(hint.closest('[data-overlay-slot="hint"]')).not.toBeNull(); // MFW-54: floats above the bottom sheet
    tap(water(container));
    expect(screen.queryByTestId("scene-tap-hint")).toBeNull();
  });

  it("tap hint is static under reduced motion", () => {
    useDeviceStore.getState().setReducedMotion(true);
    mount();
    expect(screen.getByTestId("scene-tap-hint")).toHaveAttribute("data-motion", "static");
  });

  it("tap hint is absent in RITUAL_RELEASE", () => {
    mount("RITUAL_RELEASE");
    expect(screen.queryByTestId("scene-tap-hint")).toBeNull();
  });
});

describe("FlatRiverView", () => {
  it("renders every zone krathong", () => {
    const { container } = mount();
    expect(screen.getAllByTestId("flat-river-item")).toHaveLength(5);
    expect(screen.getByTestId("flat-river-view")).toHaveAttribute("data-river-item-count", "5");
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("caps the list at ZONE_ITEM_CAP", () => {
    setWorld(
      Array.from({ length: ZONE_ITEM_CAP + 10 }, (_, i) => {
        const c = makePublicCreation(i + 1);
        return { ...c, coord: { ...c.coord, spawnProgress: (i % 10) / 10 } } as PublicCreation;
      }),
    );
    mount();
    expect(screen.getAllByTestId("flat-river-item")).toHaveLength(ZONE_ITEM_CAP);
  });

  it("places every krathong from its stored coord (bit-identical to the three-based math)", () => {
    mount();
    const els = screen.getAllByTestId("flat-river-item");
    items(5).forEach((c, i) => expect(transformOf(els[i])).toBe(expectedTransform(c, T)));
  });

  it("drifts with time and keeps matching the three-based position", () => {
    mount();
    const els = screen.getAllByTestId("flat-river-item");
    const before = xOf(els[0]);
    runFrame(T + 10_000);
    expect(xOf(els[0])).toBeGreaterThan(before);
    items(5).forEach((c, i) => expect(transformOf(els[i])).toBe(expectedTransform(c, T + 10_000)));
  });

  it("throttles frames to the frame budget", () => {
    mount();
    const els = screen.getAllByTestId("flat-river-item");
    const before = transformOf(els[0]);
    runFrame(T + 1);
    expect(transformOf(els[0])).toBe(before);
    runFrame(T + STEP);
    expect(transformOf(els[0])).not.toBe(before);
  });

  it("uses the server clock offset of the saved release", () => {
    setRitual({ phase: "RELEASED", saved: savedRelease({ serverClockOffsetMs: 5_000 }) });
    mount();
    const els = screen.getAllByTestId("flat-river-item");
    expect(transformOf(els[0])).toBe(expectedTransform(items(5)[0], T + 5_000));
  });

  describe("ripples", () => {
    const startR = (RIPPLE_LOOK.startRadius * (1 + RIPPLE_LOOK.ringInnerRatio)) / 2 * projection.scale;
    const endR = (RIPPLE_LOOK.endRadius * (1 + RIPPLE_LOOK.ringInnerRatio)) / 2 * projection.scale;

    it("a water tap starts one pooled ripple at the tap point", () => {
      const { container } = mount();
      tap(water(container));
      const section = screen.getByTestId("flat-river-view");
      expect(section).toHaveAttribute("data-last-gimmick", "ripple");
      expect(section).toHaveAttribute("data-gimmick-count", "1");
      runFrame(T + STEP);
      const visible = visibleRipples(container);
      expect(visible).toHaveLength(1);
      const age = STEP;
      const u = age / RIPPLE_LOOK.durationMs;
      const radius = RIPPLE_LOOK.startRadius + (RIPPLE_LOOK.endRadius - RIPPLE_LOOK.startRadius) * (1 - (1 - u) ** 3);
      expect(Number(visible[0].getAttribute("r"))).toBeCloseTo(((radius * (1 + RIPPLE_LOOK.ringInnerRatio)) / 2) * projection.scale, 3);
      expect(Number(visible[0].getAttribute("r"))).toBeGreaterThan(startR);
    });

    it("starts at the start radius at age 0", () => {
      const { container } = mount();
      clock = T + STEP;
      tap(water(container));
      runFrame(clock); // the same instant: age 0
      expect(Number(visibleRipples(container)[0].getAttribute("r"))).toBeCloseTo(startR, 3);
    });

    it("reduced motion: fade only (final radius), drift continues", () => {
      act(() => useDeviceStore.getState().setReducedMotion(true));
      const { container } = mount();
      const els = screen.getAllByTestId("flat-river-item");
      const before = xOf(els[0]);
      tap(water(container));
      runFrame(T + STEP);
      expect(Number(visibleRipples(container)[0].getAttribute("r"))).toBeCloseTo(endR, 3);
      runFrame(T + 10_000);
      expect(xOf(els[0])).toBeGreaterThan(before);
    });

    it("never exceeds the pool cap and never adds elements per tap", () => {
      const { container } = mount();
      const count = ripples(container).length;
      expect(count).toBe(FALLBACK_2D_EFFECT_POOL_CAPS.ripple);
      expect(screen.getByTestId("flat-river-view")).toHaveAttribute("data-ripple-capacity", String(count));
      for (let i = 0; i < count + 2; i++) tap(water(container), i + 1);
      runFrame(T + STEP);
      expect(visibleRipples(container)).toHaveLength(FALLBACK_2D_EFFECT_POOL_CAPS.ripple);
      expect(ripples(container)).toHaveLength(count);
    });

    it("ends after the ripple duration", () => {
      const { container } = mount();
      tap(water(container));
      runFrame(T + STEP);
      expect(visibleRipples(container)).toHaveLength(1);
      runFrame(T + RIPPLE_LOOK.durationMs + STEP * 2);
      expect(visibleRipples(container)).toHaveLength(0);
    });

    it("a bank tap does nothing", () => {
      const { container } = mount();
      tap(container.querySelector("svg > rect")!);
      expect(screen.getByTestId("flat-river-view")).toHaveAttribute("data-gimmick-count", "0");
      runFrame(T + STEP);
      expect(visibleRipples(container)).toHaveLength(0);
    });

    it("RITUAL_RELEASE ignores taps", () => {
      const { container } = mount("RITUAL_RELEASE");
      tap(water(container));
      expect(screen.getByTestId("flat-river-view")).toHaveAttribute("data-gimmick-count", "0");
      runFrame(T + STEP);
      expect(visibleRipples(container)).toHaveLength(0);
    });
  });

  it("a krathong tap opens the anonymous popup and closing removes it", () => {
    const { container } = mount();
    const hit = container.querySelector('[data-input-target="krathong"][data-creation-id="' + items(5)[2].id + '"]')!;
    tap(hit);
    expect(screen.getByText(INSPECT_POPUP_COPY.dialogTitle)).toBeInTheDocument();
    expect(screen.getByText("ขอให้มีความสุข")).toBeInTheDocument();
    expect(screen.getByTestId("flat-river-view")).toHaveAttribute("data-last-gimmick", "inspect");
    fireEvent.click(screen.getByRole("button", { name: INSPECT_POPUP_COPY.close }));
    expect(screen.queryByText(INSPECT_POPUP_COPY.dialogTitle)).toBeNull();
  });

  it("an owned krathong's 2D popup has the owner switch", () => {
    const zone = items(5);
    const owned = zone[2];
    const closed = { ...zone[3], publicWishText: null, displayName: null };
    setWorld([zone[0], zone[1], owned, closed, zone[4]]);
    const unregister = registerOwnedCreationPredicate((id) => id === owned.id || id === closed.id);
    try {
      const { container } = mount();
      const hitOf = (id: string) => container.querySelector('[data-input-target="krathong"][data-creation-id="' + id + '"]')!;
      const sw = () => screen.getByRole("switch", { name: WISH_SWITCH_COPY.label });
      tap(hitOf(owned.id));
      expect(screen.getByRole("dialog")).toContainElement(sw());
      expect(sw()).toHaveAttribute("aria-checked", owned.publicWishText !== null ? "true" : "false");
      fireEvent.click(screen.getByRole("button", { name: INSPECT_POPUP_COPY.close }));
      tap(hitOf(closed.id), 2);
      expect(sw()).toHaveAttribute("aria-checked", "false");
      fireEvent.click(screen.getByRole("button", { name: INSPECT_POPUP_COPY.close }));
      tap(hitOf(zone[0].id), 3);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.queryByRole("switch")).toBeNull();
    } finally {
      unregister();
    }
  });

  describe("own krathong", () => {
    it("RITUAL_RELEASE shows it on the pier", () => {
      mount("RITUAL_RELEASE");
      const own = screen.getByTestId("flat-own-krathong");
      const lane = lanes.get(LOY_KRATHONG_PIER_RELEASE_SPOT.laneId)!;
      const p = flatProgressToCanvasInto(
        lane,
        LOY_KRATHONG_PIER_RELEASE_SPOT.progress,
        LOY_KRATHONG_PIER_RELEASE_SPOT.lateralOffset,
        projection,
        createCanvasPointOut(),
        createFlatCanvasScratch(),
      );
      expect(transformOf(own)).toBe(`translate(${p.x} ${p.y})`);
      expect(screen.getByTestId("flat-river-view")).toHaveAttribute("data-flat-own-krathong", "pier");
      expect(screen.getAllByTestId("flat-river-item")).toHaveLength(5);
    });

    it("after the release it rides the river from its saved coord, once, without a hit circle", () => {
      const zone = items(5);
      const saved = savedRelease({ id: zone[1].id });
      setRitual({ phase: "RELEASED", saved });
      const { container } = mount();
      expect(screen.getByTestId("flat-river-view")).toHaveAttribute("data-flat-own-krathong", "river");
      expect(screen.queryByTestId("flat-own-krathong")).toBeNull();
      expect(screen.getAllByTestId("flat-river-item")).toHaveLength(5); // the zone copy is not duplicated
      const own = container.querySelectorAll('[data-own="true"]');
      expect(own).toHaveLength(1);
      expect(own[0].getAttribute("data-creation-id")).toBe(zone[1].id);
      expect(transformOf(own[0])).toBe(expectedTransform({ ...zone[1], coord: saved.coord, createdAt: new Date(saved.createdAtMs).toISOString() }, T));
      expect(own[0].querySelector("[data-input-target]")).toBeNull();
    });

    it("is hidden when the saved zone is not the visible one", () => {
      setRitual({ phase: "RELEASED", saved: savedRelease({ zoneId: 2 }) });
      const { container } = mount();
      expect(container.querySelector('[data-own="true"]')).toBeNull();
      expect(screen.getByTestId("flat-river-view")).toHaveAttribute("data-flat-own-krathong", "none");
    });
  });

  describe("Find My", () => {
    const setClientWidth = (container: HTMLElement) =>
      Object.defineProperty(container.querySelector('[data-testid="flat-river-scroller"]')!, "clientWidth", { value: 360, configurable: true });
    const focus = (id: string | null, requestId?: number) =>
      act(() => useWorldStore.setState((s) => ({ focusedCreationId: id, focusRequestId: requestId ?? s.focusRequestId })));

    it("scrolls to centre the krathong once and marks it", () => {
      const { container } = mount();
      setClientWidth(container);
      scrollTo.mockClear();
      const target = items(5)[2];
      focus(target.id, 1);
      const p = getRiverItemCanvasPositionAtForTest({ coord: target.coord as never, createdAtMs: Date.parse(target.createdAt) }, T);
      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(scrollTo).toHaveBeenCalledWith({ left: flatRiverScrollLeft(p.x, 360, W), behavior: "smooth" });
      // MFW-67: a steady size-up of the focused sprite, no ring.
      expect(screen.queryByTestId("flat-focus-ring")).toBeNull();
      const marked = container.querySelector(`[data-creation-id="${target.id}"][data-testid="flat-river-item"]`)!;
      expect(marked).toHaveAttribute("data-marked", "true");
      expect(marked.getAttribute("transform")).toBe(`translate(${p.x} ${p.y}) scale(${FLAT_RIVER_MARK_SCALE})`);
      for (const other of screen.getAllByTestId("flat-river-item").filter((el) => el !== marked)) {
        expect(other).not.toHaveAttribute("data-marked");
        expect(other.getAttribute("transform")).not.toContain("scale(");
      }
      expect(screen.getByTestId("flat-river-view")).toHaveAttribute("data-focused-creation-id", target.id);
      focus(target.id, 1);
      expect(scrollTo).toHaveBeenCalledTimes(1);
      focus(target.id, 2); // selecting the same krathong again asks again
      expect(scrollTo).toHaveBeenCalledTimes(2);
    });

    it("jumps instantly under reduced motion", () => {
      act(() => useDeviceStore.getState().setReducedMotion(true));
      const { container } = mount();
      setClientWidth(container);
      scrollTo.mockClear();
      focus(items(5)[0].id, 1);
      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }));
    });

    it("waits for a krathong that is not rendered yet", () => {
      const { container } = mount();
      setClientWidth(container);
      scrollTo.mockClear();
      const late = makePublicCreation(9);
      focus(late.id, 1);
      expect(scrollTo).not.toHaveBeenCalled();
      expect(container.querySelector("[data-marked]")).toBeNull();
      act(() => useWorldStore.setState({ zoneItems: [...items(5), late] }));
      expect(scrollTo).toHaveBeenCalledTimes(1);
    });
  });

  it("centres the pier on mount when nothing is focused", () => {
    mount();
    const scroller = screen.getByTestId("flat-river-scroller");
    expect(scroller.clientWidth).toBe(0);
    const { x } = (() => {
      const tipX = projection.offsetX + (scene.pierTip.x - projection.bounds.minX) * projection.scale;
      return { x: tipX };
    })();
    expect(scrollTo).toHaveBeenCalledWith({ left: flatRiverScrollLeft(x, 0, W), behavior: "auto" });
  });

  it("zone switch drops ripples and closes the popup", () => {
    const { container } = mount();
    tap(water(container));
    tap(container.querySelector('[data-input-target="krathong"]')!, 2);
    runFrame(T + STEP);
    expect(visibleRipples(container)).toHaveLength(1);
    expect(screen.getByText(INSPECT_POPUP_COPY.dialogTitle)).toBeInTheDocument();
    act(() => setWorld(items(5), 2));
    expect(screen.queryByText(INSPECT_POPUP_COPY.dialogTitle)).toBeNull();
    runFrame(T + STEP * 3);
    expect(visibleRipples(container)).toHaveLength(0);
  });

  it("never renders private fields (invariant C)", () => {
    const rows = items(3).map((c) => ({
      ...c,
      ownerTokenHash: "HASH-SENTINEL",
      privateWishText: "PRIVATE-SENTINEL",
      owner_token: "TOKEN-SENTINEL",
    })) as unknown as PublicCreation[];
    setWorld(rows);
    const { container } = mount();
    const html = container.innerHTML;
    for (const sentinel of ["HASH-SENTINEL", "PRIVATE-SENTINEL", "TOKEN-SENTINEL"]) expect(html).not.toContain(sentinel);
  });

  it("unmount cancels the frame loop", () => {
    const { unmount } = mount();
    runFrame(T + STEP);
    const last = handleCounter;
    unmount();
    expect(cancel).toHaveBeenCalledWith(last);
  });

  describe("full-screen stage (MFW-54, backlog 10.2)", () => {
    const SCROLLER = '[data-testid="flat-river-scroller"]';
    const SECTION = '[data-testid="flat-river-view"]';
    let stageHeight = 640;
    /** The stage height is read from the section (a classic scrollbar must not feed back into the map height). */
    const stubStageHeight = () =>
      Object.defineProperty(HTMLElement.prototype, "clientHeight", {
        configurable: true,
        get(this: HTMLElement) {
          if (this.matches(SECTION)) return stageHeight;
          return this.matches(SCROLLER) ? stageHeight - SCROLLBAR_PX : 0;
        },
      });
    const SCROLLBAR_PX = 15; // a classic horizontal scrollbar: the scroller is shorter than the stage
    const unstubStageHeight = () => {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight;
    };
    const svgOf = (c: HTMLElement) => c.querySelector("svg")!;

    it("map height follows the stage", () => {
      stageHeight = 640;
      stubStageHeight();
      try {
        const tall = getLoyKrathongFlatRiver(640).projection;
        const { container } = mount();
        expect(svgOf(container).getAttribute("height")).toBe("640");
        expect(svgOf(container).getAttribute("width")).toBe(String(tall.viewport.width));
        const els = screen.getAllByTestId("flat-river-item");
        items(5).forEach((c, i) => {
          const p = getRiverItemCanvasPositionAt(
            { coord: c.coord as never, createdAtMs: Date.parse(c.createdAt) },
            getLoyKrathongRiverLanes(),
            T,
            tall,
          )!;
          expect(transformOf(els[i])).toBe("translate(" + p.x + " " + p.y + ")");
        });

        tap(water(container));
        runFrame(T + STEP);
        const visible = visibleRipples(container);
        expect(visible).toHaveLength(1);
        const u = STEP / RIPPLE_LOOK.durationMs;
        const radius = RIPPLE_LOOK.startRadius + (RIPPLE_LOOK.endRadius - RIPPLE_LOOK.startRadius) * (1 - (1 - u) ** 3);
        expect(Number(visible[0].getAttribute("r"))).toBeCloseTo(((radius * (1 + RIPPLE_LOOK.ringInnerRatio)) / 2) * tall.scale, 3);
        expect(Number(visible[0].getAttribute("cx"))).toBeCloseTo(30, 6);
        expect(Number(visible[0].getAttribute("cy"))).toBeCloseTo(40, 6);
      } finally {
        unstubStageHeight();
      }
    });

    it("resize keeps the scroll centre", () => {
      let callback: ResizeObserverCallback | null = null;
      vi.stubGlobal(
        "ResizeObserver",
        class {
          constructor(cb: ResizeObserverCallback) {
            callback = cb;
          }
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      );
      stageHeight = 640;
      stubStageHeight();
      // The viewport width must be known when the 640 map commits: that is the width the rescale reads as the old one.
      Object.defineProperty(HTMLElement.prototype, "clientWidth", {
        configurable: true,
        get(this: HTMLElement) {
          return this.matches(SCROLLER) ? 360 : 0;
        },
      });
      try {
        mount();
        const scroller = screen.getByTestId("flat-river-scroller");
        Object.defineProperty(scroller, "clientWidth", { value: 360, writable: true, configurable: true });
        Object.defineProperty(scroller, "scrollLeft", { value: 500, writable: true, configurable: true });
        scrollTo.mockClear();
        stageHeight = 900;
        act(() => callback!([], {} as ResizeObserver));
        const s640 = getLoyKrathongFlatRiver(640).projection.scale;
        const big = getLoyKrathongFlatRiver(900).projection;
        expect(scrollTo).toHaveBeenCalledTimes(1);
        expect(scrollTo).toHaveBeenCalledWith({
          left: flatRiverScrollLeftAfterRescale(500, 360, 360, big.scale / s640, 0, big.viewport.width),
          behavior: "auto",
        });
      } finally {
        unstubStageHeight();
        delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
        vi.unstubAllGlobals();
      }
    });

    it("a first measurement wider than the old map centres the pier (desktop)", () => {
      let callback: ResizeObserverCallback | null = null;
      vi.stubGlobal(
        "ResizeObserver",
        class {
          constructor(cb: ResizeObserverCallback) {
            callback = cb;
          }
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      );
      const wide = W + 100; // wider than the default-height map: the old map could not scroll
      Object.defineProperty(HTMLElement.prototype, "clientWidth", {
        configurable: true,
        get(this: HTMLElement) {
          return this.matches(SCROLLER) ? wide : 0;
        },
      });
      stageHeight = 0; // not measured yet: default map
      stubStageHeight();
      try {
        mount();
        scrollTo.mockClear();
        stageHeight = 900;
        act(() => callback!([], {} as ResizeObserver));
        const big = getLoyKrathongFlatRiver(900);
        const pierX = big.projection.offsetX + (big.scene.pierTip.x - big.projection.bounds.minX) * big.projection.scale;
        expect(scrollTo).toHaveBeenCalledTimes(1);
        expect(scrollTo).toHaveBeenCalledWith({
          left: flatRiverScrollLeft(pierX, wide, big.projection.viewport.width),
          behavior: "auto",
        });
      } finally {
        unstubStageHeight();
        delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
        vi.unstubAllGlobals();
      }
    });

    it("no measurement → default map", () => {
      const { container } = mount();
      expect(svgOf(container).getAttribute("height")).toBe(String(FLAT_RIVER_VIEW_HEIGHT_PX));
    });

    it("the inspect dialog sits in the sheet slot", () => {
      const { container } = mount();
      tap(container.querySelector('[data-input-target="krathong"][data-creation-id="' + items(5)[2].id + '"]')!);
      expect(screen.getByRole("dialog").closest('[data-overlay-slot="sheet"]')).not.toBeNull();
    });
  });
});
