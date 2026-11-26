// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildBrief, specFilesFor } from "../../scripts/loop-brief.mjs";

const ROOT = resolve(__dirname, "../..");
const CLI = resolve(ROOT, "scripts/loop-brief.mjs");
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const ticket = {
  key: "MFW-70",
  url: "https://chocody.atlassian.net/browse/MFW-70",
  summary: "Ripple pool on tap",
  type: "Story",
  labels: ["3d", "ui"],
  acceptanceCriteria: [
    "Tapping the water spawns a ripple from the pool",
    "The pool never holds more than the cap",
    "Reduced motion shows no ripple",
    "FALLBACK_2D shows a flat ring",
    "Round-trip converter test exists",
  ],
  spec: { epicId: "L3", goal: "Taps feel alive without allocating per tap." },
  openQuestions: [
    { number: "21", question: "Ripple cap?", resolved: false },
    { number: "22", question: "Old one", resolved: true },
  ],
  description: "",
};
const opts = { wt: "/wt/MFW-70", branch: "feat/MFW-70-ripple-pool", base: "abc1234", port: 3101, qaPort: 3151, scratch: "/scratch" };

describe("buildBrief", () => {
  const brief = buildBrief(ticket, opts);

  it("carries every mandatory field", () => {
    for (const needle of [
      "/wt/MFW-70",
      "feat/MFW-70-ripple-pool",
      "abc1234",
      "E2E_PORT=3101",
      "QA_PORT=3151",
      "MFW-70",
      "/scratch/MFW-70-spec.md",
      "/scratch/MFW-70-devreport.md",
      "docs/spec/06-loops/loop-3.md",
      "docs/spec/04-coordinates.md",
      "Ripple cap?",
      "do not ask questions",
    ]) {
      expect(brief).toContain(needle);
    }
    ticket.acceptanceCriteria.forEach((a, i) => expect(brief).toContain(`${i + 1}. ${a}`));
    expect(brief).not.toContain("Old one");
  });

  it("does not copy the invariants of CLAUDE.md", () => {
    const claude = readFileSync(resolve(ROOT, "CLAUDE.md"), "utf8");
    const section = claude.slice(claude.indexOf("## Non-negotiable invariants"), claude.indexOf("## Environment facts"));
    const sentences = section.split("\n").filter((l) => l.trim().length > 40);
    expect(sentences.length).toBeGreaterThan(10);
    for (const l of sentences) expect(brief).not.toContain(l.trim());
    expect(brief).not.toContain("Parametric coordinates only");
    expect(brief).toContain("CLAUDE.md");
  });

  it("is at most 6,000 characters without a context file", () => {
    expect(brief.length).toBeLessThanOrEqual(6000);
  });

  it("appends the shared context when given", () => {
    const withCtx = buildBrief(ticket, { ...opts, contextText: "SHARED FACT" });
    expect(withCtx).toContain("## Shared context\nSHARED FACT");
  });

  it("picks the privacy spec for privacy tickets and no loop file for L0", () => {
    const files = specFilesFor({ key: "MFW-1", summary: "x", labels: ["privacy"], acceptanceCriteria: ["y"], spec: { epicId: "L0" } });
    expect(files).toContain("docs/spec/05-privacy-db.md");
    expect(files.some((f) => f.includes("06-loops"))).toBe(false);
  });
});

describe("scripts/loop-brief.mjs", () => {
  it("writes <scratch>/<KEY>-brief.md from a saved ticket json", () => {
    const dir = mkdtempSync(join(tmpdir(), "loop-brief-"));
    dirs.push(dir);
    writeFileSync(join(dir, "get.json"), JSON.stringify(ticket));
    const ctx = join(dir, "ctx.md");
    writeFileSync(ctx, "CTX LINE\n");
    const r = spawnSync(
      "node",
      [CLI, "MFW-70", "--wt", "/wt/MFW-70", "--branch", "feat/MFW-70-ripple-pool", "--base", "abc1234", "--port", "3101", "--qa-port", "3151", "--scratch", dir, "--get-file", join(dir, "get.json"), "--context-file", ctx],
      { encoding: "utf8" },
    );
    expect(r.status).toBe(0);
    const out = readFileSync(join(dir, "MFW-70-brief.md"), "utf8");
    expect(out).toContain("feat/MFW-70-ripple-pool");
    expect(out).toContain("CTX LINE");
  });

  it("exits 2 on missing options", () => {
    const r = spawnSync("node", [CLI, "MFW-70", "--wt", "/x"], { encoding: "utf8" });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("usage");
  });
});

describe("loop-brief outside a git repository", () => {
  it("exits 2 with a usage error when WT is not a repo and --branch is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "loop-brief-nogit-"));
    dirs.push(dir);
    writeFileSync(join(dir, "get.json"), JSON.stringify(ticket));
    const r = spawnSync(
      "node",
      [CLI, "MFW-70", "--wt", dir, "--base", "abc", "--port", "3101", "--qa-port", "3151", "--scratch", dir, "--get-file", join(dir, "get.json")],
      { encoding: "utf8" },
    );
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("not a git repository");
    expect(r.stderr).not.toContain("fatal:");
  });
});
