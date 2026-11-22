#!/usr/bin/env bash
# Merge-gate wait for one PR (docs/ci.md). Blocks until the `ci` check on the PR head has a final state.
# Run it as ONE background command; it does not merge anything.
#
#   GH_TOKEN=$(gh auth token -u chocody) bash scripts/wait-ci.sh <pr-number> <head-sha>
#
# Last line of output is the verdict:
#   GATE: PASS sha=<sha>        -> ci is SUCCESS on exactly <sha>; safe to `gh pr merge --match-head-commit <sha>`
#   GATE: FAIL <reason>         -> do not merge
# Exit code: 0 on PASS, 1 on FAIL, 2 on usage error.
set -uo pipefail

REPO_SLUG="chocody/miniature-festival-world"
APPEAR_TIMEOUT_S=600   # how long to wait for the `ci` check to be reported at all
FINISH_TIMEOUT_S=2700  # how long to wait for `ci` to finish (job timeout is 20 min + queueing)

pr="${1:-}"
sha="${2:-}"
if [[ ! "$pr" =~ ^[0-9]+$ || ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "usage: GH_TOKEN=\$(gh auth token -u chocody) bash scripts/wait-ci.sh <pr-number> <40-char head sha>" >&2
  exit 2
fi
if [[ -z "${GH_TOKEN:-}" ]]; then
  echo "GATE: FAIL GH_TOKEN is not set (export GH_TOKEN=\$(gh auth token -u chocody))"
  exit 1
fi

fail() { echo "GATE: FAIL $*"; exit 1; }

head_sha() { gh pr view "$pr" --repo "$REPO_SLUG" --json headRefOid --jq .headRefOid 2>/dev/null; }

# State of the check named exactly `ci` ("" when not reported yet). Several entries → joined with commas.
ci_state() {
  gh pr checks "$pr" --repo "$REPO_SLUG" --json name,state \
    --jq '[.[] | select(.name=="ci") | .state] | join(",")' 2>/dev/null || true
}

is_pending() {
  case "$1" in
    "" | PENDING | QUEUED | IN_PROGRESS | WAITING | REQUESTED | EXPECTED) return 0 ;;
    *) return 1 ;;
  esac
}

check_head() {
  local now
  now="$(head_sha)"
  [[ -n "$now" ]] || fail "could not read PR #$pr head"
  [[ "$now" == "$sha" ]] || fail "PR head moved: expected $sha, now $now"
}

# 1. Wait for `ci` to be reported on the PR head (it takes a few seconds to appear).
check_head
start=$SECONDS
while [[ -z "$(ci_state)" ]]; do
  (( SECONDS - start < APPEAR_TIMEOUT_S )) || fail "no check named ci appeared within ${APPEAR_TIMEOUT_S}s"
  sleep 10
done
echo "ci reported: $(ci_state)"

# 2. Watch all checks. --fail-fast may return early because of another check (e.g. a preview deploy),
#    so the verdict below is taken from `ci` alone. Never --required: there are no required checks.
gh pr checks "$pr" --repo "$REPO_SLUG" --watch --fail-fast --interval 20
echo "gh pr checks --watch exited with $?"

# 3. If ci is still running (watch exited early), keep waiting for ci itself.
start=$SECONDS
state="$(ci_state)"
while is_pending "$state"; do
  (( SECONDS - start < FINISH_TIMEOUT_S )) || fail "ci still '$state' after ${FINISH_TIMEOUT_S}s"
  sleep 20
  state="$(ci_state)"
done

# 4. Verdict: exactly SUCCESS, on the same head we were asked about.
gh pr checks "$pr" --repo "$REPO_SLUG" --json name,state --jq '.[] | "\(.name): \(.state)"' 2>/dev/null || true
check_head
[[ "$state" == "SUCCESS" ]] || fail "ci state is '$state'"
echo "GATE: PASS sha=$sha"
