#!/usr/bin/env bash
# Merge-gate wait for one PR (docs/ci.md). Blocks until the `ci` check-run on exactly <head-sha> has
# completed, or a global deadline expires. Run it as ONE background command; it never merges anything.
#
#   node scripts/gh-rest.mjs exec -- bash scripts/wait-ci.sh <pr-number> <head-sha> [ignore-check-run-id]
#
# REST only (gh api); works in cloud sessions where GraphQL is blocked. Locally, gh-rest.mjs exec
# sets GH_TOKEN for the chocody account; in a cloud session the proxy authenticates gh.
#
# It polls only the `ci` check-run of <head-sha> (GitHub check-runs API, latest attempt), so a stuck
# unrelated check (e.g. a preview deployment) can never hang it. Pass the id of a previous, failed `ci`
# check-run as the third argument after a CI re-run (gh-rest.mjs ci-rerun), so the old result is not mistaken for the new one.
#
# Env: WAIT_CI_TIMEOUT_S (default 2700 = 45 min; the `ci` check-run appears only after the slowest job:
#      checks 15 min / e2e shards 25 min, then ci 5 min, plus queue time),
#      WAIT_CI_INTERVAL_S (default 20).
#
# Last line of output is the verdict:
#   GATE: PASS sha=<sha> check-run=<id>     ci SUCCESS on exactly <sha>; merge pinned to <sha> (gh-rest.mjs pr-merge --sha)
#   GATE: FAIL <reason> [check-run=<id>]    do not merge
# Exit code: 0 on PASS, 1 on FAIL, 2 on usage error. Anything else (killed, no verdict line) is a FAIL.
# Portable to macOS bash 3.2 (no `timeout`, no associative arrays).
set -uo pipefail

REPO_SLUG="chocody/miniature-festival-world"
TIMEOUT_S="${WAIT_CI_TIMEOUT_S:-2700}"
INTERVAL_S="${WAIT_CI_INTERVAL_S:-20}"

pr="${1:-}"
sha="${2:-}"
ignore_id="${3:-}"
usage() {
  echo "usage: node scripts/gh-rest.mjs exec -- bash scripts/wait-ci.sh <pr-number> <40-char head sha> [ignore-check-run-id]" >&2
  exit 2
}
[[ "$pr" =~ ^[0-9]+$ && "$sha" =~ ^[0-9a-f]{40}$ ]] || usage
[[ -z "$ignore_id" || "$ignore_id" =~ ^[0-9]+$ ]] || usage
[[ "$TIMEOUT_S" =~ ^[0-9]+$ && "$INTERVAL_S" =~ ^[0-9]+$ && "$INTERVAL_S" -gt 0 ]] || usage

fail() { echo "GATE: FAIL $*"; exit 1; }
[[ -n "${GH_TOKEN:-}" ]] || fail "GH_TOKEN is not set (run it through: node scripts/gh-rest.mjs exec -- bash scripts/wait-ci.sh …)"

head_sha() { gh api "repos/$REPO_SLUG/pulls/$pr" --jq .head.sha 2>/dev/null; }

check_head() {
  local now
  now="$(head_sha)"
  [[ -n "$now" ]] || fail "could not read PR #$pr head"
  [[ "$now" == "$sha" ]] || fail "PR head moved: expected $sha, now $now"
}

# One line per `ci` check-run of the sha (latest attempt only): "<id> <status> <conclusion>".
ci_runs() {
  gh api "repos/$REPO_SLUG/commits/$sha/check-runs?check_name=ci&filter=latest&per_page=100" \
    --jq '.check_runs[] | "\(.id) \(.status) \(.conclusion // "none")"' 2>/dev/null
}

deadline=$((SECONDS + TIMEOUT_S))
last=""
while :; do
  check_head
  if runs="$(ci_runs)"; then
    runs="$(printf '%s\n' "$runs" | awk -v skip="$ignore_id" 'NF == 3 && $1 != skip')"
    count="$(printf '%s\n' "$runs" | awk 'NF == 3' | wc -l | tr -d ' ')"
    if [[ "$count" -gt 1 ]]; then
      fail "expected exactly one ci check-run on $sha, found $count: $(printf '%s' "$runs" | tr '\n' ';')"
    fi
    if [[ "$count" -eq 1 ]]; then
      id="$(printf '%s\n' "$runs" | awk 'NF == 3 { print $1 }')"
      status="$(printf '%s\n' "$runs" | awk 'NF == 3 { print $2 }')"
      conclusion="$(printf '%s\n' "$runs" | awk 'NF == 3 { print $3 }')"
      now_state="ci check-run $id: $status/$conclusion"
      [[ "$now_state" == "$last" ]] || echo "$now_state"
      last="$now_state"
      if [[ "$status" == "completed" ]]; then
        [[ "$conclusion" == "success" ]] || fail "ci concluded '$conclusion' check-run=$id"
        break
      fi
    else
      [[ "$last" == "waiting" ]] || echo "waiting for a ci check-run on $sha"
      last="waiting"
    fi
  else
    echo "warning: could not read check-runs (will retry)"
  fi
  (( SECONDS < deadline )) || fail "timeout after ${TIMEOUT_S}s (last: ${last:-nothing seen})"
  sleep "$INTERVAL_S"
done

# Cross-check: re-read the same check-run by id (docs/ci.md step 3) and the head once more.
pr_state="$(gh api "repos/$REPO_SLUG/commits/$sha/check-runs?check_name=ci&filter=latest" --jq '[.check_runs[] | select(.id=='"$id"') | (if .conclusion=="success" then "SUCCESS" else (.conclusion // .status) end)] | join(",")' 2>/dev/null || true)"
[[ "$pr_state" == "SUCCESS" ]] || fail "gh api reports ci='$pr_state' check-run=$id"
check_head
echo "GATE: PASS sha=$sha check-run=$id"
