import { CENTER_SOCKET_ID } from "@/config/events/loyKrathong.config";
import {
  KRATHONG_BASE_MODELS,
  KRATHONG_CANDLE_MODEL,
  KRATHONG_FLAME_MODEL,
  KRATHONG_FLOWER_MODELS,
  KRATHONG_INCENSE_MODEL,
  KRATHONG_LEAF_COUNT,
  KRATHONG_LEAF_MODELS,
} from "@/config/krathongModel.config";
import { KRATHONG_SOCKETS } from "./sockets";
import type { KrathongAppearance, KrathongAssembly, KrathongPartInstance } from "./types";

const HALF_TURN_DEGREES = 180;
const HALF_STEP = 0.5;

/** Model-local angle convention (three.js): x = r·sin θ, z = r·cos θ; rotationY = θ turns +Z outward. */
function ringPoint(radius: number, theta: number, y: number): readonly [number, number, number] {
  return [radius * Math.sin(theta), y, radius * Math.cos(theta)];
}

/** Appearance (parsed) -> part descriptors with derived local transforms. Pure and deterministic. */
export function assembleKrathong(appearance: KrathongAppearance): KrathongAssembly {
  const base = KRATHONG_BASE_MODELS[appearance.base];
  const r = base.rimRadius;
  const top = base.topY;
  const body: KrathongPartInstance[] = [
    {
      id: "base",
      role: "base",
      socketId: null,
      geometryKey: `base:${appearance.base}`,
      materialKey: `base:${appearance.base}`,
      localPosition: [0, base.localY, 0],
      rotationY: 0,
      scale: base.scale,
    },
  ];

  const leaf = KRATHONG_LEAF_MODELS[appearance.lotusFold];
  for (let j = 0; j < KRATHONG_LEAF_COUNT; j += 1) {
    const theta = ((j + HALF_STEP) * 2 * Math.PI) / KRATHONG_LEAF_COUNT;
    body.push({
      id: `leaf_${j}`,
      role: "leaf",
      socketId: null,
      geometryKey: `leaf:${appearance.lotusFold}`,
      materialKey: `leaf:${appearance.leafColor}`,
      localPosition: ringPoint(r, theta, top + leaf.localY),
      rotationY: theta,
      scale: leaf.scale,
    });
  }

  appearance.flowers.forEach((kind, i) => {
    if (kind === null) return;
    const socket = KRATHONG_SOCKETS[1 + i];
    const flower = KRATHONG_FLOWER_MODELS[kind];
    const theta = ((socket.angleDeg ?? 0) * Math.PI) / HALF_TURN_DEGREES;
    body.push({
      id: `flower_${socket.id}`,
      role: "flower",
      socketId: socket.id,
      geometryKey: `flower:${kind}`,
      materialKey: `flower:${kind}`,
      localPosition: ringPoint(r, theta, top + flower.localY),
      rotationY: theta,
      scale: flower.scale,
    });
  });

  const anchorPart = (
    id: string,
    role: "candle" | "flame" | "incense",
    geometryKey: KrathongPartInstance["geometryKey"],
    materialKey: KrathongPartInstance["materialKey"],
    localPosition: readonly [number, number, number],
    scale: readonly [number, number, number],
  ): KrathongPartInstance => ({
    id,
    role,
    socketId: CENTER_SOCKET_ID,
    geometryKey,
    materialKey,
    localPosition,
    rotationY: 0,
    scale,
  });
  const parts: KrathongPartInstance[] = [
    anchorPart("candle", "candle", "candle", `candle:${appearance.candleColor}`, [0, KRATHONG_CANDLE_MODEL.localY, 0], KRATHONG_CANDLE_MODEL.scale),
    anchorPart("flame", "flame", "flame", "flame", [0, KRATHONG_FLAME_MODEL.localY, 0], KRATHONG_FLAME_MODEL.scale),
  ];
  for (let k = 0; k < KRATHONG_INCENSE_MODEL.count; k += 1) {
    const phi = (k * 2 * Math.PI) / KRATHONG_INCENSE_MODEL.count;
    parts.push(
      anchorPart(
        `incense_${k}`,
        "incense",
        "incense",
        "incense",
        ringPoint(KRATHONG_INCENSE_MODEL.ringRadius, phi, KRATHONG_INCENSE_MODEL.localY),
        KRATHONG_INCENSE_MODEL.scale,
      ),
    );
  }

  return Object.freeze({
    body: Object.freeze(body),
    centerAnchor: Object.freeze({
      socketId: CENTER_SOCKET_ID,
      localPosition: [0, top, 0] as const,
      parts: Object.freeze(parts),
    }),
  });
}
