// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FORBIDDEN_3D =
  /from\s+["'](three|@react-three\/[^"']+|@react-spring\/[^"']+|@\/components\/canvas3d[^"']*|@\/components\/models\/[^"']+)["']/;
const AUTH = /@\/services\/auth|deviceOwnerToken|getDeviceOwnerVault/;
const RAW_HTML = /dangerouslySetInnerHTML/;
const CUSTOMIZATION_VALUE_IMPORT = /^import\s+(?!type\b).*from\s+["']@\/core\/customization["']/m;

const FILES = [
  "src/components/ui/InspectPopup.tsx",
  "src/components/ui/inspectedCreation.ts",
  "src/components/ui/krathongAppearanceSummary.ts",
  "src/services/api/reportClient.ts",
  "src/config/inspect.config.ts",
];
const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");

describe("inspect popup boundary", () => {
  it("positive controls", () => {
    expect('import { x } from "three"').toMatch(FORBIDDEN_3D);
    expect('import { a } from "@/services/auth/x"').toMatch(AUTH);
    expect("<div dangerouslySetInnerHTML={{}} />").toMatch(RAW_HTML);
    expect('import { A } from "@/core/customization"').toMatch(CUSTOMIZATION_VALUE_IMPORT);
  });
  it.each(FILES)("%s imports no 3D module, no auth, no raw HTML", (file) => {
    const source = read(file);
    expect(source).not.toMatch(FORBIDDEN_3D);
    expect(source).not.toMatch(AUTH);
    expect(source).not.toMatch(RAW_HTML);
    expect(source).not.toMatch(CUSTOMIZATION_VALUE_IMPORT);
  });
  it("the ui helpers import the customization types only from the types file", () => {
    for (const f of ["src/components/ui/inspectedCreation.ts", "src/components/ui/krathongAppearanceSummary.ts"]) {
      expect(read(f)).toMatch(/import type \{[^}]*\} from "@\/core\/customization\/types"/);
    }
  });
});
