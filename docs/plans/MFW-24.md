# MFW-24 [5.2] Deterministic spline river flow — implementation spec

> Hand-off spec for one card. It is the source of truth for the implementer and the reviewer. If this file and
> `docs/backlog.json` / `docs/spec/open-questions.md` disagree, those files win; say so in the PR.
> Branch: `feat/MFW-24-deterministic-spline-river-flow` · Jira: MFW-24 · Epic: MFW-22 (Loop 5)
> Labels: `loy-krathong`, `coordinates` · Extra reviewer: **r3f-perf-reviewer** (the diff touches `src/components/canvas3d/**`,
> `src/core/world/**` and `src/core/fallback2d/**`). Not a privacy/db card, so it is merged after review and the `ci` gate.

## Summary

This card makes the shared river move. It fills in the Loy Krathong **river lanes**: three spline curves inside the
water channel that MFW-27 draws. They are stored in the export `LOY_KRATHONG_RIVER_LANES`, which MFW-27 creates with
a one-lane placeholder and whose values this card owns. MFW-23 (release), MFW-30 (Find My) and MFW-33 (2D) read the
same lanes through one shared lane set.

The card adds **allocation-free** per-frame converters (parametric → 3D pose, parametric → 2D canvas) next to the
existing MFW-8 converters. It adds a pure, time-deterministic **procedural bobbing** function, which is off under
reduced motion. It adds an R3F `RiverFlow` component that moves every krathong it is given along its lane, computed
only from the krathong's `SplinePathCoord`, its `createdAt` and the wall clock. It also adds a pure query,
`getRiverItemPositionAt(item, lanes, now)` (3D) / `getRiverItemCanvasPositionAt(…)` (2D), that "Find My Krathong"
(MFW-30) will call.

No data source exists yet (GET /api/creations is MFW-12, zone loading is MFW-25). The scene therefore gets an optional
`riverItems` prop that defaults to empty, and production shows no river krathongs until MFW-25 passes items in.

## Prerequisites

| Card | State | What this card uses |
|---|---|---|
| MFW-8 [1.2] unified coordinate converters | merged (`main` 35057a8) | `src/core/coordinates/SplinePathCoord.ts`: `SplinePathCoord`, `RiverLaneDefinition`, `RiverLane`, `createRiverLane`, `currentProgress`, `splineProgressToWorld`, `splineCoordToWorld`, `locateOnLane`, `splineCoordFromLocation`; `validateCoord.ts`: `parsePersistableCoord`, `isPersistableCoord`; `types.ts`: `WorldVec3`, `WorldXZ`; `src/core/fallback2d/riverTopDown.ts`: `computeLaneBoundsXZ`, `createTopDownProjection`, `worldToCanvas`, `splineCoordToCanvas`, `canvasToSplineLocation`, `CanvasPoint`, `CanvasViewport`, `TopDownProjection`; fixtures `src/core/coordinates/__fixtures__/riverLanes.ts` (`TOLERANCE`, `PROGRESS_SAMPLES`, `LATERAL_SAMPLES`, `VIEWPORTS`, `circularDistance`, `STRAIGHT_LANE_DEF`, `S_LANE_DEF`, `LOOP_LANE_DEF`) |
| MFW-15/16/17/44 [3.1–3.4] scene | merged | `src/components/canvas3d/index.tsx`: `SceneViewport`, internal `ToyNightScene` (the panned/rotated world `<group>`), `<Canvas frameloop="demand">`, `useDeviceStore` reads of `reducedMotion` / `qualityTier`; the stub-R3F test harness `src/components/canvas3d/index.test.tsx` |
| MFW-9 [1.3] | merged | `useDeviceStore` (`reducedMotion`, `qualityTier`), read only through `SceneViewport` |
| **MFW-19 [4.1] krathong assembler** | **NOT merged** (plan `docs/plans/MFW-19.md`) | **ASSUMED INTERFACE (from MFW-19 plan):** `KrathongModel` (`React.memo`, props `{ appearance: KrathongAppearance; shadows: boolean }`) and `KrathongAssetsProvider` from `@/components/models/loyKrathong`; `type KrathongAppearance` and `DEFAULT_KRATHONG_APPEARANCE` from `@/core/customization`. MFW-19 Step 18 wraps everything inside `<Canvas>` in `<KrathongAssetsProvider>`. `KrathongModel` keeps the candle world-upright (`UprightAnchor`), so bobbing tilt cannot tip it. 4.1 is a backlog blocker of 5.2 (`blockedBy: ["1.2","3.1","4.1"]`): **if MFW-19 is not on `main`, stop and report it.** |
| **MFW-27 [6.1] environment** | **NOT merged** (plan `docs/plans/MFW-27.md`; planned to be implemented **before** this card) | **ASSUMED INTERFACE (from MFW-27 plan, Step 5 and §10):** `src/config/events/loyKrathong.river.config.ts` exports `RIVER_WATER_SURFACE_Y = -0.24`, `LOY_KRATHONG_RIVER_CHANNEL = { controlPoints: RIVER_CENTERLINE, width: 3.2 }` (private `RIVER_CENTERLINE` = `(-12,0,0.6) (-6,0,-0.3) (0,0,0) (6,0,0.4) (12,0,-0.5)`), and `LOY_KRATHONG_RIVER_LANES: readonly RiverLaneDefinition[]` (placeholder: one lane, `laneId 0`, width 2.4), with the comment "MFW-24 owns these values and keeps this name/type". MFW-27's `src/components/models/loyKrathong/riverLayout.test.ts` guards the lanes ("lanes stay inside the channel", "pier stops before the lanes", "release point is on a lane", "solid props never hide a lane in the default view"). Other things used: `SCENE_OBJECT_NAMES.worldView` (`"scene-world-view"`, the panned group in `ToyNightScene`) from `src/components/canvas3d/sceneObjectNames.ts`; `src/core/world/index.ts` already contains `export * from "./riverEnvironment";`; `tests/unit/scene-art-constants.test.ts` fails on any hex colour or decimal literal (comments too) in non-test files under `src/components/canvas3d/**` and `src/components/models/**`. **This card works in either merge order:** Step 1 has an "MFW-27 merged" path (expected) and a "not merged" fallback. |

Note: the old prompt `docs/prompts/MFW-24.md` says MFW-23 [5.1] must be merged first. That is wrong: in
`docs/backlog.json`, 5.1 is blocked by 5.2, so MFW-23 waits for this card. The backlog wins.

Facts checked in this repo (2026-11-24):
- three r0.187: `Curve.getPointAt(u, target)` allocates nothing once the arc-length cache exists (`getLengths()` returns
  the cache), and `CatmullRomCurve3.getPoint` uses module-level temporaries. Only the first call per curve builds the
  cache. This card warms the cache when it builds the lane set.
- The existing private `laneFrameAt` returns two new objects, and `splineProgressToWorld` allocates one `Vector3` plus four
  result objects per call. That is fine on tap/commit but too much per frame for 80 items (MFW-8 follow-up), so this card adds `…Into` variants.
- R3F 9.8: calling `invalidate()` inside a `useFrame` callback sets `internal.frames = 2`. A `frameloop="demand"` canvas
  therefore keeps rendering while a callback keeps invalidating, and stops by itself when the callback stops.
- The lane values in Step 1 were probed with the real `createRiverLane` / `splineProgressToWorld` / `locateOnLane` against
  MFW-27's channel, pier and props, re-implementing MFW-27's riverLayout tests:
  - every lane edge is inside the channel (max channel |lateral| 0.370, limit 0.5);
  - each lane follows its channel offset within 0.0096 world units;
  - the pier tip (channel lateral +1.25) is outside every lane;
  - the release point (+0.95) lies on lane 3 (lateral ≈ 0.20, progress ≈ 0.39);
  - no house or tree projection hides a lane;
  - minimum turning radius is 11.0 (limit > width/2 = 0.375);
  - minimum neighbour centreline distance is 0.799 (limit ≥ 0.75);
  - worst parametric round trip is 2e-15 progress and 6e-16 lateral (limit 1e-9).
- FNV-1a 32-bit vectors in JS with `Math.imul`: `""` → `0x811c9dc5`, `"a"` → `0xe40c292c`, `"foobar"` → `0xbf9cf968`.

## Acceptance criteria → checks

AC text is verbatim from `docs/backlog.json` story 5.2.

1. **"River lanes as spline curves; krathongs move slowly with procedural bobbing"**
   - Lanes are `CatmullRomCurve3` splines built from `LOY_KRATHONG_RIVER_LANES`. These checks are in
     `src/config/events/loyKrathong.river.lanes.test.ts`:
     - lane ids are unique and every lane builds;
     - turning radius > width/2;
     - neighbouring lanes do not overlap;
     - every lane stays inside `LOY_KRATHONG_RIVER_CHANNEL` and follows its channel offset.
   - MFW-27's guard tests must still pass with these values: `src/components/models/loyKrathong/riverLayout.test.ts` (when MFW-27 is merged).
   - "Slowly": with the spec example `speedFactor` 0.008, progress advances `0.008` per 1000 ms and the position moves downstream
     (positive dot product with the flow tangent). Test: `src/core/world/riverFlow.test.ts` → "moves downstream slowly".
   - Bobbing is a pure function of `(nowMs, phase)`. It stays within its amplitudes, is periodic and deterministic, is exactly zero under
     reduced motion, and never moves x/z. Tests: `src/core/world/bobbing.test.ts`; `riverFlow.test.ts` → "applyRiverItemTransform".
   - The 3D component moves each given krathong every frame, and keeps the demand frame loop alive while items exist. Test:
     `src/components/canvas3d/RiverFlow.test.tsx`. The scene passes `riverItems` through. Test: `src/components/canvas3d/index.test.tsx`.
2. **"Position computed only from SplinePathCoord + current time (deterministic across clients and 2D/3D)"**
   - Two independently built lane sets ("two clients") give identical (`Object.is`) progress and world positions for the same coord,
     `createdAtMs` and `nowMs`. Test: `riverFlow.test.ts` → "deterministic across clients".
   - No history: applying the transform at t1, then t2, then t1 again gives exactly the first t1 result. Test: `riverFlow.test.ts` →
     "no accumulated state".
   - The allocation-free variants are bit-identical to the MFW-8 converters in 3D and 2D. Tests: `src/core/coordinates/splinePoseInto.test.ts`,
     `src/core/fallback2d/riverTopDownInto.test.ts`.
   - 3D and 2D agree. The 2D point equals `worldToCanvas(3D world position)`, and the canvas → lane → coord round trip returns the original
     coord within `TOLERANCE` **on the product lanes**. This is invariant B: new converter inputs need round-trip tests. Tests:
     `loyKrathong.river.lanes.test.ts`, and `riverFlow.test.ts` → "3D and 2D agree".
3. **"Current position queryable for Find My Krathong"**
   - `getRiverItemPositionAt(item, lanes, nowMs)` returns `{ laneId, progress, world, yawRad }`, or `null` for an unknown lane or invalid
     input. `getRiverItemCanvasPositionAt(…)` returns the 2D point. Test: `riverFlow.test.ts` → "Find My query", with these edge cases: at
     `createdAt`, wrap past 1, a future `createdAt`, an unknown lane, a bad coord, and NaN `createdAtMs`.
   - The query matches what the renderer draws. With reduced motion, `applyRiverItemTransform` writes exactly
     `getRiverItemPositionAt(...).world`. With bobbing on, x/z are still exactly equal, so a Find-My camera target stays valid. Test: `riverFlow.test.ts`.
   - The Find-My UI, the camera flight to the item and the cross-zone search are **MFW-30**, not this card.

## Owner decisions that apply

Quoted from `docs/spec/open-questions.md`. Do not reopen them.

- **Row 6 (MFW-8):** "speedFactor is progress (fraction of the lane, 0–1) per second; createdAt and now are Unix epoch
  milliseconds (created_at parsed to ms), so elapsed seconds = (now − createdAt) / 1000; negative or non-finite elapsed
  counts as 0 (item stays at spawnProgress). Only + − × ÷ % are used, so results are bit-identical across clients. speedFactor
  is capped at 1". → Progress comes only from the existing `currentProgress`, and the clock is `Date.now()` (epoch ms), never the
  R3F clock. `currentProgress` is not changed.
- **Row 9 (MFW-8):** "the 2D river is an orthographic top-down projection of the same 3D lane curve … (src/core/fallback2d/riverTopDown.ts);
  the inverse uses the same nearest-point search as 3D. MFW-33 builds the renderer". → This card adds only allocation-free and
  lane-set variants of that projection. There is no 2D-only lane data and no 2D renderer.
- **Row 4 (MFW-25):** "80 items per zone". → MFW-25's zone query enforces it upstream. `RiverFlow` renders exactly the items it is given (see Do NOT).
- **Row 5 (MFW-9):** tier budgets live in `TIER_BUDGETS`. → Shadows come from the existing `getSceneRenderSettings(tier).shadows`.
  This card adds no tier numbers.
- **Row 11 (MFW-15):** "@react-spring/three". → Springs stay the library for tweened transitions. Bobbing is *not* a spring: it is a
  stateless function of wall-clock time, because a spring carries velocity history and would break "same place at the same time" (D4).
- **Row 16 (MFW-36):** "build the engine loops … generically; finish Loy Krathong only as far as the private test needs". →
  `RiverLaneSet`, the pose and bob functions and `RiverFlow` are event-agnostic. Only the lane values are Loy Krathong data.

No row of `open-questions.md` names MFW-24 in "Decide in", so that file is **not** edited.

## Files

| Path | New/modify | Purpose |
|---|---|---|
| `src/config/events/loyKrathong.river.config.ts` | modify (new only in the fallback) | Replace the value of `LOY_KRATHONG_RIVER_LANES` with the 3 product lanes (PLACEHOLDER geometry); add `LOY_KRATHONG_RIVER_LANE_WIDTH`, `LOY_KRATHONG_RIVER_LANE_CHANNEL_OFFSETS` |
| `src/config/riverFlow.config.ts` | new | Render-only constants: river krathong scale, bobbing amplitudes and periods |
| `src/core/coordinates/SplinePathCoord.ts` | modify | Extract the shared frame math; add `SplinePoseOut`, `createSplinePoseOut`, `splineProgressToPoseInto`, `splineCoordToPoseInto` |
| `src/core/coordinates/riverLaneSet.ts` | new | `RiverLaneSet`, `createRiverLaneSet`, `RiverPlacementSource`, `isValidRiverPlacement` |
| `src/core/coordinates/index.ts` | modify | Also export `./riverLaneSet` |
| `src/core/fallback2d/riverTopDown.ts` | modify | Add `CanvasPointOut`, `createCanvasPointOut`, `worldToCanvasInto`, `splineCoordToCanvasInto`, `createLaneSetProjection`, `getRiverItemCanvasPositionAt` |
| `src/core/world/bobbing.ts` | new | `BobbingOut`, `createBobbingOut`, `bobbingPhaseFromId`, `writeBobbingAt` |
| `src/core/world/riverLanes.ts` | new | `getLoyKrathongRiverLanes()`, the one shared lane set |
| `src/core/world/riverFlow.ts` | new | Find-My query, item preparation, per-frame transform |
| `src/core/world/index.ts` | modify | Add three `export *` lines |
| `src/components/canvas3d/RiverFlow.tsx` | new | R3F component that moves krathongs along lanes |
| `src/components/canvas3d/index.tsx` | modify | `riverItems` prop on `SceneViewport`; `<RiverFlow>` inside the world-view group |
| `src/config/events/loyKrathong.river.lanes.test.ts` | new | Lane layout sanity, containment, round trips on the product lanes |
| `src/config/riverFlow.config.test.ts` | new | Constant sanity |
| `src/core/coordinates/splinePoseInto.test.ts` | new | Bit-identity and out-param tests (3D) |
| `src/core/coordinates/riverLaneSet.test.ts` | new | Lane set and validity tests |
| `src/core/fallback2d/riverTopDownInto.test.ts` | new | Bit-identity tests (2D) and lane-set helpers |
| `src/core/world/bobbing.test.ts` | new | Bobbing, including the reduced-motion branch |
| `src/core/world/riverFlow.test.ts` | new | AC1–AC3 core tests |
| `src/components/canvas3d/RiverFlow.test.tsx` | new | Component tests (stubbed R3F) |
| `src/components/canvas3d/index.test.tsx` | modify | Add two cases; existing cases unchanged |

## Implementation steps

Conventions for every file:
- TypeScript strict, English comments, no `any`.
- No inline numbers in logic except `0`, `1`, `2` and `Math.PI` in the formulas written below.
- Freeze exported constant arrays and objects with `Object.freeze`.
- **No allocation inside any per-frame path.** That rules out: `new`, object or array literals, closures, `map`/`filter`,
  spread, and string building.
- In `src/components/canvas3d/**` and `src/components/models/**` (non-test files), write no hex colour and no decimal literal,
  **including in comments**, because MFW-27's static scan would fail. Write card ids as `MFW-24`, never story numbers like `5.2`.

### Step 1 — lanes in `src/config/events/loyKrathong.river.config.ts`

First run `git log --oneline main -- src/config/events/loyKrathong.river.config.ts`.

**1a. MFW-27 merged (expected path).** The file exists. Edit only the lane part:
- Keep the export name `LOY_KRATHONG_RIVER_LANES` and its type `readonly RiverLaneDefinition[]`.
- Replace its placeholder value (one lane, `laneId 0`) with the block below.
- Update its doc comment as shown.
- Do not change any other export in the file: channel, water/bank heights, pier, parts, environment, palette.
- Place the two new constants directly above `LOY_KRATHONG_RIVER_LANES`, so they are initialised before it.

```ts
/** Width of every lane (world units); lateralOffset ±0.5 ↔ ±width/2. PLACEHOLDER (spec silent). */
export const LOY_KRATHONG_RIVER_LANE_WIDTH = 0.75;

/**
 * Signed distance (world units, + = right of the flow = near bank) of each lane's centreline from the channel centreline,
 * in lane order. The control points below were generated from LOY_KRATHONG_RIVER_CHANNEL: 13 arc-length samples
 * (progress k/12) of the channel centreline, offset along its right vector by this distance, rounded to 3 decimals,
 * with y = RIVER_WATER_SURFACE_Y. If the channel changes, regenerate them the same way. PLACEHOLDER (spec silent).
 */
export const LOY_KRATHONG_RIVER_LANE_CHANNEL_OFFSETS = Object.freeze([-0.8, 0, 0.8] as const);

/**
 * River lanes (spec §4.1 "laneId: หมายเลขร่องน้ำ (เช่น 1, 2, 3)"). Values owned by MFW-24; name/type shared with MFW-27.
 * Flow runs from the first control point to the last (+x): progress 0 = upstream end, 1 = downstream end.
 * Must stay inside LOY_KRATHONG_RIVER_CHANNEL, off the pier tip, and keep turning radius > width / 2
 * (riverLayout.test.ts, loyKrathong.river.lanes.test.ts). PLACEHOLDER geometry (spec silent).
 */
export const LOY_KRATHONG_RIVER_LANES: readonly RiverLaneDefinition[] = Object.freeze([
  riverLane(1, [
    [-12.119, -0.191], [-10.159, -0.529], [-8.15, -0.876], [-6.069, -1.098], [-3.977, -1.092], [-1.939, -0.949],
    [0.05, -0.798], [2.092, -0.621], [4.071, -0.438], [5.994, -0.4], [7.912, -0.599], [9.869, -0.941], [11.881, -1.291],
  ]),
  riverLane(2, [
    [-12, 0.6], [-10.015, 0.258], [-8.03, -0.085], [-6.028, -0.299], [-4.014, -0.293], [-2.005, -0.152],
    [0.003, 0], [2.01, 0.175], [4.016, 0.36], [6.029, 0.399], [8.031, 0.192], [10.016, -0.154], [12, -0.5],
  ]),
  riverLane(3, [
    [-11.881, 1.391], [-9.871, 1.045], [-7.911, 0.706], [-5.987, 0.5], [-4.052, 0.507], [-2.071, 0.645],
    [-0.043, 0.799], [1.928, 0.971], [3.961, 1.158], [6.063, 1.198], [8.151, 0.983], [10.162, 0.632], [12.119, 0.291],
  ]),
]);
```

Each pair is `[x, z]`. Add this hoisted `function` declaration at the end of the file. It runs during module init, so
`RIVER_WATER_SURFACE_Y` and `LOY_KRATHONG_RIVER_LANE_WIDTH` must be declared above `LOY_KRATHONG_RIVER_LANES`:

```ts
/** Lane centreline at the water surface: the krathong model origin (its base centre) floats on the water. */
function riverLane(laneId: number, xz: readonly (readonly [number, number])[]): RiverLaneDefinition {
  return Object.freeze({
    laneId,
    width: LOY_KRATHONG_RIVER_LANE_WIDTH,
    controlPoints: Object.freeze(xz.map(([x, z]) => Object.freeze({ x, y: RIVER_WATER_SURFACE_Y, z }))),
  });
}
```

`closed` is omitted, so the lanes are open. Lane 3 is on the near bank, the pier side. MFW-27's release point lies on it.
Lane ids 1–3 follow the spec example. MFW-27's channel curve uses id `RIVER_CHANNEL_CURVE_ID = 0` internally, and that id
is never matched against a coord, so there is no clash.

If MFW-27's `riverLayout.test.ts` (or any MFW-27 test) hard-codes the old placeholder (for example `laneId 0` or width 2.4), change only
that expectation to read from `LOY_KRATHONG_RIVER_LANES`, and say so in the PR. Do not weaken its geometric checks.

**1b. MFW-27 not merged (fallback).** Create `src/config/events/loyKrathong.river.config.ts` containing **only**:
- `import type { RiverLaneDefinition, WorldVec3 } from "@/core/coordinates";`
- `RIVER_WATER_SURFACE_Y`, the private `RIVER_CENTERLINE` and `LOY_KRATHONG_RIVER_CHANNEL`, copied **verbatim** (same names, values
  and doc comments) from `docs/plans/MFW-27.md` Step 5;
- the block from 1a.

MFW-27 then adds its remaining exports to the same file. Its §2 check (`rg "RiverLaneDefinition\[\]"`) finds these lanes and keeps
them, so there is one definition in either order. Mention this in the PR.

In both paths, do **not** add the lanes to `loyKrathongConfig` (it uses `satisfies FestivalEventConfig`) or to `src/config/events/index.ts`.

### Step 2 — `src/config/riverFlow.config.ts` (new)

These constants are render-only and event-agnostic. Every value is **PLACEHOLDER (spec silent)**; the owner tunes them (Open question 4).

```ts
/** Uniform scale of a river krathong. MFW-19's widest base is about 2.4 units, so 0.3 → about 0.72 < lane width 0.75. */
export const RIVER_KRATHONG_SCALE = 0.3;
/** Procedural bobbing (spec §6.5 Task 5.2 "ลอยโคลงเคลงเบาๆ"). Heave in world units, tilt in radians, periods in ms. */
export const RIVER_BOB_HEAVE_AMPLITUDE = 0.02;
export const RIVER_BOB_HEAVE_PERIOD_MS = 2_600;
export const RIVER_BOB_PITCH_AMPLITUDE_RAD = 0.05;
export const RIVER_BOB_PITCH_PERIOD_MS = 3_400;
export const RIVER_BOB_ROLL_AMPLITUDE_RAD = 0.04;
export const RIVER_BOB_ROLL_PERIOD_MS = 4_100;
```

Constant table (all PLACEHOLDER, spec silent):

| Constant | Value | File |
|---|---|---|
| `LOY_KRATHONG_RIVER_LANE_WIDTH` | `0.75` | `src/config/events/loyKrathong.river.config.ts` |
| `LOY_KRATHONG_RIVER_LANE_CHANNEL_OFFSETS` | `[-0.8, 0, 0.8]` | same |
| `LOY_KRATHONG_RIVER_LANES` | 3 lanes, ids 1–3, the control points in Step 1 | same |
| `RIVER_KRATHONG_SCALE` | `0.3` | `src/config/riverFlow.config.ts` |
| `RIVER_BOB_HEAVE_AMPLITUDE` / `_PERIOD_MS` | `0.02` / `2600` | same |
| `RIVER_BOB_PITCH_AMPLITUDE_RAD` / `_PERIOD_MS` | `0.05` / `3400` | same |
| `RIVER_BOB_ROLL_AMPLITUDE_RAD` / `_PERIOD_MS` | `0.04` / `4100` | same |

Reused, not owned: `RIVER_WATER_SURFACE_Y = -0.24` and `LOY_KRATHONG_RIVER_CHANNEL` (MFW-27).

Technical constants (lead decisions, not tunables):
- `RIVER_ITEM_EULER_ORDER = "YXZ"` in `src/core/world/riverFlow.ts`.
- In `src/core/world/bobbing.ts`, module-level and not exported: `FNV1A_32_OFFSET_BASIS = 0x811c9dc5`, `FNV1A_32_PRIME = 0x01000193`,
  `UINT32_RANGE = 2 ** 32` and `TWO_PI = 2 * Math.PI`.

### Step 3 — `src/core/coordinates/SplinePathCoord.ts` (modify)

Goal: an allocation-free pose writer whose numbers are **bit-identical** to `splineProgressToWorld`. To get that, both run the
same arithmetic in the same order. Keep every existing export, signature and behaviour. The existing tests must pass untouched.

1. Below the existing `scratchA` / `scratchB`, add:
   ```ts
   const scratchCenter = new Vector3();
   /** Written by writeLaneFrame: unit horizontal right of the flow (y is always 0). */
   const frameRight = { x: 0, z: 0 };
   ```
2. Replace the private `laneFrameAt` with these two private functions. The arithmetic is exactly today's:
   ```ts
   /** Leaves the unit tangent in scratchB and the unit right vector in frameRight. Allocation-free. */
   function writeLaneFrame(lane: RiverLane, u: number): void {
     let a = u - TANGENT_DELTA;
     let b = u + TANGENT_DELTA;
     if (lane.closed) {
       a = wrap01(a);
       b = wrap01(b);
     } else {
       a = Math.max(0, a);
       b = Math.min(1, b);
     }
     lane.curve.getPointAt(a, scratchA);
     lane.curve.getPointAt(b, scratchB);
     scratchB.sub(scratchA).normalize();
     const h = Math.hypot(scratchB.x, scratchB.z);
     if (h < HORIZONTAL_TANGENT_EPSILON) throw new Error("lane tangent is vertical");
     frameRight.x = -scratchB.z / h;
     frameRight.z = scratchB.x / h;
   }

   function laneFrameAt(lane: RiverLane, u: number): LaneFrame {
     writeLaneFrame(lane, u);
     return {
       tangent: { x: scratchB.x, y: scratchB.y, z: scratchB.z },
       right: { x: frameRight.x, y: 0, z: frameRight.z },
     };
   }
   ```
3. Add these private helpers, and use them in `splineProgressToWorld` in place of its inline `u` / `lat` expressions (same expressions):
   ```ts
   function laneParam(lane: RiverLane, progress: number): number {
     return lane.closed ? wrap01(progress) : progress >= 0 && progress <= 1 ? progress : wrap01(progress);
   }
   function clampLateral(lateralOffset: number): number {
     return Math.min(0.5, Math.max(-0.5, lateralOffset)); // defensive clamp, rendering only
   }
   ```
4. Add the new exports after `splineCoordToWorld`:
   ```ts
   /** Mutable out-parameter for per-frame use. Derived at render time, NEVER persisted (invariant A). */
   export interface SplinePoseOut {
     x: number;
     y: number;
     z: number;
     /** Same as SplineWorldPlacement.yawRad. */
     yawRad: number;
   }

   export function createSplinePoseOut(): SplinePoseOut {
     return { x: 0, y: 0, z: 0, yawRad: 0 };
   }

   /**
    * Allocation-free twin of splineProgressToWorld: writes position and yaw into `out` and returns `out`.
    * Bit-identical to splineProgressToWorld(lane, progress, lateralOffset).position / .yawRad.
    * Not re-entrant (module scratch vectors).
    */
   export function splineProgressToPoseInto(
     lane: RiverLane,
     progress: number,
     lateralOffset: number,
     out: SplinePoseOut,
   ): SplinePoseOut {
     if (!Number.isFinite(progress) || !Number.isFinite(lateralOffset)) {
       throw new RangeError("progress and lateralOffset must be finite");
     }
     const u = laneParam(lane, progress);
     const lat = clampLateral(lateralOffset);
     lane.curve.getPointAt(u, scratchCenter);
     writeLaneFrame(lane, u);
     const d = lat * lane.width;
     out.x = scratchCenter.x + frameRight.x * d;
     out.y = scratchCenter.y;
     out.z = scratchCenter.z + frameRight.z * d;
     out.yawRad = Math.atan2(scratchB.x, scratchB.z);
     return out;
   }

   /** Allocation-free twin of splineCoordToWorld (same laneId check, same currentProgress). */
   export function splineCoordToPoseInto(
     coord: SplinePathCoord,
     lane: RiverLane,
     createdAtMs: number,
     nowMs: number,
     out: SplinePoseOut,
   ): SplinePoseOut {
     if (coord.laneId !== lane.laneId) throw new RangeError("coord.laneId does not match lane");
     return splineProgressToPoseInto(lane, currentProgress(coord, createdAtMs, nowMs), coord.lateralOffset, out);
   }
   ```
   `scratchCenter` must be **separate** from `scratchA` / `scratchB`, because `writeLaneFrame` overwrites those two.
   Change nothing else in this file: `locateOnLane`, `currentProgress`, `spawnProgressFromCurrent`, `createRiverLane` and
   `splineCoordFromLocation` stay as they are, apart from using the shared `laneFrameAt`.

### Step 4 — `src/core/coordinates/riverLaneSet.ts` (new) and the barrel

```ts
import { createRiverLane, type RiverLane, type RiverLaneDefinition, type SplinePathCoord } from "./SplinePathCoord";
import { parsePersistableCoord } from "./validateCoord";

/** Lanes of one river scene, looked up by laneId. Built once; immutable. */
export interface RiverLaneSet {
  readonly lanes: readonly RiverLane[]; // in definition order
  get(laneId: number): RiverLane | undefined;
}

/** What positions a river item: the stored coord plus the row's created_at as epoch ms (open question 6). */
export interface RiverPlacementSource {
  readonly coord: SplinePathCoord;
  readonly createdAtMs: number;
}

export function createRiverLaneSet(defs: readonly RiverLaneDefinition[]): RiverLaneSet;
export function isValidRiverPlacement(item: RiverPlacementSource): boolean;
```

Behaviour of `createRiverLaneSet`:
- `defs.length === 0` → `throw new RangeError("at least one lane definition is required")`.
- For each def, in order:
  - `const lane = createRiverLane(def)`. It throws `RangeError` on a bad def; let that propagate.
  - If the `laneId` was seen before → `throw new RangeError(\`duplicate laneId: ${def.laneId}\`)`.
  - Call `lane.curve.getLengths()` once, which warms the arc-length cache so the first per-frame `getPointAt` does not allocate.
  - Add the lane to a `Map<number, RiverLane>` and to an array.
- Return `Object.freeze({ lanes: Object.freeze(array), get: (laneId: number) => map.get(laneId) })`. Lookups use the `Map`, never an object index.

`isValidRiverPlacement` is the single validity rule shared by render, Find My and 2D:

```ts
export function isValidRiverPlacement(item: RiverPlacementSource): boolean {
  if (typeof item !== "object" || item === null) return false;
  if (!Number.isFinite(item.createdAtMs)) return false;
  const parsed = parsePersistableCoord(item.coord);
  return parsed.ok && parsed.coord.mode === "SPLINE_PATH";
}
```

There is no import cycle: neither `validateCoord.ts` nor `SplinePathCoord.ts` imports `riverLaneSet.ts`.
In `src/core/coordinates/index.ts`, add `export * from "./riverLaneSet";` after the `SplinePathCoord` line.

### Step 5 — `src/core/fallback2d/riverTopDown.ts` (modify — add only; change nothing existing)

```ts
import {
  isValidRiverPlacement, splineCoordToPoseInto,
  type RiverLaneSet, type RiverPlacementSource, type SplinePoseOut,
} from "@/core/coordinates";

/** Mutable out-parameter for per-frame 2D drawing (MFW-33). Derived, NEVER persisted. */
export interface CanvasPointOut {
  x: number;
  y: number;
}
export function createCanvasPointOut(): CanvasPointOut; // { x: 0, y: 0 }

/** Allocation-free twin of worldToCanvas; bit-identical (same expression order). */
export function worldToCanvasInto(point: WorldXZ, projection: TopDownProjection, out: CanvasPointOut): CanvasPointOut {
  out.x = projection.offsetX + (point.x - projection.bounds.minX) * projection.scale;
  out.y = projection.offsetY + (point.z - projection.bounds.minZ) * projection.scale;
  return out;
}

/** Allocation-free twin of splineCoordToCanvas; bit-identical. `scratchPose` is caller-owned. */
export function splineCoordToCanvasInto(
  coord: SplinePathCoord, lane: RiverLane, createdAtMs: number, nowMs: number,
  projection: TopDownProjection, out: CanvasPointOut, scratchPose: SplinePoseOut,
): CanvasPointOut {
  splineCoordToPoseInto(coord, lane, createdAtMs, nowMs, scratchPose);
  return worldToCanvasInto(scratchPose, projection, out);
}

/** 2D projection fitted to a whole lane set (same bounds rule as computeLaneBoundsXZ). */
export function createLaneSetProjection(lanes: RiverLaneSet, viewport: CanvasViewport): TopDownProjection {
  return createTopDownProjection(computeLaneBoundsXZ(lanes.lanes), viewport);
}

/** 2D twin of getRiverItemPositionAt: null for invalid input or an unknown lane. Not per-frame (allocates). */
export function getRiverItemCanvasPositionAt(
  item: RiverPlacementSource, lanes: RiverLaneSet, nowMs: number, projection: TopDownProjection,
): CanvasPoint | null {
  if (!isValidRiverPlacement(item)) return null;
  const lane = lanes.get(item.coord.laneId);
  return lane ? splineCoordToCanvas(item.coord, lane, item.createdAtMs, nowMs, projection) : null;
}
```

`fallback2d` keeps depending only on `core/coordinates` (D7).

### Step 6 — `src/core/world/bobbing.ts` (new)

```ts
import {
  RIVER_BOB_HEAVE_AMPLITUDE, RIVER_BOB_HEAVE_PERIOD_MS,
  RIVER_BOB_PITCH_AMPLITUDE_RAD, RIVER_BOB_PITCH_PERIOD_MS,
  RIVER_BOB_ROLL_AMPLITUDE_RAD, RIVER_BOB_ROLL_PERIOD_MS,
} from "@/config/riverFlow.config";

const TWO_PI = 2 * Math.PI;
const FNV1A_32_OFFSET_BASIS = 0x811c9dc5;
const FNV1A_32_PRIME = 0x01000193;
const UINT32_RANGE = 2 ** 32;

/** Mutable out-parameter. Cosmetic, render-only, NEVER persisted. */
export interface BobbingOut {
  offsetY: number;  // world units, added to the lane pose y
  pitchRad: number; // about the item's local X (after yaw)
  rollRad: number;  // about the item's local Z (after yaw)
}
export function createBobbingOut(): BobbingOut; // all 0

/**
 * Stable per-item phase in [0, 2π) from the public creation id: FNV-1a 32-bit over UTF-16 code units.
 * Same id → same phase on every client; neighbouring krathongs do not bob in lockstep.
 */
export function bobbingPhaseFromId(id: string): number {
  let h = FNV1A_32_OFFSET_BASIS;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, FNV1A_32_PRIME);
  }
  return ((h >>> 0) / UINT32_RANGE) * TWO_PI;
}

function wave(nowMs: number, periodMs: number, phaseRad: number): number {
  return Math.sin(TWO_PI * ((nowMs % periodMs) / periodMs) + phaseRad);
}

/**
 * Procedural bobbing at wall-clock time nowMs (epoch ms). Pure and stateless. Reduced motion (CLAUDE.md invariant F)
 * or non-finite input → all zeros. Writes into and returns `out`. Never affects x or z.
 */
export function writeBobbingAt(nowMs: number, phaseRad: number, reducedMotion: boolean, out: BobbingOut): BobbingOut {
  if (reducedMotion || !Number.isFinite(nowMs) || !Number.isFinite(phaseRad)) {
    out.offsetY = 0;
    out.pitchRad = 0;
    out.rollRad = 0;
    return out;
  }
  out.offsetY = RIVER_BOB_HEAVE_AMPLITUDE * wave(nowMs, RIVER_BOB_HEAVE_PERIOD_MS, phaseRad);
  out.pitchRad = RIVER_BOB_PITCH_AMPLITUDE_RAD * wave(nowMs, RIVER_BOB_PITCH_PERIOD_MS, phaseRad);
  out.rollRad = RIVER_BOB_ROLL_AMPLITUDE_RAD * wave(nowMs, RIVER_BOB_ROLL_PERIOD_MS, phaseRad);
  return out;
}
```

`nowMs % periodMs` comes first, so the `sin` argument stays small. As a result, an integer `nowMs` shifted by a whole period gives a bit-identical result.

### Step 7 — `src/core/world/riverLanes.ts` (new)

```ts
import { LOY_KRATHONG_RIVER_LANES } from "@/config/events/loyKrathong.river.config";
import { createRiverLaneSet, type RiverLaneSet } from "@/core/coordinates";

let loyKrathongLanes: RiverLaneSet | null = null;

/**
 * The ONE lane set of the Loy Krathong river, shared by 3D flow, 2D fallback, Find My and the release ritual (invariant B).
 * Built on first call, then the same object every call.
 */
export function getLoyKrathongRiverLanes(): RiverLaneSet {
  if (loyKrathongLanes === null) loyKrathongLanes = createRiverLaneSet(LOY_KRATHONG_RIVER_LANES);
  return loyKrathongLanes;
}
```

### Step 8 — `src/core/world/riverFlow.ts` (new)

```ts
import type { EulerOrder } from "three";
import {
  createSplinePoseOut, currentProgress, isValidRiverPlacement, parsePersistableCoord,
  splineCoordToPoseInto, splineProgressToWorld,
  type RiverLane, type RiverLaneSet, type RiverPlacementSource, type SplinePathCoord, type SplinePoseOut, type WorldVec3,
} from "@/core/coordinates";
import { bobbingPhaseFromId, createBobbingOut, writeBobbingAt, type BobbingOut } from "./bobbing";

/** Yaw (flow direction) about world Y first, then pitch/roll about the yawed local axes. */
export const RIVER_ITEM_EULER_ORDER: EulerOrder = "YXZ";

/** Find My Krathong query result (backlog story 5.2, AC3). Derived at call time, NEVER persisted. No bobbing. */
export interface RiverItemPosition {
  readonly laneId: number;
  readonly progress: number;  // currentProgress(coord, createdAtMs, nowMs), in [0, 1)
  readonly world: WorldVec3;  // lane centreline + lateral offset; usable as a camera fly-to target
  readonly yawRad: number;
}
export function getRiverItemPositionAt(
  item: RiverPlacementSource, lanes: RiverLaneSet, nowMs: number,
): RiverItemPosition | null;

/** A renderable item: a public id plus its placement. */
export interface RiverRenderSource extends RiverPlacementSource {
  readonly id: string;
}
export interface PreparedRiverItem<T extends RiverRenderSource = RiverRenderSource> {
  readonly id: string;
  readonly coord: SplinePathCoord; // the validator's fresh copy, never the caller's object
  readonly createdAtMs: number;
  readonly lane: RiverLane;
  readonly bobPhaseRad: number;    // bobbingPhaseFromId(id)
  readonly source: T;
}
export function prepareRiverItems<T extends RiverRenderSource>(
  items: readonly T[], lanes: RiverLaneSet,
): readonly PreparedRiverItem<T>[];

/** Structural subset of three's Object3D that the per-frame transform writes. */
export interface RiverTransformTarget {
  readonly position: { set(x: number, y: number, z: number): unknown };
  readonly rotation: { set(x: number, y: number, z: number, order?: EulerOrder): unknown };
}
export interface RiverFrameScratch {
  readonly pose: SplinePoseOut;
  readonly bob: BobbingOut;
}
export function createRiverFrameScratch(): RiverFrameScratch; // { pose: createSplinePoseOut(), bob: createBobbingOut() }

/** Per-frame and allocation-free: writes the item's pose at nowMs (+ bobbing unless reducedMotion) into target. */
export function applyRiverItemTransform(
  target: RiverTransformTarget, item: PreparedRiverItem, nowMs: number, reducedMotion: boolean, scratch: RiverFrameScratch,
): void;
```

Behaviour:
- `getRiverItemPositionAt`:
  1. If `!isValidRiverPlacement(item)` → `null`.
  2. `lane = lanes.get(item.coord.laneId)`; if it is undefined → `null`.
  3. Otherwise compute `progress = currentProgress(item.coord, item.createdAtMs, nowMs)` and
     `placement = splineProgressToWorld(lane, progress, item.coord.lateralOffset)`.
  4. Return `{ laneId: lane.laneId, progress, world: placement.position, yawRad: placement.yawRad }`.

  It allocates, so call it on tap/commit (Find My) and never in `useFrame`. A non-finite `nowMs` is handled by `currentProgress` (elapsed 0 → spawnProgress).
- `prepareRiverItems`: iterate in order and keep an item only if all of these hold:
  - `typeof item.id === "string" && item.id !== ""`;
  - the id was not seen before (the first one wins, because React keys must be unique);
  - `isValidRiverPlacement(item)`;
  - `lanes.get(coord.laneId)` exists.

  The kept `coord` is `parsePersistableCoord(item.coord).coord` (a fresh copy). Return a frozen array of frozen entries. Skip silently,
  with **no `console.*`**. This is not per-frame: call it in a `useMemo` keyed on `[items, lanes]`.
- `applyRiverItemTransform` is exactly:
  ```ts
  const pose = splineCoordToPoseInto(item.coord, item.lane, item.createdAtMs, nowMs, scratch.pose);
  const bob = writeBobbingAt(nowMs, item.bobPhaseRad, reducedMotion, scratch.bob);
  target.position.set(pose.x, pose.y + bob.offsetY, pose.z);
  target.rotation.set(bob.pitchRad, pose.yawRad, bob.rollRad, RIVER_ITEM_EULER_ORDER);
  ```

### Step 9 — `src/core/world/index.ts` (modify)

Keep the existing lines: the doc comment, and MFW-27's `export * from "./riverEnvironment";` if MFW-27 is merged. Add:

```ts
export * from "./bobbing";
export * from "./riverLanes";
export * from "./riverFlow";
```

If the file still contains `export {};` (fallback), replace that line with these three. The barrel pulls in three (via
`@/core/coordinates`). Only the lazily loaded 3D chunk and tests may import it as a value. Do **not** value-import it from
`src/components/ui/**` or `src/app/**`.

### Step 10 — `src/components/canvas3d/RiverFlow.tsx` (new)

```tsx
"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Group } from "three";
import { KrathongModel } from "@/components/models/loyKrathong";
import { RIVER_KRATHONG_SCALE } from "@/config/riverFlow.config";
import type { RiverLaneSet, SplinePathCoord } from "@/core/coordinates";
import type { KrathongAppearance } from "@/core/customization";
import { applyRiverItemTransform, createRiverFrameScratch, prepareRiverItems } from "@/core/world";

/** One krathong on the shared river. Public data only (invariant C): no owner token, hash or private wish. */
export interface RiverFlowItem {
  readonly id: string;
  readonly coord: SplinePathCoord;
  readonly createdAtMs: number; // creations_public.created_at parsed to epoch ms
  readonly appearance: KrathongAppearance;
}

export interface RiverFlowProps {
  readonly items: readonly RiverFlowItem[];
  readonly lanes: RiverLaneSet;
  readonly shadows: boolean;
  readonly reducedMotion: boolean;
  /** Wall clock in epoch ms; default Date.now. Injectable for tests and a later server-time correction. */
  readonly now?: () => number;
}

export function RiverFlow({ items, lanes, shadows, reducedMotion, now = Date.now }: RiverFlowProps) {
  const invalidate = useThree((state) => state.invalidate);
  const prepared = useMemo(() => prepareRiverItems(items, lanes), [items, lanes]);
  const groups = useRef(new Map<string, Group>());
  const scratch = useRef(createRiverFrameScratch());

  useEffect(() => {
    if (prepared.length > 0) invalidate(); // start the demand loop when items appear
  }, [prepared, invalidate]);

  useFrame(() => {
    if (prepared.length === 0) return;
    const nowMs = now();
    for (let i = 0; i < prepared.length; i++) {
      const item = prepared[i];
      const group = groups.current.get(item.id);
      if (group) applyRiverItemTransform(group, item, nowMs, reducedMotion, scratch.current);
    }
    invalidate(); // keep the frameloop="demand" canvas rendering while krathongs drift
  });

  if (prepared.length === 0) return null;
  return (
    <group name="river-flow">
      {prepared.map((item) => (
        <group
          key={item.id}
          name={`river-item-${item.id}`}
          scale={RIVER_KRATHONG_SCALE}
          ref={(node: Group | null) => {
            if (!node) return;
            groups.current.set(item.id, node);
            return () => {
              groups.current.delete(item.id);
            };
          }}
        >
          <KrathongModel appearance={item.source.appearance} shadows={shadows} />
        </group>
      ))}
    </group>
  );
}
```

Rules:
- All hooks run before the early `return null`, as shown.
- The `useFrame` callback must allocate nothing. It may only do an indexed `for` over `prepared`, `Map.get`, and the allocation-free
  `applyRiverItemTransform`. Use `Date.now()` (a number), not `new Date()`. No React state updates in the frame.
- React 19 ref-callback cleanup (the returned function) removes a group from the map on unmount or key change. Ref callbacks run on
  commit, not per frame.
- `RiverFlow` creates no geometry, material or texture. Parts come from MFW-19's shared `KrathongAssetsProvider`, so there is nothing to
  dispose here (invariant E). R3F removes the groups on unmount.
- There is exactly one `useFrame` per `RiverFlow`, not one per item.
- This file must contain no decimal literal and no hex colour, comments included (MFW-27 static scan).
- If `KrathongModel`'s real props differ from the ASSUMED INTERFACE, adapt this one call and say so in the PR.

### Step 11 — `src/components/canvas3d/index.tsx` (modify)

Minimal edits only:
1. Imports: `import { RiverFlow, type RiverFlowItem } from "./RiverFlow";` and `import { getLoyKrathongRiverLanes } from "@/core/world";`.
2. Add `export const NO_RIVER_ITEMS: readonly RiverFlowItem[] = Object.freeze([]);` at module level. The default then has a stable identity,
   and `prepareRiverItems` does not re-run on every render.
3. `ToyNightSceneProps` gains `reducedMotion: boolean;` and `riverItems: readonly RiverFlowItem[];`.
4. In `ToyNightScene`, render
   `<RiverFlow items={riverItems} lanes={getLoyKrathongRiverLanes()} shadows={shadows} reducedMotion={reducedMotion} />`
   as the **last child of the world-view group**:
   - MFW-27 merged: the `<group name={SCENE_OBJECT_NAMES.worldView} …>`, after `<RiverEnvironment …/>` and the krathong group.
   - Fallback: the existing `<group position={[worldOffset…]} rotation={[0, worldRotation, 0]}>`, after the lamp mesh.

   That way it pans and rotates with the river. It is inside `<Canvas>`, so it is also under MFW-19's `KrathongAssetsProvider`.
5. `SceneViewport` props gain `riverItems = NO_RIVER_ITEMS` (type `riverItems?: readonly RiverFlowItem[]`). Pass
   `reducedMotion={reducedMotion}` (already read from `useDeviceStore`) and `riverItems={riverItems}` to `ToyNightScene`.
6. Change nothing else: camera, lights, pan, ring, chip, drag clamps, `frameloop="demand"` and the `gl`/`key` logic all stay as they are.
   `FlowRoot` is **not** changed: it passes no river items, and MFW-25 wires the zone data.

## Tests

All tests are vitest, with no network, no DB and no WebGL. Unless noted, the new pure tests start with `// @vitest-environment node`.
- For exact equality where `-0` and `0` may differ, use the local helper `const same = (a: number, b: number) => expect(a === b).toBe(true);`.
- For bit-identity between twin converters, use `toBe` (`Object.is`).
- `T0 = 1_700_000_000_000`.

### `src/config/events/loyKrathong.river.lanes.test.ts` (AC1, AC2, invariant B on the product lanes)
Name note: MFW-27 owns its own tests for the environment. This file only covers the lanes, so the two cards never edit the same test file.
- Ids: `LOY_KRATHONG_RIVER_LANES.map(d => d.laneId)` equals `[1, 2, 3]`. Every `width === LOY_KRATHONG_RIVER_LANE_WIDTH`. Every control
  point has `y === RIVER_WATER_SURFACE_Y`. `LOY_KRATHONG_RIVER_LANE_CHANNEL_OFFSETS.length === LOY_KRATHONG_RIVER_LANES.length`. Defs,
  point arrays and points are frozen.
- `createRiverLaneSet(LOY_KRATHONG_RIVER_LANES)` does not throw.
- Turning radius: sample each lane at `TURN_SAMPLES = 2000` arc-length steps with `getPointAt`. Take the xz circumradius of every 3
  consecutive points, `R = |ab|·|bc|·|ca| / (4·area)`, with area 0 → Infinity. Assert `min R > lane.width / 2`.
- Separation: for every lane pair, sample `SEP_SAMPLES = 400` points on each lane and assert the minimum xz distance ≥ `(wA + wB) / 2`.
- Inside the channel: `channel = createRiverLane({ laneId: 0, controlPoints: LOY_KRATHONG_RIVER_CHANNEL.controlPoints, width: LOY_KRATHONG_RIVER_CHANNEL.width })`.
  For each lane, at 64 progress samples take both edges, `splineProgressToWorld(lane, p, ±0.5).position`. Each edge must satisfy
  `|locateOnLane(channel, edge).lateralOffset| ≤ 0.5 + 1e-9`. This is the same rule as MFW-27's test, kept here so the guard exists
  in either merge order.
- Follows its offset: for lane `i`, at 200 samples of its centreline,
  `|locateOnLane(channel, p).lateralOffset × channel.width − LOY_KRATHONG_RIVER_LANE_CHANNEL_OFFSETS[i]| ≤ LANE_OFFSET_TOLERANCE` (test-local `0.02`; measured 0.0096).
- Round trip parametric ↔ 3D: for each lane × `PROGRESS_SAMPLES` × `LATERAL_SAMPLES`, `locateOnLane(lane, splineProgressToWorld(lane, p, l).position)`
  is back within `TOLERANCE.progress` / `TOLERANCE.lateral`.
- Round trip parametric ↔ 2D ↔ coord: for both `VIEWPORTS` with `proj = createLaneSetProjection(set, vp)`, run the chain from the existing
  riverTopDown test: `splineCoordToCanvas` → `canvasToSplineLocation` → `splineCoordFromLocation`. Spawn and lateral must come back within
  `TOLERANCE`, and `isPersistableCoord(back)` must be true.
- Server-safety: read `loyKrathong.river.config.ts` with `node:fs`. It must contain no `from "three"`, no `@react-three` and no `from "react"`.

### `src/config/riverFlow.config.test.ts`
- Every amplitude is finite and ≥ 0.
- Every `*_PERIOD_MS` is a positive integer (needed for the exact periodicity test).
- `RIVER_KRATHONG_SCALE` is finite and > 0.

### `src/core/coordinates/splinePoseInto.test.ts` (AC2; MFW-8 follow-up)
- For each fixture lane (straight, S, loop) × `PROGRESS_SAMPLES` × `LATERAL_SAMPLES`, plus progress `1.25` and `-0.75`:
  - `splineProgressToPoseInto(lane, p, l, out)` x/y/z `toBe` `splineProgressToWorld(lane, p, l).position` x/y/z;
  - `yawRad` `toBe` `.yawRad`.
- Returns the same `out` object it was given. One `out` reused over 50 calls holds the values of the last call.
- Interleaving: `splineProgressToPoseInto(A…)`, then `splineProgressToWorld(B…)`, then `splineProgressToPoseInto(A…)` again → the third
  call gives the same numbers as the first.
- `NaN` progress or `Infinity` lateral → `RangeError`. Lateral `0.7` gives the same pose as `0.5`.
- `splineCoordToPoseInto` `toBe` `splineCoordToWorld` for spawn `{0, 0.37, 0.999}` × speed `{0, 0.008}` × dt `{0, 12_345, 30 days}`.
  A mismatched `laneId` → `RangeError`.

### `src/core/coordinates/riverLaneSet.test.ts`
- `createRiverLaneSet([STRAIGHT_LANE_DEF, S_LANE_DEF, LOOP_LANE_DEF])`:
  - lane ids are `[1, 2, 3]`;
  - `get(2)?.laneId === 2`;
  - `get(99)`, `get(-1)` and `get(1.5)` are `undefined`;
  - the set and `set.lanes` are frozen.
- `[]` → `RangeError`. Two defs with laneId 1 → `RangeError` whose message contains `duplicate laneId: 1`. Width 0 → `RangeError`.
- `isValidRiverPlacement`:
  - a valid item → true;
  - coord with an extra key `x` → false;
  - a `PLANAR_ZONE` coord → false;
  - `lateralOffset 0.7` → false;
  - `speedFactor 2` → false;
  - `createdAtMs` `NaN` / `Infinity` → false;
  - a `null` item → false.

### `src/core/fallback2d/riverTopDownInto.test.ts` (AC2, invariant B)
- For both `VIEWPORTS` × the three fixture lanes:
  - `worldToCanvasInto` `toBe` `worldToCanvas` per field (5 points);
  - `splineCoordToCanvasInto` `toBe` `splineCoordToCanvas` over the spawn/lateral grid at dt 12_345;
  - both return the `out` they were given.
- `createLaneSetProjection(set, vp)` deep-equals `createTopDownProjection(computeLaneBoundsXZ(set.lanes), vp)`.
- `getRiverItemCanvasPositionAt`:
  - a valid item → equals `splineCoordToCanvas`;
  - an unknown lane → `null`;
  - an invalid coord → `null`;
  - NaN `createdAtMs` → `null`.

### `src/core/world/bobbing.test.ts` (AC1, invariant F)
- Reduced motion: for `nowMs` in `[T0, T0 + 1234, T0 + 999_999]`, `writeBobbingAt(now, 1, true, out)` → all three fields `=== 0`.
- Non-finite `nowMs` (`NaN`, `Infinity`) or phase `NaN` → all zeros.
- Bounds: over 500 samples `T0 + k * 37`:
  - `|offsetY| ≤ RIVER_BOB_HEAVE_AMPLITUDE`;
  - `|pitchRad| ≤ RIVER_BOB_PITCH_AMPLITUDE_RAD`;
  - `|rollRad| ≤ RIVER_BOB_ROLL_AMPLITUDE_RAD`;
  - at least one `offsetY !== 0`.
- Periodicity: `offsetY(T0 + 500)` `toBe` `offsetY(T0 + 500 + RIVER_BOB_HEAVE_PERIOD_MS)`. Do the same for pitch and roll with their own periods.
- Determinism: the same input twice → `Object.is` equal on all fields. The function returns the passed `out`. With phase 0,
  `offsetY(T0) !== offsetY(T0 + RIVER_BOB_HEAVE_PERIOD_MS / 4)`.
- `bobbingPhaseFromId` (`toBe`):
  - `""` → `(0x811c9dc5 / 2 ** 32) * 2 * Math.PI`;
  - `"a"` → `(0xe40c292c / 2 ** 32) * 2 * Math.PI`;
  - `"foobar"` → `(0xbf9cf968 / 2 ** 32) * 2 * Math.PI`;
  - 100 ids are all in `[0, 2π)`;
  - two different ids differ, and the same id twice gives the same value.

### `src/core/world/riverFlow.test.ts` (AC1–AC3)
Fixtures:
- `lanes = getLoyKrathongRiverLanes()`;
- `item(id, coordOverrides, createdAtMs = T0)` with base coord `{ mode: "SPLINE_PATH", laneId: 2, spawnProgress: 0.25, speedFactor: 0.008, lateralOffset: 0.2 }`.

Cases:
- `getLoyKrathongRiverLanes()` returns the same object twice; its ids are `[1, 2, 3]`.
- **Deterministic across clients:** build `clientA` and `clientB` with two separate `createRiverLaneSet(LOY_KRATHONG_RIVER_LANES)` calls.
  For lanes 1–3 × spawn `{0, 0.5, 0.99}` × lateral `{-0.5, 0, 0.5}` × now `{T0, T0 + 1000, T0 + 30 days}`, the two give `toBe`-equal
  `progress`, `world.x/y/z` and `yawRad`.
- **Only coord + time:** `progress` `toBe` `currentProgress(coord, createdAtMs, now)`. `world` deep-equals `splineCoordToWorld(...).position`.
- **Moves downstream slowly:**
  - `p2.progress − p1.progress` (at `T0` and `T0 + 1000`) is close to `0.008` (12 digits);
  - `(p2.world − p1.world) · splineProgressToWorld(lane, p1.progress, lat).tangent > 0`.
- **Find My query:**
  - at `createdAt` → `progress === 0.25`;
  - spawn `0.9` at `T0 + 25_000` → progress close to `0.1` (wrap);
  - `createdAtMs = T0 + 10_000`, `now = T0` → `0.25`;
  - `laneId 99` → `null`;
  - an extra coord key `position` → `null`;
  - NaN `createdAtMs` → `null`;
  - a valid result has exactly the keys `laneId, progress, world, yawRad`.
- **3D and 2D agree:** with `proj = createLaneSetProjection(lanes, VIEWPORTS[0])`:
  - `getRiverItemCanvasPositionAt` deep-equals `worldToCanvas(getRiverItemPositionAt(...)!.world, proj)`;
  - `canvasToSplineLocation` gives back progress (circular distance) and lateral within `TOLERANCE`.
- **prepareRiverItems:**
  - it keeps order and drops each of these: an empty id; a duplicate id (the first is kept); an extra key `x`; a `CYLINDRICAL_SURFACE`
    coord; `lateralOffset 0.7`; laneId 99; NaN `createdAtMs`;
  - each kept `coord` deep-equals the input coord but is `not.toBe` it;
  - `bobPhaseRad === bobbingPhaseFromId(id)`;
  - `lane === lanes.get(laneId)`;
  - `source` `toBe` the input;
  - the result and its entries are frozen;
  - `[]` → `[]`.
- **applyRiverItemTransform** (a recording fake target, and also a real `new Object3D()`):
  - reduced motion: the position args are `same` as `world` x/y/z, and the rotation args are `[0, yawRad, 0, "YXZ"]`;
  - motion on: x/z `toBe` the reduced-motion x/z; `y === world.y + writeBobbingAt(now, phase, false, b).offsetY`; rotation x/z = that bob's pitch/roll;
  - real `Object3D`: `rotation.order === "YXZ"` and `position.x === world.x`;
  - **no accumulated state:** apply t1, t2, then t1 on one target → the third write `toBe` the first. A fresh scratch at t1 gives the same values.

### `src/components/canvas3d/RiverFlow.test.tsx` (jsdom; AC1, invariant F)
Setup:
- `const r3f = vi.hoisted(() => ({ frame: null as null | (() => void), invalidate: vi.fn() }))`.
- `vi.mock("@react-three/fiber", () => ({ useFrame: (cb: () => void) => { r3f.frame = cb; }, useThree: (sel: (s: { invalidate: () => void }) => unknown) => sel({ invalidate: r3f.invalidate }) }))`.
- `vi.mock("@/components/models/loyKrathong", async () => { const React = await import("react"); return { KrathongModel: (p: { appearance: { base: string }; shadows: boolean }) => React.createElement("mesh", { name: "krathong-model", "data-base": p.appearance.base, "data-shadows": String(p.shadows) }) }; })`.
- In `beforeAll`, define `position` / `rotation` getters on `HTMLUnknownElement.prototype`. They return a per-element real three `Vector3` /
  `Euler`, created on first access and kept in a `WeakMap`. Delete both getters in `afterAll` (the same pattern as `getWorldPosition` in `index.test.tsx`).
- `beforeEach`: `r3f.frame = null; r3f.invalidate.mockClear()`.
- Items use `DEFAULT_KRATHONG_APPEARANCE` (ASSUMED, MFW-19), `lanes = getLoyKrathongRiverLanes()`, and `now = () => NOW` with `NOW = T0 + 5000` (mutable `let`).

Cases:
- Two valid items plus one with laneId 99 → exactly `[name="river-item-a"]` and `[name="river-item-b"]`. Each contains one
  `mesh[name="krathong-model"]` whose `data-base` is the appearance base. The `scale` attribute is `String(RIVER_KRATHONG_SCALE)`.
- `items=[]` → no `[name="river-flow"]`. `r3f.frame!()` does not call `invalidate` and does not throw.
- Mounting with items → the effect called `invalidate`.
- Running the frame with `reducedMotion={false}`:
  - element `a`'s x/z equal `getRiverItemPositionAt(a, lanes, NOW).world` x/z;
  - y equals `world.y + writeBobbingAt(NOW, bobbingPhaseFromId("a"), false, out).offsetY`;
  - `invalidate` was called during the frame.
- Rerender with `reducedMotion={true}` and run the frame → `y === world.y`, `rotation.x === 0` and `rotation.z === 0`.
- `NOW += 1000` and run the frame → the new `getRiverItemPositionAt` x/z. Running twice at the same `NOW` gives an identical position
  (it depends on time, not on frame count).
- Unmount, then call the stale `r3f.frame!()` → it does not throw.
- `shadows` is passed through (`data-shadows="true"`).

### `src/components/canvas3d/index.test.tsx` (modify — add 2 cases, change none)
- "renders no river krathongs by default": `setQualityTier("HIGH")`, `render(<SceneViewport mode="WORLD_EXPLORE" />)` → `[name="river-flow"]` is absent.
- "passes river items into the world-view group": `riverItems={[validItem("a")]}` → `[name="river-item-a"]` exists inside
  `[name="scene-world-view"]` (use `SCENE_OBJECT_NAMES.worldView`). In the fallback, check that it is inside the group that contains `mesh[name="scene-water"]`.
- The stub already has a noop `useFrame` and a selector-aware `useThree`. Every existing case must still pass unchanged.

Unchanged and must still pass:
- `src/core/coordinates/SplinePathCoord.test.ts` and `src/core/fallback2d/riverTopDown.test.ts`;
- MFW-27's `riverLayout.test.ts`, `RiverEnvironment.test.tsx` and `tests/unit/scene-art-constants.test.ts`;
- `tests/unit/no-raw-xyz-persistence.test.ts`, `tests/unit/structure.test.ts` and `src/store/stores.test.ts`;
- every e2e spec. `tests/e2e/scene-gating.spec.ts` and MFW-27's `river-environment.spec.ts` are the real-WebGL smoke tests (the scene with an
  empty `RiverFlow` mounts, FALLBACK_2D renders no canvas, the landing page ships no WebGL chunk).

**No new e2e** (D8).

## Do NOT

- Do not build zone loading, pagination, the 80-item cap or new zones (MFW-25). Do not slice or cap `items` in `RiverFlow`. Do not fetch
  anything, and do not touch `src/services/**`, `src/app/api/**` or `supabase/**`.
- Do not build anything that belongs to these cards:
  - the release ritual, ripple or candle brightening (MFW-23);
  - the environment, channel, banks, pier or scene-art changes (MFW-27; in the Step 1b fallback, copy only the three listed items verbatim);
  - the Find-My UI, camera flight or cross-zone search (MFW-30);
  - the 2D renderer (MFW-33);
  - InstancedMesh batching (MFW-34).
- Do not change `LOY_KRATHONG_RIVER_CHANNEL`, `RIVER_WATER_SURFACE_Y`, the pier or any prop placement to make the lanes fit. If the lanes
  cannot satisfy MFW-27's guard tests, stop and report it.
- Do not choose `speedFactor`, `spawnProgress` or `lateralOffset` for new krathongs (MFW-23). Do not change `currentProgress`,
  `SPEED_FACTOR_MAX`, `parsePersistableCoord` or any existing converter's behaviour.
- Do not add demo or sample krathongs to the scene, `FlowRoot` or the stores.
- Never persist or send a pose, `SplinePoseOut`, `CanvasPointOut`, `BobbingOut` or any x/y/z (invariant A). `RiverFlowItem` must never gain
  `owner_token`, `owner_token_hash` or `private_wish_text` (invariant C).
- Do not use the R3F clock, `performance.now()` or the frame `delta` for positions or bobbing. Use only epoch ms from `now()`. Do not
  accumulate position across frames. Do not use a spring for bobbing.
- Do not allocate in these functions: `useFrame`, `applyRiverItemTransform`, `splineProgressToPoseInto`, `splineCoordToPoseInto`,
  `worldToCanvasInto`, `splineCoordToCanvasInto`, `writeBobbingAt`.
- Never call `locateOnLane`, `getRiverItemPositionAt` or `prepareRiverItems` per frame.
- Do not create geometries, materials or textures in `RiverFlow`. No `console.*` in new files. No decimal or hex literals in
  `src/components/canvas3d/**` / `src/components/models/**` non-test files, comments included.
- Do not value-import `@/core/world` or `RiverFlow` from `src/components/ui/**` or `src/app/**`.
- Do not change `package.json`, the lockfile, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.mts`, `playwright.config.ts` or
  `next.config.ts`. Add no dependency.
- Do not touch these: `.claude/**`, `scripts/**`, `.github/**`, `CLAUDE.md`, `AGENTS.md`, `docs/spec/**` (incl. `open-questions.md`),
  `docs/backlog*.json`, `docs/prompts/**`, `docs/plans/**`, `src/core/coordinates/__fixtures__/**`, `src/store/**`, `src/components/ui/**`.
- Do not weaken, skip or edit existing test cases. The one exception: a hard-coded placeholder-lane expectation in an MFW-27 test, as described in Step 1a.

## Definition of done

- Run each command separately, and all must be green: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and
  `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell pnpm e2e`. That browser path is for this cloud container; locally, plain `pnpm e2e`.
- Every AC above has its listed tests.
- Delete `playwright-report/` and `test-results/` before committing. Never commit `.next/` or `*.tsbuildinfo`. Leave `AGENTS.md` as it is on `main`.
- Branch `feat/MFW-24-deterministic-spline-river-flow` from the latest `main`, after MFW-19 (and normally MFW-27) are merged.
  Use conventional commit(s) with the key, e.g. `feat(core): deterministic spline river flow MFW-24`.
- Open a ready PR against `main` with the English title = the commit subject. The body must include:
  - a link to MFW-24;
  - the AC checklist with the proving file/test for each;
  - Decisions D1–D9;
  - every PLACEHOLDER constant (Step 2 table);
  - which Step 1 path was taken (1a or 1b);
  - the Open questions below;
  - the test plan with the five command results;
  - follow-ups: MFW-25 passes zone items and enforces the cap; MFW-23 releases onto lane 3 at MFW-27's release point; MFW-30 calls the
    Find-My query; MFW-33 uses the `…Into` helpers; MFW-34 instancing; server-time correction for client clock skew.
- Leave the PR open for reviewer + qa + **r3f-perf-reviewer**. The loop merges after the `ci` check is SUCCESS.

## Interfaces this card provides

| Export | Path | Signature | Used by |
|---|---|---|---|
| `LOY_KRATHONG_RIVER_LANES` (values; the name/type are MFW-27's), `LOY_KRATHONG_RIVER_LANE_WIDTH`, `LOY_KRATHONG_RIVER_LANE_CHANNEL_OFFSETS` | `@/config/events/loyKrathong.river.config` | `readonly RiverLaneDefinition[]`, `number`, `readonly [-0.8, 0, 0.8]` (server-safe data) | MFW-27 guard tests, MFW-23 |
| `RIVER_KRATHONG_SCALE`, `RIVER_BOB_*` | `@/config/riverFlow.config` | numbers | MFW-23 (a released krathong joins the river at this scale), MFW-34 |
| `RiverLaneSet`, `createRiverLaneSet` | `@/core/coordinates` | `(defs: readonly RiverLaneDefinition[]) => { lanes; get(laneId) }` | all river cards |
| `RiverPlacementSource`, `isValidRiverPlacement` | `@/core/coordinates` | `{ coord: SplinePathCoord; createdAtMs: number }`, `(item) => boolean` | MFW-25 mapper, MFW-30 |
| `SplinePoseOut`, `createSplinePoseOut`, `splineProgressToPoseInto`, `splineCoordToPoseInto` | `@/core/coordinates` | `(lane, progress, lateral, out) => out`, `(coord, lane, createdAtMs, nowMs, out) => out` | MFW-23 (drift-out), MFW-34 |
| `CanvasPointOut`, `createCanvasPointOut`, `worldToCanvasInto`, `splineCoordToCanvasInto`, `createLaneSetProjection`, `getRiverItemCanvasPositionAt` | `@/core/fallback2d` | see Step 5 | MFW-33 (2D river, per frame), MFW-30 (2D Find My) |
| `getLoyKrathongRiverLanes` | `@/core/world` | `() => RiverLaneSet` (singleton) | MFW-23 (`locateOnLane` on the lane holding `LOY_KRATHONG_RIVER_LAYOUT.pier.releasePoint`, then `splineCoordFromLocation`), MFW-25, MFW-30, MFW-33 |
| `getRiverItemPositionAt`, `RiverItemPosition` | `@/core/world` | `(item, lanes, nowMs) => { laneId; progress; world: WorldVec3; yawRad } \| null` | **MFW-30 Find My**: `world` is a valid `CameraTargetPosition` for `createCameraController().flyTo` |
| `prepareRiverItems`, `PreparedRiverItem`, `RiverRenderSource`, `applyRiverItemTransform`, `RiverTransformTarget`, `createRiverFrameScratch`, `RIVER_ITEM_EULER_ORDER` | `@/core/world` | see Step 8 | MFW-34 (instancing can apply it to a dummy `Object3D` and then `setMatrixAt`) |
| `bobbingPhaseFromId`, `writeBobbingAt`, `BobbingOut`, `createBobbingOut` | `@/core/world` | see Step 6 | MFW-33 (optional), MFW-23 |
| `RiverFlow`, `RiverFlowItem`, `RiverFlowProps` | `@/components/canvas3d/RiverFlow` | `RiverFlow({ items, lanes, shadows, reducedMotion, now? })`; item `{ id; coord; createdAtMs; appearance }` | MFW-25 (maps GET rows with `createdAtMs = Date.parse(created_at)`) |
| `SceneViewport` prop `riverItems?: readonly RiverFlowItem[]`, `NO_RIVER_ITEMS` | `@/components/canvas3d` | defaults to empty | MFW-25 / FlowRoot wiring |

## Open questions

These are owner decisions only. The card ships the PLACEHOLDER shown, and the owner can confirm or replace it later by editing config only (no rework).

1. **River lanes.** PLACEHOLDER: 3 lanes (ids 1–3 as in the spec's "เช่น 1, 2, 3"), each 0.75 wide, at −0.8 / 0 / +0.8 from the centre of
   MFW-27's 3.2-wide channel. Lane 3 is on the pier side. Options: accept for the private test; give a different count or width (more lanes
   means narrower lanes, or a wider channel in MFW-27); let an art pass move them. Any change must still pass the containment, pier and
   occlusion tests.
2. **What happens at the end of an open lane.** The spec formula `% 1.0` makes a krathong that reaches the downstream end reappear at the
   upstream end. Options:
   - (a) the river runs past the visible scene, so the jump is off-screen. This is the placeholder: the lanes span x ≈ ±12, and the
     current camera shows about 6 units at 320 px. Panning can still reveal it, because pan has no bounds yet (MFW-27 Q1).
   - (b) fade out near the end and fade in at the start (needs a fade length).
   - (c) closed-loop lanes.
   - (d) stop or "sink" at the end. This changes the §4.1 formula, so it is not recommended.
3. **Reduced motion and drift.** Bobbing is off under `prefers-reduced-motion`, as planned (CLAUDE.md F "bounce animations off"). Should the
   slow drift change too? Options:
   - (a) keep drifting at normal speed. This is the planned default: it is about 0.2 units/s, and everyone keeps seeing the same place.
   - (b) step positions every N seconds.
   - (c) freeze drift (then these users see different positions from everyone else).
4. **Bobbing feel.** PLACEHOLDER values: heave 0.02 units / 2.6 s, pitch 0.05 rad / 3.4 s, roll 0.04 rad / 4.1 s. Options: accept; tune; turn
   bobbing off on the LOW tier (there is no technical need, because it adds no draw calls).
5. **River krathong size and overlap.** River krathongs render at 0.3× the builder model, about 0.72 units on a 0.75-wide lane. They can overlap,
   because the spec has no collision rule and MFW-23 picks `lateralOffset`. Options: accept overlap; ask MFW-23 to spread spawn positions; add
   avoidance (a new rule that also affects determinism).

## Decisions

- **D1 — One lane definition, in MFW-27's `LOY_KRATHONG_RIVER_LANES` (same file, name and type), with values set by this card.** One shared
  set is built with `getLoyKrathongRiverLanes()`. Invariant B needs 3D, 2D, Find My and release to read the same curves. Reusing MFW-27's
  export means there are no competing definitions in either merge order. The lanes are generated from the channel centreline, so they stay
  parallel to the water MFW-27 draws.
- **D2 — Allocation-free `…Into` twins share the exact arithmetic of the MFW-8 converters (a refactored `writeLaneFrame`).** That is the only
  way to keep the per-frame renderer and the Find-My query bit-identical, which also makes `toBe` tests possible.
- **D3 — The time source is `Date.now()` epoch ms, injectable as `now?: () => number`.** Open question 6 fixes epoch ms. The R3F clock is
  per-page and would differ between clients. Injection keeps tests deterministic and allows a later server-time offset without rework.
- **D4 — Bobbing is a stateless sine of wall-clock time with a per-id FNV-1a phase, not a react-spring.** It must be time-deterministic, and
  a spring is history-dependent. Hashing the public id spreads the phases without a stored field (§5 has none). Bobbing never moves x/z.
  `Math.sin` may differ in the last ulp between JS engines; that is fine for a ±0.02 cosmetic offset. `progress` stays bit-identical
  (only + − × ÷ %).
- **D5 — Euler order `YXZ`.** Yaw follows the flow in world space, and pitch/roll tilt about the krathong's own axes. MFW-19's `UprightAnchor`
  keeps the candle vertical.
- **D6 — `frameloop="demand"` stays.** `RiverFlow` invalidates from its effect and from inside its frame callback while it has items. The
  canvas renders continuously only while something drifts, and returns to on-demand rendering by itself (MFW-44 behaviour kept).
- **D7 — The validity rule is `isValidRiverPlacement` in `core/coordinates`, shared by render, Find My and 2D.** It reuses the write-path
  validator, so a malformed public row is skipped everywhere in the same way, and `fallback2d` does not depend on `core/world`.
- **D8 — No new e2e.** No user flow changes, and a production build cannot be fed river items without test-only hooks. The existing
  real-WebGL specs mount the scene with the empty `RiverFlow`, and the unit and component tests cover the movement. MFW-25 adds the first
  e2e with real river items.
- **D9 — `RiverFlow` takes items as a prop (through `SceneViewport.riverItems`), not from a store.** Zone loading and the store shape are
  MFW-25's job, so no store or `stores.test.ts` expectation changes here.

## Out of scope

- zone loading, pagination and the 80-item cap (MFW-25);
- the release ritual and spawn parameters (MFW-23);
- the environment, channel, water mesh, banks and camera/pan rework (MFW-27);
- the Find-My UI and camera flight (MFW-30);
- the 2D renderer (MFW-33);
- InstancedMesh and the memory audit (MFW-34);
- server-time sync;
- collision avoidance;
- any other festival.

## Risks

- **Client clock skew.** A device clock off by *s* seconds shows items `s × speedFactor` along the lane: at 0.008 on a lane of about 24
  units, that is about 0.2 units per second of skew. A future row (`createdAt > now`) stays at `spawnProgress`. Follow-up (MFW-25/MFW-12):
  pass a server-corrected `now` (the prop already exists).
- **Draw calls at 80 items.** Each `KrathongModel` is about 20 meshes (MFW-19), so a full zone is about 1600 draw calls. This card renders
  whatever MFW-25 passes in. Instancing is MFW-34 (backlog 8.2). Flag it in the PR so that r3f-perf-reviewer sees it was deliberate.
- **Continuous rendering while items exist** costs battery even though the motion is slow. A tier-based frame cap would need an owner number.
- **Merge conflicts** in `src/components/canvas3d/index.tsx` (MFW-19 Step 18, MFW-27 Step 13) and in `loyKrathong.river.config.ts`
  (MFW-27). The edits here are small: one prop, one child of the world-view group, and one replaced constant value. Rebase after those cards merge.
- **Lane values depend on the channel.** If MFW-27 (or a later art pass) moves `LOY_KRATHONG_RIVER_CHANNEL`, the lanes must be
  regenerated with the recipe in the doc comment. The containment and offset tests fail loudly if they are not.
- **Reviewer grep noise for invariant A.** The config has `[x, z]` pairs and the `…Out` types have `x/y/z`. These are scene geometry and
  render-time values, never on a persistence path.
- **Lane 2 passes through the origin**, where the preview krathong sits today. Nothing overlaps in production, because no river items are
  passed yet. MFW-23 moves the preview to the pier tip.
