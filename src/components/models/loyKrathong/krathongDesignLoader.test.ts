// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeGlb } from "../../../../scripts/krathong-models-lib.mjs";
import {
  getKrathongModelLoadStatus,
  loadKrathongDesign,
  resetKrathongDesignLoaderForTests,
  subscribeKrathongModelLoads,
} from "./krathongDesignLoader";

function glbBuffer(): ArrayBuffer {
  const bytes = writeGlb({
    positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: Float32Array.from([0, 1, 0, 0, 1, 0, 0, 1, 0]),
    colors: new Uint8Array(12).fill(255),
    indices: [0, 1, 2],
    flames: [[0, 1, 0, 0.4, 0.1]],
  });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function okResponse() {
  return { ok: true, status: 200, arrayBuffer: () => Promise.resolve(glbBuffer()) };
}

beforeEach(() => resetKrathongDesignLoaderForTests());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("krathong design loader (MFW-65)", () => {
  it("KL1: one fetch and one promise per (design, lod)", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(okResponse()));
    vi.stubGlobal("fetch", fetchMock);
    const a = loadKrathongDesign("banana_leaf_01", "full");
    const b = loadKrathongDesign("banana_leaf_01", "full");
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const data = await a;
    expect(data.flames).toHaveLength(1);
    loadKrathongDesign("banana_leaf_01", "full");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("KL2: status idle → loading → ready, the listener called on each change", async () => {
    let release: (value: ReturnType<typeof okResponse>) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => (release = resolve))));
    const seen: string[] = [];
    subscribeKrathongModelLoads(() => seen.push(getKrathongModelLoadStatus()));
    expect(getKrathongModelLoadStatus()).toBe("idle");
    const load = loadKrathongDesign("banana_leaf_01", "low");
    expect(getKrathongModelLoadStatus()).toBe("loading");
    release(okResponse());
    await load;
    await Promise.resolve();
    expect(getKrathongModelLoadStatus()).toBe("ready");
    expect(seen).toEqual(["loading", "ready"]);
  });

  it("KL3: HTTP 404 rejects, status failed, nothing logged", async () => {
    const error = vi.spyOn(console, "error");
    const warn = vi.spyOn(console, "warn");
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 404, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) })));
    await expect(loadKrathongDesign("banana_leaf_01", "medium")).rejects.toThrow("krathong model /models/krathong/banana_leaf_01.medium.glb: HTTP 404");
    await Promise.resolve();
    expect(getKrathongModelLoadStatus()).toBe("failed");
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("KL4: fetches the design URL", async () => {
    const fetchMock = vi.fn((url: string) => {
      void url;
      return Promise.resolve(okResponse());
    });
    vi.stubGlobal("fetch", fetchMock);
    await loadKrathongDesign("banana_leaf_01", "medium");
    expect(fetchMock.mock.calls[0][0]).toBe("/models/krathong/banana_leaf_01.medium.glb");
  });
});
