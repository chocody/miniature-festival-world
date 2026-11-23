/** Positive modulo into [0, 1). Handles negatives; never returns 1 or -0. NaN/±Infinity → NaN. */
export function wrap01(value: number): number {
  const r = value % 1;
  const w = r < 0 ? r + 1 : r;
  if (w >= 1) return 0; // r = -tiny → r + 1 rounds to 1
  return w === 0 ? 0 : w; // normalize -0
}
