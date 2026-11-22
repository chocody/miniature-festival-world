---
name: spec-to-jira
description: Sync docs/backlog.json into Jira project MFW (chocody.atlassian.net) — idempotently creates or updates epics, stories and "Blocks" links, matched by spec-epic-<id> / spec-task-<id> labels, never deleting anything, and rewrites docs/backlog-keys.json. Always shows a dry-run plan first. Use after the backlog changes, or when asked to push the spec/backlog to Jira.
argument-hint: "[--yes to skip the confirmation after the dry run]"
allowed-tools: Bash, Read
---

# spec-to-jira — docs/backlog.json → Jira MFW

**`docs/backlog.json` is the source of truth.** A change to the spec (`docs/spec/`) must be reflected in
`docs/backlog.json` first (new story, changed AC, new `blockedBy`) — this skill never reads `docs/spec/`
and never pulls Jira edits back into the repo. Edits made by hand in Jira to a summary or description
are overwritten by the next sync; labels added by hand (e.g. `needs-human`) are kept.

All Jira access goes through `node scripts/jira.mjs` (REST API, credentials from `~/.config/mfw/jira.env`).
**Never use the Atlassian MCP connector for MFW** — it points at a different Jira site.

## Steps

1. **Dry run** (no writes, keys file untouched):
   ```bash
   node scripts/jira.mjs sync-backlog --dry-run
   ```
   - Exit 2 → credentials missing or wrong site. Show the human the stderr message verbatim (it says how
     to create `~/.config/mfw/jira.env` and the API token at
     https://id.atlassian.com/manage-profile/security/api-tokens) and stop. Never ask for the token in chat,
     never read or print the env file.
   - Exit 1 with `errors` (duplicate spec labels, invalid backlog, an epic id matching a non-Epic issue,
     dependency cycle) → nothing was written. Show the errors and stop; they need a human fix.

2. **Show the plan** to the human, in Thai, compactly: `counts` (create / update / unchanged /
   linksToCreate / linksExisting), each create (spec id, type, summary), each update (key, which fields:
   summary from→to, description first differing line, labels added, parent), the links to create
   (`MFW-7 blocks MFW-8`) and every warning. Call out anything surprising — many description updates
   usually mean the Jira text was edited by hand or was written in another format.

3. **Confirm.** If there is anything to create or update, ask once for a go-ahead, unless the human
   passed `--yes` or already said to run it. If the plan is all-unchanged with no links to create, say
   so and stop — there is nothing to do.

4. **Real sync:**
   ```bash
   node scripts/jira.mjs sync-backlog
   ```
   It creates epics before their stories, then applies updates, then creates missing links with the
   blocker → blocked direction, and writes `docs/backlog-keys.json` after every create. If it stops
   part-way (exit 1, `partial: true` on stdout) it is safe to re-run: issues are matched by spec label
   and keys recorded in `docs/backlog-keys.json` are re-fetched directly, so nothing is duplicated.
   Report what was done and re-run only once; a second failure goes to the human with the error.

5. **Report** (Thai): created / updated / unchanged counts, links created, warnings (e.g. a reversed
   link to delete by hand), and whether `docs/backlog-keys.json` changed. If it changed, say that the
   file must be committed on a branch with a PR like any other change (this skill does not commit).

## Rules

- Never delete issues, links or labels; the CLI cannot, and you must not do it another way.
- Never edit `docs/backlog-keys.json` by hand to "fix" a mismatch — fix labels in Jira, re-run the dry run.
- Never print, log or commit the Jira token.
