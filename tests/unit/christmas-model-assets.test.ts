// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHRISTMAS_TREE } from "@/config/events/christmas.tree.config";
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
import { CHRISTMAS_MODEL_DESIGNS, MODEL_RADIUS } from "../../scripts/christmas-models.designs.mjs";
import { srgbHexToLinearBytes } from "../../scripts/krathong-models-lib.mjs";

const ROOT = process.cwd();
const PUBLIC_DIR = join(ROOT, "public/models/christmas");
const SOURCE_DIR = join(ROOT, "assets/christmas/decimated");
const publicFile = (id: string, lod: OrnamentLod) => join(PUBLIC_DIR, `${id}.${lod}.glb`);
const sourceFile = (id: string, lod: OrnamentLod) => join(SOURCE_DIR, `${id}.${lod}.glb`);
const bufferOf = (path: string): ArrayBuffer => {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const parse = (id: string, lod: OrnamentLod) => parseOrnamentDesignGlb(bufferOf(publicFile(id, lod)));
function jsonOf(path: string): Record<string, unknown> {
  const b = readFileSync(path);
  const length = b.readUInt32LE(12);
  return JSON.parse(b.subarray(20, 20 + length).toString("utf8")) as Record<string, unknown>;
}
const specOf = (id: string) => {
  const spec = CHRISTMAS_MODEL_DESIGNS.find((d) => d.id === id);
  if (!spec) throw new Error(`no design spec for ${id}`);
  return spec;
};
const pairs = ORNAMENT_GLB_DESIGN_IDS.flatMap((id) => ORNAMENT_LODS.map((lod) => [id, lod] as const));

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

describe("committed christmas ornament model assets (MFW-101)", () => {
  it("CA1: every design × LOD has a public and a decimated file; nothing else is served", () => {
    for (const [id, lod] of pairs) {
      expect(statSync(publicFile(id, lod)).isFile(), `${id}.${lod}`).toBe(true);
      expect(statSync(sourceFile(id, lod)).isFile(), `${id}.${lod}`).toBe(true);
    }
    expect(readdirSync(PUBLIC_DIR).sort()).toEqual(pairs.map(([id, lod]) => `${id}.${lod}.glb`).sort());
    expect(CHRISTMAS_MODEL_DESIGNS.map((d) => d.id)).toEqual([...ORNAMENT_GLB_DESIGN_IDS]);
    expect([...ORNAMENT_GLB_DESIGN_IDS]).toEqual(["ball_01", "star_01", "bow_01"]);
  });

  it("CA2: size budget", () => {
    let publicTotal = 0;
    let sourceTotal = 0;
    for (const [id, lod] of pairs) {
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

  it.each(pairs)("CA3: %s.%s follows the contract", (id, lod) => {
    expect(() => parse(id, lod)).not.toThrow();
    const json = jsonOf(publicFile(id, lod));
    for (const key of ["materials", "textures", "images", "samplers"]) expect(json, key).not.toHaveProperty(key);
    const meshes = json.meshes as { primitives: { attributes: Record<string, number> }[] }[];
    expect(Object.keys(meshes[0].primitives[0].attributes).sort()).toEqual(["COLOR_0", "NORMAL", "POSITION"]);
    expect((json.asset as { generator: string }).generator).toBe(CHRISTMAS_GLB_GENERATOR);
  });

  it("CA4: triangle guards per LOD; full > medium > low", () => {
    for (const id of ORNAMENT_GLB_DESIGN_IDS) {
      const triangles = ORNAMENT_LODS.map((lod) => parse(id, lod).indices.length / 3);
      ORNAMENT_LODS.forEach((lod, i) => expect(triangles[i], `${id}.${lod}`).toBeLessThanOrEqual(ORNAMENT_MAX_TRIANGLES_BY_LOD[lod]));
      expect(triangles[0], id).toBeGreaterThan(triangles[1]);
      expect(triangles[1], id).toBeGreaterThan(triangles[2]);
    }
  });

  it.each(pairs)("CA5: %s.%s has the hook at the top of the centre axis", (id, lod) => {
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
    for (const [id, lod] of pairs) {
      const { maxRadius, size } = extentOf(parse(id, lod).positions);
      expect(maxRadius, `${id}.${lod}`).toBeGreaterThanOrEqual(ORNAMENT_MODEL_RADIUS - 1e-3);
      expect(maxRadius, `${id}.${lod}`).toBeLessThanOrEqual(ORNAMENT_MODEL_RADIUS + 1e-6);
      if (id === "star_01" || id === "bow_01") {
        expect(size[2], `${id}.${lod} z vs x`).toBeLessThan(size[0]);
        expect(size[2], `${id}.${lod} z vs y`).toBeLessThan(size[1]);
      }
    }
  });

  it.each(pairs)("CA7: %s.%s is the fresh pipeline output of its committed source", (id, lod) => {
    const built = buildOrnamentLod(new Uint8Array(readFileSync(sourceFile(id, lod))), specOf(id), lod);
    expect(Buffer.compare(Buffer.from(built), readFileSync(publicFile(id, lod)))).toBe(0);
  });

  it("CA8: vertex colours are rule colours; the ball shows body and cap; fallback = last rule colour", () => {
    for (const [id, lod] of pairs) {
      const spec = specOf(id);
      const byKey = new Map(spec.rules.map((rule) => [srgbHexToLinearBytes(rule.color).join(","), rule.region]));
      const { colors } = parse(id, lod);
      const regions = new Set<string>();
      for (let i = 0; i < colors.length; i += 4) {
        const region = byKey.get([...colors.subarray(i, i + 3)].join(","));
        expect(region, `${id}.${lod} vertex ${i / 4}`).toBeDefined();
        expect(colors[i + 3]).toBe(255);
        regions.add(region as string);
      }
      if (id === "ball_01" && lod === "full") expect([...regions].sort()).toEqual(["body", "cap"]);
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
    for (const [id, lod] of pairs) {
      expect(extentOf(parse(id, lod).positions).maxRadius * ORNAMENT_WORLD_SCALE, `${id}.${lod}`).toBeLessThanOrEqual(minSpacing / 2);
    }
    expect(ORNAMENT_MODEL_RADIUS * ORNAMENT_WORLD_SCALE).toBeLessThanOrEqual(minSpacing / 2);
  });
});
