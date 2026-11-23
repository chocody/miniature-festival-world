// @vitest-environment node
// Spawns scripts/jira.mjs only with commands that fail before any network call, so nothing can reach Jira.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const CLI = resolve(__dirname, "../../scripts/jira.mjs");
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function run(args: string[], env: NodeJS.ProcessEnv, input?: string) {
  const r = spawnSync("node", [CLI, ...args], { env, input, encoding: "utf8" });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const base = (): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of ["HTTPS_PROXY", "https_proxy", "NODE_USE_ENV_PROXY", "JIRA_AUTH", "JIRA_EMAIL", "JIRA_API_TOKEN", "NODE_OPTIONS"]) {
    delete env[k];
  }
  return env;
};

describe("scripts/jira.mjs proxy re-exec", () => {
  it("re-runs itself exactly once with NODE_USE_ENV_PROXY=1 and passes the exit code through", () => {
    const dir = mkdtempSync(join(tmpdir(), "jira-reexec-"));
    dirs.push(dir);
    const log = join(dir, "starts.log");
    const hook = join(dir, "hook.cjs");
    writeFileSync(hook, `require("node:fs").appendFileSync(${JSON.stringify(log)}, (process.env.NODE_USE_ENV_PROXY ?? "unset") + "\\n");`);
    const env = { ...base(), HTTPS_PROXY: "http://127.0.0.1:9", NODE_OPTIONS: `--require ${hook}` };
    const r = run(["frobnicate"], env);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("unknown command");
    expect(readFileSync(log, "utf8").trim().split("\n")).toEqual(["unset", "1"]);
  });

  it("passes stdin through to the child (empty comment text is rejected before any network call)", () => {
    const env = { ...base(), HTTPS_PROXY: "http://127.0.0.1:9" };
    const r = run(["comment", "MFW-1", "-"], env, "   \n");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("text is empty");
  });

  it("JIRA_AUTH=proxy without any proxy variable exits 2", () => {
    const r = run(["whoami"], { ...base(), JIRA_AUTH: "proxy" });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("needs HTTPS_PROXY");
  });
});
