// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FLOWER_KINDS, KRATHONG_BASE_IDS, LEAF_FOLD_STYLE_IDS, RIM_SOCKET_COUNT } from "@/config/events/loyKrathong.config";
import {
  KRATHONG_BASE_MODELS,
  KRATHONG_CANDLE_MODEL,
  KRATHONG_FLAME_MODEL,
  KRATHONG_FLOWER_MODELS,
  KRATHONG_INCENSE_MODEL,
  KRATHONG_LEAF_MODELS,
  type BladeSpec,
  type KrathongMeshSpec,
  type MeshProfilePoint,
} from "@/config/krathongModel.config";
import { KRATHONG_MODEL_FOOTPRINT_RADIUS } from "@/config/riverFlow.config";
import { assembleKrathong } from "./krathongAssembler";
import { DEFAULT_KRATHONG_APPEARANCE } from "./krathongAppearance";
import { KRATHONG_GEOMETRY_KEYS, meshSpecFor } from "./krathongAssetKeys";
import {
  applyMeshTransform,
  buildBladeMeshData,
  buildKrathongMeshData,
  buildLatheMeshData,
  buildPetalDiscMeshData,
  krathongModelRadiusXZ,
  meshMaxRadiusXZ,
  meshSignedVolume,
  meshYRange,
  type KrathongMeshData,
} from "./krathongMeshData";

const BLADE: BladeSpec = { length: 0.5, width: 0.3, widestAt: 0.4, frontBulge: 0.05, backBulge: 0.04, baseTiltRad: 0.4, curlRad: -0.2, segments: 2 };
const point = (x: number, y: number, z: number): KrathongMeshData =>
  Object.freeze({ positions: Float32Array.of(x, y, z), indices: new Uint16Array(0), vertexCount: 1, triangleCount: 0 });

describe("krathong mesh data builders (MFW-48)", () => {
  it("lathe: an octagonal prism", () => {
    const profile: MeshProfilePoint[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const data = buildLatheMeshData(profile, 8);
    expect(data.triangleCount).toBe(32);
    expect(data.vertexCount).toBe(18);
    const expected = (8 * Math.sin(Math.PI / 4)) / 2; // octagon area (r = 1) × height 1 ≈ 2.828
    const volume = meshSignedVolume(data);
    expect(volume).toBeGreaterThan(0);
    expect(Math.abs(volume - expected) / expected).toBeLessThan(0.05);
  });

  it("lathe: rejects open profiles, too few segments and adjacent poles", () => {
    expect(() => buildLatheMeshData([[1, 0], [0, 1]], 8)).toThrow(RangeError);
    expect(() => buildLatheMeshData([[0, 0], [1, 0], [0, 1]], 2)).toThrow(RangeError);
    expect(() => buildLatheMeshData([[0, 0], [0, 0.5], [1, 0.6], [0, 1]], 8)).toThrow(RangeError);
    expect(() => buildLatheMeshData([[0, 0], [-1, 0.5], [0, 1]], 8)).toThrow(RangeError);
    expect(() => buildLatheMeshData([[0, 0], [NaN, 0.5], [0, 1]], 8)).toThrow(RangeError);
  });

  it("blade: 8(m−1) triangles, 4m−2 vertices, closed", () => {
    for (const [segments, tris] of [[2, 8], [3, 16]] as const) {
      const data = buildBladeMeshData({ ...BLADE, segments });
      expect(data.triangleCount).toBe(tris);
      expect(data.vertexCount).toBe(4 * segments - 2);
      expect(meshSignedVolume(data)).toBeGreaterThan(0);
    }
    expect(() => buildBladeMeshData({ ...BLADE, segments: 1 })).toThrow(RangeError);
    expect(() => buildBladeMeshData({ ...BLADE, widestAt: 1 })).toThrow(RangeError);
    expect(() => buildBladeMeshData({ ...BLADE, frontBulge: 0, backBulge: 0 })).toThrow(RangeError);
  });

  it("petal disc: 2N triangles, closed, reaches the outer radius", () => {
    const disc = { petals: 5, samplesPerPetal: 4, outerRadius: 0.18, innerRadius: 0.06, roundness: 0.5, rimLift: 0.03, topHeight: 0.04, bottomDepth: 0.03, phaseRad: 0 };
    const data = buildPetalDiscMeshData(disc);
    expect(data.triangleCount).toBe(40);
    expect(meshSignedVolume(data)).toBeGreaterThan(0);
    expect(meshMaxRadiusXZ(data)).toBeCloseTo(disc.outerRadius, 6);
    expect(() => buildPetalDiscMeshData({ ...disc, innerRadius: 0.2 })).toThrow(RangeError);
    expect(() => buildPetalDiscMeshData({ ...disc, petals: 2 })).toThrow(RangeError);
  });

  it("transform: rotateY / rotateX follow the three convention; scale must be > 0", () => {
    const y = applyMeshTransform(point(0, 0, 1), { rotateYRad: Math.PI / 2 }).positions;
    expect([y[0], y[1], y[2]].map((v) => Number(v.toFixed(6)))).toEqual([1, 0, 0]);
    const x = applyMeshTransform(point(0, 1, 0), { rotateXRad: Math.PI / 2 }).positions;
    expect([x[0], x[1], x[2]].map((v) => Number(v.toFixed(6)))).toEqual([0, 0, 1]);
    const p = point(1, 2, 3);
    expect(applyMeshTransform(p, undefined)).toBe(p);
    expect(() => applyMeshTransform(p, { scale: [1, 0, 1] })).toThrow(RangeError);
  });

  it("every geometry key builds a closed, outward solid", () => {
    for (const key of KRATHONG_GEOMETRY_KEYS) expect(meshSignedVolume(buildKrathongMeshData(meshSpecFor(key))), key).toBeGreaterThan(0);
  });
});

const kids = (spec: KrathongMeshSpec) => (spec.kind === "group" ? spec.children : [spec]);
const discs = (spec: KrathongMeshSpec): KrathongMeshSpec[] =>
  spec.kind === "group" ? spec.children.flatMap(discs) : spec.kind === "petalDisc" ? [spec] : [];

describe("krathong v2 look (MFW-48 AC2)", () => {
  it("leaf units are layered: an outer spike and a taller inner leaf", () => {
    for (const fold of LEAF_FOLD_STYLE_IDS) {
      const blades = kids(KRATHONG_LEAF_MODELS[fold].mesh);
      expect(blades, fold).toHaveLength(2);
      for (const b of blades) expect(b.kind).toBe("blade");
      const [outer, inner] = blades.map((b) => meshYRange(buildKrathongMeshData(b)).max);
      expect(inner, fold).toBeGreaterThan(outer);
    }
  });

  it("bases are rounded closed solids", () => {
    for (const id of ["banana_trunk_01", "toy_bread_01"] as const) {
      const mesh = KRATHONG_BASE_MODELS[id].mesh;
      expect(mesh.kind).toBe("lathe");
      if (mesh.kind === "lathe") expect(mesh.profile.length, id).toBeGreaterThanOrEqual(6);
    }
    expect(discs(KRATHONG_BASE_MODELS.lotus_petal_01.mesh).length).toBeGreaterThanOrEqual(2);
    for (const id of KRATHONG_BASE_IDS) expect(meshSignedVolume(buildKrathongMeshData(KRATHONG_BASE_MODELS[id].mesh))).toBeGreaterThan(0);
  });

  it("flowers have petals and a centre", () => {
    for (const kind of FLOWER_KINDS) {
      const ds = discs(KRATHONG_FLOWER_MODELS[kind].mesh);
      expect(ds.some((d) => d.kind === "petalDisc" && d.disc.petals >= 5), kind).toBe(true);
    }
    const flowers = ["orchid", null, "lotus", "marigold"] as const;
    const body = assembleKrathong({ ...DEFAULT_KRATHONG_APPEARANCE, flowers }).body;
    const petals = body.filter((p) => p.role === "flower");
    const centres = body.filter((p) => p.role === "flowerCentre");
    expect(centres).toHaveLength(flowers.filter((f) => f !== null).length);
    centres.forEach((c, i) => {
      expect(c.socketId).toBe(petals[i].socketId);
      expect(c.localPosition).toEqual(petals[i].localPosition);
      expect(c.rotationY).toBe(petals[i].rotationY);
    });
  });

  it("flame sits on the candle; the candle stands above the incense", () => {
    const candle = meshYRange(buildKrathongMeshData(KRATHONG_CANDLE_MODEL.mesh));
    const flame = meshYRange(buildKrathongMeshData(KRATHONG_FLAME_MODEL.mesh));
    const incense = meshYRange(buildKrathongMeshData(KRATHONG_INCENSE_MODEL.mesh));
    const gap = KRATHONG_FLAME_MODEL.localY + flame.min - (KRATHONG_CANDLE_MODEL.localY + candle.max);
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThanOrEqual(0.05);
    expect(KRATHONG_CANDLE_MODEL.localY + candle.max).toBeGreaterThan(KRATHONG_INCENSE_MODEL.localY + incense.max);
  });

  it("footprint: every base × fold × full flower ring stays inside KRATHONG_MODEL_FOOTPRINT_RADIUS", () => {
    for (const base of KRATHONG_BASE_IDS)
      for (const lotusFold of LEAF_FOLD_STYLE_IDS)
        for (const kind of FLOWER_KINDS) {
          const flowers = new Array(RIM_SOCKET_COUNT).fill(kind);
          const r = krathongModelRadiusXZ({ ...DEFAULT_KRATHONG_APPEARANCE, base, lotusFold, flowers });
          expect(r, `${base} ${lotusFold} ${kind}`).toBeLessThanOrEqual(KRATHONG_MODEL_FOOTPRINT_RADIUS);
        }
  });
});
