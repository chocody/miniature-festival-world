# CI and merge gate

## What CI runs

Workflow: `.github/workflows/ci.yml`, on every pull request and on push to `main` (superseded runs on the same ref
are cancelled). Three workflow jobs: `checks`, an `e2e` matrix of three shards (two Loy, one Christmas), and `ci` (the e2e suite outgrew one 20-minute job; owner decision 2026-11-27: Loy runs as two parallel shards; every further festival project is one shard of its own, MFW-89):

| Job | Steps |
| --- | --- |
| `checks` | `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm lint` → `pnpm test` → `pnpm build` |
| `e2e (1/2)`, `e2e (2/2)` | `pnpm install --frozen-lockfile` → `pnpm exec playwright install --with-deps chromium` → `pnpm e2e --project=chromium --shard=<n>/2` (Loy) |
| `e2e (christmas)` | same setup → `pnpm e2e --project=christmas` |
| `ci` | needs `checks` and `e2e`; succeeds only when `checks` and every `e2e` job succeeded (any failure, cancellation or skip fails it) |

The merge gate reads only the check-run named `ci` (below), so it covers every job. `ci-info` shows the `ci` job's
annotations, lists every job of the same run (name, conclusion, failed step) and tails the log of the first failing
job other than `ci` (`failingJob`), since the `ci` job's own log is only the aggregator.

On failure each e2e shard uploads its Playwright report and traces as the `playwright-report-1`, `playwright-report-2` or `playwright-report-christmas` artifact.

## Run locally

Use the same commands as CI:

```
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install chromium   # once
pnpm e2e
```

`pnpm e2e` starts one production server per Playwright project:

- Loy (project `chromium`) on `E2E_PORT` (3100) with `MFW_ACTIVE_EVENT_OVERRIDE=loy_krathong`.
- Christmas (project `christmas`) on `E2E_PORT + 100` (3200) with `MFW_ACTIVE_EVENT_OVERRIDE=christmas`.

The two servers start one after the other and share one build (`pnpm build && pnpm start -p 3100`, then
`pnpm start -p 3200`). Both run for any selection, because Playwright's webServer is global and not per project.
`--project=chromium` or `--project=christmas` selects the tests. Files named `christmas-*.spec.ts` belong to the
Christmas project only.

Outside CI it reuses a server already running on a port. Chromium runs with software WebGL
(SwiftShader) so WebGL works without a GPU. Preview deployments have no Supabase env, so e2e must not depend on it.
`E2E_PORT=<port>` changes the base port (parallel worktrees); `PW_CHROMIUM_PATH=<executable>` uses a pre-installed
Chromium (cloud sessions — never `playwright install` there). CI sets neither.

## Adding a festival project

For example 17.3 (`new-year`):

1. Add a row to `E2E_EVENT_PROJECTS` in `playwright.config.ts`.
2. Add a matrix `include` row to the `e2e` job in `.github/workflows/ci.yml`.
3. Add a row to the job table above (`e2e (<name>)`). `tests/unit/playwright-config.test.ts` (PC8) fails until steps 2 and 3 are done.

## CI time

Baselines measured by the lead from GitHub job timings on 2026-11-27 (runs 46060755796, 46059760197, 46058671661;
before MFW-89):

| Job | Time |
| --- | --- |
| `checks` | 110–169 s |
| `e2e (1/2)` | 331–387 s (setup steps, checkout to playwright install, take 25–53 s of each) |
| `e2e (2/2)` | 222–330 s (same setup cost) |
| `e2e (christmas)` | (a) local `E2E_PORT=3142 CI=1 pnpm e2e --project=christmas`: not measured in the dev lane (memory-constrained; the orchestrator's serialized verify runs it), 2 tests in 1 file planned; (b) CI job time: pending first PR run |

Workflow wall time is about 5.5–6.5 min, bounded by the slowest Loy shard. Expected impact of the Christmas shard: it
runs in parallel, so wall time is unchanged; runner minutes go up by about one job; each Loy shard pays one extra idle
`next start`.

## Merge gate

This repo is private on GitHub Free, so branch protection is unavailable. The gate is enforced by the
loop-ticket automation:

1. Open the PR.
2. Poll the `ci` check-run of exactly `<sha>` (`GET repos/…/commits/<sha>/check-runs?check_name=ci&filter=latest`)
   until it completes — not `--required`, not every check: with no branch protection there are no required
   checks, so that would wait on nothing.
3. Confirm: that check-run concluded `success`, and the PR head (`GET repos/…/pulls/<pr>` `.head.sha`) is
   still `<sha>`.
4. Only then squash-merge pinned to the sha: `node scripts/gh-rest.mjs pr-merge <pr> --sha <sha>`
   (`PUT repos/…/pulls/<pr>/merge` with `merge_method=squash` and `sha=<sha>`, so GitHub refuses if anything
   was pushed after the checks ran); the script re-reads the PR and its `merged` field decides.

Steps 2–3 are scripted in `scripts/wait-ci.sh`, run as
`node scripts/gh-rest.mjs exec -- bash scripts/wait-ci.sh <pr> <sha> [ignore-check-run-id]`; it never merges.
It is REST only. It polls only the `ci` check-run of exactly `<sha>` until it completes or `WAIT_CI_TIMEOUT_S`
(default 2700 s) expires (so a stuck preview check can never hang it), fails if the PR head moves or more than
one `ci` check-run exists, then cross-checks step 3 by re-reading the same check-run by id. The last line is
`GATE: PASS sha=<sha> check-run=<id>` or `GATE: FAIL <reason>`; anything else counts as a failure. After a re-run
(`node scripts/gh-rest.mjs ci-rerun <sha>`) pass the failed check-run id as the third argument so the old result
is ignored. GraphQL-backed `gh` subcommands are not used (they are blocked in cloud sessions).
`scripts/gh-rest.mjs` sets `GH_TOKEN` from `gh auth token -u chocody` locally (the machine's default account is
another user) and relies on the network proxy in a cloud session.

PRs of tickets labelled `privacy`, `db` or `migration` (or touching `supabase/**`) pass the same gate but are
merged by the owner, not the loop (label `owner-merge`).

Never merge on pending or failed checks. If `ci` fails, fix the cause and push; do not skip or loosen a check.
loop-ticket allows one CI fix per ticket; a second failure parks the ticket with `needs-human`.
