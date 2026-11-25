# MFW-34 — Instanced rendering & memory audit: findings

Backlog 8.2: "No crashes or leaks on real phones." Spec §6.8 Task 8.2. Branch feat/MFW-34-instanced-rendering-audit.

## 1. What changed
- Before: RiverFlow mounted one KrathongModel per river krathong (up to 22 meshes each).
- After: one persistent RiverKrathongBatch — 17 InstancedMesh (one per geometry × material), created once per canvas, shared geometry/material;
  zone switches only re-plan instance slots. Riverside trees were already InstancedMesh (MFW-27).

## 2. Automated proxy (Playwright, Chromium headless + SwiftShader; not a phone)
<!-- automated:start -->
| Metric | Before (per-mesh) | After (batch) |
|---|---|---|
| HIGH: draw calls, zone of 1 krathong | 60 (tier had stepped down to MEDIUM) | 72 |
| HIGH: draw calls, zone of 80 krathongs | 1443 (MEDIUM cap: 48 rendered) | 72 |
| HIGH: triangles, zone of 80 | 39296 (48 rendered) | 64936 (80 rendered) |
| HIGH: tier at the end of the check | MEDIUM (stepped down: per-mesh scene too slow on SwiftShader) | HIGH |
| LOW: draw calls, zone of 1 / zone of 80 (24 rendered, MFW-25 cap) | 33 / 283 (332 later in the same zone: per-mesh frustum culling) | 39 / 39 |
| LOW: geometries / textures / programs — baseline → after 20 switches | 17 / 1 / 3 → 17 / 1 / 3 | 17 / 1 / 4 → 17 / 1 / 4 |
| LOW: JS heap after GC — baseline → after 20 switches (MiB) | 9.8 → 10.3 (+0.44) | 9.2 → 9.7 (+0.56) |
| LOW: tier at the end | LOW | LOW |
| Soak (LOW): delta geometries / textures / programs / calls | 0 / 0 / 0 / +23 | 0 / 0 / 0 / 0 |
<!-- automated:end -->
Commands: before = the probe-only tree (probe, soak and e2e spec present, RiverFlow still per-mesh) with
`PERF_AUDIT_RECORD_ONLY=1 CI=1 E2E_PORT=3134 PW_CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell pnpm exec playwright test tests/e2e/perf-audit.spec.ts`;
after = the PR head with the same command without `PERF_AUDIT_RECORD_ONLY`. Date 2026-11-25, cloud container (software WebGL), one run each.
Notes: the "after" LOW tests run with animation frames paced at about 30 FPS (test-only, so they do not starve other specs' HIGH tests on a shared
4-core runner); the "before" run was unpaced. Counters do not depend on the frame rate. The per-mesh "before" HIGH check ran at MEDIUM because the FPS step-down fired (a valid before finding); its draw calls are therefore
for 48 rendered krathongs without the shadow pass, so the real HIGH per-mesh cost is higher. The "after" draw calls (72) are
17 batch meshes × 2 passes (shadow + colour) plus the environment, and are equal for 1 and 80 krathongs.

Post-rebase re-run (main with MFW-23 / MFW-30; the release now frames the camera on the pier, so far environment props are culled and only the
17 always-drawn batch meshes plus a few props remain): HIGH check ran at MEDIUM (step-down fired) with 17 calls for 1 and for 80 krathongs
(1440 vs 19300 triangles); LOW: 17 / 17 / 17 calls, geometries 18 → 18, textures 1 → 1, programs 8 → 8, JS heap +0.4 MiB after GC; soak deltas all 0.
The table above is the pre-rebase measurement.

## 3. Resource and dispose audit (code)
| Resource | Created in | Lifetime | Freed by |
|---|---|---|---|
| Krathong part geometries + materials | `krathongAssets.ts` `createKrathongAssets` | one per canvas | `KrathongAssetsProvider` unmount |
| River batch InstancedMesh ×17 (instance buffers) | `riverKrathongBatch.ts` `createKrathongBatchMeshes` | one set per canvas | `RiverKrathongBatch` unmount → `disposeKrathongBatch` |
| Environment part geometry + material | `InstancedPart` | one per part per canvas | `InstancedPart` effect cleanup |
| Water / bank ribbon geometries | `RiverEnvironment` `useRibbonGeometry` | one per canvas | effect cleanup |
| Water / bank / pier materials, pier box geometry | JSX in `RiverEnvironment` | one per canvas | R3F auto-dispose on unmount |
| Highlight ring geometry + material | JSX in `TargetHighlight` | per selection | R3F auto-dispose on unmount |
| River tap hit proxy geometry + material (MFW-28) | `riverTapProxy.ts` `createRiverTapProxy` | one per `RiverFlow` mount while tappable | `RiverFlow` effect cleanup |
| Renderer, WebGL context, shadow map | R3F `<Canvas>` | per canvas-mode visit | R3F root unmount (`dispose` + `forceContextLoss`) |
| Per zone switch | — | nothing is created | — |
Checked with: `rg -n "new \w*(Geometry|Material|Texture)\b|<\w+(Geometry|Material) " src` (no new hit from this card; the tap proxy row above is MFW-28's).

## 4. On-device checklist (owner)
1. Open `<deployment URL>/?perfProbe=1` on the phone (after = this PR's preview; before = a preview of the probe-only commit, if one exists).
2. Tap "Loy Krathong" → "ถัดไป" → "ถัดไป" → "ปล่อยกระทง". The panel "Perf probe (MFW-34)" appears under the scene.
3. Note tier, FPS and draw calls. Tap "Run zone-switch soak". Do not touch the phone for about 25 s until "Soak done".
4. Screenshot the result table. Run the soak 3 times in a row without reloading.
5. Note any freeze, tab reload or crash ("เด้งออก").
6. Optional heap: Android — chrome://inspect → the tab → Memory; iOS — Safari Web Inspector → Timelines → Memory (needs a Mac).

| Device / OS / browser | Tier | FPS | Calls | Δ geometries / textures / programs (runs 1–3) | JS heap before → after (MiB) | Freeze / reload / crash | Notes |
|---|---|---|---|---|---|---|---|
| pending owner run | | | | | | | |

## 5. Findings and follow-ups
- Draw calls no longer depend on the number of krathongs: 72 for 1 and for 80 on HIGH (before: 60 for 1, 1443 for 48 on MEDIUM).
- A zone switch creates and frees no GPU resource: geometries, textures and programs are equal after 20 switches, on the zone-navigation
  path and on the synthetic soak. The JS heap after a forced GC grew by about 0.5 MiB over 20 switches (limit 2 MiB), the same as before.
- Programs went from 3 to 4 (instanced material variants); this is constant, not growing.
- The per-mesh scene stepped HIGH down to MEDIUM on SwiftShader. The batch kept HIGH in most runs, but the FPS step-down fired in
  1 of 3 full e2e runs under parallel load; the HIGH check is therefore tier-agnostic (it compares the 1- and 80-krathong samples at the
  tier both share, and retakes the pair if the tier changed).
- Small zones pay a small constant overhead: LOW draw calls went from 33 (1 krathong, per-mesh) to 39 (batch), because all
  bucket meshes that hold instances are drawn regardless of the count.
- Draw calls are bounded, not constant, in the appearance mix: the e2e fixture uses one appearance. Varied appearances touch up to
  17 buckets (QA measured 74 vs 88 calls for 1 vs 80 varied krathongs on HIGH), never more.
- The "before" numbers come from an uncommitted probe-only tree (per-mesh RiverFlow plus the probe, soak and e2e spec); they cannot be
  reproduced from a commit of this branch. Re-measure by temporarily restoring the per-mesh RiverFlow if needed.
- Open: real-phone numbers (the table above), and the MEDIUM/LOW river caps (MFW-25 open question 7) can be revisited from them.
