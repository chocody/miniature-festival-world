import { UI_CLASSES } from "./uiClasses";

/** Spec §6.2 Task 2.1 warning, verbatim. */
export const OWNERSHIP_LOSS_WARNING =
  "การล้างข้อมูลเบราว์เซอร์หรือเปลี่ยนอุปกรณ์จะทำให้ไม่สามารถค้นคืนรายการผลงานของตัวเองได้";

/** Tells the user that their ownership lives only in this browser (DeviceOwnerToken in LocalStorage). */
export function OwnershipNotice() {
  return (
    <p
      role="note"
      data-testid="ownership-notice"
      className={UI_CLASSES.notice}
    >
      {OWNERSHIP_LOSS_WARNING}
    </p>
  );
}
