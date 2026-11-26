#!/usr/bin/env node
// One full verify per card, bound to the content of the working tree (loop-ticket Step 5).
//
//   node scripts/loop-verify.mjs --wt <path> --port <n> --scratch <dir> [--key MFW-n]   run the 5 commands
//   node scripts/loop-verify.mjs --wt <path> --scratch <dir> [--key MFW-n] --check      exit 0 iff the record matches
//
// Runs `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` and `E2E_PORT=<n> CI=1 pnpm e2e` separately (stops at
// the first failure; the rest are "skipped") and writes <scratch>/<KEY>-verify.json =
// { key, tree, treeAfter, results: { typecheck, lint, test, build, e2e }, durationsMs }, where `tree` is the git tree
// id of the working tree (a temporary index: HEAD plus every non-ignored change, the real index is untouched) taken
// before the commands ran. `--check` recomputes the tree now: any edit, rebase or merge since the run changes it and
// the record no longer counts. Per-step logs go to <scratch>/<KEY>-verify-<step>.log; only the failing tail is printed.
// KEY defaults to the MFW-<n> in the branch name.
// Exit (run): 0 all pass · 1 a step failed · 2 usage · 3 port busy. Exit (--check): 0 valid · 1 not valid.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const STEPS = ["typecheck", "lint", "test", "build", "e2e"];

/** @param {string} wt @returns {string} git tree id of HEAD + all non-ignored working-tree changes */
export function workingTreeHash(wt) {
  const dir = mkdtempSync(join(tmpdir(), "mfw-verify-index-"));
  const env = { ...process.env, GIT_INDEX_FILE: join(dir, "index") };
  const git = (/** @type {string[]} */ args) => execFileSync("git", ["-C", wt, ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  try {
    git(["read-tree", "HEAD"]);
    git(["add", "-A"]); // temporary index only: the loop's real staging is always explicit paths
    return git(["write-tree"]).trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** @param {string} wt */
export function keyFromBranch(wt) {
  const branch = execFileSync("git", ["-C", wt, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim();
  return /MFW-\d+/.exec(branch)?.[0] ?? null;
}

/**
 * Whether a verify record still counts for the tree it is checked against.
 * @param {any} record parsed <KEY>-verify.json
 * @param {string} currentTree
 * @returns {{ ok: boolean, reasons: string[] }}
 */
export function checkRecord(record, currentTree) {
  /** @type {string[]} */
  const reasons = [];
  if (!record || typeof record !== "object") return { ok: false, reasons: ["no verify record"] };
  if (record.tree !== currentTree) reasons.push(`tree changed since verify (verified ${record.tree}, now ${currentTree})`);
  if (record.treeAfter !== undefined && record.treeAfter !== record.tree) reasons.push("a command changed the working tree while it ran");
  for (const s of STEPS) if (record.results?.[s] !== "pass") reasons.push(`${s}: ${record.results?.[s] ?? "missing"}`);
  return { ok: reasons.length === 0, reasons };
}

/** @param {number} port @returns {Promise<boolean>} */
export function portFree(port) {
  return new Promise((done) => {
    const s = createServer();
    s.once("error", () => done(false));
    s.listen(port, () => s.close(() => done(true)));
  });
}

const tail = (/** @type {string} */ text, n = 40) => text.split("\n").slice(-n).join("\n");

async function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: { wt: { type: "string" }, port: { type: "string" }, scratch: { type: "string" }, key: { type: "string" }, check: { type: "boolean" } },
  });
  const usage = (/** @type {string} */ why) => {
    process.stderr.write(`error: ${why}\nusage: node scripts/loop-verify.mjs --wt <path> --port <n> --scratch <dir> [--key MFW-n] [--check]\n`);
    process.exit(2);
  };
  if (!values.wt || !values.scratch) usage("--wt and --scratch are required");
  const wt = resolve(values.wt);
  const scratch = resolve(values.scratch);
  const key = values.key ?? keyFromBranch(wt);
  if (!key || !/^MFW-\d+$/.test(key)) usage("cannot determine the ticket key (pass --key MFW-n)");
  const file = join(scratch, `${key}-verify.json`);

  if (values.check) {
    let record = null;
    try {
      record = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      /* no record */
    }
    const verdict = checkRecord(record, workingTreeHash(wt));
    process.stdout.write(JSON.stringify({ key, ...verdict }) + "\n");
    process.exit(verdict.ok ? 0 : 1);
  }

  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) usage("--port must be an integer 1024–65535");
  if (!(await portFree(port))) {
    process.stderr.write(`port ${port} in use: not running anything (do not kill the process; pick another port)\n`);
    process.exit(3);
  }
  mkdirSync(scratch, { recursive: true });
  const tree = workingTreeHash(wt);
  /** @type {Record<string, string>} */
  const results = Object.fromEntries(STEPS.map((s) => [s, "skipped"]));
  /** @type {Record<string, number>} */
  const durationsMs = {};
  let failed = null;
  for (const step of STEPS) {
    if (failed) break;
    const env = step === "e2e" ? { ...process.env, E2E_PORT: String(port), CI: "1" } : process.env;
    const t0 = Date.now();
    const r = spawnSync("pnpm", [step], { cwd: wt, env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    durationsMs[step] = Date.now() - t0;
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}${r.error ? String(r.error.message) : ""}`;
    writeFileSync(join(scratch, `${key}-verify-${step}.log`), out, "utf8");
    results[step] = r.status === 0 ? "pass" : "fail";
    if (r.status !== 0) {
      failed = step;
      process.stderr.write(`loop-verify: ${step} FAILED (exit ${r.status}); log tail:\n${tail(out)}\n`);
    }
  }
  const treeAfter = workingTreeHash(wt);
  writeFileSync(file, JSON.stringify({ key, tree, treeAfter, results, durationsMs }, null, 2) + "\n", "utf8");
  const verdict = checkRecord({ tree, treeAfter, results }, tree);
  process.stdout.write(JSON.stringify({ key, tree, results, ok: verdict.ok, reasons: verdict.reasons }) + "\n");
  process.exit(verdict.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`error: ${err?.message ?? err}\n`);
    process.exit(2);
  });
}
