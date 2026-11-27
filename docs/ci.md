# CI and merge gate

## What CI runs

Workflow: `.github/workflows/ci.yml`, on every pull request and on push to `main` (superseded runs on the same ref
are cancelled). Three jobs (the e2e suite outgrew one 20-minute job; owner decision 2026-11-27: two parallel shards):

| Job | Steps |
| --- | --- |
| `checks` | `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm lint` → `pnpm test` → `pnpm build` |
| `e2e (1/2)`, `e2e (2/2)` | `pnpm install --frozen-lockfile` → `pnpm exec playwright install --with-deps chromium` → `pnpm e2e --shard=<n>/2` |
| `ci` | needs both; succeeds only when `checks` and every `e2e` shard succeeded (any failure, cancellation or skip fails it) |

The merge gate reads only the check-run named `ci` (below), so it covers every job. `ci-info` shows the `ci` job's
annotations, lists every job of the same run (name, conclusion, failed step) and tails the log of the first failing
job other than `ci` (`failingJob`), since the `ci` job's own log is only the aggregator.

On failure each e2e shard uploads its Playwright report and traces as the `playwright-report-<n>` artifact.

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

`pnpm e2e` builds and starts the production app on port 3100 (`pnpm build && pnpm start -p 3100`).
Outside CI it reuses a server already running on that port. Chromium runs with software WebGL
(SwiftShader) so WebGL works without a GPU. Preview deployments have no Supabase env, so e2e must not depend on it.
`E2E_PORT=<port>` changes the port (parallel worktrees); `PW_CHROMIUM_PATH=<executable>` uses a pre-installed
Chromium (cloud sessions — never `playwright install` there). CI sets neither.

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
