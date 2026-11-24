/** Spec §6.2 Task 2.1 warning, verbatim. */
export const OWNERSHIP_LOSS_WARNING =
  "การล้างข้อมูลเบราว์เซอร์หรือเปลี่ยนอุปกรณ์จะทำให้ไม่สามารถค้นคืนรายการผลงานของตัวเองได้";

/** Tells the user that their ownership lives only in this browser (DeviceOwnerToken in LocalStorage). */
export function OwnershipNotice() {
  return (
    <p
      role="note"
      data-testid="ownership-notice"
      className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
    >
      {OWNERSHIP_LOSS_WARNING}
    </p>
  );
}
