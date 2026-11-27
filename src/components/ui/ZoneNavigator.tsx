"use client";

import { describeGrowingWorld } from "@/core/world/growingWorldScaler";
import { getZonePagination, type ZonePagination } from "@/services/api/zonePagination";
import { useWorldStore } from "@/store/useWorldStore";
import { useEventCopy } from "./EventCopyContext";
import { UI_CLASSES, UI_GLYPHS } from "./uiClasses";

export interface ZoneNavigatorProps {
  readonly pagination?: Pick<ZonePagination, "jumpBy" | "retry">;
}

/**
 * MFW-58: a jump shortcut for the endless river: ‹ › travel one stretch (a camera flight), wrapping after the last zone. The
 * buttons exist only when there is another zone (none with one zone: the same zone repeats along the river).
 * MFW-83: the "คุ้งน้ำที่ N จาก M" label is gone; the nav keeps its data-* attributes (the live zone / stretch for tests) and owns
 * a `hidden` attribute when there is nothing to show (no arrow, no loading or error text); FlowRoot's "top" slot hides itself then (`has-[nav[hidden]]:hidden`).
 */
export function ZoneNavigator({ pagination }: ZoneNavigatorProps) {
  const COPY = useEventCopy().zoneNav;
  const eventId = useWorldStore((s) => s.eventId);
  const currentZoneId = useWorldStore((s) => s.currentZoneId);
  const zoneCount = useWorldStore((s) => s.zoneCount);
  const zoneStatus = useWorldStore((s) => s.zoneStatus);
  const itemCount = useWorldStore((s) => s.zoneItems.length);
  const stretchIndex = useWorldStore((s) => s.currentStretchIndex);
  if (eventId === null) return null;
  const p = pagination ?? getZonePagination();
  const view = describeGrowingWorld(zoneCount, currentZoneId);
  const up = view?.upstreamZoneId ?? null;
  const down = view?.downstreamZoneId ?? null;
  const text = zoneStatus === "error" ? COPY.error : view === null ? COPY.loading : null;
  const visible = text !== null || up !== null || down !== null;

  return (
    <nav
      hidden={!visible}
      aria-label={COPY.navLabel}
      data-testid="zone-navigator"
      data-zone-id={view?.visibleZoneId}
      data-zone-count={view?.zoneCount}
      data-zone-status={zoneStatus}
      data-zone-item-count={itemCount}
      data-stretch-index={stretchIndex}
      className="flex items-center gap-2"
    >
      {up !== null && (
        <button
          type="button"
          aria-label={COPY.upstream}
          className={UI_CLASSES.iconButton}
          onClick={() => p.jumpBy(-1)}
        >
          <span aria-hidden="true">{UI_GLYPHS.previous}</span>
        </button>
      )}
      {text !== null && (
        <p aria-live="polite" className="px-2 text-center text-body font-medium text-ink">
          {text}
        </p>
      )}
      {zoneStatus === "error" && (
        <button type="button" className={UI_CLASSES.secondaryButton} onClick={() => void p.retry()}>
          {COPY.retry}
        </button>
      )}
      {down !== null && (
        <button
          type="button"
          aria-label={COPY.downstream}
          className={UI_CLASSES.iconButton}
          onClick={() => p.jumpBy(1)}
        >
          <span aria-hidden="true">{UI_GLYPHS.next}</span>
        </button>
      )}
    </nav>
  );
}
