// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getBrowserLocalStorage, getDeviceOwnerVault } from "./deviceOwnerToken";

describe("deviceOwnerToken on the server", () => {
  it("getDeviceOwnerVault throws on the server", () => {
    expect(() => getDeviceOwnerVault()).toThrow(/client-only/);
  });

  it("getBrowserLocalStorage returns null on the server", () => {
    expect(getBrowserLocalStorage()).toBeNull();
  });
});
