// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { codeShare, lintSpec } from "../../scripts/spec-lint.mjs";

const CLI = resolve(__dirname, "../../scripts/spec-lint.mjs");
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

/** Synthetic specs built in memory; `testForAc3: false` drops the test file from AC 3. */
function spec({ testForAc3 = true, filler = 0, code = 0 } = {}): string {
  return [
    "## Goal",
    "Make taps alive.",
    "## Acceptance criteria → checks",
    "1. **\"A\"**",
    "   - Test: `src/core/a.test.ts` → case one.",
    "2. **\"B\"**",
    "   - Test: `tests/e2e/b.spec.ts`.",
    "3. **\"C\"**",
    testForAc3 ? "   - Test: `src/core/c.test.tsx`." : "   - Checked by hand.",
    "## Plan",
    "Files and signatures.",
    code ? "```ts\n" + "const x = 1;\n".repeat(code) + "```" : "",
    "x".repeat(filler),
    "## Decisions",
    "None.",
    "## Open questions",
    "None",
    "## Out of scope",
    "Nothing.",
    "## Risks",
    "Few.",
  ].join("\n");
}

describe("lintSpec", () => {
  it("passes a complete small spec", () => {
    expect(lintSpec(spec(), { ac: 3 })).toEqual([]);
  });

  it("fails when AC 3 names no test file", () => {
    const p = lintSpec(spec({ testForAc3: false }), { ac: 3 });
    expect(p).toHaveLength(1);
    expect(p[0]).toContain("AC 3");
  });

  it("fails when an AC item is missing entirely", () => {
    expect(lintSpec(spec(), { ac: 4 }).join("\n")).toContain("AC 4: no item");
  });

  it("fails a 60 KB spec for M and L, passes a 30 KB one only for L", () => {
    const p = lintSpec(spec({ filler: 60 * 1024 }), { ac: 3 });
    expect(p.join("\n")).toMatch(/cap for size M is 24576 bytes/);
    expect(lintSpec(spec({ filler: 60 * 1024 }), { ac: 3, size: "L" }).join("\n")).toMatch(/cap for size L is 40960 bytes/);
    expect(lintSpec(spec({ filler: 30 * 1024 }), { ac: 3, size: "L" })).toEqual([]);
    expect(lintSpec(spec({ filler: 30 * 1024 }), { ac: 3, size: "S" })).not.toEqual([]);
  });

  it("fails when code blocks exceed 30% of the file", () => {
    const heavy = spec({ code: 80 });
    expect(codeShare(heavy)).toBeGreaterThan(0.3);
    expect(lintSpec(heavy, { ac: 3 }).join("\n")).toContain("code blocks");
    expect(lintSpec(spec({ code: 2 }), { ac: 3 })).toEqual([]);
  });

  it("accepts an AC that cites test IDs defined elsewhere with a test file, but not undefined IDs", () => {
    const base = (row: string) =>
      ["## Goal", "g", "## Acceptance criteria → checks", `| 1 | ${row} |`, "### Cases", "`src/core/x.test.ts`", "- RC9 smoke puff rises", "## Plan", "p", "## Decisions", "d", "## Open questions", "None", "## Out of scope", "o", "## Risks", "r"].join("\n");
    expect(lintSpec(base("RC9, EM3"), { ac: 1 })).toEqual([]);
    expect(lintSpec(base("EM3 only"), { ac: 1 }).join("\n")).toContain("AC 1");
  });

  it("accepts an AC whose check is the verify commands, but an AC row cannot define its own IDs", () => {
    const mk = (row: string) => ["## Goal", "g", "## Acceptance criteria → checks", `| 1 | ${row} |`, "## Plan", "p", "## Decisions", "d", "## Open questions", "None", "## Out of scope", "o", "## Risks", "r"].join("\n");
    expect(lintSpec(mk("`pnpm typecheck`, `pnpm test`"), { ac: 1 })).toEqual([]);
    expect(lintSpec(mk("verify commands, each run separately"), { ac: 1 })).toEqual([]);
    expect(lintSpec(mk("RC9 only, defined nowhere"), { ac: 1 }).join("")).toContain("AC 1");
  });

  it("states the caps in bytes", () => {
    const p = lintSpec(spec({ filler: 25 * 1024 }), { ac: 3 }).join("\n");
    expect(p).toContain("24576");
  });

  it("reports every missing heading", () => {
    const p = lintSpec("## Goal\nonly\n", { ac: 1 });
    expect(p.filter((x) => x.startsWith("missing heading"))).toHaveLength(6);
  });

  it("ignores `## ` lines inside fenced code when finding the checks section", () => {
    const s = spec().replace("1. **\"A\"**", "```\n## Plan\n```\n1. **\"A\"**");
    expect(lintSpec(s, { ac: 3 })).toEqual([]);
  });
});

describe("scripts/spec-lint.mjs", () => {
  const run = (text: string, args: string[]) => {
    const dir = mkdtempSync(join(tmpdir(), "spec-lint-"));
    dirs.push(dir);
    const file = join(dir, "spec.md");
    writeFileSync(file, text);
    return spawnSync("node", [CLI, file, ...args], { encoding: "utf8" });
  };
  it("exit 0 on pass, 1 with the list on failure, 2 on bad usage", () => {
    expect(run(spec(), ["--ac", "3"]).status).toBe(0);
    const bad = run(spec({ testForAc3: false }), ["--ac", "3"]);
    expect(bad.status).toBe(1);
    expect(bad.stdout).toContain("AC 3");
    expect(run(spec(), []).status).toBe(2);
    expect(run(spec(), ["--ac", "3", "--size", "XL"]).status).toBe(2);
  });
});
