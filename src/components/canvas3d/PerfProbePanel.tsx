"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { QualityTier } from "@/config/performance.config";
import {
  BYTES_PER_MEBIBYTE,
  PERF_PROBE_SAMPLE_INTERVAL_MS,
  PERF_SOAK_DWELL_MS,
  PERF_SOAK_SWITCHES,
  PERF_SOAK_ZONE_COUNT,
} from "@/config/perfProbe.config";
import { ZONE_ITEM_CAP } from "@/config/world.config";
import { useDeviceStore } from "@/store/useDeviceStore";
import { readJsHeapBytes, readRendererSample, registerPerfProbeHook, type RendererInfoSource, type RendererSample } from "./perfProbe";
import { buildPerfSoakZones, createPerfSoakRunner, type PerfSoakResult, type PerfSoakRunner } from "./perfSoak";
import type { RiverFlowItem } from "./RiverFlow";

/** English on purpose: a developer and owner diagnostic, not user-facing product UI. */
export const PERF_PROBE_COPY = Object.freeze({
  title: "Perf probe (MFW-34)",
  runSoak: "Run zone-switch soak",
  running: (done: number, total: number) => `Soak running… ${done}/${total}`,
  done: "Soak done",
  notAvailable: "n/a",
});

export interface PerfProbePanelProps {
  readonly rendererRef: RefObject<RendererInfoSource | null>;
  readonly riverItemCount: number;
  readonly qualityTier: QualityTier;
  readonly soakEnabled: boolean; // mode === "WORLD_EXPLORE"
  readonly onSoakItems: (items: readonly RiverFlowItem[] | null) => void;
}

type SoakStatus = "idle" | "running" | "done";

const fmtNumber = (value: number | undefined): string => (value === undefined ? PERF_PROBE_COPY.notAvailable : String(value));
const fmtHeap = (bytes: number | null | undefined): string =>
  bytes === null || bytes === undefined ? PERF_PROBE_COPY.notAvailable : `${(bytes / BYTES_PER_MEBIBYTE).toFixed(1)} MiB`;

export function PerfProbePanel({ rendererRef, riverItemCount, qualityTier, soakEnabled, onSoakItems }: PerfProbePanelProps) {
  const fps = useDeviceStore((s) => s.fps);
  const riverItemCountRef = useRef(riverItemCount);
  const onSoakItemsRef = useRef(onSoakItems);
  useLayoutEffect(() => {
    riverItemCountRef.current = riverItemCount;
    onSoakItemsRef.current = onSoakItems;
  });
  const [sample, setSample] = useState<RendererSample | null>(null);
  const [status, setStatus] = useState<SoakStatus>("idle");
  const [progress, setProgress] = useState<readonly [number, number]>([0, PERF_SOAK_SWITCHES]);
  const [result, setResult] = useState<PerfSoakResult | null>(null);
  const runnerRef = useRef<PerfSoakRunner | null>(null);

  const sampleNow = useCallback(
    () => readRendererSample(rendererRef.current, riverItemCountRef.current, readJsHeapBytes()),
    [rendererRef],
  );

  useEffect(() => registerPerfProbeHook({ sample: sampleNow }), [sampleNow]);

  useEffect(() => {
    const id = window.setInterval(() => setSample(sampleNow()), PERF_PROBE_SAMPLE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [sampleNow]);

  useEffect(() => {
    if (!soakEnabled) runnerRef.current?.cancel();
  }, [soakEnabled]);

  useEffect(
    () => () => {
      runnerRef.current?.cancel();
    },
    [],
  );

  function startSoak() {
    const zones = buildPerfSoakZones(PERF_SOAK_ZONE_COUNT, ZONE_ITEM_CAP, Date.now());
    const runner = createPerfSoakRunner({
      zones,
      switches: PERF_SOAK_SWITCHES,
      dwellMs: PERF_SOAK_DWELL_MS,
      setItems: (items) => onSoakItemsRef.current(items),
      sample: sampleNow,
      schedule: (cb, ms) => {
        const t = window.setTimeout(cb, ms);
        return () => window.clearTimeout(t);
      },
      onProgress: (done, total) => setProgress([done, total]),
      onCancel: () => setStatus("idle"),
      onDone: (r) => {
        setResult(r);
        setStatus("done");
      },
    });
    runnerRef.current = runner;
    setStatus("running");
    setResult(null);
    setProgress([0, PERF_SOAK_SWITCHES]);
    runner.start();
  }

  const rows: readonly { label: string; before: string; after: string; delta: string }[] = result
    ? [
        ...(["geometries", "textures", "programs", "calls", "triangles"] as const).map((key) => ({
          label: key,
          before: fmtNumber(result.before?.[key]),
          after: fmtNumber(result.after?.[key]),
          delta: fmtNumber(result.delta?.[key]),
        })),
        {
          label: "JS heap",
          before: fmtHeap(result.before?.jsHeapBytes),
          after: fmtHeap(result.after?.jsHeapBytes),
          delta: fmtHeap(result.delta?.jsHeapBytes),
        },
      ]
    : [];

  return (
    <aside
      aria-label="Performance probe"
      data-testid="perf-probe"
      data-quality-tier={qualityTier}
      data-geometries={sample?.geometries}
      data-textures={sample?.textures}
      data-programs={sample?.programs}
      data-calls={sample?.calls}
      data-triangles={sample?.triangles}
      data-river-items={sample?.riverItems}
      data-soak-status={status}
      data-soak-result={result ? JSON.stringify(result) : undefined}
      className="mb-4 w-full rounded-2xl border border-indigo-950/30 p-3 font-mono text-xs"
    >
      <p className="font-semibold">{PERF_PROBE_COPY.title}</p>
      <dl className="grid grid-cols-2 gap-x-3">
        <dt>tier</dt>
        <dd>{qualityTier}</dd>
        <dt>fps</dt>
        <dd>{fps === null ? PERF_PROBE_COPY.notAvailable : Math.round(fps)}</dd>
        <dt>river items</dt>
        <dd>{fmtNumber(sample?.riverItems)}</dd>
        <dt>draw calls</dt>
        <dd>{fmtNumber(sample?.calls)}</dd>
        <dt>triangles</dt>
        <dd>{fmtNumber(sample?.triangles)}</dd>
        <dt>geometries</dt>
        <dd>{fmtNumber(sample?.geometries)}</dd>
        <dt>textures</dt>
        <dd>{fmtNumber(sample?.textures)}</dd>
        <dt>programs</dt>
        <dd>{fmtNumber(sample?.programs)}</dd>
        <dt>JS heap</dt>
        <dd>{fmtHeap(sample?.jsHeapBytes)}</dd>
        <dt>frame</dt>
        <dd>{fmtNumber(sample?.frame)}</dd>
      </dl>
      {soakEnabled && status !== "running" && (
        <button type="button" className="mt-2 rounded-lg border border-indigo-950/40 px-3 py-1" onClick={startSoak}>
          {PERF_PROBE_COPY.runSoak}
        </button>
      )}
      {status === "running" && <p className="mt-2">{PERF_PROBE_COPY.running(progress[0], progress[1])}</p>}
      {status === "done" && <p className="mt-2">{PERF_PROBE_COPY.done}</p>}
      {result && (
        <table className="mt-2 w-full text-left">
          <thead>
            <tr>
              <th>metric</th>
              <th>before</th>
              <th>after</th>
              <th>delta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td>{row.before}</td>
                <td>{row.after}</td>
                <td>{row.delta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </aside>
  );
}
