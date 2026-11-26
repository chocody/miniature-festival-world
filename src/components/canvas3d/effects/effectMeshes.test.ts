// @vitest-environment node
import { AdditiveBlending, NormalBlending, BufferGeometry, Color, IcosahedronGeometry, InstancedMesh, Material, Matrix4, MeshBasicMaterial, Quaternion, Raycaster, Vector3, type Intersection } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LOY_KRATHONG_RIVER_ENVIRONMENT, RIVER_ENVIRONMENT_PARTS } from "@/config/events/loyKrathong.river.config";
import {
  CHIMNEY_SMOKE_LOOK,
  FALLING_LEAF_LOOK,
  FIREWORK_LOOK,
  LAMP_GLOW_LOOK,
  NO_BOUNCE,
  RIPPLE_LOOK,
  SKY_LANTERN_LOOK,
  WINDOW_GLOW_LOOK,
} from "@/config/gimmicks.config";
import {
  chimneySmokeDurationMs,
  createFallingLeafFrame,
  createSmokePuffFrame,
  fallingLeavesDurationMs,
  writeFallingLeafAt,
  writeSmokePuffAt,
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
  createChimneySmokeMesh,
  createFallingLeafMesh,
  writeChimneySmokeInstances,
  writeFallingLeafInstances,
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
import { LOY_KRATHONG_HOUSE_SMOKE_ORIGINS, LOY_KRATHONG_TREE_LEAF_ANCHORS } from "@/components/models/loyKrathong";
import { TREE_LEAF_PATH_STRIDE } from "./sceneEffectAnchors";

afterEach(() => vi.restoreAllMocks());

// MFW-60 / MFW-72: every EffectKind needs a cap
const caps = { ripple: 4, glow: 2, nudge: 2, windowGlow: 2, firework: 2, skyLantern: 2, chimneySmoke: 2, fallingLeaves: 2 };
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
    managers.chimneySmoke.acquire(0);
    managers.fallingLeaves.acquire(0);
    const smoke = createChimneySmokeMesh(2, 5);
    const leaves = createFallingLeafMesh(2, 6);
    for (const t of [0, 100, 700, 1_500, 5_000]) {
      writeWindowGlowInstances(createWindowGlowMesh(1, W, windowPart.geometry), managers.windowGlow, houseWindows, W, windowPart, t, false, scratch);
      writeFireworkInstances(createFireworkMesh(2, 8), managers.firework, t, false, scratch);
      writeSkyLanternInstances(createSkyLanternMesh(2), managers.skyLantern, t, false, scratch);
      // MFW-72
      writeChimneySmokeInstances(smoke, managers.chimneySmoke, LOY_KRATHONG_HOUSE_SMOKE_ORIGINS, t, false, "DAY", scratch);
      writeFallingLeafInstances(leaves, managers.fallingLeaves, LOY_KRATHONG_TREE_LEAF_ANCHORS, t, false, "NIGHT", scratch);
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

describe("MFW-72 smoke and falling-leaf meshes", () => {
  const frame = getLoyKrathongEndlessRiverFrame();
  const origins = LOY_KRATHONG_HOUSE_SMOKE_ORIGINS;
  const anchors = LOY_KRATHONG_TREE_LEAF_ANCHORS;
  const PUFFS = 5;
  const LEAVES = 6;
  const slot = (treeIndex: number, k: number) => {
    const p = anchors[treeIndex].paths;
    const o = k * TREE_LEAF_PATH_STRIDE;
    return { spawn: new Vector3(p[o], p[o + 1], p[o + 2]), landing: new Vector3(p[o + 3], p[o + 4], p[o + 5]) };
  };

  it("EM7: a smoke starts as one puff at the origin + s·T (scale startRadius) and is released at its duration", () => {
    const e = createChimneySmokeMesh(2, PUFFS);
    expect(e.capacity).toBe(2 * PUFFS);
    expect(e.mesh.name).toBe(SCENE_OBJECT_NAMES.chimneySmoke);
    const pool = createObjectPoolManager(caps).chimneySmoke;
    const st = pool.acquire(0).state;
    st.houseIndex = 2;
    st.stretchIndex = 1;
    const scratch = createEffectFrameScratch();
    expect(writeChimneySmokeInstances(e, pool, origins, 0, false, "DAY", scratch, frame)).toBe(1);
    expect(e.mesh.count).toBe(1);
    const { p, s } = decompose(e.mesh, 0);
    expect(p.x).toBeCloseTo(origins[2].x + frame.periodX, 5);
    expect(p.y).toBeCloseTo(origins[2].y, 5);
    expect(p.z).toBeCloseTo(origins[2].z + frame.periodZ, 5);
    expect(s.x).toBeCloseTo(CHIMNEY_SMOKE_LOOK.startRadius, 5);
    const mid = (PUFFS - 1) * CHIMNEY_SMOKE_LOOK.staggerMs;
    expect(writeChimneySmokeInstances(e, pool, origins, mid, false, "DAY", scratch, frame)).toBe(1);
    expect(e.mesh.count).toBe(PUFFS);
    const want = writeSmokePuffAt(mid, 0, 1, 0, createSmokePuffFrame());
    expect(decompose(e.mesh, 0).p.y).toBeCloseTo(origins[2].y + want.dy, 5);
    const life = chimneySmokeDurationMs(PUFFS);
    expect(writeChimneySmokeInstances(e, pool, origins, life - 1, false, "DAY", scratch, frame)).toBe(1);
    expect(writeChimneySmokeInstances(e, pool, origins, life, false, "DAY", scratch, frame)).toBe(0);
    expect(pool.activeCount).toBe(0);
    expect(e.mesh.visible).toBe(false);
    // A bad house index or stretch is released.
    pool.acquire(0).state.houseIndex = origins.length;
    expect(writeChimneySmokeInstances(e, pool, origins, 10, false, "DAY", scratch, frame)).toBe(0);
    expect(pool.activeCount).toBe(0);
    const bad = pool.acquire(0).state;
    bad.houseIndex = 0;
    bad.stretchIndex = 0.5;
    expect(writeChimneySmokeInstances(e, pool, origins, 10, false, "DAY", scratch, frame)).toBe(0);
    expect(pool.activeCount).toBe(0);
  });

  it("EM8: leaves start at their spawn + s·T (scale = length), land after k·stagger + fallMs and are released at the duration", () => {
    const e = createFallingLeafMesh(2, LEAVES);
    expect(e.capacity).toBe(2 * LEAVES);
    expect(e.mesh.name).toBe(SCENE_OBJECT_NAMES.fallingLeaves);
    const pool = createObjectPoolManager(caps).fallingLeaves;
    const st = pool.acquire(0).state;
    st.treeIndex = 1;
    st.stretchIndex = -1;
    const scratch = createEffectFrameScratch();
    expect(writeFallingLeafInstances(e, pool, anchors, 0, false, "DAY", scratch, frame)).toBe(1);
    expect(e.mesh.count).toBe(1);
    const { p, s } = decompose(e.mesh, 0);
    const T = new Vector3(frame.periodX, 0, frame.periodZ);
    const s0 = slot(1, 0);
    expect(p.distanceTo(s0.spawn.clone().sub(T))).toBeLessThan(1e-4);
    expect(s.x).toBeCloseTo(FALLING_LEAF_LOOK.length, 5);
    const k = 3;
    const landedAt = k * FALLING_LEAF_LOOK.staggerMs + FALLING_LEAF_LOOK.fallMs;
    expect(writeFallingLeafInstances(e, pool, anchors, landedAt, false, "DAY", scratch, frame)).toBe(1);
    expect(e.mesh.count).toBe(LEAVES);
    expect(decompose(e.mesh, k).p.distanceTo(slot(1, k).landing.clone().sub(T))).toBeLessThan(1e-4);
    const f = writeFallingLeafAt(landedAt, 0, createFallingLeafFrame());
    expect(f.fall).toBe(1);
    const life = fallingLeavesDurationMs(LEAVES);
    expect(writeFallingLeafInstances(e, pool, anchors, life - 1, false, "DAY", scratch, frame)).toBe(1);
    expect(writeFallingLeafInstances(e, pool, anchors, life, false, "DAY", scratch, frame)).toBe(0);
    expect(pool.activeCount).toBe(0);
    expect(e.mesh.visible).toBe(false);
    pool.acquire(0).state.treeIndex = anchors.length;
    expect(writeFallingLeafInstances(e, pool, anchors, 10, false, "DAY", scratch, frame)).toBe(0);
    expect(pool.activeCount).toBe(0);
  });

  it("EM9: colours follow the light preset palette (k mod 2)", () => {
    const smoke = createChimneySmokeMesh(1, PUFFS);
    const leaves = createFallingLeafMesh(1, LEAVES);
    const managers = createObjectPoolManager(caps);
    managers.chimneySmoke.acquire(0);
    managers.fallingLeaves.acquire(0);
    const scratch = createEffectFrameScratch();
    const c = new Color();
    for (const preset of ["DAY", "NIGHT"] as const) {
      writeChimneySmokeInstances(smoke, managers.chimneySmoke, origins, (PUFFS - 1) * CHIMNEY_SMOKE_LOOK.staggerMs, false, preset, scratch);
      writeFallingLeafInstances(leaves, managers.fallingLeaves, anchors, (LEAVES - 1) * FALLING_LEAF_LOOK.staggerMs, false, preset, scratch);
      for (const [e, palette] of [
        [smoke, CHIMNEY_SMOKE_LOOK.palette[preset]],
        [leaves, FALLING_LEAF_LOOK.palette[preset]],
      ] as const) {
        expect(e.mesh.count).toBeGreaterThan(2);
        for (let k = 0; k < e.mesh.count; k++) {
          e.mesh.getColorAt(k, c);
          const want = new Color(palette[k % 2]);
          for (const ch of ["r", "g", "b"] as const) expect(c[ch], `${preset} ${e.mesh.name} ${k}`).toBeCloseTo(want[ch], 5);
        }
      }
    }
  });

  it("EM10: both meshes are the one effect program setup with NormalBlending; round puffs, an indexed leaf without vertex colours", () => {
    const smoke = createChimneySmokeMesh(2, PUFFS);
    const leaves = createFallingLeafMesh(2, LEAVES);
    for (const e of [smoke, leaves]) {
      const m = e.mesh.material as MeshBasicMaterial;
      expect(m).toBeInstanceOf(MeshBasicMaterial);
      expect(m.transparent).toBe(true);
      expect(m.depthWrite).toBe(false);
      expect(m.toneMapped).toBe(false);
      expect(m.vertexColors).toBe(false);
      expect(m.map).toBeNull();
      expect(m.blending).toBe(NormalBlending);
      expect(e.mesh.instanceColor).not.toBeNull();
      expect(e.mesh.visible).toBe(false);
      expect(e.mesh.frustumCulled).toBe(false);
      expect(e.mesh.geometry.type).not.toBe("RingGeometry");
      expect(e.mesh.geometry.getAttribute("color")).toBeUndefined();
      const hits: Intersection[] = [];
      e.mesh.raycast(new Raycaster(), hits);
      expect(hits).toHaveLength(0);
    }
    expect(smoke.mesh.geometry).toBeInstanceOf(IcosahedronGeometry);
    expect(smoke.mesh.geometry.getAttribute("position").count / 3).toBe(80); // detail 1: 80 faces, a round outline
    expect(leaves.mesh.geometry.index).not.toBeNull();
    expect(leaves.mesh.geometry.getAttribute("normal")).toBeDefined();
    expect(() => createChimneySmokeMesh(0, PUFFS)).toThrow(RangeError);
    expect(() => createFallingLeafMesh(1, 0)).toThrow(RangeError);
  });

  it("EM11: reduced motion releases a running smoke / fall on the first write and draws nothing", () => {
    const smoke = createChimneySmokeMesh(2, PUFFS);
    const leaves = createFallingLeafMesh(2, LEAVES);
    const managers = createObjectPoolManager(caps);
    managers.chimneySmoke.acquire(0);
    managers.fallingLeaves.acquire(0);
    const scratch = createEffectFrameScratch();
    writeChimneySmokeInstances(smoke, managers.chimneySmoke, origins, 500, false, "DAY", scratch);
    writeFallingLeafInstances(leaves, managers.fallingLeaves, anchors, 500, false, "DAY", scratch);
    expect(smoke.mesh.visible && leaves.mesh.visible).toBe(true);
    expect(writeChimneySmokeInstances(smoke, managers.chimneySmoke, origins, 520, true, "DAY", scratch)).toBe(0);
    expect(writeFallingLeafInstances(leaves, managers.fallingLeaves, anchors, 520, true, "DAY", scratch)).toBe(0);
    for (const e of [smoke, leaves]) {
      expect(e.mesh.count).toBe(0);
      expect(e.mesh.visible).toBe(false);
    }
    expect(managers.chimneySmoke.activeCount).toBe(0);
    expect(managers.fallingLeaves.activeCount).toBe(0);
  });
});
