---
name: loop-ticket
description: Run ONE Jira MFW ticket end-to-end — preflight, S/M/L estimate and model choice, In Progress, branch feat/MFW-<n>-<slug>, the lead → dev → (reviewer ∥ qa ∥ project auditors) pipeline from implement-code-full-loop, local verify, commit, PR, In Review, CI merge gate, squash merge, Done. Any stop condition labels the ticket needs-human, comments why, and stops without merging. Use when asked to work the next ticket or a specific MFW key.
argument-hint: "[MFW-<n>]  (omit to take the next ready ticket)"
---

# loop-ticket — one ticket, Jira → merged PR

This skill authorizes and requires the Agent tool (pipeline roles), Bash (git, gh, pnpm,
`node scripts/jira.mjs`) and file edits through the dev agent. It runs **exactly one ticket** and then stops.

Correctness of the failure paths matters more than getting a ticket through. When a rule below says
**PARK**, run the [Park procedure](#park-procedure-stop-conditions) and end the run. Never improvise
around a stop condition.

## Ground rules (read before every step)

- **Jira:** only `node scripts/jira.mjs …` (REST, credentials in `~/.config/mfw/jira.env`). Never use the
  Atlassian MCP connector — it points at a different Jira site. Never read, print or ask for the token.
  The CLI prefixes every comment with `[mfw-loop]`; comments without it are from humans.
- **GitHub:** the machine's active `gh` account is someone else. Shell state does not persist between
  Bash calls, so **every** Bash call that runs `gh` or a networked git command (pull, push, fetch,
  ls-remote) starts with:
  ```bash
  export GH_TOKEN="$(gh auth token -u chocody)" && …
  ```
  and uses the explicit credential-helper form for networked git:
  `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push …` (same for `pull`, `fetch`, `ls-remote`).
  Always pass `--repo chocody/miniature-festival-world` to `gh`.
- **Repo:** project rules are in `CLAUDE.md` (invariants A–G, conventions, which auditor to add);
  merge gate in `docs/ci.md`. Commit author is configured repo-locally — do not change git config.
- **Language:** commits, PR title/body, code and Jira comments in English. The final report to the user
  is in Thai (keep code, paths, commands, keys in English).

Record as you go (you need them for comments and the report): `KEY`, `N` (number part), `BRANCH`,
`SIZE`, models, `PR`, `PR_URL`, `SHA`, fix rounds used, CI attempts, verdicts of every agent.

---

## Step 1 — Preflight

Environment checks — on failure **stop and tell the user** (no Jira writes; nothing is ticket-specific yet):

1. `git rev-parse --abbrev-ref HEAD` is `main` and `git status --porcelain` is empty. Otherwise stop:
   do not stash, reset, commit or switch branches on the user's work.
2. Update main (fast-forward only; anything else → stop):
   ```bash
   export GH_TOKEN="$(gh auth token -u chocody)" && git -c credential.helper= -c 'credential.helper=!gh auth git-credential' pull --ff-only origin main
   ```
3. `GH_TOKEN="$(gh auth token -u chocody)" gh repo view chocody/miniature-festival-world --json name` succeeds.
4. Jira credentials: run step 5's command; exit code **2** → show its stderr verbatim (it explains how to
   create `~/.config/mfw/jira.env`) and stop.

Pick the ticket:

5. No argument → `node scripts/jira.mjs next`. With an argument → validate it matches `MFW-<digits>`,
   then still run `node scripts/jira.mjs next` (for `inFlight`).
   - `inFlight` non-empty → stop and tell the user which tickets are In Progress / In Review without
     `needs-human` (probably a crashed run). One ticket at a time; never resume those automatically.
   - No argument and `key` is null → report `reason` and `skipped` to the user; stop (not a failure).
6. `node scripts/jira.mjs get <KEY>` → keep the whole JSON.
   - `ready` is false → report `notReadyReasons`; stop. (A ticket already labelled `needs-human` is the
     human's until they remove the label.)
   - `type` is Bug → branch prefix `fix/`, otherwise `feat/`.

Ticket-specific checks — on failure **PARK** (the ticket is still To Do; leave it there):

7. No earlier attempt exists: `git branch --list "*/MFW-<N>-*"` is empty,
   `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' ls-remote --heads origin "*MFW-<N>-*"`
   is empty, and
   `gh pr list --repo chocody/miniature-festival-world --state open --json number,headRefName --jq '.[] | select(.headRefName | test("/MFW-<N>-")) | .number'`
   prints nothing. Otherwise PARK ("previous attempt exists at …").
8. Open questions: `openQuestions` from `get` lists the rows of `docs/spec/open-questions.md` whose
   "Decide in" names this ticket; `resolved: true` rows are already decided. For each unresolved row:
   - Look for a human answer: a comment in `comments` with `automated: false` that answers it (usually
     after a `[mfw-loop]` needs-human comment). If found, it is **decided** — quote it in the brief.
   - Otherwise classify it. **Product decision → PARK** listing the questions and the options you see.
     Product = changes user-visible behavior, privacy/security posture (how ownership is proven,
     encryption/key management), retention or legal terms, moderation policy (block vs warn), or a
     limit/threshold the product owns (zone cap, FPS threshold, report threshold). **Technical → the lead
     decides** and the decision is recorded (see step 4): naming, internal units/representation that
     clients agree on, a type discriminator, choosing between libraries the spec already allows.
     When unsure, it is a product decision.

## Step 2 — Estimate size and choose models

Start from `sizeHint` in the `get` output (AC count → S ≤2, M 3–4, L ≥5; labels `privacy`/`db`/`migration`
→ at least M). Then raise it by judgment, never lower it below `sizeHint.floor`:
- areas touched (map the AC onto `docs/spec/03-structure.md` folders): 3+ top-level areas → at least M;
- cross-cutting change or a new subsystem (new store, new service, new DB table, first use of a library) → L.

| Role | Model |
|---|---|
| lead | `opus` always |
| dev | `sonnet` for S / M, `opus` for L |
| reviewer, qa | `sonnet` |
| privacy-auditor, r3f-perf-reviewer | as defined in `.claude/agents/*.md` (pass no `model`) |

Record it on the ticket:
```bash
node scripts/jira.mjs comment <KEY> - <<'EOF'
Estimate: <S|M|L> — <reasons: AC count, risk labels, areas>
Models: lead opus · dev <sonnet|opus> · reviewer sonnet · qa sonnet<· privacy-auditor / r3f-perf-reviewer if expected>
EOF
```
If the lead's spec (step 4) reveals more work than estimated, raise the size (only upward), switch dev to
`opus` if it becomes L, and post a one-line comment with the change and why.

## Step 3 — Start

1. `node scripts/jira.mjs transition <KEY> in-progress`
2. Slug: 2–5 words from the summary, lowercase ASCII, `[a-z0-9-]`, ≤ 40 chars.
   `git checkout -b <feat|fix>/MFW-<N>-<slug> main`

From here on the ticket is In Progress: every stop is a PARK.

## Step 4 — Pipeline (reuse implement-code-full-loop)

Read `~/.claude/skills/implement-code-full-loop/SKILL.md` and follow its Steps 1–4 and its agent prompts
exactly, with these loop-specific overrides. Do not reinvent the roles; the global agents are
`lead`, `dev`, `reviewer`, `qa`.

**The brief** (given verbatim to every role, they start with zero context):
- Working directory (absolute), branch name, ticket key + URL + summary + type + labels.
- Goal and every acceptance criterion from `spec` in the `get` output (that is `docs/backlog.json`, the
  source of truth); add the Jira `description` only if it says something the spec entry does not.
- Spec files to read: always `CLAUDE.md` and `docs/spec/README.md`; the epic's loop file
  `docs/spec/06-loops/loop-<n>.md`; `docs/spec/04-coordinates.md` for coordinate/3D/2D work;
  `docs/spec/05-privacy-db.md` for privacy/db/api/auth work; `docs/spec/03-structure.md` for where files go.
- The full "Non-negotiable invariants" section of `CLAUDE.md`, pasted verbatim.
- Decided open questions (with the decision and who made it). Technical questions left to the lead:
  "decide, write the decision in the spec's Plan, and mark the row in `docs/spec/open-questions.md` as
  `Decided in MFW-<N>: <decision>`".
- Constraints: build only this ticket's AC — nothing from later tickets; no new dependency unless an AC
  needs it (say why in the report); never read or touch `.env*`; CI and previews have no Supabase env;
  if the spec is silent, say so instead of inventing numbers or behavior; do not commit.

**Overrides to the global skill:**
- Pass `model` on every Agent call per Step 2 (lead `opus`, dev per size, reviewer/qa `sonnet`).
- There is no human watching mid-run: do not stop to show Goal/Scope/AC. Instead post the lead's Goal and
  Acceptance criteria as a Jira comment. If the lead lists an **Open question that is a product decision
  (Step 1.8 rules) → PARK**. Technical open questions: take the lead's recommended answer and record it.
- If the lead says the task is trivial, still run dev and reviewer ∥ qa — every ticket gets the full gate.
- Step 3 (review) runs **in one message, in parallel**: `reviewer` ∥ `qa` ∥ every project auditor that
  applies. Decide which from the ticket labels and the changed paths
  (`git status --porcelain` — nothing is committed yet), using the table in `CLAUDE.md`:
  `privacy-auditor` for `src/services/**`, `supabase/**`, `src/app/api/**`, wish text, owner token /
  ownership, moderation, reporting, or label `privacy`; `r3f-perf-reviewer` for
  `src/components/canvas3d/**`, `src/components/models/**`, `src/core/effects/**`, `src/core/world/**`,
  `src/core/fallback2d/**`, or labels `perf` / `3d`. Give auditors the brief, the lead's spec and the dev
  report, and tell them the diff is the uncommitted working tree against `main`.
- Decision (replaces the global Step 4 table):

  | After the first review | Action |
  |---|---|
  | qa **GOAL NOT MET** | **PARK** — no fix round |
  | any reviewer Critical/High, qa FIX FIRST, or any auditor FIX FIRST | the one fix round: dev gets the spec + reviewer Critical/High + qa HIGH/MEDIUM + auditor Critical/High findings; then re-run reviewer ∥ qa ∥ the same auditors (add an auditor if the fix now touches its paths) |
  | only Medium/Low, qa PASS, auditors PASS | continue; Medium/Low go into the PR's "Known follow-ups" |

  | After the fix round | Action |
  |---|---|
  | qa not PASS, any Critical/High still open, or any auditor FIX FIRST | **PARK** |
  | otherwise | continue |

  **At most one fix round.** Never a second one.

## Step 5 — Verify locally

Run each command separately (so you know which one failed) from the repo root:
```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
lsof -nP -iTCP:3100 -sTCP:LISTEN || echo "port 3100 free"
CI=1 pnpm e2e
```
`CI=1` makes Playwright start a fresh production server instead of reusing whatever listens on :3100
(a stale server would test old code). If :3100 is busy, do not kill it — PARK ("port 3100 in use").

Also refuse loosened tests: `git diff main -- '*.test.*' '*.spec.*' tests/` plus untracked test files must
not add `.skip(`, `.only(`, `.todo(`, `test.fixme`, `xit(`/`xdescribe(` or delete existing assertions;
`vitest.config.mts`, `playwright.config.ts`, `.github/workflows/ci.yml`, `eslint.config.mjs` and
`tsconfig.json` must not be weakened. Any of that → PARK.

If a command fails: one repair attempt — send dev the spec + the exact failing output ("fix the cause;
never skip, loosen or delete tests"), then have `reviewer` review only that repair, then re-run **all**
verify commands. Still red, or the reviewer finds Critical/High in the repair → **PARK**.

## Step 6 — Commit, push, PR, In Review

1. Stage and inspect:
   ```bash
   git add -A && git diff --cached --name-only
   ```
   If any staged path is `.env*`, `*.pem`, under `.next/`, `test-results/`, `playwright-report/`,
   `node_modules/`, or `*.tsbuildinfo` → `git reset` and PARK. Nothing else is staged that the ticket
   did not need (an `AGENTS.md` rewritten by `next dev` is fine to include).
2. Commit (conventional, Jira key in the subject, ≤ 72 chars, body explains why):
   ```bash
   git commit -F - <<'EOF'
   feat(<scope>): <summary> MFW-<N>

   <why this change, decisions taken, anything the spec was silent on>

   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   EOF
   ```
   `SHA=$(git rev-parse HEAD)`.
3. Push:
   ```bash
   export GH_TOKEN="$(gh auth token -u chocody)" && git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push -u origin <BRANCH>
   ```
4. Open the PR (title = commit subject), body in English:
   ```bash
   export GH_TOKEN="$(gh auth token -u chocody)" && gh pr create --repo chocody/miniature-festival-world --base main --head <BRANCH> --title "<subject>" --body-file - <<'EOF'
   ## Summary
   <2–4 sentences from the lead's Goal>. Jira: [MFW-<N>](https://chocody.atlassian.net/browse/MFW-<N>)

   ## Acceptance criteria
   - [x] <AC text verbatim> — <how it is met: file / test that proves it>
   - …(every AC from docs/backlog.json; an AC not met means you should have parked)

   ## Decisions
   <open questions decided (by whom) and anything the spec was silent on; "None" if none>

   ## Test plan
   - `pnpm typecheck` / `pnpm lint` / `pnpm test` (<n> passed) / `pnpm build` / `CI=1 pnpm e2e` (<n> passed) — all green locally
   - New tests: <path> — <what it asserts>

   ## Review
   reviewer: <summary, fixed findings> · qa: <verdict> · <auditors and verdicts> · fix rounds: <0|1>

   ## Known follow-ups
   - [Medium] … (or "None")

   ## Out of scope
   - … (from the lead's spec)

   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   EOF
   ```
5. `gh pr view <BRANCH> --repo chocody/miniature-festival-world --json number,url,headRefOid` → `PR`,
   `PR_URL`; `headRefOid` must equal `SHA`, otherwise PARK.
6. `node scripts/jira.mjs transition <KEY> in-review` and
   `node scripts/jira.mjs comment <KEY> "PR opened: <PR_URL> (head <SHA>)"`.

## Step 7 — Merge gate (docs/ci.md)

1. Run the gate as **one background Bash command** (`run_in_background: true`). It waits for the `ci`
   check to appear on the PR head, runs `gh pr checks --watch --fail-fast` (never `--required`), and
   confirms `ci` is `SUCCESS` on exactly `SHA`. Do not poll or sleep in the foreground; wait for the
   completion notification.
   ```bash
   export GH_TOKEN="$(gh auth token -u chocody)" && bash scripts/wait-ci.sh <PR> <SHA>
   ```
2. Last line `GATE: PASS sha=<SHA>` → merge with the head pinned:
   ```bash
   export GH_TOKEN="$(gh auth token -u chocody)" && gh pr merge <PR> --repo chocody/miniature-festival-world --squash --delete-branch --match-head-commit <SHA>
   export GH_TOKEN="$(gh auth token -u chocody)" && gh pr view <PR> --repo chocody/miniature-festival-world --json state,mergeCommit --jq '.state + " " + .mergeCommit.oid'
   ```
   The second command must print `MERGED <merge-sha>`. Then:
   ```bash
   git checkout main && export GH_TOKEN="$(gh auth token -u chocody)" && git -c credential.helper= -c 'credential.helper=!gh auth git-credential' pull --ff-only origin main
   git branch --list <BRANCH> | grep -q . && git branch -D <BRANCH>   # only after MERGED was confirmed
   node scripts/jira.mjs transition <KEY> done
   ```
   and the outcome comment (loop-epic reads this line, keep the format):
   ```bash
   node scripts/jira.mjs comment <KEY> "Merged <PR_URL> as <merge-sha>. Outcome: size=<S|M|L> dev=<model> fixRounds=<0|1> ciRuns=<1|2> files=<n> lines=+<a>/-<d> result=merged"
   ```
   If `gh pr merge` fails (conflict, head moved, anything) → PARK. Never retry without
   `--match-head-commit`, never merge another way.
3. `GATE: FAIL …` — **first** CI failure for this ticket:
   - `gh run list --repo chocody/miniature-festival-world --branch <BRANCH> --workflow ci.yml --limit 1 --json databaseId,conclusion`
     then `gh run view <id> --repo chocody/miniature-festival-world --log-failed | tail -200`.
   - "PR head moved" → PARK (someone else pushed).
   - Code/test failure → dev fixes the cause (same rules as Step 5), re-run all Step 5 commands green,
     new commit (never amend, never force-push), push, comment `CI failed once: <cause>; fix pushed as <new SHA>`,
     then run the gate again with the new `SHA`.
   - Infrastructure failure (runner lost, network, cancelled run) → `gh run rerun <id> --repo chocody/miniature-festival-world --failed`
     once, comment it, run the gate again with the same `SHA`.
4. `GATE: FAIL` a **second** time → PARK ("CI failed twice").

## Park procedure (stop conditions)

PARK when: preflight ticket-specific check fails (Step 1.7–1.8); qa GOAL NOT MET; Critical/High still open
after the fix round; any auditor FIX FIRST after the fix round; local verify cannot be made green; a
loosened test/config is detected; CI fails twice; PR head mismatch; merge command fails.

1. Preserve the work (only if files were changed on the ticket branch):
   - Not committed yet → stage with the Step 6.1 checks, commit with the normal subject, push, and open
     the PR as a **draft** (`gh pr create --draft …`) whose body starts with `**Needs human:** <reason>`
     followed by the open findings. Never mark it ready, never merge it.
   - PR already open → leave it open as is; add a PR comment with the reason
     (`gh pr comment <PR> --repo chocody/miniature-festival-world --body-file -`).
   - Then `git checkout main` so the working tree is clean for the next run.
2. `node scripts/jira.mjs label <KEY> add needs-human`
3. Comment with the reason and what was tried:
   ```bash
   node scripts/jira.mjs comment <KEY> - <<'EOF'
   Needs human: <one-line reason>
   Step: <step where it stopped>
   Tried:
   - <fix round / repair / CI attempts, with outcome>
   Open findings:
   - <severity> <file:line> <title>   (or the product questions with the options seen)
   State: status <To Do|In Progress|In Review>, branch <BRANCH or none>, PR <URL or none>
   To resume: answer/fix, remove the needs-human label, and move the ticket back to To Do (delete the branch/PR first if it should restart) — or finish and merge the PR by hand.
   Outcome: size=<S|M|L> dev=<model> fixRounds=<n> ciRuns=<n> result=parked
   EOF
   ```
   Do not transition the ticket; it stays where it was.
4. If Jira itself is unreachable at this point, still do step 1, then tell the user exactly what could
   not be recorded.
5. Report to the user (Thai) and end the run.

## Final report (Thai, short)

```
## MFW-<N> — <summary>
ผล: merged ✅ / parked (needs-human) — <เหตุผลหนึ่งบรรทัด>
ขนาด: <S|M|L> · dev <model> · fix rounds <n> · CI <n> รอบ
PR: <PR_URL> · merge sha <sha>
Review: reviewer <…> · qa <…> · <auditors>
ควรแก้ทีหลัง: <Medium/Low หรือ "ไม่มี">
ต้องให้คนทำ: <ถ้า parked: ต้องตัดสินใจ/แก้อะไร>
```

## Never

- Force-push `main` (or force-push at all), amend pushed commits, or rewrite history.
- Merge with a red, pending, missing or different-sha `ci` check; merge without `--match-head-commit`.
- Skip, loosen, delete or `.only` tests, or weaken CI/lint/type config to get green.
- Read, print, copy, edit or commit `.env*` files or the Jira token.
- Work on more than one ticket per run, or resume a ticket that is In Progress / In Review.
- Use the Atlassian MCP connector for MFW, or the machine's default `gh` account.
- Transition a ticket to Done without a confirmed `MERGED` PR.
