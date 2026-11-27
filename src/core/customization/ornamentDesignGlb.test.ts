// @vitest-environment node
import { describe, expect, it } from "vitest";
import { writeGlb } from "../../../scripts/krathong-models-lib.mjs";
import { KrathongGlbError, parseKrathongDesignGlb } from "./krathongDesignGlb";
import { OrnamentGlbError, parseOrnamentDesignGlb } from "./ornamentDesignGlb";

const MESH = {
  positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  colors: Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]),
  indices: [0, 1, 2],
};

function glb(extras: Record<string, unknown> | null): ArrayBuffer {
  const bytes = writeGlb(MESH, { generator: "mfw scripts/christmas-models.mjs", extras });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Re-encodes the JSON chunk after `edit` (keeps the BIN chunk). */
function withJson(source: ArrayBuffer, edit: (json: Record<string, unknown>) => void): ArrayBuffer {
  const src = new Uint8Array(source);
  const view = new DataView(src.buffer);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(src.subarray(20, 20 + jsonLength))) as Record<string, unknown>;
  edit(json);
  let text = JSON.stringify(json);
  while (text.length % 4 !== 0) text += " ";
  const jsonBytes = new TextEncoder().encode(text);
  const bin = src.subarray(20 + jsonLength);
  const out = new Uint8Array(20 + jsonBytes.length + bin.length);
  out.set(src.subarray(0, 20));
  out.set(jsonBytes, 20);
  out.set(bin, 20 + jsonBytes.length);
  const v = new DataView(out.buffer);
  v.setUint32(8, out.length, true);
  v.setUint32(12, jsonBytes.length, true);
  return out.buffer;
}

type Primitive = { attributes: Record<string, number> };

describe("parseOrnamentDesignGlb (MFW-101)", () => {
  it("OG1: parses the hook; the arrays are views on the input", () => {
    const input = glb({ ornamentHook: [0, 0.98, 0] });
    const data = parseOrnamentDesignGlb(input);
    expect(data.hook).toEqual({ x: 0, y: 0.98, z: 0 });
    expect(data.positions.buffer).toBe(input);
    expect(data.indices.length).toBe(3);
    expect(Object.isFrozen(data)).toBe(true);
  });

  it("OG2: the hook is optional; other extras keys are ignored", () => {
    expect(parseOrnamentDesignGlb(glb(null)).hook).toBeNull();
    expect(parseOrnamentDesignGlb(glb({ krathongFlames: [] })).hook).toBeNull();
  });

  it.each([[[0, 1]], [["a", 0, 0]], [{ x: 0 }], [[0, 1, 0, 2]]])("OG3: ornamentHook %j is rejected", (hook) => {
    const parse = () => parseOrnamentDesignGlb(glb({ ornamentHook: hook }));
    expect(parse).toThrow(OrnamentGlbError);
    expect(parse).toThrow(/ornamentHook/);
  });

  it("OG4: the shared contract checks fail with OrnamentGlbError", () => {
    const withMaterials = withJson(glb(null), (json) => {
      json.materials = [{}];
    });
    expect(() => parseOrnamentDesignGlb(withMaterials)).toThrow(OrnamentGlbError);
    expect(() => parseOrnamentDesignGlb(withMaterials)).toThrow(/no materials/);
    const noColor = withJson(glb(null), (json) => {
      delete ((json.meshes as { primitives: Primitive[] }[])[0].primitives[0].attributes as Record<string, number>).COLOR_0;
    });
    expect(() => parseOrnamentDesignGlb(noColor)).toThrow(/missing COLOR_0/);
    const badMagic = glb(null);
    new DataView(badMagic).setUint32(0, 0, true);
    expect(() => parseOrnamentDesignGlb(badMagic)).toThrow(OrnamentGlbError);
    expect(() => parseOrnamentDesignGlb(badMagic)).toThrow(/wrong magic/);
    try {
      parseOrnamentDesignGlb(badMagic);
    } catch (error) {
      expect((error as Error).name).toBe("OrnamentGlbError");
      expect((error as Error).message).toBe("ornament design GLB: wrong magic");
    }
  });

  it("OG5: a krathong GLB still needs its flames", () => {
    const parse = () => parseKrathongDesignGlb(glb(null));
    expect(parse).toThrow(KrathongGlbError);
    expect(parse).toThrow(/krathongFlames is missing/);
  });
});
