# MFW-34 [8.2] Instanced rendering & memory cleanup audit — implementation spec

> Hand-off spec for one card. It is the source of truth for the implementer and the reviewer. If this file and
> `docs/backlog.json` / `docs/spec/open-questions.md` disagree, those files win, and the PR must say so.
> Branch: `feat/MFW-34-instanced-rendering-memory-cleanup-audit` · Jira: MFW-34 · Epic: MFW-32 (Loop 8)
> Labels: `perf`. Extra reviewer: **r3f-perf-reviewer** (the diff touches `src/components/canvas3d/**` and `src/components/models/**`).
> The card touches no `src/services/**`, `src/app/api/**` or `supabase/**`, so there is no privacy-auditor and it is **not** an owner-merge card.

## Summary (Goal)

Backlog 8.2: "No crashes or leaks on real phones." Spec §6.8 Task 8.2: "ใช้ InstancedMesh สำหรับชิ้นส่วนดอกไม้ ใบตอง และต้นไม้ริมฝั่งที่ใช้ซ้ำกัน" and
"ทดสอบการสลับโซนคุ้งน้ำบนมือถือจริงเพื่อให้มั่นใจว่ามีการคืนหน่วยความจำ (Dispose Geometry/Material) ไม่ให้เว็บค้างหรือเด้งออก".

Today `RiverFlow` (MFW-24) mounts a full `KrathongModel` for every river krathong. That is up to 22 meshes per krathong (base, 8 leaves, up to 8
flowers, candle, flame, 3 incense), so an 80-item zone costs about 1,600–1,800 draw calls, plus a shadow pass on HIGH. That is the open MFW-24 perf
gate (`docs/follow-ups.md`). This card renders all river krathongs through one **persistent batch**. The batch has one `InstancedMesh` per
(geometry, material) pair of the krathong catalogue (17 meshes). Each mesh is created once per canvas with a fixed capacity, reuses the shared
`KrathongAssets` geometry and material, and gets its instance matrices from the item transforms every frame. Draw calls then stay at ≤ 17 per pass for
any number of krathongs, and a zone switch allocates no GPU resource at all. Riverside trees are already instanced (MFW-27); this card proves it with a test.

AC2 and AC3 need numbers from a real phone, and the container cannot measure device memory. The card therefore ships three things:
- a hidden **perf probe** (`?perfProbe=1`): a panel with renderer counters and a one-tap synthetic zone-switch **soak**, so the owner can run the
  audit on any phone;
- an automated proxy in Playwright (SwiftShader): renderer counters and the JS heap after a forced GC stay flat across 20 zone switches, and draw calls
  do not grow with the number of krathongs;
- a findings document, `docs/perf/MFW-34.md`, with the before/after numbers and an on-device checklist for the owner.

## Prerequisites

The backlog blocks this card on 4.1 (MFW-19), 5.3 (MFW-25) and 6.1 (MFW-27). **Cut the branch only after MFW-25 is merged.** Check with
`git fetch origin main && git ls-tree --name-only origin/main src/core/world/riverVisibility.ts src/components/ui/ZoneNavigator.tsx`. If either
file is missing, stop and report "MFW-25 not merged".

State checked on 2026-11-24 (`main` = a6ce8f3):

| Card | State | What this card uses (real names on `main`) |
|---|---|---|
| MFW-19 [4.1] | merged | `assembleKrathong(appearance): KrathongAssembly` (`body[]`, `centerAnchor.{localPosition, parts[]}`), `KrathongPartInstance` (`role`, `geometryKey`, `materialKey`, `localPosition`, `rotationY`, `scale`), `KRATHONG_GEOMETRY_KEYS`, `KRATHONG_MATERIAL_KEYS`, `DEFAULT_KRATHONG_APPEARANCE`, `parseKrathongAppearance` (all `@/core/customization`); `computeUprightLocalQuaternion`, `UPRIGHT_TWIST_EPSILON` (`@/core/customization/uprightConstraint`, by path only); `KrathongAssetsProvider`, `useKrathongAssets()` → `KrathongAssets.geometry(key)` / `.material(key)` (same object per key, disposed by the provider on unmount); `KrathongModel` (per-mesh, kept for the hero krathong); config `KRATHONG_LEAF_COUNT = 8`, `KRATHONG_INCENSE_MODEL.count = 3` (`@/config/krathongModel.config`), `KRATHONG_BASE_IDS`, `LEAF_FOLD_STYLE_IDS`, `LEAF_COLOR_PALETTE`, `FLOWER_KINDS`, `CANDLE_COLOR_PALETTE`, `RIM_SOCKET_COUNT = 8` (`@/config/events/loyKrathong.config`) |
| MFW-24 [5.2] | merged (a6ce8f3) | `RiverFlow`, `RiverFlowItem` (`src/components/canvas3d/RiverFlow.tsx`); `prepareRiverItems`, `applyRiverItemTransform`, `createRiverFrameScratch`, `getLoyKrathongRiverLanes` (`@/core/world`); `RIVER_KRATHONG_SCALE`, `RIVER_DRIFT_SPEED_FACTOR` (`@/config/riverFlow.config`); `LOY_KRATHONG_RIVER_LANE_ID = 1` (`@/config/events/loyKrathong.river.config`); `LATERAL_OFFSET_RANGE` (`@/core/coordinates`) |
| MFW-27 [6.1] | merged | `InstancedPart` (trees, houses, lamps, piles), `SCENE_OBJECT_NAMES` (`treeTrunks`, `treeCanopies`, …), the static scan `tests/unit/scene-art-constants.test.ts` (no hex colour, decimal literal or texture loader in non-test files under `src/components/canvas3d/**` and `src/components/models/**`) |
| MFW-12 [2.2] | merged | `ZONE_ITEM_CAP = 80` (`@/config/world.config`) |
| MFW-9 [1.3] | merged | `useDeviceStore` (`qualityTier`, `fps`, `reducedMotion`, `profiled`), `TIER_BUDGETS`, `QualityTier` |
| **MFW-25 [5.3]** | **NOT merged** (plan `docs/plans/MFW-25.md`, revised in commit 055c50b) | **ASSUMED INTERFACE (from MFW-25 plan)**, list below |
| MFW-28 [6.2] | not merged, may land first | See "If MFW-28 merged first" in Step 7 |

**ASSUMED INTERFACE (from MFW-25 plan).** Check each item against `main` before you start. If a name differs, adapt to `main` and list the
difference in the PR.
- `RiverFlow` (MFW-25 Step 9) reads `qualityTier` from `useDeviceStore`. It computes
  `visibleCap = min(ZONE_ITEM_CAP, TIER_BUDGETS[tier].riverItemCap)` (0 on FALLBACK_2D) and
  `castShadow = shadows && budget.riverItemCastShadow`. It derives `prepared = useMemo(prepareRiverItems(items, lanes))` and
  `visible = useMemo(selectVisibleRiverItems(prepared, visibleCap, pinnedIds))`, and it uses `visible` everywhere (effect, frame loop, empty check, `.map`).
  It has the prop `pinnedIds?: readonly string[]` (default `NO_PINNED_RIVER_IDS`) and `data-visible-cap={visibleCap}` on `<group name="river-flow">`.
  Each item is still `<group name={"river-item-" + id} scale={RIVER_KRATHONG_SCALE} ref=…>` with a `<KrathongModel shadows={castShadow} />` inside.
- `TIER_BUDGETS[tier].riverItemCap` = HIGH 80 / MEDIUM 48 / LOW 24 and `riverItemCastShadow` = HIGH true / MEDIUM false / LOW false
  (MFW-25 PLACEHOLDER values, MFW-25 Open question 7). **This card does not change them** (Open question 3).
- `SceneViewport` (MFW-25 Step 18) has `const visibleRiverItems = riverItems ?? storeRiverItems;`. It passes `pinnedRiverIds` through
  `ToyNightScene` to `RiverFlow`, and it puts `data-zone-id` and `data-river-item-count={visibleRiverItems.length}` on the `<section>`.
- `ZoneNavigator`: `<nav data-testid="zone-navigator" data-zone-id data-zone-count data-zone-status data-zone-item-count>` with the buttons
  "‹ คุ้งน้ำก่อนหน้า" (upstream, zone − 1) and "คุ้งน้ำถัดไป ›" (downstream, zone + 1), each shown only when the neighbour exists. `FlowRoot` renders it at
  `SHARED_WORLD_EXPLORE`. The first visible zone is the newest (`WORLD_INITIAL_ZONE_POLICY = "NEWEST"`). A switch empties `zoneItems` first, then loads the
  new zone.
- `tests/e2e/fixtures/zoneFixtures.ts`: `makeZoneBody(zoneId, count)` → `{ eventId: "loy_krathong", zoneId, limit: 80, items }`. Every item uses the one
  `E2E_APPEARANCE` (`flowers: ["marigold"]`). The routes are `GET /api/zones?event=…` → `{ eventId, zoneCount }` and
  `GET /api/creations?event=…&zone=…` → that body.
- The MFW-25 tests in `RiverFlow.test.tsx` and `index.test.tsx` (river budget, zone switch, assets created once) exist. This card rewrites only their
  selectors that look inside the per-item `KrathongModel` (Step 13).

## Acceptance criteria → checks

AC text is verbatim from `docs/backlog.json`, story 8.2.

1. **"InstancedMesh for repeated flowers, leaves and riverside trees"**
   - The batch buckets cover every part that the assembler can produce. There is one bucket per (geometryKey, materialKey) pair: 3 bases + 2 fold
     styles × 3 leaf colours + 3 flower kinds + 3 candle colours + flame + incense = 17. Each bucket's per-krathong maximum is never exceeded.
     Test: `src/core/customization/krathongInstanceBuckets.test.ts`.
   - Instanced river krathongs are pixel-for-pixel where the per-mesh model was: every instance matrix equals the world matrix that the old
     `KrathongModel` + `UprightAnchor` tree gives, within 1e-9, with bobbing tilt and a rotated world-view group. Test:
     `src/components/models/loyKrathong/riverKrathongBatch.test.ts` → "matches the per-mesh model".
   - Draw calls do not depend on the item count. The batch is one `InstancedMesh` per bucket (17), created once, and an empty bucket is hidden. Tests:
     `src/components/models/loyKrathong/RiverKrathongBatch.test.tsx`; `src/components/canvas3d/RiverFlow.test.tsx` → "items are anchors, parts are
     one batch"; `src/components/canvas3d/index.test.tsx` → "river krathongs render through one persistent batch".
   - On WebGL (SwiftShader, HIGH tier) a zone of 80 krathongs uses **exactly** as many draw calls as a zone of 1 (same appearance), and it draws
     more triangles. Test: `tests/e2e/perf-audit.spec.ts` → "HIGH: draw calls do not grow with the number of river krathongs".
   - River krathongs never mount `KrathongModel`. Test: `tests/unit/instancing-audit.test.ts`.
   - Riverside trees are `InstancedMesh` (MFW-27). Test: `src/components/models/loyKrathong/RiverEnvironment.test.tsx` → new case
     "riverside trees are instanced (backlog 8.2 AC1)".
2. **"Zone switching on a real mobile device disposes geometry/material; memory stays flat across repeated switches"**
   - By construction a switch creates and frees nothing on the GPU. The 17 batch meshes and their instance buffers are reused across plans, no geometry,
     material or `InstancedMesh` is disposed or created on a switch, and an unmount disposes each batch mesh once and never the shared assets. Test:
     `RiverKrathongBatch.test.tsx` → "zone switches reuse the meshes", "unmount disposes the batch, never the shared assets". MFW-25's
     `index.test.tsx` → "zone switch reuses the one krathong asset set" stays green.
   - The per-frame path allocates nothing, and the river path creates no geometry, material or texture. Test: `tests/unit/instancing-audit.test.ts`.
   - Automated proxy (SwiftShader, LOW tier, real zone navigation with intercepted API): after a warm-up cycle and then 5 cycles (20 switches),
     `renderer.info.memory.geometries`, `.textures` and `info.programs.length` are equal to the baseline. Draw calls on the same zone are equal, the JS heap after a
     forced GC grows ≤ 2 MiB, the tier is unchanged and there is no page or console error. Test: `tests/e2e/perf-audit.spec.ts` → "LOW: memory
     stays flat across repeated zone switches".
   - The on-device tool works: the soak runs to the end and reports zero deltas. Tests: `src/components/canvas3d/perfSoak.test.ts`,
     `src/components/canvas3d/PerfProbePanel.test.tsx`, and `tests/e2e/perf-audit.spec.ts` → "probe soak completes with flat counters".
   - **Real device:** the owner runs the checklist in `docs/perf/MFW-34.md` §4. This cannot be automated in the container. Whether the merge waits for
     those numbers is Open question 1.
3. **"Findings documented with before/after numbers"**
   - `docs/perf/MFW-34.md` holds the automated before (per-mesh `RiverFlow`) and after (batch) numbers, the resource/dispose audit table and the
     on-device checklist with an owner results table. Test: `tests/unit/instancing-audit.test.ts` → "findings doc has the automated numbers": the
     section between `<!-- automated:start -->` and `<!-- automated:end -->` contains no `TBD`.

## Owner decisions that apply

Quoted from `docs/spec/open-questions.md` / CLAUDE.md. Do not reopen them.
- **Row 4:** "80 items per zone (owner, 2026-11-23)". → The batch capacity is `ZONE_ITEM_CAP` krathongs. More can never be drawn (invariant E).
- **Row 5 (MFW-9):** the tier budgets in `TIER_BUDGETS` and the FPS thresholds. → Read, never changed. The e2e must not raise any threshold.
- **Row 11:** "@react-spring/three (owner, 2026-11-23)". → The batch adds no animation of its own.
- **Row 23:** "krathongs keep drifting; only the bobbing stops". → The batch copies the item transform, which already drops bobbing under reduced motion.
- **Row 25:** equal drift speed, no overlap. → Unchanged. The soak items use `RIVER_DRIFT_SPEED_FACTOR`.
- **Row 16 / launch plan:** build the engine generically. → The bucket/plan/writer split is reusable, for example for Christmas ornaments. Only the bucket
  catalogue and the batch component are Loy Krathong specific.
- **Row 20** (testers and devices for the private test) is **still open**. The on-device checklist does not choose devices (Open question 2).

No row of `open-questions.md` names MFW-34 in "Decide in". **Do not edit `docs/spec/open-questions.md`.**

## Files

| Path | New/modify | Purpose |
|---|---|---|
| `src/config/perfProbe.config.ts` | new | Diagnostics constants (query flag, global name, sample interval, soak sizes) |
| `src/config/perfProbe.config.test.ts` | new | Consistency of those constants |
| `src/core/customization/krathongInstanceBuckets.ts` | new | Pure bucket catalogue (server-safe, no three) |
| `src/core/customization/krathongInstanceBuckets.test.ts` | new | Coverage and capacity of the buckets |
| `src/core/customization/index.ts` | modify | `export * from "./krathongInstanceBuckets";` |
| `src/core/customization/purity.test.ts` | modify | Add `"krathongInstanceBuckets"` to the file list |
| `src/core/customization/uprightConstraint.ts` | modify | Export `writeYawTwistQuaternion`; `computeUprightLocalQuaternion` uses it (same results) |
| `src/core/customization/uprightConstraint.test.ts` | modify | Add cases for `writeYawTwistQuaternion` |
| `src/components/models/loyKrathong/riverKrathongBatch.ts` | new | Plan, per-frame writer, mesh factory and mesh helpers (three, no React) |
| `src/components/models/loyKrathong/riverKrathongBatch.test.ts` | new | Parity with the per-mesh model, slots, cap, commit ranges |
| `src/components/models/loyKrathong/RiverKrathongBatch.tsx` | new | Persistent batch component with an imperative handle |
| `src/components/models/loyKrathong/RiverKrathongBatch.test.tsx` | new | Mesh lifetime, counts, shadows, dispose |
| `src/components/models/loyKrathong/index.ts` | modify | Export the batch |
| `src/components/models/loyKrathong/RiverEnvironment.test.tsx` | modify | Add one case (trees instanced) |
| `src/components/canvas3d/sceneObjectNames.ts` | modify | `riverKrathongBatch`, `riverBatchMeshPrefix` |
| `src/components/canvas3d/RiverFlow.tsx` | modify | Empty anchor groups + the batch; the frame loop writes the batch |
| `src/components/canvas3d/RiverFlow.test.tsx` | modify | Stub the batch; rewrite the model selectors; add cases |
| `src/components/canvas3d/perfProbe.ts` | new | Probe flag, renderer sample, diff, heap read, global hook |
| `src/components/canvas3d/perfProbe.test.ts` | new | Pure probe tests |
| `src/components/canvas3d/perfSoak.ts` | new | Synthetic zones + soak runner (scheduler injected) |
| `src/components/canvas3d/perfSoak.test.ts` | new | Zone data validity, runner sequence |
| `src/components/canvas3d/PerfProbePanel.tsx` | new | Hidden DOM panel (counters, soak button, results) |
| `src/components/canvas3d/PerfProbePanel.test.tsx` | new | Panel and soak behaviour with fake timers |
| `src/components/canvas3d/index.tsx` | modify | Probe flag, renderer ref, soak override of river items, panel |
| `src/components/canvas3d/index.test.tsx` | modify | Stub passes `gl`; add cases |
| `tests/unit/instancing-audit.test.ts` | new | Static audit (no per-mesh river model, no allocations, probe stays in the 3D chunk, findings doc) |
| `tests/e2e/fixtures/perfAudit.ts` | new | e2e constants (pure TS, no `src/` import) |
| `tests/unit/perf-audit-fixtures.test.ts` | new | e2e constants equal the `src` constants |
| `tests/e2e/perf-audit.spec.ts` | new | The three automated audit tests |
| `docs/perf/MFW-34.md` | new | Findings: before/after numbers, resource audit, on-device checklist |
| `docs/follow-ups.md` | modify | Replace the MFW-24 draw-call row with an MFW-34 on-device row |

## Implementation steps (Plan)

Conventions for every file:
- TypeScript strict, English comments, no `any`, no `console.*` in non-test files. Every exported constant array or object is `Object.freeze`d.
- **In `src/components/canvas3d/**` and `src/components/models/**` (non-test files), write no decimal literal and no `#` followed by 3–8 hex
  characters. That includes comments, so no "#123" issue references.** Integers are fine. Decimals live in `src/config`.
- `riverKrathongBatch.ts` holds every mutation of three objects that React code needs. The React Compiler lint (`react-hooks/immutability`) rejects
  `mesh.count = …` written directly on a `useMemo` value inside a component, but it accepts a call to a helper function. The lead checked this with
  the repo's eslint config.
- Order your commits as in Definition of done: the probe first, then "before" numbers, then instancing.

### Step 1 — `src/config/perfProbe.config.ts` (new)

```ts
/**
 * Hidden diagnostics for the MFW-34 memory audit (backlog 8.2). Lead decisions (technical, not product numbers):
 * the probe is off unless the page URL has ?perfProbe=1, and it reads counters only (no creation data).
 */
export const PERF_PROBE_QUERY_PARAM = "perfProbe";
export const PERF_PROBE_QUERY_VALUE = "1";
/** window property of the automation hook (Playwright reads samples through it). */
export const PERF_PROBE_GLOBAL_NAME = "__MFW_PERF_PROBE__";
/** How often the panel refreshes its numbers for a human reader. */
export const PERF_PROBE_SAMPLE_INTERVAL_MS = 500;
/** Synthetic zones the soak alternates between (each holds ZONE_ITEM_CAP items). */
export const PERF_SOAK_ZONE_COUNT = 2;
/** Switches measured after the warm-up; a multiple of PERF_SOAK_ZONE_COUNT, so "after" shows the same zone as "before". */
export const PERF_SOAK_SWITCHES = 20;
/** Time each synthetic zone stays on screen before the next switch. */
export const PERF_SOAK_DWELL_MS = 1_000;
/** Soak items are laid out in rows across the one wide lane (lateralOffset values, inside LATERAL_OFFSET_RANGE). */
export const PERF_SOAK_LATERAL_OFFSETS: readonly number[] = Object.freeze([-0.3, 0, 0.3]);
/** Display unit for the JS heap. */
export const BYTES_PER_MEBIBYTE = 1_048_576;
```

`src/config/perfProbe.config.test.ts`:
1. `PERF_SOAK_SWITCHES % PERF_SOAK_ZONE_COUNT === 0`, `PERF_SOAK_ZONE_COUNT >= 2`, and both are safe integers.
2. `PERF_SOAK_DWELL_MS > PERF_PROBE_SAMPLE_INTERVAL_MS > 0`.
3. Every `PERF_SOAK_LATERAL_OFFSETS` value is within `LATERAL_OFFSET_RANGE` (import from `@/core/coordinates`). The values are distinct.
4. `Math.ceil(ZONE_ITEM_CAP / PERF_SOAK_LATERAL_OFFSETS.length) * PERF_SOAK_LATERAL_OFFSETS.length >= ZONE_ITEM_CAP` (a full zone fits the grid).

### Step 2 — `src/core/customization/krathongInstanceBuckets.ts` (new; pure; imports config and `./types` only)

```ts
import {
  CANDLE_COLOR_PALETTE, FLOWER_KINDS, KRATHONG_BASE_IDS, LEAF_COLOR_PALETTE, LEAF_FOLD_STYLE_IDS, RIM_SOCKET_COUNT,
} from "@/config/events/loyKrathong.config";
import { KRATHONG_INCENSE_MODEL, KRATHONG_LEAF_COUNT } from "@/config/krathongModel.config";
import type { KrathongGeometryKey, KrathongMaterialKey, KrathongPartRole } from "./types";

/** One draw batch of river krathong parts: every part with this geometry AND this material (backlog 8.2 AC1). */
export interface KrathongInstanceBucket {
  readonly key: string; // krathongInstanceBucketKey(geometryKey, materialKey)
  readonly role: KrathongPartRole;
  readonly geometryKey: KrathongGeometryKey;
  readonly materialKey: KrathongMaterialKey;
  /** Most parts of this bucket ONE krathong can have; capacity = maxPerKrathong × max krathongs. */
  readonly maxPerKrathong: number;
}

export const KRATHONG_INSTANCE_BUCKET_KEY_SEPARATOR = "|";
export function krathongInstanceBucketKey(geometryKey: KrathongGeometryKey, materialKey: KrathongMaterialKey): string {
  return `${geometryKey}${KRATHONG_INSTANCE_BUCKET_KEY_SEPARATOR}${materialKey}`;
}

const SINGLE_PART = 1;

/** Fixed order: bases, leaves (fold × colour), flowers, candles, flame, incense. The index is the batch mesh index. */
export const KRATHONG_INSTANCE_BUCKETS: readonly KrathongInstanceBucket[] = Object.freeze([
  ...KRATHONG_BASE_IDS.map((id) => bucket("base", `base:${id}`, `base:${id}`, SINGLE_PART)),
  ...LEAF_FOLD_STYLE_IDS.flatMap((fold) =>
    LEAF_COLOR_PALETTE.map((color) => bucket("leaf", `leaf:${fold}`, `leaf:${color}`, KRATHONG_LEAF_COUNT)),
  ),
  ...FLOWER_KINDS.map((kind) => bucket("flower", `flower:${kind}`, `flower:${kind}`, RIM_SOCKET_COUNT)),
  ...CANDLE_COLOR_PALETTE.map((color) => bucket("candle", "candle", `candle:${color}`, SINGLE_PART)),
  bucket("flame", "flame", "flame", SINGLE_PART),
  bucket("incense", "incense", "incense", KRATHONG_INCENSE_MODEL.count),
]);
export const KRATHONG_INSTANCE_BUCKET_COUNT = KRATHONG_INSTANCE_BUCKETS.length;

const BUCKET_INDEX: ReadonlyMap<string, number> = new Map(KRATHONG_INSTANCE_BUCKETS.map((b, i) => [b.key, i]));

/** Index into KRATHONG_INSTANCE_BUCKETS, or null for a pair the catalogue does not know. */
export function krathongInstanceBucketIndex(geometryKey: KrathongGeometryKey, materialKey: KrathongMaterialKey): number | null {
  return BUCKET_INDEX.get(krathongInstanceBucketKey(geometryKey, materialKey)) ?? null;
}
```
`bucket(role, geometryKey, materialKey, maxPerKrathong)` is a module-private helper that returns
`Object.freeze({ key: krathongInstanceBucketKey(geometryKey, materialKey), role, geometryKey, materialKey, maxPerKrathong })`. Declare it **above**
`KRATHONG_INSTANCE_BUCKETS` as a `function` declaration (hoisted). If TypeScript widens the template literals, annotate them with `as const`, or type
the helper's parameters as `KrathongGeometryKey` / `KrathongMaterialKey`. Do not cast with `as unknown as`.

Add `export * from "./krathongInstanceBuckets";` to `src/core/customization/index.ts`, after `krathongAssembler`. Add `"krathongInstanceBuckets"`
to the name list in `src/core/customization/purity.test.ts`. That change only adds a file to the check.

### Step 3 — `src/core/customization/uprightConstraint.ts` (modify)

Add one export and route the existing function through it. The behaviour is identical, and the existing tests must pass unchanged.
```ts
/**
 * Writes into `out` the twist of `source` about world +Y (its yaw), normalised. Identity when `source` has no defined yaw.
 * `out` may be `source`. No allocation. This is the rule UprightAnchor and the river batch share (MFW-34).
 */
export function writeYawTwistQuaternion(source: Quaternion, out: Quaternion): Quaternion {
  const len = Math.hypot(source.y, source.w);
  if (len < UPRIGHT_TWIST_EPSILON) return out.set(0, 0, 0, 1);
  return out.set(0, source.y / len, 0, source.w / len);
}

export function computeUprightLocalQuaternion(parentWorld: Quaternion, out: Quaternion): Quaternion {
  writeYawTwistQuaternion(parentWorld, twist);
  return out.copy(parentWorld).invert().multiply(twist);
}
```
Reason: the hero krathong (`UprightAnchor`) and the river batch must keep the candle upright by the **same** rule. A second copy of the math could drift apart.

### Step 4 — `src/components/models/loyKrathong/riverKrathongBatch.ts` (new; three, no React)

```ts
import { DynamicDrawUsage, Euler, InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";
import { SCENE_OBJECT_NAMES } from "@/components/canvas3d/sceneObjectNames";
import { ZONE_ITEM_CAP } from "@/config/world.config";
import {
  assembleKrathong, KRATHONG_INSTANCE_BUCKETS, krathongInstanceBucketIndex,
  type KrathongAppearance, type KrathongPartInstance,
} from "@/core/customization";
import { writeYawTwistQuaternion } from "@/core/customization/uprightConstraint";
import type { KrathongAssets } from "./krathongAssets";

/** Elements of one 4×4 instance matrix. */
const MATRIX_ELEMENTS = 16;
/** mesh.userData key that holds the bucket index (lets a tap handler map event.object + instanceId to an item, MFW-28). */
export const KRATHONG_BATCH_BUCKET_USERDATA_KEY = "krathongBucketIndex";

/** One part of one river krathong: where it goes in the batch and its model-local transform. Render-time only (invariant A). */
export interface PlannedKrathongPart {
  readonly bucketIndex: number;
  readonly slot: number;      // instance index inside its bucket mesh
  readonly upright: boolean;  // true for the centre-anchor parts (candle, flame, incense)
  readonly local: Matrix4;    // T(localPosition) · R_y(rotationY) · S(scale), as KrathongModel renders it
}
export interface PlannedKrathongItem {
  readonly anchorLocal: Vector3; // assembly.centerAnchor.localPosition
  readonly parts: readonly PlannedKrathongPart[];
}
/** Built once per item list (zone load, tier change), never per frame. */
export interface KrathongInstancePlan {
  readonly items: readonly PlannedKrathongItem[]; // index = the item's index in the rendered list
  readonly bucketCounts: readonly number[];        // used instances per bucket (length = bucket count)
  readonly slotItems: readonly (readonly number[])[]; // per bucket: slot → item index
}
/** Where the writer puts matrices (the batch component: meshes[bucketIndex].setMatrixAt(slot, m)). */
export interface KrathongInstanceSink {
  setMatrixAt(bucketIndex: number, slot: number, matrix: Matrix4): void;
}

export function planKrathongInstances(appearances: readonly KrathongAppearance[], maxItems: number = ZONE_ITEM_CAP): KrathongInstancePlan;
export function writeKrathongItemInstances(plan: KrathongInstancePlan, itemIndex: number, itemMatrix: Matrix4, itemQuaternion: Quaternion, sink: KrathongInstanceSink): void;
export function itemIndexForInstance(plan: KrathongInstancePlan, bucketIndex: number, instanceId: number): number | null;
export function createKrathongBatchMeshes(assets: KrathongAssets, maxItems: number = ZONE_ITEM_CAP): readonly InstancedMesh[];
export function applyKrathongBatchPlan(meshes: readonly InstancedMesh[], plan: KrathongInstancePlan): void;
export function applyKrathongBatchShadows(meshes: readonly InstancedMesh[], shadows: boolean): void;
export function commitKrathongBatch(meshes: readonly InstancedMesh[], plan: KrathongInstancePlan): void;
export function disposeKrathongBatch(meshes: readonly InstancedMesh[]): void;
```

Behaviour:
- **`planKrathongInstances(appearances, maxItems)`**
  1. If `!Number.isSafeInteger(maxItems) || maxItems < 0`, throw `RangeError("maxItems must be a non-negative integer")`.
  2. `const n = KRATHONG_INSTANCE_BUCKETS.length; const counts = new Array<number>(n).fill(0); const slotItems = Array.from({ length: n }, () => [] as number[]);`
     `const capacity = KRATHONG_INSTANCE_BUCKETS.map((b) => b.maxPerKrathong * maxItems);`
  3. `const itemCount = Math.min(appearances.length, maxItems);` For `i` in `0 … itemCount − 1`:
     `const assembly = assembleKrathong(appearances[i]);` Walk `assembly.body` with `upright = false`, then `assembly.centerAnchor.parts` with `upright = true`. For each
     part: `const b = krathongInstanceBucketIndex(part.geometryKey, part.materialKey);`. If `b === null || counts[b] >= capacity[b]`, skip the part
     (defensive; a test proves it never happens). Otherwise `slot = counts[b]++`, `slotItems[b].push(i)`, and push
     `Object.freeze({ bucketIndex: b, slot, upright, local: localMatrixOf(part) })`.
     The item is `Object.freeze({ anchorLocal: new Vector3(...assembly.centerAnchor.localPosition), parts: Object.freeze(parts) })`.
  4. Return `Object.freeze({ items: Object.freeze(items), bucketCounts: Object.freeze(counts), slotItems: Object.freeze(slotItems.map((s) => Object.freeze(s))) })`.
  - `localMatrixOf(part: KrathongPartInstance)` (module-private): `new Matrix4().compose(new Vector3(...part.localPosition),
    new Quaternion().setFromEuler(new Euler(0, part.rotationY, 0)), new Vector3(...part.scale))`. Allocation is fine here, because this runs once per plan.
- **`writeKrathongItemInstances(plan, itemIndex, itemMatrix, itemQuaternion, sink)`** — per frame, **no allocation**. It uses module-level scratch
  objects: `scratchAnchorPosition = new Vector3()`, `scratchTwist = new Quaternion()`, `scratchScale = new Vector3()`, `scratchUpright = new Matrix4()`,
  `scratchOut = new Matrix4()`.
  ```ts
  const item = plan.items[itemIndex];
  if (item === undefined) return;
  scratchAnchorPosition.copy(item.anchorLocal).applyMatrix4(itemMatrix);
  writeYawTwistQuaternion(itemQuaternion, scratchTwist);
  scratchScale.setFromMatrixScale(itemMatrix);
  scratchUpright.compose(scratchAnchorPosition, scratchTwist, scratchScale);
  const parts = item.parts;
  for (let p = 0; p < parts.length; p++) {
    const part = parts[p];
    scratchOut.multiplyMatrices(part.upright ? scratchUpright : itemMatrix, part.local);
    sink.setMatrixAt(part.bucketIndex, part.slot, scratchOut);
  }
  ```
  `itemMatrix` / `itemQuaternion` are the item anchor group's local `matrix` / `quaternion` in the `river-flow` space, and the batch lives in the same
  space (Step 7). Why this equals `UprightAnchor`: `UprightAnchor` makes the world rotation `twist_Y(q_world)`. The world-view group rotates only about Y,
  and `twist_Y(R_y · q) = R_y · twist_Y(q)`. So in the river-flow space, the anchor rotation is `twist_Y(q_item)`, its position is `itemMatrix · anchorLocal`,
  and its scale is the item's uniform scale. The parity test proves this numerically.
- **`itemIndexForInstance(plan, b, id)`**: return `plan.slotItems[b]?.[id] ?? null` when `b` and `id` are non-negative safe integers. Otherwise return `null`.
- **`createKrathongBatchMeshes(assets, maxItems)`**: for each bucket `i`:
  `const mesh = new InstancedMesh(assets.geometry(b.geometryKey), assets.material(b.materialKey), b.maxPerKrathong * maxItems);`
  `mesh.name = SCENE_OBJECT_NAMES.riverBatchMeshPrefix + i;` `mesh.userData[KRATHONG_BATCH_BUCKET_USERDATA_KEY] = i;`
  `mesh.instanceMatrix.setUsage(DynamicDrawUsage);` `mesh.frustumCulled = false;` (the instances move every frame, so a stale bounding sphere must never cull them)
  `mesh.count = 0; mesh.visible = false;`. Return `Object.freeze(meshes)`. Validate `maxItems` exactly as the planner does.
  The geometry and material are the **shared** krathong assets. The batch never creates or disposes geometry or material.
- **`applyKrathongBatchPlan(meshes, plan)`**: `mesh.count = plan.bucketCounts[i] ?? 0; mesh.visible = mesh.count > 0;` for each mesh.
- **`applyKrathongBatchShadows(meshes, shadows)`**: `mesh.castShadow = shadows; mesh.receiveShadow = shadows && KRATHONG_INSTANCE_BUCKETS[i].role === "base";`
  This matches `KrathongModel` (`castShadow={shadows}`, `receiveShadow={shadows && part.role === "base"}`).
- **`commitKrathongBatch(meshes, plan)`** — per frame, **no allocation**. For each `i` with `count = plan.bucketCounts[i] ?? 0` and `count > 0`:
  `attr = meshes[i].instanceMatrix; attr.clearUpdateRanges(); attr.addUpdateRange(0, count * MATRIX_ELEMENTS); attr.needsUpdate = true;`
  `meshes[i].boundingSphere = null;` (a later raycast, for example the MFW-28 tap, recomputes it from the current matrices, so it is never stale).
  Use an indexed `for` loop.
- **`disposeKrathongBatch(meshes)`**: `mesh.dispose()` for each mesh. That releases the instance buffer through three's `InstancedMesh.dispose`. It
  does **not** touch the shared geometry or material.

### Step 5 — `src/components/models/loyKrathong/RiverKrathongBatch.tsx` (new)

```tsx
"use client";

import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, type Ref } from "react";
import type { Matrix4, Quaternion } from "three";
import { SCENE_OBJECT_NAMES } from "@/components/canvas3d/sceneObjectNames";
import { useKrathongAssets } from "./KrathongAssetsProvider";
import {
  applyKrathongBatchPlan, applyKrathongBatchShadows, commitKrathongBatch, createKrathongBatchMeshes, disposeKrathongBatch,
  writeKrathongItemInstances, type KrathongInstancePlan, type KrathongInstanceSink,
} from "./riverKrathongBatch";

export interface RiverKrathongBatchHandle {
  /** The persistent bucket meshes (same array for the batch's lifetime). For tests and the perf audit. */
  readonly meshes: readonly import("three").InstancedMesh[];
  /** Per frame: write every part of item `itemIndex` from its anchor matrix/quaternion (river-flow space). Allocation-free. */
  writeItem(itemIndex: number, itemMatrix: Matrix4, itemQuaternion: Quaternion): void;
  /** Per frame, after all writeItem calls: upload only the used ranges. */
  commit(): void;
}
export interface RiverKrathongBatchProps {
  readonly plan: KrathongInstancePlan;
  readonly shadows: boolean; // RiverFlow's castShadow (MFW-25: shadows && riverItemCastShadow)
  readonly ref?: Ref<RiverKrathongBatchHandle>;
}

/** All river krathongs in ≤ KRATHONG_INSTANCE_BUCKET_COUNT draw calls. Created once per canvas; zone switches only re-plan (backlog 8.2). */
export function RiverKrathongBatch({ plan, shadows, ref }: RiverKrathongBatchProps) {
  const assets = useKrathongAssets();
  const meshes = useMemo(() => createKrathongBatchMeshes(assets), [assets]);
  const sink = useMemo<KrathongInstanceSink>(
    () => ({ setMatrixAt: (bucketIndex, slot, matrix) => meshes[bucketIndex]?.setMatrixAt(slot, matrix) }),
    [meshes],
  );
  useEffect(() => () => disposeKrathongBatch(meshes), [meshes]);
  useLayoutEffect(() => applyKrathongBatchPlan(meshes, plan), [meshes, plan]);
  useLayoutEffect(() => applyKrathongBatchShadows(meshes, shadows), [meshes, shadows]);
  useImperativeHandle(ref, () => ({
    meshes,
    writeItem: (itemIndex, itemMatrix, itemQuaternion) => writeKrathongItemInstances(plan, itemIndex, itemMatrix, itemQuaternion, sink),
    commit: () => commitKrathongBatch(meshes, plan),
  }), [meshes, plan, sink]);
  return (
    <group name={SCENE_OBJECT_NAMES.riverKrathongBatch}>
      {meshes.map((mesh) => <primitive key={mesh.name} object={mesh} />)}
    </group>
  );
}
```
Notes:
- Import `InstancedMesh` as a type at the top (`import type { InstancedMesh, Matrix4, Quaternion } from "three";`) instead of the inline `import(...)`
  type shown above.
- `<primitive>` is used on purpose. R3F never auto-disposes a primitive, so the only disposal is the explicit `disposeKrathongBatch` on unmount (D3),
  and a spy can test it.
- `useMemo([assets])`: `KrathongAssetsProvider` keeps one assets object for its lifetime, so the meshes are created once per canvas. If lint rejects
  the pattern, switch to `const [meshes] = useState(() => createKrathongBatchMeshes(assets))` (the `KrathongAssetsProvider` pattern), and keep every
  mutation inside the helpers.
- Optional for MFW-28: `onInstanceClick?: (bucketIndex: number, instanceId: number) => void`. When it is given, put an `onClick` on the `<group>`:
  read `event.object.userData[KRATHONG_BATCH_BUCKET_USERDATA_KEY]` (it must be a number) and `event.instanceId` (it must not be `undefined`), call
  `event.stopPropagation()`, then call the callback. Add it **only** if MFW-28 is already on `main` (Step 7). Otherwise leave it out, because it is
  YAGNI.

Barrel `src/components/models/loyKrathong/index.ts`: keep every line and add
```ts
export { RiverKrathongBatch, type RiverKrathongBatchHandle, type RiverKrathongBatchProps } from "./RiverKrathongBatch";
export * from "./riverKrathongBatch";
```

### Step 6 — `src/components/canvas3d/sceneObjectNames.ts` (modify)

Add two entries to the frozen object (keep the others):
```ts
  riverKrathongBatch: "river-krathong-batch",
  riverBatchMeshPrefix: "river-batch-",
```

### Step 7 — `src/components/canvas3d/RiverFlow.tsx` (modify)

Keep MFW-25's tier cap, `pinnedIds`, `castShadow`, `prepared`, `visible`, `data-visible-cap` and the public props unchanged. Changes:
1. Imports: remove `KrathongModel`. From `@/components/models/loyKrathong` import `RiverKrathongBatch`, `planKrathongInstances` and
   `type RiverKrathongBatchHandle`. Keep importing `RIVER_KRATHONG_SCALE`.
2. After `visible`:
   ```ts
   const plan = useMemo(() => planKrathongInstances(visible.map((item) => item.source.appearance)), [visible]);
   const rendered = plan.items.length === visible.length ? visible : visible.slice(0, plan.items.length); // defensive: batch capacity = ZONE_ITEM_CAP
   const batch = useRef<RiverKrathongBatchHandle | null>(null);
   ```
   Wrap `rendered` in `useMemo([visible, plan])`. Use `rendered` (not `visible`) in the invalidate effect, the frame loop, the empty check and the `.map`.
   `rendered[i]` is plan item `i`.
3. Frame loop (indexed `for`, no allocation):
   ```ts
   useFrame(() => {
     if (rendered.length === 0) return;
     const nowMs = now();
     const target = batch.current;
     for (let i = 0; i < rendered.length; i++) {
       const item = rendered[i];
       const group = groups.current.get(item.id);
       if (!group) continue;
       applyRiverItemTransform(group, item, nowMs, reducedMotion, scratch.current);
       group.updateMatrix(); // position · rotation (YXZ) · RIVER_KRATHONG_SCALE → group.matrix
       target?.writeItem(i, group.matrix, group.quaternion);
     }
     target?.commit();
     invalidate();
   });
   ```
4. Render. The anchor groups stay, so names, Find My / fly-to targets and the MFW-25 tests keep working. They have **no children**. The batch is always
   mounted, so a zone switch through an empty list (MFW-25 clears items first) never unmounts it:
   ```tsx
   return (
     <>
       {rendered.length > 0 && (
         <group name="river-flow" data-visible-cap={visibleCap}>
           {rendered.map((item) => (
             <group key={item.id} name={`river-item-${item.id}`} scale={RIVER_KRATHONG_SCALE} ref={/* unchanged ref callback */} />
           ))}
         </group>
       )}
       <RiverKrathongBatch ref={batch} plan={plan} shadows={castShadow} />
     </>
   );
   ```
   Both `river-flow` and the batch group have identity transforms and the same parent (the world-view group), so the anchor matrices are valid batch
   instance space.
5. TSDoc of `RiverFlow`: replace MFW-25's sentence "Each is a full KrathongModel (about 20 meshes); MFW-34 instancing is the real fix." with "Items are
   empty anchor groups (transform, fly-to target); all their parts are drawn by one persistent RiverKrathongBatch (≤ 17 draw calls per pass, MFW-34)."

**If MFW-28 merged first** (check `git log --oneline origin/main | grep MFW-28` and `rg -n "onClick|onItem|Bounce" src/components/canvas3d/RiverFlow.tsx`):
- **Item tap.** If `RiverFlow` has an item tap callback (for example `onItemSelected(id)`), keep its prop name and signature. Add `onInstanceClick` to
  `RiverKrathongBatch` (Step 5) and wire it in `RiverFlow` like this:
  `(b, id) => { const index = itemIndexForInstance(plan, b, id); if (index !== null) onItemSelected(rendered[index].id); }`.
  Keep MFW-28's mode gating, so only `WORLD_EXPLORE` selects.
- **Per-item bounce.** If MFW-28 bounces a river item by wrapping its `KrathongModel`, move the bounce onto the **anchor group's scale** instead (for
  example a spring factor × `RIVER_KRATHONG_SCALE`). `group.matrix` then carries it into the batch. Keep MFW-28's reduced-motion behaviour.
- **Tests.** Rewrite MFW-28's tests that look inside the per-item model the same way as in Step 13. List every adaptation in the PR.

### Step 8 — `src/components/canvas3d/perfProbe.ts` (new; no React, no three import)

```ts
import { PERF_PROBE_GLOBAL_NAME, PERF_PROBE_QUERY_PARAM, PERF_PROBE_QUERY_VALUE } from "@/config/perfProbe.config";

/** Structural subset of THREE.WebGLRenderer the probe reads (WebGLRenderer satisfies it). */
export interface RendererInfoSource {
  readonly info: {
    readonly memory: { readonly geometries: number; readonly textures: number };
    readonly render: { readonly calls: number; readonly triangles: number; readonly frame: number };
    readonly programs: readonly unknown[] | null;
  };
}
/** Counters only: no creation data, no positions (invariants A, C). */
export interface RendererSample {
  readonly geometries: number;
  readonly textures: number;
  readonly programs: number;
  readonly calls: number;      // last rendered frame, all passes (shadow pass included)
  readonly triangles: number;  // last rendered frame
  readonly frame: number;
  readonly riverItems: number; // items handed to RiverFlow (before the tier cap)
  readonly jsHeapBytes: number | null; // performance.memory (Chromium only), else null
}
export type RendererSampleDelta = { readonly [K in Exclude<keyof RendererSample, "jsHeapBytes">]: number } & { readonly jsHeapBytes: number | null };
export interface PerfProbeHook { sample(): RendererSample | null }

export function isPerfProbeRequested(search: string): boolean; // new URLSearchParams(search).get(PARAM) === VALUE
export function readPerfProbeFlag(): boolean;                   // typeof window !== "undefined" && isPerfProbeRequested(window.location.search)
export function readPerfProbeFlagOnServer(): boolean;           // false
export function subscribeToNothing(): () => void;               // returns a no-op unsubscribe (the URL never changes in this SPA flow)
export function readJsHeapBytes(perf?: Performance): number | null;
export function readRendererSample(source: RendererInfoSource | null, riverItems: number, jsHeapBytes: number | null): RendererSample | null;
export function diffRendererSamples(before: RendererSample, after: RendererSample): RendererSampleDelta;
export function registerPerfProbeHook(hook: PerfProbeHook, target?: Window): () => void;
```
- `isPerfProbeRequested`: exact, case-sensitive match. `"?perfProbe=1"` and `"?a=b&perfProbe=1"` → true. `""`, `"?perfProbe=0"`, `"?perfprobe=1"` and
  `"?perfProbe"` → false.
- `readJsHeapBytes(perf = globalThis.performance)`: read `(perf as Performance & { memory?: { usedJSHeapSize?: unknown } }).memory?.usedJSHeapSize`. Return it
  when it is a finite number ≥ 0, else `null`. When `perf` is `undefined`, return `null`.
- `readRendererSample`: return `null` when `source` is `null`. Otherwise return a frozen object with `programs: source.info.programs?.length ?? 0` and the
  other fields copied.
- `diffRendererSamples`: `after − before` per numeric field. `jsHeapBytes` is `null` unless both values are numbers.
- `registerPerfProbeHook(hook, target = window)`: set `target[PERF_PROBE_GLOBAL_NAME] = hook` through a typed cast
  (`target as unknown as Record<string, PerfProbeHook | undefined>`). Return a cleanup that deletes the property **only if** it still holds this hook.

### Step 9 — `src/components/canvas3d/perfSoak.ts` (new; no React)

```ts
import { CANDLE_COLOR_PALETTE, FLOWER_KINDS, KRATHONG_BASE_IDS, LEAF_COLOR_PALETTE, LEAF_FOLD_STYLE_IDS, RIM_SOCKET_COUNT } from "@/config/events/loyKrathong.config";
import { LOY_KRATHONG_RIVER_LANE_ID } from "@/config/events/loyKrathong.river.config";
import { PERF_SOAK_LATERAL_OFFSETS } from "@/config/perfProbe.config";
import { RIVER_DRIFT_SPEED_FACTOR } from "@/config/riverFlow.config";
import { ZONE_ITEM_CAP } from "@/config/world.config";
import type { KrathongAppearance } from "@/core/customization";
import { diffRendererSamples, type RendererSample, type RendererSampleDelta } from "./perfProbe";
import type { RiverFlowItem } from "./RiverFlow";

/** Varied but deterministic: over any 6 consecutive k every krathong bucket is used; every rim socket holds a flower (worst case). */
export function perfSoakAppearance(k: number): KrathongAppearance;
/** `zoneCount` synthetic zones of `itemsPerZone` items each. Diagnostic data held in memory only, never persisted or sent. */
export function buildPerfSoakZones(zoneCount: number, itemsPerZone: number, createdAtMs: number): readonly (readonly RiverFlowItem[])[];

export interface PerfSoakResult {
  readonly switches: number;
  readonly before: RendererSample | null;
  readonly after: RendererSample | null;
  readonly delta: RendererSampleDelta | null;
}
export interface PerfSoakOptions {
  readonly zones: readonly (readonly RiverFlowItem[])[]; // length >= 1
  readonly switches: number;                             // >= 1 and a multiple of zones.length
  readonly dwellMs: number;                              // > 0
  readonly setItems: (items: readonly RiverFlowItem[] | null) => void; // null = give the river back to the store
  readonly sample: () => RendererSample | null;
  readonly schedule: (callback: () => void, delayMs: number) => () => void; // returns cancel
  readonly onProgress?: (completedSwitches: number, totalSwitches: number) => void;
  readonly onCancel?: () => void;
  readonly onDone: (result: PerfSoakResult) => void;
}
export interface PerfSoakRunner { start(): void; cancel(): void; isRunning(): boolean }
export function createPerfSoakRunner(options: PerfSoakOptions): PerfSoakRunner;
```
- `perfSoakAppearance(k)` (k a non-negative integer): `{ base: KRATHONG_BASE_IDS[k % KRATHONG_BASE_IDS.length], lotusFold: LEAF_FOLD_STYLE_IDS[k % LEAF_FOLD_STYLE_IDS.length],
  leafColor: LEAF_COLOR_PALETTE[k % LEAF_COLOR_PALETTE.length], flowers: Array.from({ length: RIM_SOCKET_COUNT }, (_, s) => FLOWER_KINDS[(k + s) % FLOWER_KINDS.length]),
  candleColor: CANDLE_COLOR_PALETTE[k % CANDLE_COLOR_PALETTE.length] }`, frozen (and `flowers` frozen).
- `buildPerfSoakZones`: `zoneCount` must be a safe integer ≥ 1, `itemsPerZone` a safe integer in `[0, ZONE_ITEM_CAP]` and `createdAtMs` finite. Otherwise throw
  `RangeError`. With `rows = PERF_SOAK_LATERAL_OFFSETS.length` and `columns = Math.ceil(itemsPerZone / rows)`, item `i` of zone `z` is
  `{ id: \`perf-soak-${z}-${i}\`, coord: { mode: "SPLINE_PATH", laneId: LOY_KRATHONG_RIVER_LANE_ID, spawnProgress: (2 * col + 1) / (2 * columns),
  speedFactor: RIVER_DRIFT_SPEED_FACTOR, lateralOffset: PERF_SOAK_LATERAL_OFFSETS[i % rows] }, createdAtMs, appearance: perfSoakAppearance(z * itemsPerZone + i) }`,
  where `col = Math.floor(i / rows)`. The `(2c + 1) / 2C` form keeps decimal literals out of `canvas3d`. Freeze everything.
- `createPerfSoakRunner(options)`: validate the options as documented (throw `RangeError` on bad values). State: `running = false`, `shown = 0`,
  `cancelTimer: (() => void) | null`, `before: RendererSample | null`. With `total = zones.length + switches`:
  - `start()`: if running, return. Set `running = true`, `shown = 0`, `before = null`, then call `showNext()`.
  - `showNext()`: `setItems(zones[shown % zones.length]); shown += 1; cancelTimer = schedule(afterDwell, dwellMs);`
  - `afterDwell()`: `cancelTimer = null`. If `shown === zones.length`, set `before = sample()` (end of the warm-up: every zone was shown once). If
    `shown > zones.length`, call `onProgress?.(shown - zones.length, switches)`. If `shown === total`: `const after = sample(); running = false; setItems(null);
    onDone({ switches, before, after, delta: before && after ? diffRendererSamples(before, after) : null }); return;`. Otherwise call `showNext()`.
  - `cancel()`: if not running, return. Call `cancelTimer?.()`, set `running = false`, then `setItems(null)` and `onCancel?.()`.
  - `isRunning()` returns `running`.
  Because `switches % zones.length === 0`, the "after" sample is taken on the same zone (`zones.length − 1`) as "before".

### Step 10 — `src/components/canvas3d/PerfProbePanel.tsx` (new)

```tsx
"use client";
export const PERF_PROBE_COPY = Object.freeze({
  title: "Perf probe (MFW-34)",
  runSoak: "Run zone-switch soak",
  running: (done: number, total: number) => `Soak running… ${done}/${total}`,
  done: "Soak done",
  notAvailable: "n/a",
});
export interface PerfProbePanelProps {
  readonly rendererRef: RefObject<RendererInfoSource | null>;
  readonly riverItemCount: number;
  readonly qualityTier: QualityTier;
  readonly soakEnabled: boolean; // mode === "WORLD_EXPLORE"
  readonly onSoakItems: (items: readonly RiverFlowItem[] | null) => void;
}
export function PerfProbePanel(props: PerfProbePanelProps): JSX.Element;
```
The copy is English on purpose: this is a developer and owner diagnostic, not user-facing product UI (D9).

Behaviour:
- `riverItemCountRef` and `onSoakItemsRef` are refs updated in a `useLayoutEffect` (never written during render). `const fps = useDeviceStore((s) => s.fps);`
- `sampleNow = useCallback(() => readRendererSample(rendererRef.current, riverItemCountRef.current, readJsHeapBytes()), [rendererRef])`.
- Effect 1: `const stop = registerPerfProbeHook({ sample: sampleNow }); return stop;` with deps `[sampleNow]`.
- Effect 2: `const id = window.setInterval(() => setSample(sampleNow()), PERF_PROBE_SAMPLE_INTERVAL_MS); return () => window.clearInterval(id);`.
  The setState happens inside the interval callback, which is allowed.
- Soak state: `status: "idle" | "running" | "done"`, `progress`, `result: PerfSoakResult | null`, and `runnerRef = useRef<PerfSoakRunner | null>(null)`.
  The click handler on the button (rendered only when `soakEnabled && status !== "running"`) does this:
  ```ts
  const zones = buildPerfSoakZones(PERF_SOAK_ZONE_COUNT, ZONE_ITEM_CAP, Date.now());
  runnerRef.current = createPerfSoakRunner({
    zones, switches: PERF_SOAK_SWITCHES, dwellMs: PERF_SOAK_DWELL_MS,
    setItems: (items) => onSoakItemsRef.current(items), sample: sampleNow,
    schedule: (cb, ms) => { const t = window.setTimeout(cb, ms); return () => window.clearTimeout(t); },
    onProgress: (done, total) => setProgress([done, total]),
    onCancel: () => setStatus("idle"),
    onDone: (r) => { setResult(r); setStatus("done"); },
  });
  setStatus("running"); setResult(null); setProgress([0, PERF_SOAK_SWITCHES]);
  runnerRef.current.start();
  ```
- Effect 3 (deps `[soakEnabled]`): if `!soakEnabled`, call `runnerRef.current?.cancel()`. Effect 4 (deps `[]`): its cleanup calls `runnerRef.current?.cancel()`.
- Markup (a **sibling** of the viewport `<section>`, never inside it: the section's pointer handlers would turn a button tap into a water tap):
  ```tsx
  <aside aria-label="Performance probe" data-testid="perf-probe"
         data-quality-tier={qualityTier} data-geometries={sample?.geometries} data-textures={sample?.textures}
         data-programs={sample?.programs} data-calls={sample?.calls} data-triangles={sample?.triangles}
         data-river-items={sample?.riverItems} data-soak-status={status}
         data-soak-result={result ? JSON.stringify(result) : undefined}
         className="mb-4 w-full rounded-2xl border border-indigo-950/30 p-3 font-mono text-xs">
  ```
  Inside: the title; a `<dl>` with tier, FPS (`fps ?? n/a`), river items, draw calls, triangles, geometries, textures, programs, JS heap
  (`(bytes / BYTES_PER_MEBIBYTE).toFixed(1) + " MiB"` or `n/a`), and frame; the soak button or the progress text; and, when `result` exists, a small
  table with rows geometries / textures / programs / calls / triangles / JS heap and columns before / after / delta. There is no animation and no
  transition class.

### Step 11 — `src/components/canvas3d/index.tsx` (modify)

On top of MFW-25's version:
1. Imports: add `useSyncExternalStore` to the `react` import. Add `import { PerfProbePanel } from "./PerfProbePanel";` and
   `import { readPerfProbeFlag, readPerfProbeFlagOnServer, subscribeToNothing, type RendererInfoSource } from "./perfProbe";`.
2. In `SceneViewport`, with the other hooks (before the early `return null`):
   ```ts
   const perfProbeEnabled = useSyncExternalStore(subscribeToNothing, readPerfProbeFlag, readPerfProbeFlagOnServer);
   const rendererRef = useRef<RendererInfoSource | null>(null);
   const [soakRiverItems, setSoakRiverItems] = useState<readonly RiverFlowItem[] | null>(null);
   ```
   Change MFW-25's `const visibleRiverItems = riverItems ?? storeRiverItems;` to
   `const visibleRiverItems = (mode === "WORLD_EXPLORE" ? soakRiverItems : null) ?? riverItems ?? storeRiverItems;`
   (the soak overrides the river only while it runs, and only in WORLD_EXPLORE).
3. `onCreated={({ camera, invalidate, gl }) => { … existing …; rendererRef.current = gl; }}`.
4. Return a fragment: the existing `<section>` unchanged, followed by
   ```tsx
   {perfProbeEnabled && (
     <PerfProbePanel rendererRef={rendererRef} riverItemCount={visibleRiverItems.length} qualityTier={qualityTier}
       soakEnabled={mode === "WORLD_EXPLORE"} onSoakItems={setSoakRiverItems} />
   )}
   ```
   FALLBACK_2D and the pre-profiling state still return `null` (no panel, no canvas).
5. Change nothing else (camera, gestures, lights, pan, `TIER_BUDGETS`).

### Step 12 — `docs/perf/MFW-34.md` (new) and `docs/follow-ups.md` (modify)

Create `docs/perf/MFW-34.md` with exactly this structure. Fill the automated numbers from the e2e output (`[perf-audit]` lines; Definition of
done). Leave the device table to the owner.
```markdown
# MFW-34 — Instanced rendering & memory audit: findings

Backlog 8.2: "No crashes or leaks on real phones." Spec §6.8 Task 8.2. Branch feat/MFW-34-instanced-rendering-memory-cleanup-audit.

## 1. What changed
- Before: RiverFlow mounted one KrathongModel per river krathong (up to 22 meshes each).
- After: one persistent RiverKrathongBatch — 17 InstancedMesh (one per geometry × material), created once per canvas, shared geometry/material;
  zone switches only re-plan instance slots. Riverside trees were already InstancedMesh (MFW-27).

## 2. Automated proxy (Playwright, Chromium headless + SwiftShader; not a phone)
<!-- automated:start -->
| Metric | Before (per-mesh) | After (batch) |
|---|---|---|
| HIGH: draw calls, zone of 1 krathong | TBD | TBD |
| HIGH: draw calls, zone of 80 krathongs | TBD | TBD |
| HIGH: triangles, zone of 80 | TBD | TBD |
| HIGH: tier at the end of the check | TBD | TBD |
| LOW: draw calls, zone of 1 / zone of 80 (24 rendered, MFW-25 cap) | TBD | TBD |
| LOW: geometries / textures / programs — baseline → after 20 switches | TBD | TBD |
| LOW: JS heap after GC — baseline → after 20 switches (MiB) | TBD | TBD |
| LOW: tier at the end | TBD | TBD |
| Soak (LOW): delta geometries / textures / programs / calls | TBD | TBD |
<!-- automated:end -->
Commands: before = commit "<sha>" with PERF_AUDIT_RECORD_ONLY=1; after = PR head. Date, machine: <fill>.

## 3. Resource and dispose audit (code)
| Resource | Created in | Lifetime | Freed by |
|---|---|---|---|
| Krathong part geometries + materials | `krathongAssets.ts` `createKrathongAssets` | one per canvas | `KrathongAssetsProvider` unmount |
| River batch InstancedMesh ×17 (instance buffers) | `riverKrathongBatch.ts` `createKrathongBatchMeshes` | one set per canvas | `RiverKrathongBatch` unmount → `disposeKrathongBatch` |
| Environment part geometry + material | `InstancedPart` | one per part per canvas | `InstancedPart` effect cleanup |
| Water / bank ribbon geometries | `RiverEnvironment` `useRibbonGeometry` | one per canvas | effect cleanup |
| Water / bank / pier materials, pier box geometry | JSX in `RiverEnvironment` | one per canvas | R3F auto-dispose on unmount |
| Highlight ring geometry + material | JSX in `TargetHighlight` | per selection | R3F auto-dispose on unmount |
| Renderer, WebGL context, shadow map | R3F `<Canvas>` | per canvas-mode visit | R3F root unmount (`dispose` + `forceContextLoss`) |
| Per zone switch | — | nothing is created | — |
Checked with: `rg -n "new \w*(Geometry|Material|Texture)\b|<\w+(Geometry|Material) " src` (list any new hit here).

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
- <fill: e.g. draw calls before/after, whether memory stayed flat, anything unexpected>
```
`docs/follow-ups.md`: delete the row that starts `| MFW-24 | Medium (gate) | RiverFlow renders ~20 meshes per krathong` (fixed here). Add a row at the
top of the table:
`| MFW-34 | — | On-device soak (docs/perf/MFW-34.md §4): run on the private-test phones and fill the device table; decide the MEDIUM/LOW river caps (MFW-25 OQ 7) from the numbers. | owner · re-test on device |`.
Change no other row.

## Tests

Everything runs under `pnpm test` without network or database. Node-only tests start with `// @vitest-environment node`.

### Step 13 — existing tests to adapt (meaning unchanged; only the selectors that looked inside a per-item `KrathongModel`)

`src/components/canvas3d/RiverFlow.test.tsx`:
- Replace the `vi.mock("@/components/models/loyKrathong", …)` factory with one that keeps the real planner and stubs only the component:
  ```ts
  const batch = vi.hoisted(() => ({ props: null as null | { plan: { items: readonly unknown[] }; shadows: boolean },
    writeItem: vi.fn(), commit: vi.fn() }));
  vi.mock("@/components/models/loyKrathong", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/components/models/loyKrathong")>();
    const React = await import("react");
    return {
      ...actual,
      RiverKrathongBatch: (p: { plan: { items: readonly unknown[] }; shadows: boolean; ref?: React.Ref<unknown> }) => {
        batch.props = p;
        React.useImperativeHandle(p.ref, () => ({ meshes: [], writeItem: batch.writeItem, commit: batch.commit }));
        return React.createElement("group", { name: "river-krathong-batch", "data-items": String(p.plan.items.length), "data-shadows": String(p.shadows) });
      },
    };
  });
  ```
  If `importOriginal` of the barrel fails in this environment, import the real planner by path (`@/components/models/loyKrathong/riverKrathongBatch`) inside
  the factory instead.
- In `beforeAll`, add test-only prototype stubs next to the existing `position` / `rotation` ones (delete them in `afterAll`): a `quaternion` getter that
  returns a WeakMap-cached `Quaternion`; a `matrix` getter that returns a WeakMap-cached `Matrix4`; and `updateMatrix()`, which runs
  `this.quaternion.setFromEuler(this.rotation)` and then `this.matrix.compose(this.position, this.quaternion, new Vector3().setScalar(Number(this.getAttribute("scale"))))`.
  Reset `batch.writeItem`, `batch.commit` and `batch.props` in `beforeEach`.
- Case "renders one model per valid item, scaled, skipping invalid ones" is renamed "renders one anchor per valid item, scaled, skipping invalid ones". Keep 2 `river-item-*`
  groups with `scale` = `RIVER_KRATHONG_SCALE`. Each group has `children.length === 0`. The batch has `data-items="2"`. `batch.props.plan.items[0].parts.length`
  equals `assembleKrathong(DEFAULT_KRATHONG_APPEARANCE).body.length + …centerAnchor.parts.length`. This replaces the `data-base` check.
- Case "renders nothing and stays idle without items": unchanged, plus `[name="river-krathong-batch"]` exists with `data-items="0"` (the batch is persistent).
- Case "survives a stale frame after unmount and passes shadows through": read `data-shadows` from `[name="river-krathong-batch"]` instead of the first `mesh`.
- MFW-25 case "river shadows follow the tier": read `data-shadows` from the batch stub (HIGH → `"true"`, MEDIUM/LOW → `"false"`) instead of "every `mesh`".
- Every other case (movement, bobbing, determinism, caps, pins, step-down, FALLBACK_2D) stays unchanged.

`src/components/canvas3d/index.test.tsx`: extend the stub `Canvas` so that `onCreated` also receives `gl: r3f.gl`. Here `r3f.gl` is a hoisted fake
`{ info: { memory: { geometries: 3, textures: 0 }, render: { calls: 12, triangles: 400, frame: 7 }, programs: [{}, {}] } }`. No existing assertion changes.

### `src/core/customization/krathongInstanceBuckets.test.ts` (node)
1. "17 buckets from the catalogue": `KRATHONG_INSTANCE_BUCKET_COUNT === KRATHONG_BASE_IDS.length + LEAF_FOLD_STYLE_IDS.length * LEAF_COLOR_PALETTE.length +
   FLOWER_KINDS.length + CANDLE_COLOR_PALETTE.length + 2`, which today is 17. Keys are unique. Every `geometryKey` is in `KRATHONG_GEOMETRY_KEYS`, every
   `materialKey` is in `KRATHONG_MATERIAL_KEYS`, and the array is frozen.
2. "every assembled part has a bucket within its per-krathong maximum": over all 54 combinations of base × fold × leafColor × candleColor and the flower
   patterns `[all null]`, `[all marigold]`, `[all orchid]`, `[all lotus]`, `[marigold, null, orchid, null, lotus, null, marigold, null]`
   (`RIM_SOCKET_COUNT` long), `assembleKrathong` gives parts whose `krathongInstanceBucketIndex` is never `null`, and the per-bucket counts are
   ≤ `maxPerKrathong`.
3. "maxima are reached": the leaf bucket gets `KRATHONG_LEAF_COUNT` from one krathong, a flower bucket gets `RIM_SOCKET_COUNT` from an all-same-kind
   krathong, incense gets `KRATHONG_INCENSE_MODEL.count`, and every other bucket gets 1.
4. `krathongInstanceBucketIndex("candle", "flame")` → `null`.

### `src/core/customization/uprightConstraint.test.ts` (modify: add cases)
1. A pure yaw `q = setFromAxisAngle(Y, 1.2)` → `writeYawTwistQuaternion(q, out)` equals `q` within 1e-12.
2. `q = R_y(0.7) · R_x(0.05) · R_z(0.04)` (`Euler(0.05, 0.7, 0.04, "YXZ")`) → `out.x === 0`, `out.z === 0`, and it is unit length. Rotating `(0, 1, 0)` by
   `out` gives `(0, 1, 0)`.
3. A 180° tilt about X (`(1, 0, 0, 0)`) → identity.
4. Aliasing: `writeYawTwistQuaternion(q, q)` gives the same result as with a fresh `out`.

### `src/components/models/loyKrathong/riverKrathongBatch.test.ts` (jsdom default; three only)
Reference helper `referenceKrathongMatrices(appearance, itemPosition, itemEuler, worldViewYaw)`. It builds the real three tree: `worldView = new Group()`
(rotation y = `worldViewYaw`, position (1, 0, -2)) → `riverFlow = new Group()` → `item = new Group()` (position, `rotation.set(x, y, z, RIVER_ITEM_EULER_ORDER)`,
`scale.setScalar(RIVER_KRATHONG_SCALE)`) → `model = new Group()`. Under `model` it adds one `Object3D` per body part (position, rotation `[0, rotationY, 0]`,
scale) and an `anchor = new Object3D()` at `centerAnchor.localPosition` with one `Object3D` per anchor part. Call `worldView.updateMatrixWorld(true)`. Then
`computeUprightLocalQuaternion(model.getWorldQuaternion(new Quaternion()), anchor.quaternion)` and `worldView.updateMatrixWorld(true)` again. Each
part's expected matrix is `new Matrix4().copy(riverFlow.matrixWorld).invert().multiply(part.matrixWorld)`, in assembly order (body, then anchor parts).
1. "matches the per-mesh model": for `DEFAULT_KRATHONG_APPEARANCE`, an all-null-flowers appearance and `perfSoakAppearance(5)`, with item Euler
   `(0.05, 1.3, -0.04)`, position `(2.5, -0.2, 0.7)` and world-view yaw `0.8`, plan `[appearance]`. Call
   `writeKrathongItemInstances(plan, 0, item.matrix, item.quaternion, sink)`, where the sink stores `matrix.clone()` per `(bucket, slot)`. Each planned part's
   stored matrix equals the reference within 1e-9 elementwise. (This file is a test, so decimals are fine here.)
2. "upright parts stay upright": the candle's stored matrix maps `(0, 1, 0)` (direction, `transformDirection`) to `(0, 1, 0)` within 1e-9, even with tilt.
3. "slots are unique and dense": a plan of 80 `perfSoakAppearance(k)` items. For each bucket, the slots are exactly `0 … bucketCounts[b] − 1`, used once.
   `slotItems[b][slot]` is the owning item. `itemIndexForInstance` agrees, and gives `null` for `-1`, `1.5`, `bucketCounts[b]` and an unknown bucket.
4. "caps at maxItems": 85 appearances → `items.length === 80`. `planKrathongInstances([], 80)` has all-zero counts. `maxItems = -1` or `2.5` →
   `RangeError`.
5. "commit uploads only the used range": `createKrathongBatchMeshes(createKrathongAssets())` → for bucket 0 with a plan count of 3, after
   `applyKrathongBatchPlan` + `commitKrathongBatch`: `instanceMatrix.updateRanges` equals `[{ start: 0, count: 48 }]`, `version` increased, and `boundingSphere`
   is `null`. A bucket with count 0 is untouched and `visible === false`.
6. "meshes share the krathong assets and have fixed capacity": `mesh.geometry === assets.geometry(bucket.geometryKey)`,
   `mesh.material === assets.material(bucket.materialKey)`, `instanceMatrix.count === bucket.maxPerKrathong * ZONE_ITEM_CAP`, `frustumCulled === false`,
   `instanceMatrix.usage === DynamicDrawUsage`, `userData[KRATHONG_BATCH_BUCKET_USERDATA_KEY] === index`, and `name === "river-batch-" + index`.
7. "shadows mirror KrathongModel": `applyKrathongBatchShadows(meshes, true)` → all `castShadow`, `receiveShadow` only on base buckets.
   `applyKrathongBatchShadows(meshes, false)` → none.

### `src/components/models/loyKrathong/RiverKrathongBatch.test.tsx` (jsdom)
Render inside the real `KrathongAssetsProvider`. Capture the handle with `createRef<RiverKrathongBatchHandle>()`. Spy on
`InstancedMesh.prototype.dispose`, `BufferGeometry.prototype.dispose` and `Material.prototype.dispose`. `vi.restoreAllMocks()` in `afterEach`.
1. "one persistent mesh per bucket": `handle.meshes.length === KRATHONG_INSTANCE_BUCKET_COUNT`. The batch group `[name="river-krathong-batch"]` has that many
   `primitive` children.
2. "counts follow the plan": plan with 3 default krathongs → each bucket's `mesh.count === plan.bucketCounts[i]`, and `visible` iff count > 0.
3. "zone switches reuse the meshes": re-render with 10 different plans (`perfSoakAppearance` lists of length 0, 80, 1, 80, 0, …) → `handle.meshes` is
   the same array, and every element is identical (`toBe`) to the first render. The three dispose spies have 0 calls.
4. "unmount disposes the batch, never the shared assets": re-render the provider **without** the batch → the `InstancedMesh` dispose spy has exactly
   `KRATHONG_INSTANCE_BUCKET_COUNT` calls, and the geometry/material spies have 0. Then unmount the provider → the geometry spy has
   `KRATHONG_GEOMETRY_KEYS.length` calls (the provider's own disposal).
5. "writeItem + commit write the planned slots": `handle.writeItem(0, m, q)` with a known matrix, then `handle.commit()` → `mesh.getMatrixAt(slot)` of
   the base bucket equals `m · baseLocal` within 1e-5 (float32).
6. "shadows prop": `shadows={true}` → the base mesh has `receiveShadow` and every mesh has `castShadow`. A re-render with `false` clears them, and the
   meshes stay the same objects.

### `src/components/canvas3d/RiverFlow.test.tsx` (add cases)
1. "items are anchors, parts are one batch": 3 items → 3 empty anchors and one batch stub. `batch.props.plan.items.length === 3`. There is no
   `mesh[name="krathong-model"]`.
2. "each frame writes every rendered item, then commits once": after `r3f.frame!()`, `batch.writeItem` is called 3 times with `(i, <the anchor's matrix>,
   <the anchor's quaternion>)` for `i = 0…2`, and then `batch.commit` once. The matrix argument equals the stubbed `matrix` of anchor `i`.
3. "reduced motion: the batch receives untilted transforms": `reducedMotion` → each quaternion passed to `writeItem` has a rotated `(0, 1, 0)` equal to
   `(0, 1, 0)` within 1e-9.
4. "the batch survives an empty zone": re-render items → `[]` → items. The batch DOM node is the same (`toBe`), and `river-flow` disappears and comes back.
5. "never plans more than ZONE_ITEM_CAP": HIGH, `many(85)` → `batch.props.plan.items.length === 80`.

### `src/components/models/loyKrathong/RiverEnvironment.test.tsx` (add one case)
"riverside trees are instanced (backlog 8.2 AC1)": `instancedMesh[name="scene-tree-trunks"]` and `instancedMesh[name="scene-tree-canopies"]` exist (one
each), and `mesh[name^="scene-tree"]` has length 0.

### `src/components/canvas3d/perfProbe.test.ts` (jsdom)
1. `isPerfProbeRequested` with the cases from Step 8.
2. `readRendererSample(null, 3, null)` → `null`. A fake source maps every field. `programs: null` → 0. The result is frozen.
3. `diffRendererSamples`: numeric deltas; heap delta is `null` when either side is `null`.
4. `readJsHeapBytes({ memory: { usedJSHeapSize: 1234 } } as unknown as Performance)` → 1234. `{}` → `null`. `{ memory: { usedJSHeapSize: -1 } }` → `null`.
5. `registerPerfProbeHook`: sets `window.__MFW_PERF_PROBE__`. The cleanup removes it. A second hook registered later is **not** removed by the first
   hook's cleanup.

### `src/components/canvas3d/perfSoak.test.ts` (jsdom)
1. `buildPerfSoakZones(2, 80, T)` → 2 zones × 80 items. The 160 ids are unique. Every `parsePersistableCoord(coord).ok` and
   `parseKrathongAppearance(appearance).ok` is true. Every `lateralOffset` is in `PERF_SOAK_LATERAL_OFFSETS`. `spawnProgress` is in `(0, 1)`.
   `planKrathongInstances(zone.map(i => i.appearance)).bucketCounts` are all > 0 (all 17 buckets exercised).
2. Bad arguments (`0` zones, `81` items, `NaN` time) → `RangeError`.
3. Runner with a fake scheduler (it queues callbacks; the test runs them one by one): `zones = [A, B]`, `switches = 4` → `setItems` is called with
   `A, B, A, B, A, B` and then `null`. `sample` is called exactly twice: after the 2nd dwell (before) and after the 6th (after). `onDone` gets
   `{ switches: 4, before, after, delta }`. `onProgress` sees `1/4 … 4/4`.
4. `cancel()` mid-run → the pending timer is cancelled, `setItems(null)` and `onCancel` are called, no `onDone` follows, and `isRunning()` is false.
   `start()` while running does nothing.
5. `switches = 3` with 2 zones → `RangeError` (not a multiple).

### `src/components/canvas3d/PerfProbePanel.test.tsx` (jsdom, fake timers)
1. It renders `aside[data-testid="perf-probe"]`. After `PERF_PROBE_SAMPLE_INTERVAL_MS` it shows the fake renderer's numbers in `data-calls` etc. With
   `rendererRef.current = null` it shows `n/a` and no `data-calls`.
2. `window.__MFW_PERF_PROBE__.sample()` returns the current sample. Unmount removes the hook.
3. The soak button shows only when `soakEnabled`. Click → `onSoakItems` is called with 80 items. Advance the timers by
   `(PERF_SOAK_ZONE_COUNT + PERF_SOAK_SWITCHES) * PERF_SOAK_DWELL_MS` → `data-soak-status="done"`, `onSoakItems` was last called with `null`, and
   `data-soak-result` parses to an object with `switches === PERF_SOAK_SWITCHES`.
4. A re-render with `soakEnabled={false}` mid-run → `onSoakItems(null)`, status `idle`. Unmount mid-run → `onSoakItems(null)` and no timer left
   (`vi.getTimerCount()` is 0 after the unmount).

### `src/components/canvas3d/index.test.tsx` (add cases; reset `window.history.replaceState(null, "", "/")` in `afterEach`)
1. "perf probe is off by default": HIGH, WORLD_EXPLORE → no `[data-testid="perf-probe"]`.
2. "perf probe with ?perfProbe=1": `replaceState(null, "", "/?perfProbe=1")` before render → the panel exists, it is **not** inside the viewport
   `<section>`, and `window.__MFW_PERF_PROBE__.sample()` gives `{ geometries: 3, calls: 12, programs: 2, … }` from the stub `gl`. FALLBACK_2D with the flag →
   no panel and no canvas.
3. "soak button only in WORLD_EXPLORE": with the flag, CUSTOMIZE → no "Run zone-switch soak" button; WORLD_EXPLORE → the button exists.
4. "river krathongs render through one persistent batch": `riverItems` of 3 → 3 `river-item-*` groups, each with no `mesh` descendant, and one
   `[name="river-krathong-batch"]` with `KRATHONG_INSTANCE_BUCKET_COUNT` `primitive` children. A re-render with `riverItems={[]}` keeps the same batch node.
   The hero krathong case ("renders the builder appearance", `mesh[name^="flower_"]`) stays unchanged: the hero stays per-mesh (D5).

### `tests/unit/instancing-audit.test.ts` (node)
Use a recursive `walk(dir)` like `scene-art-constants.test.ts`.
1. "river krathongs never mount KrathongModel": `src/components/canvas3d/RiverFlow.tsx` does not match `/KrathongModel/`.
2. "no three resources created on the river / probe path": the non-test files `RiverFlow.tsx`, `RiverKrathongBatch.tsx`, `riverKrathongBatch.ts`,
   `perfProbe.ts`, `perfSoak.ts` and `PerfProbePanel.tsx` do not match `/new\s+\w*(Geometry|Material|Texture)\b/` or
   `/TextureLoader|useTexture|CanvasTexture|DataTexture/`.
3. "the per-frame writers allocate nothing": extract the source of `writeKrathongItemInstances` and `commitKrathongBatch` (from `export function <name>(`
   to the first following line that is exactly `}`). Neither matches `/\bnew\b|\.map\(|\.filter\(|\.slice\(|Array\.from|\.\.\./`. The `useFrame`
   callback body in `RiverFlow.tsx` (from `useFrame(() => {` to the matching `});`) matches none of those either.
4. "no console in the new files": the same six files plus `krathongInstanceBuckets.ts` do not match `/\bconsole\./`.
5. "perf probe stays in the 3D chunk": no non-test file under `src/` outside `src/components/canvas3d/` contains `perfProbe"`, `perfSoak"` or
   `PerfProbePanel` in an import specifier (`/from\s+["'][^"']*(perfProbe|perfSoak|PerfProbePanel)["']/`). The exception is `src/config/perfProbe.config.ts`
   itself, which is a config import target, not an importer.
6. "findings doc has the automated numbers": `docs/perf/MFW-34.md` exists and has both markers, and the text between them does not contain `TBD`.
7. Positive controls: the regexes of cases 2–3 match sample strings built from parts (for example `"n" + "ew BoxGeometry("`).

### `tests/e2e/fixtures/perfAudit.ts` (new; pure TS, no imports) and `tests/unit/perf-audit-fixtures.test.ts`
```ts
export const E2E_PERF_PROBE_QUERY = "?perfProbe=1";          // = `?${PERF_PROBE_QUERY_PARAM}=${PERF_PROBE_QUERY_VALUE}`
export const E2E_PERF_PROBE_GLOBAL = "__MFW_PERF_PROBE__";   // = PERF_PROBE_GLOBAL_NAME
export const E2E_SOAK_ZONE_COUNT = 2;                        // = PERF_SOAK_ZONE_COUNT
export const E2E_SOAK_SWITCHES = 20;                         // = PERF_SOAK_SWITCHES
export const E2E_SOAK_DWELL_MS = 1_000;                      // = PERF_SOAK_DWELL_MS
/** Test-only tolerances (lead decision, MFW-34). Do not raise them to make a run pass; report instead. */
export const E2E_ZONE_SWITCH_CYCLES = 5;                     // × 4 switches per cycle = 20 switches
export const E2E_MAX_HEAP_GROWTH_BYTES = 2 * 1_048_576;
export const E2E_SOAK_MARGIN_MS = 30_000;
export const E2E_PERF_TEST_TIMEOUT_MS = 180_000;
export const PERF_AUDIT_RECORD_ONLY_ENV = "PERF_AUDIT_RECORD_ONLY";
```
The unit test asserts each `=` comment against the `src/config/perfProbe.config.ts` value.

### `tests/e2e/perf-audit.spec.ts` (new)
Shared helpers in the file:
- `forceTier(page, memory, cores)`: the `deviceMemory` / `hardwareConcurrency` `addInitScript` from `river-environment.spec.ts`. HIGH uses `8, 8` and LOW
  uses `2, 2`.
- `routeZones(page, zoneCount, sizes)`: as in MFW-25's `zone-pagination.spec.ts`, using `makeZoneBody` from `./fixtures/zoneFixtures`.
- `walkToWorld(page)`: `page.goto("/" + E2E_PERF_PROBE_QUERY)`; then "Loy Krathong" → "ถัดไป" → "ถัดไป" → "ปล่อยกระทง"; then expect `data-flow-state="SHARED_WORLD_EXPLORE"`,
  one `canvas`, and `[data-testid="perf-probe"]` visible.
- `goToZone(page, target, expectedItems)`: while the navigator's `data-zone-id` ≠ target, click `getByRole("button", { name: /คุ้งน้ำก่อนหน้า/ })` (go lower)
  or `/คุ้งน้ำถัดไป/` (go higher) and wait for the next `data-zone-id`. Then wait for `data-zone-status="ready"` and the viewport
  `data-river-item-count=String(expectedItems)`.
- `sample(page)`: wait 3 animation frames (`page.evaluate` with nested `requestAnimationFrame`), then
  `page.evaluate((name) => (window as unknown as Record<string, { sample(): unknown } | undefined>)[name]?.sample() ?? null, E2E_PERF_PROBE_GLOBAL)`.
  Expect it to be non-null.
- `heapAfterGc(cdp)`: `await cdp.send("HeapProfiler.collectGarbage"); return (await cdp.send("Runtime.getHeapUsage")).usedSize;` with
  `cdp = await page.context().newCDPSession(page)`.
- `report(testInfo, data)`: `console.log("[perf-audit] " + testInfo.title + " " + JSON.stringify(data))`, plus
  `testInfo.attach("perf-audit.json", { body: JSON.stringify(data, null, 2), contentType: "application/json" })`.
- `const RECORD_ONLY = process.env[PERF_AUDIT_RECORD_ONLY_ENV] === "1";`. In record-only mode, every `expect` on numbers, the tier and errors is
  skipped (wrap them in `if (!RECORD_ONLY)`), but the flow steps still run and the report is printed.
- Collect `pageerror` and `console` errors as in `river-environment.spec.ts`. Each test calls `test.setTimeout(E2E_PERF_TEST_TIMEOUT_MS)` and uses
  `test.use({ hasTouch: true })`.

Tests:
1. **"HIGH: draw calls do not grow with the number of river krathongs"**: `forceTier(8, 8)`, `routeZones(page, 2, { 1: 1, 2: 80 })`, `walkToWorld`.
   `goToZone(2, 80)` → `full = sample()`. `goToZone(1, 1)` → `one = sample()`. Assert: `full.calls === one.calls`, `full.triangles > one.triangles`, the root
   still has `data-quality-tier="HIGH"`, and there are no errors. If the tier changed, fail with the message "tier changed during the audit (SwiftShader
   too slow); report it, do not raise thresholds". Report `{ tier, callsOne, callsFull, trianglesOne, trianglesFull }`.
2. **"LOW: memory stays flat across repeated zone switches"**: `forceTier(2, 2)`, `routeZones(page, 3, { 1: 1, 2: 80, 3: 80 })`, `walkToWorld`.
   Warm-up cycle: `goToZone(3, 80)`, `goToZone(2, 80)`, `goToZone(1, 1)` → `one = sample()`, `goToZone(2, 80)`, `goToZone(3, 80)` → `base = sample()`,
   `heap0 = heapAfterGc()`. Then run `E2E_ZONE_SWITCH_CYCLES` cycles of `2, 1, 2, 3`. Then `end = sample()`, `heap1 = heapAfterGc()`. Assert:
   `end.geometries === base.geometries`, `end.textures === base.textures`, `end.programs === base.programs`, `end.calls === base.calls`,
   `base.calls === one.calls` (24 rendered vs 1: same buckets), `heap1 - heap0 <= E2E_MAX_HEAP_GROWTH_BYTES`, tier still `"LOW"`, and no errors.
   Report all the numbers and `switches = 4 * E2E_ZONE_SWITCH_CYCLES`.
3. **"probe soak completes with flat counters"**: `forceTier(2, 2)`, no routes (the in-memory API gives an empty zone 1), `walkToWorld`. Click
   "Run zone-switch soak". Expect `data-soak-status="done"` within `(E2E_SOAK_ZONE_COUNT + E2E_SOAK_SWITCHES) * E2E_SOAK_DWELL_MS + E2E_SOAK_MARGIN_MS`.
   Parse `data-soak-result`. Assert: `delta.geometries === 0`, `delta.textures === 0`, `delta.programs === 0`, `delta.calls === 0`, the viewport is back to
   `data-river-item-count="0"`, and there are no errors. Report the result.

Unchanged, and they must still pass: every existing unit and e2e test, including `scene-gating.spec.ts` (no WebGL chunk on the landing page; FALLBACK_2D
renders no canvas), `flow.spec.ts` (0 buttons at `SHARED_WORLD_EXPLORE`: the probe is off without the query flag), `river-environment.spec.ts`,
`zone-pagination.spec.ts`, `scene-art-constants`, `no-raw-xyz-persistence`, `structure` and `world-zone-boundary`.

Invariant coverage:
- **A:** the soak items exist in memory only. The plan, instance matrices and samples are render-time values and are never persisted or sent.
- **B:** 3D positions still come only from `applyRiverItemTransform` on the stored coord. The batch copies them.
- **C:** the probe exposes counters only. No public or private creation field reaches it.
- **E:** this is the subject of the card: draw calls are independent of the item count, the capacity is `ZONE_ITEM_CAP`, nothing is created per zone or
  per frame, explicit dispose on unmount, and the flat-memory proxy.
- **F:** the batch has no animation of its own. Reduced motion reaches it through the item transform (RiverFlow case 3). The probe and soak have no
  animation. FALLBACK_2D renders neither the canvas nor the probe.
- **G:** not applicable.

## Do NOT

- Do not change `TIER_BUDGETS` (including MFW-25's `riverItemCap` / `riverItemCastShadow`), the FPS thresholds or `ZONE_ITEM_CAP` (Open question 3).
- Do not change `KrathongModel`, `KrathongAssetsProvider`, `krathongAssets.ts`, `UprightAnchor`, `assembleKrathong`, the krathong config, `RiverEnvironment.tsx`,
  `InstancedPart`, `prepareRiverItems`, `selectVisibleRiverItems`, `applyRiverItemTransform`, bobbing, lanes, coordinates, the camera, gestures or pan.
  `uprightConstraint.ts` gets only the additive refactor of Step 3.
- Do not instance the hero krathong (`CUSTOMIZE` / `RITUAL_RELEASE` model): it stays per-mesh (D5).
- Do not create geometry, material, texture or `InstancedMesh` per zone, per item or per frame. Do not use `frustumCulled = true` on the batch. Do not
  use `<instancedMesh>` JSX for the batch (R3F would auto-dispose it on its own schedule; the batch disposes explicitly).
- Do not put the perf panel inside the viewport `<section>`, and do not show it without `?perfProbe=1`. Do not import probe/soak code outside
  `src/components/canvas3d` (landing chunk, MFW-44). Do not send probe data anywhere (no fetch, no analytics) and do not log it in app code.
- Do not build MFW-28 features (tap, inspect, bounce, ripples) unless Step 7's "If MFW-28 merged first" applies. Do not build the 2D renderer
  (MFW-33), Find My (MFW-30) or zone transitions.
- Do not add dependencies. Do not edit `package.json`, the lockfile, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.mts`, `vitest.setup.ts`,
  `playwright.config.ts` or `next.config.ts`.
- Do not touch `.claude/**`, `scripts/**`, `.github/**`, `CLAUDE.md`, `AGENTS.md`, `docs/spec/**`, `docs/backlog*.json`, `docs/prompts/**`, `docs/plans/**`,
  `src/services/**`, `src/app/**` or `supabase/**`. The only docs you write are `docs/perf/MFW-34.md` (new) and the two-row change in `docs/follow-ups.md`.
- Do not weaken, skip or delete tests. The only allowed edits to existing test cases are the selector changes in Step 13 and the stub `gl`.
- Never commit `PERF_AUDIT_RECORD_ONLY=1` into scripts or CI. It is a manual one-off for the "before" numbers.

## Definition of done

1. Branch `feat/MFW-34-instanced-rendering-memory-cleanup-audit` from the latest `main`, **after MFW-25 is merged**.
2. Commits (conventional, key in the subject):
   - `feat(perf): hidden perf probe and zone-switch soak MFW-34`. This has Steps 1, 8–11, the e2e fixtures and spec, and the
     `docs/perf/MFW-34.md` skeleton. `RiverFlow` is still per-mesh. Run the "before" measurement on this commit:
     `PERF_AUDIT_RECORD_ONLY=1 PW_CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell pnpm exec playwright test tests/e2e/perf-audit.spec.ts`.
     Copy the `[perf-audit]` lines into the "Before" column. If the per-mesh scene drops the tier or falls back to 2D on SwiftShader, record that as
     the before result. This commit alone is not expected to pass `pnpm e2e` test 1 in normal mode.
   - `feat(perf): instance river krathong parts in one persistent batch MFW-34`. This has Steps 2–7 and 13 and the tests.
   - `docs(perf): MFW-34 before/after findings MFW-34`. This fills the "After" column from a normal `pnpm e2e` run (the `[perf-audit]` lines) and makes
     the `docs/follow-ups.md` change.
3. At the PR head, run each of these separately and get green: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and
   `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell pnpm e2e` (in this cloud container; no Supabase env in the shell).
4. Delete `playwright-report/` and `test-results/` before committing. Never commit `.next/`, `*.tsbuildinfo` or a changed `AGENTS.md`.
5. Open a ready PR against `main` titled `feat(perf): instanced river krathongs and memory audit MFW-34`. The English body has:
   - a link to MFW-34;
   - the AC checklist with the proving test for each, noting that AC2's real-device part waits for the owner run (Open question 1);
   - the before/after table copied from `docs/perf/MFW-34.md`;
   - Decisions D1–D10 and every difference from the ASSUMED INTERFACES;
   - the Open questions;
   - the test plan (the five commands and their results);
   - follow-ups (device run, MFW-25 OQ 7 caps, MFW-28 tap through `itemIndexForInstance`).
   End the PR body with the attribution lines required by CLAUDE.md / `docs/prompts/README.md`.
6. Leave the PR open for reviewer + qa + **r3f-perf-reviewer**. It is not an owner-merge card; the loop merges after review and a green `ci` check
   (subject to Open question 1).

## Interfaces this card provides

| Export | Path | Signature | Used by |
|---|---|---|---|
| `KRATHONG_INSTANCE_BUCKETS`, `KrathongInstanceBucket`, `KRATHONG_INSTANCE_BUCKET_COUNT`, `krathongInstanceBucketKey`, `krathongInstanceBucketIndex` | `@/core/customization` (server-safe) | Step 2 | MFW-33 (2D sprite batching), later festivals |
| `writeYawTwistQuaternion` | `@/core/customization/uprightConstraint` (by path) | `(source: Quaternion, out: Quaternion) => Quaternion` | any upright instanced part |
| `planKrathongInstances`, `writeKrathongItemInstances`, `itemIndexForInstance`, `createKrathongBatchMeshes`, `applyKrathongBatchPlan`, `applyKrathongBatchShadows`, `commitKrathongBatch`, `disposeKrathongBatch`, `KRATHONG_BATCH_BUCKET_USERDATA_KEY`, types `KrathongInstancePlan`, `PlannedKrathongItem`, `PlannedKrathongPart`, `KrathongInstanceSink` | `@/components/models/loyKrathong` | Step 4 | **MFW-28** (tap: `event.object.userData[KEY]` + `event.instanceId` → item index → `rendered[index].id`), MFW-23 if it previews many krathongs |
| `RiverKrathongBatch`, `RiverKrathongBatchHandle` (`meshes`, `writeItem`, `commit`), `RiverKrathongBatchProps` | `@/components/models/loyKrathong` | Step 5 | `RiverFlow`; MFW-28 (`onInstanceClick` if added) |
| River item anchors `river-item-<id>` (empty groups, world transform of each krathong) | `RiverFlow` | Object3D | **MFW-30** fly-to target, MFW-28 bounce (scale the anchor) |
| `SCENE_OBJECT_NAMES.riverKrathongBatch`, `.riverBatchMeshPrefix` | `src/components/canvas3d/sceneObjectNames.ts` | strings | tests, debugging |
| `?perfProbe=1`, `window.__MFW_PERF_PROBE__.sample()`, `PerfProbePanel`, `RendererSample`, `readRendererSample`, `diffRendererSamples`, `isPerfProbeRequested`, `registerPerfProbeHook` | `src/components/canvas3d/perfProbe.ts`, `PerfProbePanel.tsx` | Step 8/10 | later perf cards (MFW-33 2D, Christmas), owner device runs |
| `buildPerfSoakZones`, `perfSoakAppearance`, `createPerfSoakRunner` | `src/components/canvas3d/perfSoak.ts` | Step 9 | later soak tests |
| `PERF_PROBE_*`, `PERF_SOAK_*`, `BYTES_PER_MEBIBYTE` | `@/config/perfProbe.config` | constants | probe, e2e fixture check |
| e2e helpers / constants | `tests/e2e/fixtures/perfAudit.ts` | constants | later perf e2e |

## Open questions

Owner decisions only. Each one ships with the stated default, and the owner can change it later without rework.

1. **Does the merge wait for the real-phone run?** AC2 says "on a real mobile device", and only the owner can do that. Options: (a) merge on the
   automated proxy and leave the device table as "pending owner run" (follow-up row added). This is the default, in line with the 2026-11-24
   "merge once green, fix later" instruction in `docs/follow-ups.md`. (b) Keep the PR open until the owner fills `docs/perf/MFW-34.md` §4.
2. **Which phones, and what counts as a pass on a device?** This is linked to open question 20 (testers and devices), which is still open.
   Default: the owner's private-test phones, at least one iOS Safari and one Android Chrome. A pass means: zero deltas in geometries, textures and
   programs over 3 soaks, no reload or crash, and a JS heap that does not grow from run to run (where the phone shows it). Options: name specific
   devices, or set a heap or FPS number.
3. **River render caps after instancing (MFW-25 Open question 7).** MFW-25 caps the rendered river krathongs at HIGH 80 / MEDIUM 48 / LOW 24, with river
   shadows on HIGH only, as a stop-gap "until MFW-34". This card does **not** change them, because they are user-visible (how many krathongs a
   MEDIUM/LOW phone shows). With instancing, the draw calls no longer depend on the count, and only vertex and fill cost grow. Options: keep the caps;
   raise MEDIUM/LOW to 80 after the device run; or raise them only for LOW/MEDIUM devices that pass the soak.
4. **The hidden diagnostics panel in production builds.** Default: it ships in every build but appears only with `?perfProbe=1`. It shows counters
   only, with no user data, and lets the owner test any deployment from a phone. Options: allow it only on preview/staging deployments, or remove it
   after the audit.

## Decisions

- **D1 — One bucket per (geometry, material) pair, with a static catalogue (17 meshes).** This reuses MFW-19's shared assets unchanged. It needs no
  per-instance colours and no new materials, so there are no new shader variants. It keeps draw calls ≤ 17 per pass for any zone. Per-instance colour
  (`setColorAt`) would save 6 meshes, but it would need white base materials and a material change.
- **D2 — Fixed capacity per bucket = `maxPerKrathong × ZONE_ITEM_CAP`, allocated once per canvas.** A zone switch then allocates nothing on the GPU, so
  "memory stays flat" holds by construction and does not depend on the GC. The cost is 6,560 instances × 64 B ≈ 410 KiB of instance matrices on the
  CPU, plus the same on the GPU for the buckets in use. Only the used range is uploaded per frame (`addUpdateRange`). A re-sized mesh per zone would
  free and re-create GPU buffers on every switch.
- **D3 — The batch meshes are created imperatively and mounted as `<primitive>`, with explicit dispose on unmount.** R3F never disposes primitives, so
  the one disposal point is visible and testable. The shared geometry and material stay owned by `KrathongAssetsProvider`.
- **D4 — The item groups stay as empty anchors, and the batch copies their matrices each frame.** This keeps MFW-24's tested transform path
  (`applyRiverItemTransform`), the `river-item-<id>` names used by MFW-25 tests, and a real Object3D per krathong for the MFW-30 fly-to and the MFW-28
  bounce. Eighty empty groups cost no draw calls.
- **D5 — The hero krathong (customizer and release) stays per-mesh.** It is one object with constant draw calls. It needs per-part identity (names,
  part-change bounce), and its existing tests count its parts. The repeated parts that grow with participation are the river ones.
- **D6 — `frustumCulled = false` on the batch, and the bounding sphere is reset on every commit.** Moving instances would otherwise be culled by a stale
  sphere. Recomputing the sphere every frame is O(instances), while resetting it is O(1). A later raycast recomputes it lazily from the current
  matrices.
- **D7 — The upright rule is shared through `writeYawTwistQuaternion`.** The candle, flame and incense of river krathongs use the same yaw twist as
  `UprightAnchor`, so they cannot drift apart. A 1e-9 parity test against the real per-mesh tree guards it.
- **D8 — The automated proxy runs on LOW for memory and on HIGH, briefly, for draw calls.** LOW has no FPS step-down (owner thresholds), so the canvas is
  never re-created mid-run. A re-creation would reset the counters. HIGH is the only tier that renders all 80, so the draw-call check runs there and
  finishes within the FPS warm-up + sustain window. The JS heap is measured after a CDP-forced GC, which makes it repeatable.
- **D9 — The probe is query-flag-gated, read-only and English.** It reads `renderer.info` and `performance.memory`, never creation data, so it is
  neutral for invariants A and C. It lives only in the 3D chunk. Its automation hook (`window.__MFW_PERF_PROBE__`) lets Playwright sample right after
  a frame instead of polling a timer. The soak gives the owner a one-tap device test that needs no Supabase data, because no create path exists yet
  (MFW-45 / MFW-23).
- **D10 — Diagnostic and test numbers are lead values, not product numbers:** `PERF_PROBE_SAMPLE_INTERVAL_MS = 500`, `PERF_SOAK_ZONE_COUNT = 2`,
  `PERF_SOAK_SWITCHES = 20`, `PERF_SOAK_DWELL_MS = 1000`, `PERF_SOAK_LATERAL_OFFSETS = [-0.3, 0, 0.3]` (in `src/config/perfProbe.config.ts`);
  `E2E_ZONE_SWITCH_CYCLES = 5`, `E2E_MAX_HEAP_GROWTH_BYTES = 2 MiB`, `E2E_SOAK_MARGIN_MS = 30 s`, `E2E_PERF_TEST_TIMEOUT_MS = 180 s` (in
  `tests/e2e/fixtures/perfAudit.ts`). The 2 MiB tolerance is above post-GC noise and far below a leak of one plan per switch (≈ 0.3 MB × 20).

## Out of scope

Tap/inspect/bounce/ripples (MFW-28, except the adaptation in Step 7 if it merged first), Find My UI (MFW-30), release (MFW-23), the 2D renderer
(MFW-33), changing tier caps or budgets (Open question 3), instancing the hero krathong, per-instance colours, LOD, GPU timer queries, real-device
automation, any API, DB or Supabase change, and Christmas.

## Risks

- **MFW-25 lands with different names.** `visible`, `castShadow`, `pinnedIds` and `data-visible-cap` in `RiverFlow`, `visibleRiverItems` in
  `SceneViewport`, the navigator copy and `makeZoneBody` are ASSUMED INTERFACES. Adapt to `main` and list the differences.
- **MFW-28 may land first** and attach tap or bounce to per-item meshes that no longer exist. Step 7 gives the migration. The reviewer must check that
  a tap on a river krathong still selects it.
- **SwiftShader speed.** If the HIGH check steps the tier down before both samples are taken, test 1 fails with an explicit message. Report it; do not
  raise thresholds or loosen `calls` equality. The "before" run may fall back to 2D on SwiftShader. That is a valid before finding, not a failure.
- **Heap tolerance flakiness.** A forced GC makes the heap repeatable in practice. If test 2 flakes on the heap only, report the numbers in the PR;
  do not raise `E2E_MAX_HEAP_GROWTH_BYTES` silently.
- **StrictMode in development** runs the effect cleanups twice, so the batch meshes may be disposed and then reused. three re-uploads disposed buffers
  on the next render, which is the same pattern and the same accepted risk as `InstancedPart` / the MFW-19 follow-up. Production is unaffected.
- **Per-frame upload cost.** A full zone uploads up to 80 × 22 × 64 B ≈ 110 KiB per frame while krathongs drift. This is expected and small, but the
  device run should note FPS on LOW (`docs/follow-ups.md` "all 3D" row).
- **Device memory is not directly observable** on iOS without a Mac. The renderer counters and crash/reload observations are the minimum evidence.
  The heap is optional (Open question 2).
