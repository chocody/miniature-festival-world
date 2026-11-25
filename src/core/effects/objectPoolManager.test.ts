// @vitest-environment node
import { describe, expect, it } from "vitest";
import { EFFECT_POOL_CAPS } from "@/config/performance.config";
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
