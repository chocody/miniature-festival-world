// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  GhApiError,
  GhEnvError,
  actionsIdsFromUrl,
  createGitHub,
  detectMode,
  fetchMainArgs,
  ghEnv,
  gitNetArgs,
  isBranchName,
  parseHttpStatus,
  requiredVerdictRoles,
  verdictProblems,
  selectCiRun,
  squashTitle,
  summarizePr,
  tailLines,
  ticketPrs,
} from "../../scripts/gh-rest-lib.mjs";

const SHA = "a".repeat(40);
const OTHER = "b".repeat(40);
const REPO = "repos/chocody/miniature-festival-world";

type Reply = { code?: number; stdout?: string; stderr?: string };
const ok = (body: unknown): Reply => ({ code: 0, stdout: typeof body === "string" ? body : JSON.stringify(body), stderr: "" });
const fail = (status: number, msg = "boom"): Reply => ({ code: 1, stdout: "", stderr: `gh: ${msg} (HTTP ${status})\n` });

/** `run` that returns the queued replies in order and records the args. */
function fakeRun(replies: Reply[]) {
  const calls: string[][] = [];
  const run = vi.fn((args: string[]) => {
    calls.push(args);
    const r = replies.shift() ?? { code: 99, stdout: "", stderr: "no reply queued" };
    return { code: r.code ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  });
  return { run, calls };
}

const prJson = (over: Record<string, unknown> = {}) => ({
  number: 7,
  html_url: "https://github.com/chocody/miniature-festival-world/pull/7",
  title: "feat(x): y MFW-9",
  state: "open",
  merged: false,
  draft: false,
  head: { sha: SHA, ref: "feat/MFW-9-y" },
  base: { ref: "main" },
  merge_commit_sha: null,
  mergeable: true,
  ...over,
});

describe("detectMode", () => {
  it("defaults to local and detects the cloud marker", () => {
    expect(detectMode({})).toBe("local");
    expect(detectMode({ CLAUDE_CODE_REMOTE: "true" })).toBe("cloud");
    expect(detectMode({ CLAUDE_CODE_REMOTE: "false" })).toBe("local");
    expect(detectMode({ CLAUDE_CODE_REMOTE: "0" })).toBe("local");
  });
  it("lets MFW_GH_MODE override and rejects junk", () => {
    expect(detectMode({ MFW_GH_MODE: "local", CLAUDE_CODE_REMOTE: "1" })).toBe("local");
    expect(detectMode({ MFW_GH_MODE: "cloud" })).toBe("cloud");
    expect(() => detectMode({ MFW_GH_MODE: "x" })).toThrow(GhEnvError);
  });
});

describe("ghEnv", () => {
  it("cloud never calls the token function and fills a placeholder", () => {
    const tokenFn = vi.fn(() => "real");
    expect(ghEnv("cloud", {}, tokenFn).GH_TOKEN).toBe("proxy-injected");
    expect(ghEnv("cloud", { GH_TOKEN: "keep" }, tokenFn).GH_TOKEN).toBe("keep");
    expect(tokenFn).not.toHaveBeenCalled();
  });
  it("local takes the trimmed chocody token", () => {
    expect(ghEnv("local", { FOO: "1" }, () => " tok\n")).toMatchObject({ GH_TOKEN: "tok", FOO: "1" });
  });
  it("local fails clearly without leaking anything", () => {
    for (const tokenFn of [() => "", () => { throw new Error("secret-detail"); }]) {
      const err = (() => {
        try {
          ghEnv("local", {}, tokenFn);
        } catch (e) {
          return e as Error;
        }
      })();
      expect(err).toBeInstanceOf(GhEnvError);
      expect(err!.message).toContain("gh auth login");
      expect(err!.message).not.toContain("secret-detail");
    }
  });
});

describe("git helpers", () => {
  it("builds networked git args per mode", () => {
    expect(gitNetArgs("cloud", ["push"])).toEqual(["-c", "push.negotiate=true", "push"]);
    expect(gitNetArgs("local", ["push"])).toEqual([
      "-c",
      "credential.helper=",
      "-c",
      "credential.helper=!gh auth git-credential",
      "push",
    ]);
  });
  it("uses --depth only for shallow clones", () => {
    expect(fetchMainArgs(true)).toEqual(["fetch", "--depth=50", "origin", "main"]);
    expect(fetchMainArgs(false)).toEqual(["fetch", "origin", "main"]);
  });
});

describe("small parsers", () => {
  it("parses the HTTP status from gh stderr", () => {
    expect(parseHttpStatus("gh: Not Found (HTTP 404)")).toBe(404);
    expect(parseHttpStatus("some other failure")).toBeNull();
  });
  it("validates branch names", () => {
    expect(isBranchName("feat/MFW-43-cloud-ready-loop")).toBe(true);
    expect(isBranchName("fix/MFW-1-a")).toBe(true);
    for (const bad of ["main", "feat/MFW-43-Bad", "feat/MFW-43-x;rm"]) expect(isBranchName(bad)).toBe(false);
  });
  it("matches existing squash subjects", () => {
    expect(squashTitle("feat(x): y MFW-9", 8)).toBe("feat(x): y MFW-9 (#8)");
  });
  it("summarizes a PR and hides the merge sha until merged", () => {
    expect(summarizePr(prJson())).toMatchObject({ number: 7, state: "open", merged: false, headSha: SHA, mergeCommitSha: null });
    expect(summarizePr(prJson({ merged: true, state: "closed", merge_commit_sha: OTHER }))).toMatchObject({
      merged: true,
      mergeCommitSha: OTHER,
    });
  });
  it("filters ticket PRs without confusing MFW-12 and MFW-120", () => {
    const pulls = [
      prJson({ head: { ref: "feat/MFW-12-a", sha: SHA } }),
      prJson({ head: { ref: "fix/MFW-12-b", sha: SHA } }),
      prJson({ head: { ref: "feat/MFW-120-c", sha: SHA } }),
    ];
    expect(ticketPrs(pulls, 12).map((p) => p.headRef)).toEqual(["feat/MFW-12-a", "fix/MFW-12-b"]);
  });
  it("selects the single ci check-run", () => {
    const body = { check_runs: [{ id: 11, name: "ci", status: "completed", conclusion: "success", html_url: "h", details_url: "d" }, { id: 12, name: "vercel" }] };
    expect(selectCiRun(body, null)).toMatchObject({ count: 1, run: { id: 11, conclusion: "success", htmlUrl: "h", detailsUrl: "d" } });
    const two = { check_runs: [{ id: 10, name: "ci" }, { id: 11, name: "ci" }] };
    expect(selectCiRun(two, null)).toEqual({ count: 2, run: null });
    expect(selectCiRun(two, "10")).toMatchObject({ count: 1, run: { id: 11 } });
  });
  it("extracts Actions ids from URLs", () => {
    expect(actionsIdsFromUrl("https://github.com/o/r/actions/runs/123/job/456")).toEqual({ runId: "123", jobId: "456" });
    expect(actionsIdsFromUrl("https://github.com/o/r/actions/runs/123")).toEqual({ runId: "123", jobId: null });
    expect(actionsIdsFromUrl("https://example.com/x")).toBeNull();
    expect(actionsIdsFromUrl(null)).toBeNull();
  });
  it("tails by lines then by characters", () => {
    const text = Array.from({ length: 300 }, (_, i) => `line ${i}`).join("\n");
    const tail = tailLines(text);
    expect(tail.split("\n")).toHaveLength(200);
    expect(tail.endsWith("line 299")).toBe(true);
    expect(tailLines("x".repeat(100), 10, 20)).toHaveLength(20);
  });
});

describe("createGitHub", () => {
  it("creates a PR with the expected REST call", () => {
    const { run, calls } = fakeRun([ok(prJson()), ok(prJson())]);
    const gh = createGitHub({ run });
    gh.prCreate({ head: "feat/MFW-43-x", title: "feat: t", bodyFile: "/tmp/b.md" });
    const a = calls[0];
    expect(a).toEqual(expect.arrayContaining(["-X", "POST", `${REPO}/pulls`, "-f", "title=feat: t", "head=feat/MFW-43-x", "base=main", "body=@/tmp/b.md"]));
    expect(a.join(" ")).toContain("-f head=feat/MFW-43-x");
    expect(a.join(" ")).toContain("-F body=@/tmp/b.md");
    expect(a.join(" ")).not.toContain("draft");
    gh.prCreate({ head: "feat/MFW-43-x", title: "feat: t", bodyFile: "/tmp/b.md", draft: true });
    expect(calls[1].join(" ")).toContain("-F draft=true");
  });

  it("rejects an invalid head before calling gh", () => {
    const { run } = fakeRun([]);
    expect(() => createGitHub({ run }).prCreate({ head: "main", title: "t", bodyFile: "/tmp/b" })).toThrow(GhEnvError);
    expect(run).not.toHaveBeenCalled();
  });

  it("merges pinned to the sha and lets the follow-up GET decide", () => {
    const { run, calls } = fakeRun([ok(prJson()), ok([]), ok({ merged: true }), ok(prJson({ merged: true, state: "closed", merge_commit_sha: OTHER }))]);
    const res = createGitHub({ run }).prMerge(7, SHA);
    expect(res).toMatchObject({ merged: true, mergeCommitSha: OTHER, putError: null });
    expect(calls.map((c) => c[2])).toEqual(["GET", "GET", "PUT", "GET"]);
    const put = calls[2].join(" ");
    expect(put).toContain("-f merge_method=squash");
    expect(put).toContain(`-f sha=${SHA}`);
    expect(put).toContain("-f commit_title=feat(x): y MFW-9 (#7)");
  });

  it("refuses on head mismatch, closed or draft PRs without any PUT", () => {
    for (const over of [{ head: { sha: OTHER, ref: "feat/MFW-9-y" } }, { state: "closed" }, { draft: true }]) {
      const { run, calls } = fakeRun([ok(prJson(over))]);
      const res = createGitHub({ run }).prMerge(7, SHA);
      expect(res.merged).toBe(false);
      expect(calls).toHaveLength(1);
      expect(calls.some((c) => c.includes("PUT"))).toBe(false);
    }
    const { run } = fakeRun([ok(prJson({ head: { sha: OTHER, ref: "feat/MFW-9-y" } }))]);
    expect(createGitHub({ run }).prMerge(7, SHA)).toMatchObject({ reason: expect.stringContaining(SHA) });
  });

  it("reports a refused PUT when the PR is still not merged", () => {
    const { run } = fakeRun([ok(prJson()), ok([]), fail(405, "Pull Request is not mergeable"), ok(prJson())]);
    const res = createGitHub({ run }).prMerge(7, SHA);
    expect(res).toMatchObject({ merged: false, putError: { status: 405 } });
  });

  it("trusts the GET when the PUT errored but the PR is merged with the same head", () => {
    const { run } = fakeRun([ok(prJson()), ok([]), fail(502), ok(prJson({ merged: true, state: "closed", merge_commit_sha: OTHER }))]);
    expect(createGitHub({ run }).prMerge(7, SHA)).toMatchObject({ merged: true, putError: { status: 502 } });
  });

  it("retries GET on 5xx but never PUT", () => {
    const g = fakeRun([fail(502), ok(prJson())]);
    expect(createGitHub({ run: g.run }).prGet(7).number).toBe(7);
    expect(g.run).toHaveBeenCalledTimes(2);
    const p = fakeRun([ok(prJson()), ok([]), fail(502), ok(prJson())]);
    createGitHub({ run: p.run }).prMerge(7, SHA);
    expect(p.calls.filter((c) => c.includes("PUT"))).toHaveLength(1);
    const nf = fakeRun([fail(404, "Not Found")]);
    expect(() => createGitHub({ run: nf.run }).prGet(7)).toThrow(GhApiError);
    expect(nf.run).toHaveBeenCalledTimes(1);
  });

  describe("owner-merge backstop", () => {
    const files = (...names: string[]) => ok(names.map((filename) => ({ filename })));
    const labelled = (...names: string[]) => ok(prJson({ labels: names.map((name) => ({ name })) }));

    it.each([
      ["a supabase/ path", [labelled(), files("src/a.ts", "supabase/migrations/1.sql")], {}],
      ["label owner-merge", [labelled("owner-merge"), files("a.ts")], {}],
      ["label privacy", [labelled("privacy"), files("a.ts")], {}],
      ["label db", [labelled("db"), files("a.ts")], {}],
      ["label migration", [labelled("migration"), files("a.ts")], {}],
      ["--risk", [labelled(), files("a.ts")], { risk: true }],
    ])("refuses %s without any PUT", (_name, replies, opts) => {
      const { run, calls } = fakeRun(replies as Reply[]);
      const res = createGitHub({ run }).prMerge(7, SHA, opts);
      expect(res.merged).toBe(false);
      expect(res).toMatchObject({ reason: expect.stringContaining("owner-merge required:") });
      expect(calls.some((c) => c.includes("PUT"))).toBe(false);
    });

    it("paginates the files list", () => {
      const page1 = ok(Array.from({ length: 100 }, (_, i) => ({ filename: `src/f${i}.ts` })));
      const { run, calls } = fakeRun([ok(prJson()), page1, files("supabase/x.sql")]);
      expect(createGitHub({ run }).prMerge(7, SHA).merged).toBe(false);
      expect(calls[2].join(" ")).toContain("page=2");
    });

    it("merges with --owner-approved even for risky PRs", () => {
      const { run, calls } = fakeRun([labelled("privacy"), ok({}), ok(prJson({ merged: true, state: "closed", merge_commit_sha: OTHER }))]);
      const res = createGitHub({ run }).prMerge(7, SHA, { ownerApproved: true });
      expect(res.merged).toBe(true);
      expect(calls.some((c) => c.join(" ").includes("/files"))).toBe(false);
    });
  });

  it("reads ci info with annotations and a log tail, tolerating failures", () => {
    const checkRuns = ok({
      check_runs: [{ id: 5, name: "ci", status: "completed", conclusion: "failure", html_url: "https://github.com/o/r/actions/runs/9/job/55", details_url: "https://github.com/o/r/actions/runs/9/job/55" }],
    });
    const annotations = ok([{ path: "a.ts", start_line: 3, annotation_level: "failure", message: "bad", title: "t" }]);
    const good = fakeRun([checkRuns, annotations, ok("l1\nl2\nl3")]);
    const info = createGitHub({ run: good.run }).ciInfo(SHA);
    expect(info).toMatchObject({ runId: "9", jobId: "55", logsTail: "l1\nl2\nl3", logsError: null });
    expect(info.annotations).toEqual([{ path: "a.ts", line: 3, level: "failure", message: "bad", title: "t" }]);
    expect(good.calls[2].join(" ")).toContain("actions/jobs/55/logs");

    const bad = fakeRun([checkRuns, fail(403), fail(403, "forbidden")]);
    const info2 = createGitHub({ run: bad.run }).ciInfo(SHA);
    expect(info2.logsTail).toBeNull();
    expect(info2.logsError).toContain("403");
    expect(info2.annotations).toEqual([]);
    expect(info2.annotationsError).toContain("403");
  });

  describe("ci info across the jobs of the run", () => {
    const checkRuns = ok({
      check_runs: [{ id: 5, name: "ci", status: "completed", conclusion: "failure", html_url: "https://github.com/o/r/actions/runs/9/job/55" }],
    });
    const job = (name: string, id: number, conclusion: string, steps: unknown[] = []) => ({ name, id, status: "completed", conclusion, steps });

    it("tails the log of the failing shard, not the aggregator", () => {
      const jobs = ok({
        jobs: [
          job("checks", 51, "success"),
          job("e2e (1/2)", 52, "success"),
          job("e2e (2/2)", 53, "failure", [{ name: "Run e2e", conclusion: "failure" }]),
          job("ci", 55, "failure"),
        ],
      });
      const { run, calls } = fakeRun([checkRuns, ok([]), ok("ci agg"), jobs, ok("shard line 1\nshard line 2")]);
      const info = createGitHub({ run }).ciInfo(SHA);
      expect(info.jobs.map((j: { name: string; conclusion: string | null }) => [j.name, j.conclusion])).toEqual([
        ["checks", "success"],
        ["e2e (1/2)", "success"],
        ["e2e (2/2)", "failure"],
        ["ci", "failure"],
      ]);
      expect(info.jobs[2].failedStep).toBe("Run e2e");
      expect(info.failingJob).toEqual({ name: "e2e (2/2)", id: 53, logsTail: "shard line 1\nshard line 2", logsError: null });
      expect(info.logsTail).toBe("ci agg");
      expect(calls[3].join(" ")).toContain("actions/runs/9/jobs");
      expect(calls[4].join(" ")).toContain("actions/jobs/53/logs");
    });

    it("has no failing job when everything succeeded", () => {
      const jobs = ok({ jobs: [job("checks", 51, "success"), job("ci", 55, "success")] });
      const { run, calls } = fakeRun([checkRuns, ok([]), ok("x"), jobs]);
      const info = createGitHub({ run }).ciInfo(SHA);
      expect(info.failingJob).toBeNull();
      expect(info.jobsError).toBeNull();
      expect(calls).toHaveLength(4);
    });

    it("reports a log fetch error on the failing job without throwing", () => {
      const jobs = ok({ jobs: [job("checks", 51, "failure"), job("ci", 55, "failure")] });
      const { run } = fakeRun([checkRuns, ok([]), ok("x"), jobs, fail(404, "gone")]);
      const info = createGitHub({ run }).ciInfo(SHA);
      expect(info.failingJob).toMatchObject({ name: "checks", id: 51, logsTail: null });
      expect(info.failingJob?.logsError).toContain("404");
    });

    it("reports a jobs listing error without throwing", () => {
      const { run } = fakeRun([checkRuns, ok([]), ok("x"), fail(403, "forbidden")]);
      const info = createGitHub({ run }).ciInfo(SHA);
      expect(info.jobs).toEqual([]);
      expect(info.jobsError).toContain("403");
      expect(info.failingJob).toBeNull();
    });
  });

  it("re-runs failed jobs and propagates refusals", () => {
    const checkRuns = ok({ check_runs: [{ id: 5, name: "ci", status: "completed", conclusion: "cancelled", html_url: "https://github.com/o/r/actions/runs/123/job/55" }] });
    const { run, calls } = fakeRun([checkRuns, ok("")]);
    expect(createGitHub({ run }).ciRerun(SHA)).toEqual({ rerun: true, runId: "123", previousCheckRunId: 5 });
    expect(calls[1]).toEqual(expect.arrayContaining(["POST", `${REPO}/actions/runs/123/rerun-failed-jobs`]));
    const refused = fakeRun([checkRuns, fail(403, "forbidden")]);
    expect(() => createGitHub({ run: refused.run }).ciRerun(SHA)).toThrow(GhApiError);
  });
});

describe("verdict gate (pr-create --verdicts)", () => {
  const files = (m: Record<string, string>) => (f: string) => (f in m ? m[f] : null);
  it("always requires reviewer and qa; auditors follow the changed paths", () => {
    expect(requiredVerdictRoles(["README.md"])).toEqual(["reviewer", "qa"]);
    expect(requiredVerdictRoles(["src/components/canvas3d/Scene.tsx"])).toEqual(["reviewer", "qa", "r3f-perf-reviewer"]);
    expect(requiredVerdictRoles(["src/core/world/x.ts", "supabase/migrations/1.sql"]).sort()).toEqual(
      ["privacy-auditor", "qa", "r3f-perf-reviewer", "reviewer"].sort(),
    );
    expect(requiredVerdictRoles(["src/app/api/creations/route.ts"])).toContain("privacy-auditor");
    expect(requiredVerdictRoles(["README.md"], ["privacy-auditor"])).toContain("privacy-auditor");
  });
  it("names the missing qa file", () => {
    const p = verdictProblems({ key: "MFW-9", roles: ["reviewer", "qa"], read: files({ "MFW-9-reviewer.md": "VERDICT: PASS\n### Findings\nNone" }) });
    expect(p).toEqual(["missing MFW-9-qa.md (the qa report is required)"]);
  });
  it("refuses any first line other than VERDICT: PASS", () => {
    const read = files({ "MFW-9-reviewer.md": "VERDICT: FIX FIRST\n", "MFW-9-qa.md": "### Verdict\nPASS\n", "MFW-9-r3f-perf-reviewer.md": "\n\nVERDICT: PASS\n" });
    const p = verdictProblems({ key: "MFW-9", roles: ["reviewer", "qa", "r3f-perf-reviewer"], read });
    expect(p).toHaveLength(2);
    expect(p[0]).toContain("MFW-9-reviewer.md: VERDICT: FIX FIRST, needs VERDICT: PASS");
    expect(p[1]).toContain("MFW-9-qa.md: first line must be");
  });
  it("passes when every report says PASS", () => {
    const read = files({ "MFW-9-reviewer.md": "VERDICT: PASS\n", "MFW-9-qa.md": "VERDICT: PASS\n" });
    expect(verdictProblems({ key: "MFW-9", roles: ["reviewer", "qa"], read })).toEqual([]);
  });
});

describe("mergeRefusal", () => {
  it("returns pr-merge's refusals as values and null when the PR may merge", () => {
    const mk = (pr: Record<string, unknown>, files: unknown[] = []) => {
      const { run } = fakeRun([ok(prJson(pr)), ok(files)]);
      return createGitHub({ run }).mergeRefusal(7, SHA);
    };
    expect(mk({})).toBeNull();
    expect(mk({ draft: true })).toMatchObject({ merged: false, reason: "PR is a draft" });
    expect(mk({ head: { sha: OTHER, ref: "feat/MFW-9-y" } })).toMatchObject({ merged: false });
    expect(mk({ labels: [{ name: "owner-merge" }] })).toMatchObject({ reason: expect.stringContaining("owner-merge required") });
    expect(mk({}, [{ filename: "supabase/x.sql" }])).toMatchObject({ reason: expect.stringContaining("supabase/") });
  });
});

describe("releaseFastForward", () => {
  const ciRuns = (conclusion: string | null = "success", status = "completed") =>
    ok({ check_runs: [{ id: 11, name: "ci", status, conclusion, app: { slug: "github-actions" } }] });
  const cmp = (status: string, aheadBy = 0, commits: unknown[] = []) => ok({ status, ahead_by: aheadBy, commits });
  const ref = (sha: string) => ok({ object: { sha } });
  const methods = (calls: string[][]) => calls.map((c) => c[2]);
  const writes = (calls: string[][]) => calls.filter((c) => c[2] === "PATCH" || c[2] === "POST");
  const commits = [
    { sha: "c1", commit: { message: "feat: a MFW-1\n\nbody" } },
    { sha: "c2", commit: { message: "fix: b" } },
  ];

  it("RF1 refuses without ownerApproved and makes no call", () => {
    const { run, calls } = fakeRun([]);
    const gh = createGitHub({ run });
    expect(gh.releaseFastForward(SHA).reason).toContain("owner-approved");
    expect(calls).toEqual([]);
    expect(() => gh.releaseFastForward("nothex", { ownerApproved: true })).toThrow(GhEnvError);
  });

  it("RF2 refuses unless ci on the sha succeeded", () => {
    const cases: Reply[] = [ciRuns("failure"), ciRuns("cancelled"), ciRuns(null, "in_progress"), ok({ check_runs: [] })];
    for (const reply of cases) {
      const { run, calls } = fakeRun([reply]);
      const r = createGitHub({ run }).releaseFastForward(SHA, { ownerApproved: true });
      expect(r.reason).not.toBeNull();
      expect(r.moved).toBe(false);
      expect(writes(calls)).toEqual([]);
      expect(calls).toHaveLength(1);
    }
  });

  it("RF3 refuses a sha that is not on main", () => {
    for (const status of ["diverged", "behind"]) {
      const { run, calls } = fakeRun([ciRuns(), cmp(status)]);
      const r = createGitHub({ run }).releaseFastForward(SHA, { ownerApproved: true });
      expect(r.reason).toContain("not on main");
      expect(calls).toHaveLength(2);
      expect(calls.some((c) => c.join(" ").includes("git/ref"))).toBe(false);
    }
  });

  it("RF4 fast-forwards with force=false and the follow-up GET decides", () => {
    const { run, calls } = fakeRun([ciRuns(), cmp("ahead"), ref(OTHER), cmp("ahead", 2, commits), ok({}), ref(SHA)]);
    const r = createGitHub({ run }).releaseFastForward(SHA, { ownerApproved: true });
    expect(r).toMatchObject({ moved: true, from: OTHER, to: SHA, aheadBy: 2, reason: null, checkRunId: 11 });
    expect(r.commits[0].subject).toBe("feat: a MFW-1");
    expect(methods(calls)).toEqual(["GET", "GET", "GET", "GET", "PATCH", "GET"]);
    expect(calls[1]).toContain(`${REPO}/compare/${SHA}...main?per_page=1`);
    expect(calls[4]).toContain(`${REPO}/git/refs/heads/release`);
    expect(calls[4]).toContain(`sha=${SHA}`);
    expect(calls[4]).toContain("force=false");
    expect(calls.flat().some((a) => a.includes("force=true"))).toBe(false);
  });

  it("RF5 refuses to move release backwards or across a divergence", () => {
    for (const status of ["behind", "diverged"]) {
      const { run, calls } = fakeRun([ciRuns(), cmp("ahead"), ref(OTHER), cmp(status)]);
      const r = createGitHub({ run }).releaseFastForward(SHA, { ownerApproved: true });
      expect(r.reason).toContain("not a fast-forward");
      expect(writes(calls)).toEqual([]);
    }
  });

  it("RF6 is a no-op when release is already at the sha", () => {
    const { run, calls } = fakeRun([ciRuns(), cmp("identical"), ref(SHA)]);
    const r = createGitHub({ run }).releaseFastForward(SHA, { ownerApproved: true });
    expect(r).toMatchObject({ unchanged: true, moved: false, reason: null });
    expect(methods(calls)).toEqual(["GET", "GET", "GET"]);
  });

  it("RF7 creates release when it is missing", () => {
    const { run, calls } = fakeRun([ciRuns(), cmp("ahead"), fail(404, "Not Found"), ok({}), ref(SHA)]);
    const r = createGitHub({ run }).releaseFastForward(SHA, { ownerApproved: true });
    expect(r).toMatchObject({ created: true, moved: true, from: null });
    expect(calls[3][2]).toBe("POST");
    expect(calls[3]).toContain(`${REPO}/git/refs`);
    expect(calls[3]).toContain("ref=refs/heads/release");
    const denied = fakeRun([ciRuns(), cmp("ahead"), fail(403, "Forbidden")]);
    expect(() => createGitHub({ run: denied.run }).releaseFastForward(SHA, { ownerApproved: true })).toThrow(GhApiError);
  });

  it("RF8 check mode runs every check and writes nothing, without ownerApproved", () => {
    const { run, calls } = fakeRun([ciRuns(), cmp("ahead"), ref(OTHER), cmp("ahead", 2, commits)]);
    const r = createGitHub({ run }).releaseFastForward(SHA, { check: true });
    expect(r).toMatchObject({ checked: true, moved: false, reason: null, aheadBy: 2 });
    expect(writes(calls)).toEqual([]);
  });

  it("RF11 refuses two ci runs, a non-ci success, and a ci run from another app", () => {
    const run = (name: string, slug = "github-actions", id = 11) => ({ id, name, status: "completed", conclusion: "success", app: { slug } });
    const cases: Reply[] = [
      ok({ check_runs: [run("ci"), run("ci", "github-actions", 12)] }),
      ok({ check_runs: [run("lint")] }),
      ok({ check_runs: [run("ci", "evil-app")] }),
    ];
    for (const reply of cases) {
      const { run: r, calls } = fakeRun([reply]);
      const out = createGitHub({ run: r }).releaseFastForward(SHA, { ownerApproved: true });
      expect(out.reason).not.toBeNull();
      expect(out.moved).toBe(false);
      expect(writes(calls)).toEqual([]);
      expect(calls).toHaveLength(1);
    }
    const other = fakeRun([ok({ check_runs: [run("ci", "evil-app")] })]);
    expect(createGitHub({ run: other.run }).releaseFastForward(SHA, { ownerApproved: true }).reason).toContain("github-actions");
  });

  it("RF12 check mode reports a non-fast-forward and an unchanged release, writing nothing", () => {
    const a = fakeRun([ciRuns(), cmp("ahead"), ref(OTHER), cmp("diverged")]);
    const r = createGitHub({ run: a.run }).releaseFastForward(SHA, { check: true });
    expect(r.reason).toContain("not a fast-forward");
    expect(r.checked).toBe(false);
    expect(writes(a.calls)).toEqual([]);
    const b = fakeRun([ciRuns(), cmp("identical"), ref(SHA)]);
    const u = createGitHub({ run: b.run }).releaseFastForward(SHA, { check: true });
    expect(u).toMatchObject({ unchanged: true, reason: null });
    expect(writes(b.calls)).toEqual([]);
  });

  it("RF9 reports a refused PATCH", () => {
    const { run } = fakeRun([ciRuns(), cmp("ahead"), ref(OTHER), cmp("ahead", 1, commits.slice(0, 1)), fail(422, "Update is not a fast forward"), ref(OTHER)]);
    const r = createGitHub({ run }).releaseFastForward(SHA, { ownerApproved: true });
    expect(r.moved).toBe(false);
    expect(r.writeError?.status).toBe(422);
    expect(r.reason).toContain(`expected ${SHA}`);
  });

  it("RF10 never retries the write", () => {
    const { run, calls } = fakeRun([ciRuns(), cmp("ahead"), ref(OTHER), cmp("ahead", 1, commits.slice(0, 1)), fail(502), ref(OTHER)]);
    createGitHub({ run }).releaseFastForward(SHA, { ownerApproved: true });
    expect(calls.filter((c) => c[2] === "PATCH")).toHaveLength(1);
  });
});
