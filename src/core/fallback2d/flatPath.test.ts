// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  bladePath,
  circlePath,
  convexHull2D,
  ellipsePath,
  formatPathNumber,
  polygonPath,
  roundedPolygonPath,
  smoothClosedPath,
  smoothOpenPath,
} from "./flatPath";

const p = (x: number, y: number) => ({ x, y });
const SQUARE = [p(0, 0), p(1, 0), p(1, 1), p(0, 1)];
const count = (d: string, cmd: string) => d.split(" ").filter((t) => t === cmd).length;

describe("flatPath (MFW-51)", () => {
  it("T8 formats numbers with FLAT_PATH_DECIMALS and no negative zero", () => {
    expect(formatPathNumber(1.23456)).toBe("1.235");
    expect(formatPathNumber(-0.0001)).toBe("0");
    expect(formatPathNumber(2)).toBe("2");
  });

  it("T9 polygon", () => {
    expect(polygonPath([p(0, 0), p(1, 0), p(1, 1)])).toBe("M 0 0 L 1 0 L 1 1 Z");
  });

  it("T10 open Catmull-Rom", () => {
    expect(smoothOpenPath([p(0, 0), p(1, 0), p(2, 0)])).toBe("M 0 0 C 0.167 0 0.667 0 1 0 C 1.333 0 1.833 0 2 0");
  });

  it("T11 closed Catmull-Rom", () => {
    const d = smoothClosedPath(SQUARE);
    expect(d.startsWith("M 0 0 C 0.167 -0.167 0.833 -0.167 1 0")).toBe(true);
    expect(count(d, "C")).toBe(4);
    expect(d.endsWith(" Z")).toBe(true);
  });

  it("T12 rounded polygon", () => {
    expect(roundedPolygonPath(SQUARE, 0.1)).toBe(
      "M 0.1 0 L 0.9 0 Q 1 0 1 0.1 L 1 0.9 Q 1 1 0.9 1 L 0.1 1 Q 0 1 0 0.9 L 0 0.1 Q 0 0 0.1 0 Z",
    );
    expect(roundedPolygonPath(SQUARE, 0)).toBe("M 0 0 L 1 0 Q 1 0 1 0 L 1 1 Q 1 1 1 1 L 0 1 Q 0 1 0 1 L 0 0 Q 0 0 0 0 Z");
  });

  it("T13 blade: pointed base and tip", () => {
    const d = bladePath([p(0, 0), p(-1, -1), p(0, -3), p(1, -1)], 2);
    expect(d.startsWith("M 0 0")).toBe(true);
    expect(d).toContain(" 0 -3 C");
    expect(d.endsWith(" Z")).toBe(true);
    expect(count(d, "C")).toBe(4);
  });

  it("T14 convex hull and circle", () => {
    const hull = convexHull2D([...SQUARE, p(0.5, 0.5), p(0.5, 0)]);
    expect(hull).toHaveLength(4);
    expect(new Set(hull.map((q) => `${q.x},${q.y}`))).toEqual(new Set(["0,0", "1,0", "1,1", "0,1"]));
    expect(convexHull2D([p(1, 1), p(1, 1), p(2, 2)])).toEqual([p(1, 1), p(2, 2)]);
    expect(circlePath(0, 0, 1)).toBe("M -1 0 A 1 1 0 1 0 1 0 A 1 1 0 1 0 -1 0 Z");
    expect(ellipsePath(0, 0, 2, 1)).toBe("M -2 0 A 2 1 0 1 0 2 0 A 2 1 0 1 0 -2 0 Z");
  });

  it("T15 rejects bad input", () => {
    expect(() => polygonPath([p(0, 0), p(1, 0)])).toThrow(RangeError);
    expect(() => smoothOpenPath([p(0, 0)])).toThrow(RangeError);
    expect(() => bladePath([p(0, 0), p(-1, -1), p(0, -3), p(1, -1)], 0)).toThrow(RangeError);
    expect(() => polygonPath([p(0, 0), p(1, Number.NaN), p(1, 1)])).toThrow(RangeError);
    expect(() => convexHull2D([p(Number.POSITIVE_INFINITY, 0)])).toThrow(RangeError);
  });
});
