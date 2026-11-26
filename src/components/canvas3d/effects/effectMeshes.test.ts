// @vitest-environment node
import { AdditiveBlending, NormalBlending, BufferGeometry, Color, IcosahedronGeometry, InstancedMesh, Material, Matrix4, MeshBasicMaterial, Quaternion, Raycaster, Vector3, type Intersection } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LOY_KRATHONG_RIVER_ENVIRONMENT, RIVER_ENVIRONMENT_PARTS } from "@/config/events/loyKrathong.river.config";
import {
  FIREWORK_LOOK,
  LAMP_GLOW_LOOK,
  NO_BOUNCE,
  RIPPLE_LOOK,
  SKY_LANTERN_LOOK,
  WINDOW_GLOW_LOOK,
} from "@/config/gimmicks.config";
import {
  createObjectPoolManager,
  createBounceFrame,
  createLampGlowFrame,
  createLanternFrame,
  createRippleFrame,
  fireworkDurationMs,
  writeBounceAt,
  writeLampGlowFrameAt,
  writeRippleFrameAt,
  writeSkyLanternAt,
} from "@/core/effects";
import { getLoyKrathongEndlessRiverFrame } from "@/core/world/endlessRiver";
import { composeInstanceMatrix } from "../instancing";
import { LOY_KRATHONG_RIVER_LAYOUT } from "@/components/models/loyKrathong";
import {
  createEffectFrameScratch,
  createFireworkMesh,
  createLampGlowMesh,
  createRippleMesh,
  createSkyLanternMesh,
  createWindowGlowMesh,
  disposeEffectMesh,
  fireworkInstancesPerBurst,
  writeFireworkInstances,
  writeLampGlowInstances,
  writeRippleInstances,
  writeSkyLanternInstances,
  writeWindowGlowInstances,
  type EffectMesh,
} from "./effectMeshes";
import { SCENE_OBJECT_NAMES } from "../sceneObjectNames";

afterEach(() => vi.restoreAllMocks());

const caps = { ripple: 4, glow: 2, nudge: 2, windowGlow: 2, firework: 2, skyLantern: 2 }; // MFW-60: every EffectKind needs a cap
const decompose = (mesh: InstancedMesh, i: number) => {
  const m = new Matrix4();
  mesh.getMatrixAt(i, m);
  const p = new Vector3();
  const s = new Vector3();
  m.decompose(p, new Quaternion(), s);
  return { p, s };
};

describe("ripple mesh", () => {
  it("is created idle, additive, flat and never raycast", () => {
    const e = createRippleMesh(4);
    const { mesh } = e;
    expect(mesh.instanceMatrix.count).toBe(4);
    expect(mesh.count).toBe(0);
    expect(mesh.visible).toBe(false);
    expect(mesh.frustumCulled).toBe(false);
    expect(mesh.instanceColor).not.toBeNull();
    const mat = mesh.material as MeshBasicMaterial;
    expect(mat.blending).toBe(AdditiveBlending);
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
    expect(mat.toneMapped).toBe(false);
    expect(mesh.name).toBe(SCENE_OBJECT_NAMES.ripples);
    const pos = mesh.geometry.getAttribute("position");
    for (let i = 0; i < pos.count; i++) expect(pos.getY(i)).toBeCloseTo(0, 9);
    const hits: Intersection[] = [];
    mesh.raycast(new Raycaster(), hits);
    expect(hits).toHaveLength(0);
    expect(() => createRippleMesh(0)).toThrow(RangeError);
  });

  it("writes active ripples and releases expired ones", () => {
    const e = createRippleMesh(4);
    const pool = createObjectPoolManager(caps).ripple;
    const scratch = createEffectFrameScratch();
    const a = pool.acquire(0);
    a.state.x = 1;
    a.state.z = 2;
    const b = pool.acquire(100);
    b.state.x = -1;
    b.state.z = 0;
    const v0 = e.mesh.instanceMatrix.version;
    expect(writeRippleInstances(e, pool, 300, false, -0.24, scratch)).toBe(2);
    expect(e.mesh.count).toBe(2);
    expect(e.mesh.visible).toBe(true);
    expect(e.mesh.instanceMatrix.version).toBeGreaterThan(v0);
    const { p, s } = decompose(e.mesh, 0);
    const f = writeRippleFrameAt(300, false, createRippleFrame());
    expect(p.x).toBeCloseTo(1, 5);
    expect(p.y).toBeCloseTo(-0.24 + RIPPLE_LOOK.surfaceOffsetY, 5);
    expect(p.z).toBeCloseTo(2, 5);
    expect(s.x).toBeCloseTo(f.radius, 5);
    expect(s.y).toBeCloseTo(1, 5);
    const color = new Color();
    e.mesh.getColorAt(0, color);
    expect(color.r).toBeCloseTo(e.baseColor.r * f.intensity, 5);

    expect(writeRippleInstances(e, pool, RIPPLE_LOOK.durationMs + 1, false, -0.24, scratch)).toBe(1);
    expect(decompose(e.mesh, 0).p.x).toBeCloseTo(-1, 5);
    expect(writeRippleInstances(e, pool, RIPPLE_LOOK.durationMs + 200, false, -0.24, scratch)).toBe(0);
    expect(e.mesh.visible).toBe(false);
    expect(pool.activeCount).toBe(0);
  });

  it("reduced motion keeps the final radius", () => {
    const e = createRippleMesh(2);
    const pool = createObjectPoolManager(caps).ripple;
    pool.acquire(0);
    writeRippleInstances(e, pool, 450, true, 0, createEffectFrameScratch());
    expect(decompose(e.mesh, 0).s.x).toBeCloseTo(RIPPLE_LOOK.endRadius, 5);
  });
});

describe("lamp glow mesh", () => {
  const lampHead = RIVER_ENVIRONMENT_PARTS.lampHead;
  const lamps = LOY_KRATHONG_RIVER_LAYOUT.lamps;

  it("is an icosahedron shell with its own name", () => {
    const e = createLampGlowMesh(2, lampHead.geometry);
    expect(e.mesh.name).toBe(SCENE_OBJECT_NAMES.lampGlows);
    expect(e.mesh.geometry).toBeInstanceOf(IcosahedronGeometry);
    expect(() => createLampGlowMesh(0, lampHead.geometry)).toThrow(RangeError);
  });

  it("sits at the lamp head, scaled with the bounce", () => {
    const e = createLampGlowMesh(2, lampHead.geometry);
    const pool = createObjectPoolManager(caps).glow;
    const scratch = createEffectFrameScratch();
    pool.acquire(0).state.lampIndex = 2;
    expect(writeLampGlowInstances(e, pool, lamps, lampHead, LAMP_GLOW_LOOK.attackMs, false, scratch)).toBe(1);
    const l = lamps[2];
    const { p, s } = decompose(e.mesh, 0);
    expect(p.x).toBeCloseTo(l.position.x, 5);
    expect(p.y).toBeCloseTo(l.position.y + lampHead.yOffset * l.scale, 5);
    expect(p.z).toBeCloseTo(l.position.z, 5);
    expect(s.x).toBeCloseTo(l.scale * LAMP_GLOW_LOOK.shellScale * writeBounceAt(LAMP_GLOW_LOOK.attackMs, false, createBounceFrame()).scale, 5);

    writeLampGlowInstances(e, pool, lamps, lampHead, LAMP_GLOW_LOOK.attackMs, true, scratch);
    expect(decompose(e.mesh, 0).s.x).toBeCloseTo(l.scale * LAMP_GLOW_LOOK.shellScale, 5);
  });

  it("releases an unknown lamp index", () => {
    const e = createLampGlowMesh(2, lampHead.geometry);
    const pool = createObjectPoolManager(caps).glow;
    pool.acquire(0).state.lampIndex = 99;
    expect(writeLampGlowInstances(e, pool, lamps, lampHead, 10, false, createEffectFrameScratch())).toBe(0);
    expect(pool.activeCount).toBe(0);
  });
});

describe("disposeEffectMesh", () => {
  it("disposes geometry, material and mesh once each", () => {
    const e = createRippleMesh(2);
    const g = vi.spyOn(BufferGeometry.prototype, "dispose");
    const m = vi.spyOn(Material.prototype, "dispose");
    const i = vi.spyOn(InstancedMesh.prototype, "dispose");
    disposeEffectMesh(e);
    expect(g).toHaveBeenCalledTimes(1);
    expect(m).toHaveBeenCalledTimes(1);
    expect(i).toHaveBeenCalledTimes(1);
  });
});

describe("MFW-60 reaction meshes", () => {
  const windowPart = RIVER_ENVIRONMENT_PARTS.houseWindow;
  const W = LOY_KRATHONG_RIVER_ENVIRONMENT.houseFacade.windows.length;
  const houseWindows = LOY_KRATHONG_RIVER_LAYOUT.houseWindows;

  it("EM1: window glow writes W instances per active house at the window transforms × shellScale", () => {
    const e = createWindowGlowMesh(2, W, windowPart.geometry);
    expect(e.capacity).toBe(2 * W);
    expect(e.mesh.name).toBe(SCENE_OBJECT_NAMES.windowGlows);
    const pool = createObjectPoolManager(caps).windowGlow;
    pool.acquire(0).state.houseIndex = 3;
    const t = WINDOW_GLOW_LOOK.attackMs + 10;
    expect(writeWindowGlowInstances(e, pool, houseWindows, W, windowPart, t, false, createEffectFrameScratch())).toBe(W);
    const f = writeLampGlowFrameAt(t, false, createLampGlowFrame(), WINDOW_GLOW_LOOK, NO_BOUNCE);
    for (let w = 0; w < W; w++) {
      const want = composeInstanceMatrix(houseWindows[3 * W + w], windowPart, new Matrix4()).multiply(
        new Matrix4().makeScale(WINDOW_GLOW_LOOK.shellScale, WINDOW_GLOW_LOOK.shellScale, WINDOW_GLOW_LOOK.shellScale),
      );
      const got = new Matrix4();
      e.mesh.getMatrixAt(w, got);
      got.elements.forEach((v, k) => expect(v).toBeCloseTo(want.elements[k], 5));
      const color = new Color();
      e.mesh.getColorAt(w, color);
      expect(color.r).toBeCloseTo(e.baseColor.r * f.intensity, 5);
    }
    expect(writeWindowGlowInstances(e, pool, houseWindows, W, windowPart, WINDOW_GLOW_LOOK.durationMs, false, createEffectFrameScratch())).toBe(0);
    expect(pool.activeCount).toBe(0);
    expect(e.mesh.visible).toBe(false);
  });

  it("EM2: a firework writes 1 shell during the rise, then the sparks, then releases", () => {
    const e = createFireworkMesh(2, 8);
    expect(e.capacity).toBe(2 * fireworkInstancesPerBurst(8));
    expect(fireworkInstancesPerBurst(8)).toBe(1 + FIREWORK_LOOK.shellTrailCount + 2 * 8); // shell + trail, a head and a tail per spark
    expect(e.mesh.name).toBe(SCENE_OBJECT_NAMES.fireworks);
    const pool = createObjectPoolManager(caps).firework;
    const st = pool.acquire(0).state;
    Object.assign(st, { x: 1, y: -0.14, z: 2, paletteIndex: 1 });
    const scratch = createEffectFrameScratch();
    expect(writeFireworkInstances(e, pool, FIREWORK_LOOK.shellRiseMs / 2, false, scratch)).toBe(1);
    expect(e.mesh.count).toBe(1 + FIREWORK_LOOK.shellTrailCount); // the shell and its trail (all above the launch point here)
    const { p } = decompose(e.mesh, 0);
    expect(p.x).toBeCloseTo(1, 5);
    expect(p.y).toBeGreaterThan(-0.14);
    expect(p.y).toBeLessThan(-0.14 + FIREWORK_LOOK.burstHeight);
    const color = new Color();
    e.mesh.getColorAt(0, color);
    for (const k of ["r", "g", "b"] as const) expect(color[k]).toBeCloseTo(e.palette[1][k], 5);
    expect(writeFireworkInstances(e, pool, FIREWORK_LOOK.shellRiseMs + FIREWORK_LOOK.burstMs / 2, false, scratch)).toBe(1);
    expect(e.mesh.count).toBe(16);
    const centre = new Vector3(1, -0.14 + FIREWORK_LOOK.burstHeight, 2);
    for (let i = 0; i < 16; i++) expect(decompose(e.mesh, i).p.distanceTo(centre)).toBeLessThanOrEqual(FIREWORK_LOOK.burstRadius + FIREWORK_LOOK.sagDistance);
    expect(writeFireworkInstances(e, pool, fireworkDurationMs(false), false, scratch)).toBe(0);
    expect(e.mesh.count).toBe(0);
    expect(e.mesh.visible).toBe(false);
    expect(pool.activeCount).toBe(0);
  });

  it("EM2: reduced motion draws the static starburst at once, then releases at the hold", () => {
    const e = createFireworkMesh(1, 8);
    const pool = createObjectPoolManager(caps).firework;
    pool.acquire(0);
    expect(writeFireworkInstances(e, pool, 0, true, createEffectFrameScratch())).toBe(1);
    expect(e.mesh.count).toBe(16);
    expect(decompose(e.mesh, 0).s.x).toBeCloseTo(FIREWORK_LOOK.sparkSize, 5);
    expect(writeFireworkInstances(e, pool, FIREWORK_LOOK.reducedMotionHoldMs, true, createEffectFrameScratch())).toBe(0);
  });

  it("EM3: the sky lantern rises and is released at the end", () => {
    const e = createSkyLanternMesh(2);
    expect(e.mesh.name).toBe(SCENE_OBJECT_NAMES.skyLanterns);
    const pool = createObjectPoolManager(caps).skyLantern;
    Object.assign(pool.acquire(0).state, { x: 0.5, y: 0.2, z: -1 });
    const scratch = createEffectFrameScratch();
    expect(e.capacity).toBe(4); // a body and a flame per lantern
    expect(writeSkyLanternInstances(e, pool, 500, false, scratch)).toBe(2);
    const flame = new Color();
    e.mesh.getColorAt(1, flame);
    expect(flame.r).toBeCloseTo(e.flameColor.r, 5);
    expect(decompose(e.mesh, 1).p.y).toBeLessThan(decompose(e.mesh, 0).p.y);
    const y1 = decompose(e.mesh, 0).p.y;
    const want = writeSkyLanternAt(500, false, createLanternFrame());
    expect(y1).toBeCloseTo(0.2 + want.dy, 5);
    writeSkyLanternInstances(e, pool, 2_000, false, scratch);
    expect(decompose(e.mesh, 0).p.y).toBeGreaterThan(y1);
    expect(writeSkyLanternInstances(e, pool, SKY_LANTERN_LOOK.durationMs, false, scratch)).toBe(0);
    expect(pool.activeCount).toBe(0);
    expect(e.mesh.visible).toBe(false);
  });

  it("EM4: a missing house index releases the entry", () => {
    const e = createWindowGlowMesh(2, W, windowPart.geometry);
    const pool = createObjectPoolManager(caps).windowGlow;
    pool.acquire(0).state.houseIndex = 99;
    expect(writeWindowGlowInstances(e, pool, houseWindows, W, windowPart, 50, false, createEffectFrameScratch())).toBe(0);
    expect(pool.activeCount).toBe(0);
  });

  it("EM5: the writers reuse the scratch (same objects, no throw)", () => {
    const scratch = createEffectFrameScratch();
    const before = { ...scratch };
    const managers = createObjectPoolManager(caps);
    managers.windowGlow.acquire(0).state.houseIndex = 0;
    managers.firework.acquire(0);
    managers.skyLantern.acquire(0);
    for (const t of [0, 100, 700, 1_500, 5_000]) {
      writeWindowGlowInstances(createWindowGlowMesh(1, W, windowPart.geometry), managers.windowGlow, houseWindows, W, windowPart, t, false, scratch);
      writeFireworkInstances(createFireworkMesh(2, 8), managers.firework, t, false, scratch);
      writeSkyLanternInstances(createSkyLanternMesh(2), managers.skyLantern, t, false, scratch);
    }
    for (const key of Object.keys(before) as (keyof typeof before)[]) expect(scratch[key]).toBe(before[key]);
  });

  it("EM6: every effect material is the one program setup; fireworks and lanterns use NormalBlending", () => {
    const meshes: [EffectMesh, number][] = [
      [createRippleMesh(2), AdditiveBlending],
      [createLampGlowMesh(2, RIVER_ENVIRONMENT_PARTS.lampHead.geometry), AdditiveBlending],
      [createWindowGlowMesh(2, W, windowPart.geometry), AdditiveBlending],
      [createFireworkMesh(2, 8), NormalBlending],
      [createSkyLanternMesh(2), NormalBlending],
    ];
    for (const [e, blending] of meshes) {
      const m = e.mesh.material as MeshBasicMaterial;
      expect(m).toBeInstanceOf(MeshBasicMaterial);
      expect(m.transparent).toBe(true);
      expect(m.depthWrite).toBe(false);
      expect(m.toneMapped).toBe(false);
      expect(m.vertexColors).toBe(false);
      expect(m.map).toBeNull();
      expect(e.mesh.instanceColor).not.toBeNull();
      expect(m.blending).toBe(blending);
      expect(e.mesh.visible).toBe(false);
      expect(e.mesh.frustumCulled).toBe(false);
      const hits: Intersection[] = [];
      e.mesh.raycast(new Raycaster(), hits);
      expect(hits).toHaveLength(0);
    }
  });
});

describe("MFW-58 stretch offsets of the glow writers", () => {
  const frame = getLoyKrathongEndlessRiverFrame();
  const lampHead = RIVER_ENVIRONMENT_PARTS.lampHead;
  const lamps = LOY_KRATHONG_RIVER_LAYOUT.lamps;
  const windowPart = RIVER_ENVIRONMENT_PARTS.houseWindow;
  const W = LOY_KRATHONG_RIVER_ENVIRONMENT.houseFacade.windows.length;
  const houseWindows = LOY_KRATHONG_RIVER_LAYOUT.houseWindows;

  it("a lamp glow of stretch s sits at lamp + s·T; the same lamp in two stretches is two instances", () => {
    const e = createLampGlowMesh(3, lampHead.geometry);
    const pool = createObjectPoolManager(caps).glow;
    const a = pool.acquire(0).state;
    a.lampIndex = 2;
    a.stretchIndex = 1;
    const b = pool.acquire(0).state;
    b.lampIndex = 2;
    b.stretchIndex = -3;
    expect(writeLampGlowInstances(e, pool, lamps, lampHead, LAMP_GLOW_LOOK.attackMs, false, createEffectFrameScratch(), frame)).toBe(2);
    const l = lamps[2];
    const p0 = decompose(e.mesh, 0).p;
    const p1 = decompose(e.mesh, 1).p;
    expect(p0.x).toBeCloseTo(l.position.x + frame.periodX, 5);
    expect(p0.z).toBeCloseTo(l.position.z + frame.periodZ, 5);
    expect(p1.x).toBeCloseTo(l.position.x - 3 * frame.periodX, 5);
    expect(p1.z).toBeCloseTo(l.position.z - 3 * frame.periodZ, 5);
    // No frame: every stretch draws at offset 0 (the MFW-60 behaviour).
    writeLampGlowInstances(e, pool, lamps, lampHead, LAMP_GLOW_LOOK.attackMs, false, createEffectFrameScratch());
    expect(decompose(e.mesh, 0).p.x).toBeCloseTo(l.position.x, 5);
    b.stretchIndex = 0.5; // a bad stretch is released
    expect(writeLampGlowInstances(e, pool, lamps, lampHead, LAMP_GLOW_LOOK.attackMs, false, createEffectFrameScratch(), frame)).toBe(1);
  });

  it("window glows of stretch s are the stretch-0 matrices pre-translated by s·T", () => {
    const e = createWindowGlowMesh(2, W, windowPart.geometry);
    const pool = createObjectPoolManager(caps).windowGlow;
    const st = pool.acquire(0).state;
    st.houseIndex = 1;
    st.stretchIndex = 2;
    const t = WINDOW_GLOW_LOOK.attackMs + 10;
    expect(writeWindowGlowInstances(e, pool, houseWindows, W, windowPart, t, false, createEffectFrameScratch(), frame)).toBe(W);
    for (let w = 0; w < W; w++) {
      const want = composeInstanceMatrix(houseWindows[W + w], windowPart, new Matrix4())
        .multiply(new Matrix4().makeScale(WINDOW_GLOW_LOOK.shellScale, WINDOW_GLOW_LOOK.shellScale, WINDOW_GLOW_LOOK.shellScale))
        .premultiply(new Matrix4().makeTranslation(2 * frame.periodX, 0, 2 * frame.periodZ));
      const got = new Matrix4();
      e.mesh.getMatrixAt(w, got);
      got.elements.forEach((v, k) => expect(v).toBeCloseTo(want.elements[k], 4));
    }
  });
});
