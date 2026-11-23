# Prompt — MFW-11 [2.1] Client-side anonymous ownership token (DeviceOwnerToken)

> Hand this whole file to an AI coding agent that has the repository `chocody/miniature-festival-world` checked out.
> Generated from `docs/backlog.json` and the owner's decisions in `docs/spec/open-questions.md` (2026-11-23). If they disagree, those files win.

You are implementing ONE ticket in the repository **chocody/miniature-festival-world** (Next.js 16 App Router + TypeScript + Tailwind + Three.js/React Three Fiber + Zustand + Supabase, pnpm). Work only on this ticket.

## Ticket
- Jira: **MFW-11** — https://chocody.atlassian.net/browse/MFW-11 — Story — epic MFW-10 (Loop 2 — Privacy, Security & Anonymous Ownership Vault)
- Labels: privacy, auth
- Goal: Users own their creations without accounts.

### Acceptance criteria (verbatim — build exactly these, nothing from later tickets)
1. Cryptographically secure random token stored in LocalStorage; the server stores only its SHA-256 hash (the raw token goes only over HTTPS to the ownership endpoints and is never stored or logged — open question 1)
2. UI warns that clearing browser data or changing device loses access to own creations
3. Unit tests for generation, persistence, hashing

## Before you start
- These tickets must already be merged on `main`: MFW-7 [1.1]. If one is not merged, stop and say so.
- Read, in this order: `CLAUDE.md`, `AGENTS.md`, `docs/spec/README.md`, `docs/spec/06-loops/loop-2.md`, `docs/spec/03-structure.md`, `docs/spec/open-questions.md`, `docs/spec/05-privacy-db.md`. The spec is mostly Thai; quote it, do not translate it into code comments.
- This Next.js (16.x) differs from your training data: read the relevant guide in `node_modules/next/dist/docs/` before using any Next.js API.
- Look at the existing code first (`src/config`, `src/core`, `src/store`, `src/components`) and reuse it: coordinate converters in `src/core/coordinates`, the device profiler and `TIER_BUDGETS` in `src/core/performance` / `src/config/performance.config.ts`, the flow state machine in `src/core/flow`.

## Owner decisions that apply (already made — do not reopen them)
- Open question 1 (owner): the device keeps the raw DeviceOwnerToken in LocalStorage; the server stores only SHA-256(token). To prove ownership the device sends the raw token over HTTPS to the ownership endpoint — in a POST body or the Authorization header, never in a URL or query string — which hashes it and compares in constant time; the raw token is never stored, logged or returned.
- Open question 12 (owner): "My Creations" keeps creation ids in LocalStorage next to the token (no server query by owner); private text is read only with ownership proof (question 1).
- Launch plan (owner): Loy Krathong 2026 is a private test only; the first public launch is Christmas. Build engine pieces generically (they will be reused for Christmas on NormalizedCylindricalCoord) and finish Loy Krathong-specific parts only as far as the private test needs (open questions 14–19).

## Known follow-ups you must honour
- Open question 12 (keep creation ids in LocalStorage) is implemented by MFW-30 (My Creations), not here: build only the token (generate, persist, hash, warning) in this ticket.

## Non-negotiable invariants (full text in CLAUDE.md — breaking one blocks the merge)
- C (no private data on public paths)
- D (ownership table private, RLS everywhere)
- G (moderation before anything goes public)
- All other invariants in CLAUDE.md apply as well.

## Rules
- Build only this ticket's acceptance criteria. No features from later tickets, no Christmas scene work.
- If the spec is silent, do not invent numbers or behaviour: choose the smallest reasonable option, put any number in a config file as a named constant, and list it under "Decisions" in the PR.
- No new dependency unless an acceptance criterion needs it; say why in the PR.
- Never read, print or commit `.env*` files or secrets. CI and PR previews have **no** Supabase env: the app must build and render with empty/mock data, and unit tests and e2e must not need a live database (use mocks/fixtures or local Supabase).
- Do not weaken, skip or delete tests, lint rules, tsconfig or CI config.
- Do **not** change Jira, do **not** merge, do **not** push to `main`.

## Definition of done
- Every testable acceptance criterion has a test (vitest, colocated `*.test.ts(x)` or `tests/unit/`; Playwright e2e in `tests/e2e/` for user flows).
- All green locally, each run separately: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm e2e` (Playwright on port 3100; `E2E_PORT` / `PW_CHROMIUM_PATH` override port / browser).
- Delete any `playwright-report/` and `test-results/` folders before committing; never commit `.next/`, `*.tsbuildinfo`.

## Deliverable
1. Branch `feat/MFW-11-client-side-anonymous-ownership-token` cut from the latest `main`.
2. Conventional commit(s) with the key in the subject, e.g. `feat(<scope>): <summary> MFW-11`.
3. Push the branch and open a **ready** pull request against `main` titled with the same subject. Body (English):
   - Summary + link to MFW-11
   - Acceptance criteria as a checklist, each with the file/test that proves it
   - Decisions (anything the spec was silent on, numbers you chose)
   - Test plan (the five commands and their results)
   - Known follow-ups / out of scope
4. Leave the PR open. The owner's review agent will review it (reviewer + qa + privacy-auditor), run the CI gate and merge — this ticket is labelled privacy/db/migration, so the **owner** merges it personally after review.
