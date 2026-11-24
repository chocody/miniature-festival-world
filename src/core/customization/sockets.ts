import { CENTER_SOCKET_ID, RIM_SOCKET_COUNT, RIM_SOCKET_ID_PREFIX } from "@/config/events/loyKrathong.config";
import type {
  KrathongAppearance,
  KrathongSocketDef,
  RimSocketId,
  SocketAssignment,
  SocketCheck,
} from "./types";

const DEGREES_PER_TURN = 360;

/** Rim socket id for index 0..RIM_SOCKET_COUNT-1. */
export function rimSocketId(index: number): RimSocketId {
  if (!Number.isInteger(index) || index < 0 || index >= RIM_SOCKET_COUNT) {
    throw new RangeError(`rim socket index out of range: ${index}`);
  }
  return `${RIM_SOCKET_ID_PREFIX}${index}`;
}

const CENTER_SOCKET: KrathongSocketDef = Object.freeze({
  id: CENTER_SOCKET_ID,
  kind: "center",
  accepts: "candleAndIncense",
  orientation: "upright",
  angleDeg: null,
  rimIndex: null,
});

export const KRATHONG_SOCKETS: readonly KrathongSocketDef[] = Object.freeze([
  CENTER_SOCKET,
  ...Array.from({ length: RIM_SOCKET_COUNT }, (_, i): KrathongSocketDef =>
    Object.freeze({
      id: rimSocketId(i),
      kind: "rim",
      accepts: "flower",
      orientation: "outward",
      angleDeg: (i * DEGREES_PER_TURN) / RIM_SOCKET_COUNT,
      rimIndex: i,
    }),
  ),
]);

const SOCKETS_BY_ID: ReadonlyMap<string, KrathongSocketDef> = new Map(
  KRATHONG_SOCKETS.map((socket) => [socket.id, socket]),
);

export function getKrathongSocket(id: unknown): KrathongSocketDef | undefined {
  return typeof id === "string" ? SOCKETS_BY_ID.get(id) : undefined;
}

export function validateSocketPlacement(assignment: SocketAssignment): SocketCheck {
  const socket = getKrathongSocket(assignment.socketId);
  if (!socket) return { ok: false, violation: "UNKNOWN_SOCKET", socketId: String(assignment.socketId) };
  if (socket.accepts !== assignment.part) {
    return { ok: false, violation: "PART_NOT_ALLOWED_IN_SOCKET", socketId: socket.id };
  }
  return { ok: true };
}

export function validateSocketAssignments(assignments: readonly SocketAssignment[]): SocketCheck {
  const seen = new Set<string>();
  let candleSeen = false;
  for (const assignment of assignments) {
    const check = validateSocketPlacement(assignment);
    if (!check.ok) return check;
    if (seen.has(assignment.socketId)) {
      return { ok: false, violation: "SOCKET_OCCUPIED", socketId: assignment.socketId };
    }
    seen.add(assignment.socketId);
    if (assignment.part === "candleAndIncense") candleSeen = true;
  }
  if (!candleSeen) return { ok: false, violation: "CANDLE_REQUIRED", socketId: CENTER_SOCKET_ID };
  return { ok: true };
}

export function appearanceToSocketAssignments(appearance: KrathongAppearance): SocketAssignment[] {
  const assignments: SocketAssignment[] = [{ part: "candleAndIncense", socketId: CENTER_SOCKET_ID }];
  appearance.flowers.forEach((kind, i) => {
    if (kind !== null) assignments.push({ part: "flower", socketId: rimSocketId(i) });
  });
  return assignments;
}
