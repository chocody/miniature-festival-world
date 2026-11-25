// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createMyCreationsVault, getMyCreationsVault } from "./myCreationsVault";

describe("myCreationsVault on the server", () => {
  it("getMyCreationsVault throws; a null-storage vault still works", () => {
    expect(() => getMyCreationsVault()).toThrow();
    expect(createMyCreationsVault({ storage: null }).list("loy_krathong", 0)).toEqual([]);
  });
});
