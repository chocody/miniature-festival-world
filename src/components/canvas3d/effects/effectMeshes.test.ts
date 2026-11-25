// @vitest-environment node
import { AdditiveBlending, BufferGeometry, Color, IcosahedronGeometry, InstancedMesh, Material, Matrix4, MeshBasicMaterial, Quaternion, Raycaster, Vector3, type Intersection } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RIVER_ENVIRONMENT_PARTS } from "@/config/events/loyKrathong.river.config";
import { LAMP_GLOW_LOOK, RIPPLE_LOOK } from "@/config/gimmicks.config";
import { createObjectPoolManager, createBounceFrame, createRippleFrame, writeBounceAt, writeRippleFrameAt } from "@/core/effects";
import { LOY_KRATHONG_RIVER_LAYOUT } from "@/components/models/loyKrathong";
import {
  createEffectFrameScratch,
  createLampGlowMesh,
  createRippleMesh,
  disposeEffectMesh,
  writeLampGlowInstances,
  writeRippleInstances,
} from "./effectMeshes";
import { SCENE_OBJECT_NAMES } from "../sceneObjectNames";

afterEach(() => vi.restoreAllMocks());

const caps = { ripple: 4, glow: 2 };
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
