import type { EventCreateCopy } from "@/config/events/eventCopy.config";
import type { FlowState } from "@/core/flow";

export interface FlowStepCopy {
  readonly title: string;
  readonly hint: string | null;
}

/** Visible step titles and hints (MFW-55). Replaces the raw state id the world sheet used to show. DRAFT Thai copy (owner review). */
export const FLOW_STEP_COPY: Readonly<Record<FlowState, FlowStepCopy>> = Object.freeze({
  CUSTOMIZE_OBJECT: Object.freeze({ title: "แต่งกระทง", hint: null }),
  WRITE_WISH: Object.freeze({ title: "เขียนคำอธิษฐาน", hint: null }),
  RITUAL_RELEASE: Object.freeze({ title: "พิธีปล่อยกระทง", hint: "ลากกระทงลงน้ำ หรือกดปุ่มปล่อยกระทง" }),
  SHARED_WORLD_EXPLORE: Object.freeze({
    title: "สายน้ำแห่งคำอธิษฐาน",
    hint: "ลากเพื่อเลื่อนหรือหมุนแม่น้ำ แตะสั้นที่น้ำ โคมไฟ หรือกระทงเพื่อเลือก",
  }),
});

/**
 * Loy Krathong create entry (MFW-154): `start` is the landing button that opens the customizer (owner, 2026-11-28);
 * `cancel` is the customizer close control's aria-label — DRAFT Thai copy (owner review).
 */
export const CREATE_ENTRY_COPY: EventCreateCopy = Object.freeze({ start: "ลอยกระทง", cancel: "กลับไปดูแม่น้ำ" });

/** Document title and description (replaces "Create Next App"). DRAFT Thai copy (owner review). */
export const APP_METADATA_COPY = Object.freeze({
  title: "โลกเทศกาลจิ๋ว",
  description: "ประดิษฐ์ของจิ๋วตามเทศกาล เขียนคำอธิษฐาน แล้วปล่อยสู่โลกที่ทุกคนเห็นร่วมกัน",
});
