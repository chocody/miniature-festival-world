# MFW-69 — Krathong v3 detail (leaf / petal shells, per-tier LOD): perf findings

Backlog 13.5 AC4: "Detail is tiered: full detail for the own krathong (customizer / pier) and on HIGH; lighter variants for
river krathongs on MEDIUM and LOW so a full 80-item zone stays inside the tier budgets (triangles, draw calls and programs
recorded like docs/perf/MFW-34.md; no new shader program)." Branch feat/MFW-69-detailed-krathong-leaves-flowers.

## 1. What changed
- Leaves and petals are curved, tapered, cupped **shells** (thin closed lenses with a midrib crease), built by
  `buildLeafShellMeshData` / `buildPetalRingMeshData` in `src/core/customization/krathongMeshData.ts`. Leaves come in two
  overlapping layers; full flowers are rings of shell petals around a raised centre; the base has a rounded lip, the candle a
  rounded lip and two wax drips, and the flame is a larger soft teardrop.
- Every part has three levels of detail (`full` / `medium` / `low`, `KrathongMeshLodSpecs` in `src/config/krathongModel.config.ts`).
  - Own krathong (`KrathongModel`: customizer and pier): always `full` (`KRATHONG_HERO_LOD`).
  - River batch: `KRATHONG_RIVER_LOD_BY_TIER` = HIGH **medium (PLACEHOLDER, lead decision)** / MEDIUM medium / LOW low.
    The AC asks for full on HIGH; the lead shipped HIGH at medium until the owner's phone check (§4, §5). The lever is one
    line: `KRATHONG_RIVER_LOD_BY_TIER.HIGH = "full"`.
- Geometry stays shared per canvas: one `BufferGeometry` per distinct (key, LOD) spec, built eagerly by `createKrathongAssets`
  (identical specs, e.g. incense full = medium and the lotus base medium = low, share one geometry). A tier change only
  re-points `InstancedMesh.geometry` of the 18 persistent bucket meshes (`applyKrathongBatchLod`, layout effect); nothing is
  created or disposed and nothing runs per frame.
- No new material, texture, bucket, draw call or shader program (`MeshStandardMaterial`, FrontSide, smooth, opaque).
- MFW-48 follow-up folded in: the flame-flicker redraw interval pauses while `document.hidden`.

## 2. Automated proxy (Playwright, Chromium headless + SwiftShader; not a phone)
<!-- automated:start -->
| Metric | Before (BASE ce0f2e4) | After (MFW-69) |
|---|---|---|
| CUSTOMIZE (HIGH): draw calls / triangles / programs | 78 / 6 816 / 8 | 78 / 11 784 / 8 |
| WORLD "HIGH" check: tier both samples shared | HIGH | HIGH |
| WORLD zone of 1 krathong: draw calls / triangles | 32 / 5 864 | 32 / 6 024 |
| WORLD zone of 80 krathongs (HIGH, 80 rendered, river LOD medium): draw calls / triangles | 32 / 96 240 | 32 / 109 040 |
| LOW: draw calls, zone of 1 / zone of 80 / after 20 switches | 20 / 20 / 20 | 20 / 20 / 20 |
| LOW: geometries / textures / programs — baseline → after 20 switches | 22 / 1 / 8 → 22 / 1 / 8 | 29 / 1 / 8 → 29 / 1 / 8 |
| LOW: JS heap after GC — baseline → after 20 switches (MiB) | 10.64 → 11.07 (+0.43) | 10.72 → 11.14 (+0.42) |
| Soak (LOW, 80 krathongs): calls / triangles / geometries / programs | 31 / 27 410 / 27 / 8 | 31 / 21 586 / 34 / 8 |
| Soak: delta geometries / textures / programs / calls | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
<!-- automated:end -->
Commands. The BASE copy was made with `git archive ce0f2e4` (its `tests/e2e/perf-audit.spec.ts` is identical to this
branch's). Each server is a production build on port 3103, started by hand; `CI` was unset so Playwright reused it.
- Before: `PERF_AUDIT_RECORD_ONLY=1 E2E_PORT=3103 PW_CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell playwright test tests/e2e/perf-audit.spec.ts --workers=1`.
- After: the same command in the branch, without `PERF_AUDIT_RECORD_ONLY`.

Date 2026-11-25. Cloud container shared with other lanes (load average 6–8), one run each. All FPS readings are n/a: the
HIGH test opens `?pinTier=1`, which turns the FPS watcher off.

Notes:
- CUSTOMIZE triangles: +4 968 (colour + shadow pass of the own krathong at full detail: default appearance 1 024 → 3 508).
- WORLD 80 items on HIGH: +13 % triangles (the river draws the medium LOD; the e2e fixture is 548 → 628 per krathong).
- LOW geometries 22 → 29: the own krathong (full) and the river (low) now use different geometries, so both sets are uploaded.
  The count is flat across 20 zone switches.
- The LOW soak (varied appearances) got lighter: 27 410 → 21 586 triangles.

## 3. Static budget (unit tests)
Triangles / vertices per part (the tests compute the real numbers from the config):

| Part | full | medium | low |
|---|---|---|---|
| base banana_trunk_01 (lathe 16 × 8 pts / 12 × 6 / 8 × 6) | 192 / 98 | 96 / 50 | 64 / 34 |
| base lotus_petal_01 (bowl + 2 petal rings / bowl + petal disc) | 392 / 230 | 80 / 44 | 80 / 44 (same geometry as medium) |
| base toy_bread_01 | 240 / 122 | 96 / 50 | 64 / 34 |
| leaf unit style_01 / style_02 (outer R4 + inner R5, K5 / outer R2 + inner R3, K3 / R2 + R2, K3) | 144 / 76 | 40 / 24 | 32 / 20 |
| flower marigold (7 + 5 shell petals / 7-lobe disc / 6-lobe disc) | 192 / 120 | 42 / 23 | 36 / 20 |
| flower orchid (3 sepals + 2 petals + lip / 5-lobe discs) | 112 / 68 | 40 / 22 | 30 / 17 |
| flower lotus (6 + 4 shell petals / 6-lobe discs) | 160 / 100 | 36 / 20 | 24 / 14 |
| flower centre (raised dome) | 32 / 18 | 10 / 7 | 8 / 6 |
| candle (body + 2 drips / lathe / lathe) | 204 / 108 | 64 / 34 | 48 / 26 |
| flame (teardrop h .34) | 120 / 62 | 48 / 26 | 36 / 20 |
| incense | 16 / 10 | 16 / 10 (same geometry as full) | 12 / 8 |

| Per krathong | v2 (BASE) | v3 full | v3 medium | v3 low | Test |
|---|---|---|---|---|---|
| Default (banana, style_01, 8 marigolds) | 1 024 | 3 508 | 992 | 792 | `krathongAssets.test.ts` (medium ≤ v1 1 360) |
| Worst (any base × fold × 8 × one kind) | 1 088 | 3 708 | 992 | 808 | ≤ `KRATHONG_MAX_TRIANGLES_BY_LOD` 3 800 / 1 088 / 900 |
| e2e fixture `E2E_APPEARANCE` (banana, style_01, 1 marigold) | 548 | 1 940 | 628 | 484 | ≤ 1 950 / 650 / 520 (test-local) |
| Footprint radius (worst) | 1.288 | 1.218 | 1.223 | 1.223 | ≤ `KRATHONG_MODEL_FOOTPRINT_RADIUS` 1.3 |

Per tier (`riverItemCap` from `TIER_BUDGETS`, unchanged: HIGH 80 / MEDIUM 48 / LOW 24), worst-appearance colour-pass river
triangles:
- MFW-48: 87 040 / 52 224 / 26 112.
- MFW-69 as shipped (HIGH medium): 79 360 / 47 616 / 19 392. MEDIUM and LOW are tested ≤ MFW-48.
- MFW-69 with the lever HIGH = full: 296 640 on HIGH (plus the shadow pass, the HIGH river casts shadows).
- River batch draw calls: at most 18 per pass on every tier (unchanged). Hero model: ≤ 30 meshes (unchanged).
- Shader-program variants: none new (`krathongAssets.test.ts`; e2e LOW programs 8 → 8, `E2E_MAX_SHADER_PROGRAMS` = 8).
- Textures: 0.

## 4. On-device checklist (owner)
1. Open `<deployment URL>/?perfProbe=1` on the phone (after = this PR's preview; before = the MFW-57 preview).
2. In CUSTOMIZE, zoom in with "+" and check the own krathong: leaves read as curved banana leaves, flowers as blooms.
3. Tap "ถัดไป" → write a wish → "ปล่อยกระทง". The panel "Perf probe (MFW-34)" appears under the scene.
4. Note tier, FPS and draw calls. Tap "Run zone-switch soak". Do not touch the phone for about 25 s until "Soak done".
5. Screenshot the result table. Run the soak 3 times in a row without reloading.
6. Optional, HIGH phones only: ask the dev to build a preview with `KRATHONG_RIVER_LOD_BY_TIER.HIGH = "full"` and repeat
   steps 3–5 on a zone of 80. Decide whether HIGH keeps "medium" (shipped) or gets "full" (AC as written).
7. Note any freeze, tab reload or crash ("เด้งออก"); battery and heat after 5 minutes in the world.

| Device / OS / browser | Tier | FPS (CUSTOMIZE / WORLD) | Calls | Δ geometries / textures / programs (runs 1–3) | JS heap before → after (MiB) | HIGH full vs medium FPS | Freeze / reload / crash | Notes |
|---|---|---|---|---|---|---|---|---|
| pending owner run | | | | | | | | |

## 5. Findings
- Draw calls do not grow with the number of krathongs (32 for 1 and for 80 on HIGH), and no shader program was added
  (8 → 8). Zone switches still create and free no GPU resource; the soak deltas are 0 and heap growth is unchanged.
- The own krathong is now about 3.4× heavier (default 1 024 → 3 508 triangles), drawn once in CUSTOMIZE / at the pier.
- The river cost on HIGH is +13 % for the e2e fixture zone; MEDIUM and LOW zones are never heavier than MFW-48 (unit test).
- HIGH at "full" would put a worst-case 80-item zone at ≈ 297 k triangles plus shadows (MFW-48: 87 k). On a CPU-rendered
  CI runner (SwiftShader, 12–15 FPS) that is the main e2e risk, which is why the lead shipped HIGH at "medium" (PLACEHOLDER).
  The owner decides from the phone check (§4 step 6).
- The flame-flicker interval now pauses while the tab is hidden. The "only when a flame is visible" gate is still open
  (docs/follow-ups.md).
