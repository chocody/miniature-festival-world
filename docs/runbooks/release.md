# Release branch runbook (production during the live events)

## Summary

From 19 Dec 2026 the Vercel production branch is `release`, not `main`. `release` moves only by fast-forward to a
`main` sha whose `ci` check-run concluded `success`, and only for:

- the 19 Dec Christmas launch (MFW-116 / 16.30),
- the 27 Dec New Year launch (MFW-152 / 17.27),
- hotfixes (merged to `main` first, `ci` green).

Why: L17 merges must not deploy while Christmas is live (`docs/plans/L17-new-year.md` Risks §4). The owner moves
`release` on purpose, with one guarded command: `node scripts/gh-rest.mjs release-ff`.

## Branches and environments

| Branch | Vercel environment | Who moves it | CI |
|---|---|---|---|
| `main` | Preview (from 19 Dec), no DB env | Squash merges through the `ci` gate | `ci` on PRs and on push to `main` |
| `staging` | Preview with the staging-branch env | Fast-forwarded from `main` (staging tooling and runbook are planned by MFW-90); unchanged by this switch, so staging keeps tracking `main` | none of its own |
| `release` | Production | The owner, with `release-ff` | none of its own: it only ever points at a `main` sha that CI already passed |

Facts:

- The GitHub default branch stays `main` and PRs still target `main`.
- Production env vars apply to the Production environment, so they follow `release` and need no change.
- `VERCEL_ENV` is `production` only on `release` deployments, so the MFW-88 override is still ignored there.
- Changing the setting does not redeploy: production keeps serving its last deployment until `release` is pushed.

## One-time switch (owner)

1. Pause the scheduled loop run (no merges until the dry run is done).
2. `git fetch origin main`. Let `M` = `origin/main`. In Vercel -> Deployments confirm that the current Production
   deployment is commit `M`.
3. In Vercel -> Project Settings -> Environments -> Production -> Branch Tracking (older dashboards: Settings -> Git
   -> Production Branch), set `release`.
4. Run `node scripts/gh-rest.mjs release-ff --sha <M> --check`, then
   `node scripts/gh-rest.mjs release-ff --sha <M> --owner-approved`. This creates `release` at `M`, and Vercel builds
   a Production deployment of the same commit.
   If Vercel does not accept the branch name before `release` exists, run `release-ff` first, then set the branch.
5. Run these from the owner's laptop. A cloud session may refuse ref writes.

## Dry run (owner)

1. With `origin/release == origin/main`, merge one docs-only PR through the normal gate. The squash sha is `D`.
2. Check that `ci` on `D` succeeded (`node scripts/gh-rest.mjs ci-info <D>`), that Vercel shows `D` only as a
   **Preview** deployment, and that Production still shows `M`.
3. Run `release-ff --sha <D> --check`. It lists exactly one commit. Then run it with `--owner-approved`. Production
   now shows `D`.
4. Confirm in the dashboard, and note in the record: the Branch Tracking path from the one-time switch, that
   changing the setting does not redeploy, the Hobby Instant Rollback behaviour, and that auto-promotion pauses after
   a rollback until Undo Rollback.
5. Record in the `MFW-122` row of `docs/follow-ups.md`: the date, `M`, `D`, the Preview deployment of `D` on `main`,
   the Production deployment of `D`, and PASS / FAIL. Then resume the loop.

## Moving release

For each move (the 19 Dec launch, the 27 Dec New Year launch, or a hotfix):

1. Pick a `main` sha `S` with `ci` success. `ci.yml` cancels a superseded run on `main`, so only the newest of quick
   successive merges may be green. Pick that one.
2. Run `node scripts/gh-rest.mjs release-ff --sha <S> --check` and read `commits`. Every commit on `main` up to `S`
   goes to production. From 19 Dec that includes New Year work, which must be off behind its feature flag (17.2)
   until 27 Dec. A commit that is not safe for production is fixed on `main` first (revert or flag). `release` is
   never moved to anything other than a `main` sha.
3. Run it again with `--owner-approved`, then check the Production deployment in Vercel.
4. A hotfix is a normal PR to `main`, the `ci` gate, then these steps.

`release-ff` refuses unless `ci` succeeded on the sha, the sha is on `main`, and the move is a fast-forward. It sends
`force=false`, and it never retries the write.

## Rollback

- (a) Fast path: Vercel -> Deployments -> the previous Production deployment -> Instant Rollback. On Hobby only the
  previous production deployment is offered. After a rollback Vercel stops auto-promoting new production builds until
  the owner uses Undo Rollback or promotes a deployment.
- (b) Fix forward: revert on `main` through the normal gate, `release-ff` to the revert sha, then promote that
  deployment / undo the rollback.
- Never force-push `release` or move it backwards (`release-ff` refuses). A rollback reverts code only; migrations,
  wipes and data are not undone.
- The owner confirms the Hobby rollback behaviour in the dashboard during the dry run.

## What the loop does and does not do

The loop merges to `main` only. It never runs `release-ff` without `--check`, and never pushes `release`. `--check`
is read-only and the loop may run it.
