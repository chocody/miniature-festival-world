// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createKrathongAssets } from "@/components/models/loyKrathong/krathongAssets";
import {
  KRATHONG_DESIGN_ASSET_BUDGET,
  KRATHONG_DESIGN_FOOTPRINT,
  KRATHONG_DESIGN_IDS,
  KRATHONG_DESIGN_MAX_FLAMES,
} from "@/config/krathongDesigns.config";
import { KRATHONG_LODS, KRATHONG_MAX_TRIANGLES_BY_LOD, KRATHONG_RIVER_LOD_BY_TIER, type KrathongLod } from "@/config/krathongModel.config";
import { HIGH_RIVER_KRATHONG_ZONE_MAX_TRIANGLES, TIER_BUDGETS } from "@/config/performance.config";
import { parseKrathongDesignGlb } from "@/core/customization/krathongDesignGlb";
import { buildDesignLod, srgbHexToLinearBytes } from "../../scripts/krathong-models-lib.mjs";
import { FOOTPRINT, KRATHONG_MODEL_DESIGNS } from "../../scripts/krathong-models.designs.mjs";

const ROOT = process.cwd();
const PUBLIC_DIR = join(ROOT, "public/models/krathong");
const SOURCE_DIR = join(ROOT, "assets/krathong/decimated");
const publicFile = (id: string, lod: KrathongLod) => join(PUBLIC_DIR, `${id}.${lod}.glb`);
const sourceFile = (id: string, lod: KrathongLod) => join(SOURCE_DIR, `${id}.${lod}.glb`);
const bytesOf = (path: string) => new Uint8Array(readFileSync(path));
const bufferOf = (path: string): ArrayBuffer => {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const parse = (id: string, lod: KrathongLod) => parseKrathongDesignGlb(bufferOf(publicFile(id, lod)));
function jsonOf(path: string): Record<string, unknown> {
  const b = readFileSync(path);
  const length = b.readUInt32LE(12);
  return JSON.parse(b.subarray(20, 20 + length).toString("utf8")) as Record<string, unknown>;
}
const specOf = (id: string) => {
  const spec = KRATHONG_MODEL_DESIGNS.find((d) => d.id === id);
  if (!spec) throw new Error(`no design spec for ${id}`);
  return spec;
};
const pairs = KRATHONG_DESIGN_IDS.flatMap((id) => KRATHONG_LODS.map((lod) => [id, lod] as const));

describe("committed krathong model assets (MFW-65)", () => {
  it("KA1: every design × LOD has a public and a decimated file; nothing else is served", () => {
    for (const [id, lod] of pairs) {
      expect(statSync(publicFile(id, lod)).isFile(), `${id}.${lod}`).toBe(true);
      expect(statSync(sourceFile(id, lod)).isFile(), `${id}.${lod}`).toBe(true);
    }
    expect(readdirSync(PUBLIC_DIR).sort()).toEqual(pairs.map(([id, lod]) => `${id}.${lod}.glb`).sort());
    expect(KRATHONG_MODEL_DESIGNS.map((d) => d.id)).toEqual([...KRATHONG_DESIGN_IDS]);
  });

  it("KA2: size budget", () => {
    let publicTotal = 0;
    let sourceTotal = 0;
    for (const [id, lod] of pairs) {
      const size = statSync(publicFile(id, lod)).size;
      expect(size, `${id}.${lod}`).toBeLessThanOrEqual(KRATHONG_DESIGN_ASSET_BUDGET.maxFileBytes);
      publicTotal += size;
      sourceTotal += statSync(sourceFile(id, lod)).size;
    }
    expect(publicTotal).toBeLessThanOrEqual(KRATHONG_DESIGN_ASSET_BUDGET.maxPublicTotalBytes);
    expect(sourceTotal).toBeLessThanOrEqual(KRATHONG_DESIGN_ASSET_BUDGET.maxSourceTotalBytes);
  });

  it("KA3: every public file follows the contract: no materials or textures, exactly POSITION / NORMAL / COLOR_0", () => {
    for (const [id, lod] of pairs) {
      expect(() => parse(id, lod), `${id}.${lod}`).not.toThrow();
      const json = jsonOf(publicFile(id, lod));
      for (const key of ["materials", "textures", "images", "samplers"]) expect(json, `${id}.${lod}`).not.toHaveProperty(key);
      const meshes = json.meshes as { primitives: { attributes: Record<string, number> }[] }[];
      expect(Object.keys(meshes[0].primitives[0].attributes).sort()).toEqual(["COLOR_0", "NORMAL", "POSITION"]);
    }
  });

  it("KA4: triangles (body + procedural flames) within KRATHONG_MAX_TRIANGLES_BY_LOD; body full > medium > low", () => {
    const assets = createKrathongAssets();
    for (const id of KRATHONG_DESIGN_IDS) {
      const body = KRATHONG_LODS.map((lod) => parse(id, lod).indices.length / 3);
      KRATHONG_LODS.forEach((lod, i) => {
        const flame = assets.geometry("flame", lod).index!.count / 3;
        const total = body[i] + parse(id, lod).flames.length * flame;
        expect(total, `${id}.${lod}`).toBeLessThanOrEqual(KRATHONG_MAX_TRIANGLES_BY_LOD[lod]);
      });
      expect(body[0]).toBeGreaterThan(body[1]);
      expect(body[1]).toBeGreaterThan(body[2]);
    }
    assets.dispose();
  });

  it("KA4b: a full zone of any design per tier stays within MFW-48's river triangles on MEDIUM and LOW", () => {
    const MFW48_ZONE_WORST = { MEDIUM: 52_224, LOW: 26_112 } as const; // docs/perf/MFW-48.md §3 (as in krathongAssets.test.ts)
    const assets = createKrathongAssets();
    for (const id of KRATHONG_DESIGN_IDS)
      for (const tier of ["MEDIUM", "LOW"] as const) {
        const lod = KRATHONG_RIVER_LOD_BY_TIER[tier];
        const data = parse(id, lod);
        const perKrathong = data.indices.length / 3 + data.flames.length * (assets.geometry("flame", lod).index!.count / 3);
        expect(TIER_BUDGETS[tier].riverItemCap * perKrathong, `${id} ${tier}`).toBeLessThanOrEqual(MFW48_ZONE_WORST[tier]);
      }
    assets.dispose();
  });

  it("KA4c: a full HIGH zone of any design (colour + shadow pass) stays within HIGH_RIVER_KRATHONG_ZONE_MAX_TRIANGLES", () => {
    const assets = createKrathongAssets();
    const high = TIER_BUDGETS.HIGH;
    const passes = high.shadows && high.riverItemCastShadow ? 2 : 1;
    for (const id of KRATHONG_DESIGN_IDS) {
      const lod = KRATHONG_RIVER_LOD_BY_TIER.HIGH;
      const data = parse(id, lod);
      const perKrathong = data.indices.length / 3 + data.flames.length * (assets.geometry("flame", lod).index!.count / 3);
      expect(high.riverItemCap * perKrathong * passes, id).toBeLessThanOrEqual(HIGH_RIVER_KRATHONG_ZONE_MAX_TRIANGLES);
    }
    assets.dispose();
  });

  it("KA5: 1 ≤ flames ≤ KRATHONG_DESIGN_MAX_FLAMES; banana_leaf_01 has exactly one", () => {
    for (const [id, lod] of pairs) {
      const flames = parse(id, lod).flames.length;
      expect(flames, `${id}.${lod}`).toBeGreaterThanOrEqual(1);
      expect(flames, `${id}.${lod}`).toBeLessThanOrEqual(KRATHONG_DESIGN_MAX_FLAMES);
    }
    for (const lod of KRATHONG_LODS) expect(parse("banana_leaf_01", lod).flames).toHaveLength(1);
  });

  it("KA6: the script footprint is the config footprint, and every file fits it", () => {
    expect(FOOTPRINT).toEqual(KRATHONG_DESIGN_FOOTPRINT);
    for (const [id, lod] of pairs) {
      const { positions } = parse(id, lod);
      let maxR = 0;
      let minY = Infinity;
      for (let i = 0; i < positions.length; i += 3) {
        maxR = Math.max(maxR, Math.hypot(positions[i], positions[i + 2]));
        minY = Math.min(minY, positions[i + 1]);
      }
      expect(Math.abs(maxR - KRATHONG_DESIGN_FOOTPRINT.radius) / KRATHONG_DESIGN_FOOTPRINT.radius, `${id}.${lod}`).toBeLessThanOrEqual(0.01);
      expect(Math.abs(minY - KRATHONG_DESIGN_FOOTPRINT.bottomY), `${id}.${lod}`).toBeLessThanOrEqual(1e-3);
    }
  });

  it("KA7: every public file is the script's output of its committed decimated source (byte-equal)", () => {
    for (const [id, lod] of pairs) {
      const built = buildDesignLod(bytesOf(sourceFile(id, lod)), specOf(id), lod);
      expect(Buffer.compare(Buffer.from(built), readFileSync(publicFile(id, lod))), `${id}.${lod}`).toBe(0);
    }
  });

  it("KA8: every vertex colour is a rule colour; at full LOD base, leaves, flowers and candle each colour a vertex", () => {
    for (const [id, lod] of pairs) {
      const spec = specOf(id);
      const regionOf = new Map<string, Set<string>>();
      for (const rule of spec.rules) {
        const key = srgbHexToLinearBytes(rule.color).join(",");
        const set = regionOf.get(key) ?? new Set<string>();
        set.add(rule.region);
        regionOf.set(key, set);
      }
      const { colors } = parse(id, lod);
      const seen = new Set<string>();
      for (let i = 0; i < colors.length; i += 4) {
        const key = `${colors[i]},${colors[i + 1]},${colors[i + 2]}`;
        expect(regionOf.has(key), `${id}.${lod} colour ${key}`).toBe(true);
        expect(colors[i + 3]).toBe(255);
        for (const region of regionOf.get(key) ?? []) seen.add(region);
      }
      if (lod === "full") for (const region of ["base", "leaves", "flowers", "candle"]) expect(seen.has(region), `${id} ${region}`).toBe(true);
    }
  });
});
