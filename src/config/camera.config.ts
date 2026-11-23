/** Reusable orthographic viewing angle for focusing targets in the miniature world. */
export const CAMERA_FLIGHT_OFFSET = [4.5, 5.5, 7] as const;

/** Smooth, interruptible camera transition tuned for short scene navigation. */
export const CAMERA_FLIGHT_SPRING_CONFIG = Object.freeze({ mass: 1, tension: 170, friction: 26 });

/** Per-target highlight rings, sized to remain visible around the scene object. */
export const HIGHLIGHT_RING_SIZES = Object.freeze({
  water: Object.freeze({ innerRadius: 0.42, outerRadius: 0.56, heightOffset: 0.04 }),
  krathong: Object.freeze({ innerRadius: 1.35, outerRadius: 1.55, heightOffset: 0.26 }),
  lamp: Object.freeze({ innerRadius: 0.28, outerRadius: 0.42, heightOffset: 0.04 }),
});
