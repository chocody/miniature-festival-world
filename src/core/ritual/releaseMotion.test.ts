// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  RELEASE_BUMP,
  RELEASE_CANDLE,
  RELEASE_LOWER_SPRING,
  RELEASE_MOTION_END,
  RELEASE_MOTION_START,
  RELEASE_SETTLE_SPRING,
} from "@/config/ritual.config";
import { createReleaseMotion, type ScalarSpringApi, type ScalarSpringStart } from "./releaseMotion";

const BASE = 14;
function setup(reduced: boolean) {
  const calls = { lower: [], settle: [], bump: [], candle: [] } as Record<string, ScalarSpringStart[]>;
  const api = (name: string): ScalarSpringApi => ({ start: (o) => void calls[name].push(o) });
  const motion = createReleaseMotion(
    { lower: api("lower"), settle: api("settle"), bump: api("bump"), candle: api("candle") },
    reduced,
    BASE,
  );
  return { calls, motion };
}

describe("release motion", () => {
  it("animates with springs and completes on rest", () => {
    const { calls, motion } = setup(false);
    let done = 0;
    motion.lower(() => done++);
    expect(calls.lower).toHaveLength(1);
    expect(calls.lower[0]).toMatchObject({
      from: { value: RELEASE_MOTION_START },
      to: { value: RELEASE_MOTION_END },
      immediate: false,
      config: RELEASE_LOWER_SPRING,
    });
    expect(done).toBe(0);
    calls.lower[0].onRest!();
    expect(done).toBe(1);
    motion.settle(() => done++);
    expect(calls.settle[0].config).toEqual(RELEASE_SETTLE_SPRING);
    expect(calls.settle[0].immediate).toBe(false);
    motion.bump();
    expect(calls.bump[0]).toMatchObject({
      from: { value: RELEASE_BUMP.fromValue },
      to: { value: RELEASE_BUMP.restValue },
      immediate: false,
    });
    motion.brightenCandle();
    expect(calls.candle[0]).toMatchObject({ to: { value: BASE * RELEASE_CANDLE.brightenFactor }, immediate: false });
  });

  it("reduced motion is immediate and synchronous", () => {
    const { calls, motion } = setup(true);
    let done = 0;
    motion.lower(() => done++);
    motion.settle(() => done++);
    expect(done).toBe(2);
    motion.bump();
    motion.brightenCandle();
    for (const list of Object.values(calls)) {
      expect(list).toHaveLength(1);
      for (const o of list) {
        expect(o.immediate).toBe(true);
        expect(o.from).toBeUndefined();
        expect(o.config).toBeUndefined();
      }
    }
  });

  it("reset sets four immediate values", () => {
    const { calls, motion } = setup(false);
    motion.reset();
    expect(calls.lower[0]).toMatchObject({ to: { value: RELEASE_MOTION_START }, immediate: true });
    expect(calls.settle[0]).toMatchObject({ to: { value: RELEASE_MOTION_START }, immediate: true });
    expect(calls.bump[0]).toMatchObject({ to: { value: RELEASE_BUMP.restValue }, immediate: true });
    expect(calls.candle[0]).toMatchObject({ to: { value: BASE }, immediate: true });
  });
});
