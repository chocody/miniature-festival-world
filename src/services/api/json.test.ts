// @vitest-environment node
import { describe, expect, it } from "vitest";
import { APPEARANCE_FIXTURE } from "./__fixtures__/creations";
import { isJsonObject, isPlainObject } from "./json";

class Thing {
  a = 1;
}

describe("isJsonObject", () => {
  it("accepts plain JSON objects", () => {
    expect(isJsonObject({})).toBe(true);
    expect(isJsonObject(APPEARANCE_FIXTURE)).toBe(true);
    expect(isJsonObject({ a: [1, { b: null }, [null]], c: { d: "x" } })).toBe(true);
  });

  it("rejects everything else", () => {
    const cyc: Record<string, unknown> = {};
    cyc.self = cyc;
    const bad: unknown[] = [
      null,
      [],
      "x",
      { a: undefined },
      { a: NaN },
      { a: Infinity },
      { a: new Date() },
      { a: () => 1 },
      { a: BigInt(1) },
      new Map(),
      new Thing(),
      cyc,
    ];
    for (const value of bad) expect(isJsonObject(value)).toBe(false);
  });

  it("accepts a shared (non-cyclic) reference twice", () => {
    const shared = { n: 1 };
    expect(isJsonObject({ a: shared, b: shared })).toBe(true);
  });

  it("isPlainObject accepts a null-prototype object", () => {
    expect(isPlainObject(Object.create(null))).toBe(true);
  });
});
