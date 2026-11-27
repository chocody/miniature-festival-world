import type { LightPresetChoice, LightPresetId } from "@/config/look.config";

/** Device-local hours: DAY = [dayStartHour, nightStartHour), NIGHT = the rest (open question 32, MFW-47). */
export interface DayNightHours {
  readonly dayStartHour: number;
  readonly nightStartHour: number;
}

const LAST_HOUR_OF_DAY = 23;
/** A timer never fires at 0 ms (it would spin on the boundary itself). */
const MIN_DELAY_MS = 1;

/** RangeError unless both hours are integers and 0 ≤ dayStartHour < nightStartHour ≤ 23. */
export function assertDayNightHours(h: DayNightHours): void {
  const { dayStartHour: day, nightStartHour: night } = h;
  if (!Number.isInteger(day) || !Number.isInteger(night) || day < 0 || night > LAST_HOUR_OF_DAY || day >= night) {
    throw new RangeError(`invalid day/night hours ${JSON.stringify(h)}`);
  }
}

/** DAY iff dayStartHour ≤ local hour < nightStartHour (the device's local time, `date.getHours()`). */
export function presetForLocalTime(date: Date, h: DayNightHours): LightPresetId {
  const hour = date.getHours();
  return hour >= h.dayStartHour && hour < h.nightStartHour ? "DAY" : "NIGHT";
}

/** "AUTO" follows the local time; "DAY" / "NIGHT" are the user's override. */
export function resolveLightPreset(choice: LightPresetChoice, date: Date, h: DayNightHours): LightPresetId {
  return choice === "AUTO" ? presetForLocalTime(date, h) : choice;
}

/** Milliseconds until the next day/night boundary strictly after `date` (local-time constructors handle DST). Always ≥ 1. */
export function msUntilNextPresetChange(date: Date, h: DayNightHours): number {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  const now = date.getTime();
  const dayStart = new Date(y, m, d, h.dayStartHour).getTime();
  const nightStart = new Date(y, m, d, h.nightStartHour).getTime();
  const next =
    dayStart > now ? dayStart : nightStart > now ? nightStart : new Date(y, m, d + 1, h.dayStartHour).getTime();
  return Math.max(MIN_DELAY_MS, next - now);
}

/** The choice a one-tap toggle stores: the other preset, or "AUTO" when that preset is what the clock shows anyway (so the scene follows real time again). */
export function nextLightPresetChoice(shown: LightPresetId, auto: LightPresetId): LightPresetChoice {
  const target: LightPresetId = shown === "DAY" ? "NIGHT" : "DAY";
  return target === auto ? "AUTO" : target;
}
