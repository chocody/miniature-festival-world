// @vitest-environment node
import { describe, expect, it } from "vitest";
import { writeGlb } from "../../../scripts/krathong-models-lib.mjs";
import { KRATHONG_DESIGN_MAX_FLAMES } from "@/config/krathongDesigns.config";
import { KrathongGlbError, parseKrathongDesignGlb } from "./krathongDesignGlb";

const POSITIONS = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
const NORMALS = Float32Array.from([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
const COLORS = Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 10, 20, 30, 255]);
const INDICES = Uint32Array.from([0, 1, 2, 0, 2, 3]);
const FLAMES = [[0.1, 1, -0.2, 0.4, 0.12]];

function glb(): ArrayBuffer {
  const bytes = writeGlb({ positions: POSITIONS, normals: NORMALS, colors: COLORS, indices: INDICES, flames: FLAMES });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Re-encodes the JSON chunk after `edit` (keeps the BIN chunk). */
function withJson(edit: (json: Record<string, unknown>) => void): ArrayBuffer {
  const src = new Uint8Array(glb());
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

describe("parseKrathongDesignGlb (MFW-65)", () => {
  it("KG1: parses a GLB written by the script", () => {
    const data = parseKrathongDesignGlb(glb());
    expect([...data.positions]).toEqual([...POSITIONS]);
    expect([...data.normals]).toEqual([...NORMALS]);
    expect([...data.colors]).toEqual([...COLORS]);
    expect([...data.indices]).toEqual([...INDICES]);
    expect(data.indices).toBeInstanceOf(Uint16Array);
    expect(data.flames).toEqual([{ x: 0.1, y: 1, z: -0.2, height: 0.4, radius: 0.12 }]);
  });

  it("KG2: rejects wrong magic, version 1, missing COLOR_0, a textures key and a truncated buffer", () => {
    const wrongMagic = glb();
    new DataView(wrongMagic).setUint32(0, 0x12345678, true);
    const version1 = glb();
    new DataView(version1).setUint32(4, 1, true);
    const noColor = withJson((json) => {
      const meshes = json.meshes as { primitives: { attributes: Record<string, number> }[] }[];
      delete meshes[0].primitives[0].attributes.COLOR_0;
    });
    const textures = withJson((json) => {
      json.textures = [];
    });
    const truncated = glb().slice(0, 100);
    for (const [name, buffer] of [["magic", wrongMagic], ["version", version1], ["COLOR_0", noColor], ["textures", textures], ["truncated", truncated]] as const) {
      expect(() => parseKrathongDesignGlb(buffer), name).toThrow(KrathongGlbError);
    }
    expect(() => parseKrathongDesignGlb(noColor)).toThrow(/COLOR_0/);
    const negativeCount = withJson((json) => {
      (json.accessors as { count: number }[])[0].count = -3;
    });
    const negativeOffset = withJson((json) => {
      (json.accessors as { byteOffset?: number }[])[1].byteOffset = -12;
    });
    const tooManyFlames = withJson((json) => {
      const meshes = json.meshes as { extras: { krathongFlames: number[][] } }[];
      meshes[0].extras.krathongFlames = Array.from({ length: KRATHONG_DESIGN_MAX_FLAMES + 1 }, () => [0, 1, 0, 0.4, 0.1]);
    });
    expect(() => parseKrathongDesignGlb(negativeCount)).toThrow(KrathongGlbError);
    expect(() => parseKrathongDesignGlb(negativeOffset)).toThrow(KrathongGlbError);
    expect(() => parseKrathongDesignGlb(tooManyFlames)).toThrow(/flames/);
    expect(() => parseKrathongDesignGlb(textures)).toThrow(/textures/);
  });

  it("KG3: the arrays are views on the input buffer", () => {
    const buffer = glb();
    const data = parseKrathongDesignGlb(buffer);
    expect(data.positions.buffer).toBe(buffer);
    expect(data.normals.buffer).toBe(buffer);
    expect(data.colors.buffer).toBe(buffer);
    expect(data.indices.buffer).toBe(buffer);
  });
});
