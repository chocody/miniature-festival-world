---
name: loop-epic
description: Work through one MFW epic ticket by ticket — repeatedly runs the loop-ticket procedure on the next ready ticket of that epic (Jira rank + "is blocked by" order), optionally runs independent ready tickets in parallel git worktrees with a serialized merge queue, stops at a per-run cap (--max) or when nothing is ready or a stop condition fires, then closes the epic if every child is Done and posts an epic report to Jira and to the user. Use when asked to run a whole loop/epic (e.g. "run L1", "do MFW-6").
argument-hint: "<epic key MFW-n | loop id L0…L8> [--max <n>] [--parallel <n>]"
---

# loop-epic — run loop-ticket over one epic

The first argument is an epic key (`MFW-6`) or a loop id from `docs/backlog-keys.json` (`L1`). No argument →
ask which epic and stop. All Jira access is `node scripts/jira.mjs …` (never the Atlassian MCP connector);
all GitHub access is `node scripts/gh-rest.mjs …` through loop-ticket.

Options:
- `--max <n>` — tickets **started** (claimed) in this run; default 3, allowed 1–10.
- `--parallel <n>` — lanes at once; default 1, allowed 1–3. `--parallel 1` is the one-ticket-at-a-time loop.

An invalid value → tell the user and stop.

Every ticket goes through **the full loop-ticket procedure and its merge gate** — this skill only decides
which ticket comes next and when to stop. It adds no shortcuts: no batching tickets into one PR, no
skipping review or CI for "small" tickets, no merging while a ticket is parked.

## Steps

1. **Resolve and inspect the epic:**
   ```bash
   node scripts/jira.mjs epic <ARG>
   ```
   Exit 2 → show the credentials message and stop. Keep `epic.key`, `epic.summary`, and the starting
   `counts`. If `allDone` is already true, skip to step 4.

   **Start the epic's sprint** (one epic = one sprint; Jira Free allows one active sprint):
   ```bash
   node scripts/jira.mjs sprint-start <EPIC_KEY>          # default length 14 days; --days <n> to change
   ```
   It creates (or reuses) `Sprint <n> (Loop <n>)`, adds the epic and all its children, and starts it.
   `action: "already-active"` means a previous run already started it — continue. If it fails because
   **another epic's sprint is still active**, stop and tell the user which sprint is open (that epic must
   be finished and its sprint completed first). Do not complete or move another epic's sprint yourself.

   **1b. Reconcile owner merges.** Tickets labelled `owner-merge` have a green PR that only the owner merges.
   ```bash
   node scripts/jira.mjs next --all-ready --epic <EPIC_KEY>
   ```
   For each key in `awaitingOwner`: `node scripts/jira.mjs get <KEY>`, take the PR URL from the newest
   `[mfw-loop]` comment starting "Awaiting owner merge:", then `node scripts/gh-rest.mjs pr-get <n>`:
   - `merged: true` → `node scripts/jira.mjs transition <KEY> done`, `node scripts/jira.mjs label <KEY> remove owner-merge`,
     and comment `Merged by owner: <PR_URL> as <mergeCommitSha>. Outcome: <same fields as the awaiting comment> result=merged`;
   - closed and not merged → leave it, list it under "Needs human";
   - still open → list it under "Awaiting owner merge".

2. **Loop (sequential, `--parallel 1`)** — repeat:
   1. `node scripts/jira.mjs next --epic <EPIC_KEY>`.
      - `inFlight` holds a key this run did not claim → stop the loop (a ticket is mid-flight somewhere;
        loop-ticket would refuse).
      - `key` null → stop the loop with `reason` (nothing ready: done, blocked by another epic, or parked).
      - `key` equals the previous iteration's key → stop the loop ("MFW-<n> was offered twice — its merge
        or Done transition did not stick"); never run the same ticket twice in one epic run.
      - the number of tickets started in this run has reached `--max` → stop the loop ("cap reached").
   2. Run the **loop-ticket** skill procedure (`.claude/skills/loop-ticket/SKILL.md`) for that key, from
      Step 1 to its final report — exactly as if `/loop-ticket <KEY>` had been invoked.
   3. Record for the epic report: key, summary, result (merged / awaiting owner merge / parked), PR URL, merge
      sha, estimated size and dev model, fix rounds, CI runs, files and lines changed.
   4. **Continue only on `merged` or `awaiting owner merge`.** Any other outcome stops the epic loop: parked
      (`needs-human`), any loop-ticket preflight stop (dirty tree, fetch/gh/credential failure,
      `ready: false`, foreign `inFlight`, claim returned `"changed": false`), an error or crash, or a merge
      whose post-merge steps could not be completed. A parked ticket usually means the next ones build on a
      decision a human has to make; an environment stop will not fix itself by retrying. (A ticket that waits
      for the owner does not block independent tickets: anything that depends on it stays blocked in Jira
      until it is Done, so `next` will not offer it.)
   5. Merged or awaiting owner merge → continue with the next iteration (main is already updated by
      loop-ticket).
   6. Context hygiene: if this session is getting long (many tickets, large diffs), stop after the current
      ticket and say so — re-running `/loop-epic <ARG>` resumes from Jira state.

3. **Parallel mode (`--parallel ≥ 2`)** — replaces step 2:
   - **Preflight once** (loop-ticket Step 1.1–1.4 in the root checkout). The root checkout stays on `main`,
     clean.
   - **Lanes.** Slot `s` = 1..P. `WT = <repo parent>/mfw-wt/MFW-<N>` (created with `git worktree add`, see
     loop-ticket Step 3.3), `PORT = 3100 + s` (`E2E_PORT`), `QA_PORT = 3150 + s`. Example: slot 1 → 3101 / 3151.
   - **Fill free slots.** `node scripts/jira.mjs next --all-ready --epic <EPIC_KEY>`; `inFlight` must be a
     subset of the keys this run claimed (else stop starting lanes and tell the user). Take `ready` in rank
     order (ready tickets are mutually independent: a ticket blocked by an unfinished one is never ready), up
     to the free slots and the remaining `--max`. For each: run loop-ticket Steps 1.6–3 for it with
     `LANE=true`, its `WT` / `PORT` / `QA_PORT`, and `PEERS` = the other keys this run has claimed. Never
     offer a key twice in one run.
   - **Run the lanes' Steps 4–5 concurrently:** launch the lane agents in the same message or as background
     agents, and act on each lane's next step when its agent returns. Keep a one-line status per lane in your
     context; reports go to `<SCRATCH>` files.
   - **Merge queue.** A lane whose Step 5 is green joins the merge queue (FIFO). Exactly **one** lane at a time runs
     loop-ticket Steps 6–7 (commit, sync with main = rebase the unpushed commit onto the newest `origin/main`
     and re-run Step 5 if main moved, push, PR, In Review, `ci` gate on the new SHA, merge or owner-merge).
     The next lane starts Step 6 only after the previous one merged, went to owner-merge, or parked. This is
     what guarantees "rebase + green ci before each merge" without ever force-pushing.
   - A lane that parks during Steps 1–5 runs the Park procedure at once (draft PR; no queue needed).
   - When a lane ends (merged / awaiting owner) and no stop rule fired, refill its slot.
   - **Stop rules** (stop **starting** lanes; finish or park the lanes already claimed — never abandon a
     claimed ticket In Progress): cap reached (`--max`); any lane parked; an environment stop (Jira/GitHub
     exit 2, dirty root, foreign `inFlight`); the same key offered twice; context getting long. If the
     session itself must end with a lane still mid-flight, PARK that lane with reason "run ended mid-flight"
     so the next run is not blocked.
   - **Cleanup at the end:** `git worktree remove <WT>` for every lane (never `--force`), then
     `git worktree prune`.

4. **Re-read the epic:** `node scripts/jira.mjs epic <EPIC_KEY>` (fresh statuses and the `Outcome:`
   lines recorded on each child, including tickets done in earlier sessions).

5. **Close the epic** only if `allDone` is true (it has children and every child is Done):
   `node scripts/jira.mjs transition <EPIC_KEY> done`, then **complete the sprint**:
   `node scripts/jira.mjs sprint-complete <EPIC_KEY>` (it refuses if any issue in the sprint is not Done —
   report that instead of forcing it). Otherwise leave the epic and its sprint open; the sprint stays
   active until a later `/loop-epic` run finishes the epic.

6. **Epic report** — post to Jira on the epic, then tell the user (Thai). Jira comment (English):
   ```bash
   node scripts/jira.mjs comment <EPIC_KEY> - <<'EOF'
   ## Epic report — <EPIC_KEY> <summary>
   Mode: sequential | parallel <P> · cap <max> · started <n>
   Result: <closed (all children Done) | open: <n> of <total> Done>
   Stopped because: <nothing ready / ticket parked / preflight stop / same key offered twice / in-flight ticket / error / context limit / cap reached>

   ## Tickets done this run
   - MFW-<n> <summary> — <PR URL> — merged <sha> — est <S|M|L> (dev <model>) · fixRounds <n> · ciRuns <n> · <files> files +<a>/-<d>

   ## Estimates vs reality
   - <per ticket: estimate held, or why it was bigger/smaller (fix round used, CI retry, more files than expected)>
   - Totals: <n> tickets, <n> fix rounds, <n> CI re-runs

   ## Awaiting owner merge
   - MFW-<n> <summary> — <PR URL> — <reason: labels / supabase paths> (or "None")

   ## Needs human
   - MFW-<n> <summary> — <status> — <reason from its needs-human comment> (or "None")

   ## Not ready yet
   - MFW-<n> — <notReadyReasons> (or "None")
   EOF
   ```
   Report to the user in Thai with the same content, short: ตั๋วที่เสร็จ + PR, ตั๋วที่รอเจ้าของ merge,
   ตั๋วที่ต้องให้คนตัดสินใจ, ประมาณการเทียบของจริง, และ epic ปิดแล้วหรือยัง.

## Scheduling

Unattended runs use a Claude Code scheduled task that starts a fresh cloud session in the `mfw-loop`
environment each day with a prompt such as `/loop-epic L2 --max 2` (see `docs/cloud.md`). Each run picks up
from Jira state: it reconciles owner merges, still runs every ticket through the full loop-ticket gate (CI
green before merge), and stops at the first parked ticket or at `--max`. If a scheduled run completes no
ticket and the epic state is unchanged, do not post another epic report — check the latest `[mfw-loop]`
"Epic report" comment in `node scripts/jira.mjs get <EPIC_KEY>` first; just tell the user nothing changed.
Once the epic is closed, tell the user to disable the scheduled task.

## Rules

- Never start a ticket while `inFlight` holds a key this run did not claim; in sequential mode one ticket at
  a time, in parallel mode at most `--parallel` lanes and only one lane in loop-ticket Steps 6–7.
- Never transition the epic to Done unless `epic` reports `allDone: true`.
- Never remove `needs-human` labels or move parked tickets — that is the human's call.
- Never pass `--owner-approved` to `pr-merge` (the owner's override, never the loop's).
- Never merge an owner-merge ticket; never move it to Done unless `pr-get` shows it merged.
- Everything in loop-ticket's "Never" list applies to every ticket here.
