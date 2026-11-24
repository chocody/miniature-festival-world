// @vitest-environment node
import { describe, expect, it } from "vitest";
import { makeCreateBody } from "@/services/api/__fixtures__/createCreation";
import { CREATE_CREATION_MAX_ATTEMPTS, CREATE_CREATION_REQUEST_MAX_BYTES } from "./creationWrite.config";
import { WISH_TEXT_MAX_LENGTH } from "./wish.config";

const bytes = (s: string): number => new TextEncoder().encode(s).byteLength;

describe("creationWrite.config", () => {
  it("CREATE_CREATION_MAX_ATTEMPTS is a positive integer", () => {
    expect(Number.isInteger(CREATE_CREATION_MAX_ATTEMPTS)).toBe(true);
    expect(CREATE_CREATION_MAX_ATTEMPTS).toBeGreaterThan(0);
  });

  it("the body cap fits a maximum-length wish (also JSON-escaped)", () => {
    const json = JSON.stringify(makeCreateBody({ wishText: "ก".repeat(WISH_TEXT_MAX_LENGTH) }));
    expect(bytes(json)).toBeLessThanOrEqual(CREATE_CREATION_REQUEST_MAX_BYTES);
    const escaped = json.replace(/[^\u0000-\u007f]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
    expect(bytes(escaped)).toBeLessThanOrEqual(CREATE_CREATION_REQUEST_MAX_BYTES);
  });
});
