import { createRef } from "react";
import { cleanup, render } from "@testing-library/react";
import { BufferGeometry, InstancedMesh, Material, Matrix4, Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOY_KRATHONG_RIVER_ENVIRONMENT, RIVER_ENVIRONMENT_PARTS } from "@/config/events/loyKrathong.river.config";
import {
  FIREWORK_LOOK,
  FIREWORK_MIN_LAUNCH_INTERVAL_MS,
  LAMP_GLOW_LOOK,
  RIPPLE_LOOK,
  SCENE_TAP_REACTIONS,
  SCENE_TARGET_KINDS,
  SKY_LANTERN_LOOK,
  WINDOW_GLOW_LOOK,
} from "@/config/gimmicks.config";
import { EFFECT_KINDS, type EffectPoolCaps } from "@/config/performance.config";
import { createObjectPoolManager, nudgeDurationMs, type ObjectPoolManager } from "@/core/effects";
import { LOY_KRATHONG_RIVER_LAYOUT } from "@/components/models/loyKrathong";
import { SCENE_OBJECT_NAMES } from "../sceneObjectNames";
import { SCENE_EFFECT_CLOCK, SceneEffects, type SceneEffectsHandle } from "./SceneEffects";
import { fireworkInstancesPerBurst } from "./effectMeshes";
import type { EndlessRiverFrame } from "@/core/coordinates/endlessRiverFrame";
import { getLoyKrathongEndlessRiverFrame } from "@/core/world/endlessRiver";

const r3f = vi.hoisted(() => ({ frame: null as null | (() => void), invalidate: vi.fn() }));
const spies = vi.hoisted(() => ({ ripple: vi.fn(), glow: vi.fn(), meshes: [] as import("three").InstancedMesh[] }));

vi.mock("@react-three/fiber", () => ({
  useFrame: (cb: () => void) => {
    r3f.frame = cb;
  },
  useThree: (sel: (s: { invalidate: () => void }) => unknown) => sel({ invalidate: r3f.invalidate }),
}));

vi.mock("./effectMeshes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./effectMeshes")>();
  const track = <T extends { mesh: import("three").InstancedMesh }>(e: T): T => {
    spies.meshes.push(e.mesh);
    return e;
  };
  return {
    ...actual,
    createRippleMesh: (...args: Parameters<typeof actual.createRippleMesh>) => {
      spies.ripple();
      return track(actual.createRippleMesh(...args));
    },
    createLampGlowMesh: (...args: Parameters<typeof actual.createLampGlowMesh>) => {
      spies.glow();
      return track(actual.createLampGlowMesh(...args));
    },
    createWindowGlowMesh: (...args: Parameters<typeof actual.createWindowGlowMesh>) => track(actual.createWindowGlowMesh(...args)),
    createFireworkMesh: (...args: Parameters<typeof actual.createFireworkMesh>) => track(actual.createFireworkMesh(...args)),
    createSkyLanternMesh: (...args: Parameters<typeof actual.createSkyLanternMesh>) => track(actual.createSkyLanternMesh(...args)),
  };
});

let NOW = 1_000_000;
const lamps = LOY_KRATHONG_RIVER_LAYOUT.lamps;
const W = LOY_KRATHONG_RIVER_ENVIRONMENT.houseFacade.windows.length;
const HOUSES = LOY_KRATHONG_RIVER_LAYOUT.houses.length;
const CAPS: EffectPoolCaps = { ripple: 3, glow: 2, nudge: 3, windowGlow: 2, firework: 2, skyLantern: 2 };
const SPARKS = 8;
const meshNamed = (name: string) => spies.meshes.filter((m) => m.name === name).at(-1)!;
const ui = (
  ref: React.Ref<SceneEffectsHandle>,
  pools: ObjectPoolManager = createObjectPoolManager(CAPS),
  reducedMotion = false,
  frame: EndlessRiverFrame | null = null,
) => (
  <SceneEffects
    handleRef={ref}
    pools={pools}
    reducedMotion={reducedMotion}
    waterSurfaceY={LOY_KRATHONG_RIVER_LAYOUT.waterSurfaceY}
    lamps={lamps}
    lampHead={RIVER_ENVIRONMENT_PARTS.lampHead}
    houseWindows={LOY_KRATHONG_RIVER_LAYOUT.houseWindows}
    windowsPerHouse={W}
    windowPart={RIVER_ENVIRONMENT_PARTS.houseWindow}
    fireworkBaseY={LOY_KRATHONG_RIVER_LAYOUT.bankTopY}
    fireworkSparks={SPARKS}
    now={() => NOW}
    frame={frame}
  />
);

beforeEach(() => {
  NOW = 1_000_000;
  r3f.frame = null;
  r3f.invalidate.mockClear();
  spies.ripple.mockClear();
  spies.glow.mockClear();
  spies.meshes.length = 0;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SceneEffects", () => {
  it("caps ripples and creates the mesh once", () => {
    const ref = createRef<SceneEffectsHandle>();
    render(ui(ref));
    r3f.invalidate.mockClear();
    for (let i = 0; i < 10; i++) ref.current!.spawnRipple({ x: 0, z: 0 });
    expect(ref.current!.activeCount("ripple")).toBe(3);
    expect(r3f.invalidate).toHaveBeenCalledTimes(10);
    expect(spies.ripple).toHaveBeenCalledTimes(1);
    ref.current!.spawnRipple({ x: Number.NaN, z: 0 });
    expect(ref.current!.activeCount("ripple")).toBe(3);
    expect(r3f.invalidate).toHaveBeenCalledTimes(10);
  });

  it("lights lamps, re-triggers a lit lamp without dipping and ignores bad indices", () => {
    const ref = createRef<SceneEffectsHandle>();
    const pools = createObjectPoolManager(CAPS);
    render(ui(ref, pools));
    expect(ref.current!.lightLamp(1)).toBe(true);
    NOW += LAMP_GLOW_LOOK.attackMs * 3;
    ref.current!.lightLamp(1);
    expect(ref.current!.activeCount("glow")).toBe(1);
    // MFW-60 (WCAG): the re-tap keeps the glow at its peak (age = attack), it does not restart the attack from dark.
    const lit = [0, 1].map((s) => pools.glow.entryAt(s)).find((e) => e.active)!;
    expect(NOW - lit.startedAtMs).toBe(LAMP_GLOW_LOOK.attackMs);
    ref.current!.lightLamp(0);
    expect(ref.current!.activeCount("glow")).toBe(2);
    ref.current!.lightLamp(lamps.length - 1);
    expect(ref.current!.activeCount("glow")).toBe(2);
    r3f.invalidate.mockClear();
    for (const bad of [-1, 1.5, lamps.length]) ref.current!.lightLamp(bad);
    expect(ref.current!.activeCount("glow")).toBe(2);
    expect(r3f.invalidate).not.toHaveBeenCalled();
  });

  it("draws while effects run and stops the loop when idle", () => {
    const ref = createRef<SceneEffectsHandle>();
    render(ui(ref));
    const set = vi.spyOn(InstancedMesh.prototype, "setMatrixAt");
    ref.current!.spawnRipple({ x: 1, z: 1 });
    ref.current!.lightLamp(0);
    r3f.invalidate.mockClear();
    r3f.frame!();
    expect(set).toHaveBeenCalled();
    expect(r3f.invalidate).toHaveBeenCalled();
    NOW += Math.max(RIPPLE_LOOK.durationMs, LAMP_GLOW_LOOK.durationMs) + 1;
    r3f.frame!();
    expect(ref.current!.activeCount("ripple")).toBe(0);
    expect(ref.current!.activeCount("glow")).toBe(0);
    r3f.invalidate.mockClear();
    r3f.frame!();
    expect(r3f.invalidate).not.toHaveBeenCalled();
  });

  it("creates and disposes meshes per cap, not per render", () => {
    const ref = createRef<SceneEffectsHandle>();
    const pools = createObjectPoolManager(CAPS);
    const view = render(ui(ref, pools));
    const g = vi.spyOn(BufferGeometry.prototype, "dispose");
    const m = vi.spyOn(Material.prototype, "dispose");
    const i = vi.spyOn(InstancedMesh.prototype, "dispose");
    view.rerender(ui(ref, pools));
    expect(g).not.toHaveBeenCalled();
    expect(spies.ripple).toHaveBeenCalledTimes(1);
    view.rerender(ui(ref, createObjectPoolManager({ ...CAPS, ripple: 2 })));
    expect(spies.ripple).toHaveBeenCalledTimes(2);
    expect(spies.glow).toHaveBeenCalledTimes(1);
    expect(g).toHaveBeenCalledTimes(1);
    expect(m).toHaveBeenCalledTimes(1);
    expect(i).toHaveBeenCalledTimes(1);
    view.unmount();
    // MFW-60: five effect meshes (ripple, lamp glow, window glow, firework, sky lantern) are disposed on unmount.
    expect(g).toHaveBeenCalledTimes(6);
    expect(m).toHaveBeenCalledTimes(6);
    expect(i).toHaveBeenCalledTimes(6);
  });

  it("renders exactly five primitives (MFW-60: + window glow, firework, sky lantern)", () => {
    const { container } = render(ui(createRef<SceneEffectsHandle>()));
    expect(container.querySelectorAll("primitive")).toHaveLength(5);
  });
});

describe("SceneEffects reactions (MFW-60)", () => {
  const bankPoint = { x: -3, z: 2 };

  it("SE1: react returns the registry gimmick per kind, and null when nothing started", () => {
    const ref = createRef<SceneEffectsHandle>();
    render(ui(ref));
    const h = ref.current!;
    for (const kind of SCENE_TARGET_KINDS) {
      if (kind === "krathong") continue;
      NOW += FIREWORK_MIN_LAUNCH_INTERVAL_MS + 1;
      expect(h.react(kind, 0, bankPoint), kind).toBe(SCENE_TAP_REACTIONS[kind].gimmick);
    }
    NOW += FIREWORK_MIN_LAUNCH_INTERVAL_MS + 1;
    expect(h.react("water", 0, null)).toBeNull();
    expect(h.react("sky", 0, null)).toBeNull();
    expect(h.react("sky", 0, { x: Number.NaN, z: 0 })).toBeNull();
    expect(h.react("house", HOUSES, null)).toBeNull();
    expect(h.react("house", -1, null)).toBeNull();
    expect(h.react("lamp", lamps.length, null)).toBeNull();
    expect(h.react("tree", 1.5, null)).toBeNull();
    expect(h.react("villager", -2, null)).toBeNull();
  });

  it("SE2: a house tap lights its windows; a re-tap keeps them lit", () => {
    const ref = createRef<SceneEffectsHandle>();
    const pools = createObjectPoolManager(CAPS);
    render(ui(ref, pools));
    expect(ref.current!.react("house", 2, null)).toBe("house-lights");
    NOW += WINDOW_GLOW_LOOK.attackMs;
    r3f.frame!();
    const mesh = meshNamed(SCENE_OBJECT_NAMES.windowGlows);
    expect(mesh.count).toBe(W);
    expect(mesh.visible).toBe(true);
    NOW += WINDOW_GLOW_LOOK.durationMs - WINDOW_GLOW_LOOK.releaseMs; // in the release
    ref.current!.react("house", 2, null);
    expect(pools.windowGlow.activeCount).toBe(1);
    r3f.frame!();
    NOW += WINDOW_GLOW_LOOK.releaseMs; // the first light-up would be over now; the re-tap keeps it lit
    r3f.frame!();
    expect(mesh.count).toBe(W);
  });

  it("SE3: a lamp tap gives a glow and a sky lantern", () => {
    const ref = createRef<SceneEffectsHandle>();
    render(ui(ref));
    expect(ref.current!.react("lamp", 3, null)).toBe("lamp-glow");
    expect(ref.current!.activeCount("glow")).toBe(1);
    expect(ref.current!.activeCount("skyLantern")).toBe(1);
    NOW += 1_000;
    r3f.frame!();
    const lantern = meshNamed(SCENE_OBJECT_NAMES.skyLanterns);
    expect(lantern.count).toBe(2); // body + flame
    const m = new Matrix4();
    lantern.getMatrixAt(0, m);
    const p = new Vector3().setFromMatrixPosition(m);
    const head = lamps[3].position.y + RIVER_ENVIRONMENT_PARTS.lampHead.yOffset * lamps[3].scale;
    expect(p.y).toBeGreaterThan(head);
    NOW += SKY_LANTERN_LOOK.durationMs;
    r3f.frame!();
    expect(ref.current!.activeCount("skyLantern")).toBe(0);
  });

  it("SE4: fireworks are rate-limited to the WCAG flash rate (t, +100, +200, +340 → t and +340)", () => {
    const ref = createRef<SceneEffectsHandle>();
    const pools = createObjectPoolManager({ ...CAPS, firework: 3 });
    render(ui(ref, pools));
    const t0 = NOW;
    const launched: number[] = [];
    for (const dt of [0, 100, 200, 340]) {
      NOW = t0 + dt;
      if (ref.current!.react("sky", 0, bankPoint) !== null) launched.push(dt);
    }
    expect(launched).toEqual([0, 340]);
    expect(pools.firework.activeCount).toBe(2);
    expect(FIREWORK_MIN_LAUNCH_INTERVAL_MS).toBeCloseTo(1_000 / 3, 9);
  });

  it("SE4: a firework launches from the land point at the terrace height and cycles the palette", () => {
    const ref = createRef<SceneEffectsHandle>();
    const pools = createObjectPoolManager(CAPS);
    render(ui(ref, pools));
    ref.current!.launchFirework(bankPoint);
    NOW += FIREWORK_MIN_LAUNCH_INTERVAL_MS;
    ref.current!.launchFirework({ x: 1, z: 1 });
    const states = [0, 1].map((s) => pools.firework.entryAt(s).state);
    expect(states[0]).toEqual({ x: bankPoint.x, y: LOY_KRATHONG_RIVER_LAYOUT.bankTopY, z: bankPoint.z, paletteIndex: 0 });
    expect(states[1].paletteIndex).toBe(1 % FIREWORK_LOOK.palette.length);
  });

  it("SE5: reduced-motion variants are drawn statically", () => {
    const ref = createRef<SceneEffectsHandle>();
    render(ui(ref, createObjectPoolManager(CAPS), true));
    ref.current!.react("sky", 0, bankPoint);
    ref.current!.react("lamp", 0, null);
    r3f.frame!();
    const fw = meshNamed(SCENE_OBJECT_NAMES.fireworks);
    const lantern = meshNamed(SCENE_OBJECT_NAMES.skyLanterns);
    expect(fw.count).toBe(2 * SPARKS); // the static starburst at once (a head and a tail per spark), no rising shell
    const read = (mesh: InstancedMesh) => {
      const m = new Matrix4();
      return Array.from({ length: mesh.count }, (_, i) => (mesh.getMatrixAt(i, m), m.elements.join(",")));
    };
    const a = { fw: read(fw), lantern: read(lantern) };
    NOW += FIREWORK_LOOK.reducedMotionHoldMs - 1;
    r3f.frame!();
    expect(read(fw)).toEqual(a.fw);
    expect(read(lantern)).toEqual(a.lantern);
    NOW += 1;
    r3f.frame!();
    expect(fw.visible).toBe(false);
  });

  it("SE6: spamming each kind never exceeds its cap", () => {
    const ref = createRef<SceneEffectsHandle>();
    render(ui(ref));
    for (let i = 0; i < 20; i++) {
      NOW += FIREWORK_MIN_LAUNCH_INTERVAL_MS + 1;
      ref.current!.react("sky", 0, bankPoint);
      ref.current!.react("water", 0, bankPoint);
      ref.current!.react("house", i % HOUSES, null);
      ref.current!.react("lamp", i % lamps.length, null);
      ref.current!.react("tree", i, null);
      ref.current!.react("villager", i + 1, null);
    }
    for (const kind of EFFECT_KINDS) expect(ref.current!.activeCount(kind), kind).toBe(CAPS[kind]);
    r3f.frame!();
    expect(meshNamed(SCENE_OBJECT_NAMES.fireworks).count).toBeLessThanOrEqual(CAPS.firework * fireworkInstancesPerBurst(SPARKS));
    expect(meshNamed(SCENE_OBJECT_NAMES.windowGlows).count).toBeLessThanOrEqual(CAPS.windowGlow * W);
  });

  it("SE7: invalidate while active, once more after a nudge ends, never when idle", () => {
    const ref = createRef<SceneEffectsHandle>();
    const pools = createObjectPoolManager(CAPS);
    render(ui(ref, pools));
    ref.current!.react("rock", 1, null);
    r3f.invalidate.mockClear();
    r3f.frame!();
    expect(r3f.invalidate).toHaveBeenCalledTimes(1);
    NOW += nudgeDurationMs("rock", false);
    r3f.invalidate.mockClear();
    r3f.frame!(); // releases the nudge: one tail frame for the consumers' rest pose
    expect(pools.nudge.activeCount).toBe(0);
    expect(r3f.invalidate).toHaveBeenCalledTimes(1);
    r3f.invalidate.mockClear();
    r3f.frame!();
    r3f.frame!();
    expect(r3f.invalidate).not.toHaveBeenCalled();
  });

  it("SE8: meshes are created once per capacity and disposed on a capacity change and on unmount", () => {
    const ref = createRef<SceneEffectsHandle>();
    const pools = createObjectPoolManager(CAPS);
    const view = render(ui(ref, pools));
    const created = spies.meshes.length;
    expect(created).toBe(5);
    for (let i = 0; i < 3; i++) r3f.frame!();
    view.rerender(ui(ref, pools));
    expect(spies.meshes.length).toBe(created);
    const firework = meshNamed(SCENE_OBJECT_NAMES.fireworks);
    const disposed = vi.spyOn(InstancedMesh.prototype, "dispose");
    view.rerender(ui(ref, createObjectPoolManager({ ...CAPS, firework: 1 })));
    expect(disposed.mock.contexts).toEqual([firework]);
    expect(meshNamed(SCENE_OBJECT_NAMES.fireworks)).not.toBe(firework);
    view.unmount();
    expect(disposed).toHaveBeenCalledTimes(6);
  });

  it("SE9: react(krathong) returns null and starts nothing", () => {
    const ref = createRef<SceneEffectsHandle>();
    render(ui(ref));
    r3f.invalidate.mockClear();
    expect(ref.current!.react("krathong", 0, bankPoint)).toBeNull();
    for (const kind of EFFECT_KINDS) expect(ref.current!.activeCount(kind)).toBe(0);
    expect(r3f.invalidate).not.toHaveBeenCalled();
  });

  it("uses Date.now as the one effect clock by default", () => {
    vi.spyOn(Date, "now").mockReturnValue(42);
    expect(SCENE_EFFECT_CLOCK()).toBe(42);
  });

  it("RC8 (WCAG 2.3.1): sky taps every 50 ms for 2 s give at most 3 bursts in any second, in both motion modes", () => {
    for (const reduced of [false, true]) {
      cleanup();
      const ref = createRef<SceneEffectsHandle>();
      render(ui(ref, createObjectPoolManager({ ...CAPS, firework: 8 }), reduced));
      const start = NOW;
      const launches: number[] = [];
      for (let t = 0; t <= 2_000; t += 50) {
        NOW = start + t;
        if (ref.current!.react("sky", 0, bankPoint) !== null) launches.push(t);
      }
      for (const t of launches) expect(launches.filter((u) => u >= t && u < t + 1_000).length).toBeLessThanOrEqual(3);
      expect(launches.length).toBeGreaterThan(1);
      NOW = start + 10_000;
    }
  });
});

describe("SceneEffects across stretches (MFW-58)", () => {
  const frame = getLoyKrathongEndlessRiverFrame();
  const at = (mesh: InstancedMesh, i: number) => {
    const m = new Matrix4();
    mesh.getMatrixAt(i, m);
    return new Vector3().setFromMatrixPosition(m);
  };

  it("react(lamp, 2, null, 1): the glow sits at lamps[2] + T and the sky lantern rises from lamp + T", () => {
    const ref = createRef<SceneEffectsHandle>();
    const pools = createObjectPoolManager(CAPS);
    render(ui(ref, pools, false, frame));
    expect(ref.current!.react("lamp", 2, null, 1)).toBe(SCENE_TAP_REACTIONS.lamp.gimmick);
    NOW += LAMP_GLOW_LOOK.attackMs;
    r3f.frame!();
    const glow = at(meshNamed(SCENE_OBJECT_NAMES.lampGlows), 0);
    expect(glow.x).toBeCloseTo(lamps[2].position.x + frame.periodX, 4);
    expect(glow.z).toBeCloseTo(lamps[2].position.z + frame.periodZ, 4);
    const lantern = [0, 1].map((i) => pools.skyLantern.entryAt(i)).find((e) => e.active)!;
    expect(lantern.state.x).toBeCloseTo(lamps[2].position.x + frame.periodX, 9);
    expect(lantern.state.z).toBeCloseTo(lamps[2].position.z + frame.periodZ, 9);
  });

  it("the same lamp in another stretch is a separate glow; a re-tap in the same stretch re-triggers it", () => {
    const ref = createRef<SceneEffectsHandle>();
    const pools = createObjectPoolManager({ ...CAPS, glow: 3 });
    render(ui(ref, pools, false, frame));
    ref.current!.lightLamp(1, 0);
    ref.current!.lightLamp(1, 1);
    ref.current!.lightLamp(1, 1);
    expect(ref.current!.activeCount("glow")).toBe(2);
    expect(ref.current!.lightLamp(1, 0.5)).toBe(false);
  });

  it("react(house, 0, null, −1): the window glow sits at the windows − T", () => {
    const ref = createRef<SceneEffectsHandle>();
    render(ui(ref, createObjectPoolManager(CAPS), false, frame));
    expect(ref.current!.react("house", 0, null, -1)).toBe(SCENE_TAP_REACTIONS.house.gimmick);
    NOW += WINDOW_GLOW_LOOK.attackMs;
    r3f.frame!();
    const mesh = meshNamed(SCENE_OBJECT_NAMES.windowGlows);
    for (let w = 0; w < W; w++) {
      const want = LOY_KRATHONG_RIVER_LAYOUT.houseWindows[w].position;
      const got = at(mesh, w);
      expect(got.x - want.x).toBeCloseTo(-frame.periodX, 1);
      expect(got.z - want.z).toBeCloseTo(-frame.periodZ, 1);
    }
  });

  it("react(sky, 0, at, 1) launches the firework at `at` unchanged (already world-view space)", () => {
    const ref = createRef<SceneEffectsHandle>();
    const pools = createObjectPoolManager(CAPS);
    render(ui(ref, pools, false, frame));
    const tap = { x: frame.periodX + 1.5, z: frame.periodZ - 3 };
    expect(ref.current!.react("sky", 0, tap, 1)).toBe(SCENE_TAP_REACTIONS.sky.gimmick);
    const e = [0, 1].map((i) => pools.firework.entryAt(i)).find((x) => x.active)!;
    expect(e.state.x).toBe(tap.x);
    expect(e.state.z).toBe(tap.z);
  });

  it("caps hold across stretches; a non-integer stretch starts nothing", () => {
    const ref = createRef<SceneEffectsHandle>();
    render(ui(ref, createObjectPoolManager(CAPS), false, frame));
    for (const s of [-1, 0, 1]) for (let i = 0; i < 4; i++) ref.current!.react("water", 0, { x: s * frame.periodX, z: i }, s);
    expect(ref.current!.activeCount("ripple")).toBe(CAPS.ripple);
    for (const s of [-1, 0, 1]) for (let i = 0; i < 4; i++) ref.current!.react("tree", i, null, s);
    expect(ref.current!.activeCount("nudge")).toBe(CAPS.nudge);
    expect(ref.current!.react("lamp", 0, null, Number.NaN)).toBeNull();
    expect(ref.current!.react("sky", 0, { x: 0, z: 0 }, 1.5)).toBeNull();
  });
});
