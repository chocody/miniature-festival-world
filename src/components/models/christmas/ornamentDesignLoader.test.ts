// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeGlb } from "../../../../scripts/krathong-models-lib.mjs";
import { getKrathongModelLoadStatus, resetKrathongDesignLoaderForTests } from "../loyKrathong/krathongDesignLoader";
import {
  getOrnamentModelLoadStatus,
  loadOrnamentDesign,
  resetOrnamentDesignLoaderForTests,
  subscribeOrnamentModelLoads,
} from "./ornamentDesignLoader";

function glbBuffer(): ArrayBuffer {
  const bytes = writeGlb(
    {
      positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      colors: new Uint8Array(12).fill(255),
      indices: [0, 1, 2],
    },
    { extras: { ornamentHook: [0, 1, 0] } },
  );
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const okResponse = () => ({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(glbBuffer()) });

beforeEach(() => {
  resetOrnamentDesignLoaderForTests();
  resetKrathongDesignLoaderForTests();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ornament design loader (MFW-101)", () => {
  it("OL1: one fetch and one promise per (design, lod)", async () => {
    const fetchMock = vi.fn((url: string) => {
      void url;
      return Promise.resolve(okResponse());
    });
    vi.stubGlobal("fetch", fetchMock);
    const a = loadOrnamentDesign("ball_01", "low");
    const b = loadOrnamentDesign("ball_01", "low");
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/models/christmas/ball_01.low.glb");
    expect((await a).hook).toEqual({ x: 0, y: 1, z: 0 });
  });

  it("OL2: HTTP 500 rejects; status loading → failed; never logs", async () => {
    const error = vi.spyOn(console, "error");
    const warn = vi.spyOn(console, "warn");
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 500, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) })));
    const seen: string[] = [];
    subscribeOrnamentModelLoads(() => seen.push(getOrnamentModelLoadStatus()));
    const load = loadOrnamentDesign("star_01", "full");
    expect(getOrnamentModelLoadStatus()).toBe("loading");
    await expect(load).rejects.toThrow(/ornament model \/models\/christmas\/star_01\.full\.glb: HTTP 500/);
    await Promise.resolve();
    expect(getOrnamentModelLoadStatus()).toBe("failed");
    expect(seen).toEqual(["loading", "failed"]);
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("OL3: ornament loads leave the krathong status alone", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(okResponse())));
    await loadOrnamentDesign("bow_01", "medium");
    await Promise.resolve();
    expect(getOrnamentModelLoadStatus()).toBe("ready");
    expect(getKrathongModelLoadStatus()).toBe("idle");
  });
});
