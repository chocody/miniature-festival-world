#!/usr/bin/env node
// Pre-commit guard used by loop-ticket (Step 6) before every commit:
//   node scripts/precommit-guard.mjs
// Inspects what is STAGED (`git diff --cached`): refuses secret/generated files by path and secret-looking
// values in added lines. Prints JSON {ok, pathViolations, secretViolations}; exit 1 when anything is found.
// The pure checks are exported and unit-tested in tests/unit/precommit-guard.test.ts.

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** @type {{ re: RegExp, why: string }[]} matched against the file's basename */
const FORBIDDEN_BASENAMES = [
  { re: /^\.env(\..*)?$/, why: ".env file" },
  { re: /\.env$/, why: "*.env file" },
  { re: /\.env\./, why: "*.env.* file" },
  { re: /^jira\.env$/, why: "Jira credentials file" },
  { re: /\.pem$/, why: "PEM key/certificate" },
  { re: /\.key$/, why: "private key file" },
  { re: /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/, why: "SSH key" },
  { re: /credentials.*\.json$/i, why: "credentials JSON" },
  { re: /\.tsbuildinfo$/, why: "generated tsbuildinfo" },
];

/** @type {{ re: RegExp, why: string }[]} matched against any directory segment */
const FORBIDDEN_DIRS = [
  { re: /^\.next$/, why: "Next.js build output" },
  { re: /^node_modules$/, why: "dependencies" },
  { re: /^test-results$/, why: "Playwright output" },
  { re: /^playwright-report$/, why: "Playwright report" },
  { re: /^\.vercel$/, why: "Vercel project link" },
  { re: /^coverage$/, why: "coverage output" },
];

/** Values, not names: placeholders such as `JIRA_API_TOKEN=<API token>` in docs are allowed. */
const SECRET_PATTERNS = [
  { re: /JIRA_API_TOKEN\s*=\s*(?![<$"'`{\s]|$)\S{8,}/, why: "JIRA_API_TOKEN value" },
  { re: /\bATATT[A-Za-z0-9_\-=]{20,}/, why: "Atlassian API token" },
  { re: /\bghp_[A-Za-z0-9]{20,}/, why: "GitHub personal access token" },
  { re: /\bgithub_pat_[A-Za-z0-9_]{20,}/, why: "GitHub fine-grained token" },
  { re: /\bgho_[A-Za-z0-9]{20,}/, why: "GitHub OAuth token" },
  { re: /\bghs_[A-Za-z0-9]{20,}/, why: "GitHub app token" },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, why: "private key block" },
  { re: /SUPABASE_SERVICE_ROLE_KEY\s*=\s*(?![<$"'`{\s]|$)\S{8,}/, why: "Supabase service-role key value" },
];

/**
 * @param {string[]} paths repo-relative paths (forward slashes)
 * @returns {{ path: string, why: string }[]}
 */
export function pathViolations(paths) {
  const out = [];
  for (const p of paths) {
    const parts = p.split("/").filter(Boolean);
    const base = parts[parts.length - 1] ?? "";
    const hitBase = FORBIDDEN_BASENAMES.find((f) => f.re.test(base));
    const hitDir = parts.slice(0, -1).map((seg) => FORBIDDEN_DIRS.find((f) => f.re.test(seg))).find(Boolean);
    const hit = hitBase ?? hitDir;
    if (hit) out.push({ path: p, why: hit.why });
  }
  return out;
}

/**
 * Scan the ADDED lines of a unified diff (`git diff --cached -U0`) for secret-looking values.
 * Reports file and pattern only — never the matched value.
 * @param {string} diff
 * @returns {{ file: string, why: string }[]}
 */
export function secretViolations(diff) {
  const out = [];
  let file = "";
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      file = line.slice(4).replace(/^b\//, "");
      continue;
    }
    if (!line.startsWith("+")) continue;
    for (const pat of SECRET_PATTERNS) {
      if (pat.re.test(line.slice(1))) out.push({ file, why: pat.why });
    }
  }
  return out;
}

function main() {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const git = (/** @type {string[]} */ args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const staged = git(["diff", "--cached", "--name-only", "-z"]).split("\0").filter(Boolean);
  const diff = git(["diff", "--cached", "-U0", "--no-color", "--no-ext-diff"]);
  const result = {
    ok: true,
    staged: staged.length,
    pathViolations: pathViolations(staged),
    secretViolations: secretViolations(diff),
  };
  result.ok = result.pathViolations.length === 0 && result.secretViolations.length === 0 && staged.length > 0;
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (!staged.length) process.stderr.write("nothing is staged\n");
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
