# MFW-58 — Endless river: findings

Backlog 11.2 AC4: "Memory stays flat during a long travel and no hitch exceeds the tier budget when a zone streams in (probe numbers
recorded in the PR the same way as docs/perf/MFW-34.md)". Branch feat/MFW-58-endless-river, BASE 76c0e2a.

## 1. What changed
- Before: one copy of the river; the navigator switched zones (drop the old zone, fetch the new one) and the camera stopped at the pan
  bounds (x ∈ [−12, 12]).
- After: three persistent stretch copies (S − 1, S, S + 1) of the river, each with its own `RiverFlow` batch at today's per-zone cap
  (`RiverStretch.tsx`). A seam crossing leapfrogs the far slot: only its krathong instances are re-planned, no geometry, material or texture
  is created. Slots outside the view are hidden per frame (yaw-aware along-axis culling) and skip their per-frame writes. The store keeps
  the zones of S − 2 … S + 2 (≤ 5 zones, `ZONE_STREAM_LOAD_RADIUS`); far zones are dropped. Effect pools stay one set per canvas.
- The own krathong's candle point light now stays in the scene (intensity 0) while the own zone is not under the camera. Before, removing
  it changed the scene's point-light count, so three recompiled every lit material at each zone change (a hitch) — and with stretch copies
  the culled copies kept the stale program variants alive (LOW 10 programs > `E2E_MAX_SHADER_PROGRAMS` 8 in the first run of this card).

## 2. Automated proxy (Playwright, Chromium headless + SwiftShader; not a phone)

### 2.1 Before / after, 360 × 640, 3 zones × 80 krathongs, release into zone 3, pinned tier
Script: `measure.mjs` (dev scratch; same walk as the perf-audit spec): idle = at the pier 4 s after the release; travel = every frame of
one navigator jump (before: a zone switch; after: a camera flight of one period, not reduced motion); end = after 12 more jumps (1 s dwell)
at rest. JS heap after GC via CDP.

<!-- automated:start -->
| Metric | HIGH before | HIGH after | LOW before | LOW after |
|---|---|---|---|---|
| Idle: draw calls / triangles | 107 / 122 310 | 107 / 122 380 | 62 / 20 352 | 62 / 20 422 |
| Idle: programs / geometries / textures | 10 / 42 / 3 | 10 / 42 / 3 | 6 / 40 / 1 | 6 / 40 / 1 |
| During one jump: max draw calls / max triangles | 107 / 122 310 | 107 / 229 512 | 62 / 20 352 | 62 / 31 692 |
| During one jump: max rAF gap (ms) | 199.9 | 183.4 | 100.0 | 33.4 |
| After 12 more jumps, at rest: calls / triangles | 46 / 116 582 | 41 / 115 576 | 31 / 16 814 | 31 / 16 884 |
| After 12 more jumps: programs / geometries / textures | 15 / 42 / 3 | 10 / 96 / 3 | 9 / 40 / 1 | 6 / 88 / 1 |
| JS heap after GC, idle → end (MiB) | 12.09 → 13.31 (+1.22) | 14.82 → 17.88 (+3.06) | 10.81 → 11.95 (+1.14) | 12.39 → 14.33 (+1.95) |
<!-- automated:end -->

Reading: at rest the after scene draws only the camera's stretch (the neighbours are culled), so calls and triangles equal the before
numbers. During a jump two stretches are on screen for a few frames (HIGH triangles ≈ 1.9×; calls do not grow: each copy's batch is a
fixed set of meshes). The idle → end growth of geometries and heap is the first visit of each neighbour slot (its batch uploads once);
after that warm-up every counter stays flat (2.2). Before, programs grew 10 → 15 (HIGH) and 6 → 9 (LOW) from the point-light recompiles;
after they stay at 10 / 6.

### 2.2 e2e E4 — 12 jumps after a warm-up (tests/e2e/endless-river.spec.ts, reduced motion, 360 × 640, 3 zones × 80)
| Metric | LOW | HIGH (pinned) |
|---|---|---|
| Geometries / textures / programs, baseline → after 12 jumps | 88 / 1 / 6 → 88 / 1 / 6 | 96 / 3 / 10 → 96 / 3 / 10 |
| Draw calls / triangles, baseline → end (recorded, not asserted) | 62 / 20 422 → 32 / 16 914 | 100 / 121 564 → 77 / 118 872 |
| JS heap growth after GC (asserted ≤ 2 MiB) | +0.24 MiB | +0.23 MiB |
| Max rAF gap during the 12 jumps (hitch metric, recorded) | 33.4 ms | 150 ms |
| Tier at the end | LOW | HIGH |

perf-audit.spec.ts on this branch (fixtures now give every zone a krathong, see §5): HIGH calls 66 for 1 and for 80 krathongs (triangles
14 428 vs 119 972); LOW geometries 88 → 88, textures 1 → 1, programs 6 → 6, calls 46 = 46 = 46, heap +0.55 MiB; soak deltas all 0.

**Hitch budget** (lead interpretation of "tier budget", open question 6 of the spec): a frame ≤ 1000 / `STEP_DOWN_FPS_THRESHOLD[tier]` —
HIGH 22.2 ms, MEDIUM 33.3 ms; LOW 1000 / `FALLBACK_FPS_THRESHOLD` = 50 ms. LOW meets it in CI (33.4 ms). HIGH on SwiftShader
(12–15 FPS, a CPU renderer drawing ≈ 120 k triangles) cannot: its every frame is ≈ 70–200 ms before and after this card, so the CI number
is not a device verdict — measure on a phone (§4). Commands: `node measure.mjs <base-url> <label>` against `pnpm start -p 3107` of the
BASE tree and of this branch; `CI=1 E2E_PORT=3107 PW_CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell pnpm e2e --workers=1 --trace off`.
Date 2026-11-26, cloud container (software WebGL), one run each.

## 3. Resource and dispose audit (code)
| Resource | Created in | Lifetime | Freed by |
|---|---|---|---|
| Stretch slot (environment, foliage, villagers, motes, blob shadows, highlights, proxies, `RiverFlow` batch) | `RiverStretch` | 3 per canvas, keyed by ring index (s mod 3) | unmount (each part's own dispose, as before) |
| Ground strips geometry | `RiverEnvironment` `useRibbonGeometry(layout.ground.strips)` | one per slot | effect cleanup |
| Effect pools and meshes | `ToyNightScene` / `SceneEffects` | one set per canvas (all stretches share the caps) | as before (MFW-60) |
| Streamed zone items | `zonePagination` `syncStream` | zones of S − 2 … S + 2 (≤ 5 × 80 public items) | dropped from the store as soon as the stretch window moves |
| Per seam crossing / navigator jump | — | nothing is created (`index.test.tsx`: no `setAttribute` / `setIndex` on any geometry) | — |
Checked with: `rg -n "new \w*(Geometry|Material|Texture)\b|<\w+(Geometry|Material) " src` — no new hit from this card except
`createRibbonGeometry` for the ground strips (replaces `createGroundGeometry`, removed).

## 4. On-device checklist (owner)
1. Open `<deployment URL>/?perfProbe=1` on the phone (after = this PR's preview).
2. Tap "Loy Krathong" → "ถัดไป" → write a wish → "ถัดไป" → "ปล่อยกระทง". The panel "Perf probe (MFW-34)" appears.
3. Tap ‹ or › 20 times (about one tap per second). Then drag along the river for about 30 s in one direction.
4. Note tier, FPS, draw calls, geometries / programs before and after, and any freeze when a new stretch comes into view.
5. Note any tab reload or crash ("เด้งออก").

| Device / OS / browser | Tier | FPS idle / while travelling | Calls | Δ geometries / programs after 20 taps | Freeze at a seam? | Notes |
|---|---|---|---|---|---|---|

## 5. Test changes for this card
- perf-audit.spec.ts: the stretches next to the camera draw their zones too, so the fixtures give every zone at least one krathong (same
  appearance → the same batch draw calls per visible stretch). HIGH compares zone 2 (80) with zone 4 (1) of 5 so both have one-krathong
  neighbours; `goToZone` waits for the camera flight to land (`settleCamera`) before sampling.
