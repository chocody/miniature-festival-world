// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FORBIDDEN =
  /from\s+["'](three|@react-three\/[^"']+|@react-spring\/[^"']+|@\/components\/canvas3d[^"']*|@\/components\/models\/[^"']+)["']/;

const files = [
  "src/components/ui/CustomizerPanel.tsx",
  "src/store/useBuilderStore.ts",
  "src/config/customizer.config.ts",
  "src/core/customization/krathongChoices.ts",
];

describe("customizer landing-bundle boundary", () => {
  it("the check matches a react-spring import", () => {
    expect('import { animated } from "@react-spring/three"').toMatch(FORBIDDEN);
  });
  it.each(files)("%s imports no 3D module", (file) => {
    expect(readFileSync(join(process.cwd(), file), "utf8")).not.toMatch(FORBIDDEN);
  });
});
