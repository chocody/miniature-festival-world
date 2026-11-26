"use client";

import { describeGrowingWorld } from "@/core/world/growingWorldScaler";
import { getZonePagination, type ZonePagination } from "@/services/api/zonePagination";
import { useWorldStore } from "@/store/useWorldStore";
import { UI_CLASSES, UI_GLYPHS } from "./uiClasses";

/** Thai UI copy. PLACEHOLDER wording (spec silent beyond "โซนคุ้งน้ำ" / "Zone 2, Zone 3"), Open question 2. */
export const ZONE_NAV_COPY = Object.freeze({
  navLabel: "คุ้งน้ำ",
  zoneLabel: (zoneId: number, zoneCount: number) => `คุ้งน้ำที่ ${zoneId} จาก ${zoneCount}`,
  upstream: "คุ้งน้ำก่อนหน้า",
  downstream: "คุ้งน้ำถัดไป",
  loading: "กำลังโหลดคุ้งน้ำ…",
  error: "โหลดคุ้งน้ำไม่สำเร็จ",
  retry: "ลองอีกครั้ง",
});

export interface ZoneNavigatorProps {
  readonly pagination?: Pick<ZonePagination, "jumpBy" | "retry">;
}

/**
 * MFW-58: the position indicator of the endless river — the zone under the camera, updated live as the camera crosses a stretch
 * seam — and a jump shortcut: ‹ › travel one stretch (3D: a camera flight; 2D: the next page), wrapping after the last zone. The
 * buttons exist only when there is another zone (none with one zone: the same zone repeats along the river).
 */
export function ZoneNavigator({ pagination }: ZoneNavigatorProps) {
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
  const text =
    zoneStatus === "error"
      ? ZONE_NAV_COPY.error
      : view === null
        ? ZONE_NAV_COPY.loading
        : ZONE_NAV_COPY.zoneLabel(view.visibleZoneId, view.zoneCount);

  return (
    <nav
      aria-label={ZONE_NAV_COPY.navLabel}
      data-testid="zone-navigator"
      data-zone-id={view?.visibleZoneId}
      data-zone-count={view?.zoneCount}
      data-zone-status={zoneStatus}
      data-zone-item-count={itemCount}
      data-stretch-index={stretchIndex}
      className="flex w-full items-center justify-between gap-2"
    >
      {up !== null && (
        <button
          type="button"
          aria-label={ZONE_NAV_COPY.upstream}
          className={UI_CLASSES.iconButton}
          onClick={() => p.jumpBy(-1)}
        >
          <span aria-hidden="true">{UI_GLYPHS.previous}</span>
        </button>
      )}
      <p aria-live="polite" className="flex-1 text-center text-body font-medium text-ink">
        {text}
      </p>
      {zoneStatus === "error" && (
        <button type="button" className={UI_CLASSES.secondaryButton} onClick={() => void p.retry()}>
          {ZONE_NAV_COPY.retry}
        </button>
      )}
      {down !== null && (
        <button
          type="button"
          aria-label={ZONE_NAV_COPY.downstream}
          className={UI_CLASSES.iconButton}
          onClick={() => p.jumpBy(1)}
        >
          <span aria-hidden="true">{UI_GLYPHS.next}</span>
        </button>
      )}
    </nav>
  );
}
