// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");

const DIRS = [
  "src/config/events",
  ...["coordinates", "camera", "customization", "world", "ritual", "interaction", "effects", "fallback2d"].map(
    (d) => `src/core/${d}`,
  ),
  "src/components/canvas3d",
  "src/components/canvas2d",
  "src/components/models/loyKrathong",
  "src/components/ui",
  "src/services/api",
  "src/services/auth",
  "src/services/moderation",
  "src/store",
];

const FILES = [
  "src/config/performance.config.ts",
  "src/store/useUIStore.ts",
  "src/store/useBuilderStore.ts",
  "src/store/useWorldStore.ts",
  "src/store/useDeviceStore.ts",
  "src/components/ui/NoActiveEventScreen.tsx",
  "src/components/ui/MyCreationsDrawer.tsx",
  "src/core/coordinates/SplinePathCoord.ts",
  "src/core/coordinates/CylindricalCoord.ts",
  "src/core/coordinates/PlanarGridCoord.ts",
];

describe("folder structure (spec §3)", () => {
  it.each(DIRS)("directory %s exists", (d) => {
    const p = path.join(root, d);
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.statSync(p).isDirectory()).toBe(true);
  });

  it.each(FILES)("file %s exists", (f) => {
    const p = path.join(root, f);
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.statSync(p).isFile()).toBe(true);
  });
});
