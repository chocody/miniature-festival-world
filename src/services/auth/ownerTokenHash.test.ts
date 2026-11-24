// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateDeviceOwnerToken, type DeviceOwnerToken } from "./deviceOwnerToken";
import { hashOwnerToken, isOwnerTokenHash } from "./ownerTokenHash";

describe("hashOwnerToken", () => {
  it("known vector", async () => {
    expect(await hashOwnerToken("A".repeat(43) as DeviceOwnerToken)).toBe(
      "0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a",
    );
  });

  it("second vector", async () => {
    expect(await hashOwnerToken("AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8" as DeviceOwnerToken)).toBe(
      "ea866a757e4c38babfa8127cbe9a409d3e1f93a00ff1488ff735fcf917afffd0",
    );
  });

  it("matches node:crypto for 20 generated tokens", async () => {
    for (let i = 0; i < 20; i++) {
      const token = generateDeviceOwnerToken();
      expect(await hashOwnerToken(token)).toBe(createHash("sha256").update(token, "utf8").digest("hex"));
    }
  });

  it("format", async () => {
    const token = generateDeviceOwnerToken();
    const hash = await hashOwnerToken(token);
    expect(isOwnerTokenHash(hash)).toBe(true);
    expect(hash).not.toBe(token);
  });

  it("deterministic and distinct", async () => {
    const a = generateDeviceOwnerToken();
    const b = generateDeviceOwnerToken();
    expect(await hashOwnerToken(a)).toBe(await hashOwnerToken(a));
    expect(await hashOwnerToken(a)).not.toBe(await hashOwnerToken(b));
  });

  it("rejects malformed input", async () => {
    const validHash = await hashOwnerToken(generateDeviceOwnerToken());
    for (const bad of ["not-a-token", "A".repeat(64), validHash]) {
      await expect(hashOwnerToken(bad as DeviceOwnerToken)).rejects.toThrow(TypeError);
    }
  });

  it("error message does not echo the input", async () => {
    let message = "";
    try {
      await hashOwnerToken("leak-check-SECRET-VALUE" as DeviceOwnerToken);
    } catch (err) {
      message = String((err as Error).message);
    }
    expect(message).not.toBe("");
    expect(message).not.toContain("SECRET");
  });
});

describe("isOwnerTokenHash", () => {
  it("accepts lowercase hex and rejects the rest", () => {
    expect(isOwnerTokenHash("a".repeat(64))).toBe(true);
    expect(isOwnerTokenHash("A".repeat(64))).toBe(false);
    expect(isOwnerTokenHash("a".repeat(63))).toBe(false);
    expect(isOwnerTokenHash("a".repeat(65))).toBe(false);
    expect(isOwnerTokenHash(generateDeviceOwnerToken())).toBe(false);
    expect(isOwnerTokenHash(123)).toBe(false);
    expect(isOwnerTokenHash(null)).toBe(false);
  });
});
