// @vitest-environment node
import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  COORD_KEYS,
  isPersistableCoord,
  parsePersistableCoord,
  type PersistableCoord,
  type SplineWorldPlacement,
} from "./index";

const spline = { mode: "SPLINE_PATH", laneId: 1, spawnProgress: 0.5, speedFactor: 0.008, lateralOffset: 0.25 };
const cyl = { mode: "CYLINDRICAL_SURFACE", tierId: 2, angleDeg: 90, heightRatio: 0.5 };
const planar = { mode: "PLANAR_ZONE", u: 0.3, v: 0.7 };

describe("parsePersistableCoord: accepts", () => {
  it.each([spline, cyl, planar])("valid %o", (c) => {
    const r = parsePersistableCoord(c);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.coord).toEqual(c);
      expect(r.coord).not.toBe(c);
      expect(Object.keys(r.coord)).toEqual([...COORD_KEYS[c.mode as keyof typeof COORD_KEYS]]);
    }
  });

  it.each([
    { ...spline, spawnProgress: 0, lateralOffset: -0.5, speedFactor: 0 },
    { ...spline, spawnProgress: 1, lateralOffset: 0.5 },
    { ...spline, speedFactor: 1 },
    { ...cyl, angleDeg: 360, heightRatio: 0 },
    { ...cyl, angleDeg: 0, heightRatio: 1 },
    { ...planar, u: 0, v: 1 },
  ])("boundary values %o", (c) => {
    expect(isPersistableCoord(c)).toBe(true);
  });

  it.each([spline, cyl, planar])("survives a JSON round trip: %o", (c) => {
    const r = parsePersistableCoord(JSON.parse(JSON.stringify(c)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.coord).toEqual(c);
  });
});

describe("parsePersistableCoord: rejects", () => {
  const bad: [string, unknown][] = [
    ["raw xyz", { x: 1, y: 2, z: 3 }],
    ["spline + x", { ...spline, x: 1 }],
    ["spline + position", { ...spline, position: { x: 1, y: 2, z: 3 } }],
    ["array", [1, 2, 3]],
    ["Vector3", new Vector3(1, 2, 3)],
    ["null", null],
    ["undefined", undefined],
    ["string", "SPLINE_PATH"],
    ["unknown mode", { ...spline, mode: "XYZ" }],
    ["missing mode", { laneId: 1, spawnProgress: 0, speedFactor: 0, lateralOffset: 0 }],
    ["missing field", { mode: "SPLINE_PATH", laneId: 1, spawnProgress: 0, speedFactor: 0 }],
    ["string number", { ...spline, lateralOffset: "0.5" }],
    ["NaN", { ...spline, spawnProgress: NaN }],
    ["Infinity", { ...spline, speedFactor: Infinity }],
    ["spawn 1.01", { ...spline, spawnProgress: 1.01 }],
    ["spawn -0.01", { ...spline, spawnProgress: -0.01 }],
    ["lateral -0.51", { ...spline, lateralOffset: -0.51 }],
    ["lateral 0.51", { ...spline, lateralOffset: 0.51 }],
    ["speed -0.001", { ...spline, speedFactor: -0.001 }],
    ["speed 1.0000001", { ...spline, speedFactor: 1.0000001 }],
    ["speed 1e300", { ...spline, speedFactor: 1e300 }],
    ["speed 1e308", { ...spline, speedFactor: 1e308 }],
    ["angle 360.1", { ...cyl, angleDeg: 360.1 }],
    ["angle -1", { ...cyl, angleDeg: -1 }],
    ["height -0.01", { ...cyl, heightRatio: -0.01 }],
    ["height 1.01", { ...cyl, heightRatio: 1.01 }],
    ["u 2", { ...planar, u: 2 }],
    ["u -0.1", { ...planar, u: -0.1 }],
    ["v 1.5", { ...planar, v: 1.5 }],
    ["laneId 1.5", { ...spline, laneId: 1.5 }],
    ["laneId -1", { ...spline, laneId: -1 }],
    ["tierId -1", { ...cyl, tierId: -1 }],
    ["tierId 0.5", { ...cyl, tierId: 0.5 }],
  ];
  it.each(bad)("%s", (_name, input) => {
    const r = parsePersistableCoord(input);
    expect(r.ok).toBe(false);
    expect(isPersistableCoord(input)).toBe(false);
  });

  it("names the failing field", () => {
    const r = parsePersistableCoord({ ...spline, x: 1 });
    expect(r.ok === false && r.reason).toBe("unknown key: x");
    const r2 = parsePersistableCoord({ ...spline, lateralOffset: 0.9 });
    expect(r2.ok === false && r2.reason).toBe("lateralOffset out of range");
  });
});

describe("type level: no raw xyz is a PersistableCoord (enforced by pnpm typecheck)", () => {
  it("rejects raw xyz at compile time and runtime", () => {
    // @ts-expect-error raw world xyz is not a PersistableCoord
    const raw: PersistableCoord = { x: 1, y: 2, z: 3 };
    expect(parsePersistableCoord(raw).ok).toBe(false);
  });

  it("rejects a derived world placement at compile time and runtime", () => {
    const placement: SplineWorldPlacement = {
      position: { x: 1, y: 0, z: 2 },
      centerline: { x: 1, y: 0, z: 0 },
      tangent: { x: 1, y: 0, z: 0 },
      right: { x: 0, y: 0, z: 1 },
      yawRad: 0,
    };
    // @ts-expect-error a derived world placement is not a PersistableCoord
    const asCoord: PersistableCoord = placement;
    expect(parsePersistableCoord(asCoord).ok).toBe(false);
  });
});
