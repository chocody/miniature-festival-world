# Prompt — MFW-33 [8.1] Flat vector 2D fallback renderer

> Hand this whole file to an AI coding agent that has the repository `chocody/miniature-festival-world` checked out.
> Generated from `docs/backlog.json` and the owner's decisions in `docs/spec/open-questions.md` (2026-11-23). If they disagree, those files win.

You are implementing ONE ticket in the repository **chocody/miniature-festival-world** (Next.js 16 App Router + TypeScript + Tailwind + Three.js/React Three Fiber + Zustand + Supabase, pnpm). Work only on this ticket.

## Ticket
- Jira: **MFW-33** — https://chocody.atlassian.net/browse/MFW-33 — Story — epic MFW-32 (Loop 8 — Flat Vector 2D Fallback & Mobile Performance Polish)
- Labels: fallback2d
- Goal: Devices without good 3D still get the full experience.

### Acceptance criteria (verbatim — build exactly these, nothing from later tickets)
1. Layered 2D flat-vector krathong customizer
2. Semi top-down 2D river reading the same SplinePathCoord; 2D ripples on tap; Find My Krathong scrolls to it
3. core/fallback2d includes NormalizedCylindricalCoord → 4-quadrant 2D view converter (prepared for Christmas / CNY)

## Before you start
- These tickets must already be merged on `main`: MFW-8 [1.2], MFW-9 [1.3], MFW-24 [5.2]. If one is not merged, stop and say so.
- Read, in this order: `CLAUDE.md`, `AGENTS.md`, `docs/spec/README.md`, `docs/spec/06-loops/loop-8.md`, `docs/spec/03-structure.md`, `docs/spec/open-questions.md`, `docs/spec/04-coordinates.md`. The spec is mostly Thai; quote it, do not translate it into code comments.
- This Next.js (16.x) differs from your training data: read the relevant guide in `node_modules/next/dist/docs/` before using any Next.js API.
- Look at the existing code first (`src/config`, `src/core`, `src/store`, `src/components`) and reuse it: coordinate converters in `src/core/coordinates`, the device profiler and `TIER_BUDGETS` in `src/core/performance` / `src/config/performance.config.ts`, the flow state machine in `src/core/flow`.

## Owner decisions that apply (already made — do not reopen them)
- Launch plan (owner): Loy Krathong 2026 is a private test only; the first public launch is Christmas. Build engine pieces generically (they will be reused for Christmas on NormalizedCylindricalCoord) and finish Loy Krathong-specific parts only as far as the private test needs (open questions 14–19).

## Known follow-ups you must honour
- The 2D fallback imports three's curve math through src/core/coordinates (MFW-8 follow-up). Check the FALLBACK_2D chunk size in the build output and report it in the PR.

## Non-negotiable invariants (full text in CLAUDE.md — breaking one blocks the merge)
- A (parametric coords only)
- B (3D and 2D read one coord set)
- E (mobile performance budget)
- F (reduced motion + quality tiers)
- All other invariants in CLAUDE.md apply as well.

## Rules
- Build only this ticket's acceptance criteria. No features from later tickets, no Christmas scene work.
- If the spec is silent, do not invent numbers or behaviour: choose the smallest reasonable option, put any number in a config file as a named constant, and list it under "Decisions" in the PR.
- No new dependency unless an acceptance criterion needs it; say why in the PR.
- Never read, print or commit `.env*` files or secrets. CI and PR previews have **no** Supabase env: the app must build and render with empty/mock data, and unit tests and e2e must not need a live database (use mocks/fixtures or local Supabase).
- Do not weaken, skip or delete tests, lint rules, tsconfig or CI config.
- Do **not** change Jira, do **not** merge, do **not** push to `main`.
- Do not edit loop or CI infrastructure: `.claude/**`, `scripts/**`, `.github/**`, `CLAUDE.md`, `AGENTS.md`. If you must change `package.json` (a needed dependency) or a config file, say exactly why in the PR — the review stops and asks the owner first.

## Definition of done
- Every testable acceptance criterion has a test (vitest, colocated `*.test.ts(x)` or `tests/unit/`; Playwright e2e in `tests/e2e/` for user flows).
- All green locally, each run separately: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm e2e` (Playwright on port 3100; `E2E_PORT` / `PW_CHROMIUM_PATH` override port / browser).
- Delete any `playwright-report/` and `test-results/` folders before committing; never commit `.next/`, `*.tsbuildinfo`.

## Deliverable
1. Branch `feat/MFW-33-flat-vector-2d-fallback-renderer` cut from the latest `main`.
2. Conventional commit(s) with the key in the subject, e.g. `feat(<scope>): <summary> MFW-33`.
3. Push the branch and open a **ready** pull request against `main` titled with the same subject. Body (English):
   - Summary + link to MFW-33
   - Acceptance criteria as a checklist, each with the file/test that proves it
   - Decisions (anything the spec was silent on, numbers you chose)
   - Test plan (the five commands and their results)
   - Known follow-ups / out of scope
4. Leave the PR open. The owner's review agent will review it (reviewer + qa + r3f-perf-reviewer), run the CI gate and merge.
