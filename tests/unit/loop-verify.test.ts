// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkRecord, workingTreeHash } from "../../scripts/loop-verify.mjs";

const CLI = resolve(__dirname, "../../scripts/loop-verify.mjs");
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();

/** A throwaway repo on a card branch, a scratch dir, and a fake `pnpm` that fails for the steps named in `failSteps`. */
function setup(failSteps: string[] = []) {
  const root = mkdtempSync(join(tmpdir(), "loop-verify-"));
  dirs.push(root);
  const wt = join(root, "wt");
  const scratch = join(root, "scratch");
  const bin = join(root, "bin");
  mkdirSync(wt);
  mkdirSync(bin);
  git(wt, "init", "-q", "-b", "feat/MFW-5-x");
  git(wt, "config", "user.email", "t@example.com");
  git(wt, "config", "user.name", "t");
  writeFileSync(join(wt, "a.txt"), "one\n");
  writeFileSync(join(wt, ".gitignore"), "ignored/\n");
  git(wt, "add", "a.txt", ".gitignore");
  git(wt, "commit", "-q", "-m", "init");
  writeFileSync(join(bin, "pnpm"), `#!/bin/sh\necho "pnpm $1 E2E_PORT=$E2E_PORT CI=$CI" >> "${root}/calls.log"\ncase " ${failSteps.join(" ")} " in *" $1 "*) echo "boom in $1"; exit 1;; esac\nexit 0\n`);
  chmodSync(join(bin, "pnpm"), 0o755);
  const env = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` };
  const run = (...args: string[]) => spawnSync("node", [CLI, ...args], { env, encoding: "utf8" });
  const verify = (port = "38211") => run("--wt", wt, "--port", port, "--scratch", scratch);
  const check = () => run("--wt", wt, "--scratch", scratch, "--check");
  const calls = () => (existsSync(join(root, "calls.log")) ? readFileSync(join(root, "calls.log"), "utf8").trim().split("\n") : []);
  return { wt, scratch, verify, check, calls };
}

describe("checkRecord", () => {
  const pass = { typecheck: "pass", lint: "pass", test: "pass", build: "pass", e2e: "pass" };
  it("accepts a matching tree with every command passed", () => {
    expect(checkRecord({ tree: "t1", treeAfter: "t1", results: pass }, "t1")).toEqual({ ok: true, reasons: [] });
  });
  it("rejects a different tree, a failed or skipped command, a mutating run and no record", () => {
    expect(checkRecord({ tree: "t1", results: pass }, "t2").ok).toBe(false);
    expect(checkRecord({ tree: "t1", results: { ...pass, e2e: "fail" } }, "t1").reasons).toEqual(["e2e: fail"]);
    expect(checkRecord({ tree: "t1", results: { ...pass, build: "skipped" } }, "t1").ok).toBe(false);
    expect(checkRecord({ tree: "t1", treeAfter: "t3", results: pass }, "t1").ok).toBe(false);
    expect(checkRecord(null, "t1").ok).toBe(false);
  });
});

describe("workingTreeHash", () => {
  it("changes with an edit or a new file, ignores ignored files, and leaves the real index alone", () => {
    const { wt } = setup();
    const t0 = workingTreeHash(wt);
    expect(workingTreeHash(wt)).toBe(t0);
    mkdirSync(join(wt, "ignored"));
    writeFileSync(join(wt, "ignored/x"), "x");
    expect(workingTreeHash(wt)).toBe(t0);
    writeFileSync(join(wt, "new.txt"), "n");
    const t1 = workingTreeHash(wt);
    expect(t1).not.toBe(t0);
    writeFileSync(join(wt, "a.txt"), "two\n");
    expect(workingTreeHash(wt)).not.toBe(t1);
    expect(git(wt, "status", "--porcelain")).toContain("?? new.txt");
    expect(git(wt, "diff", "--cached", "--name-only")).toBe("");
  });
});

describe("scripts/loop-verify.mjs", () => {
  it("runs the five commands separately with E2E_PORT and CI=1, records the tree, and --check passes", () => {
    const s = setup();
    const r = s.verify();
    expect(r.status).toBe(0);
    const calls = s.calls();
    expect(calls.map((c) => c.split(" ")[1])).toEqual(["typecheck", "lint", "test", "build", "e2e"]);
    expect(calls[4]).toBe("pnpm e2e E2E_PORT=38211 CI=1");
    expect(calls.slice(0, 4).every((c) => c.includes("E2E_PORT= "))).toBe(true);
    const rec = JSON.parse(readFileSync(join(s.scratch, "MFW-5-verify.json"), "utf8"));
    expect(rec.tree).toBe(workingTreeHash(s.wt));
    expect(Object.keys(rec.results)).toEqual(["typecheck", "lint", "test", "build", "e2e"]);
    expect(s.check().status).toBe(0);
  });

  it("--check fails once the tree changed after the verify", () => {
    const s = setup();
    expect(s.verify().status).toBe(0);
    writeFileSync(join(s.wt, "a.txt"), "edited after verify\n");
    const c = s.check();
    expect(c.status).toBe(1);
    expect(c.stdout).toContain("tree changed");
  });

  it("a failing command exits 1, skips the rest, prints the log tail, and --check fails", () => {
    const s = setup(["lint"]);
    const r = s.verify();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("lint FAILED");
    expect(r.stderr).toContain("boom in lint");
    expect(s.calls().map((c) => c.split(" ")[1])).toEqual(["typecheck", "lint"]);
    const rec = JSON.parse(readFileSync(join(s.scratch, "MFW-5-verify.json"), "utf8"));
    expect(rec.results).toMatchObject({ typecheck: "pass", lint: "fail", test: "skipped", e2e: "skipped" });
    expect(s.check().status).toBe(1);
  });

  it("--check without a record fails; bad usage exits 2", () => {
    const s = setup();
    expect(s.check().status).toBe(1);
    expect(spawnSync("node", [CLI], { encoding: "utf8" }).status).toBe(2);
  });
});
