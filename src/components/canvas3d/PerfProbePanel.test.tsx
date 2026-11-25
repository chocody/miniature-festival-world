import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PERF_PROBE_GLOBAL_NAME,
  PERF_PROBE_SAMPLE_INTERVAL_MS,
  PERF_SOAK_DWELL_MS,
  PERF_SOAK_SWITCHES,
  PERF_SOAK_ZONE_COUNT,
} from "@/config/perfProbe.config";
import { ZONE_ITEM_CAP } from "@/config/world.config";
import { PERF_PROBE_COPY, PerfProbePanel } from "./PerfProbePanel";
import type { RendererInfoSource } from "./perfProbe";

const fakeRenderer: RendererInfoSource = {
  info: {
    memory: { geometries: 3, textures: 1 },
    render: { calls: 12, triangles: 400, frame: 7 },
    programs: [{}, {}],
  },
};
const hook = () => (window as unknown as Record<string, { sample(): Record<string, unknown> | null } | undefined>)[PERF_PROBE_GLOBAL_NAME];

function ui(over: Partial<Parameters<typeof PerfProbePanel>[0]> = {}) {
  return (
    <PerfProbePanel
      rendererRef={{ current: fakeRenderer }}
      riverItemCount={5}
      qualityTier="LOW"
      soakEnabled
      onSoakItems={() => {}}
      {...over}
    />
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("PerfProbePanel", () => {
  it("shows the renderer counters after the sample interval, or n/a without a renderer", () => {
    const { container, unmount } = render(ui());
    const aside = container.querySelector('aside[data-testid="perf-probe"]')!;
    act(() => void vi.advanceTimersByTime(PERF_PROBE_SAMPLE_INTERVAL_MS));
    expect(aside.getAttribute("data-calls")).toBe("12");
    expect(aside.getAttribute("data-geometries")).toBe("3");
    expect(aside.getAttribute("data-programs")).toBe("2");
    expect(aside.getAttribute("data-river-items")).toBe("5");
    unmount();
    const empty = render(ui({ rendererRef: { current: null } }));
    act(() => void vi.advanceTimersByTime(PERF_PROBE_SAMPLE_INTERVAL_MS));
    const a2 = empty.container.querySelector("aside")!;
    expect(a2.hasAttribute("data-calls")).toBe(false);
    expect(a2.textContent).toContain(PERF_PROBE_COPY.notAvailable);
  });

  it("registers the automation hook and removes it on unmount", () => {
    const view = render(ui());
    expect(hook()!.sample()).toMatchObject({ geometries: 3, calls: 12, programs: 2, riverItems: 5 });
    view.unmount();
    expect(hook()).toBeUndefined();
  });

  it("runs the soak to the end and hands the river back", () => {
    const onSoakItems = vi.fn();
    const { container } = render(ui({ onSoakItems }));
    const aside = container.querySelector("aside")!;
    fireEvent.click(screen.getByRole("button", { name: PERF_PROBE_COPY.runSoak }));
    expect(onSoakItems).toHaveBeenCalledTimes(1);
    expect(onSoakItems.mock.calls[0][0]).toHaveLength(ZONE_ITEM_CAP);
    expect(aside.getAttribute("data-soak-status")).toBe("running");
    act(() => void vi.advanceTimersByTime((PERF_SOAK_ZONE_COUNT + PERF_SOAK_SWITCHES) * PERF_SOAK_DWELL_MS));
    expect(aside.getAttribute("data-soak-status")).toBe("done");
    expect(onSoakItems).toHaveBeenLastCalledWith(null);
    const parsed = JSON.parse(aside.getAttribute("data-soak-result")!);
    expect(parsed.switches).toBe(PERF_SOAK_SWITCHES);
    expect(parsed.delta.geometries).toBe(0);
  });

  it("shows no soak button when disabled", () => {
    render(ui({ soakEnabled: false }));
    expect(screen.queryByRole("button", { name: PERF_PROBE_COPY.runSoak })).toBeNull();
  });

  it("cancels the soak when disabled mid-run and when unmounted mid-run", () => {
    const onSoakItems = vi.fn();
    const view = render(ui({ onSoakItems }));
    fireEvent.click(screen.getByRole("button", { name: PERF_PROBE_COPY.runSoak }));
    view.rerender(ui({ onSoakItems, soakEnabled: false }));
    expect(onSoakItems).toHaveBeenLastCalledWith(null);
    expect(view.container.querySelector("aside")!.getAttribute("data-soak-status")).toBe("idle");

    view.rerender(ui({ onSoakItems }));
    fireEvent.click(screen.getByRole("button", { name: PERF_PROBE_COPY.runSoak }));
    onSoakItems.mockClear();
    view.unmount();
    expect(onSoakItems).toHaveBeenLastCalledWith(null);
    expect(vi.getTimerCount()).toBe(0);
  });
});
