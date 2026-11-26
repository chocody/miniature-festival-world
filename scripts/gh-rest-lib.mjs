// Pure logic for scripts/gh-rest.mjs: no process, filesystem or network access except through
// the injected `run`. Unit-tested in tests/unit/gh-rest-lib.test.ts.
//
// Everything talks to GitHub through `gh api` (REST). GraphQL-backed gh subcommands (`gh pr ...`,
// `gh repo view`, ...) are blocked in Claude Code cloud sessions and are never used here.

export const REPO_SLUG = "chocody/miniature-festival-world";
export const REPO_OWNER = "chocody";
/** The gh account used locally (the machine's default gh account is someone else). */
export const GH_ACCOUNT = "chocody";
export const GH_PROXY_PLACEHOLDER = "proxy-injected";
export const CI_CHECK_NAME = "ci";
export const LOG_TAIL_LINES = 200;
export const LOG_MAX_CHARS = 20000;

/** Bad usage of the environment (no token, bad mode): the CLI exits 2. */
export class GhEnvError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "GhEnvError";
  }
}

/** A GitHub API call failed: the CLI exits 1. */
export class GhApiError extends Error {
  /** @param {string} message @param {{ status?: number | null, stderr?: string }} [info] */
  constructor(message, { status = null, stderr = "" } = {}) {
    super(message);
    this.name = "GhApiError";
    this.status = status;
    this.stderr = stderr;
  }
}

/**
 * `MFW_GH_MODE=cloud|local` wins; otherwise cloud iff CLAUDE_CODE_REMOTE is set (not "0"/"false").
 * @param {Record<string, string | undefined>} env
 * @returns {"cloud" | "local"}
 */
export function detectMode(env) {
  const forced = (env.MFW_GH_MODE ?? "").trim();
  if (forced === "cloud" || forced === "local") return forced;
  if (forced) throw new GhEnvError('MFW_GH_MODE must be "cloud" or "local"');
  const remote = (env.CLAUDE_CODE_REMOTE ?? "").trim().toLowerCase();
  return remote && remote !== "0" && remote !== "false" ? "cloud" : "local";
}

/**
 * Child env for gh/git. Cloud: the network proxy authenticates, GH_TOKEN stays (placeholder if empty) and
 * `tokenFn` is never called. Local: GH_TOKEN comes from `tokenFn` (the chocody account's token).
 * @param {"cloud" | "local"} mode
 * @param {Record<string, string | undefined>} env
 * @param {() => string} tokenFn
 */
export function ghEnv(mode, env, tokenFn) {
  if (mode === "cloud") {
    return { ...env, GH_TOKEN: env.GH_TOKEN?.trim() ? env.GH_TOKEN : GH_PROXY_PLACEHOLDER };
  }
  let token = "";
  try {
    token = String(tokenFn() ?? "").trim();
  } catch {
    token = "";
  }
  if (!token) {
    throw new GhEnvError(
      "cannot get a GitHub token for account chocody: run `gh auth login` for chocody (gh auth token -u chocody must work), or set MFW_GH_MODE=cloud in a cloud session",
    );
  }
  return { ...env, GH_TOKEN: token };
}

/**
 * @param {"cloud" | "local"} mode
 * @param {string[]} gitArgs
 * @returns {string[]}
 */
export function gitNetArgs(mode, gitArgs) {
  if (mode === "cloud") return ["-c", "push.negotiate=true", ...gitArgs];
  return ["-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential", ...gitArgs];
}

/**
 * Cloud clones are shallow: rebasing needs history, but `--depth` must never be used on a full clone.
 * @param {boolean} isShallow
 * @returns {string[]}
 */
export function fetchMainArgs(isShallow) {
  return isShallow ? ["fetch", "--depth=50", "origin", "main"] : ["fetch", "origin", "main"];
}

/** @param {string} stderr @returns {number | null} */
export function parseHttpStatus(stderr) {
  const m = /\(HTTP (\d{3})\)/.exec(stderr ?? "");
  return m ? Number(m[1]) : null;
}

/** @param {unknown} s */
export const isSha = (s) => typeof s === "string" && /^[0-9a-f]{40}$/.test(s);
/** @param {unknown} s */
export const isBranchName = (s) => typeof s === "string" && /^(feat|fix)\/MFW-\d+-[a-z0-9-]{1,40}$/.test(s);
/** @param {unknown} s */
export const isPrNumber = (s) => /^[1-9]\d{0,6}$/.test(String(s));

/** Matches the existing squash subjects on main: `<title> (#<n>)`. @param {string} prTitle @param {number | string} n */
export function squashTitle(prTitle, n) {
  return `${prTitle} (#${n})`;
}

/**
 * @param {any} raw GET pulls/{n} or POST pulls response
 */
export function summarizePr(raw) {
  return {
    number: raw?.number ?? null,
    url: raw?.html_url ?? null,
    title: raw?.title ?? "",
    state: raw?.state ?? "",
    merged: raw?.merged === true,
    draft: raw?.draft === true,
    headSha: raw?.head?.sha ?? null,
    headRef: raw?.head?.ref ?? null,
    baseRef: raw?.base?.ref ?? null,
    mergeCommitSha: raw?.merged ? (raw?.merge_commit_sha ?? null) : null,
    mergeable: raw?.mergeable ?? null,
    labels: (Array.isArray(raw?.labels) ? raw.labels : []).map((/** @type {any} */ l) => String(l?.name ?? l)),
  };
}

/** Labels that mean the owner, not the loop, merges (AC6). */
export const OWNER_MERGE_LABELS = ["owner-merge", "privacy", "db", "migration"];

/**
 * Why a PR must be merged by the owner: a supabase/ path, a risk label on the PR, or the caller's `--risk`.
 * @param {{ paths: string[], labels: string[], risk?: boolean }} input
 * @returns {string[]} empty when the loop may merge
 */
export function ownerMergeReasons({ paths, labels, risk = false }) {
  /** @type {string[]} */
  const reasons = [];
  if (risk) reasons.push("ticket carries a privacy/db/migration label (--risk)");
  for (const l of OWNER_MERGE_LABELS) if (labels.includes(l)) reasons.push(`PR label ${l}`);
  const sb = paths.find((p) => p.startsWith("supabase/"));
  if (sb) reasons.push(`changed path ${sb} is under supabase/`);
  return reasons;
}

/** First line of every reviewing agent's report (loop-ticket §4.4). */
export const VERDICT_RE = /^VERDICT: (PASS|FIX FIRST|GOAL NOT MET)\s*$/;
export const PRIVACY_AUDITOR_PATHS = ["src/services/", "supabase/", "src/app/api/"];
export const PERF_REVIEWER_PATHS = [
  "src/components/canvas3d/",
  "src/components/models/",
  "src/core/effects/",
  "src/core/world/",
  "src/core/fallback2d/",
];

/**
 * Reports that must exist and say `VERDICT: PASS` before a PR is opened: reviewer and qa always; an auditor when a
 * changed path is in its table row of CLAUDE.md (`extra` adds roles the caller knows from ticket labels).
 * @param {string[]} paths changed paths
 * @param {string[]} [extra] "privacy-auditor" | "r3f-perf-reviewer"
 */
export function requiredVerdictRoles(paths, extra = []) {
  const roles = new Set(["reviewer", "qa", ...extra]);
  if (paths.some((p) => PRIVACY_AUDITOR_PATHS.some((x) => p.startsWith(x)))) roles.add("privacy-auditor");
  if (paths.some((p) => PERF_REVIEWER_PATHS.some((x) => p.startsWith(x)))) roles.add("r3f-perf-reviewer");
  return [...roles];
}

/**
 * Why the verdict gate refuses (empty = every required report is present and PASS).
 * @param {{ key: string, roles: string[], read: (file: string) => string | null }} input `read` gets `<KEY>-<role>.md`
 * @returns {string[]}
 */
export function verdictProblems({ key, roles, read }) {
  /** @type {string[]} */
  const problems = [];
  for (const role of roles) {
    const file = `${key}-${role}.md`;
    const text = read(file);
    if (text === null) {
      problems.push(`missing ${file} (the ${role} report is required)`);
      continue;
    }
    const first = text.split("\n").find((l) => l.trim() !== "") ?? "";
    if (!VERDICT_RE.test(first.trim())) problems.push(`${file}: first line must be "VERDICT: PASS|FIX FIRST|GOAL NOT MET", got ${JSON.stringify(first.slice(0, 60))}`);
    else if (first.trim() !== "VERDICT: PASS") problems.push(`${file}: ${first.trim()}, needs VERDICT: PASS`);
  }
  return problems;
}

/**
 * Open PRs of ticket N: head ref contains "/MFW-<N>-" (MFW-12 never matches MFW-120).
 * @param {any[]} pulls
 * @param {number} n
 */
export function ticketPrs(pulls, n) {
  const re = new RegExp(`/MFW-${Number(n)}-`);
  return (Array.isArray(pulls) ? pulls : []).filter((p) => re.test(String(p?.head?.ref ?? ""))).map(summarizePr);
}

/**
 * @param {any} checkRunsJson body of commits/{sha}/check-runs
 * @param {string | null} [ignoreId]
 */
export function selectCiRun(checkRunsJson, ignoreId = null) {
  const runs = (checkRunsJson?.check_runs ?? []).filter(
    (/** @type {any} */ r) => r?.name === CI_CHECK_NAME && (ignoreId === null || String(r.id) !== String(ignoreId)),
  );
  const r = runs.length === 1 ? runs[0] : null;
  return {
    count: runs.length,
    run: r
      ? {
          id: r.id,
          status: r.status,
          conclusion: r.conclusion ?? null,
          htmlUrl: r.html_url ?? null,
          detailsUrl: r.details_url ?? null,
          title: r.output?.title ?? null,
          summary: r.output?.summary ?? null,
          text: r.output?.text ?? null,
        }
      : null,
  };
}

/**
 * @param {string | null | undefined} url e.g. https://github.com/o/r/actions/runs/123/job/456
 * @returns {{ runId: string, jobId: string | null } | null}
 */
export function actionsIdsFromUrl(url) {
  const m = /\/actions\/runs\/(\d+)(?:\/job\/(\d+))?/.exec(url ?? "");
  return m ? { runId: m[1], jobId: m[2] ?? null } : null;
}

/** Last `n` lines, then the last `maxChars` characters. @param {string} text */
export function tailLines(text, n = LOG_TAIL_LINES, maxChars = LOG_MAX_CHARS) {
  const lines = String(text ?? "").split("\n");
  const tail = lines.slice(-n).join("\n");
  return tail.length > maxChars ? tail.slice(-maxChars) : tail;
}

/**
 * The follow-up GET decides, never the PUT exit code.
 * @param {{ after: ReturnType<typeof summarizePr>, sha: string }} input
 * @returns {{ merged: true, mergeCommitSha: string } | { merged: false, reason: string }}
 */
export function mergeVerdict({ after, sha }) {
  if (after.merged === true && after.headSha === sha && after.mergeCommitSha) {
    return { merged: true, mergeCommitSha: after.mergeCommitSha };
  }
  if (after.merged === true && after.headSha !== sha) {
    return { merged: false, reason: `PR merged with head ${after.headSha}, expected ${sha}` };
  }
  return { merged: false, reason: `PR is not merged (state ${after.state || "unknown"})` };
}

/**
 * @param {{
 *   run: (args: string[], opts?: { input?: string }) => { code: number, stdout: string, stderr: string },
 *   repo?: string,
 * }} deps `run` executes `gh <args>` with the child env already prepared
 */
export function createGitHub({ run, repo = REPO_SLUG }) {
  /**
   * @param {"GET" | "POST" | "PUT" | "DELETE"} method
   * @param {string} path
   * @param {string[]} [fields] `-f k=v` / `-F k=v` pairs, flattened
   * @param {{ raw?: boolean }} [opts] raw: return stdout unparsed (job logs are text)
   */
  function api(method, path, fields = [], opts = {}) {
    const args = ["api", "-X", method, "-H", "Accept: application/vnd.github+json", path, ...fields];
    const attempts = method === "GET" ? 3 : 1;
    /** @type {GhApiError | null} */
    let last = null;
    for (let i = 0; i < attempts; i++) {
      const r = run(args);
      if (r.code === 0) {
        if (opts.raw) return r.stdout;
        const text = r.stdout.trim();
        return text ? JSON.parse(text) : null;
      }
      const status = parseHttpStatus(r.stderr);
      const firstLine = String(r.stderr).split("\n").find((l) => l.trim()) ?? "";
      last = new GhApiError(`gh api ${method} ${path} failed (HTTP ${status ?? "?"}): ${firstLine}`, {
        status,
        stderr: r.stderr,
      });
      if (status !== null && status < 500) break; // only transient failures are worth a retry
    }
    throw last;
  }

  /** @param {number | string} n */
  function checkPr(n) {
    if (!isPrNumber(n)) throw new GhEnvError(`invalid PR number ${JSON.stringify(n)}`);
    return String(n);
  }

  function repoInfo() {
    const raw = api("GET", `repos/${repo}`);
    return {
      fullName: raw?.full_name ?? repo,
      defaultBranch: raw?.default_branch ?? null,
      deleteBranchOnMerge: raw?.delete_branch_on_merge === true,
    };
  }

  /** @param {{ head: string, title: string, bodyFile: string, draft?: boolean }} input */
  function prCreate({ head, title, bodyFile, draft }) {
    if (!isBranchName(head)) throw new GhEnvError(`invalid branch name ${JSON.stringify(head)}`);
    if (!String(title ?? "").trim()) throw new GhEnvError("PR title is empty");
    if (!String(bodyFile ?? "").trim()) throw new GhEnvError("PR body file is missing");
    const fields = ["-f", `title=${title}`, "-f", `head=${head}`, "-f", "base=main", "-F", `body=@${bodyFile}`];
    if (draft) fields.push("-F", "draft=true");
    return summarizePr(api("POST", `repos/${repo}/pulls`, fields));
  }

  /** @param {number | string} n */
  function prGet(n) {
    return summarizePr(api("GET", `repos/${repo}/pulls/${checkPr(n)}`));
  }

  /** @param {number | string} n @param {string} bodyFile */
  function prComment(n, bodyFile) {
    if (!String(bodyFile ?? "").trim()) throw new GhEnvError("comment body file is missing");
    const raw = api("POST", `repos/${repo}/issues/${checkPr(n)}/comments`, ["-F", `body=@${bodyFile}`]);
    return { id: raw?.id ?? null, url: raw?.html_url ?? null };
  }

  /** @param {number} n */
  function ticketPrsOf(n) {
    if (!Number.isInteger(n) || n < 1) throw new GhEnvError(`invalid ticket number ${JSON.stringify(n)}`);
    return ticketPrs(api("GET", `repos/${repo}/pulls?state=open&per_page=100`), n);
  }

  /** @param {string} branch */
  function branchPrs(branch) {
    if (!isBranchName(branch)) throw new GhEnvError(`invalid branch name ${JSON.stringify(branch)}`);
    const pulls = api("GET", `repos/${repo}/pulls?state=all&head=${REPO_OWNER}:${branch}&per_page=100`);
    return (Array.isArray(pulls) ? pulls : []).map(summarizePr);
  }

  /** Paths changed by the PR (paginated). @param {number | string} n */
  function prFiles(n) {
    /** @type {string[]} */
    const paths = [];
    for (let page = 1; page <= 30; page++) {
      const raw = api("GET", `repos/${repo}/pulls/${checkPr(n)}/files?per_page=100&page=${page}`);
      const list = Array.isArray(raw) ? raw : [];
      for (const f of list) {
        paths.push(String(f?.filename ?? ""));
        if (f?.previous_filename) paths.push(String(f.previous_filename));
      }
      if (list.length < 100) return paths;
    }
    throw new GhApiError("PR has more than 3000 changed files; refusing to judge it");
  }

  /**
   * The refusals of pr-merge, as a value: null when the PR may be merged now. pr-land asks this before it waits for CI.
   * @param {number | string} n @param {string} sha
   * @param {{ risk?: boolean, ownerApproved?: boolean }} [opts]
   */
  function mergeRefusal(n, sha, opts = {}) {
    return mergeCheck(n, sha, opts).refusal;
  }

  /** @param {number | string} n @param {string} sha @param {{ risk?: boolean, ownerApproved?: boolean }} opts */
  function mergeCheck(n, sha, opts) {
    if (!isSha(sha)) throw new GhEnvError("pr-merge needs --sha <40 hex chars>");
    const before = prGet(n);
    /** @param {string} reason */
    const refuse = (reason) => ({ before, refusal: { merged: false, reason, before } });
    if (before.state !== "open") return refuse(`PR is ${before.state}, not open`);
    if (before.draft) return refuse("PR is a draft");
    if (before.headSha !== sha) return refuse(`PR head is ${before.headSha}, expected ${sha}`);
    if (!opts.ownerApproved) {
      const reasons = ownerMergeReasons({ paths: prFiles(n), labels: before.labels, risk: opts.risk });
      if (reasons.length) return refuse(`owner-merge required: ${reasons.join("; ")}`);
    }
    return { before, refusal: null };
  }

  /**
   * Squash merge pinned to `sha`. Refuses (no PUT) unless the PR is open, not a draft and its head is `sha`,
   * and refuses privacy/db/migration work (supabase/ paths, risk labels, `risk`) unless `ownerApproved`.
   * The follow-up GET decides whether it merged, not the PUT result.
   * @param {number | string} n @param {string} sha
   * @param {{ risk?: boolean, ownerApproved?: boolean }} [opts]
   */
  function prMerge(n, sha, opts = {}) {
    const { before, refusal } = mergeCheck(n, sha, opts);
    if (refusal) return refusal;
    /** @type {{ status: number | null, message: string } | null} */
    let putError = null;
    try {
      api("PUT", `repos/${repo}/pulls/${checkPr(n)}/merge`, [
        "-f",
        "merge_method=squash",
        "-f",
        `sha=${sha}`,
        "-f",
        `commit_title=${squashTitle(before.title, n)}`,
      ]);
    } catch (err) {
      if (!(err instanceof GhApiError)) throw err;
      putError = { status: err.status, message: err.message };
    }
    const after = prGet(n);
    return { ...mergeVerdict({ after, sha }), putError, before, after };
  }

  /** @param {string} sha @param {string | null} [ignoreId] */
  function ciRunOf(sha, ignoreId = null) {
    if (!isSha(sha)) throw new GhEnvError("expected a 40-char sha");
    const json = api("GET", `repos/${repo}/commits/${sha}/check-runs?check_name=ci&filter=latest&per_page=100`);
    const sel = selectCiRun(json, ignoreId);
    if (sel.count !== 1 || !sel.run) throw new GhApiError(`expected one ci check-run on ${sha}, found ${sel.count}`);
    return sel.run;
  }

  /** @param {string} sha @param {string | null} [ignoreId] */
  function ciInfo(sha, ignoreId = null) {
    const run = ciRunOf(sha, ignoreId);
    /** @type {any[]} */
    let annotations = [];
    /** @type {string | null} */
    let annotationsError = null;
    try {
      const raw = api("GET", `repos/${repo}/check-runs/${run.id}/annotations?per_page=50`);
      annotations = (Array.isArray(raw) ? raw : []).map((/** @type {any} */ a) => ({
        path: a?.path ?? null,
        line: a?.start_line ?? null,
        level: a?.annotation_level ?? null,
        message: a?.message ?? "",
        title: a?.title ?? null,
      }));
    } catch (err) {
      annotationsError = err instanceof Error ? err.message : String(err);
    }
    const ids = actionsIdsFromUrl(run.detailsUrl ?? run.htmlUrl);
    /** @type {string | null} */
    let logsTail = null;
    /** @type {string | null} */
    let logsError = null;
    if (ids?.jobId) {
      try {
        logsTail = tailLines(String(api("GET", `repos/${repo}/actions/jobs/${ids.jobId}/logs`, [], { raw: true })));
      } catch (err) {
        logsError = err instanceof Error ? err.message : String(err);
      }
    } else {
      logsError = "no Actions job id in the check-run URL";
    }
    return {
      checkRun: run,
      runId: ids?.runId ?? null,
      jobId: ids?.jobId ?? null,
      annotations,
      annotationsError,
      logsTail,
      logsError,
    };
  }

  /** Re-run the failed jobs of the ci workflow run. May be refused from cloud sessions: the skill PARKs on that. @param {string} sha */
  function ciRerun(sha) {
    const run = ciRunOf(sha);
    const ids = actionsIdsFromUrl(run.detailsUrl ?? run.htmlUrl);
    if (!ids) throw new GhApiError("cannot find the Actions run id of the ci check-run");
    api("POST", `repos/${repo}/actions/runs/${ids.runId}/rerun-failed-jobs`);
    return { rerun: true, runId: ids.runId, previousCheckRunId: run.id };
  }

  return { repoInfo, prCreate, prGet, prComment, ticketPrs: ticketPrsOf, branchPrs, prMerge, mergeRefusal, ciInfo, ciRerun };
}
