import { describe, expect, it } from "vitest";
import { RIM_SOCKET_COUNT } from "@/config/events/loyKrathong.config";
import { DEFAULT_KRATHONG_APPEARANCE } from "./krathongAppearance";
import {
  appearanceToSocketAssignments,
  KRATHONG_SOCKETS,
  rimSocketId,
  validateSocketAssignments,
  validateSocketPlacement,
} from "./sockets";
import type { SocketAssignment } from "./types";

const rimIds = Array.from({ length: RIM_SOCKET_COUNT }, (_, i) => rimSocketId(i));
const candle = (socketId: string): SocketAssignment => ({ part: "candleAndIncense", socketId });
const flower = (socketId: string): SocketAssignment => ({ part: "flower", socketId });

describe("socket layout", () => {
  it("has one center socket and the rim sockets", () => {
    expect(KRATHONG_SOCKETS).toHaveLength(1 + RIM_SOCKET_COUNT);
    expect(KRATHONG_SOCKETS.map((s) => s.id)).toEqual(["center_socket", ...rimIds]);
    expect(rimIds[0]).toBe("rim_socket_0");
    expect(rimIds.at(-1)).toBe(`rim_socket_${RIM_SOCKET_COUNT - 1}`);
    const [center, ...rims] = KRATHONG_SOCKETS;
    expect(center.orientation).toBe("upright");
    expect(center.accepts).toBe("candleAndIncense");
    rims.forEach((rim, i) => {
      expect(rim.angleDeg).toBe((i * 360) / RIM_SOCKET_COUNT);
      expect(rim.accepts).toBe("flower");
      expect(rim.orientation).toBe("outward");
    });
  });

  it("rimSocketId rejects out-of-range indices", () => {
    expect(rimSocketId(0)).toBe("rim_socket_0");
    for (const bad of [RIM_SOCKET_COUNT, -1, 1.5]) expect(() => rimSocketId(bad)).toThrow(RangeError);
  });
});

describe("validateSocketPlacement", () => {
  it("accepts the candle only on center_socket", () => {
    expect(validateSocketPlacement(candle("center_socket"))).toEqual({ ok: true });
  });
  it.each(rimIds)("rejects the candle on %s", (id) => {
    expect(validateSocketPlacement(candle(id))).toEqual({
      ok: false,
      violation: "PART_NOT_ALLOWED_IN_SOCKET",
      socketId: id,
    });
  });
  it("rejects a flower on center_socket and accepts it on a rim socket", () => {
    expect(validateSocketPlacement(flower("center_socket"))).toMatchObject({
      ok: false,
      violation: "PART_NOT_ALLOWED_IN_SOCKET",
    });
    expect(validateSocketPlacement(flower(rimSocketId(RIM_SOCKET_COUNT - 1)))).toEqual({ ok: true });
  });
  it.each(["rim_socket_8", "rim_socket_-1", "rim_socket_01", "", "__proto__", "toString", "CENTER_SOCKET"])(
    "treats %j as an unknown socket",
    (id) => {
      for (const assignment of [candle(id), flower(id)]) {
        expect(validateSocketPlacement(assignment)).toEqual({ ok: false, violation: "UNKNOWN_SOCKET", socketId: id });
      }
    },
  );
});

describe("validateSocketAssignments", () => {
  it("requires a candle", () => {
    expect(validateSocketAssignments([])).toEqual({ ok: false, violation: "CANDLE_REQUIRED", socketId: "center_socket" });
    expect(validateSocketAssignments([flower("rim_socket_0")])).toMatchObject({ violation: "CANDLE_REQUIRED" });
  });
  it("accepts the candle alone and with every rim socket filled", () => {
    expect(validateSocketAssignments([candle("center_socket")])).toEqual({ ok: true });
    expect(validateSocketAssignments([candle("center_socket"), ...rimIds.map(flower)])).toEqual({ ok: true });
  });
  it("rejects occupied sockets", () => {
    expect(
      validateSocketAssignments([candle("center_socket"), flower("rim_socket_2"), flower("rim_socket_2")]),
    ).toEqual({ ok: false, violation: "SOCKET_OCCUPIED", socketId: "rim_socket_2" });
    expect(validateSocketAssignments([candle("center_socket"), candle("center_socket")])).toEqual({
      ok: false,
      violation: "SOCKET_OCCUPIED",
      socketId: "center_socket",
    });
  });
  it("returns the first failure", () => {
    expect(validateSocketAssignments([candle("rim_socket_0")])).toMatchObject({
      violation: "PART_NOT_ALLOWED_IN_SOCKET",
    });
  });
});

describe("appearanceToSocketAssignments", () => {
  it("maps the candle and every non-null flower", () => {
    expect(
      appearanceToSocketAssignments({ ...DEFAULT_KRATHONG_APPEARANCE, flowers: ["orchid", null, "lotus"] }),
    ).toEqual([candle("center_socket"), flower("rim_socket_0"), flower("rim_socket_2")]);
  });
});
