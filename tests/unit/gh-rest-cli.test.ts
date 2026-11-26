// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeFakeGh, type FakeRule } from "./fixtures/fake-gh-harness";

const CLI = resolve(__dirname, "../../scripts/gh-rest.mjs");
const SHA = "a".repeat(40);
const OTHER = "b".repeat(40);

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function runCli(args: string[], rules: FakeRule[], extraEnv: Record<string, string | undefined> = {}) {
  const fake = makeFakeGh(rules);
  cleanups.push(fake.cleanup);
  const env: NodeJS.ProcessEnv = { ...fake.env, ...extraEnv };
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
  const r = spawnSync("node", [CLI, ...args], { env, encoding: "utf8" });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, calls: fake.calls() };
}

const pr = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    number: 7,
    html_url: "https://github.com/chocody/miniature-festival-world/pull/7",
    title: "feat(x): y MFW-9",
    state: "open",
    merged: false,
    draft: false,
    head: { sha: SHA, ref: "feat/MFW-9-y" },
    base: { ref: "main" },
    merge_commit_sha: null,
    ...over,
  });

const CLOUD = { MFW_GH_MODE: "cloud", GH_TOKEN: undefined };

describe("scripts/gh-rest.mjs", () => {
  it("prints help without needing a token and rejects unknown commands", () => {
    const help = runCli(["--help"], [], { MFW_GH_MODE: "local" });
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("pr-merge");
    expect(help.calls).toEqual([]);
    expect(runCli(["frobnicate"], [], CLOUD).code).toBe(2);
  });

  it("local mode exits 2 with guidance when the chocody token is unavailable", () => {
    const r = runCli(["pr-get", "7"], [{ match: ["auth", "token", "-u", "chocody"], code: 1 }], { MFW_GH_MODE: "local" });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("gh auth login");
    expect(r.calls.some((c) => c.args[0] === "api")).toBe(false);
  });

  it("cloud exec passes a placeholder GH_TOKEN and never asks for a token", () => {
    const r = runCli(["exec", "--", "node", "-e", "process.exit(process.env.GH_TOKEN==='proxy-injected'?0:3)"], [], CLOUD);
    expect(r.code).toBe(0);
    expect(r.calls.some((c) => c.args.includes("token"))).toBe(false);
  });

  it("cloud pr-merge squashes pinned to the sha", () => {
    const r = runCli(
      ["pr-merge", "7", "--sha", SHA],
      [
        { match: ["pulls/7/files"], stdout: "[]" },
        { match: ["-X GET", "pulls/7"], stdout: pr(), times: 1 },
        { match: ["-X PUT", "pulls/7/merge"], stdout: "{}" },
        { match: ["-X GET", "pulls/7"], stdout: pr({ merged: true, state: "closed", merge_commit_sha: OTHER }) },
      ],
      CLOUD,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ merged: true, mergeCommitSha: OTHER });
    const put = r.calls.find((c) => c.args.includes("PUT"));
    expect(put?.args).toContain(`sha=${SHA}`);
    expect(put?.args).toContain("merge_method=squash");
    expect(r.calls.every((c) => c.args[0] === "api")).toBe(true);
  });

  it("refuses supabase paths, risk labels and --risk, and honours --owner-approved", () => {
    const merged = pr({ merged: true, state: "closed", merge_commit_sha: OTHER });
    const rules = (files: string, open: string): FakeRule[] => [
      { match: ["pulls/7/files"], stdout: files },
      { match: ["-X PUT", "pulls/7/merge"], stdout: "{}" },
      { match: ["-X GET", "pulls/7"], stdout: open, times: 1 },
      { match: ["-X GET", "pulls/7"], stdout: merged },
    ];
    const sb = runCli(["pr-merge", "7", "--sha", SHA], rules('[{"filename":"supabase/m.sql"}]', pr()), CLOUD);
    expect(sb.code).toBe(1);
    expect(sb.stderr + sb.stdout).toContain("owner-merge required");
    expect(sb.calls.some((c) => c.args.includes("PUT"))).toBe(false);
    const lab = runCli(["pr-merge", "7", "--sha", SHA], rules("[]", pr({ labels: [{ name: "db" }] })), CLOUD);
    expect(lab.code).toBe(1);
    expect(lab.calls.some((c) => c.args.includes("PUT"))).toBe(false);
    const risk = runCli(["pr-merge", "7", "--sha", SHA, "--risk"], rules("[]", pr()), CLOUD);
    expect(risk.code).toBe(1);
    expect(risk.calls.some((c) => c.args.includes("PUT"))).toBe(false);
    const ok = runCli(["pr-merge", "7", "--sha", SHA, "--risk", "--owner-approved"], rules("[]", pr()), CLOUD);
    expect(ok.code).toBe(0);
  });

  it("refuses a head mismatch with exit 1 and no PUT", () => {
    const r = runCli(["pr-merge", "7", "--sha", OTHER], [{ match: ["-X GET", "pulls/7"], stdout: pr() }], CLOUD);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.stdout)).toMatchObject({ merged: false });
    expect(r.calls.some((c) => c.args.includes("PUT"))).toBe(false);
  });

  it("rejects a malformed sha as a usage error", () => {
    expect(runCli(["pr-merge", "7", "--sha", "nothex"], [], CLOUD).code).toBe(2);
  });

  it("pr-create reads the body from stdin into a temp file", () => {
    const fake = makeFakeGh([{ match: ["-X POST", "/pulls"], stdout: pr() }]);
    cleanups.push(fake.cleanup);
    const env: NodeJS.ProcessEnv = { ...fake.env, MFW_GH_MODE: "cloud" };
    delete env.GH_TOKEN;
    const r = spawnSync("node", [CLI, "pr-create", "--head", "feat/MFW-9-y", "--title", "feat: y", "--body-file", "-"], {
      env,
      input: "body text",
      encoding: "utf8",
    });
    expect(r.status).toBe(0);
    const call = fake.calls()[0];
    expect(call.args.some((a) => /^body=@.*body\.md$/.test(a))).toBe(true);
    expect(JSON.parse(r.stdout)).toMatchObject({ number: 7 });
  });
});

/** A repo on branch feat/MFW-9-y with `changed` committed against `main`, and a scratch dir for verdict files. */
function verdictRepo(changed: string[]) {
  const root = mkdtempSync(join(tmpdir(), "gh-verdict-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const wt = join(root, "wt");
  const scratch = join(root, "scratch");
  mkdirSync(wt);
  mkdirSync(scratch);
  const git = (...a: string[]) => execFileSync("git", ["-C", wt, ...a], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  writeFileSync(join(wt, "a.txt"), "1");
  git("add", "a.txt");
  git("commit", "-q", "-m", "base");
  git("checkout", "-q", "-b", "feat/MFW-9-y");
  for (const f of changed) {
    mkdirSync(join(wt, f, ".."), { recursive: true });
    writeFileSync(join(wt, f), "x");
    git("add", f);
  }
  git("commit", "-q", "-m", "work");
  const verdict = (name: string, text = "VERDICT: PASS\n### Findings\nNone\n") => writeFileSync(join(scratch, `MFW-9-${name}.md`), text);
  const verifyOk = () =>
    writeFileSync(
      join(scratch, "MFW-9-verify.json"),
      JSON.stringify({ tree: git("rev-parse", "HEAD^{tree}"), results: { typecheck: "pass", lint: "pass", test: "pass", build: "pass", e2e: "pass" } }),
    );
  const create = (extra: string[] = []) => {
    const fake = makeFakeGh([{ match: ["-X POST", "/pulls"], stdout: pr() }]);
    cleanups.push(fake.cleanup);
    const env: NodeJS.ProcessEnv = { ...fake.env, MFW_GH_MODE: "cloud" };
    delete env.GH_TOKEN;
    const r = spawnSync(
      "node",
      [CLI, "pr-create", "--head", "feat/MFW-9-y", "--title", "feat: y", "--body-file", "-", "--verdicts", scratch, "--key", "MFW-9", "--base", "main", ...extra],
      { env, input: "body", encoding: "utf8", cwd: wt },
    );
    return { code: r.status, stdout: r.stdout, stderr: r.stderr, posts: fake.calls().filter((c) => c.args.includes("POST")).length };
  };
  return { verdict, verifyOk, create };
}

describe("pr-create --verdicts (verdict gate)", () => {
  it("refuses without the qa file and names it; nothing is POSTed", () => {
    const t = verdictRepo(["docs/x.md"]);
    t.verdict("reviewer");
    t.verifyOk();
    const r = t.create();
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("missing MFW-9-qa.md");
    expect(r.posts).toBe(0);
  });

  it("refuses a diff in src/components/canvas3d/ without the perf verdict", () => {
    const t = verdictRepo(["src/components/canvas3d/Scene.tsx"]);
    t.verdict("reviewer");
    t.verdict("qa");
    t.verifyOk();
    const r = t.create();
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("missing MFW-9-r3f-perf-reviewer.md");
    expect(r.posts).toBe(0);
  });

  it("refuses a FIX FIRST verdict and a stale verify record", () => {
    const t = verdictRepo(["docs/x.md"]);
    t.verdict("reviewer");
    t.verdict("qa", "VERDICT: FIX FIRST\n");
    const r = t.create();
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("needs VERDICT: PASS");
    expect(r.stderr).toContain("loop-verify --check failed");
    expect(r.posts).toBe(0);
  });

  it("opens the PR when every required verdict is PASS and the verify record matches the tree", () => {
    const t = verdictRepo(["src/services/x.ts"]);
    t.verdict("reviewer");
    t.verdict("qa");
    t.verdict("privacy-auditor");
    t.verifyOk();
    const r = t.create();
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ number: 7 });
    expect(r.posts).toBe(1);
  });

  it("rejects a --base that is an option or HEAD, and an unknown --auditors role", () => {
    const t = verdictRepo(["docs/x.md"]);
    expect(t.create(["--base", "HEAD"]).code).toBe(2);
    expect(t.create(["--base", "--output=x"]).code).toBe(2);
    expect(t.create(["--auditors", "hacker"]).code).toBe(2);
  });

  it("--auditors adds a label-driven auditor; --verdicts without --key is a usage error", () => {
    const t = verdictRepo(["docs/x.md"]);
    t.verdict("reviewer");
    t.verdict("qa");
    t.verifyOk();
    expect(t.create(["--auditors", "privacy-auditor"]).stderr).toContain("missing MFW-9-privacy-auditor.md");
    const bad = runCli(["pr-create", "--head", "feat/MFW-9-y", "--title", "t", "--body-file", "x", "--verdicts", "/tmp"], [], CLOUD);
    expect(bad.code).toBe(2);
  });
});

describe("pr-land", { timeout: 30_000 }, () => {
  const land = (rules: FakeRule[], extra: string[] = []) =>
    runCli(["pr-land", "7", "--sha", SHA, ...extra], rules, { ...CLOUD, GH_TOKEN: "fake", WAIT_CI_INTERVAL_S: "1", WAIT_CI_TIMEOUT_S: "3" });
  const merged = pr({ merged: true, state: "closed", merge_commit_sha: OTHER });
  const waitRules = (runs: string): FakeRule[] => [
    { match: ["select(.id=="], stdout: "SUCCESS\n" },
    { match: ["check-runs", "\\(.id)"], stdout: runs },
    { match: ["--jq .head.sha"], stdout: `${SHA}\n` },
  ];
  const mergeRules: FakeRule[] = [
    { match: ["pulls/7/files"], stdout: "[]" },
    { match: ["-X PUT", "pulls/7/merge"], stdout: "{}" },
    { match: ["-X GET", "pulls/7"], stdout: pr(), times: 2 },
    { match: ["-X GET", "pulls/7"], stdout: merged },
  ];

  it("merges pinned to the sha after GATE: PASS for the same sha", () => {
    const r = land([...waitRules("11 completed success\n"), ...mergeRules]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ merged: true, mergeCommitSha: OTHER, gate: `GATE: PASS sha=${SHA} check-run=11` });
    expect(r.calls.find((c) => c.args.includes("PUT"))?.args).toContain(`sha=${SHA}`);
  });

  it("never calls merge when the ci check-run failed", () => {
    const r = land([...waitRules("11 completed failure\n"), ...mergeRules]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.stdout)).toMatchObject({ merged: false, reason: expect.stringContaining("ci gate not passed") });
    expect(r.calls.some((c) => c.args.includes("PUT"))).toBe(false);
  });

  it("keeps pr-merge's refusals and does not even wait for ci", () => {
    const sb = land([{ match: ["pulls/7/files"], stdout: '[{"filename":"supabase/m.sql"}]' }, { match: ["-X GET", "pulls/7"], stdout: pr() }]);
    expect(sb.code).toBe(1);
    expect(sb.stdout).toContain("owner-merge required");
    expect(sb.calls.some((c) => c.args.includes("check-runs"))).toBe(false);
    const lab = land([{ match: ["pulls/7/files"], stdout: "[]" }, { match: ["-X GET", "pulls/7"], stdout: pr({ labels: [{ name: "privacy" }] }) }]);
    expect(lab.stdout).toContain("owner-merge required");
    const risk = land([{ match: ["pulls/7/files"], stdout: "[]" }, { match: ["-X GET", "pulls/7"], stdout: pr() }], ["--risk"]);
    expect(risk.code).toBe(1);
    expect(risk.calls.some((c) => c.args.includes("PUT"))).toBe(false);
    const head = runCli(["pr-land", "7", "--sha", OTHER], [{ match: ["-X GET", "pulls/7"], stdout: pr() }], CLOUD);
    expect(head.code).toBe(1);
    expect(head.stdout).toContain("expected");
  });

  it("does not merge when wait-ci exits non-zero even though its last line says PASS, or when the PASS line has another sha", () => {
    // wait-ci.sh cannot be made to lie through the fake gh, so use a stand-in script on PATH-independent override
    const dir = mkdtempSync(join(tmpdir(), "fake-wait-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const run = (script: string) => {
      // copy gh-rest.mjs next to a fake wait-ci.sh so pr-land resolves the stand-in
      const scripts = join(dir, "scripts");
      mkdirSync(scripts, { recursive: true });
      writeFileSync(join(scripts, "wait-ci.sh"), script);
      writeFileSync(join(scripts, "gh-rest.mjs"), readFileSync(CLI, "utf8"));
      writeFileSync(join(scripts, "gh-rest-lib.mjs"), readFileSync(join(dirname(CLI), "gh-rest-lib.mjs"), "utf8"));
      const fake = makeFakeGh([{ match: ["pulls/7/files"], stdout: "[]" }, { match: ["-X PUT", "pulls/7/merge"], stdout: "{}" }, { match: ["-X GET", "pulls/7"], stdout: pr() }]);
      cleanups.push(fake.cleanup);
      const env: NodeJS.ProcessEnv = { ...fake.env, MFW_GH_MODE: "cloud", GH_TOKEN: "fake" };
      const r = spawnSync("node", [join(scripts, "gh-rest.mjs"), "pr-land", "7", "--sha", SHA], { env, encoding: "utf8" });
      return { code: r.status, stdout: r.stdout, put: fake.calls().some((c) => c.args.includes("PUT")) };
    };
    const nonZero = run(`#!/bin/bash\necho "GATE: PASS sha=${SHA} check-run=11"\nexit 1\n`);
    expect(nonZero.code).toBe(1);
    expect(nonZero.put).toBe(false);
    const otherSha = run(`#!/bin/bash\necho "GATE: PASS sha=${OTHER} check-run=11"\nexit 0\n`);
    expect(otherSha.code).toBe(1);
    expect(otherSha.put).toBe(false);
    const good = run(`#!/bin/bash\necho "GATE: PASS sha=${SHA} check-run=11"\nexit 0\n`);
    expect(good.put).toBe(true); // control: the stand-in is honoured, so the two negatives above are meaningful
  });

  it("--ignore is passed to wait-ci.sh (the old failed check-run is skipped) and must be numeric", () => {
    const r = land([...waitRules("10 completed failure\n11 completed success\n"), ...mergeRules], ["--ignore", "10"]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).gate).toBe(`GATE: PASS sha=${SHA} check-run=11`);
    expect(land([], ["--ignore", "abc"]).code).toBe(2);
  });

  it("has no --owner-approved override and rejects a malformed sha", () => {
    expect(land([], ["--owner-approved"]).code).toBe(2);
    expect(runCli(["pr-land", "7", "--sha", "nothex"], [], CLOUD).code).toBe(2);
  });
});

