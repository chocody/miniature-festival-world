# Task prompts for other AI agents

One self-contained prompt per remaining Loop 2–8 ticket (`MFW-<n>.md`), generated from `docs/backlog.json`
and the owner's decisions in `docs/spec/open-questions.md` (2026-11-23). If a prompt and those files ever
disagree, the files win — regenerate the prompt. `index.json` lists every prompt with its blockers and branch.

## How to hand a ticket to another AI

1. Pick a ticket whose blockers are merged on `main` (`node scripts/jira.mjs next --all-ready` lists them).
2. In Jira, add the label **`handed-off`** to the card (and move it to In Progress if you like). With that
   label the loop (`/loop-ticket`, `/loop-epic`) never offers the ticket and does not count it as in flight,
   so it keeps working on other tickets — and two agents never work on the same ticket.
3. Give the agent the whole `MFW-<n>.md` file. It opens a ready PR on `feat/MFW-<n>-<slug>` and stops.
   External agents never merge, never change Jira and never push to `main`. If their PR touches loop or build
   infrastructure (`.claude/**`, `scripts/**`, `.github/**`, `package.json`, the lockfile, config files),
   Claude's review stops and asks you first — that code would run with the session's credentials.

## Review (Claude)

Ask Claude: "review PR #<pr> for MFW-<n>", which runs `/loop-ticket MFW-<n> --review-pr <pr>` (review mode in
`.claude/skills/loop-ticket/SKILL.md`). It checks out the PR branch and runs the normal gate on it:
reviewer ∥ qa ∥ the project auditors (chosen from the labels **and** the changed paths, as in CLAUDE.md —
so an auditor may run even if the prompt does not name it), one fix round as new commits on the PR branch,
local verify, the `ci` gate on the exact head SHA, and then

- merges, removes `handed-off` and moves the card to Done, or
- for tickets labelled `privacy` / `db` / `migration`, stops at a green PR labelled `owner-merge` — you merge it, or
- parks it: findings on the PR and in Jira, card labelled `needs-human`, PR left open for the other agent.
