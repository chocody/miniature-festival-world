import { describe, expect, it } from "vitest";
import { RIM_SOCKET_COUNT } from "@/config/events/loyKrathong.config";
import { DEFAULT_KRATHONG_APPEARANCE, parseKrathongAppearance } from "./krathongAppearance";
import { clearSocket, placeInSocket, type BuilderResult } from "./krathongBuilder";

const D = DEFAULT_KRATHONG_APPEARANCE;
const expectParses = (result: BuilderResult) => {
  if (result.ok) expect(parseKrathongAppearance(result.appearance).ok).toBe(true);
};

describe("placeInSocket", () => {
  it("pads and sets a flower without mutating the input", () => {
    const input = { ...D, flowers: [] };
    const result = placeInSocket(input, { part: "flower", kind: "orchid", socketId: "rim_socket_3" });
    expect(result.ok && result.appearance.flowers).toEqual([null, null, null, "orchid"]);
    expect(input.flowers).toEqual([]);
    expectParses(result);
  });
  it("replaces an existing flower", () => {
    const result = placeInSocket(D, { part: "flower", kind: "lotus", socketId: "rim_socket_0" });
    expect(result.ok && result.appearance.flowers[0]).toBe("lotus");
    expect(result.ok && result.appearance.flowers).toHaveLength(RIM_SOCKET_COUNT);
    expectParses(result);
  });
  it("refuses the candle on a rim socket", () => {
    expect(placeInSocket(D, { part: "candleAndIncense", socketId: "rim_socket_0" })).toEqual({
      ok: false,
      violation: "PART_NOT_ALLOWED_IN_SOCKET",
      socketId: "rim_socket_0",
    });
  });
  it("accepts the candle on center_socket unchanged", () => {
    const result = placeInSocket(D, { part: "candleAndIncense", socketId: "center_socket" });
    expect(result.ok && result.appearance).toEqual(D);
    expectParses(result);
  });
  it("refuses a flower on the center and on an unknown socket", () => {
    expect(placeInSocket(D, { part: "flower", kind: "lotus", socketId: "center_socket" })).toMatchObject({
      violation: "PART_NOT_ALLOWED_IN_SOCKET",
    });
    expect(placeInSocket(D, { part: "flower", kind: "lotus", socketId: "rim_socket_99" })).toMatchObject({
      violation: "UNKNOWN_SOCKET",
    });
  });
});

describe("clearSocket", () => {
  it("trims trailing nulls", () => {
    const result = clearSocket({ ...D, flowers: [null, null, null, "orchid"] }, "rim_socket_3");
    expect(result.ok && result.appearance.flowers).toEqual([]);
  });
  it("nulls an inner socket", () => {
    const result = clearSocket(D, "rim_socket_0");
    expect(result.ok && result.appearance.flowers[0]).toBeNull();
    expect(result.ok && result.appearance.flowers).toHaveLength(RIM_SOCKET_COUNT);
    expectParses(result);
  });
  it("refuses the center and unknown sockets", () => {
    expect(clearSocket(D, "center_socket")).toMatchObject({ ok: false, violation: "CANDLE_REQUIRED" });
    expect(clearSocket(D, "nope")).toMatchObject({ ok: false, violation: "UNKNOWN_SOCKET" });
  });
});
