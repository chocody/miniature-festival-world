"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { LOY_KRATHONG_PIER_RELEASE_SPOT } from "@/config/events/loyKrathong.river.config";
import {
  FLAT_KRATHONG_VIEW_AZIMUTH_RAD,
  FLAT_KRATHONG_VIEW_ELEVATION_RAD,
  FLAT_RIVER_FRAME_INTERVAL_MS,
  FLAT_RIVER_HIGHLIGHT,
  FLAT_RIVER_PROP_SIZES,
  FLAT_RIVER_SPRITE_SCALE,
  FLAT_MIN_TAP_RADIUS_PX,
  FLAT_RIVER_TAP_RADIUS,
  FLAT_VIEW_COLORS,
  FLAT_VIEW_COPY,
} from "@/config/fallback2d.config";
import { RIPPLE_LOOK, SCENE_TAP_HINT_COPY } from "@/config/gimmicks.config";
import { FALLBACK_2D_EFFECT_POOL_CAPS } from "@/config/performance.config";
import { DEFAULT_KRATHONG_APPEARANCE } from "@/core/customization";
import { createObjectPoolManager } from "@/core/effects/objectPoolManager";
import { createRippleFrame, writeRippleFrameAt } from "@/core/effects/gimmickCurves";
import {
  buildKrathongLayers2D,
  canvasToWorldXZ,
  createCanvasPointOut,
  createFlatCanvasScratch,
  flatCoordToCanvasInto,
  flatProgressToCanvasInto,
  flatRiverScrollLeft,
  getLoyKrathongFlatRiver,
  worldToCanvas,
  worldToCanvasInto,
  type FlatLane,
  type FlatProp,
  type KrathongLayer2D,
} from "@/core/fallback2d/flat";
import { createInputSeparator, type InputSeparator, type InteractionAction, type InteractionTarget } from "@/core/interaction";
import { excludeOwnAndCap, isOwnZoneVisible } from "@/core/ritual";
import { publicCreationsToRiverItems } from "@/core/world/zoneRiverItems";
import type { SplinePathCoord } from "@/core/coordinates/SplinePathCoord";
import type { KrathongAppearance } from "@/core/customization/types";
import { InspectPopup } from "@/components/ui/InspectPopup";
import { OwnerWishSection } from "@/components/ui/OwnerWishSection";
import { SceneTapHint } from "@/components/ui/SceneTapHint";
import { findInspectedCreation } from "@/components/ui/inspectedCreation";
import { useSceneTapHint } from "@/components/ui/useSceneTapHint";
import { useBuilderStore } from "@/store/useBuilderStore";
import { useDeviceStore } from "@/store/useDeviceStore";
import { useUIStore } from "@/store/useUIStore";
import { useWorldStore } from "@/store/useWorldStore";
import { FlatKrathongShapes } from "./FlatKrathongShapes";
import { useFlatFocusRequestId, useFlatFocusTarget } from "./useFlatFocusTarget";

export interface FrameScheduler {
  request(callback: () => void): number;
  cancel(handle: number): void;
}
export interface FlatRiverViewProps {
  readonly mode: "RITUAL_RELEASE" | "WORLD_EXPLORE";
  /** Default Date.now (injectable for tests). */
  readonly now?: () => number;
  /** Default requestAnimationFrame / cancelAnimationFrame. */
  readonly frames?: FrameScheduler;
}

interface FlatRiverRenderItem {
  readonly id: string;
  readonly coord: SplinePathCoord;
  readonly createdAtMs: number;
  readonly lane: FlatLane;
  readonly layers: readonly KrathongLayer2D[];
  readonly own: boolean;
  readonly setElement: (el: SVGGElement | null) => void;
}
type GimmickKind = "ripple" | "inspect";

const SPRITE_VIEW = Object.freeze({
  azimuthRad: FLAT_KRATHONG_VIEW_AZIMUTH_RAD,
  elevationRad: FLAT_KRATHONG_VIEW_ELEVATION_RAD,
  modelYawRad: 0,
});
const defaultNow = (): number => Date.now();
const defaultFrames: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};
const HALF = 2;

function scrollScrollerTo(el: HTMLElement, left: number, behavior: ScrollBehavior): void {
  if (typeof el.scrollTo === "function") el.scrollTo({ left, behavior });
  else el.scrollLeft = left;
}
/** Canvas point of the pier release spot (MFW-23's three-free config), or null if its lane is unknown. */
function pierSpotCanvasPoint(): { readonly x: number; readonly y: number } | null {
  const { lanes, projection } = getLoyKrathongFlatRiver();
  const lane = lanes.get(LOY_KRATHONG_PIER_RELEASE_SPOT.laneId);
  if (!lane) return null;
  const p = flatProgressToCanvasInto(
    lane,
    LOY_KRATHONG_PIER_RELEASE_SPOT.progress,
    LOY_KRATHONG_PIER_RELEASE_SPOT.lateralOffset,
    projection,
    createCanvasPointOut(),
    createFlatCanvasScratch(),
  );
  return { x: p.x, y: p.y };
}
function polygonPoints(points: readonly { readonly x: number; readonly y: number }[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

/**
 * Semi top-down 2D river of FALLBACK_2D (MFW-33): a horizontally scrollable SVG map. Krathongs are placed from the SAME stored
 * SplinePathCoord and lane definitions as the 3D river (invariant B); only transforms change per frame. Ripples come from a fixed pool
 * of pre-rendered circles (invariant E). Positions are derived at render time and never stored (invariant A).
 */
export function FlatRiverView({ mode, now = defaultNow, frames = defaultFrames }: FlatRiverViewProps) {
  const { lanes, scene, projection } = getLoyKrathongFlatRiver();
  const mapWidth = projection.viewport.width;
  const mapHeight = projection.viewport.height;

  const reducedMotion = useDeviceStore((s) => s.reducedMotion);
  const eventId = useWorldStore((s) => s.eventId);
  const currentZoneId = useWorldStore((s) => s.currentZoneId);
  const zoneItems = useWorldStore((s) => s.zoneItems);
  const ritual = useUIStore((s) => s.ritual);
  const builderAppearance = useBuilderStore((s) => s.appearance);
  const focusId = useFlatFocusTarget();
  const focusRequestId = useFlatFocusRequestId();

  // Static map art, once.
  const art = useMemo(() => {
    const toCanvas = (p: { readonly x: number; readonly z: number }) => worldToCanvas(p, projection);
    const waterPath = `${scene.waterOutline.map((p, i) => `${i === 0 ? "M" : "L"} ${toCanvas(p).x} ${toCanvas(p).y}`).join(" ")} Z`;
    const pierPoints = polygonPoints(scene.pierDeck.map(toCanvas));
    const prop = (p: FlatProp, size: number) => ({ ...toCanvas(p), size: size * p.scale * projection.scale });
    return {
      waterPath,
      pierPoints,
      pierTipX: toCanvas(scene.pierTip).x,
      houses: scene.houses.map((p) => ({
        ...toCanvas(p),
        halfW: FLAT_RIVER_PROP_SIZES.houseHalfWidth * p.scale * projection.scale,
        halfD: FLAT_RIVER_PROP_SIZES.houseHalfDepth * p.scale * projection.scale,
      })),
      trees: scene.trees.map((p) => prop(p, FLAT_RIVER_PROP_SIZES.treeRadius)),
      lamps: scene.lamps.map((p) => prop(p, FLAT_RIVER_PROP_SIZES.lampRadius)),
    };
  }, [scene, projection]);

  const saved = ritual.saved;
  const pierPreview = mode === "RITUAL_RELEASE" && ritual.phase !== "RELEASED";
  const ownOnRiver =
    mode === "WORLD_EXPLORE" && ritual.phase === "RELEASED" && saved !== null && isOwnZoneVisible(saved.zoneId, currentZoneId);
  const ownAppearance: KrathongAppearance = builderAppearance ?? DEFAULT_KRATHONG_APPEARANCE;

  // Mutable registry of the item elements (written by ref callbacks, read by the frame loop). Never rendered.
  const [elements] = useState(() => new Map<string, SVGGElement>());

  const { items, shared } = useMemo(() => {
    const zoneRiverItems =
      eventId !== null && currentZoneId !== null ? publicCreationsToRiverItems(zoneItems, { eventId, zoneId: currentZoneId }) : [];
    const sharedItems = excludeOwnAndCap(zoneRiverItems, saved?.id ?? null, pierPreview || ownOnRiver);
    const register = (id: string) => (el: SVGGElement | null) => {
      if (el) elements.set(id, el);
      else elements.delete(id);
    };
    const list: FlatRiverRenderItem[] = [];
    for (const it of sharedItems) {
      const lane = lanes.get(it.coord.laneId);
      if (!lane) continue;
      list.push({
        id: it.id,
        coord: it.coord,
        createdAtMs: it.createdAtMs,
        lane,
        layers: buildKrathongLayers2D(it.appearance, SPRITE_VIEW),
        own: false,
        setElement: register(it.id),
      });
    }
    if (ownOnRiver && saved !== null) {
      const lane = lanes.get(saved.coord.laneId);
      if (lane) {
        list.push({
          id: saved.id,
          coord: saved.coord,
          createdAtMs: saved.createdAtMs,
          lane,
          layers: buildKrathongLayers2D(ownAppearance, SPRITE_VIEW),
          own: true,
          setElement: register(saved.id),
        });
      }
    }
    return { items: list, shared: sharedItems };
  }, [eventId, currentZoneId, zoneItems, saved, pierPreview, ownOnRiver, ownAppearance, lanes, elements]);

  const ownLayers = useMemo(() => buildKrathongLayers2D(ownAppearance, SPRITE_VIEW), [ownAppearance]);
  const pier = useMemo(() => pierSpotCanvasPoint(), []);

  const clockOffsetMs = saved?.serverClockOffsetMs ?? 0;
  const spritePx = FLAT_RIVER_SPRITE_SCALE * projection.scale;
  const tapPx = Math.max(FLAT_RIVER_TAP_RADIUS * projection.scale, FLAT_MIN_TAP_RADIUS_PX);
  const ringRadiusPx = ((FLAT_RIVER_HIGHLIGHT.innerRadius + FLAT_RIVER_HIGHLIGHT.outerRadius) / HALF) * projection.scale;
  const ringStrokePx = (FLAT_RIVER_HIGHLIGHT.outerRadius - FLAT_RIVER_HIGHLIGHT.innerRadius) * projection.scale;

  const pools = useMemo(() => createObjectPoolManager(FALLBACK_2D_EFFECT_POOL_CAPS), []);
  const rippleSlots = useMemo(() => Array.from({ length: pools.ripple.capacity }, (_, slot) => slot), [pools]);
  useEffect(() => () => pools.releaseAll(), [pools]);

  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [gimmick, setGimmick] = useState<{ kind: GimmickKind | null; count: number }>({ kind: null, count: 0 });
  const recordGimmick = useCallback((kind: GimmickKind) => setGimmick((g) => ({ kind, count: g.count + 1 })), []);
  const [seenZoneId, setSeenZoneId] = useState(currentZoneId);
  if (seenZoneId !== currentZoneId) {
    setSeenZoneId(currentZoneId);
    setInspectedId(null);
  }
  // Zone switch: drop every running ripple (invariant E).
  useEffect(() => {
    pools.releaseAll();
  }, [currentZoneId, pools]);
  const inspected = useMemo(
    () => (mode === "WORLD_EXPLORE" && inspectedId !== null ? findInspectedCreation(shared, inspectedId) : null),
    [mode, inspectedId, shared],
  );

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const ringRef = useRef<SVGCircleElement | null>(null);
  const rippleEls = useRef<(SVGCircleElement | null)[]>([]);
  const scratch = useRef(createFlatCanvasScratch());
  const canvasPoint = useRef(createCanvasPointOut());
  const rippleFrame = useRef(createRippleFrame());
  const latest = useRef({ items, clockOffsetMs, reducedMotion, focusId });
  const scrolledFor = useRef<string | null>(null);
  const pendingTap = useRef<{ target: InteractionTarget | null; creationId: string | null; x: number; y: number; pointerType: string } | null>(
    null,
  );

  const writeFrame = useCallback(
    (tMs: number) => {
      const { items: list, clockOffsetMs: offset, reducedMotion: reduced, focusId: focused } = latest.current;
      const out = canvasPoint.current;
      const riverNow = tMs + offset;
      let ringX = 0;
      let ringY = 0;
      let ringShown = false;
      for (const it of list) {
        const el = elements.get(it.id);
        if (!el) continue;
        flatCoordToCanvasInto(it.coord, it.lane, it.createdAtMs, riverNow, projection, out, scratch.current);
        el.setAttribute("transform", "translate(" + out.x + " " + out.y + ")");
        if (it.id === focused) {
          ringX = out.x;
          ringY = out.y;
          ringShown = true;
        }
      }
      const ring = ringRef.current;
      if (ring) {
        if (ringShown) {
          ring.setAttribute("cx", String(ringX));
          ring.setAttribute("cy", String(ringY));
          ring.setAttribute("visibility", "visible");
        } else ring.setAttribute("visibility", "hidden");
      }
      const frame = rippleFrame.current;
      for (let slot = 0; slot < pools.ripple.capacity; slot++) {
        const circle = rippleEls.current[slot];
        if (!circle) continue;
        const e = pools.ripple.entryAt(slot);
        if (!e.active) {
          circle.setAttribute("visibility", "hidden");
          continue;
        }
        writeRippleFrameAt(tMs - e.startedAtMs, reduced, frame);
        if (frame.done) {
          pools.ripple.release(e);
          circle.setAttribute("visibility", "hidden");
          continue;
        }
        worldToCanvasInto(e.state, projection, out);
        circle.setAttribute("cx", String(out.x));
        circle.setAttribute("cy", String(out.y));
        circle.setAttribute("r", String(((frame.radius * (1 + RIPPLE_LOOK.ringInnerRatio)) / HALF) * projection.scale));
        circle.setAttribute("stroke-width", String(frame.radius * (1 - RIPPLE_LOOK.ringInnerRatio) * projection.scale));
        circle.setAttribute("stroke-opacity", String(frame.intensity));
        circle.setAttribute("visibility", "visible");
      }
    },
    [pools, projection, elements],
  );

  // Latest values for the frame loop; then an immediate write so nothing shows at the origin.
  useLayoutEffect(() => {
    latest.current = { items, clockOffsetMs, reducedMotion, focusId };
    writeFrame(now());
  }, [items, clockOffsetMs, reducedMotion, focusId, writeFrame, now]);

  // Frame loop: started once, throttled to FLAT_RIVER_FRAME_INTERVAL_MS, cancelled on unmount.
  useEffect(() => {
    let handle = 0;
    let last = now();
    const tick = () => {
      handle = frames.request(tick);
      const t = now();
      if (t - last < FLAT_RIVER_FRAME_INTERVAL_MS) return;
      last = t;
      writeFrame(t);
    };
    writeFrame(last);
    handle = frames.request(tick);
    return () => frames.cancel(handle);
  }, [frames, now, writeFrame]);

  // Initial scroll: centre the pier unless Find My already names a krathong.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || latest.current.focusId !== null) return;
    scrollScrollerTo(scroller, flatRiverScrollLeft(art.pierTipX, scroller.clientWidth, mapWidth), "auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount
  }, []);

  // Find My: one scroll per request that centres the krathong (instant under reduced motion).
  useEffect(() => {
    if (focusId === null) {
      scrolledFor.current = null;
      return;
    }
    const key = `${focusId}:${focusRequestId}`;
    if (scrolledFor.current === key) return;
    const item = items.find((it) => it.id === focusId);
    const scroller = scrollerRef.current;
    if (!item || !scroller) return; // zone not loaded yet: re-runs when items change
    const p = flatCoordToCanvasInto(
      item.coord,
      item.lane,
      item.createdAtMs,
      now() + clockOffsetMs,
      projection,
      createCanvasPointOut(),
      createFlatCanvasScratch(),
    );
    scrollScrollerTo(scroller, flatRiverScrollLeft(p.x, scroller.clientWidth, mapWidth), reducedMotion ? "auto" : "smooth");
    scrolledFor.current = key;
  }, [focusId, focusRequestId, items, reducedMotion, clockOffsetMs, now, projection, mapWidth]);

  const tapHint = useSceneTapHint(mode === "WORLD_EXPLORE");
  const dismissTapHint = tapHint.dismiss;
  const onActionRef = useRef<(action: InteractionAction) => void>(() => undefined);
  const onAction = useCallback(
    (action: InteractionAction) => {
      if (action.type === "PAN_RIVER") {
        const scroller = scrollerRef.current;
        // Touch pans scroll natively; only a mouse drag needs this.
        if (scroller && pendingTap.current?.pointerType === "mouse") scroller.scrollLeft -= action.deltaX;
        return;
      }
      if (action.type !== "TAP_INTERACT") return;
      dismissTapHint();
      const tap = pendingTap.current;
      if (!tap) return;
      if (tap.target === "water") {
        const world = canvasToWorldXZ({ x: tap.x, y: tap.y }, projection);
        const entry = pools.ripple.acquire(now());
        entry.state.x = world.x;
        entry.state.z = world.z;
        recordGimmick("ripple");
      } else if (tap.target === "krathong" && tap.creationId !== null) {
        setInspectedId(tap.creationId);
        recordGimmick("inspect");
      }
    },
    [pools, projection, now, recordGimmick, dismissTapHint],
  );
  useLayoutEffect(() => {
    onActionRef.current = onAction;
  }, [onAction]);
  const separatorRef = useRef<InputSeparator | null>(null);
  const getSeparator = (): InputSeparator => {
    separatorRef.current ??= createInputSeparator("WORLD_EXPLORE", (action) => onActionRef.current(action));
    return separatorRef.current;
  };

  const sample = (e: ReactPointerEvent<SVGSVGElement>) => ({
    pointerId: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    time: e.timeStamp,
    target: pendingTap.current?.target ?? null,
  });
  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (mode !== "WORLD_EXPLORE") return;
    const hit = e.target instanceof Element ? e.target.closest("[data-input-target]") : null;
    const kind = hit?.getAttribute("data-input-target");
    const target: InteractionTarget | null = kind === "water" || kind === "krathong" ? kind : null;
    const rect = svgRef.current?.getBoundingClientRect();
    pendingTap.current = {
      target,
      creationId: hit?.getAttribute("data-creation-id") ?? null,
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top ?? 0),
      pointerType: e.pointerType,
    };
    getSeparator().pointerDown(sample(e)); // no pointer capture: native scroll keeps working
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (mode === "WORLD_EXPLORE") getSeparator().pointerMove(sample(e));
  };
  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (mode === "WORLD_EXPLORE") getSeparator().pointerUp(sample(e));
  };
  const onPointerCancel = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (mode === "WORLD_EXPLORE") getSeparator().pointerCancel(e.pointerId);
  };

  return (
    <>
      <section
        aria-label={FLAT_VIEW_COPY.riverLabel}
        data-testid="flat-river-view"
        data-interaction-mode={mode}
        data-zone-id={currentZoneId ?? undefined}
        data-river-item-count={items.length}
        data-flat-own-krathong={pierPreview ? "pier" : ownOnRiver ? "river" : "none"}
        data-focused-creation-id={focusId ?? undefined}
        data-ripple-capacity={pools.ripple.capacity}
        data-last-gimmick={gimmick.kind ?? undefined}
        data-gimmick-count={gimmick.count}
        className="relative mb-8 w-full overflow-hidden rounded-3xl border border-indigo-950/30 shadow-lg"
        style={{ backgroundColor: FLAT_VIEW_COLORS.bank }}
      >
        <div
          ref={scrollerRef}
          data-testid="flat-river-scroller"
          role="region"
          aria-label={FLAT_VIEW_COPY.riverScrollLabel}
          tabIndex={0}
          className="w-full touch-manipulation select-none overflow-x-auto overflow-y-hidden"
        >
          <svg
            ref={svgRef}
            width={mapWidth}
            height={mapHeight}
            viewBox={`0 0 ${mapWidth} ${mapHeight}`}
            className="block"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          >
            <rect width={mapWidth} height={mapHeight} fill={FLAT_VIEW_COLORS.bank} />
            <path d={art.waterPath} fill={FLAT_VIEW_COLORS.water} data-input-target="water" />
            <g pointerEvents="none">
              {art.trees.map((p, i) => (
                <circle key={`tree-${i}`} cx={p.x} cy={p.y} r={p.size} fill={FLAT_VIEW_COLORS.tree} />
              ))}
              {art.houses.map((p, i) => (
                <rect
                  key={`house-${i}`}
                  x={p.x - p.halfW}
                  y={p.y - p.halfD}
                  width={p.halfW * HALF}
                  height={p.halfD * HALF}
                  fill={FLAT_VIEW_COLORS.house}
                />
              ))}
              {art.lamps.map((p, i) => (
                <circle key={`lamp-${i}`} cx={p.x} cy={p.y} r={p.size} fill={FLAT_VIEW_COLORS.lamp} />
              ))}
            </g>
            <polygon points={art.pierPoints} fill={FLAT_VIEW_COLORS.pier} pointerEvents="none" />
            <g pointerEvents="none">
              {rippleSlots.map((slot) => (
                <circle
                  key={slot}
                  ref={(el) => {
                    rippleEls.current[slot] = el;
                  }}
                  data-testid="flat-ripple"
                  visibility="hidden"
                  fill="none"
                  stroke={RIPPLE_LOOK.color}
                />
              ))}
            </g>
            {pierPreview && pier && (
              <g data-testid="flat-own-krathong" transform={`translate(${pier.x} ${pier.y})`} pointerEvents="none">
                <g transform={`scale(${spritePx})`}>
                  <FlatKrathongShapes layers={ownLayers} />
                </g>
              </g>
            )}
            {items.map((it) => (
              <g key={it.id} ref={it.setElement} data-testid="flat-river-item" data-creation-id={it.id} data-own={it.own ? "true" : undefined}>
                <g transform={`scale(${spritePx})`}>
                  <FlatKrathongShapes layers={it.layers} />
                </g>
                {!it.own && mode === "WORLD_EXPLORE" && (
                  <circle r={tapPx} fill="transparent" data-input-target="krathong" data-creation-id={it.id} />
                )}
              </g>
            ))}
            <circle
              ref={ringRef}
              data-testid="flat-focus-ring"
              visibility="hidden"
              fill="none"
              stroke={FLAT_RIVER_HIGHLIGHT.color}
              strokeOpacity={FLAT_RIVER_HIGHLIGHT.opacity}
              strokeWidth={ringStrokePx}
              r={ringRadiusPx}
              pointerEvents="none"
            />
          </svg>
        </div>
        {tapHint.visible && <SceneTapHint text={SCENE_TAP_HINT_COPY.flat2d} reducedMotion={reducedMotion} />}
      </section>
      {inspected && <InspectPopup key={inspected.id} creation={inspected} onClose={() => setInspectedId(null)} ownerSection={<OwnerWishSection creation={inspected} />} />}
    </>
  );
}
