import { SPEED_FACTOR_MAX, SPEED_FACTOR_MIN } from "./splineConstants";
import { COORD_MODES, type CoordMode, type PersistableCoord } from "./types";

/** Exact key set per mode. Anything else (x, y, z, position, ...) is rejected: invariant A. */
export const COORD_KEYS: { readonly [M in CoordMode]: readonly string[] } = {
  SPLINE_PATH: ["mode", "laneId", "spawnProgress", "speedFactor", "lateralOffset"],
  CYLINDRICAL_SURFACE: ["mode", "tierId", "angleDeg", "heightRatio"],
  PLANAR_ZONE: ["mode", "u", "v"],
};

export type CoordParseResult =
  | { readonly ok: true; readonly coord: PersistableCoord }
  | { readonly ok: false; readonly reason: string };

const fail = (reason: string): CoordParseResult => ({ ok: false, reason });

function isPlainObject(input: unknown): input is Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const proto = Object.getPrototypeOf(input);
  return proto === Object.prototype || proto === null;
}

/** Write-path gate: accepts only the PersistableCoord union, returns a fresh copy with allowed keys only. */
export function parsePersistableCoord(input: unknown): CoordParseResult {
  if (!isPlainObject(input)) return fail("coord must be a plain object");
  const mode = input.mode;
  if (typeof mode !== "string" || !(COORD_MODES as readonly string[]).includes(mode)) {
    return fail("unknown or missing mode");
  }
  const allowed = COORD_KEYS[mode as CoordMode];
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) return fail(`unknown key: ${key}`);
  }
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) return fail(`missing key: ${key}`);
    if (key === "mode") continue;
    const value = input[key];
    if (typeof value !== "number" || !Number.isFinite(value)) return fail(`${key} must be a finite number`);
  }
  const num = (key: string) => input[key] as number;
  const inRange = (key: string, min: number, max: number) => num(key) >= min && num(key) <= max;
  const isId = (key: string) => Number.isInteger(num(key)) && num(key) >= 0;

  switch (mode as CoordMode) {
    case "SPLINE_PATH":
      if (!isId("laneId")) return fail("laneId must be an integer >= 0");
      if (!inRange("spawnProgress", 0, 1)) return fail("spawnProgress out of range");
      if (!inRange("speedFactor", SPEED_FACTOR_MIN, SPEED_FACTOR_MAX)) return fail("speedFactor out of range");
      if (!inRange("lateralOffset", -0.5, 0.5)) return fail("lateralOffset out of range");
      return {
        ok: true,
        coord: {
          mode: "SPLINE_PATH",
          laneId: num("laneId"),
          spawnProgress: num("spawnProgress"),
          speedFactor: num("speedFactor"),
          lateralOffset: num("lateralOffset"),
        },
      };
    case "CYLINDRICAL_SURFACE":
      if (!isId("tierId")) return fail("tierId must be an integer >= 0");
      if (!inRange("angleDeg", 0, 360)) return fail("angleDeg out of range");
      if (!inRange("heightRatio", 0, 1)) return fail("heightRatio out of range");
      return {
        ok: true,
        coord: {
          mode: "CYLINDRICAL_SURFACE",
          tierId: num("tierId"),
          angleDeg: num("angleDeg"),
          heightRatio: num("heightRatio"),
        },
      };
    case "PLANAR_ZONE":
      if (!inRange("u", 0, 1)) return fail("u out of range");
      if (!inRange("v", 0, 1)) return fail("v out of range");
      return { ok: true, coord: { mode: "PLANAR_ZONE", u: num("u"), v: num("v") } };
  }
}

export function isPersistableCoord(input: unknown): input is PersistableCoord {
  return parsePersistableCoord(input).ok;
}
