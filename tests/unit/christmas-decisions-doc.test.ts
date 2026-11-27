// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import keysJson from "../../docs/backlog-keys.json";
import { openQuestionsFor } from "../../scripts/jira-lib.mjs";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

function rowsOf(md: string): Map<number, string[]> {
  const rows = new Map<number, string[]>();
  for (const line of md.split("\n")) {
    if (!/^\| (\d+) \|/.test(line)) continue;
    const cells = line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
    rows.set(Number(cells[0]), cells);
  }
  return rows;
}

function labelRow(rows: Map<number, string[]>, label: string) {
  return [...rows.values()].filter((c) => c[1].startsWith(`(L16 ${label}) `));
}

const DECIDED = ["D1", "D2", "D11", "R5", "designs", "props", "models", "village", "data scope"];
const OPEN = [
  "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D12", "D13", "D14",
  "R1", "R2", "R3", "R4", "R6", "R7", "R8", "R9",
];
const GATE = "licence";
const L16_KEYS = Object.entries(keysJson as Record<string, string>)
  .filter(([k]) => k === "L16" || k.startsWith("16."))
  .map(([, v]) => v);

const md = read("docs/spec/open-questions.md");
const rows = rowsOf(md);

describe("Christmas decisions in the spec (MFW-87)", () => {
  it("OQ1 has exactly one row per L16 label", () => {
    for (const label of [...DECIDED, ...OPEN, GATE]) {
      expect(labelRow(rows, label), label).toHaveLength(1);
    }
  });

  it("OQ2 numbers rows 1..N without gaps and keeps four cells in the edited rows", () => {
    const nums = [...rows.keys()];
    const n = nums.length;
    expect(n).toBeGreaterThanOrEqual(76);
    expect(nums).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    for (const [num, cells] of rows) {
      if ([15, 17, 18, 20, 37].includes(num) || num >= 48) {
        expect(cells, `row ${num}`).toHaveLength(4);
      }
    }
  });

  it("OQ3 records the decided rows", () => {
    for (const label of DECIDED) {
      expect(labelRow(rows, label)[0][3], label).toMatch(/\bDecided in MFW-87\b/);
    }
    expect(rows.get(20)![3]).toContain("Decided in MFW-87");
    const r51 = rows.get(51)!.join(" | ");
    for (const id of ["ball_01", "star_01", "bow_01", "bell_01", "stocking_01", "gift_01"]) {
      expect(r51).toContain(id);
    }
    expect(r51).toContain("no colour picker");
    expect(rows.get(56)!.join(" | ")).toContain("data_scope");
  });

  it("OQ4 open rows park no L16 card except the licence gate", () => {
    for (const key of L16_KEYS) {
      const open = (openQuestionsFor(md, key) as { question: string; resolved?: boolean }[]).filter(
        (q) => !q.resolved && q.question.startsWith("(L16 "),
      );
      for (const q of open) {
        expect(q.question.startsWith("(L16 licence)")).toBe(true);
        expect(key).toBe("MFW-115");
      }
    }
    const gate = openQuestionsFor(md, "MFW-115") as { question: string }[];
    expect(gate.some((q) => q.question.startsWith("(L16 licence)"))).toBe(true);
  });

  it("OQ5 every open D/R row states its default", () => {
    for (const label of OPEN) {
      const row = labelRow(rows, label)[0];
      expect(row[3], label).toContain("Default (DRAFT, built meanwhile):");
      expect(row.join(" | "), label).not.toMatch(/MFW-\d+/);
    }
  });

  it("OQ6 amends rows 15, 17, 18 and 37", () => {
    expect(rows.get(15)![3]).toContain("Superseded in MFW-87");
    expect(rows.get(15)![3]).toContain("row 46");
    expect(rows.get(17)!.join(" | ")).toContain("Superseded in MFW-87 by row 56");
    const r18 = rows.get(18)!.join(" | ");
    expect(r18).toContain("Updated in MFW-87");
    expect(r18).toContain("16.31");
    expect(r18).toContain("16.30");
    expect(rows.get(37)!.join(" | ")).toContain("does not apply to the Christmas tree");
  });

  it("CL1 CLAUDE.md says Christmas is being built and keeps the invariants", () => {
    const c = read("CLAUDE.md");
    expect(c).not.toContain("Christmas stays a stub");
    for (const s of ["docs/plans/L16-christmas.md", "open questions 48–76", "data_scope"]) {
      expect(c).toContain(s);
    }
    for (const s of [
      "## Non-negotiable invariants",
      "## Environment facts",
      "**A. Parametric coordinates only.**",
      "**B. 3D reads the stored coord; positions are derived at render time.**",
      "**C. No private data on public paths.**",
      "**D. Ownership table stays private; RLS everywhere.**",
      "**E. Mobile performance budget.**",
      "**F. Reduced motion + quality tiers.**",
      "**G. Moderation before anything goes public.**",
    ]) {
      expect(c).toContain(s);
    }
  });

  it("RM1 roadmap launch note is updated", () => {
    const note = read("docs/spec/01-roadmap.md")
      .split("\n")
      .filter((l) => l.startsWith("> "))
      .join("\n");
    expect(note).not.toContain("Christmas ยังเป็น config stub");
    for (const s of ["L16", "ข้อ 48–76", "data_scope", "20–26 ธ.ค. 2026"]) {
      expect(note).toContain(s);
    }
  });
});
