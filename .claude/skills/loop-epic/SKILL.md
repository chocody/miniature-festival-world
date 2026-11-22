---
name: loop-epic
description: Work through one MFW epic ticket by ticket — repeatedly runs the loop-ticket procedure on the next ready ticket of that epic (Jira rank + "is blocked by" order) until nothing is ready or a stop condition fires, then closes the epic if every child is Done and posts an epic report to Jira and to the user. Use when asked to run a whole loop/epic (e.g. "run L1", "do MFW-6").
argument-hint: "<epic key MFW-n | loop id L0…L8>"
---

# loop-epic — run loop-ticket over one epic

The argument is an epic key (`MFW-6`) or a loop id from `docs/backlog-keys.json` (`L1`). No argument →
ask which epic and stop. All Jira access is `node scripts/jira.mjs …` (never the Atlassian MCP connector).

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

2. **Loop** — repeat:
   1. `node scripts/jira.mjs next --epic <EPIC_KEY>`.
      - `inFlight` non-empty → stop the loop (a ticket is mid-flight somewhere; loop-ticket would refuse).
      - `key` null → stop the loop with `reason` (nothing ready: done, blocked by another epic, or parked).
      - `key` equals the previous iteration's key → stop the loop ("MFW-<n> was offered twice — its merge
        or Done transition did not stick"); never run the same ticket twice in one epic run.
   2. Run the **loop-ticket** skill procedure (`.claude/skills/loop-ticket/SKILL.md`) for that key, from
      Step 1 to its final report — exactly as if `/loop-ticket <KEY>` had been invoked.
   3. Record for the epic report: key, summary, result (merged / parked), PR URL, merge sha, estimated
      size and dev model, fix rounds, CI runs, files and lines changed.
   4. **Continue only on `merged`.** Any other outcome stops the epic loop: parked (`needs-human`),
      any loop-ticket preflight stop (dirty tree, pull/gh/credential failure, `ready: false`, `inFlight`
      non-empty, claim returned `"changed": false`), an error or crash, or a merge whose post-merge steps
      could not be completed. A parked ticket usually means the next ones build on a decision a human has
      to make; an environment stop will not fix itself by retrying.
   5. Merged → continue with the next iteration (main is already pulled by loop-ticket).
   6. Context hygiene: if this session is getting long (many tickets, large diffs), stop after the current
      ticket merges and say so — re-running `/loop-epic <ARG>` resumes from Jira state.

3. **Re-read the epic:** `node scripts/jira.mjs epic <EPIC_KEY>` (fresh statuses and the `Outcome:`
   lines recorded on each child, including tickets done in earlier sessions).

4. **Close the epic** only if `allDone` is true (it has children and every child is Done):
   `node scripts/jira.mjs transition <EPIC_KEY> done`, then **complete the sprint**:
   `node scripts/jira.mjs sprint-complete <EPIC_KEY>` (it refuses if any issue in the sprint is not Done —
   report that instead of forcing it). Otherwise leave the epic and its sprint open; the sprint stays
   active until a later `/loop-epic` run finishes the epic.

5. **Epic report** — post to Jira on the epic, then tell the user (Thai). Jira comment (English):
   ```bash
   node scripts/jira.mjs comment <EPIC_KEY> - <<'EOF'
   ## Epic report — <EPIC_KEY> <summary>
   Result: <closed (all children Done) | open: <n> of <total> Done>
   Stopped because: <nothing ready / ticket parked / preflight stop / same key offered twice / in-flight ticket / error / context limit>

   ## Tickets done this run
   - MFW-<n> <summary> — <PR URL> — merged <sha> — est <S|M|L> (dev <model>) · fixRounds <n> · ciRuns <n> · <files> files +<a>/-<d>

   ## Estimates vs reality
   - <per ticket: estimate held, or why it was bigger/smaller (fix round used, CI retry, more files than expected)>
   - Totals: <n> tickets, <n> fix rounds, <n> CI re-runs

   ## Needs human
   - MFW-<n> <summary> — <status> — <reason from its needs-human comment> (or "None")

   ## Not ready yet
   - MFW-<n> — <notReadyReasons> (or "None")
   EOF
   ```
   Report to the user in Thai with the same content, short: ตั๋วที่เสร็จ + PR, ตั๋วที่ต้องให้คนตัดสินใจ,
   ประมาณการเทียบของจริง, และ epic ปิดแล้วหรือยัง.

## Scheduling

This can run unattended with `/loop` (e.g. `/loop 2h /loop-epic L1`). Each scheduled run is just another
`/loop-epic`: it picks up from Jira state, still runs every ticket through the full loop-ticket gate (one
ticket at a time, CI green before merge), and stops at the first parked ticket. If a scheduled run
completes no ticket and the epic state is unchanged, do not post another epic report — check the latest
`[mfw-loop]` "Epic report" comment in `node scripts/jira.mjs get <EPIC_KEY>` first; just tell the user
nothing changed. Stop the schedule once the epic is closed.

## Rules

- One ticket in flight at a time; never start a ticket while `inFlight` is non-empty.
- Never transition the epic to Done unless `epic` reports `allDone: true`.
- Never remove `needs-human` labels or move parked tickets — that is the human's call.
- Everything in loop-ticket's "Never" list applies to every ticket here.
