// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** MFW-55 AC2: every UI file uses the design tokens; no raw palette, dark mode or legacy size / radius classes. */
const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const listDir = (dir: string) =>
  readdirSync(join(ROOT, dir))
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f))
    .map((f) => `${dir}/${f}`);

const SCAN = [
  ...listDir("src/components/ui"),
  "src/app/layout.tsx",
  "src/app/page.tsx",
];

const FORBIDDEN: readonly RegExp[] = [
  /\b(?:bg|text|border|ring|outline|fill|stroke|from|via|to|divide|placeholder|accent|caret|decoration|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/,
  /\bdark:/,
  /\b(?:bg|text|border)-black\b/,
  /\brounded-(?:sm|md|lg|xl|2xl|3xl)\b/,
  /\btext-(?:xs|sm|base|lg|xl|[2-9]xl)\b/,
  /\bopacity-75\b/,
];

const AC2_SCREENS = [
  "StageLayout.tsx", "CustomizerPanel.tsx", "WishModal.tsx", "WishVisibilitySwitch.tsx", "OwnershipNotice.tsx",
  "RitualReleasePanel.tsx", "FlowStepPlaceholder.tsx", "DayNightSwitch.tsx", "SceneTapHint.tsx", "ZoneNavigator.tsx",
  "MyCreationsDrawer.tsx", "InspectPopup.tsx", "OwnerWishControls.tsx", "PrivateWishReveal.tsx",
  "NoActiveEventScreen.tsx", "NoWebglNotice.tsx",
];
const TOKEN_CLASS =
  /\b(?:bg|text|border)-(?:stage|paper|veil|ink|ink-muted|ink-veil|line|track|clay|clay-soft|clay-ink|danger|notice)\b/;

describe("token usage (MFW-55)", () => {
  it("scans a non-trivial set of files", () => {
    expect(SCAN.length).toBeGreaterThan(AC2_SCREENS.length);
  });

  it("no raw palette, dark: or legacy size/radius classes in UI files", () => {
    for (const file of SCAN) {
      const source = read(file);
      for (const re of FORBIDDEN) expect(re.test(source), `${file} matches ${re}`).toBe(false);
    }
  });

  it("every AC2 screen file uses the tokens", () => {
    for (const name of AC2_SCREENS) {
      const source = read(`src/components/ui/${name}`);
      expect(source.includes("UI_CLASSES") || TOKEN_CLASS.test(source), name).toBe(true);
    }
  });
});
