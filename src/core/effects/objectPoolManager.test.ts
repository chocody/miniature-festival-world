// @vitest-environment node
import { describe, expect, it } from "vitest";
import { EFFECT_KINDS, EFFECT_POOL_CAPS } from "@/config/performance.config";
import { createObjectPoolManager } from "./objectPoolManager";

describe("createObjectPoolManager", () => {
  it.each(["HIGH", "MEDIUM", "LOW"] as const)("sizes the pools from the %s caps", (tier) => {
    const caps = EFFECT_POOL_CAPS[tier];
    const m = createObjectPoolManager(caps);
    expect(m.ripple.capacity).toBe(caps.ripple);
    expect(m.glow.capacity).toBe(caps.glow);
  });

  it("counts per kind and releases all", () => {
    const m = createObjectPoolManager(EFFECT_POOL_CAPS.HIGH);
    m.ripple.acquire(1);
    m.ripple.acquire(2);
    expect(m.activeCount("ripple")).toBe(2);
    expect(m.activeCount("glow")).toBe(0);
    m.glow.acquire(3);
    m.releaseAll();
    expect(m.activeCount("ripple")).toBe(0);
    expect(m.activeCount("glow")).toBe(0);
  });
});

describe("MFW-60 pools", () => {
  const NEW_KINDS = ["nudge", "windowGlow", "firework", "skyLantern"] as const;

  it.each(["HIGH", "MEDIUM", "LOW"] as const)("OP1 %s: each new pool's capacity equals caps[kind]", (tier) => {
    const caps = EFFECT_POOL_CAPS[tier];
    const m = createObjectPoolManager(caps);
    for (const kind of NEW_KINDS) expect(m[kind].capacity, kind).toBe(caps[kind]);
    for (const kind of EFFECT_KINDS) expect(m.activeCount(kind)).toBe(0);
  });

  it.each(["HIGH", "MEDIUM", "LOW"] as const)("OP2 %s: acquiring cap + 3 keeps activeCount at the cap and recycles the oldest", (tier) => {
    const caps = EFFECT_POOL_CAPS[tier];
    const m = createObjectPoolManager(caps);
    for (const kind of EFFECT_KINDS) {
      const pool = m[kind];
      const first = pool.acquire(0);
      for (let i = 1; i < caps[kind] + 3; i++) pool.acquire(i);
      expect(m.activeCount(kind), kind).toBe(caps[kind]);
      expect(first.startedAtMs).toBeGreaterThan(0); // slot 0 (the oldest) was recycled
    }
  });

  it("OP3: releaseAll clears every kind", () => {
    const m = createObjectPoolManager(EFFECT_POOL_CAPS.HIGH);
    for (const kind of EFFECT_KINDS) m[kind].acquire(1);
    m.releaseAll();
    for (const kind of EFFECT_KINDS) expect(m.activeCount(kind)).toBe(0);
  });

  it("initial states are neutral (render-time only, never persisted)", () => {
    const m = createObjectPoolManager(EFFECT_POOL_CAPS.LOW);
    // MFW-58: lamp glow, window glow and nudge states carry their stretch copy (default 0).
    expect(m.nudge.entryAt(0).state).toEqual({ kind: "tree", index: 0, stretchIndex: 0 });
    expect(m.windowGlow.entryAt(0).state).toEqual({ houseIndex: 0, stretchIndex: 0 });
    expect(m.glow.entryAt(0).state).toEqual({ lampIndex: 0, stretchIndex: 0 });
    expect(m.firework.entryAt(0).state).toEqual({ x: 0, y: 0, z: 0, paletteIndex: 0 });
    expect(m.skyLantern.entryAt(0).state).toEqual({ x: 0, y: 0, z: 0 });
  });
});
