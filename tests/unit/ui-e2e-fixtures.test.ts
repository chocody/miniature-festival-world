// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRIMARY_ACTION_PROPS } from "@/components/ui/uiClasses";
import { E2E_UI } from "../e2e/fixtures/uiFixtures";

/** Pins the literals Playwright duplicates (tests/e2e/fixtures/uiFixtures.ts) to their sources (MFW-55). */
function token(name: string): string {
  const source = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const m = new RegExp(`^\\s*${name}:\\s*(.+?);\\s*$`, "m").exec(source);
  if (!m) throw new Error(`no token ${name}`);
  return m[1];
}

describe("minimal-ui e2e fixtures (MFW-55)", () => {
  it("focus ring width equals --focus-ring-width", () => {
    expect(E2E_UI.focusRingWidth).toBe(token("--focus-ring-width"));
  });

  it("transition duration equals --default-transition-duration as a computed style", () => {
    const raw = token("--default-transition-duration");
    expect(raw).toMatch(/^\d+ms$/);
    expect(E2E_UI.transitionDuration).toBe(`${parseInt(raw, 10) / 1000}s`);
  });

  it("primary selector is built from PRIMARY_ACTION_PROPS", () => {
    const [[k, v]] = Object.entries(PRIMARY_ACTION_PROPS);
    expect(E2E_UI.primarySelector).toBe(`[${k}="${v}"]`);
  });

  it("font pattern matches the one web font", () => {
    expect(E2E_UI.fontFamilyPattern.test("Anuphan")).toBe(true);
  });
});
