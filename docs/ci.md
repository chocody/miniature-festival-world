# CI and merge gate

## What CI runs

Workflow: `.github/workflows/ci.yml`, single job named `ci`, on every pull request and on push to `main`
(superseded runs on the same ref are cancelled). Steps, in order:

| Step | Command |
| --- | --- |
| Install | `pnpm install --frozen-lockfile` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Unit tests | `pnpm test` |
| Build | `pnpm build` |
| Install browser | `pnpm exec playwright install --with-deps chromium` |
| Smoke e2e | `pnpm e2e` |

On failure the Playwright report and traces are uploaded as the `playwright-report` artifact.

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

## Merge gate

This repo is private on GitHub Free, so branch protection is unavailable. The gate is enforced by the
loop-ticket automation:

1. Open the PR.
2. Wait until a check named `ci` is reported on the PR (it can take a few seconds to appear), then run
   `gh pr checks <pr> --watch --fail-fast`.
   Do **not** use `--required`: with no branch protection there are no required checks, so it would
   wait on nothing.
3. Confirm explicitly: `gh pr checks <pr> --json name,state --jq '.[] | select(.name=="ci") | .state'`
   must print `SUCCESS`, and the PR head must still be the commit you waited on.
4. Only then run `gh pr merge <pr> --squash --delete-branch --match-head-commit <sha>` (the pinned sha
   makes the merge fail if anything was pushed after the checks ran).

Steps 2–3 are scripted in `scripts/wait-ci.sh <pr> <sha>` (prints `GATE: PASS sha=…` or `GATE: FAIL …`;
it never merges). loop-ticket runs it as one background command with
`GH_TOKEN=$(gh auth token -u chocody)`, because the machine's default `gh` account is a different user.

Never merge on pending or failed checks. If `ci` fails, fix the cause and push; do not skip or loosen a check.
loop-ticket allows one CI fix per ticket; a second failure parks the ticket with `needs-human`.
