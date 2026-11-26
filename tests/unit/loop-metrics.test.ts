// @vitest-environment node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTranscript, roleOf, summarizeCard } from "../../scripts/loop-metrics-lib.mjs";

const FIXTURE = resolve(__dirname, "fixtures/loop-metrics/transcript.jsonl");
const text = readFileSync(FIXTURE, "utf8");

describe("roleOf", () => {
  it("maps descriptions to roles and ignores non-loop agents", () => {
    expect(roleOf("Lead MFW-60")).toBe("lead");
    expect(roleOf("Dev MFW-60 polish round")).toBe("dev");
    expect(roleOf("Re-review MFW-60")).toBe("reviewer");
    expect(roleOf("QA MFW-61")).toBe("qa");
    expect(roleOf("Perf review MFW-61")).toBe("perf");
    expect(roleOf("Privacy audit MFW-61")).toBe("privacy");
    expect(roleOf("Explore the repo")).toBeNull();
    expect(roleOf("Lead without a key")).toBeNull();
  });
});

describe("parseTranscript", () => {
  const runs = parseTranscript(text);
  it("keeps the largest token count per description and skips sidechains and junk", () => {
    const dev = runs.filter((r) => r.description === "Dev MFW-60 polish round");
    expect(dev).toHaveLength(1);
    expect(dev[0]).toMatchObject({ tokens: 223000, toolUses: 60, role: "dev", key: "MFW-60" });
    expect(dev[0].startedAt).toBe("2026-11-26T09:30:00Z");
    expect(runs.some((r) => r.key === "MFW-62")).toBe(false);
    expect(runs.some((r) => r.description === "Explore the repo")).toBe(false);
  });
});

describe("summarizeCard", () => {
  const runs = parseTranscript(text);
  it("sums lead + dev + reviewer of MFW-60 and counts the polish round", () => {
    expect(summarizeCard(runs, "MFW-60")).toEqual({
      tokens: 587000,
      byRole: { lead: 263000, dev: 223000, reviewer: 101000 },
      fixRounds: 1,
      agents: 3,
    });
  });
  it("separates cards and reports zero for an unknown one", () => {
    expect(summarizeCard(runs, "MFW-61")).toMatchObject({ tokens: 105000, fixRounds: 0, agents: 2 });
    expect(summarizeCard(runs, "MFW-99")).toEqual({ tokens: 0, byRole: {}, fixRounds: 0, agents: 0 });
  });
});

describe("scripts/loop-metrics.mjs", () => {
  const cli = (args: string[]) =>
    spawnSync("node", [resolve(__dirname, "../../scripts/loop-metrics.mjs"), ...args], { encoding: "utf8" });
  it("prints the card summary as JSON", () => {
    const r = cli([FIXTURE, "MFW-60"]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ key: "MFW-60", tokens: 587000, fixRounds: 1 });
  });
  it("lists every card without a key and rejects bad usage with exit 2", () => {
    expect(JSON.parse(cli([FIXTURE]).stdout).map((c: { key: string }) => c.key)).toEqual(["MFW-60", "MFW-61"]);
    expect(cli([]).status).toBe(2);
    expect(cli([FIXTURE, "nope"]).status).toBe(2);
    expect(cli(["/nonexistent.jsonl"]).status).toBe(2);
  });
});
