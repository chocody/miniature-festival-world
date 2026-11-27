"use client";

import { describeGrowingWorld } from "@/core/world/growingWorldScaler";
import { getZonePagination, type ZonePagination } from "@/services/api/zonePagination";
import { useWorldStore } from "@/store/useWorldStore";
import { UI_CLASSES, UI_GLYPHS } from "./uiClasses";

/**
 * Thai UI copy. PLACEHOLDER wording (spec silent beyond "โซนคุ้งน้ำ" / "Zone 2, Zone 3"), Open question 2.
 * MFW-83 (owner, 2026-11-27): no zone name is shown, so no visible string says "คุ้งน้ำ"; the zone is conveyed by the arrows only.
 * The accessible names of the two arrows keep the zone wording (aria-label is not visible UI) so the controls stay findable by name.
 */
export const ZONE_NAV_COPY = Object.freeze({
  navLabel: "คุ้งน้ำ",
  upstream: "คุ้งน้ำก่อนหน้า",
  downstream: "คุ้งน้ำถัดไป",
  loading: "กำลังโหลด…",
  error: "โหลดไม่สำเร็จ",
  retry: "ลองอีกครั้ง",
});

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
  const text = zoneStatus === "error" ? ZONE_NAV_COPY.error : view === null ? ZONE_NAV_COPY.loading : null;
  const visible = text !== null || up !== null || down !== null;

  return (
    <nav
      hidden={!visible}
      aria-label={ZONE_NAV_COPY.navLabel}
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
          aria-label={ZONE_NAV_COPY.upstream}
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
