# Shared Miniature Festival World — project rules for agents

A shared, anonymous, toy-like 3D world where people make a small festival object, write a wish,
and release it into a world everyone sees. One core engine + per-festival config plugins, with a
2D flat-vector fallback that reads the **same** data.

- **Phase 1 = Loy Krathong only** (make a krathong → wish → release onto a spline river).
  Every other festival (Christmas, New Year, CNY, Valentine's, Songkran, Mid-Autumn, Halloween)
  is a **config stub** that shows "Coming Soon". Do not build their scenes/gimmicks.
- **Source of truth:** `docs/spec/` (start at `docs/spec/README.md`; mostly Thai). Unresolved gaps are tracked in `docs/spec/open-questions.md` — check it before implementing a ticket.
  Most-cited: `04-coordinates.md` (coord model), `05-privacy-db.md` (tables).
- **Scope:** `docs/backlog.json` (stories + acceptance criteria), keys in `docs/backlog-keys.json`.
  Build what the ticket's AC says — nothing from later tickets.
- If the spec is silent on something, say so in your report/PR. Do not invent numbers or behavior.

## Next.js version warning

@AGENTS.md

`AGENTS.md` is managed by `next dev` — leave it alone. Read `node_modules/next/dist/docs/` before
using any Next.js API; this Next.js (16.x) differs from training data.

## Stack (spec §2.1, as chosen for this repo)

Next.js App Router + TypeScript + Tailwind · Three.js + React Three Fiber + @react-three/drei ·
GSAP or @react-spring/three (procedural micro-animation, no physics; spec leaves the choice open) ·
Zustand (separate UI / builder / world / device stores) · 2D fallback on HTML5 Canvas/SVG ·
Supabase (Postgres) · pnpm. Folder layout: follow [`docs/spec/03-structure.md`](docs/spec/03-structure.md)
exactly (`src/config`, `src/core/*`, `src/components/*`, `src/services/*`, `src/store/*`).

## Non-negotiable invariants

Breaking one of these is a blocking review finding, regardless of tests passing.

**A. Parametric coordinates only.** A placement is persisted (DB, API payload, local storage) only as
`SplinePathCoord` (`mode: "SPLINE_PATH"`, laneId, spawnProgress, speedFactor, lateralOffset),
`NormalizedCylindricalCoord` (`mode: "CYLINDRICAL_SURFACE"`, tierId, angleDeg, heightRatio) or
`PlanarZoneCoord` (normalized u, v in 0–1 within a zone_id). Never raw `(x, y, z)` / world positions.
World and screen positions are always *derived* at render time.
- Check: `coord` types are a discriminated union in `src/core/coordinates/`; grep the diff for
  `position`, `x:`, `Vector3`, `.toArray()` reaching `src/services/**`, `src/app/api/**`, `supabase/**`
  or `localStorage`. Any write path must accept only the coord union.

**B. 3D and 2D read one coord set.** The 3D scene and `src/core/fallback2d/` both convert from the same
stored coord; no 2D-only or 3D-only position field. Spline position is deterministic:
`CurrentProgress(t) = (spawnProgress + (now − createdAt) × speedFactor) % 1.0`.
- Check: every converter in `src/core/coordinates/` and `src/core/fallback2d/` has round-trip unit tests
  (parametric ↔ 3D world ↔ 2D canvas, within a stated tolerance). New converter without one = not done.

**C. No private data on public paths.** `creations_public` rows, every public API response
(e.g. `GET /api/creations`), and every client store fed from a public endpoint must never contain
`owner_token`, `owner_token_hash` or `private_wish_text`. The raw owner token (DeviceOwnerToken)
lives only in the device's LocalStorage; only its SHA-256 hash is ever sent or stored.
- Check: API routes select an explicit column allowlist (no `select('*')`, no spreading DB rows into
  responses); a test asserts those three keys are absent from the serialized response; grep the diff
  for the three names outside `src/services/auth/` and the ownership write path. No logging of them.

**D. Ownership table stays private; RLS everywhere.** `creations_private_ownership` is never readable
or writable through the public/anon Supabase Data API. Every table has RLS enabled with explicit policies.
`private_wish_text` is stored encrypted and returned only to a caller proving ownership.
- Check: each migration under `supabase/**` that creates a table also enables RLS; no `anon` grant or
  permissive policy on the ownership table; a test proves private text is not returned without a
  matching owner token (backlog 7.2).

**E. Mobile performance budget.** ~80–100 rendered items per zone max (spec gives a range; backlog 5.3
says ~80) — more participants open new zones instead. Ripples, fireworks, confetti and glow come from
`ObjectPoolManager` (`src/core/effects/`) with a fixed cap. Geometry/material/texture are disposed on
zone switch and unmount. Repeated parts (flowers, leaves, riverside trees) use `InstancedMesh`.
- Check: zone query/pagination enforces the cap; no `new` effect objects per tap; zone-switch code
  disposes what it created; `r3f-perf-reviewer` passes.

**F. Reduced motion + quality tiers.** Honor `prefers-reduced-motion` (e.g. camera fly-to becomes an
instant cut, bounce animations off) and the tiers `HIGH | MEDIUM | LOW | FALLBACK_2D` from
`useDeviceStore` / `performance.config.ts`. FALLBACK_2D is used when WebGL is unavailable or FPS stays
below threshold. **The FPS threshold and per-tier budgets are not specified yet** — define them in
`performance.config.ts`, never inline magic numbers.
- Check: new animated/3D code reads `reducedMotion` and `qualityTier` from the store; tests cover
  the reduced-motion branch.

**G. Moderation before anything goes public.** Phone numbers, emails, LINE IDs, social handles and
profanity are blocked from `public_wish_text` (rules in `src/config/moderation.config.ts`, detector in
`src/services/moderation/`). Thai and English inputs. The user is warned and cannot publish PII publicly.
- Check: the server enforces the guard (client-side check alone is not enough); tests include Thai
  and English positive/negative cases.

## Environment facts

- Supabase env vars exist **only in Vercel Production**. PR previews and CI have **no** Supabase env.
  Unit tests and e2e must not need a live DB — use mocks/fixtures, or local Supabase if a ticket sets it up.
  Code must build and render (with empty/mock data) when the env vars are absent.
- **Never read, print, copy or commit `.env*` files** (they are gitignored). Never echo secrets in logs.

## Commands (pnpm)

| Command | Runs |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js dev / production build / serve |
| `pnpm typecheck` | `next typegen && tsc --noEmit` |
| `pnpm lint` | `eslint` |
| `pnpm test` | `vitest run` (colocated `src/**/*.test.ts(x)` and `tests/unit/**`) |
| `pnpm e2e` | `playwright test` (`tests/e2e/`, prod build on :3100, WebGL via SwiftShader; add a FALLBACK_2D e2e once tickets 1.3 / 8.1 land) |

**Definition of done:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm e2e` all green
locally, every testable AC of the ticket has a test, and the `ci` check on the PR is SUCCESS.

## Workflow conventions

- Jira project **MFW**. Each ticket = one branch = one PR.
- Branch: `feat/MFW-<n>-<slug>` (or `fix/MFW-<n>-<slug>`), cut from `main`.
- Conventional commits with the Jira key in the subject: `feat(core): spline coord converter MFW-8`.
- PR title and body in English; body links the ticket and lists the AC with how each is met.
- **Squash merge only after the `ci` check (`.github/workflows/ci.yml`) is SUCCESS.** The repo has no
  branch protection, so the merge gate is enforced by process — see `docs/ci.md`. Never merge red/pending.
- No force-push to `main`, no committing generated files (`.next/`, `test-results/`, `*.tsbuildinfo`).

## Which project agent to add to review

The global `lead`, `dev`, `reviewer`, `qa` agents run on every ticket. Add these on top when the diff touches:

| Agent | Add when the diff touches |
|---|---|
| `privacy-auditor` | `src/services/**`, `supabase/**`, `src/app/api/**`, anything touching wish text, owner token / ownership, moderation or reporting, or the ticket has label `privacy` |
| `r3f-perf-reviewer` | `src/components/canvas3d/**`, `src/components/models/**`, `src/core/effects/**`, `src/core/world/**`, `src/core/fallback2d/**`, or label `perf` / `3d` |

Both are read-only and report PASS / FIX FIRST. A FIX FIRST blocks the merge like a failing check.

## Loop automation

Project skills in `.claude/skills/`, all talking to Jira through `node scripts/jira.mjs` (never the
Atlassian MCP connector — it points at another site):

- `/spec-to-jira` — sync `docs/backlog.json` → Jira (dry run first; idempotent via `spec-epic-*` /
  `spec-task-*` labels; never deletes) and refresh `docs/backlog-keys.json`.
- `/loop-ticket [MFW-n]` — one ticket end-to-end: lead → dev → reviewer ∥ qa (+ auditors per the table
  above) → PR → `ci` gate (`docs/ci.md`) → squash merge → Done. Stop conditions label `needs-human`.
- `/loop-epic <MFW-n|Ln>` — `loop-ticket` repeatedly over one epic, then an epic report.

Requires `~/.config/mfw/jira.env` (outside the repo) with `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`;
without it the CLI exits 2 and explains how to create it. Never commit or print it.

## Language

Code, comments, identifiers, commit messages, PR titles/bodies: **English**.
User-facing UI copy may be Thai (e.g. "ปล่อยกระทง", "ค้นหาของฉัน"). The spec is mostly Thai — quote it, don't translate it into code comments.
