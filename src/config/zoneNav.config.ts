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
