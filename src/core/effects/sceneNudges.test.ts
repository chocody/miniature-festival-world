// @vitest-environment node
import { describe, expect, it } from "vitest";
import { LAMP_GLOW_LOOK, NUDGE_TARGET_KINDS, REDUCED_MOTION_TAP_CUE } from "@/config/gimmicks.config";
import { EFFECT_POOL_CAPS } from "@/config/performance.config";
import { createLampGlowFrame, writeLampGlowFrameAt } from "./gimmickCurves";
import { createObjectPool } from "./objectPool";
import { createObjectPoolManager } from "./objectPoolManager";
import { findNudgeEntry, nudgeDurationMs, releaseExpiredNudges, retriggerGlow, startNudge } from "./sceneNudges";

const pool = () => createObjectPoolManager(EFFECT_POOL_CAPS.HIGH).nudge;

describe("scene nudges (MFW-60)", () => {
  it("SN1: findNudgeEntry matches kind and index only when active", () => {
    const p = pool();
    expect(findNudgeEntry(p, "tree", 0)).toBeNull();
    startNudge(p, "tree", 2, 10);
    startNudge(p, "rock", 2, 10);
    const e = findNudgeEntry(p, "tree", 2)!;
    expect(e.state).toEqual({ kind: "tree", index: 2, stretchIndex: 0 }); // MFW-58: default stretch 0
    expect(findNudgeEntry(p, "rock", 2)).not.toBe(e);
    expect(findNudgeEntry(p, "tree", 1)).toBeNull();
    expect(findNudgeEntry(p, "bush", 2)).toBeNull();
    p.release(e);
    expect(findNudgeEntry(p, "tree", 2)).toBeNull();
  });

  it("SN2: a re-tap reuses the entry and restarts it", () => {
    const p = pool();
    startNudge(p, "villager", 3, 100);
    const e = findNudgeEntry(p, "villager", 3)!;
    startNudge(p, "villager", 3, 400);
    expect(p.activeCount).toBe(1);
    expect(findNudgeEntry(p, "villager", 3)).toBe(e);
    expect(e.startedAtMs).toBe(400);
  });

  it("SN2: a full pool recycles the oldest", () => {
    const p = createObjectPool(
      2,
      () =>
        ({ kind: "tree" as const, index: 0, stretchIndex: 0 }) as {
          kind: (typeof NUDGE_TARGET_KINDS)[number];
          index: number;
          stretchIndex: number;
        },
    );
    startNudge(p, "tree", 0, 1);
    startNudge(p, "tree", 1, 2);
    startNudge(p, "rock", 0, 3);
    expect(p.activeCount).toBe(2);
    expect(findNudgeEntry(p, "tree", 0)).toBeNull();
    expect(findNudgeEntry(p, "rock", 0)).not.toBeNull();
  });

  it.each([false, true])("SN3: releaseExpiredNudges releases at exactly nudgeDurationMs (reduced motion %s)", (reduced) => {
    for (const kind of NUDGE_TARGET_KINDS) {
      const p = pool();
      startNudge(p, kind, 0, 0);
      startNudge(p, kind, 1, 50);
      const d = nudgeDurationMs(kind, reduced);
      expect(d).toBeGreaterThan(0);
      if (reduced) expect(d).toBe(REDUCED_MOTION_TAP_CUE.holdMs);
      expect(releaseExpiredNudges(p, d - 1, reduced)).toBe(0);
      expect(releaseExpiredNudges(p, d, reduced)).toBe(1);
      expect(findNudgeEntry(p, kind, 0)).toBeNull();
      expect(releaseExpiredNudges(p, d + 50, reduced)).toBe(1);
      expect(p.activeCount).toBe(0);
      expect(releaseExpiredNudges(p, d + 5_000, reduced)).toBe(0);
    }
  });

  it("SN4: retriggerGlow keeps age ≤ attack and the envelope never drops below its value before the re-tap", () => {
    const L = LAMP_GLOW_LOOK;
    const p = createObjectPool(1, () => ({}));
    const e = p.acquire(0);
    const frame = createLampGlowFrame();
    let previous = 0;
    for (let t = 0; t <= 3_000; t += 100) {
      const before = writeLampGlowFrameAt(t - e.startedAtMs, true, frame).intensity;
      retriggerGlow(e, t, L.attackMs);
      expect(t - e.startedAtMs).toBeLessThanOrEqual(L.attackMs);
      const after = writeLampGlowFrameAt(t - e.startedAtMs, true, frame).intensity;
      expect(after).toBeGreaterThanOrEqual(before - 1e-12);
      expect(after).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = after;
    }
    expect(previous).toBe(L.peakIntensity);
    const fresh = p.acquire(0);
    retriggerGlow(fresh, Number.NaN, L.attackMs);
    expect(Number.isNaN(fresh.startedAtMs)).toBe(true); // a bad clock never throws
  });

  it("SN5 (MFW-58): the same kind + index in another stretch is a separate entry; default stretch 0 keeps the old behaviour", () => {
    const p = pool();
    startNudge(p, "tree", 4, 10);
    startNudge(p, "tree", 4, 20, 1);
    startNudge(p, "tree", 4, 30, -2);
    expect(p.activeCount).toBe(3);
    expect(findNudgeEntry(p, "tree", 4)).toBe(findNudgeEntry(p, "tree", 4, 0));
    expect(findNudgeEntry(p, "tree", 4, 1)!.startedAtMs).toBe(20);
    expect(findNudgeEntry(p, "tree", 4, -2)!.state).toEqual({ kind: "tree", index: 4, stretchIndex: -2 });
    expect(findNudgeEntry(p, "tree", 4, 2)).toBeNull();
    startNudge(p, "tree", 4, 40, 1); // re-tap in stretch 1 restarts only that entry
    expect(p.activeCount).toBe(3);
    expect(findNudgeEntry(p, "tree", 4, 1)!.startedAtMs).toBe(40);
    expect(findNudgeEntry(p, "tree", 4, 0)!.startedAtMs).toBe(10);
  });
});
