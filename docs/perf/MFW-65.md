# MFW-65 — Owner-supplied krathong models (GLB pipeline, slice 1: `banana_leaf_01`): perf findings

Backlog 13.1 AC2: "A loader loads the GLB assets lazily after the tier is decided, shares geometry and material across
instances, keeps river krathongs instanced per design and LOD, and disposes on unmount and zone switch; a full 80-item zone
stays within the tier budgets (draw calls, triangles, programs recorded in docs/perf) …". Branch
feat/MFW-65-owner-krathong-models. Pipeline and runtime: docs/design/models.md.

## 1. What changed
- Every krathong (hero and river) draws the owner-supplied model `banana_leaf_01` once its GLB has loaded (after the tier
  is decided); until then, or if the load fails, the procedural model of MFW-69.
- Hero: one 1-instance `InstancedMesh` body + one procedural flame mesh (was ≈ 30 part meshes).
- River: one new instanced bucket per design (19 bucket meshes, was 18); the design's flames use the existing flame bucket.
  A design krathong is 2 instances (body + flame) instead of ≈ 12–30 part instances.
- One new material per canvas: `MeshStandardMaterial({ vertexColors: true })`, matte, no texture, shared by the hero and
  the river.

## 2. The program variant (decision D3, stated openly)
The vertex-colour material adds **one built-in program variant** (no custom shader, no new material type, no texture).
The hero body is a 1-instance `InstancedMesh`, so the hero and the river share that single variant. Measured: **+1 program
on every tier** — LOW 6 → **7** (cap `E2E_MAX_SHADER_PROGRAMS` 8), MEDIUM 6 → 7, HIGH world 10 → 11, HIGH CUSTOMIZE 8 → 9.
The backlog AC allows exactly this (one variant while LOW stays ≤ 8). The alternative — one material per colour region —
would cost about one draw call per colour per bucket instead.

## 3. Automated proxy (Playwright, Chromium headless + SwiftShader; not a phone)
<!-- automated:start -->
"Before" = the same production build with the model files blocked (`page.route("**/models/krathong/**", abort)`), so the
procedural model renders exactly as on BASE 9d8adca (the unused design material and the empty placeholder geometry are never
drawn, so they compile and upload nothing). Scratch script, 360 × 800, `?perfProbe=1&pinTier=1`, a zone of 80 krathongs
(e2e appearance: banana base, style_01, one marigold), counters from the perf probe after the camera settled.

| Metric (calls / triangles / programs) | Before (procedural) | After (`banana_leaf_01`) |
|---|---|---|
| CUSTOMIZE HIGH | 89 / 16 696 / 8 | 33 / 20 856 / 9 |
| CUSTOMIZE MEDIUM | 54 / 11 220 / 4 | 26 / 13 300 / 5 |
| CUSTOMIZE LOW | 52 / 7 946 / 4 | 24 / 10 026 / 5 |
| Zone of 80, HIGH (80 rendered, river LOD medium, shadows) | 50 / 118 636 / 10 | 40 / 187 116 / 11 |
| Zone of 80, MEDIUM (48 rendered, medium) | 43 / 43 404 / 6 | 38 / 63 948 / 7 |
| Zone of 80, LOW (24 rendered, low) | 38 / 18 172 / 6 | 33 / 27 388 / 7 |
| Geometries in the zone, HIGH / MEDIUM / LOW | 80 / 80 / 72 | 71 / 71 / 62 |

Branch e2e (`E2E_PORT=3117 CI=1 pnpm e2e tests/e2e/krathong-models.spec.ts tests/e2e/perf-audit.spec.ts
tests/e2e/endless-river.spec.ts tests/e2e/scene-reactions.spec.ts`, all 16 passed, every counter sampled after
`waitForKrathongModels`):

| Check | After (MFW-65) |
|---|---|
| perf-audit HIGH: CUSTOMIZE calls / triangles / programs | 33 / 20 856 / 9 |
| perf-audit HIGH: zone of 1 vs zone of 80 — calls / triangles | 46 = 46 / 16 140 vs 189 308 |
| perf-audit LOW: calls zone of 1 / zone of 80 / after 20 switches | 36 / 36 / 36 |
| perf-audit LOW: geometries / textures / programs, baseline → after 20 switches | 84 / 1 / 7 → 84 / 1 / 7 |
| perf-audit LOW: JS heap after GC, growth over 20 switches | +0.58 MiB |
| LOW soak (80 krathongs): calls / triangles / geometries / programs | 33 / 27 388 / 73 / 7 |
| LOW soak deltas: geometries / textures / programs / calls | 0 / 0 / 0 / 0 |
| endless-river E4 LOW: geometries / programs, base → after 12 jumps | 90 / 7 → 90 / 7 |
| endless-river E4 HIGH: geometries / programs, base → after 12 jumps | 98 / 11 → 98 / 11 |
| krathong-models KE2 LOW 390 × 844: programs | ≤ 8 (passes) |
<!-- automated:end -->

Date 2026-11-26. Cloud container shared with other lanes; one run each. FPS readings are n/a (pinned tier).

Notes:
- Draw calls go **down** everywhere (CUSTOMIZE HIGH 89 → 33: the hero is 2 meshes instead of ≈ 30, each also drawn in the
  shadow pass; the river buckets in use drop from ≈ 8–12 to 2).
- Triangles go **up**: the close-up model is 5 588 triangles (procedural default 3 508); a river krathong is 1 056 (medium) /
  868 (low).
  - Against the **worst procedural appearance** (MFW-69 §3, colour pass): HIGH 80 × 992 = 79 360 → 80 × 1 056 = 84 480
    (**+6 %**); MEDIUM 47 616 → 50 688; LOW 19 392 → 20 832. MEDIUM / LOW stay within MFW-48's worst river triangles
    (52 224 / 26 112; unit test KA4b).
  - Against the **e2e fixture appearance** (banana, style_01, one marigold: 628 / 484 triangles): the measured HIGH zone in
    the table above is 118 k → 187 k (+58 %, colour + shadow pass). The fixture is a light appearance, so this is the upper
    end of the change, not the typical one.
  - HIGH had **no zone-triangle guard** before this card. It now has one: `HIGH_RIVER_KRATHONG_ZONE_MAX_TRIANGLES` = 168 960
    in `performance.config.ts` (80 × 1 056 × 2 for the shadow pass, set at the measured design value; test KA4c). The river
    LOD is unchanged (HIGH draws medium).
- Zone switches create and free nothing: the design geometry lives per canvas, the CPU data per session.

## 4. Asset bytes

| File | Bytes |
|---|---|
| `public/models/krathong/banana_leaf_01.full.glb` | 239 112 |
| `public/models/krathong/banana_leaf_01.medium.glb` | 54 120 |
| `public/models/krathong/banana_leaf_01.low.glb` | 45 640 |
| Public total (budget 1 572 864) | 338 872 |
| `assets/krathong/decimated/banana_leaf_01.{full,medium,low}.glb` (not served; budget 655 360) | 67 672 + 13 152 + 11 016 = 91 840 |

A HIGH / MEDIUM visitor downloads full + medium (≈ 293 KB), LOW full + low (≈ 285 KB), once per session, after the tier is
decided (not in the first-screen bundle).

## 5. On-device checklist (owner)
1. Open `<deployment URL>/?perfProbe=1` on the phone (after = this PR's preview; before = the MFW-71 preview).
2. In CUSTOMIZE, wait 1–2 s for the krathong to change to the new model; zoom in with "+" — it should read like the
   reference (green base and leaves, pastel flowers, cream candle, flickering flame).
3. Tap "ถัดไป" → write a wish → "ปล่อยกระทง". Note tier, FPS and draw calls in "Perf probe (MFW-34)".
4. Tap "Run zone-switch soak"; do not touch the phone for about 25 s until "Soak done". Screenshot the result. Run it 3 times.
5. Note any visible pop from the old to the new model, any freeze, reload or crash, and battery / heat after 5 minutes.

| Device / OS / browser | Tier | FPS (CUSTOMIZE / WORLD) | Calls | Δ geometries / textures / programs (runs 1–3) | Model pop noticeable? | Freeze / reload / crash | Notes |
|---|---|---|---|---|---|---|---|
| pending owner run | | | | | | | |

## 6. Findings
- Flame look: this card does not change the flame material, emissive glow, flicker or lighting (no diff in
  `krathongAssetKeys.ts`, `FlameFlicker.tsx`, `sceneLook.ts`, `SceneLighting.tsx`, `look.config.ts`, `scene.config.ts`; the
  hero and river design flames use `assets.material("flame")`). Before / after crops show the same pale-yellow core with a
  halo; it reads paler next to the cream design candle (the procedural candle used the appearance colour, e.g. `#FFD166`)
  and is larger (fitted to the model's flame, ≈ 1.6 × wider, 1.4 × taller).
- AC2 budgets: draw calls fall on every tier, programs +1 (one variant, LOW 7 ≤ 8), MEDIUM / LOW zone triangles stay within
  MFW-48's; the soak and zone-switch counters stay flat (deltas 0).
- Risk for the phone check: HIGH river triangles +6 % against the worst procedural appearance (+58 % against the light e2e
  fixture appearance), now capped by `HIGH_RIVER_KRATHONG_ZONE_MAX_TRIANGLES` (KA4c).
  Lever if a HIGH phone struggles: a lighter medium (`--ratio` below 0.052) or HIGH → low in `KRATHONG_RIVER_LOD_BY_TIER`.
