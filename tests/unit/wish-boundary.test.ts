// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

const WISH_FILES = [
  "src/config/wish.config.ts",
  "src/services/api/wishPayload.ts",
  "src/store/useBuilderStore.ts",
  "src/components/ui/WishModal.tsx",
  "src/services/api/wishComposer.ts",
  "src/components/ui/WishVisibilitySwitch.tsx",
];
/** The wish never leaves the device in this card (MFW-23 / MFW-45 send it). */
const IO = /\bfetch\(|localStorage|sessionStorage|indexedDB|document\.cookie|sendBeacon|XMLHttpRequest|\bconsole\./;
/** No owner token here (decision 1: only the save flow sends it). */
const AUTH_IMPORT = /from\s+["']@\/services\/auth/;
/** Same pattern as CustomizerPanel.boundary.test.ts: keep the landing bundle free of 3D code. */
const THREE_D =
  /from\s+["'](three|@react-three\/[^"']+|@react-spring\/[^"']+|@\/components\/canvas3d[^"']*|@\/components\/models\/[^"']+)["']/;

describe("wish boundary (invariants C, G)", () => {
  it("scanner patterns detect samples", () => {
    expect(IO.test("window.localStorage.setItem(k, v)")).toBe(true);
    expect(IO.test("await fetch(url)")).toBe(true);
    expect(IO.test("const total = 1")).toBe(false);
    expect(AUTH_IMPORT.test('import { getDeviceOwnerVault } from "@/services/auth"')).toBe(true);
    expect(THREE_D.test('import { animated } from "@react-spring/three"')).toBe(true);
  });

  it.each(WISH_FILES)("%s does no I/O, logs nothing and imports no token or 3D code", (file) => {
    const src = read(file);
    expect(IO.test(src)).toBe(false);
    expect(AUTH_IMPORT.test(src)).toBe(false);
    expect(THREE_D.test(src)).toBe(false);
  });

  it("wishPayload stays pure (no React, no store, no clock)", () => {
    const src = read("src/services/api/wishPayload.ts");
    expect(src).not.toMatch(/from\s+["'](react|zustand|@\/store\/[^"']+)["']|Date\.now|Math\.random/);
  });

  it("FlowRoot renders the ownership notice only through the modal", () => {
    expect(read("src/components/ui/FlowRoot.tsx")).not.toMatch(/OwnershipNotice/);
    expect(read("src/components/ui/WishModal.tsx")).toMatch(/<OwnershipNotice \/>/);
  });
});
