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
  it("LS1 never moves the release branch", () => {
    const ticket = read(".claude/skills/loop-ticket/SKILL.md");
    expect(ticket.slice(ticket.lastIndexOf("## Never"))).toContain("release-ff");
    for (const rel of [".claude/skills/loop-ticket/SKILL.md", ".claude/skills/loop-epic/SKILL.md"]) {
      const text = read(rel);
      const lines = text.split("\n");
      const lastHeading = Math.max(lines.lastIndexOf("## Never"), lines.lastIndexOf("## Rules"));
      lines.forEach((line, i) => {
        if (line.includes("release-ff")) expect(i).toBeGreaterThan(lastHeading);
      });
      expect(text).not.toMatch(/git push[^\n]*\brelease\b/);
    }
  });

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

  it("loop-ticket wires the loop tooling and its gates (they must not disappear)", () => {
    for (const marker of [
      "scripts/loop-brief.mjs",
      "docs/loop/context.md",
      "scripts/spec-lint.mjs",
      "24 KB for S/M, 40 KB for L",
      "scripts/loop-verify.mjs",
      "tree hash",
      "--verdicts <SCRATCH> --key <KEY>",
      "VERDICT: PASS|FIX FIRST|GOAL NOT MET",
      "pr-land <PR> --sha <SHA>",
      "scripts/loop-metrics.mjs",
    ]) {
      expect(ticket).toContain(marker);
    }
    // every pr-create the skill shows carries the verdict gate (a parked ticket's `--draft` PR has no verdicts by definition)
    const creates = ticket.split("\n").filter((l) => l.includes("gh-rest.mjs pr-create") && !l.includes("--draft"));
    expect(creates.length).toBeGreaterThan(0);
    for (const l of creates) expect(l).toContain("--verdicts");
    // the brief is generated, never a pasted copy of the invariants
    expect(ticket).not.toContain("pasted verbatim");
  });

  it("every merge in Step 7 goes through pr-land, the normal and the CI-rerun path", () => {
    const step7 = ticket.slice(ticket.indexOf("## Step 7"), ticket.indexOf("## Review mode"));
    expect(step7).toMatch(/pr-land <PR> --sha <SHA> \[--risk\]\n/); // normal path
    expect(step7).toMatch(/pr-land <PR> --sha <SHA> \[--risk\] --ignore <failed check-run id/); // after ci-rerun
    expect(step7).not.toMatch(/has already merged/);
    expect(step7).toContain("is **not** a CI attempt and never gets a `ci-rerun`");
    // the old unpinned merge command is gone: pr-merge is only mentioned, never a command line to run
    expect(step7).not.toMatch(/^\s*(?:cd <WT> && )?node scripts\/gh-rest\.mjs pr-merge/m);
  });

  it("the reviewing agents start their report with a VERDICT line", () => {
    for (const name of ["reviewer", "qa", "privacy-auditor", "r3f-perf-reviewer"]) {
      expect(read(`.claude/agents/${name}.md`)).toContain("VERDICT: PASS");
    }
  });

  it("lead.md carries the sizing step, the caps and the 3D planning checklist", () => {
    const lead = read(".claude/agents/lead.md");
    for (const marker of ["sizing", "24 KB (24,576 bytes) for S and M, 40 KB (40,960 bytes) for L", "3D / canvas work", "one timer/clock per canvas", "no new shader program"]) {
      expect(lead).toContain(marker);
    }
  });

  it("loop-ticket has the three lead routes and no route drops the reviewer, qa or CI", () => {
    for (const route of ["plan-file", "brief-only", "lead"]) expect(ticket).toContain(`**${route}**`);
    expect(ticket).toContain("docs/plans/<KEY>.md");
    expect(ticket).toMatch(/spec-lint\.mjs docs\/plans\/<KEY>\.md --ac <n> --size/);
    expect(ticket).toContain("sizeHint.skipLead");
    expect(ticket).toContain("Route: <plan-file|brief-only|lead>");
    expect(ticket).toContain("every route keeps reviewer, qa, the auditors that apply, `loop-verify` and the CI gate");
    expect(ticket).toContain("The reviewer runs on every route, and so do qa and the CI gate");
    // no route text may offer to skip qa, the reviewer or CI
    const routes = ticket.slice(ticket.indexOf("**Route**"), ticket.indexOf("## Step 3"));
    expect(routes).not.toMatch(/skip (the )?(reviewer|qa|ci)\b/i);
    // the verdict gate still demands reviewer and qa reports on every route
    expect(ticket).toContain("`<SCRATCH>/<KEY>-reviewer.md` and `<KEY>-qa.md`");
  });

  it("reviews are diff-first: reviewer reads two spec sections, auditors get no spec", () => {
    const step44 = ticket.slice(ticket.indexOf("### 4.4"), ticket.indexOf("### 4.5"));
    expect(step44).toContain("diff-first");
    expect(step44).toContain("## Acceptance criteria → checks");
    expect(step44).toContain("## Decisions");
    expect(step44).toMatch(/`r3f-perf-reviewer` gets the brief, the diff and the dev-report path, not\s+the spec/);
    expect(step44).toMatch(/`privacy-auditor` gets the same plus, when a spec exists, its `## Decisions` and `## Out of scope`/);
    expect(step44).toContain("Both get the dev-report path");
    // spec-less routes: brief flag, in-WT lint recheck, fix/repair/PR wording
    expect(ticket).toContain("--spec docs/plans/<KEY>.md");
    expect(ticket).toContain("--spec none");
    expect(ticket).toContain("**confirm it inside `WT`**");
    expect(ticket).toContain("(or the brief alone when there is no spec)");
    expect(ticket).toContain("send dev the spec (or the brief when there is no spec)");
    expect(ticket).toContain("on route `brief-only`, from the brief and the dev report");
    expect(ticket).toContain("route `brief-only` stays on `sonnet` too");
    const reviewer = read(".claude/agents/reviewer.md");
    expect(reviewer).toContain("diff-first");
    expect(reviewer).toContain("## Acceptance criteria → checks");
    expect(reviewer).toContain("## Decisions");
    expect(reviewer).toContain("every item below still applies");
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
