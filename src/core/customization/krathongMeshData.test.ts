// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FLOWER_KINDS, KRATHONG_BASE_IDS, LEAF_FOLD_STYLE_IDS, RIM_SOCKET_COUNT } from "@/config/events/loyKrathong.config";
import {
  KRATHONG_BASE_MODELS,
  KRATHONG_CANDLE_MODEL,
  KRATHONG_FLAME_MODEL,
  KRATHONG_FLOWER_CENTRE_MIN_RAISE,
  KRATHONG_FLOWER_CENTRE_MODEL,
  KRATHONG_FLOWER_MODELS,
  KRATHONG_INCENSE_MODEL,
  KRATHONG_LEAF_COUNT,
  KRATHONG_LEAF_MODELS,
  KRATHONG_LODS,
  type BladeSpec,
  type KrathongLod,
  type KrathongMeshSpec,
  type LeafShellSpec,
  type MeshProfilePoint,
  type PetalRingSpec,
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
  buildLeafShellMeshData,
  buildPetalDiscMeshData,
  buildPetalRingMeshData,
  krathongModelRadiusXZ,
  leafShellWidthAt,
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

  it("every geometry key builds a closed, outward solid at every LOD", () => {
    for (const lod of KRATHONG_LODS)
      for (const key of KRATHONG_GEOMETRY_KEYS)
        expect(meshSignedVolume(buildKrathongMeshData(meshSpecFor(key, lod))), `${key}@${lod}`).toBeGreaterThan(0);
  });
});

const SHELL: LeafShellSpec = {
  length: 0.5,
  width: 0.46,
  widestAt: 0.4,
  fullness: 1,
  baseTiltRad: 0.6,
  bendRad: 0.5,
  fold: 0.16,
  cup: 0.28,
  thickness: 0.018,
  rows: 3,
  columns: 5,
};
const vertex = (d: KrathongMeshData, i: number) => [d.positions[3 * i], d.positions[3 * i + 1], d.positions[3 * i + 2]] as const;

describe("leaf shell (MFW-69)", () => {
  it("leaf shell: 4R(K−1) triangles, R(2K−2)+2 vertices, closed outward solid", () => {
    for (const [rows, columns, tris, verts] of [[2, 3, 16, 10], [3, 5, 48, 26], [4, 5, 64, 34]] as const) {
      const data = buildLeafShellMeshData({ ...SHELL, rows, columns });
      expect(data.triangleCount, `${rows}×${columns}`).toBe(tris);
      expect(data.vertexCount, `${rows}×${columns}`).toBe(verts);
      expect(meshSignedVolume(data), `${rows}×${columns}`).toBeGreaterThan(0);
    }
  });

  it("midrib crease and cupped edges", () => {
    const K = 5;
    const data = buildLeafShellMeshData({ ...SHELL, baseTiltRad: 0, bendRad: 0, rows: 2, columns: K });
    const z = (i: number) => vertex(data, i)[2];
    const x = (i: number) => vertex(data, i)[0];
    expect(z(1)).toBeLessThan(z(2));
    expect(z(2)).toBeLessThan(z(3));
    expect(Math.abs(z(3))).toBeLessThan(1e-9);
    expect(x(1)).toBeCloseTo(-x(5), 9);
    expect(z(1)).toBeCloseTo(z(5), 9);
    const rows = 2;
    for (let c = 1; c <= K - 2; c++) {
      const backIndex = 1 + rows * K + (c - 1); // row 1, interior column c
      expect(z(backIndex), `column ${c}`).toBeGreaterThan(z(1 + c));
    }
  });

  it("rejects invalid shells", () => {
    const bad: Partial<LeafShellSpec>[] = [
      { rows: 1 },
      { columns: 4 },
      { columns: 1 },
      { widestAt: 0 },
      { widestAt: 1 },
      { width: 0 },
      { thickness: 0 },
      { fullness: 0 },
      { cup: -0.1 },
      { length: NaN },
    ];
    for (const b of bad) expect(() => buildLeafShellMeshData({ ...SHELL, ...b }), JSON.stringify(b)).toThrow(RangeError);
  });

  it("leafShellWidthAt: 0 at base and tip, peak at widestAt", () => {
    expect(leafShellWidthAt(SHELL, 0)).toBe(0);
    expect(Math.abs(leafShellWidthAt(SHELL, 1))).toBeLessThan(1e-9);
    expect(Math.abs(leafShellWidthAt(SHELL, 0.4) - 0.46)).toBeLessThan(1e-9);
  });
});

const PETAL: LeafShellSpec = {
  length: 0.16,
  width: 0.13,
  widestAt: 0.6,
  fullness: 0.5,
  baseTiltRad: 1.2,
  bendRad: -0.45,
  fold: 0.08,
  cup: 0.4,
  thickness: 0.012,
  rows: 2,
  columns: 3,
};
const RING: PetalRingSpec = { petal: PETAL, count: 7, radius: 0.04, phaseRad: 0, jitter: [{ scale: 1, yawRad: 0, tiltRad: 0 }] };
const PETAL_VERTICES = 10;
const petalMaxRadius = (d: KrathongMeshData, petal: number) => {
  let max = 0;
  for (let v = petal * PETAL_VERTICES; v < (petal + 1) * PETAL_VERTICES; v++) {
    const [x, , z] = vertex(d, v);
    max = Math.max(max, Math.hypot(x, z));
  }
  return max;
};

describe("petal ring (MFW-69)", () => {
  it("ring = count × petal; closed", () => {
    const data = buildPetalRingMeshData(RING);
    expect(data.triangleCount).toBe(7 * 16);
    expect(data.vertexCount).toBe(7 * PETAL_VERTICES);
    expect(meshSignedVolume(data)).toBeGreaterThan(0);
  });

  it("petal 0 points along +Z when phase and jitter are 0", () => {
    const data = buildPetalRingMeshData(RING);
    let best = 0;
    for (let v = 1; v < PETAL_VERTICES; v++) {
      const [x, , z] = vertex(data, v);
      const [bx, , bz] = vertex(data, best);
      if (Math.hypot(x, z) > Math.hypot(bx, bz)) best = v;
    }
    const [x, , z] = vertex(data, best);
    expect(Math.abs(x)).toBeLessThan(1e-6);
    expect(z).toBeGreaterThan(0);
  });

  it("jitter varies the petals and cycles", () => {
    const data = buildPetalRingMeshData({
      ...RING,
      count: 4,
      jitter: [
        { scale: 1, yawRad: 0, tiltRad: 0 },
        { scale: 0.8, yawRad: 0, tiltRad: 0 },
      ],
    });
    expect(petalMaxRadius(data, 2)).toBeCloseTo(petalMaxRadius(data, 0), 6);
    expect(petalMaxRadius(data, 1)).toBeLessThan(petalMaxRadius(data, 0));
  });

  it("rejects invalid rings", () => {
    const bad: Partial<PetalRingSpec>[] = [
      { count: 1 },
      { count: 2.5 },
      { jitter: [] },
      { jitter: [{ scale: 0, yawRad: 0, tiltRad: 0 }] },
      { radius: -0.1 },
    ];
    for (const b of bad) expect(() => buildPetalRingMeshData({ ...RING, ...b }), JSON.stringify(b)).toThrow(RangeError);
  });
});

const kids = (spec: KrathongMeshSpec) => (spec.kind === "group" ? spec.children : [spec]);
const flat = (spec: KrathongMeshSpec): KrathongMeshSpec[] => (spec.kind === "group" ? spec.children.flatMap(flat) : [spec]);
const specAt = (spec: { mesh: KrathongMeshSpec; lod: { medium: KrathongMeshSpec; low: KrathongMeshSpec } }, lod: KrathongLod) =>
  lod === "full" ? spec.mesh : spec.lod[lod];
const rings = (spec: KrathongMeshSpec): PetalRingSpec[] => flat(spec).flatMap((s) => (s.kind === "petalRing" ? [s.ring] : []));
const shells = (spec: KrathongMeshSpec): LeafShellSpec[] => flat(spec).flatMap((s) => (s.kind === "leafShell" ? [s.shell] : []));
/** Every petal shell spec of a flower, one entry per petal. */
const petalsOf = (spec: KrathongMeshSpec): LeafShellSpec[] => [
  ...rings(spec).flatMap((r) => new Array<LeafShellSpec>(r.count).fill(r.petal)),
  ...shells(spec),
];
const leafShells = (fold: keyof typeof KRATHONG_LEAF_MODELS, lod: KrathongLod) =>
  kids(specAt(KRATHONG_LEAF_MODELS[fold], lod)).map((c) => {
    if (c.kind !== "leafShell") throw new Error(`${fold}@${lod}: leaf child is ${c.kind}`);
    return c.shell;
  });
const profileOf = (spec: KrathongMeshSpec): readonly MeshProfilePoint[] => {
  if (spec.kind !== "lathe") throw new Error(`expected a lathe, got ${spec.kind}`);
  return spec.profile;
};

describe("krathong v3 look (MFW-69; MFW-48 AC2)", () => {
  it("leaf units are layered: an outer leaf and a taller inner leaf", () => {
    for (const fold of LEAF_FOLD_STYLE_IDS)
      for (const lod of KRATHONG_LODS) {
        const children = kids(specAt(KRATHONG_LEAF_MODELS[fold], lod));
        expect(children, `${fold}@${lod}`).toHaveLength(2);
        for (const c of children) expect(c.kind, `${fold}@${lod}`).toBe("leafShell");
        const [outer, inner] = children.map((c) => meshYRange(buildKrathongMeshData(c)).max);
        expect(inner, `${fold}@${lod}`).toBeGreaterThan(outer);
      }
  });

  it("leaves bend outward, cup and carry a midrib crease at every LOD", () => {
    for (const fold of LEAF_FOLD_STYLE_IDS)
      for (const lod of KRATHONG_LODS)
        for (const shell of leafShells(fold, lod)) {
          const at = `${fold}@${lod}`;
          expect(shell.bendRad, at).toBeGreaterThan(0);
          expect(shell.fold, at).toBeGreaterThan(0);
          expect(shell.cup, at).toBeGreaterThan(0);
          expect(shell.columns, at).toBeGreaterThanOrEqual(3);
          expect(shell.rows, at).toBeGreaterThanOrEqual(2);
          if (lod === "full") expect(shell.columns, at).toBe(5);
        }
  });

  it("the two leaf layers overlap around the ring", () => {
    const span = (child: KrathongMeshSpec, rimRadius: number) => {
      const p = applyMeshTransform(buildKrathongMeshData(child), { translate: [0, 0, rimRadius] }).positions;
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < p.length; i += 3) {
        const a = Math.atan2(p[i], p[i + 2]);
        min = Math.min(min, a);
        max = Math.max(max, a);
      }
      return max - min;
    };
    for (const fold of LEAF_FOLD_STYLE_IDS)
      for (const base of KRATHONG_BASE_IDS) {
        const { rimRadius } = KRATHONG_BASE_MODELS[base];
        const [outer, inner] = kids(KRATHONG_LEAF_MODELS[fold].mesh).map((c) => span(c, rimRadius));
        expect(outer + inner, `${fold} on ${base}`).toBeGreaterThan((2 * Math.PI) / KRATHONG_LEAF_COUNT);
      }
  });

  it("fold styles differ", () => {
    const [o1, i1] = leafShells("style_01", "full");
    const [o2, i2] = leafShells("style_02", "full");
    for (const [a, b] of [[o1, o2], [i1, i2]] as const) {
      expect(Math.abs(leafShellWidthAt(a, 0.85) / a.width - leafShellWidthAt(b, 0.85) / b.width)).toBeGreaterThanOrEqual(0.2);
    }
  });

  it("bases are rounded closed solids", () => {
    for (const id of ["banana_trunk_01", "toy_bread_01"] as const) {
      const mesh = KRATHONG_BASE_MODELS[id].mesh;
      expect(mesh.kind).toBe("lathe");
      expect(profileOf(mesh).length, id).toBeGreaterThanOrEqual(8);
    }
    expect(rings(KRATHONG_BASE_MODELS.lotus_petal_01.mesh).length).toBeGreaterThanOrEqual(1);
    for (const lod of KRATHONG_LODS)
      for (const id of KRATHONG_BASE_IDS)
        expect(meshSignedVolume(buildKrathongMeshData(specAt(KRATHONG_BASE_MODELS[id], lod))), `${id}@${lod}`).toBeGreaterThan(0);
  });

  it("flowers have petals and a centre", () => {
    for (const kind of FLOWER_KINDS) {
      const flower = KRATHONG_FLOWER_MODELS[kind];
      expect(petalsOf(flower.mesh).length, kind).toBeGreaterThanOrEqual(5);
      for (const lod of ["medium", "low"] as const) {
        const ds = flat(flower.lod[lod]);
        expect(ds.some((d) => d.kind === "petalDisc" && d.disc.petals >= 5), `${kind}@${lod}`).toBe(true);
      }
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

  it("flower kinds are recognisably different (full)", () => {
    const marigold = KRATHONG_FLOWER_MODELS.marigold.mesh;
    expect(rings(marigold)).toHaveLength(2);
    expect(petalsOf(marigold).length).toBeGreaterThanOrEqual(10);
    for (const p of petalsOf(marigold)) expect(p.fullness).toBeLessThan(1);
    const lotus = KRATHONG_FLOWER_MODELS.lotus.mesh;
    expect(rings(lotus)).toHaveLength(2);
    for (const p of petalsOf(lotus)) {
      expect(p.fullness).toBeGreaterThanOrEqual(1);
      expect(p.baseTiltRad).toBeLessThanOrEqual(0.8);
    }
    const orchid = KRATHONG_FLOWER_MODELS.orchid.mesh;
    expect(new Set(petalsOf(orchid).map((p) => `${p.length}×${p.width}`)).size).toBeGreaterThanOrEqual(3);
    const signatures = FLOWER_KINDS.map((k) => {
      const mesh = KRATHONG_FLOWER_MODELS[k].mesh;
      return `${petalsOf(mesh).length}/${rings(mesh).length}`;
    });
    expect(new Set(signatures).size).toBe(FLOWER_KINDS.length);
  });

  it("petals cup and vary", () => {
    for (const kind of FLOWER_KINDS) {
      const mesh = KRATHONG_FLOWER_MODELS[kind].mesh;
      for (const p of petalsOf(mesh)) expect(p.cup, kind).toBeGreaterThan(0);
      for (const r of rings(mesh)) expect(new Set(r.jitter.map((j) => JSON.stringify(j))).size, kind).toBeGreaterThanOrEqual(2);
    }
  });

  it("the centre is raised", () => {
    for (const lod of KRATHONG_LODS) {
      const spec = specAt(KRATHONG_FLOWER_CENTRE_MODEL, lod);
      const untilted: KrathongMeshSpec = { kind: "group", children: kids(spec) };
      expect(meshYRange(buildKrathongMeshData(untilted)).max, lod).toBeGreaterThanOrEqual(KRATHONG_FLOWER_CENTRE_MIN_RAISE);
    }
  });

  it("base lip, candle drips, teardrop flame", () => {
    const banana = profileOf(KRATHONG_BASE_MODELS.banana_trunk_01.mesh);
    const bread = profileOf(KRATHONG_BASE_MODELS.toy_bread_01.mesh);
    expect(banana.length).toBeGreaterThanOrEqual(8);
    expect(bread.length).toBeGreaterThanOrEqual(8);
    const rim = banana.slice(1, -1);
    expect(rim[rim.length - 1][0]).toBeLessThan(rim[rim.length - 2][0]);
    expect(banana[banana.length - 1][1]).toBeGreaterThanOrEqual(KRATHONG_BASE_MODELS.banana_trunk_01.rimY);

    const candle = KRATHONG_CANDLE_MODEL.mesh;
    expect(candle.kind).toBe("group");
    const candleKids = kids(candle);
    expect(candleKids.length).toBeGreaterThanOrEqual(2);
    for (const c of candleKids) expect(c.kind).toBe("lathe");
    const body = profileOf(candleKids[0]).slice(1, -1).map(([r]) => r);
    expect(body[body.length - 2]).toBeLessThan(Math.max(...body));

    const flame = profileOf(KRATHONG_FLAME_MODEL.mesh);
    expect(flame.length).toBeGreaterThanOrEqual(8);
    const ys = flame.map(([, y]) => y);
    const widest = flame.reduce((a, b) => (b[0] > a[0] ? b : a));
    expect(widest[1]).toBeLessThan((Math.min(...ys) + Math.max(...ys)) / 2);
    const height = (spec: KrathongMeshSpec) => {
      const r = meshYRange(buildKrathongMeshData(spec));
      return r.max - r.min;
    };
    expect(height(KRATHONG_FLAME_MODEL.mesh)).toBeGreaterThan(height(KRATHONG_FLAME_MODEL.lod.medium) - 1e-9);
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

  it("footprint: every base × fold × full flower ring stays inside KRATHONG_MODEL_FOOTPRINT_RADIUS at every LOD", () => {
    for (const lod of KRATHONG_LODS)
      for (const base of KRATHONG_BASE_IDS)
        for (const lotusFold of LEAF_FOLD_STYLE_IDS)
          for (const kind of FLOWER_KINDS) {
            const flowers = new Array(RIM_SOCKET_COUNT).fill(kind);
            const r = krathongModelRadiusXZ({ ...DEFAULT_KRATHONG_APPEARANCE, base, lotusFold, flowers }, lod);
            expect(r, `${base} ${lotusFold} ${kind} @${lod}`).toBeLessThanOrEqual(KRATHONG_MODEL_FOOTPRINT_RADIUS);
          }
  });
});
