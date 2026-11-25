// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { makeCreateBody, riverCoord } from "./__fixtures__/createCreation";
import { CREATE_CREATION_BODY_KEYS, CREATE_CREATION_OPTIONAL_BODY_KEYS } from "./createCreationTypes";
import { parseCreateCreationRequest } from "./createCreationRequest";

const fieldOf = (value: unknown): string | null => {
  const r = parseCreateCreationRequest(value);
  return r.ok ? null : r.field;
};

describe("parseCreateCreationRequest", () => {
  it("accepts a valid body and keeps the wish as sent", () => {
    const r = parseCreateCreationRequest(makeCreateBody({ wishText: "  ขอให้ทุกคนมีความสุข  " }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.request.wishText).toBe("  ขอให้ทุกคนมีความสุข  ");
    expect(Object.keys(r.request).sort()).toEqual([...CREATE_CREATION_BODY_KEYS, ...CREATE_CREATION_OPTIONAL_BODY_KEYS].sort());
    expect(parseCreateCreationRequest(makeCreateBody({ wishText: "" })).ok).toBe(true);
    expect(parseCreateCreationRequest(makeCreateBody({ wishText: "   " })).ok).toBe(true);
    const priv = parseCreateCreationRequest(makeCreateBody({ wishVisibility: "private" }));
    expect(priv.ok && priv.request.wishVisibility).toBe("private");
  });

  it("maps each failure to its field", () => {
    for (const v of [null, [], "x"]) expect(fieldOf(v)).toBe("body");
    for (const extra of ["x", "zoneId", "expiresAt", "createdAt", "ownerTokenHash"]) {
      expect(fieldOf(makeCreateBody({ [extra]: 1 }))).toBe("body");
    }
    const proto = JSON.parse(`{"__proto__":{},${JSON.stringify(makeCreateBody()).slice(1)}`) as unknown;
    expect(fieldOf(proto)).toBe("body");
    for (const key of CREATE_CREATION_BODY_KEYS) expect(fieldOf(makeCreateBody({}, [key]))).toBe(key);
    for (const e of ["nope", "LOY_KRATHONG"]) expect(fieldOf(makeCreateBody({ eventId: e }))).toBe("eventId");
    for (const c of [{ ...riverCoord(0.4), x: 1 }, { x: 1, y: 2, z: 3 }, riverCoord(1.5), { ...riverCoord(0.4), mode: "CURVE" }]) {
      expect(fieldOf(makeCreateBody({ coord: c }))).toBe("coord");
    }
    for (const w of [5, null, ["x"]]) expect(fieldOf(makeCreateBody({ wishText: w }))).toBe("wishText");
    for (const v of ["friends", "PUBLIC"]) expect(fieldOf(makeCreateBody({ wishVisibility: v }))).toBe("wishVisibility");
    const hash = createHash("sha256").update("x").digest("hex");
    for (const t of ["abc", hash, "A".repeat(44), 5]) expect(fieldOf(makeCreateBody({ ownerToken: t }))).toBe("ownerToken");
  });

  it("checks unknown keys before field values", () => {
    expect(fieldOf(makeCreateBody({ extra: 1, eventId: "nope" }))).toBe("body");
  });
});

describe("parseCreateCreationRequest displayName (MFW-62)", () => {
  it("is optional and kept as sent", () => {
    const absent = parseCreateCreationRequest(makeCreateBody());
    expect(absent.ok && absent.request.displayName).toBeNull();
    const nul = parseCreateCreationRequest(makeCreateBody({ displayName: null }));
    expect(nul.ok && nul.request.displayName).toBeNull();
    const sent = parseCreateCreationRequest(makeCreateBody({ displayName: "  สมชาย " }));
    expect(sent.ok && sent.request.displayName).toBe("  สมชาย ");
  });
  it("rejects a non-string name with the field", () => {
    for (const bad of [123, {}, true, []]) expect(fieldOf(makeCreateBody({ displayName: bad }))).toBe("displayName");
  });
  it("checks the name after the token (field order unchanged)", () => {
    expect(fieldOf(makeCreateBody({ displayName: 1, ownerToken: "short" }))).toBe("ownerToken");
  });
});
