/** Release ritual (backlog story "Make & Release", MFW-23). Feel values are PLACEHOLDER (spec silent); see plan §11 Q7. */

/** spec §4.1: lateralOffset ∈ [-0.5, 0.5]. Three-free copy of LATERAL_OFFSET_RANGE[1] (pinned by ritual.config.test.ts). */
export const SPLINE_LATERAL_OFFSET_LIMIT = 0.5;

/** Spring progress values: 0 = start pose, 1 = end pose. */
export const RELEASE_MOTION_START = 0;
export const RELEASE_MOTION_END = 1;

/** Krathong from the pier (or the drop point at deck height) down to the water. PLACEHOLDER. */
export const RELEASE_LOWER_SPRING = Object.freeze({ mass: 1, tension: 140, friction: 22 });
/** Touchdown point → saved river spot. PLACEHOLDER. */
export const RELEASE_SETTLE_SPRING = Object.freeze({ mass: 1, tension: 90, friction: 20 });
/** Collision bump (owner decision 25): a hop that springs back to rest. hopHeight in world units. PLACEHOLDER. */
export const RELEASE_BUMP = Object.freeze({
  hopHeight: 0.08,
  fromValue: 1,
  restValue: 0,
  spring: Object.freeze({ mass: 1, tension: 320, friction: 8 }),
});
/** "แสงเทียนสว่างขึ้น": candle point light intensity × brightenFactor at touchdown. PLACEHOLDER. */
export const RELEASE_CANDLE = Object.freeze({
  brightenFactor: 1.8,
  spring: Object.freeze({ mass: 1, tension: 120, friction: 26 }),
});

/** Float tolerance when comparing a sent coord with the server's (JSON round-trips doubles exactly). Lead decision, MFW-23. */
export const RELEASE_SPOT_MATCH_EPSILON = 1e-9;
/** Client timeout of POST /api/creations; then the release fails with "timeout" (shown as a network error). Lead decision, MFW-23. */
export const CREATE_CREATION_TIMEOUT_MS = 15_000;

/** After SAVED, a scene that has not finished the release animation by then is skipped so the flow cannot stick (Canvas crash, lost context). PLACEHOLDER. */
export const RELEASE_SCENE_WATCHDOG_MS = 6_000;

/** Thai UI copy. PLACEHOLDER wording except the two strings marked "existing" (plan §11 Q6). */
export const RITUAL_COPY = Object.freeze({
  panelLabel: "พิธีปล่อยกระทง",
  hint: "ลากกระทงลงน้ำ หรือกดปุ่มปล่อยกระทง", // existing (FlowStepPlaceholder)
  releaseButton: "ปล่อยกระทง", // existing
  releasing: "กำลังปล่อยกระทง…",
  dropOnWater: "วางกระทงบนผิวน้ำเพื่อปล่อย",
  errors: Object.freeze({
    network: "เชื่อมต่อไม่ได้ ลองกดปล่อยกระทงอีกครั้ง",
    timeout: "เชื่อมต่อไม่ได้ ลองกดปล่อยกระทงอีกครั้ง",
    unavailable: "ยังบันทึกกระทงไม่ได้ในขณะนี้ ลองใหม่อีกครั้งภายหลัง",
    event_closed: "ช่วงเวลาปล่อยกระทงของเทศกาลนี้ปิดแล้ว",
    rejected: "บันทึกกระทงไม่สำเร็จ ลองอีกครั้ง",
    invalid_response: "บันทึกกระทงไม่สำเร็จ ลองอีกครั้ง",
    unexpected: "บันทึกกระทงไม่สำเร็จ ลองอีกครั้ง",
  }),
});
