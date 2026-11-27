#!/usr/bin/env node
// GitHub helper for the MFW loop skills: REST only (`gh api`), so it works in Claude Code cloud sessions
// where GraphQL (gh pr / gh repo / ...) is blocked, and on the owner's laptop. Dependency-free, Node >= 22.
// Pure logic lives in ./gh-rest-lib.mjs (unit-tested); this file only does I/O.
//
// Usage: node scripts/gh-rest.mjs <command>
//
//   mode                                   print {"mode":"cloud|local","repo":…}
//   preflight                              GET the repo; JSON {fullName, defaultBranch, deleteBranchOnMerge}
//   git <git args…>                        run a networked git command (push, ls-remote, fetch) with the right auth
//   fetch-main                             shallow-aware `git fetch origin main` (--depth=50 only in a shallow clone)
//   exec -- <cmd> [args…]                  run a command with the GitHub env (e.g. bash scripts/wait-ci.sh <pr> <sha>)
//   pr-create --head <branch> --title <t> --body-file <path|-> [--draft]
//             [--verdicts <dir> --key <KEY> [--base <ref>] [--auditors <role,…>]]
//                                          with --verdicts: refuses (exit 1, no POST) unless <dir>/<KEY>-reviewer.md and
//                                          <KEY>-qa.md (and the auditor reports the diff <base>...HEAD calls for) have
//                                          the first line "VERDICT: PASS" and `loop-verify --check` passes
//   pr-get <pr>
//   pr-comment <pr> --body-file <path|->
//   ticket-prs <N>                         open PRs whose head branch contains /MFW-<N>-
//   branch-prs <branch>                    PRs (any state) for exactly that head branch
//   pr-merge <pr> --sha <40-hex> [--risk]  squash merge pinned to sha; verified by a follow-up GET. Refuses
//                                          (exit 1, no PUT) supabase/ paths, owner-merge/privacy/db/migration PR
//                                          labels and --risk (ticket has such a label). The loop never passes
//                                          --owner-approved (owner override).
//   pr-land <pr> --sha <40-hex> [--risk] [--ignore <check-run-id>]   wait for ci on exactly <sha> (scripts/wait-ci.sh), then pr-merge only on
//                                          "GATE: PASS sha=<sha>"; keeps every pr-merge refusal and checks them first
//   ci-info <sha> [--ignore <check-run-id>]   ci check-run, annotations, the run's jobs and the failing job log tail
//   ci-rerun <sha>                         re-run the failed jobs of the ci workflow run (may be refused)
//   release-ff --sha <40-hex> [--check] [--owner-approved]   owner only: fast-forwards `release` (the Vercel production
//                                          branch from 19 Dec) to a `main` sha whose `ci` passed; --check runs the checks
//                                          and writes nothing; refuses without --owner-approved unless --check; never forces
//
// Mode: MFW_GH_MODE=cloud|local, else cloud when CLAUDE_CODE_REMOTE is set, else local.
//   local: GH_TOKEN=$(gh auth token -u chocody) and git uses `gh auth git-credential`.
//   cloud: the network proxy authenticates gh and git; GH_TOKEN is left as is (placeholder if empty).
// Exit: 0 ok · 1 GitHub/API error or refused (pr-merge not merged) · 2 usage or environment (no token).
// Every command except git/exec prints one JSON object on stdout; errors go to stderr.
// Never uses GraphQL (gh pr/gh repo/gh run subcommands): only `gh api` REST calls.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  GH_ACCOUNT,
  GhApiError,
  GhEnvError,
  REPO_SLUG,
  createGitHub,
  detectMode,
  fetchMainArgs,
  ghEnv,
  gitNetArgs,
  isSha,
  requiredVerdictRoles,
  verdictProblems,
} from "./gh-rest-lib.mjs";

const USAGE = `Usage: node scripts/gh-rest.mjs <command>

  mode                                   print {"mode":"cloud|local","repo":…}
  preflight                              GET the repo; JSON {fullName, defaultBranch, deleteBranchOnMerge}
  git <git args…>                        run a networked git command (push, ls-remote, fetch) with the right auth
  fetch-main                             shallow-aware \`git fetch origin main\`
  exec -- <cmd> [args…]                  run a command with the GitHub env (e.g. bash scripts/wait-ci.sh <pr> <sha>)
  pr-create --head <branch> --title <t> --body-file <path|-> [--draft]
            [--verdicts <dir> --key <KEY> [--base <ref>] [--auditors <role,…>]]
                                         with --verdicts: refuses unless the reviewer/qa (and needed auditor) reports
                                         start with "VERDICT: PASS" and loop-verify --check passes
  pr-get <pr>
  pr-comment <pr> --body-file <path|->
  ticket-prs <N>                         open PRs whose head branch contains /MFW-<N>-
  branch-prs <branch>                    PRs (any state) for exactly that head branch
  pr-merge <pr> --sha <40-hex> [--risk]  squash merge pinned to sha; refuses supabase/ paths, owner-merge/privacy/
                                         db/migration labels and --risk; --owner-approved is the owner's override
  pr-land <pr> --sha <40-hex> [--risk] [--ignore <id>]   wait for ci on <sha> (--ignore: the failed check-run id after
                                         a ci-rerun), then pr-merge only on "GATE: PASS sha=<sha>"
  ci-info <sha> [--ignore <check-run-id>]   ci check-run, annotations, the run's jobs and the failing job log tail
  ci-rerun <sha>                         re-run the failed jobs of the ci workflow run (may be refused)
  release-ff --sha <40-hex> [--check] [--owner-approved]   owner only: fast-forwards release (the Vercel production
                                         branch from 19 Dec) to a main sha whose ci passed; --check runs the checks
                                         and writes nothing; refuses without --owner-approved unless --check; never forces

Mode: MFW_GH_MODE=cloud|local, else cloud when CLAUDE_CODE_REMOTE is set, else local.
Exit: 0 ok · 1 GitHub/API error or refused · 2 usage or environment (no token).`;

class UsageError extends Error {}

const mode = detectModeSafe();

function detectModeSafe() {
  try {
    return detectMode(process.env);
  } catch (err) {
    if (err instanceof GhEnvError) {
      process.stderr.write(`error: ${err.message}\n`);
      process.exit(2);
    }
    throw err;
  }
}

/** Child env, computed lazily: only commands that talk to GitHub need a token. */
let cachedEnv = null;
function env() {
  cachedEnv ??= ghEnv(mode, process.env, () =>
    execFileSync("gh", ["auth", "token", "-u", GH_ACCOUNT], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
  );
  return cachedEnv;
}

function run(args) {
  const r = spawnSync("gh", args, { env: env(), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error?.code === "ENOENT") throw new GhEnvError("gh CLI not found on PATH");
  return { code: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? (r.error ? String(r.error.message) : "") };
}

function github() {
  return createGitHub({ run });
}

function readStdin() {
  if (process.stdin.isTTY) throw new UsageError('--body-file -: stdin is a terminal (pipe or heredoc the text in)');
  return readFileSync(0, "utf8");
}

/** Run `fn(path)` with a real file for a --body-file value ("-" = stdin → temp file, removed afterwards). */
function withBodyFile(value, fn) {
  if (!value) throw new UsageError("--body-file <path|-> is required");
  if (value !== "-") return fn(value);
  const dir = mkdtempSync(join(tmpdir(), "mfw-gh-"));
  try {
    const file = join(dir, "body.md");
    writeFileSync(file, readStdin(), "utf8");
    return fn(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function opts(args, options, positionals = 0) {
  const parsed = parseArgs({ args, options, allowPositionals: true });
  if (parsed.positionals.length !== positionals) {
    throw new UsageError(`expected ${positionals} positional argument(s), got ${parsed.positionals.length}`);
  }
  return parsed;
}

function print(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
}

/** @param {{ merged: boolean }} result */
function finishLand(result) {
  print(result);
  process.exitCode = result.merged ? 0 : 1;
}

/**
 * Why `pr-create --verdicts` refuses: missing/failed verdict files, or loop-verify --check not passing.
 * @param {{ dir: string, key: string, base: string, auditors: string[] }} input
 * @returns {string[]}
 */
function verdictGateProblems({ dir, key, base, auditors }) {
  if (!/^MFW-\d+$/.test(key)) throw new UsageError("--key must look like MFW-<n>");
  if (base.startsWith("-") || base === "HEAD") throw new UsageError("--base must be a branch or ref other than HEAD, not an option");
  for (const a of auditors) {
    if (!["privacy-auditor", "r3f-perf-reviewer"].includes(a)) throw new UsageError(`--auditors: unknown role ${JSON.stringify(a)} (privacy-auditor, r3f-perf-reviewer)`);
  }
  const diff = spawnSync("git", ["diff", "--name-only", `${base}...HEAD`], { encoding: "utf8" });
  if (diff.status !== 0) return [`cannot list the changed paths (git diff ${base}...HEAD): ${String(diff.stderr).trim()}`];
  const roles = requiredVerdictRoles(diff.stdout.split("\n").filter(Boolean), auditors);
  const problems = verdictProblems({
    key,
    roles,
    read: (file) => (existsSync(join(dir, file)) ? readFileSync(join(dir, file), "utf8") : null),
  });
  const verify = spawnSync(
    process.execPath,
    [join(dirname(fileURLToPath(import.meta.url)), "loop-verify.mjs"), "--wt", process.cwd(), "--scratch", dir, "--key", key, "--check"],
    { encoding: "utf8" },
  );
  if (verify.status !== 0) problems.push(`loop-verify --check failed: ${(verify.stdout || verify.stderr).trim()}`);
  return problems;
}

const COMMANDS = {
  mode() {
    print({ mode, repo: REPO_SLUG });
  },
  preflight() {
    print(github().repoInfo());
  },
  git(args) {
    if (!args.length) throw new UsageError("git <git args…>");
    const r = spawnSync("git", gitNetArgs(mode, args), { env: env(), stdio: "inherit" });
    process.exitCode = r.status ?? 1;
  },
  "fetch-main"() {
    const probe = spawnSync("git", ["rev-parse", "--is-shallow-repository"], { encoding: "utf8" });
    const isShallow = (probe.stdout ?? "").trim() === "true";
    const r = spawnSync("git", gitNetArgs(mode, fetchMainArgs(isShallow)), { env: env(), stdio: "inherit" });
    process.exitCode = r.status ?? 1;
  },
  exec(args) {
    if (args[0] !== "--" || args.length < 2) throw new UsageError("exec -- <cmd> [args…]");
    const [cmd, ...rest] = args.slice(1);
    const r = spawnSync(cmd, rest, { env: env(), stdio: "inherit" });
    if (r.error) throw new GhEnvError(`cannot run ${cmd}: ${r.error.message}`);
    process.exitCode = r.status ?? 1;
  },
  "pr-create"(args) {
    const { values } = opts(args, {
      head: { type: "string" },
      title: { type: "string" },
      "body-file": { type: "string" },
      draft: { type: "boolean" },
      verdicts: { type: "string" },
      key: { type: "string" },
      base: { type: "string" },
      auditors: { type: "string" },
    });
    if (!values.head || !values.title) throw new UsageError("pr-create needs --head, --title and --body-file");
    if ((values.verdicts === undefined) !== (values.key === undefined)) throw new UsageError("--verdicts and --key go together");
    if (values.verdicts !== undefined) {
      const problems = verdictGateProblems({
        dir: values.verdicts,
        key: values.key,
        base: values.base ?? "origin/main",
        auditors: (values.auditors ?? "").split(",").filter(Boolean),
      });
      if (problems.length) {
        process.stderr.write(`error: pr-create refused, the verdict gate is not met:\n${problems.map((p) => `- ${p}`).join("\n")}\n`);
        print({ created: false, refused: problems });
        process.exitCode = 1;
        return;
      }
    }
    withBodyFile(values["body-file"], (bodyFile) =>
      print(github().prCreate({ head: values.head, title: values.title, bodyFile, draft: Boolean(values.draft) })),
    );
  },
  "pr-get"(args) {
    const { positionals } = opts(args, {}, 1);
    print(github().prGet(positionals[0]));
  },
  "pr-comment"(args) {
    const { values, positionals } = opts(args, { "body-file": { type: "string" } }, 1);
    withBodyFile(values["body-file"], (bodyFile) => print(github().prComment(positionals[0], bodyFile)));
  },
  "ticket-prs"(args) {
    const { positionals } = opts(args, {}, 1);
    if (!/^[1-9]\d{0,6}$/.test(positionals[0])) throw new UsageError("ticket-prs <N>: N is the number in MFW-<N>");
    print(github().ticketPrs(Number(positionals[0])));
  },
  "branch-prs"(args) {
    const { positionals } = opts(args, {}, 1);
    print(github().branchPrs(positionals[0]));
  },
  "pr-merge"(args) {
    const { values, positionals } = opts(
      args,
      { sha: { type: "string" }, risk: { type: "boolean" }, "owner-approved": { type: "boolean" } },
      1,
    );
    if (!isSha(values.sha)) throw new UsageError("pr-merge <pr> --sha <40 hex chars> [--risk]");
    const result = github().prMerge(positionals[0], values.sha, {
      risk: Boolean(values.risk),
      ownerApproved: Boolean(values["owner-approved"]),
    });
    print(result);
    process.exitCode = result.merged ? 0 : 1;
  },
  "pr-land"(args) {
    const { values, positionals } = opts(args, { sha: { type: "string" }, risk: { type: "boolean" }, ignore: { type: "string" } }, 1);
    if (!isSha(values.sha)) throw new UsageError("pr-land <pr> --sha <40 hex chars> [--risk] [--ignore <check-run-id>]");
    if (values.ignore !== undefined && !/^\d+$/.test(values.ignore)) throw new UsageError("--ignore needs a check-run id");
    const gh = github();
    const mergeOpts = { risk: Boolean(values.risk), ownerApproved: false };
    // Every pr-merge refusal is checked first, so an owner-merge PR does not wait for CI just to be refused.
    const early = gh.mergeRefusal(positionals[0], values.sha, mergeOpts);
    if (early) return finishLand(early);
    const waitCi = join(dirname(fileURLToPath(import.meta.url)), "wait-ci.sh");
    const r = spawnSync("bash", [waitCi, positionals[0], values.sha, ...(values.ignore ? [values.ignore] : [])], { env: env(), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const lines = (r.stdout ?? "").trim().split("\n");
    const gate = lines[lines.length - 1] ?? "";
    const pass = new RegExp(`^GATE: PASS sha=${values.sha} check-run=\\d+$`);
    if (r.status !== 0 || !pass.test(gate)) {
      return finishLand({ merged: false, reason: `ci gate not passed: ${gate || "no verdict line"}`, gate });
    }
    const result = gh.prMerge(positionals[0], values.sha, mergeOpts);
    finishLand({ ...result, gate });
  },
  "ci-info"(args) {
    const { values, positionals } = opts(args, { ignore: { type: "string" } }, 1);
    if (values.ignore !== undefined && !/^\d+$/.test(values.ignore)) throw new UsageError("--ignore needs a check-run id");
    print(github().ciInfo(positionals[0], values.ignore ?? null));
  },
  "ci-rerun"(args) {
    const { positionals } = opts(args, {}, 1);
    print(github().ciRerun(positionals[0]));
  },
  "release-ff"(args) {
    const { values } = opts(args, { sha: { type: "string" }, check: { type: "boolean" }, "owner-approved": { type: "boolean" } });
    if (!isSha(values.sha)) throw new UsageError("release-ff --sha <40 hex chars> [--check] [--owner-approved]");
    const result = github().releaseFastForward(values.sha, {
      ownerApproved: Boolean(values["owner-approved"]),
      check: Boolean(values.check),
    });
    print(result);
    process.exitCode = result.reason === null ? 0 : 1;
  },
};

function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === "--help" || cmd === "-h" || cmd === "help") {
    process.stdout.write(USAGE + "\n");
    return;
  }
  if (!cmd || !Object.hasOwn(COMMANDS, cmd)) throw new UsageError(cmd ? `unknown command ${JSON.stringify(cmd)}` : "missing command");
  COMMANDS[cmd](rest);
}

try {
  main(process.argv.slice(2));
} catch (err) {
  if (err instanceof GhEnvError) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exitCode = 2;
  } else if (err instanceof UsageError || err?.code?.startsWith?.("ERR_PARSE_ARGS")) {
    process.stderr.write(`error: ${err.message}\n\n${USAGE}\n`);
    process.exitCode = 2;
  } else if (err instanceof GhApiError) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exitCode = 1;
  } else {
    process.stderr.write(`error: ${err?.message ?? err}\n`);
    process.exitCode = 1;
  }
}
