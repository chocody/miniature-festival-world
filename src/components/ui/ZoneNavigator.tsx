"use client";

import { describeGrowingWorld } from "@/core/world/growingWorldScaler";
import { getZonePagination, type ZonePagination } from "@/services/api/zonePagination";
import { useWorldStore } from "@/store/useWorldStore";

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
  readonly pagination?: Pick<ZonePagination, "loadZone" | "retry">;
}

/** Moves up- and downstream between river-bend zones. Buttons exist only when that neighbour exists. */
export function ZoneNavigator({ pagination }: ZoneNavigatorProps) {
  const eventId = useWorldStore((s) => s.eventId);
  const currentZoneId = useWorldStore((s) => s.currentZoneId);
  const zoneCount = useWorldStore((s) => s.zoneCount);
  const zoneStatus = useWorldStore((s) => s.zoneStatus);
  const itemCount = useWorldStore((s) => s.zoneItems.length);
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
      className="mb-4 flex w-full items-center justify-between gap-2 text-sm"
    >
      {up !== null && (
        <button type="button" onClick={() => void p.loadZone(up)}>
          ‹ {ZONE_NAV_COPY.upstream}
        </button>
      )}
      <p aria-live="polite">{text}</p>
      {zoneStatus === "error" && (
        <button type="button" onClick={() => void p.retry()}>
          {ZONE_NAV_COPY.retry}
        </button>
      )}
      {down !== null && (
        <button type="button" onClick={() => void p.loadZone(down)}>
          {ZONE_NAV_COPY.downstream} ›
        </button>
      )}
    </nav>
  );
}
