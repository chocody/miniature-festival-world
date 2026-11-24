import { RIM_SOCKET_COUNT } from "@/config/events/loyKrathong.config";
import { canonicalizeKrathongAppearance, parseKrathongAppearance } from "./krathongAppearance";
import { clearSocket, placeInSocket, type BuilderResult } from "./krathongBuilder";
import { getKrathongSocket, KRATHONG_SOCKETS } from "./sockets";
import type {
  CandleColor,
  FlowerKind,
  KrathongAppearance,
  KrathongBaseId,
  LeafColor,
  LeafFoldStyleId,
  RimSocketId,
} from "./types";

/** Flower target meaning "every rim socket". */
export const ALL_RIM_SOCKETS = "ALL_RIM_SOCKETS" as const;
export type KrathongFlowerTarget = typeof ALL_RIM_SOCKETS | RimSocketId;

/** One customizer action. `value: null` on a flower choice empties the target socket(s). */
export type KrathongChoice =
  | { readonly part: "base"; readonly value: KrathongBaseId }
  | { readonly part: "lotusFold"; readonly value: LeafFoldStyleId }
  | { readonly part: "leafColor"; readonly value: LeafColor }
  | { readonly part: "candleColor"; readonly value: CandleColor }
  | { readonly part: "flower"; readonly target: KrathongFlowerTarget; readonly value: FlowerKind | null };

export type KrathongChoiceResult =
  | { readonly ok: true; readonly appearance: KrathongAppearance }
  | { readonly ok: false; readonly reason: string };

/** What the flower buttons show as pressed: one kind, empty (null), or a mix. */
export type FlowerSelection = FlowerKind | null | "MIXED";

const RIM_SOCKET_IDS: readonly string[] = Object.freeze(
  KRATHONG_SOCKETS.filter((s) => s.kind === "rim").map((s) => s.id),
);

/** Applies one choice and re-validates with the strict parser. Never mutates `appearance`, never throws. */
export function applyKrathongChoice(appearance: KrathongAppearance, choice: KrathongChoice): KrathongChoiceResult {
  let candidate: KrathongAppearance;
  switch (choice.part) {
    case "base":
      candidate = { ...appearance, base: choice.value };
      break;
    case "lotusFold":
      candidate = { ...appearance, lotusFold: choice.value };
      break;
    case "leafColor":
      candidate = { ...appearance, leafColor: choice.value };
      break;
    case "candleColor":
      candidate = { ...appearance, candleColor: choice.value };
      break;
    case "flower": {
      const targets = choice.target === ALL_RIM_SOCKETS ? RIM_SOCKET_IDS : [choice.target];
      let acc = appearance;
      for (const socketId of targets) {
        const r: BuilderResult =
          choice.value === null
            ? clearSocket(acc, socketId)
            : placeInSocket(acc, { part: "flower", kind: choice.value, socketId });
        if (!r.ok) return { ok: false, reason: `socket rule: ${r.violation} at ${r.socketId}` };
        acc = r.appearance;
      }
      candidate = acc;
      break;
    }
    default: {
      const unreachable: never = choice;
      void unreachable;
      return { ok: false, reason: "unknown choice part" };
    }
  }
  const parsed = parseKrathongAppearance(candidate);
  return parsed.ok ? { ok: true, appearance: parsed.appearance } : { ok: false, reason: parsed.reason };
}

export function krathongAppearanceEquals(a: KrathongAppearance, b: KrathongAppearance): boolean {
  return JSON.stringify(canonicalizeKrathongAppearance(a)) === JSON.stringify(canonicalizeKrathongAppearance(b));
}

export function getFlowerSelection(appearance: KrathongAppearance, target: KrathongFlowerTarget): FlowerSelection {
  if (target === ALL_RIM_SOCKETS) {
    const first = appearance.flowers[0] ?? null;
    for (let i = 1; i < RIM_SOCKET_COUNT; i += 1) {
      if ((appearance.flowers[i] ?? null) !== first) return "MIXED";
    }
    return first;
  }
  const socket = getKrathongSocket(target);
  if (!socket || socket.rimIndex === null) throw new RangeError(`not a rim socket: ${String(target)}`);
  return appearance.flowers[socket.rimIndex] ?? null;
}
