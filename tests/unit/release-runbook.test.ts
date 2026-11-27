// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

describe("release runbook", () => {
  it("DOC1 release.md exists with the documented headings", () => {
    expect(existsSync(resolve(ROOT, "docs/runbooks/release.md"))).toBe(true);
    const lines = read("docs/runbooks/release.md").split("\n");
    for (const heading of [
      "# Release branch runbook (production during the live events)",
      "## Summary",
      "## Branches and environments",
      "## One-time switch (owner)",
      "## Dry run (owner)",
      "## Moving release",
      "## Rollback",
      "## What the loop does and does not do",
    ]) {
      expect(lines).toContain(heading);
    }
  });

  it("DOC2 release.md states the rules the AC names", () => {
    const text = read("docs/runbooks/release.md");
    for (const word of [
      "release-ff",
      "--check",
      "--owner-approved",
      "fast-forward",
      "19 Dec",
      "27 Dec",
      "hotfix",
      "staging",
      "main",
      "Instant Rollback",
      "docs/follow-ups.md",
    ]) {
      expect(text).toContain(word);
    }
    expect(text).not.toMatch(/git push[^\n]*(--force|-f\b)[^\n]*release/);
  });

  it("DOC3 ci.md links the release runbook", () => {
    const text = read("docs/ci.md");
    expect(text.split("\n")).toContain("## Production deploys (release branch)");
    expect(text).toContain("docs/runbooks/release.md");
    expect(text).toContain("release-ff");
  });
});
