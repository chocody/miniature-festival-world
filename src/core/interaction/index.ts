import type { FlowState } from "@/core/flow";
import {
  CUSTOMIZE_ROTATE_STEP_RADIANS,
  CUSTOMIZE_ZOOM_STEP_SCALE,
  DRAG_START_DISTANCE_PX,
  PINCH_ZOOM_MAX,
  PINCH_ZOOM_MIN,
  ROTATION_RADIANS_PER_PIXEL,
  TAP_MAX_DURATION_MS,
  TWIST_START_RADIANS,
  WHEEL_LINE_HEIGHT_PX,
  WHEEL_ZOOM_PER_PIXEL,
} from "@/config/interaction.config";

export const INTERACTION_MODES = ["CUSTOMIZE", "RITUAL_RELEASE", "WORLD_EXPLORE"] as const;
export type InteractionMode = (typeof INTERACTION_MODES)[number];
export type InteractionTarget = "krathong" | "water" | "lamp";

export type InteractionAction =
  | { type: "ROTATE_KRATHONG"; deltaX: number }
  | { type: "PINCH_ZOOM"; scale: number }
  | { type: "DRAG_KRATHONG"; deltaX: number; deltaY: number }
  | { type: "RELEASE_KRATHONG" }
  | { type: "PAN_RIVER"; deltaX: number; deltaY: number; time: number }
  /** WORLD_EXPLORE: the pan pointer lifted (`time`) or the pan stopped without inertia (`null`: 2nd finger, cancel). */
  | { type: "PAN_END"; time: number | null }
  /** WORLD_EXPLORE: two-finger twist past TWIST_START_RADIANS (screen y-down: clockwise is positive). */
  | { type: "ROTATE_VIEW"; deltaRad: number }
  | { type: "TAP_INTERACT"; target: InteractionTarget };

export interface PointerSample {
  pointerId: number;
  x: number;
  y: number;
  time: number;
  target?: InteractionTarget | null;
}

/** `pointerMove`/`pointerUp` never retain the sample object (callers may reuse one). */
export interface InputSeparator {
  pointerDown(sample: PointerSample): void;
  pointerMove(sample: PointerSample): void;
  pointerUp(sample: PointerSample): void;
  pointerCancel(pointerId: number): void;
  /** True once the pointer has moved past DRAG_START_DISTANCE_PX (or pinched). False for unknown or released ids. */
  isDragging(pointerId: number): boolean;
}

interface TrackedPointer extends PointerSample {
  readonly startX: number;
  readonly startY: number;
  readonly startTime: number;
  readonly startTarget: InteractionTarget | null;
  moved: boolean;
  /** WORLD_EXPLORE: this pointer emitted PAN_RIVER and owes a PAN_END. */
  panning: boolean;
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

/**
 * WORLD_EXPLORE captures only once a drag starts. Capturing on pointerdown sends the click to the section, and R3F
 * never sees it (MFW-59).
 */
export function capturesOnPointerDown(mode: InteractionMode): boolean {
  return mode !== "WORLD_EXPLORE";
}

export function isCameraLocked(mode: InteractionMode): boolean {
  return mode === "RITUAL_RELEASE";
}

export function getPinchZoomFactor(current: number, scale: number): number {
  return Math.max(PINCH_ZOOM_MIN, Math.min(PINCH_ZOOM_MAX, current * scale));
}

/** -1 = left / out, 1 = right / in. */
export type ViewStepDirection = -1 | 1;

/** Imperative view commands for the customizer's rotate/zoom buttons; implemented by SceneViewport (CUSTOMIZE only). */
export interface CustomizeViewControl {
  rotate(direction: ViewStepDirection): void;
  zoom(direction: ViewStepDirection): void;
}

/** Krathong yaw after a CUSTOMIZE drag of deltaX px (the formula SceneViewport used inline). */
export function getRotationAfterDrag(current: number, deltaX: number): number {
  return current + deltaX * ROTATION_RADIANS_PER_PIXEL;
}

/** Krathong yaw after one rotate-button tap. Drag right and หมุนขวา both increase the angle. */
export function getRotationAfterStep(current: number, direction: ViewStepDirection): number {
  return current + direction * CUSTOMIZE_ROTATE_STEP_RADIANS;
}

/** Zoom factor after one zoom-button tap, through the same clamp as pinch. */
export function getZoomFactorAfterStep(current: number, direction: ViewStepDirection): number {
  return getPinchZoomFactor(current, direction === 1 ? CUSTOMIZE_ZOOM_STEP_SCALE : 1 / CUSTOMIZE_ZOOM_STEP_SCALE);
}

const distanceBetween = (a: PointerSample, b: PointerSample) => Math.hypot(a.x - b.x, a.y - b.y);

/** WheelEvent.deltaMode values (DOM standard). */
export const WHEEL_DELTA_MODE = Object.freeze({ pixel: 0, line: 1, page: 2 });

/** Maps an angle into (−π, π]. */
export function wrapAngleRad(a: number): number {
  const turn = 2 * Math.PI;
  let r = a % turn;
  if (r <= -Math.PI) r += turn;
  else if (r > Math.PI) r -= turn;
  return r;
}

/** Screen angle (y-down) of the line from a to b. */
export function getTwistAngle(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** Zoom scale of one wheel event: a wheel up (negative deltaY) gives > 1, i.e. zoom in. */
export function getWheelZoomScale(deltaY: number, deltaMode: number, pageHeightPx: number): number {
  const unit =
    deltaMode === WHEEL_DELTA_MODE.line ? WHEEL_LINE_HEIGHT_PX : deltaMode === WHEEL_DELTA_MODE.page ? pageHeightPx : 1;
  const px = deltaY * unit;
  if (!Number.isFinite(px)) return 1;
  return Math.exp(-px * WHEEL_ZOOM_PER_PIXEL);
}

/** Routes pointer gestures to the active flow mode and drops all state when the mode changes. */
export function createInputSeparator(
  mode: InteractionMode,
  onAction: (action: InteractionAction) => void,
): InputSeparator {
  const pointers = new Map<number, TrackedPointer>();
  let previousPinchDistance: number | null = null;
  // WORLD_EXPLORE two-finger state (pinch + twist).
  let pairA: TrackedPointer | null = null;
  let pairB: TrackedPointer | null = null;
  let previousTwistAngle = 0;
  let twistAccum = 0;
  let twisting = false;

  /** Re-reads the two tracked pointers (down/up/cancel only, never per move). */
  function resetPair() {
    if (pointers.size === 2) {
      let first: TrackedPointer | null = null;
      let second: TrackedPointer | null = null;
      for (const p of pointers.values()) {
        if (first === null) first = p;
        else second = p;
      }
      pairA = first;
      pairB = second;
      previousPinchDistance = distanceBetween(first!, second!);
      previousTwistAngle = getTwistAngle(first!, second!);
      twistAccum = 0;
      twisting = false;
    } else {
      pairA = null;
      pairB = null;
      previousPinchDistance = null;
    }
  }

  function pointerDown(sample: PointerSample) {
    const pointer: TrackedPointer = {
      ...sample,
      startX: sample.x,
      startY: sample.y,
      startTime: sample.time,
      startTarget: sample.target ?? null,
      moved: false,
      panning: false,
    };
    pointers.set(sample.pointerId, pointer);

    if (mode === "WORLD_EXPLORE" && pointers.size >= 2) {
      for (const p of pointers.values()) {
        if (p.panning) {
          p.panning = false;
          onAction({ type: "PAN_END", time: null }); // a second finger stops the pan without inertia
        }
        p.moved = true; // multi-finger pointers never tap
      }
      resetPair();
    }

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

    if (mode === "WORLD_EXPLORE" && pointers.size >= 2) {
      if (pointers.size === 2 && pairA !== null && pairB !== null && (pointer === pairA || pointer === pairB)) {
        const nextDistance = distanceBetween(pairA, pairB);
        if (previousPinchDistance !== null && previousPinchDistance > 0 && nextDistance > 0) {
          onAction({ type: "PINCH_ZOOM", scale: nextDistance / previousPinchDistance });
        }
        previousPinchDistance = nextDistance;
        const angle = getTwistAngle(pairA, pairB);
        const d = wrapAngleRad(angle - previousTwistAngle);
        previousTwistAngle = angle;
        if (twisting) {
          if (d !== 0) onAction({ type: "ROTATE_VIEW", deltaRad: d });
        } else {
          twistAccum += d;
          if (Math.abs(twistAccum) >= TWIST_START_RADIANS) twisting = true; // the accumulated part is not emitted
        }
      }
      return; // never PAN_RIVER with 2+ pointers
    }

    const movedDistance = Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY);
    if (movedDistance < DRAG_START_DISTANCE_PX) return;
    const firstDragMove = !pointer.moved;
    pointer.moved = true;

    if (mode === "CUSTOMIZE") {
      onAction({ type: "ROTATE_KRATHONG", deltaX });
    } else if (mode === "RITUAL_RELEASE" && pointer.startTarget === "krathong") {
      onAction({ type: "DRAG_KRATHONG", deltaX, deltaY });
    } else if (mode === "WORLD_EXPLORE") {
      // The first PAN_RIVER carries the whole displacement since pointerdown, so the world follows from the down point.
      pointer.panning = true;
      onAction(
        firstDragMove
          ? { type: "PAN_RIVER", deltaX: pointer.x - pointer.startX, deltaY: pointer.y - pointer.startY, time: sample.time }
          : { type: "PAN_RIVER", deltaX, deltaY, time: sample.time },
      );
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
    } else if (mode === "WORLD_EXPLORE" && pointer.panning) {
      onAction({ type: "PAN_END", time: sample.time });
    }

    pointers.delete(sample.pointerId);
    if (mode === "WORLD_EXPLORE") resetPair();
    else if (pointers.size < 2) previousPinchDistance = null;
  }

  return {
    pointerDown,
    pointerMove,
    pointerUp,
    pointerCancel(pointerId) {
      const pointer = pointers.get(pointerId);
      if (mode === "WORLD_EXPLORE" && pointer?.panning) onAction({ type: "PAN_END", time: null });
      pointers.delete(pointerId);
      if (mode === "WORLD_EXPLORE") resetPair();
      else if (pointers.size < 2) previousPinchDistance = null;
    },
    isDragging(pointerId) {
      return pointers.get(pointerId)?.moved ?? false;
    },
  };
}
