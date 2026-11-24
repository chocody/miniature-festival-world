// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const files = [
  ...["types", "sockets", "krathongAppearance", "krathongBuilder", "krathongAssetKeys", "krathongAssembler", "appearanceRegistry", "krathongChoices", "partChangeBounce", "index"].map(
    (name) => `src/core/customization/${name}.ts`,
  ),
  "src/config/events/loyKrathong.config.ts",
  "src/config/krathongModel.config.ts",
  "src/config/customizer.config.ts",
];

describe("server-usable customization modules", () => {
  it.each(files)("%s imports no three, r3f or react", (file) => {
    const text = readFileSync(join(root, file), "utf8");
    expect(text).not.toMatch(/from\s+["'](three|@react-three\/[^"']+|react)["']/);
  });
  it("keeps the three.js helper out of the barrel", () => {
    expect(readFileSync(join(root, "src/core/customization/index.ts"), "utf8")).not.toContain("uprightConstraint");
  });
  it("keeps the part-change bounce controller out of the barrel", () => {
    expect(readFileSync(join(root, "src/core/customization/index.ts"), "utf8")).not.toContain("partChangeBounce");
  });
});
