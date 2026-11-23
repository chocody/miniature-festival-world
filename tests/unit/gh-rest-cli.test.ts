// @vitest-environment node
import { spawnSync } from "node:child_process";
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
