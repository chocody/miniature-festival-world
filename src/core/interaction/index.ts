import type { FlowState } from "@/core/flow";
import {
  DRAG_START_DISTANCE_PX,
  PINCH_ZOOM_MAX,
  PINCH_ZOOM_MIN,
  TAP_MAX_DURATION_MS,
} from "@/config/interaction.config";

export const INTERACTION_MODES = ["CUSTOMIZE", "RITUAL_RELEASE", "WORLD_EXPLORE"] as const;
export type InteractionMode = (typeof INTERACTION_MODES)[number];
export type InteractionTarget = "krathong" | "water" | "lamp";

export type InteractionAction =
  | { type: "ROTATE_KRATHONG"; deltaX: number }
  | { type: "PINCH_ZOOM"; scale: number }
  | { type: "DRAG_KRATHONG"; deltaX: number; deltaY: number }
  | { type: "RELEASE_KRATHONG" }
  | { type: "PAN_RIVER"; deltaX: number; deltaY: number }
  | { type: "TAP_INTERACT"; target: InteractionTarget };

export interface PointerSample {
  pointerId: number;
  x: number;
  y: number;
  time: number;
  target?: InteractionTarget | null;
}

export interface InputSeparator {
  pointerDown(sample: PointerSample): void;
  pointerMove(sample: PointerSample): void;
  pointerUp(sample: PointerSample): void;
  pointerCancel(pointerId: number): void;
}

interface TrackedPointer extends PointerSample {
  readonly startX: number;
  readonly startY: number;
  readonly startTime: number;
  readonly startTarget: InteractionTarget | null;
  moved: boolean;
}

export function getInteractionMode(state: FlowState): InteractionMode | null {
  switch (state) {
    case "CUSTOMIZE_OBJECT":
      return "CUSTOMIZE";
    case "RITUAL_RELEASE":
      return "RITUAL_RELEASE";
    case "SHARED_WORLD_EXPLORE":
      return "WORLD_EXPLORE";
    default:
      return null;
  }
}

export function isCameraLocked(mode: InteractionMode): boolean {
  return mode === "RITUAL_RELEASE";
}

export function getPinchZoomFactor(current: number, scale: number): number {
  return Math.max(PINCH_ZOOM_MIN, Math.min(PINCH_ZOOM_MAX, current * scale));
}

const distanceBetween = (a: PointerSample, b: PointerSample) => Math.hypot(a.x - b.x, a.y - b.y);

/** Routes pointer gestures to the active flow mode and drops all state when the mode changes. */
export function createInputSeparator(
  mode: InteractionMode,
  onAction: (action: InteractionAction) => void,
): InputSeparator {
  const pointers = new Map<number, TrackedPointer>();
  let previousPinchDistance: number | null = null;

  function pointerDown(sample: PointerSample) {
    const pointer: TrackedPointer = {
      ...sample,
      startX: sample.x,
      startY: sample.y,
      startTime: sample.time,
      startTarget: sample.target ?? null,
      moved: false,
    };
    pointers.set(sample.pointerId, pointer);

    if (mode === "CUSTOMIZE" && pointers.size === 2) {
      const [first, second] = [...pointers.values()];
      previousPinchDistance = distanceBetween(first, second);
      first.moved = true;
      second.moved = true;
    }
  }

  function pointerMove(sample: PointerSample) {
    const pointer = pointers.get(sample.pointerId);
    if (!pointer) return;

    const deltaX = sample.x - pointer.x;
    const deltaY = sample.y - pointer.y;
    pointer.x = sample.x;
    pointer.y = sample.y;
    pointer.time = sample.time;

    if (mode === "CUSTOMIZE" && pointers.size === 2) {
      const [first, second] = [...pointers.values()];
      const nextDistance = distanceBetween(first, second);
      if (previousPinchDistance !== null && previousPinchDistance > 0 && nextDistance > 0) {
        onAction({ type: "PINCH_ZOOM", scale: nextDistance / previousPinchDistance });
      }
      previousPinchDistance = nextDistance;
      return;
    }

    const movedDistance = Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY);
    if (movedDistance < DRAG_START_DISTANCE_PX) return;
    pointer.moved = true;

    if (mode === "CUSTOMIZE") {
      onAction({ type: "ROTATE_KRATHONG", deltaX });
    } else if (mode === "RITUAL_RELEASE" && pointer.startTarget === "krathong") {
      onAction({ type: "DRAG_KRATHONG", deltaX, deltaY });
    } else if (mode === "WORLD_EXPLORE") {
      onAction({ type: "PAN_RIVER", deltaX, deltaY });
    }
  }

  function pointerUp(sample: PointerSample) {
    const pointer = pointers.get(sample.pointerId);
    if (!pointer) return;

    const duration = sample.time - pointer.startTime;
    const movedDistance = Math.hypot(sample.x - pointer.startX, sample.y - pointer.startY);
    const moved = pointer.moved || movedDistance >= DRAG_START_DISTANCE_PX;

    if (
      mode === "WORLD_EXPLORE" &&
      !moved &&
      duration >= 0 &&
      duration <= TAP_MAX_DURATION_MS
    ) {
      onAction({ type: "TAP_INTERACT", target: pointer.startTarget ?? sample.target ?? "water" });
    } else if (
      mode === "RITUAL_RELEASE" &&
      pointer.startTarget === "krathong" &&
      moved &&
      sample.target === "water"
    ) {
      onAction({ type: "RELEASE_KRATHONG" });
    }

    pointers.delete(sample.pointerId);
    if (pointers.size < 2) previousPinchDistance = null;
  }

  return {
    pointerDown,
    pointerMove,
    pointerUp,
    pointerCancel(pointerId) {
      pointers.delete(pointerId);
      if (pointers.size < 2) previousPinchDistance = null;
    },
  };
}
