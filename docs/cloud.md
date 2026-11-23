# Running the loop in Claude Code cloud sessions

`/loop-ticket` and `/loop-epic` can run unattended in a Claude Code cloud session (a scheduled task that starts
a fresh session each day) as well as on the owner's laptop. This page is the setup and the runbook.

## What runs where

- **Cloud session**: a fresh container per run. The repo is cloned shallow (`--depth 1`, main only); skills and
  project agents (`lead`, `dev`, `reviewer`, `qa`, `privacy-auditor`, `r3f-perf-reviewer`) come from the repo's
  `.claude/` directory. Nothing is read from `~/.claude`.
- **Jira**: `node scripts/jira.mjs`. The network proxy injects the credential into every request to
  `chocody.atlassian.net`; the code never sees it. The script re-runs itself with `NODE_USE_ENV_PROXY=1` so its
  HTTPS calls go through `HTTPS_PROXY`, and checks `GET /rest/api/3/myself` before every command.
- **GitHub**: `node scripts/gh-rest.mjs` (REST via `gh api` only; the proxy authenticates `gh` and git). GraphQL
  is blocked in cloud sessions, so `gh pr …`, `gh repo view` and similar commands are never used.
- **CI**: GitHub Actions, unchanged (`.github/workflows/ci.yml`, job `ci`). The merge gate is described in
  `docs/ci.md`.

## The mfw-loop environment

Configured in the Claude Code cloud environment settings (not by code in this repo):

- Setup script: `corepack enable`, then `(cd miniature-festival-world && pnpm install --frozen-lockfile)`.
- Environment variables: `JIRA_BASE_URL=https://chocody.atlassian.net`,
  `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell`.
- Network: limited; allowed host `chocody.atlassian.net` plus the package registries.
- Network secret for `chocody.atlassian.net`: **Basic** (Atlassian account email + API token). The proxy puts it
  in the `Authorization` header of every request to that host.
- Do **not** set `NODE_USE_ENV_PROXY` (reserved by the platform; `jira.mjs` sets it for its own child process).
- Do **not** set `JIRA_EMAIL` / `JIRA_API_TOKEN`: with an email or token present `jira.mjs` assumes basic auth
  instead of the proxy. (`JIRA_AUTH=proxy|basic` forces a mode.)
- Playwright uses the pre-installed browser from `PW_CHROMIUM_PATH`. Never run `playwright install` there.

## Owner one-time setup

1. Delete the older environment `miniature-festival-world` that `mfw-loop` replaced (it still holds a
   wrongly-typed Jira secret), so a scheduled task cannot pick it. (Still to do as of 2026-11-23.)
2. GitHub repo Settings → General → "Automatically delete head branches": **on**. Cloud sessions cannot delete
   branches (the proxy refuses it); GitHub does it on merge. (Already on — `gh-rest.mjs preflight` reports
   `deleteBranchOnMerge: true`.)
3. Connect GitHub to Claude (claude.ai/connect-github) with access to
   `chocody/miniature-festival-world` (push and pull requests). (Done by the owner on 2026-11-23.)
4. Set the scheduled session's permission mode to **Auto**.
5. Create the Jira API token (https://id.atlassian.com/manage-profile/security/api-tokens) and save it as the
   network secret (Basic) for `chocody.atlassian.net`.

## Daily unattended run

Create a scheduled task: daily, "start a fresh session" in the `mfw-loop` environment, with a prompt such as

```
/loop-epic L2 --max 2
```

Add `--parallel 2` to run independent tickets side by side in git worktrees (they share one container, so
builds and e2e compete for CPU; the merge queue still merges one ticket at a time, each after a rebase onto
main and a green `ci`). Turn on the push notification for completion. The run stops at the first parked ticket
or at `--max`. Disable the scheduled task when the epic is closed.

The owner's own stop hook (not part of this repo) may nag about uncommitted changes while reviewers run;
ignore it during a run.

## What parks and what waits for the owner

- **`needs-human`** (the loop could not finish): unknown acceptance criteria, an earlier attempt exists, a
  product open question, qa GOAL NOT MET, Critical/High findings after the one fix round, verify cannot be made
  green, a loosened test or config, the pre-commit guard failing, CI failing twice, a PR head mismatch, a merge
  that did not report `merged: true`, a rebase conflict with main, a refused CI re-run, a busy e2e port. The
  ticket gets a draft PR (if there are changes) and a Jira comment with the reason and how to resume. To resume:
  answer or fix, remove the label, and move the ticket back to To Do (delete the branch and PR first if it
  should restart), or finish and merge the PR by hand.
- **`owner-merge`** (not a failure): tickets labelled `privacy`, `db` or `migration`, or whose diff touches
  `supabase/**`, get a PR that passed the `ci` gate and stay In Review. The owner reviews and squash-merges
  the PR; the next `/loop-epic` run sees it merged, moves the ticket to Done and removes the label (or do that by
  hand). The loop never merges these.

## Local use (owner's laptop)

The commands are the same. Jira credentials come from `~/.config/mfw/jira.env` (outside the repo) or the
`JIRA_*` variables. `scripts/gh-rest.mjs` takes the token of the `chocody` account (`gh auth token -u chocody`
must work, because the machine's default `gh` account is another user) and runs git through the `gh` credential
helper; `MFW_GH_MODE=local|cloud` overrides the detection (cloud is detected from `CLAUDE_CODE_REMOTE`, the cloud
marker observed in this environment). E2E uses
port 3100 unless `E2E_PORT` is set. Project agents in `.claude/agents/` take precedence over user agents with
the same name.

## Troubleshooting

- **`jira.mjs` exits 2**: the message names the cause. `HTTP 401` or "anonymous" means the token is missing or
  revoked (Jira answers as an anonymous user, with empty search results, when it is revoked). `HTTP 403 Failed to
  parse Connect Session Auth Token` means the secret was sent with the wrong auth type (Bearer): it must be
  Basic. "unreachable" means `chocody.atlassian.net` is not an allowed host in the environment's network
  settings. On a laptop without `jira.env` behind a proxy, create `jira.env` or set `JIRA_AUTH=basic`.
- **GitHub GraphQL 403** ("not available from Claude Code sessions"): someone ran a `gh pr …` command; use
  `scripts/gh-rest.mjs`.
- **Branch deletion refused**: expected; enable "Automatically delete head branches" in the repo settings.
- **Playwright browser version mismatch**: set `PW_CHROMIUM_PATH`; never run `playwright install` in the cloud.
- **Port in use**: set `E2E_PORT` (parallel lanes get 3101–3103 automatically).
- **`pnpm lint` fails on a leftover `playwright-report/`**: no longer happens, generated output directories are
  ignored by eslint; delete the directories if they are in the way anyway.
- **Rebase needs history**: the cloud clone is shallow; `node scripts/gh-rest.mjs fetch-main` fetches
  `--depth=50` there.

## Cost and time

Observed in the Loop 1 run on 2026-11-23 (an estimate, not a guarantee): about 20–40 minutes and 0.5–1M
subagent tokens per ticket (lead on opus; dev, reviewer and qa on sonnet). Parallel lanes overlap the agent work, but CI waits are serialized by the merge queue. `--max` bounds
the size of a run.
