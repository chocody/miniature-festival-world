import { CENTER_SOCKET_ID } from "@/config/events/loyKrathong.config";
import { canonicalizeKrathongAppearance } from "./krathongAppearance";
import { getKrathongSocket, validateSocketPlacement } from "./sockets";
import type { FlowerKind, KrathongAppearance, SocketRuleViolation } from "./types";

export type SocketPlacement =
  | { readonly part: "flower"; readonly kind: FlowerKind; readonly socketId: string }
  | { readonly part: "candleAndIncense"; readonly socketId: string };
export type BuilderResult =
  | { readonly ok: true; readonly appearance: KrathongAppearance }
  | { readonly ok: false; readonly violation: SocketRuleViolation; readonly socketId: string };

/** Place a part in a socket, enforcing the socket rules. Never mutates the input. */
export function placeInSocket(appearance: KrathongAppearance, placement: SocketPlacement): BuilderResult {
  const check = validateSocketPlacement({ part: placement.part, socketId: placement.socketId });
  if (!check.ok) return { ok: false, violation: check.violation, socketId: check.socketId };
  if (placement.part === "candleAndIncense") {
    // The candle always exists on center_socket; nothing to change.
    return { ok: true, appearance: canonicalizeKrathongAppearance(appearance) };
  }
  const rimIndex = getKrathongSocket(placement.socketId)?.rimIndex;
  if (rimIndex === null || rimIndex === undefined) {
    return { ok: false, violation: "UNKNOWN_SOCKET", socketId: placement.socketId };
  }
  const flowers: (FlowerKind | null)[] = [...appearance.flowers];
  while (flowers.length <= rimIndex) flowers.push(null);
  flowers[rimIndex] = placement.kind;
  return { ok: true, appearance: canonicalizeKrathongAppearance({ ...appearance, flowers }) };
}

/** Empty a socket. The center socket (candle) cannot be cleared. */
export function clearSocket(appearance: KrathongAppearance, socketId: string): BuilderResult {
  const socket = getKrathongSocket(socketId);
  if (!socket) return { ok: false, violation: "UNKNOWN_SOCKET", socketId: String(socketId) };
  if (socket.kind === "center" || socket.rimIndex === null) {
    return { ok: false, violation: "CANDLE_REQUIRED", socketId: CENTER_SOCKET_ID };
  }
  const flowers: (FlowerKind | null)[] = [...appearance.flowers];
  if (socket.rimIndex < flowers.length) flowers[socket.rimIndex] = null;
  return { ok: true, appearance: canonicalizeKrathongAppearance({ ...appearance, flowers }) };
}
