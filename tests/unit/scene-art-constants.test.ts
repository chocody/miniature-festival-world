// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["src/components/canvas3d", "src/components/models", "src/components/canvas2d"];
const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/;
const DECIMAL_LITERAL = /(?<![\w.$])\d+\.\d+/;
const TEXTURE_API = /TextureLoader|useTexture|CanvasTexture|DataTexture|VideoTexture/;

function sceneFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sceneFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("scene art constants live in src/config", () => {
  it("positive control: each pattern matches a sample", () => {
    expect(HEX_COLOR.test('color="#ffd166"')).toBe(true);
    expect(DECIMAL_LITERAL.test("zoom = 0.5")).toBe(true);
    expect(TEXTURE_API.test("new TextureLoader()")).toBe(true);
    expect(DECIMAL_LITERAL.test("MFW-27 and v1.2")).toBe(false);
  });

  it("scene component files hold no hex colours, decimal literals or texture loaders", () => {
    const files = ROOTS.flatMap(sceneFiles);
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      return HEX_COLOR.test(source) || DECIMAL_LITERAL.test(source) || TEXTURE_API.test(source);
    });
    expect(offenders).toEqual([]);
  });
});
