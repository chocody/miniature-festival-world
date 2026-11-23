// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

/** Frontmatter: the text between the first two `---` lines, as `key: value` pairs. */
function frontmatter(text: string): Record<string, string> {
  const lines = text.split("\n");
  expect(lines[0]).toBe("---");
  const end = lines.indexOf("---", 1);
  expect(end).toBeGreaterThan(0);
  const out: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    const m = /^([A-Za-z-]+):\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

describe("project agents (.claude/agents)", () => {
  const expected: Record<string, string> = { lead: "opus", dev: "sonnet", reviewer: "sonnet", qa: "sonnet" };

  for (const [name, model] of Object.entries(expected)) {
    it(`${name} exists with model ${model}, a description and tools`, () => {
      const fm = frontmatter(read(`.claude/agents/${name}.md`));
      expect(fm.name).toBe(name);
      expect(fm.model).toBe(model);
      expect(fm.description.length).toBeGreaterThan(0);
      expect(fm.tools.length).toBeGreaterThan(0);
    });
  }

  it("the reviewer is read-only", () => {
    const tools = frontmatter(read(".claude/agents/reviewer.md")).tools.split(",").map((t) => t.trim());
    expect(tools).not.toContain("Edit");
    expect(tools).not.toContain("Write");
  });
});

describe("loop skills", () => {
  const ticket = read(".claude/skills/loop-ticket/SKILL.md");
  const epic = read(".claude/skills/loop-epic/SKILL.md");
  const waitCi = read("scripts/wait-ci.sh");

  it("do not depend on files under ~/.claude", () => {
    for (const text of [ticket, epic]) {
      for (const bad of ["~/.claude", "$HOME/.claude", "implement-code-full-loop"]) expect(text).not.toContain(bad);
    }
  });

  it("use REST only for GitHub (no GraphQL-backed gh commands, no token lookup)", () => {
    for (const text of [ticket, epic, waitCi]) {
      for (const bad of ["gh pr ", "gh repo view", "gh auth token", "--match-head-commit", "gh api graphql"]) {
        expect(text).not.toContain(bad);
      }
    }
  });

  it("loop-ticket carries the cloud-ready procedure markers", () => {
    for (const marker of ["scripts/gh-rest.mjs", "owner-merge", "ownerMergeRequired", "E2E_PORT", "subagent_type"]) {
      expect(ticket).toContain(marker);
    }
  });

  it("keeps the safety rules", () => {
    expect(ticket).toMatch(/pr-merge <PR> --sha <SHA>/);
    expect(ticket).toContain("At most one fix round");
    expect(ticket).toContain("precommit-guard");
    expect(ticket).toMatch(/\*\*do not run `pr-merge`\.\*\*/);
    expect(ticket).toContain("Force-push `main` (or force-push at all)");
    expect(ticket).toContain("**never** rebased or force-pushed");
    expect(epic).toContain("Never merge an owner-merge ticket");
  });

  it("mentions --owner-approved only in Never lists", () => {
    for (const text of [ticket, epic]) {
      const lines = text.split("\n").filter((l) => l.includes("--owner-approved"));
      expect(lines.length).toBeGreaterThan(0);
      for (const l of lines) {
        expect(l).toMatch(/^- /);
        expect(l).toMatch(/Never pass|Pass `--owner-approved` to `pr-merge` \(it is the owner's override; the loop never uses it\)/);
      }
      const never = text.slice(text.lastIndexOf("## Never") >= 0 ? text.lastIndexOf("## Never") : text.lastIndexOf("## Rules"));
      expect(never).toContain("--owner-approved");
    }
  });

  it("loop-epic supports a cap, parallel lanes and a merge queue", () => {
    const hint = frontmatter(epic)["argument-hint"];
    expect(hint).toContain("--max");
    expect(hint).toContain("--parallel");
    for (const marker of ["git worktree add", "next --all-ready", "merge queue"]) expect(epic).toContain(marker);
  });
});

describe("docs/cloud.md", () => {
  it("exists with the documented headings", () => {
    expect(existsSync(resolve(ROOT, "docs/cloud.md"))).toBe(true);
    const text = read("docs/cloud.md");
    for (const heading of [
      "# Running the loop in Claude Code cloud sessions",
      "## What runs where",
      "## The mfw-loop environment",
      "## Owner one-time setup",
      "## Daily unattended run",
      "## What parks and what waits for the owner",
      "## Local use (owner's laptop)",
      "## Troubleshooting",
      "## Cost and time",
    ]) {
      expect(text.split("\n")).toContain(heading);
    }
  });
});
