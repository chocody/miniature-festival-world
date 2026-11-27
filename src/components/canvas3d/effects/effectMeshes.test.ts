// @vitest-environment node
import { AdditiveBlending, NormalBlending, BufferGeometry, Color, FrontSide, IcosahedronGeometry, InstancedMesh, Material, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Quaternion, Raycaster, Vector3, type Intersection } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LOY_KRATHONG_RIVER_ENVIRONMENT, RIVER_ENVIRONMENT_PARTS, RIVER_FOLIAGE_PARTS } from "@/config/events/loyKrathong.river.config";
import {
  CHIMNEY_SMOKE_LOOK,
  FALLING_LEAF_LOOK,
  FIREWORK_LOOK,
  LAMP_GLOW_LOOK,
  LAMP_GROUND_LIGHT_LOOK,
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
  createLampGroundLightMesh,
  createRippleMesh,
  createSkyLanternMesh,
  createWindowGlowMesh,
  disposeEffectMesh,
  disposeLampGroundLightMesh,
  fireworkInstancesPerBurst,
  writeFireworkInstances,
  writeLampLightInstances,
  writeRippleInstances,
  writeSkyLanternInstances,
  writeWindowGlowInstances,
  type EffectMesh,
} from "./effectMeshes";
import { SCENE_OBJECT_NAMES } from "../sceneObjectNames";
import { BLOB_SHADOW_TIER_GEOMETRY, LOOK_PALETTE } from "@/config/look.config";

/** MFW-84: the falling leaves use the tree crown's material spec (FULL and LIGHT share it). */
const LEAF_MATERIAL = RIVER_FOLIAGE_PARTS.FULL.leafClump.material;
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

  it("sits at the lamp head with no bounce (MFW-75: the lamp switches on, it does not bounce)", () => {
    const e = createLampGlowMesh(2, lampHead.geometry);
    const ground = createLampGroundLightMesh(2, BLOB_SHADOW_TIER_GEOMETRY.LOW);
    const pool = createObjectPoolManager(caps).glow;
    const scratch = createEffectFrameScratch();
    pool.acquire(0).state.lampIndex = 2;
    writeLampLightInstances(e, ground, pool, lamps, lampHead, LAMP_GLOW_LOOK.attackMs / 2, false, scratch);
    const l = lamps[2];
    const { p, s } = decompose(e.mesh, 0);
    expect(p.x).toBeCloseTo(l.position.x, 5);
    expect(p.y).toBeCloseTo(l.position.y + lampHead.yOffset * l.scale, 5);
    expect(p.z).toBeCloseTo(l.position.z, 5);
    expect(s.x).toBeCloseTo(l.scale * LAMP_GLOW_LOOK.shellScale, 5);
    expect(writeBounceAt(LAMP_GLOW_LOOK.attackMs / 2, false, createBounceFrame()).scale).not.toBeCloseTo(1, 5); // a bounce would show
  });
});

describe("lamp ground light (MFW-75)", () => {
  const lampHead = RIVER_ENVIRONMENT_PARTS.lampHead;
  const lamps = LOY_KRATHONG_RIVER_LAYOUT.lamps;
  const G = LAMP_GROUND_LIGHT_LOOK;
  const setup = () => ({
    head: createLampGlowMesh(2, lampHead.geometry),
    ground: createLampGroundLightMesh(2, BLOB_SHADOW_TIER_GEOMETRY.LOW),
    pool: createObjectPoolManager(caps).glow,
    scratch: createEffectFrameScratch(),
  });

  it("LM1: a named, idle, NormalBlending vertex-alpha fan whose rim fades to alpha 0", () => {
    const mesh = createLampGroundLightMesh(4, BLOB_SHADOW_TIER_GEOMETRY.LOW);
    expect(mesh.name).toBe("scene-lamp-ground-lights");
    expect(mesh.name).toBe(SCENE_OBJECT_NAMES.lampGroundLights);
    expect(mesh.instanceMatrix.count).toBe(4);
    expect(mesh.count).toBe(0);
    expect(mesh.visible).toBe(false);
    const material = mesh.material as MeshBasicMaterial;
    expect(material.blending).toBe(NormalBlending);
    expect(material.vertexColors).toBe(true);
    expect(material.opacity).toBe(G.opacity);
    const color = mesh.geometry.getAttribute("color");
    expect(color.itemSize).toBe(4);
    const { segments } = BLOB_SHADOW_TIER_GEOMETRY.LOW;
    for (let i = color.count - segments; i < color.count; i++) expect(color.getW(i), `rim vertex ${i}`).toBe(0);
    expect(color.getW(0)).toBe(1); // the centre is the brightest
    expect(() => createLampGroundLightMesh(0, BLOB_SHADOW_TIER_GEOMETRY.LOW)).toThrow(RangeError);
  });

  it("LM2: a lamp lit for ≥ attackMs — full ground patch at the lamp foot, head at full colour, nothing ramping", () => {
    const { head, ground, pool, scratch } = setup();
    pool.acquire(0).state.lampIndex = 2;
    expect(writeLampLightInstances(head, ground, pool, lamps, lampHead, LAMP_GLOW_LOOK.attackMs, false, scratch)).toBe(0);
    const l = lamps[2];
    const { p, s } = decompose(ground, 0);
    expect(p.x).toBeCloseTo(l.position.x, 5);
    expect(p.y).toBeCloseTo(l.position.y + G.liftY, 5);
    expect(p.z).toBeCloseTo(l.position.z, 5);
    expect(s.x).toBeCloseTo(G.radius * l.scale, 5);
    expect(s.y).toBeCloseTo(1, 5);
    expect(s.z).toBeCloseTo(G.radius * l.scale, 5);
    const c = new Color();
    head.mesh.getColorAt(0, c);
    const want = new Color(LAMP_GLOW_LOOK.color).multiplyScalar(LAMP_GLOW_LOOK.peakIntensity);
    for (const ch of ["r", "g", "b"] as const) expect(c[ch]).toBeCloseTo(want[ch], 5);
    expect([head.mesh.count, ground.count, head.mesh.visible, ground.visible]).toEqual([1, 1, true, true]);
  });

  it("LM3: at age 0 the lamp is ramping (1); under reduced motion it is at full radius at once (0)", () => {
    const { head, ground, pool, scratch } = setup();
    pool.acquire(0).state.lampIndex = 1;
    expect(writeLampLightInstances(head, ground, pool, lamps, lampHead, 0, false, scratch)).toBe(1);
    expect(writeLampLightInstances(head, ground, pool, lamps, lampHead, 0, true, scratch)).toBe(0);
    expect(decompose(ground, 0).s.x).toBeCloseTo(G.radius * lamps[1].scale, 5);
  });

  it("LM4: an unknown lamp index is released and drawn nowhere; stretch 1 draws at lamp + T", () => {
    const { head, ground, pool, scratch } = setup();
    pool.acquire(0).state.lampIndex = 99;
    writeLampLightInstances(head, ground, pool, lamps, lampHead, 10, false, scratch);
    expect(pool.activeCount).toBe(0);
    expect([head.mesh.count, ground.count, head.mesh.visible, ground.visible]).toEqual([0, 0, false, false]);
    const frame = getLoyKrathongEndlessRiverFrame();
    const st = pool.acquire(0).state;
    st.lampIndex = 3;
    st.stretchIndex = 1;
    writeLampLightInstances(head, ground, pool, lamps, lampHead, LAMP_GLOW_LOOK.attackMs, false, scratch, frame);
    const p = decompose(ground, 0).p;
    expect(p.x).toBeCloseTo(lamps[3].position.x + frame.periodX, 5);
    expect(p.z).toBeCloseTo(lamps[3].position.z + frame.periodZ, 5);
  });

  it("LM5: 100 frames keep the scratch frame and both instance buffers (no allocation per frame)", () => {
    const { head, ground, pool, scratch } = setup();
    pool.acquire(0).state.lampIndex = 0;
    pool.acquire(0).state.lampIndex = 4;
    const frameRef = scratch.lampLight;
    const headArray = head.mesh.instanceMatrix.array;
    const groundArray = ground.instanceMatrix.array;
    for (let t = 0; t < 100; t++) writeLampLightInstances(head, ground, pool, lamps, lampHead, t * 16, t % 2 === 0, scratch);
    expect(scratch.lampLight).toBe(frameRef);
    expect(head.mesh.instanceMatrix.array).toBe(headArray);
    expect(ground.instanceMatrix.array).toBe(groundArray);
    expect(ground.count).toBe(2);
  });

  it("disposeLampGroundLightMesh disposes geometry, material and mesh", () => {
    const mesh = createLampGroundLightMesh(2, BLOB_SHADOW_TIER_GEOMETRY.HIGH);
    const g = vi.spyOn(mesh.geometry, "dispose");
    const m = vi.spyOn(mesh.material as Material, "dispose");
    const i = vi.spyOn(mesh, "dispose");
    disposeLampGroundLightMesh(mesh);
    expect([g.mock.calls.length, m.mock.calls.length, i.mock.calls.length]).toEqual([1, 1, 1]);
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
    const leaves = createFallingLeafMesh(2, 6, LEAF_MATERIAL);
    for (const t of [0, 100, 700, 1_500, 5_000]) {
      writeWindowGlowInstances(createWindowGlowMesh(1, W, windowPart.geometry), managers.windowGlow, houseWindows, W, windowPart, t, false, scratch);
      writeFireworkInstances(createFireworkMesh(2, 8), managers.firework, t, false, scratch);
      writeSkyLanternInstances(createSkyLanternMesh(2), managers.skyLantern, t, false, scratch);
      // MFW-72
      writeChimneySmokeInstances(smoke, managers.chimneySmoke, LOY_KRATHONG_HOUSE_SMOKE_ORIGINS, t, false, "DAY", scratch);
      writeFallingLeafInstances(leaves, managers.fallingLeaves, LOY_KRATHONG_TREE_LEAF_ANCHORS, t, false, scratch);
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
    const ground = createLampGroundLightMesh(3, BLOB_SHADOW_TIER_GEOMETRY.LOW);
    writeLampLightInstances(e, ground, pool, lamps, lampHead, LAMP_GLOW_LOOK.attackMs, false, createEffectFrameScratch(), frame);
    expect(e.mesh.count).toBe(2);
    const l = lamps[2];
    const p0 = decompose(e.mesh, 0).p;
    const p1 = decompose(e.mesh, 1).p;
    expect(p0.x).toBeCloseTo(l.position.x + frame.periodX, 5);
    expect(p0.z).toBeCloseTo(l.position.z + frame.periodZ, 5);
    expect(p1.x).toBeCloseTo(l.position.x - 3 * frame.periodX, 5);
    expect(p1.z).toBeCloseTo(l.position.z - 3 * frame.periodZ, 5);
    // No frame: every stretch draws at offset 0 (the MFW-60 behaviour).
    writeLampLightInstances(e, ground, pool, lamps, lampHead, LAMP_GLOW_LOOK.attackMs, false, createEffectFrameScratch());
    expect(decompose(e.mesh, 0).p.x).toBeCloseTo(l.position.x, 5);
    b.stretchIndex = 0.5; // a bad stretch is released
    writeLampLightInstances(e, ground, pool, lamps, lampHead, LAMP_GLOW_LOOK.attackMs, false, createEffectFrameScratch(), frame);
    expect([e.mesh.count, ground.count, pool.activeCount]).toEqual([1, 1, 1]);
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
    const e = createFallingLeafMesh(2, LEAVES, LEAF_MATERIAL);
    expect(e.capacity).toBe(2 * LEAVES);
    expect(e.mesh.name).toBe(SCENE_OBJECT_NAMES.fallingLeaves);
    const pool = createObjectPoolManager(caps).fallingLeaves;
    const st = pool.acquire(0).state;
    st.treeIndex = 1;
    st.stretchIndex = -1;
    const scratch = createEffectFrameScratch();
    expect(writeFallingLeafInstances(e, pool, anchors, 0, false, scratch, frame)).toBe(1);
    expect(e.mesh.count).toBe(1);
    const { p, s } = decompose(e.mesh, 0);
    const T = new Vector3(frame.periodX, 0, frame.periodZ);
    const s0 = slot(1, 0);
    expect(p.distanceTo(s0.spawn.clone().sub(T))).toBeLessThan(1e-4);
    expect(s.x).toBeCloseTo(FALLING_LEAF_LOOK.length, 5);
    const k = 3;
    const landedAt = k * FALLING_LEAF_LOOK.staggerMs + FALLING_LEAF_LOOK.fallMs;
    expect(writeFallingLeafInstances(e, pool, anchors, landedAt, false, scratch, frame)).toBe(1);
    expect(e.mesh.count).toBe(LEAVES);
    expect(decompose(e.mesh, k).p.distanceTo(slot(1, k).landing.clone().sub(T))).toBeLessThan(1e-4);
    const f = writeFallingLeafAt(landedAt, 0, createFallingLeafFrame());
    expect(f.fall).toBe(1);
    const life = fallingLeavesDurationMs(LEAVES);
    expect(writeFallingLeafInstances(e, pool, anchors, life - 1, false, scratch, frame)).toBe(1);
    expect(writeFallingLeafInstances(e, pool, anchors, life, false, scratch, frame)).toBe(0);
    expect(pool.activeCount).toBe(0);
    expect(e.mesh.visible).toBe(false);
    pool.acquire(0).state.treeIndex = anchors.length;
    expect(writeFallingLeafInstances(e, pool, anchors, 10, false, scratch, frame)).toBe(0);
    expect(pool.activeCount).toBe(0);
  });

  it("EM9: smoke colours follow the light preset palette (k mod 2); the leaves have no instance colour (the material's lit colour)", () => {
    const smoke = createChimneySmokeMesh(1, PUFFS);
    const leaves = createFallingLeafMesh(1, LEAVES, LEAF_MATERIAL);
    const managers = createObjectPoolManager(caps);
    managers.chimneySmoke.acquire(0);
    managers.fallingLeaves.acquire(0);
    const scratch = createEffectFrameScratch();
    const c = new Color();
    for (const preset of ["DAY", "NIGHT"] as const) {
      writeChimneySmokeInstances(smoke, managers.chimneySmoke, origins, (PUFFS - 1) * CHIMNEY_SMOKE_LOOK.staggerMs, false, preset, scratch);
      writeFallingLeafInstances(leaves, managers.fallingLeaves, anchors, (LEAVES - 1) * FALLING_LEAF_LOOK.staggerMs, false, scratch);
      expect(smoke.mesh.count).toBeGreaterThan(1);
      for (let k = 0; k < smoke.mesh.count; k++) {
        smoke.mesh.getColorAt(k, c);
        const want = new Color(CHIMNEY_SMOKE_LOOK.palette[preset][k % 2]);
        for (const ch of ["r", "g", "b"] as const) expect(c[ch], `${preset} smoke ${k}`).toBeCloseTo(want[ch], 5);
      }
      expect(leaves.mesh.count).toBeGreaterThan(2);
      expect(leaves.mesh.instanceColor, preset).toBeNull();
    }
  });

  it("EM10: the smoke is the faint effect program setup; the leaves use the crown's lit matte instanced material", () => {
    const smoke = createChimneySmokeMesh(2, PUFFS);
    const leaves = createFallingLeafMesh(2, LEAVES, LEAF_MATERIAL);
    const m = smoke.mesh.material as MeshBasicMaterial;
    expect(m).toBeInstanceOf(MeshBasicMaterial);
    expect(m.transparent).toBe(true);
    expect(m.depthWrite).toBe(false);
    expect(m.toneMapped).toBe(false);
    expect(m.vertexColors).toBe(false);
    expect(m.map).toBeNull();
    expect(m.blending).toBe(NormalBlending);
    expect(m.opacity).toBe(CHIMNEY_SMOKE_LOOK.opacity); // MFW-84: faint (a uniform, same program)
    expect(smoke.mesh.instanceColor).not.toBeNull();
    expect(smoke.mesh.geometry).toBeInstanceOf(IcosahedronGeometry);
    expect(smoke.mesh.geometry.getAttribute("position").count / 3).toBe(80); // detail 1: 80 faces, a round outline
    const l = leaves.mesh.material as MeshStandardMaterial;
    expect(l).toBeInstanceOf(MeshStandardMaterial);
    expect(l.color.getHexString()).toBe(new Color(LOOK_PALETTE.canopy).getHexString());
    expect(l.roughness).toBe(RIVER_FOLIAGE_PARTS.FULL.leafClump.material.roughness);
    expect(l.metalness).toBe(RIVER_FOLIAGE_PARTS.FULL.leafClump.material.metalness);
    expect(l.flatShading).toBe(false);
    expect(l.vertexColors).toBe(false);
    expect(l.transparent).toBe(false);
    expect(l.toneMapped).toBe(true);
    expect(l.side).toBe(FrontSide);
    expect(leaves.mesh.instanceColor).toBeNull();
    expect(leaves.mesh.castShadow).toBe(false);
    expect(leaves.mesh.receiveShadow).toBe(false);
    expect(leaves.mesh.geometry.index).not.toBeNull();
    expect(leaves.mesh.geometry.getAttribute("normal")).toBeDefined();
    expect(leaves.mesh.geometry.getAttribute("color")).toBeUndefined();
    for (const e of [smoke, leaves]) {
      expect(e.mesh.visible).toBe(false);
      expect(e.mesh.frustumCulled).toBe(false);
      expect(e.mesh.geometry.type).not.toBe("RingGeometry");
      const hits: Intersection[] = [];
      e.mesh.raycast(new Raycaster(), hits);
      expect(hits).toHaveLength(0);
    }
    expect(() => createChimneySmokeMesh(0, PUFFS)).toThrow(RangeError);
    expect(() => createFallingLeafMesh(1, 0, LEAF_MATERIAL)).toThrow(RangeError);
  });

  it("EM12: a falling leaf is drawn at FALLING_LEAF_LOOK.length, smaller than MFW-72's leaf", () => {
    const MFW72_LEAF_LENGTH = 0.4; // the MFW-72 value, named for this check
    expect(FALLING_LEAF_LOOK.length).toBeLessThan(MFW72_LEAF_LENGTH);
    const e = createFallingLeafMesh(1, LEAVES, LEAF_MATERIAL);
    const pool = createObjectPoolManager(caps).fallingLeaves;
    pool.acquire(0).state.treeIndex = 0;
    const midFall = FALLING_LEAF_LOOK.fallMs / 2;
    expect(writeFallingLeafAt(midFall, 0, createFallingLeafFrame()).size).toBe(1);
    expect(writeFallingLeafInstances(e, pool, anchors, midFall, false, createEffectFrameScratch())).toBe(1);
    const { s } = decompose(e.mesh, 0);
    expect(s.x).toBeCloseTo(FALLING_LEAF_LOOK.length, 6);
    expect(s.y).toBeCloseTo(FALLING_LEAF_LOOK.length, 6);
    expect(s.z).toBeCloseTo(FALLING_LEAF_LOOK.length, 6);
  });

  it("EM11: reduced motion releases a running smoke / fall on the first write and draws nothing", () => {
    const smoke = createChimneySmokeMesh(2, PUFFS);
    const leaves = createFallingLeafMesh(2, LEAVES, LEAF_MATERIAL);
    const managers = createObjectPoolManager(caps);
    managers.chimneySmoke.acquire(0);
    managers.fallingLeaves.acquire(0);
    const scratch = createEffectFrameScratch();
    writeChimneySmokeInstances(smoke, managers.chimneySmoke, origins, 500, false, "DAY", scratch);
    writeFallingLeafInstances(leaves, managers.fallingLeaves, anchors, 500, false, scratch);
    expect(smoke.mesh.visible && leaves.mesh.visible).toBe(true);
    expect(writeChimneySmokeInstances(smoke, managers.chimneySmoke, origins, 520, true, "DAY", scratch)).toBe(0);
    expect(writeFallingLeafInstances(leaves, managers.fallingLeaves, anchors, 520, true, scratch)).toBe(0);
    for (const e of [smoke, leaves]) {
      expect(e.mesh.count).toBe(0);
      expect(e.mesh.visible).toBe(false);
    }
    expect(managers.chimneySmoke.activeCount).toBe(0);
    expect(managers.fallingLeaves.activeCount).toBe(0);
  });
});
