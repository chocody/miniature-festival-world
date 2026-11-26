# Loop context (shared facts for every ticket brief)

Passed to agents with `loop-brief --context-file docs/loop/context.md`. It holds facts about the code and CI that
every ticket needs; `CLAUDE.md` stays the rule book (invariants A–G are not repeated here or in briefs).

## Code layout (`docs/spec/03-structure.md` is authoritative)
- `src/config/*.config.ts` — constants and per-feature numbers, with a colocated `*.config.test.ts`.
  Never inline a magic number in a component: read it from a config file.
- `src/core/*` (coordinates, fallback2d, effects, world, ...) — pure logic, no React. Converters need
  round-trip unit tests (invariant B).
- `src/components/{canvas3d,canvas2d,models,ui}` — rendering; read `reducedMotion` and `qualityTier` from the
  stores (invariant F).
- `src/services/*`, `src/app/api/*`, `supabase/**` — server side, privacy-critical (invariants C, D, G).
- `src/store/*` — separate Zustand stores: UI / builder / world / device.
- Tests: colocated `src/**/*.test.ts(x)` and `tests/unit/**` (vitest); `tests/e2e/*.spec.ts` (Playwright).

## Environment
- No Supabase env in CI or previews: code must build and render with empty/mock data; tests use fixtures.
- Next.js 16: read `node_modules/next/dist/docs/` before using a Next API.
- Never read or print `.env*` files or tokens. Never commit, push, stash, reset or checkout (the loop does).

## Verify commands (run as `cd <WT> && …`)
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` — the same four CI runs.
- e2e: `E2E_PORT=<port> CI=1 pnpm e2e` (production build on that port; `CI=1` forces a fresh server).
  In a cloud session also `PW_CHROMIUM_PATH` is set — never run `playwright install` there.
  The brief gives the port; do not use another and never kill a process you did not start.
- While iterating, run only the e2e spec you touched (`pnpm e2e tests/e2e/<name>.spec.ts`); the loop runs the
  full suite once at the end (`scripts/loop-verify.mjs`).

## CI
- One job, `ci`: install, typecheck, lint, unit tests, build, install browser, `pnpm e2e` (`docs/ci.md`).
  It must be SUCCESS on the exact head SHA before a merge.
- 3D e2e runs on SwiftShader (software WebGL) and is slow: poll DOM attributes instead of waiting for camera
  animation, and do not click fixed coordinates the camera can move.

## Reports
- Each reviewing agent starts its report with a first line `VERDICT: PASS`, `VERDICT: FIX FIRST` or
  `VERDICT: GOAL NOT MET` (qa only); the loop gates PR creation on it.
- Follow-ups and spec gaps: say so in the report; do not invent product numbers or behavior.
