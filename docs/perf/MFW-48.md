# MFW-48 — Krathong model v2: perf findings

Backlog 9.2 AC4: "Repeated parts stay instanced and a full 80-item zone stays within the tier budgets; draw calls and FPS
are recorded in the PR the same way as docs/perf/MFW-34.md." Branch feat/MFW-48-krathong-model-v2 (stacked on MFW-47).

## 1. What changed
- The krathong parts are parametric clay meshes (`src/config/krathongModel.config.ts` → `src/core/customization/krathongMeshData.ts`):
  - rounded lathe bases;
  - two-layer folded banana leaves;
  - petal-disc flowers with a round yellow centre;
  - a tall candle and a teardrop flame.
  All parts are indexed closed solids with smooth normals, drawn FrontSide with the same `MeshStandardMaterial` as v1 (no new program).
- The flower centre is a new part, with its own material and river bucket. The river batch now has 18 InstancedMesh (v1 17).
- The flame flickers gently: one shared frame per canvas, written by `<FlameFlicker>`. In an otherwise idle demand canvas
  (CUSTOMIZE, pier) the loop is kept alive by a per-tier redraw interval (`FLAME_FLICKER_REDRAW_INTERVAL_MS`). There is no
  interval under reduced motion or on FALLBACK_2D.

## 2. Automated proxy (Playwright, Chromium headless + SwiftShader; not a phone)
<!-- automated:start -->
| Metric | Before (BASE 9c98d1c, MFW-47) | After (MFW-48) |
|---|---|---|
| CUSTOMIZE (HIGH): draw calls / triangles / programs | 62 / 7 488 / 6 | 78 / 6 816 / 8 |
| CUSTOMIZE: probe FPS | n/a (the device store has no FPS sample in CUSTOMIZE) | n/a |
| WORLD "HIGH" check: tier both samples shared | MEDIUM (FPS step-down fired under load) | MEDIUM (FPS step-down fired under load) |
| WORLD zone of 1 krathong: draw calls / triangles / probe FPS | 19 / 3 416 / 21 | 20 / 3 584 / 15 |
| WORLD zone of 80 krathongs (48 rendered at MEDIUM): draw calls / triangles / probe FPS | 19 / 22 968 / 9 | 20 / 31 032 / 9 |
| LOW: draw calls, zone of 1 / zone of 80 / after 20 switches | 19 / 19 / 19 | 20 / 20 / 20 |
| LOW: geometries / textures / programs — baseline → after 20 switches | 21 / 1 / 8 → 21 / 1 / 8 | 22 / 1 / 8 → 22 / 1 / 8 |
| LOW: JS heap after GC — baseline → after 20 switches (MiB) | 10.48 → 10.91 (+0.43) | 10.63 → 11.07 (+0.43) |
| Soak (LOW, 80 krathongs): calls / triangles / geometries / programs | 30 / 25 714 / 26 / 8 | 31 / 26 902 / 27 / 8 |
| Soak: delta geometries / textures / programs / calls | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| Idle CUSTOMIZE (HIGH, 390×844): frames rendered per second | 0 | 10 (flicker redraw at 100 ms) |
| Idle CUSTOMIZE (HIGH): main-thread busy, ms per second | 10–15 | 378–559 (reduced motion: 10–11) |
| Idle CUSTOMIZE (HIGH) with the lead's 66 ms draft interval: frames/s, busy ms/s | — | 13–15, 585–787 |
| Idle CUSTOMIZE (HIGH): rAF rate, the FPS-meter input (per-second samples over 12 s) | 49–61 (one 7 at start-up) | 35–58, mostly 46–53 (reduced motion: 57–60) |
| Tier after 12 s idle in CUSTOMIZE | HIGH | HIGH |
<!-- automated:end -->
Commands. The BASE copy was made with `git archive 9c98d1c`, with this branch's `tests/e2e/perf-audit.spec.ts` and
`tests/e2e/fixtures/perfAudit.ts` copied in. Each server is a production build on port 3103, started by hand; `CI` was unset so
Playwright reused it.
- Before: `PERF_AUDIT_RECORD_ONLY=1 E2E_PORT=3103 PW_CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell playwright test tests/e2e/perf-audit.spec.ts`.
- After: the same command in the branch, without `PERF_AUDIT_RECORD_ONLY`.

Idle-CUSTOMIZE rows come from a scratch bench (not committed). It counts `WebGLRenderer.render` calls over 6 s, and reads
`TaskDuration` from CDP `Performance.getMetrics`. It ran 2–3 times per variant, interleaved; the reduced-motion control uses
`emulateMedia({ reducedMotion: "reduce" })`.

Date 2026-11-25. Cloud container shared with three other lanes (load average 8–10), one run each for the perf-audit rows.

Notes:
- After the rebase onto main (MFW-54 / MFW-47 CI fix), the perf-audit HIGH test opens `?pinTier=1`. The FPS watcher is then
  off, so the spec's `fpsCustomize` / `fpsOne` / `fpsFull` read n/a (null) and are reported only, never asserted. The flicker's
  FPS cost is recorded from the unpinned scratch bench in the idle-CUSTOMIZE rows above.
- The WORLD check ran at MEDIUM before and after: the FPS step-down fired under parallel load. The check is tier-agnostic
  (MFW-34), and draw calls did not grow with the number of krathongs, before or after.
- The 80-item triangles grew by about 35 % (MEDIUM, 48 rendered). The e2e fixture has one marigold: 380 → 548 triangles per
  krathong. Varied appearances get cheaper (default 1 360 → 1 024).
- CUSTOMIZE: +16 calls = 8 flower centres × 2 passes (colour + shadow). The programs sample at the start of CUSTOMIZE is
  6 → 8. More frames are drawn, so programs are compiled earlier. The steady-state LOW count is 8 → 8 (`E2E_MAX_SHADER_PROGRAMS`
  = 8, measured at BASE in this run).

## 3. Static budget (unit tests)
| Per krathong | v1 (BASE) | v2 | Test |
|---|---|---|---|
| Default appearance (banana, style_01, 8 marigolds) | 1 360 tris | 1 024 tris | `krathongAssets.test.ts` (≤ 1 360) |
| Worst appearance (any base × fold × 8 × one kind) | 2 160 tris | 1 088 tris | `krathongAssets.test.ts` (≤ `KRATHONG_MAX_TRIANGLES` 1 200) |
| e2e fixture `E2E_APPEARANCE` (banana, style_01, 1 marigold) | 380 tris | 548 tris | `krathongAssets.test.ts` (≤ 560) |
| Hero meshes (`KrathongModel`), all sockets filled | 22 | 30 (+8 flower centres) | `KrathongModel.test.tsx` |
| River batch buckets (InstancedMesh) | 17 | 18 (+1 `flowerCentre`) | `krathongInstanceBuckets.test.ts` |
| Footprint radius (worst) | — | 1.288 (≤ `KRATHONG_MODEL_FOOTPRINT_RADIUS` 1.3) | `krathongMeshData.test.ts` |
| Shader-program variants | — | none new: `MeshStandardMaterial`, FrontSide, smooth, no vertex colours, opaque | `krathongAssets.test.ts`, e2e LOW programs ≤ 8 |
| Textures | 0 | 0 | — |

Per tier (`riverItemCap` from `TIER_BUDGETS`, unchanged): HIGH 80 / MEDIUM 48 / LOW 24 river krathongs.
- Worst-appearance colour-pass triangles: at most 87 040 / 52 224 / 26 112.
- River batch draw calls: at most 18 per pass on every tier.
- Flicker redraw cadence: `FLAME_FLICKER_REDRAW_INTERVAL_MS` = 100 / 125 / 150 ms (HIGH / MEDIUM / LOW).

## 4. On-device checklist (owner)
1. Open `<deployment URL>/?perfProbe=1` on the phone (after = this PR's preview; before = the MFW-47 preview).
2. In CUSTOMIZE, watch the candle flame flicker. Check that it is gentle: slow, small, no flashing. Then turn on the OS
   "reduce motion" setting and reload: the flame must stand still.
3. Tap "ถัดไป" → write a wish → "ปล่อยกระทง". The panel "Perf probe (MFW-34)" appears under the scene.
4. Note tier, FPS and draw calls. Tap "Run zone-switch soak". Do not touch the phone for about 25 s until "Soak done".
5. Screenshot the result table. Run the soak 3 times in a row without reloading.
6. Note any freeze, tab reload or crash ("เด้งออก"). Also note battery and heat after 5 minutes idle in CUSTOMIZE, where the
   flicker keeps the canvas redrawing.
7. Optional heap: Android — chrome://inspect → the tab → Memory; iOS — Safari Web Inspector → Timelines → Memory (needs a Mac).

| Device / OS / browser | Tier | FPS (CUSTOMIZE / WORLD) | Calls | Δ geometries / textures / programs (runs 1–3) | JS heap before → after (MiB) | Flicker gentle? static with reduce motion? | Freeze / reload / crash | Notes |
|---|---|---|---|---|---|---|---|---|
| pending owner run | | | | | | | | |

## 5. Findings
- Draw calls still do not grow with the number of krathongs: 20 for 1 and for 48 rendered (MEDIUM). That is +1 per pass for
  the flower-centre bucket.
- A zone switch still creates and frees no GPU resource. Geometries, textures and programs are flat after 20 switches, and the
  soak deltas are 0. Heap growth is unchanged (+0.43 MiB, limit 2 MiB).
- No new shader program (LOW 8 → 8). The krathong materials are unchanged; only geometry changed.
- Main cost (CI risk): the flame flicker turns an idle CUSTOMIZE / pier canvas (0 frames/s before) into a 10 frames/s redraw
  (HIGH, 100 ms). On SwiftShader each of those frames redraws the whole scene with its shadow pass, which cost about
  0.4–0.56 s of main-thread time per second in this container.
  - Spec lever (a) is applied: 66 / 83 / 100 → 100 / 125 / 150 ms. With the lead's 66 ms draft it was 13–15 frames/s and
    0.59–0.79 s/s.
  - WORLD_EXPLORE already redraws every frame while krathongs drift, so the interval adds no frames there. The flicker only
    scales the shared flame.
- The FPS meter samples `requestAnimationFrame`, so every flicker redraw that blocks the main thread lowers the measured FPS of an
  otherwise idle CUSTOMIZE / pier canvas. Measured: 46–53 against 60 (BASE), close to the HIGH step-down threshold of 45. On a
  busier SwiftShader runner a flicker frame takes longer, and the measured FPS can sustain below 45 (step-down to MEDIUM) or 20
  (FALLBACK_2D). Real phone GPUs render the frame in a few ms, so this is a CI-runner risk; the on-device check is in §4.
  - Full-suite A/B in this container, same method (own server, `CI` unset, no retries, load 10–12):
    - BASE: 7 failed / 68 passed. WT: 8 failed / 67 passed.
    - The same 3D specs failed in both: each run ended in FALLBACK_2D under load, plus the known MFW-47 scene-taps
      mouse-HIGH `locateStableTarget` failure.
    - The extra WT failure (`fallback-2d` krathong tap) passed twice alone.
  - If the `ci` check turns red on the 3D specs, the next lever is a longer `FLAME_FLICKER_REDRAW_INTERVAL_MS`. It is a
    lead / owner decision because it makes the flicker steppier.
- Levers (b) inner blades 3 → 2 segments (−64 tris), (c) base lathe 16 → 12 (−32) and (d) no second marigold disc (−24 per
  flower) are not applied. They cut triangles, not frames. Under this container's load the WORLD render-time noise
  (12–25 ms per frame) is larger than their effect, and each one visibly flattens the model. They stay available if the
  `ci` check is red on the river specs.
- The flame mesh casts a shadow on HIGH (as in v1), so the flicker wobbles its tiny shadow. This is accepted.
- Open: real-phone numbers (table above); whether the idle-CUSTOMIZE redraw matters for battery on low-end phones.
