// @vitest-environment node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeFakeGh, type FakeRule } from "./fixtures/fake-gh-harness";

const SCRIPT = resolve(__dirname, "../../scripts/wait-ci.sh");
const SHA = "a".repeat(40);
const OTHER = "b".repeat(40);

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

/** Rules keyed on the jq expressions wait-ci.sh passes to `gh api`. */
function gate(opts: { head?: string; runs: string; cross?: string }, args: string[] = ["7", SHA]) {
  const rules: FakeRule[] = [
    { match: ["select(.id=="], stdout: `${opts.cross ?? "SUCCESS"}\n` },
    { match: ["check-runs", "\\(.id)"], stdout: opts.runs },
    { match: ["--jq .head.sha"], stdout: `${opts.head ?? SHA}\n` },
  ];
  const fake = makeFakeGh(rules);
  cleanups.push(fake.cleanup);
  const r = spawnSync("bash", [SCRIPT, ...args], {
    env: { ...fake.env, GH_TOKEN: "fake", WAIT_CI_INTERVAL_S: "1", WAIT_CI_TIMEOUT_S: "3" },
    encoding: "utf8",
  });
  const lines = r.stdout.trim().split("\n");
  return { code: r.status, last: lines[lines.length - 1], stdout: r.stdout, calls: fake.calls() };
}

describe("scripts/wait-ci.sh (REST only)", { timeout: 20_000 }, () => {
  it("passes on a successful ci check-run", () => {
    const r = gate({ runs: "11 completed success\n" });
    expect(r.code).toBe(0);
    expect(r.last).toBe(`GATE: PASS sha=${SHA} check-run=11`);
    expect(r.calls.every((c) => c.args[0] === "api")).toBe(true);
  });

  it("fails on a non-success conclusion", () => {
    const r = gate({ runs: "11 completed failure\n" });
    expect(r.code).toBe(1);
    expect(r.last).toBe("GATE: FAIL ci concluded 'failure' check-run=11");
  });

  it("fails when the PR head moved", () => {
    const r = gate({ head: OTHER, runs: "11 completed success\n" });
    expect(r.code).toBe(1);
    expect(r.last).toContain("GATE: FAIL PR head moved");
  });

  it("fails when two ci check-runs exist", () => {
    const r = gate({ runs: "11 completed success\n12 completed success\n" });
    expect(r.code).toBe(1);
    expect(r.last).toContain("expected exactly one ci check-run");
  });

  it("ignores a previous check-run id", () => {
    const r = gate({ runs: "10 completed failure\n11 completed success\n" }, ["7", SHA, "10"]);
    expect(r.code).toBe(0);
    expect(r.last).toBe(`GATE: PASS sha=${SHA} check-run=11`);
  });

  it("fails when the cross-check disagrees", () => {
    const r = gate({ runs: "11 completed success\n", cross: "failure" });
    expect(r.code).toBe(1);
    expect(r.last).toContain("ci='failure'");
  });

  it("exits 2 on a bad sha", () => {
    const r = gate({ runs: "" }, ["7", "nothex"]);
    expect(r.code).toBe(2);
  });
});
