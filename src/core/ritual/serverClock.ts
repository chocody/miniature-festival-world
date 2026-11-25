/** Server − client clock offset from one request: Date.parse(serverIso) − (sentAtMs + receivedAtMs) / 2. Any non-finite input → 0. */
export function estimateServerClockOffsetMs(serverIso: string, sentAtMs: number, receivedAtMs: number): number {
  const server = Date.parse(serverIso);
  const offset = server - (sentAtMs + receivedAtMs) / 2;
  return Number.isFinite(offset) ? offset : 0;
}
