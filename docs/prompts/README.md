# Task prompts for other AI agents

One self-contained prompt per remaining Loop 2–8 ticket (`MFW-<n>.md`), generated from `docs/backlog.json`
and the owner's decisions in `docs/spec/open-questions.md` (2026-11-23). If a prompt and those files ever
disagree, the files win — regenerate the prompt. `index.json` lists every prompt with its blockers and branch.

## How to hand a ticket to another AI

1. Pick a ticket whose blockers are merged on `main` (`node scripts/jira.mjs next --all-ready` lists them).
2. In Jira, move the card to **In Progress** and add a comment such as "handed to <agent>" — the loop
   (`/loop-ticket`, `/loop-epic`) then skips it, so two agents never work on the same ticket.
3. Give the agent the whole `MFW-<n>.md` file. It opens a ready PR on `feat/MFW-<n>-<slug>` and stops.

## Review (Claude)

Ask Claude: "review PR #<n> for MFW-<n>". Claude runs the same gate as `/loop-ticket` on that PR:
reviewer ∥ qa ∥ the project auditors (`privacy-auditor`, `r3f-perf-reviewer` per CLAUDE.md), local
verify, the `ci` gate on the exact head SHA, and then

- merges and moves the card to Done, or
- for tickets labelled `privacy` / `db` / `migration`, labels the PR `owner-merge` and leaves the merge to you, or
- comments the findings on the PR and Jira and labels the card `needs-human` if it must go back.

External agents never merge, never change Jira and never push to `main`.
