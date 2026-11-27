// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
/** Value (non-type) import specifiers: `import type` vanishes at build, so it adds nothing to the landing bundle. */
const VALUE_IMPORT = /^(?:import|export)\s+(?!type\b)[^;]*?\bfrom\s+["']([^"']+)["']/gm;
const valueSpecifiers = (src: string) => [...src.matchAll(VALUE_IMPORT)].map((m) => m[1]);

/** MFW-91: the per-event copy modules are pulled onto the landing path by MyCreationsDrawer and ZoneNavigator, so they stay strings-only. */
describe("per-event copy import boundary (MFW-91)", () => {
  const FILES = [
    "src/config/events/eventCopy.config.ts",
    "src/config/events/loyKrathong.copy.ts",
    "src/config/events/christmas.copy.ts",
    "src/components/ui/EventCopyContext.tsx",
  ];

  it("value imports come only from react, src/config/** or a sibling copy file", () => {
    for (const file of FILES) {
      const bad = valueSpecifiers(read(file)).filter(
        (s) => !(s === "react" || s.startsWith("@/config/") || /^\.\/[A-Za-z.]+$/.test(s)),
      );
      expect({ file, bad }).toEqual({ file, bad: [] });
    }
  });

  it("no three / react-three / services / store anywhere in these files", () => {
    for (const file of FILES) expect({ file, hit: /three|@\/services|@\/store/.test(read(file)) }).toEqual({ file, hit: false });
  });
});
