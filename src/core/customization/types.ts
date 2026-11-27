import type {
  CandleColor,
  FlowerKind,
  KrathongBaseId,
  LeafColor,
  LeafFoldStyleId,
  CENTER_SOCKET_ID,
  RIM_SOCKET_ID_PREFIX,
} from "@/config/events/loyKrathong.config";
import type { KrathongDesignId } from "@/config/krathongDesigns.config";
export type { CandleColor, FlowerKind, KrathongBaseId, LeafColor, LeafFoldStyleId };

/** Stored in creations_public.appearance (spec §5). Index i of `flowers` is rim socket i; null = empty socket. */
export interface KrathongAppearance {
  readonly base: KrathongBaseId;
  readonly lotusFold: LeafFoldStyleId;
  readonly leafColor: LeafColor;
  readonly flowers: readonly (FlowerKind | null)[];
  readonly candleColor: CandleColor;
  /** MFW-78: the chosen owner-supplied design. Absent = stored before MFW-78 → KRATHONG_DEFAULT_DESIGN. */
  readonly design?: KrathongDesignId;
}
/** Union of every event's appearance. Only Loy Krathong exists in Phase 1. */
export type EventAppearance = KrathongAppearance;

export type CenterSocketId = typeof CENTER_SOCKET_ID;
export type RimSocketId = `${typeof RIM_SOCKET_ID_PREFIX}${number}`;
export type KrathongSocketId = CenterSocketId | RimSocketId;
export type SocketPartKind = "flower" | "candleAndIncense";

export interface KrathongSocketDef {
  readonly id: KrathongSocketId;
  readonly kind: "center" | "rim";
  /** The only part kind this socket accepts. */
  readonly accepts: SocketPartKind;
  /** "upright": world +Y always (candle). "outward": yaw faces away from the centre. */
  readonly orientation: "upright" | "outward";
  /** Rim: index × 360 / RIM_SOCKET_COUNT. Center: null. Parametric — the 3D scene derives positions from it. */
  readonly angleDeg: number | null;
  readonly rimIndex: number | null;
}

export interface SocketAssignment {
  readonly part: SocketPartKind;
  readonly socketId: string;
}
export type SocketRuleViolation = "UNKNOWN_SOCKET" | "PART_NOT_ALLOWED_IN_SOCKET" | "SOCKET_OCCUPIED" | "CANDLE_REQUIRED";
export type SocketCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly violation: SocketRuleViolation; readonly socketId: string };

export type AppearanceParseResult<T = EventAppearance> =
  | { readonly ok: true; readonly appearance: T }
  | { readonly ok: false; readonly reason: string };

export type KrathongGeometryKey =
  | `base:${KrathongBaseId}`
  | `leaf:${LeafFoldStyleId}`
  | `flower:${FlowerKind}`
  | "flowerCentre"
  | "candle"
  | "flame"
  | "incense";
export type KrathongMaterialKey =
  | `base:${KrathongBaseId}`
  | `leaf:${LeafColor}`
  | `flower:${FlowerKind}`
  | "flowerCentre"
  | `candle:${CandleColor}`
  | "flame"
  | "incense";

export type KrathongPartRole = "base" | "leaf" | "flower" | "flowerCentre" | "candle" | "flame" | "incense";

/** River-batch keys of the owner-supplied design bodies (MFW-65): one vertex-coloured mesh per design and LOD. */
export type KrathongDesignGeometryKey = `design:${KrathongDesignId}`;
export type KrathongBatchGeometryKey = KrathongGeometryKey | KrathongDesignGeometryKey;
export type KrathongBatchMaterialKey = KrathongMaterialKey | "designBody";
export type KrathongBatchRole = KrathongPartRole | "designBody";

/** Derived at render time from an appearance. NEVER persisted or sent (invariant A). */
export interface KrathongPartInstance {
  /** Unique within one krathong; used as React key and Object3D name. */
  readonly id: string;
  readonly role: KrathongPartRole;
  readonly socketId: KrathongSocketId | null;
  readonly geometryKey: KrathongGeometryKey;
  readonly materialKey: KrathongMaterialKey;
  readonly localPosition: readonly [number, number, number];
  /** Yaw in radians. There is deliberately no pitch/roll field. */
  readonly rotationY: number;
  readonly scale: readonly [number, number, number];
}
export interface KrathongAssembly {
  /** Base, leaves, flowers — in model-local space. */
  readonly body: readonly KrathongPartInstance[];
  /** Candle, flame, incense — positions relative to the anchor; the anchor is kept world-upright. */
  readonly centerAnchor: {
    readonly socketId: CenterSocketId;
    readonly localPosition: readonly [number, number, number];
    readonly parts: readonly KrathongPartInstance[];
  };
}
