// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHRISTMAS_TREE } from "@/config/events/christmas.tree.config";
import {
  CHRISTMAS_PROP_IDS,
  CHRISTMAS_PROP_LODS,
  CHRISTMAS_PROP_MAX_TRIANGLES_BY_LOD,
  type ChristmasPropLod,
} from "@/config/christmasPropModels.config";
import { ORNAMENT_DESIGN_IDS } from "@/config/ornamentDesigns.config";
import {
  CHRISTMAS_MODEL_ASSET_BUDGET,
  ORNAMENT_DESIGN_SOURCES,
  ORNAMENT_GLB_DESIGN_IDS,
  ORNAMENT_LODS,
  ORNAMENT_MAX_TRIANGLES_BY_LOD,
  ORNAMENT_MODEL_RADIUS,
  ORNAMENT_WORLD_SCALE,
  type OrnamentLod,
} from "@/config/ornamentModels.config";
import { parseOrnamentDesignGlb } from "@/core/customization/ornamentDesignGlb";
import { slotsOfBand, treeCoordToWorld } from "@/core/world/growingTree";
import { buildOrnamentLod, CHRISTMAS_GLB_GENERATOR } from "../../scripts/christmas-models-lib.mjs";
import { CHRISTMAS_MODEL_DESIGNS, CHRISTMAS_PROP_DESIGNS, MODEL_RADIUS } from "../../scripts/christmas-models.designs.mjs";
import { srgbHexToLinearBytes } from "../../scripts/krathong-models-lib.mjs";

const ROOT = process.cwd();
const PUBLIC_DIR = join(ROOT, "public/models/christmas");
const SOURCE_DIR = join(ROOT, "assets/christmas/decimated");
type AnyLod = OrnamentLod | ChristmasPropLod;
const publicFile = (id: string, lod: AnyLod) => join(PUBLIC_DIR, `${id}.${lod}.glb`);
const sourceFile = (id: string, lod: AnyLod) => join(SOURCE_DIR, `${id}.${lod}.glb`);
const bufferOf = (path: string): ArrayBuffer => {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const parse = (id: string, lod: AnyLod) => parseOrnamentDesignGlb(bufferOf(publicFile(id, lod)));
function jsonOf(path: string): Record<string, unknown> {
  const b = readFileSync(path);
  const length = b.readUInt32LE(12);
  return JSON.parse(b.subarray(20, 20 + length).toString("utf8")) as Record<string, unknown>;
}
const specOf = (id: string) => {
  const spec = [...CHRISTMAS_MODEL_DESIGNS, ...CHRISTMAS_PROP_DESIGNS].find((d) => d.id === id);
  if (!spec) throw new Error(`no design spec for ${id}`);
  return spec;
};
const ORNAMENT_PAIRS: (readonly [string, AnyLod])[] = ORNAMENT_GLB_DESIGN_IDS.flatMap((id) => ORNAMENT_LODS.map((lod) => [id, lod] as const));
const PROP_PAIRS: (readonly [string, AnyLod])[] = CHRISTMAS_PROP_IDS.flatMap((id) => CHRISTMAS_PROP_LODS.map((lod) => [id, lod] as const));
const ALL_PAIRS = [...ORNAMENT_PAIRS, ...PROP_PAIRS];
const hex = (color: string) => srgbHexToLinearBytes(color).join(",");
/** Mean position of the vertices whose colour is `color` (an sRGB hex), per axis. */
function regionOf(id: string, lod: AnyLod, color: string) {
  const { positions, colors } = parse(id, lod);
  const want = hex(color);
  const sum = [0, 0, 0];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let n = 0;
  for (let i = 0; i < colors.length; i += 4) {
    if ([...colors.subarray(i, i + 3)].join(",") !== want) continue;
    n++;
    for (let k = 0; k < 3; k++) {
      const v = positions[(i / 4) * 3 + k];
      sum[k] += v;
      min[k] = Math.min(min[k], v);
      max[k] = Math.max(max[k], v);
    }
  }
  return { n, mean: sum.map((v) => v / Math.max(n, 1)), min, max };
}

function extentOf(positions: Float32Array) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let maxRadius = 0;
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[i + k]);
      max[k] = Math.max(max[k], positions[i + k]);
    }
    maxRadius = Math.max(maxRadius, Math.hypot(positions[i], positions[i + 1], positions[i + 2]));
  }
  return { min, max, size: max.map((v, k) => v - min[k]), maxRadius };
}

describe("committed christmas ornament model assets (MFW-101 / MFW-124)", () => {
  it("CA1: every design × LOD has a public and a decimated file; nothing else is served", () => {
    for (const [id, lod] of ALL_PAIRS) {
      expect(statSync(publicFile(id, lod)).isFile(), `${id}.${lod}`).toBe(true);
      expect(statSync(sourceFile(id, lod)).isFile(), `${id}.${lod}`).toBe(true);
    }
    expect(readdirSync(PUBLIC_DIR).sort()).toEqual(ALL_PAIRS.map(([id, lod]) => `${id}.${lod}.glb`).sort());
    expect(readdirSync(PUBLIC_DIR)).toHaveLength(22);
    expect(CHRISTMAS_MODEL_DESIGNS.map((d) => d.id)).toEqual([...ORNAMENT_GLB_DESIGN_IDS]);
    expect([...ORNAMENT_GLB_DESIGN_IDS]).toEqual([...ORNAMENT_DESIGN_IDS]);
    expect([...ORNAMENT_GLB_DESIGN_IDS]).toHaveLength(6);
    expect(CHRISTMAS_PROP_DESIGNS.map((d) => d.id)).toEqual([...CHRISTMAS_PROP_IDS]);
    for (const spec of CHRISTMAS_PROP_DESIGNS) {
      expect(spec.hook, spec.id).toBe(false);
      expect(spec.lods, spec.id).toEqual([...CHRISTMAS_PROP_LODS]);
    }
    for (const spec of CHRISTMAS_MODEL_DESIGNS) expect(spec.hook, spec.id).toBe(true);
    for (const id of CHRISTMAS_PROP_IDS) {
      expect(() => statSync(publicFile(id, "full" as AnyLod)), `${id}.full public`).toThrow();
      expect(() => statSync(sourceFile(id, "full" as AnyLod)), `${id}.full source`).toThrow();
    }
  });

  it("CA2: size budget", () => {
    let publicTotal = 0;
    let sourceTotal = 0;
    for (const [id, lod] of ALL_PAIRS) {
      const publicSize = statSync(publicFile(id, lod)).size;
      const sourceSize = statSync(sourceFile(id, lod)).size;
      expect(publicSize, `${id}.${lod}`).toBeLessThanOrEqual(CHRISTMAS_MODEL_ASSET_BUDGET.maxFileBytes);
      expect(sourceSize, `${id}.${lod} source`).toBeLessThanOrEqual(CHRISTMAS_MODEL_ASSET_BUDGET.maxFileBytes);
      publicTotal += publicSize;
      sourceTotal += sourceSize;
    }
    expect(publicTotal).toBeLessThanOrEqual(CHRISTMAS_MODEL_ASSET_BUDGET.maxPublicTotalBytes);
    expect(sourceTotal).toBeLessThanOrEqual(CHRISTMAS_MODEL_ASSET_BUDGET.maxSourceTotalBytes);
  });

  it.each(ALL_PAIRS)("CA3: %s.%s follows the contract", (id, lod) => {
    expect(() => parse(id, lod)).not.toThrow();
    const json = jsonOf(publicFile(id, lod));
    for (const key of ["materials", "textures", "images", "samplers"]) expect(json, key).not.toHaveProperty(key);
    const meshes = json.meshes as { primitives: { attributes: Record<string, number> }[] }[];
    expect(Object.keys(meshes[0].primitives[0].attributes).sort()).toEqual(["COLOR_0", "NORMAL", "POSITION"]);
    expect((json.asset as { generator: string }).generator).toBe(CHRISTMAS_GLB_GENERATOR);
  });

  it("CA4: ornament triangle guards per LOD; full > medium > low", () => {
    for (const id of ORNAMENT_GLB_DESIGN_IDS) {
      const triangles = ORNAMENT_LODS.map((lod) => parse(id, lod).indices.length / 3);
      ORNAMENT_LODS.forEach((lod, i) => expect(triangles[i], `${id}.${lod}`).toBeLessThanOrEqual(ORNAMENT_MAX_TRIANGLES_BY_LOD[lod]));
      expect(triangles[0], id).toBeGreaterThan(triangles[1]);
      expect(triangles[1], id).toBeGreaterThan(triangles[2]);
    }
  });

  it.each(ORNAMENT_PAIRS)("CA5: %s.%s has the hook at the top of the centre axis", (id, lod) => {
    const data = parse(id, lod);
    expect(data.hook).not.toBeNull();
    const hook = data.hook as NonNullable<typeof data.hook>;
    expect(hook.x).toBe(0);
    expect(hook.z).toBe(0);
    expect(hook.y).toBeGreaterThan(0);
    expect(Math.abs(hook.y - extentOf(data.positions).max[1])).toBeLessThanOrEqual(1e-4);
  });

  it("CA6: model-local bounding radius; star and bow are flat facing ±Z", () => {
    expect(MODEL_RADIUS).toBe(ORNAMENT_MODEL_RADIUS);
    for (const [id, lod] of ALL_PAIRS) {
      const { maxRadius, size } = extentOf(parse(id, lod).positions);
      expect(maxRadius, `${id}.${lod}`).toBeGreaterThanOrEqual(ORNAMENT_MODEL_RADIUS - 1e-3);
      expect(maxRadius, `${id}.${lod}`).toBeLessThanOrEqual(ORNAMENT_MODEL_RADIUS + 1e-6);
      if (id === "star_01" || id === "bow_01") {
        expect(size[2], `${id}.${lod} z vs x`).toBeLessThan(size[0]);
        expect(size[2], `${id}.${lod} z vs y`).toBeLessThan(size[1]);
      }
    }
  });

  it.each(ALL_PAIRS)("CA7: %s.%s is the fresh pipeline output of its committed source", (id, lod) => {
    const built = buildOrnamentLod(new Uint8Array(readFileSync(sourceFile(id, lod))), specOf(id), lod);
    expect(Buffer.compare(Buffer.from(built), readFileSync(publicFile(id, lod)))).toBe(0);
  });

  it("CA8: vertex colours are rule colours and every region shows; fallback = last rule colour", () => {
    for (const [id, lod] of ALL_PAIRS) {
      const spec = specOf(id);
      const byKey = new Map(spec.rules.map((rule) => [hex(rule.color), rule.region]));
      const { colors } = parse(id, lod);
      const regions = new Set<string>();
      const seen = new Set<string>();
      for (let i = 0; i < colors.length; i += 4) {
        const key = [...colors.subarray(i, i + 3)].join(",");
        const region = byKey.get(key);
        expect(region, `${id}.${lod} vertex ${i / 4}`).toBeDefined();
        expect(colors[i + 3]).toBe(255);
        regions.add(region as string);
        seen.add(key);
      }
      if (id === "ball_01" && lod === "full") expect([...regions].sort()).toEqual(["body", "cap"]);
      if (!["ball_01", "star_01", "bow_01"].includes(id)) expect([...seen].sort(), `${id}.${lod} regions`).toEqual([...byKey.keys()].sort());
    }
    for (const id of ORNAMENT_GLB_DESIGN_IDS) expect(ORNAMENT_DESIGN_SOURCES[id]?.fallbackColor).toBe(specOf(id).rules.at(-1)?.color);
  });

  it("CA9: every design (and the fallback sphere) fits within half the minimum slot spacing", () => {
    const BANDS = 3;
    const points = [1, 2, 3].flatMap((b) => slotsOfBand(CHRISTMAS_TREE, b).map((s) => treeCoordToWorld(CHRISTMAS_TREE, s, BANDS)));
    let minSpacing = Infinity;
    for (let i = 0; i < points.length; i++)
      for (let j = i + 1; j < points.length; j++)
        minSpacing = Math.min(minSpacing, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y, points[i].z - points[j].z));
    expect(minSpacing).toBeGreaterThan(0);
    for (const [id, lod] of ORNAMENT_PAIRS) {
      expect(extentOf(parse(id, lod).positions).maxRadius * ORNAMENT_WORLD_SCALE, `${id}.${lod}`).toBeLessThanOrEqual(minSpacing / 2);
    }
    expect(ORNAMENT_MODEL_RADIUS * ORNAMENT_WORLD_SCALE).toBeLessThanOrEqual(minSpacing / 2);
  });

  it("CA10: prop triangle guards; medium > low", () => {
    for (const id of CHRISTMAS_PROP_IDS) {
      const triangles = CHRISTMAS_PROP_LODS.map((lod) => parse(id, lod).indices.length / 3);
      CHRISTMAS_PROP_LODS.forEach((lod, i) => expect(triangles[i], `${id}.${lod}`).toBeLessThanOrEqual(CHRISTMAS_PROP_MAX_TRIANGLES_BY_LOD[lod]));
      expect(triangles[0], id).toBeGreaterThan(triangles[1]);
    }
  });

  it.each(PROP_PAIRS)("CA11: %s.%s has no hook and no mesh extras", (id, lod) => {
    expect(parse(id, lod).hook).toBeNull();
    const meshes = jsonOf(publicFile(id, lod)).meshes as Record<string, unknown>[];
    expect(meshes[0]).not.toHaveProperty("extras");
  });

  it("CA12: the regions sit where the orientation puts them", () => {
    for (const lod of ORNAMENT_LODS) {
      expect(regionOf("stocking_01", lod, "#E6DCCC").mean[1], `stocking ${lod} cuff above body`).toBeGreaterThan(regionOf("stocking_01", lod, "#D69580").mean[1]);
    }
    expect(regionOf("bell_01", "full", "#CE8F7A").mean[1]).toBeGreaterThan(regionOf("bell_01", "full", "#E5CF9A").mean[1]);
    const gift = parse("gift_01", "full");
    const ribbon = hex("#D5C6B6");
    const lo = [Infinity, Infinity];
    const hi = [-Infinity, -Infinity];
    for (let i = 0; i < gift.colors.length; i += 4) {
      if ([...gift.colors.subarray(i, i + 3)].join(",") !== ribbon || gift.positions[(i / 4) * 3 + 1] <= 0.5) continue;
      for (const [k, axis] of [[0, 0], [1, 2]] as const) {
        lo[k] = Math.min(lo[k], gift.positions[(i / 4) * 3 + axis]);
        hi[k] = Math.max(hi[k], gift.positions[(i / 4) * 3 + axis]);
      }
    }
    expect(hi[0] - lo[0], "gift bow x extent vs z extent").toBeGreaterThan(hi[1] - lo[1]);
    expect(regionOf("snowman_01", "medium", "#E09261").mean[2]).toBeGreaterThan(0.3);
    expect(regionOf("snowman_01", "medium", "#D79E8C").mean[1]).toBeGreaterThan(regionOf("snowman_01", "medium", "#E2D1C1").mean[1]);
  });
});
