# MFW-24 [5.2] Deterministic spline river flow — implementation spec

> Hand-off spec for one card. It is the source of truth for the implementer and the reviewer. If this file and
> `docs/backlog.json` / `docs/spec/open-questions.md` disagree, those files win; say so in the PR.
> Branch: `feat/MFW-24-deterministic-spline-river-flow` · Jira: MFW-24 · Epic: MFW-22 (Loop 5)
> Labels: `loy-krathong`, `coordinates` · Extra reviewer: **r3f-perf-reviewer** (the diff touches `src/components/canvas3d/**`,
> `src/core/world/**` and `src/core/fallback2d/**`). This is not a privacy/db card: it is merged after review and the `ci` gate.
> Revised 2026-11-24 for owner decisions 21–25.

## Summary

This card makes the shared river move.

- **Lane.** It fills in the Loy Krathong river with **one wide lane** (owner decision 21). The lane follows the centreline
  of the water channel that MFW-27 draws. It lives in the existing export `LOY_KRATHONG_RIVER_LANES`: MFW-27 creates that
  export with a placeholder, and this card owns its values.
- **Converters.** It adds **allocation-free** per-frame converters (parametric → 3D pose, parametric → 2D canvas) next to
  the MFW-8 converters.
- **Bobbing.** It adds a pure, time-deterministic **procedural bobbing** function. Bobbing is off under reduced motion, and
  drift continues (decision 23).
- **Rendering.** It adds an R3F `RiverFlow` component. It moves every krathong along the lane, using only that krathong's
  `SplinePathCoord`, its `createdAt` and the wall clock.
- **Find My query.** It adds a pure query, `getRiverItemPositionAt(item, lanes, now)` (3D) and
  `getRiverItemCanvasPositionAt(…)` (2D), for "Find My Krathong" (MFW-30).
- **No overlap (decision 25).** Every new krathong drifts at one shared speed (`RIVER_DRIFT_SPEED_FACTOR`), so the spacing
  between krathongs never changes. This card also provides the pure, deterministic collision helpers `isSpotFree` and
  `findNearestFreeSpot`. MFW-23 calls them on release (with its bump animation), and MFW-45 calls them for the server
  re-check.

No data source exists yet: GET /api/creations is MFW-12, and zone loading is MFW-25. The scene therefore gets an optional
`riverItems` prop that defaults to empty.

## Prerequisites

| Card | State | What this card uses |
|---|---|---|
| MFW-8 [1.2] unified coordinate converters | merged (`main` 35057a8) | `src/core/coordinates/SplinePathCoord.ts`: `SplinePathCoord`, `RiverLaneDefinition`, `RiverLane`, `createRiverLane`, `currentProgress`, `splineProgressToWorld`, `splineCoordToWorld`, `locateOnLane`, `splineCoordFromLocation`; `validateCoord.ts`: `parsePersistableCoord`, `isPersistableCoord`; `types.ts`: `WorldVec3`, `WorldXZ`; `src/core/math/wrap01.ts`; `src/core/fallback2d/riverTopDown.ts`: `computeLaneBoundsXZ`, `createTopDownProjection`, `worldToCanvas`, `splineCoordToCanvas`, `canvasToSplineLocation`, `CanvasPoint`, `CanvasViewport`, `TopDownProjection`; fixtures `src/core/coordinates/__fixtures__/riverLanes.ts` (`TOLERANCE`, `PROGRESS_SAMPLES`, `LATERAL_SAMPLES`, `VIEWPORTS`, `circularDistance`, `STRAIGHT_LANE_DEF`, `S_LANE_DEF`, `LOOP_LANE_DEF`) |
| MFW-15/16/17/44 [3.1–3.4] scene | merged | `src/components/canvas3d/index.tsx`: `SceneViewport`, internal `ToyNightScene` (the panned/rotated world `<group>`), `<Canvas frameloop="demand">`, `useDeviceStore` reads of `reducedMotion` / `qualityTier`; the stub-R3F test harness `src/components/canvas3d/index.test.tsx` |
| MFW-9 [1.3] | merged | `useDeviceStore` (`reducedMotion`, `qualityTier`), read only through `SceneViewport` |
| **MFW-19 [4.1] krathong assembler** | **NOT merged** (plan `docs/plans/MFW-19.md`) | **ASSUMED INTERFACE (from MFW-19 plan):** `KrathongModel` (`React.memo`, props `{ appearance: KrathongAppearance; shadows: boolean }`) and `KrathongAssetsProvider` from `@/components/models/loyKrathong`; `type KrathongAppearance`, `DEFAULT_KRATHONG_APPEARANCE` from `@/core/customization`; art specs `KRATHONG_BASE_MODELS` (`geometry`, `scale`, `rimRadius`) and `KRATHONG_LEAF_MODELS` (`geometry`, `scale`) from `@/config/krathongModel.config` (only a test reads them, to check the collision footprint). MFW-19 Step 18 wraps everything inside `<Canvas>` in `<KrathongAssetsProvider>`. `KrathongModel` keeps the candle world-upright (`UprightAnchor`). 4.1 blocks 5.2 in the backlog (`blockedBy: ["1.2","3.1","4.1"]`): **if MFW-19 is not on `main`, stop and report it.** |
| **MFW-27 [6.1] environment** | **NOT merged** (plan `docs/plans/MFW-27.md`; planned to land **before** this card) | **ASSUMED INTERFACE (from MFW-27 plan, Step 5 and §10):** `src/config/events/loyKrathong.river.config.ts` exports `RIVER_WATER_SURFACE_Y = -0.24`; `LOY_KRATHONG_RIVER_CHANNEL = { controlPoints: RIVER_CENTERLINE, width: 3.2 }` (private `RIVER_CENTERLINE` = `(-12,0,0.6) (-6,0,-0.3) (0,0,0) (6,0,0.4) (12,0,-0.5)`); and `LOY_KRATHONG_RIVER_LANES: readonly RiverLaneDefinition[]` (placeholder: one lane, `laneId 0`, `RIVER_CENTERLINE`, width 2.4) with the comment "MFW-24 owns these values and keeps this name/type". MFW-27's `src/components/models/loyKrathong/riverLayout.test.ts` guards the lanes: "lanes stay inside the channel", "pier stops before the lanes" (pier tip at channel lateral +1.25), "release point is on a lane" (release point at +0.95), and "solid props never hide a lane in the default view". Also used: `SCENE_OBJECT_NAMES.worldView` (`"scene-world-view"`, the panned group in `ToyNightScene`) from `src/components/canvas3d/sceneObjectNames.ts`; `src/core/world/index.ts` already has `export * from "./riverEnvironment";`; `tests/unit/scene-art-constants.test.ts` fails on any hex colour or decimal literal, comments included, in non-test files under `src/components/canvas3d/**` and `src/components/models/**`. **Either merge order works:** Step 1 has an "MFW-27 merged" path (expected) and a fallback. |
| MFW-23 [5.1], MFW-45 [2.4], MFW-25 [5.3], MFW-30 [7.1] | not merged; they consume this card | They call the collision helpers, the Find My query and `RiverFlow` (see Interfaces). This card builds **none** of their code. |

Note: the old prompt `docs/prompts/MFW-24.md` says MFW-23 [5.1] must be merged first. That is wrong. In the backlog, 5.1 is
blocked by 5.2, so the backlog wins.

Facts checked in this repo (2026-11-24, scratch probes with the real `createRiverLane` / `splineProgressToWorld` / `locateOnLane`):
- three r0.187: `Curve.getPointAt(u, target)` allocates nothing once the arc-length cache exists. `CatmullRomCurve3.getPoint`
  uses module temporaries. The existing private `laneFrameAt` and `splineProgressToWorld` allocate on every call
  (MFW-8 follow-up), which is why this card adds the `…Into` variants.
- R3F 9.8: `invalidate()` inside a `useFrame` callback sets `internal.frames = 2`. A `frameloop="demand"` canvas keeps
  rendering while a callback keeps invalidating, and stops by itself afterwards.
- **The single lane** (MFW-27's channel centreline, width 2.4, y = water surface) passes MFW-27's guard rules, re-implemented in the probe:
  - lane edges lie at channel |lateral| 0.375 (the limit is 0.5);
  - the pier tip is 1.25 from the centre, which is ≥ the half-width 1.2, so it is outside the lane;
  - the release point lies inside the lane (lateral 0.396, progress 0.4);
  - no house or tree hides the lane;
  - turning radius is 13.4 (the limit is > 1.2);
  - round trips are within 7e-15 (progress) and 3e-16 (lateral).
- Lane arc length is 24.172 world units.
- **Collision layout** (decision 25), with `RIVER_KRATHONG_SCALE` 0.22, footprint radius 1.3, margin 1.1 (spacing 0.6292):
  - At the minimum parametric spacing, the world xz distance between two krathongs never drops below 0.5885 over a full lap
    and every lateral position. The required minimum is 2 × radius = 0.572.
  - Simulated releases all came from MFW-27's release point, with random gaps of 0 to 400 s and 4 seeds. One lane held
    **103–123 krathongs** before `findNearestFreeSpot` returned `null`.
  - Rejected alternative: scale 0.25 held only 79–98 at the same settings, and scale 0.3 held 53–68. Both can fall below the
    80-per-zone cap.
- FNV-1a 32-bit vectors in JS (`Math.imul`): `""` → `0x811c9dc5`, `"a"` → `0xe40c292c`, `"foobar"` → `0xbf9cf968`.

## Acceptance criteria → checks

The AC text is verbatim from `docs/backlog.json` story 5.2 (as updated 2026-11-24).

1. **"River lanes as spline curves (one single wide lane, open question 21); krathongs move slowly with procedural bobbing (bobbing off
   under reduced motion, drift continues — open question 23)"**
   - `LOY_KRATHONG_RIVER_LANES` has exactly one `CatmullRomCurve3` lane, `laneId 1`. Its xz control points are the channel
     centreline, its width is `LOY_KRATHONG_RIVER_LANE_WIDTH`, it stays inside the channel, its turning radius is > width/2,
     and round trips succeed → `src/config/events/loyKrathong.river.lanes.test.ts`. MFW-27's guard tests still pass →
     `src/components/models/loyKrathong/riverLayout.test.ts`.
   - "Slowly": at `RIVER_DRIFT_SPEED_FACTOR` (0.008 per second, the spec §4.1 example), progress advances 0.008 per 1000 ms,
     downstream → `src/core/world/riverFlow.test.ts` → "moves downstream slowly".
   - Bobbing is pure in `(nowMs, phase)`, bounded, periodic and deterministic, and never moves x/z → `src/core/world/bobbing.test.ts`.
   - Under reduced motion, bobbing is exactly zero **and the position still advances with time** → `bobbing.test.ts`,
     `riverFlow.test.ts` → "reduced motion keeps drifting", `src/components/canvas3d/RiverFlow.test.tsx` → reduced-motion cases.
   - The component moves each krathong every frame and keeps the demand loop alive → `RiverFlow.test.tsx`. The scene passes
     `riverItems` through → `src/components/canvas3d/index.test.tsx`.
2. **"Every krathong drifts at the same speed, so krathongs never overlap while drifting (open question 25); at the lane end a krathong
   reappears at the start off-screen (open question 22)"**
   - `riverCoordFromSpot` always writes `speedFactor === RIVER_DRIFT_SPEED_FACTOR` → `src/core/world/riverCollision.test.ts`.
   - Two equal-speed krathongs keep the same parametric distance for any `now`, including when one has wrapped and the other has not.
     At the minimum spacing, their world distance never goes below 2 × `RIVER_COLLISION_RADIUS` over a full lap →
     `riverCollision.test.ts` → "spacing is time-invariant", "world bodies never overlap at minimum spacing".
   - `findNearestFreeSpot` never returns an overlapping spot. It is deterministic and independent of input order, and it returns
     `null` for a full lane. A full lane holds ≥ 80 krathongs, the decision-4 cap → `riverCollision.test.ts`.
   - Wrap: progress is `% 1` (existing `currentProgress`, tested in MFW-8). The wrap happens at the lane ends x ≈ ±12. That is outside
     the default view, which shows about 6 units at 320 px. MFW-27 places the scene, and the wrap point is not re-tested here.
     `riverFlow.test.ts` → "wraps past 1".
3. **"Position computed only from SplinePathCoord + current time (deterministic across clients and 2D/3D)"**
   - Two independently built lane sets ("two clients") give `Object.is`-identical progress and world positions →
     `riverFlow.test.ts` → "deterministic across clients".
   - No history: applying t1, then t2, then t1 again gives exactly the first result → `riverFlow.test.ts` → "no accumulated state".
   - The `…Into` variants are bit-identical to the MFW-8 converters → `src/core/coordinates/splinePoseInto.test.ts`,
     `src/core/fallback2d/riverTopDownInto.test.ts`.
   - 3D and 2D agree, and the canvas → lane → coord round trip works on the product lane (invariant B) →
     `loyKrathong.river.lanes.test.ts`, `riverFlow.test.ts` → "3D and 2D agree".
4. **"Current position queryable for Find My Krathong"**
   - `getRiverItemPositionAt(item, lanes, nowMs)` returns `{ laneId, progress, world, yawRad }`, or `null`.
     `getRiverItemCanvasPositionAt(…)` returns the 2D point. Edge cases are tested → `riverFlow.test.ts` → "Find My query".
   - It matches what is drawn. With reduced motion the renderer writes exactly `world`. With bobbing, x/z stay identical →
     `riverFlow.test.ts`. The Find-My UI is **MFW-30**.

## Owner decisions that apply

Quoted from `docs/spec/open-questions.md`. Do not reopen them.

- **Row 21 (MFW-24):** "one single wide lane per river; krathongs spread across it by lateralOffset (owner, 2026-11-24)".
  → One lane. MFW-27's channel limits its width: lane edges must stay inside the channel, and the pier tip must stay outside
  the lane. The lead design is width 2.4 on the channel centreline (D1).
- **Row 22 (MFW-24):** "it reappears at the start; the jump happens off-screen (owner, 2026-11-24)". → Keep the §4.1 `% 1.0`.
  The open lane spans x ≈ ±12, past the visible scene. There is no fade.
- **Row 23 (MFW-24):** "krathongs keep drifting; only the bobbing stops (owner, 2026-11-24)". → Under `reducedMotion`, `writeBobbingAt`
  returns zeros, and positions still follow `currentProgress`.
- **Row 24 (MFW-24):** "designer's choice, values live in config (owner delegated to the lead, 2026-11-24)". → The bobbing amplitudes and
  periods and `RIVER_KRATHONG_SCALE` are named constants in `src/config/riverFlow.config.ts`, marked "lead design, owner-delegated (open
  question 24)". They are not PLACEHOLDERs.
- **Row 25 (MFW-24, MFW-23, MFW-45):** "no overlap — releasing onto another krathong collides instead. Kept deterministic (no physics, open
  question 11): every krathong drifts at the same speed so spacing never changes while drifting; on release, a spot within the collision
  radius of another krathong plays a short procedural bump and the new krathong settles in the nearest free spot, which is the coord that
  is saved; the server re-checks the spot against the zone and moves it to the nearest free spot if two releases race (owner, 2026-11-24)".
  → This card: `RIVER_DRIFT_SPEED_FACTOR`, `RIVER_COLLISION_RADIUS`, `isSpotFree`, `findNearestFreeSpot`, `riverCoordFromSpot`.
  MFW-23: the bump animation and the client call. MFW-45: the server call.
- **Row 6 (MFW-8):** "speedFactor is progress (fraction of the lane, 0–1) per second; createdAt and now are Unix epoch milliseconds …
  negative or non-finite elapsed counts as 0 … Only + − × ÷ % are used, so results are bit-identical across clients." → Progress comes
  only from `currentProgress`. The clock is `Date.now()`. `speedFactor` stays in the coord type (decision 25 fixes its value, not its existence).
- **Row 9 (MFW-8):** the 2D river is the top-down projection of the same lane curve (`riverTopDown.ts`); MFW-33 builds the renderer.
  → Only allocation-free and lane-set variants are added here.
- **Row 4 (MFW-25):** "80 items per zone". → MFW-25 enforces it upstream. One lane holds 103–123 krathongs in simulation (see Facts), so
  the cap of 80 fits. A zone also counts as full when `findNearestFreeSpot` returns `null` (D10).
- **Row 5 (MFW-9):** tier budgets live in `TIER_BUDGETS`. → Shadows come from `getSceneRenderSettings(tier).shadows`. No new tier numbers.
- **Row 11 (MFW-15):** "@react-spring/three". → Bobbing is a stateless function of wall-clock time, not a spring (D4). There is no physics.
- **Row 16 (MFW-36):** engine pieces are generic. → Lane set, pose, bobbing, collision and `RiverFlow` are event-agnostic. Only the lane
  values are Loy Krathong data.

Rows 21–25 already say "Decided in MFW-24", so `open-questions.md` is **not** edited.

## Files

| Path | New/modify | Purpose |
|---|---|---|
| `src/config/events/loyKrathong.river.config.ts` | modify (new only in the Step 1b fallback) | Replace the value of `LOY_KRATHONG_RIVER_LANES` with the one product lane; add `LOY_KRATHONG_RIVER_LANE_ID`, `LOY_KRATHONG_RIVER_LANE_WIDTH` |
| `src/config/riverFlow.config.ts` | new | Drift speed, river krathong scale, collision footprint/radius/spacing, search resolution, bobbing (server-safe data) |
| `src/core/coordinates/SplinePathCoord.ts` | modify | Extract the shared frame math; add `SplinePoseOut`, `createSplinePoseOut`, `splineProgressToPoseInto`, `splineCoordToPoseInto` |
| `src/core/coordinates/riverLaneSet.ts` | new | `RiverLaneSet`, `createRiverLaneSet`, `RiverPlacementSource`, `isValidRiverPlacement` |
| `src/core/coordinates/index.ts` | modify | Also export `./riverLaneSet` |
| `src/core/fallback2d/riverTopDown.ts` | modify | Add `CanvasPointOut`, `createCanvasPointOut`, `worldToCanvasInto`, `splineCoordToCanvasInto`, `createLaneSetProjection`, `getRiverItemCanvasPositionAt` |
| `src/core/world/bobbing.ts` | new | `BobbingOut`, `createBobbingOut`, `bobbingPhaseFromId`, `writeBobbingAt` |
| `src/core/world/riverLanes.ts` | new | `getLoyKrathongRiverLanes()`, the one shared lane set |
| `src/core/world/riverFlow.ts` | new | Find-My query, item preparation, per-frame transform |
| `src/core/world/riverCollision.ts` | new | `RiverSpot`, `riverSpotDistance`, `riverSpotLateralLimit`, `riverSpotOf`, `isSpotFree`, `findNearestFreeSpot`, `riverCoordFromSpot` |
| `src/core/world/index.ts` | modify | Add four `export *` lines |
| `src/components/canvas3d/RiverFlow.tsx` | new | R3F component that moves krathongs along the lane |
| `src/components/canvas3d/index.tsx` | modify | `riverItems` prop on `SceneViewport`; `<RiverFlow>` inside the world-view group |
| `src/config/events/loyKrathong.river.lanes.test.ts` | new | Lane sanity, containment, round trips on the product lane |
| `src/config/riverFlow.config.test.ts` | new | Constant sanity; the footprint covers the MFW-19 model |
| `src/core/coordinates/splinePoseInto.test.ts` | new | Bit-identity and out-param tests (3D) |
| `src/core/coordinates/riverLaneSet.test.ts` | new | Lane set and validity tests |
| `src/core/fallback2d/riverTopDownInto.test.ts` | new | Bit-identity tests (2D) and lane-set helpers |
| `src/core/world/bobbing.test.ts` | new | Bobbing, including the reduced-motion branch |
| `src/core/world/riverFlow.test.ts` | new | AC1, AC3, AC4 core tests |
| `src/core/world/riverCollision.test.ts` | new | AC2: equal speed, no overlap, free-spot search, full lane, capacity |
| `src/components/canvas3d/RiverFlow.test.tsx` | new | Component tests (stubbed R3F) |
| `src/components/canvas3d/index.test.tsx` | modify | Add two cases; existing cases unchanged |

## Implementation steps

Conventions for every file:

- TypeScript strict, English comments, no `any`.
- No inline numbers in logic, except `0`, `1`, `2` and `Math.PI` in the formulas written below.
- Freeze exported constant arrays and objects with `Object.freeze`.
- **No allocation on any per-frame path.** That means no `new`, no object or array literals, no closures, no `map`/`filter`,
  no spread and no string building.
- In non-test files under `src/components/canvas3d/**` and `src/components/models/**`, write no hex colour and no decimal
  literal, **comments included** (MFW-27's static scan). Write card ids as `MFW-24`, never story numbers like `5.2`.

### Step 1 — the lane in `src/config/events/loyKrathong.river.config.ts`

First run `git log --oneline main -- src/config/events/loyKrathong.river.config.ts`.

**1a. MFW-27 merged (expected path).** The file exists. Edit only the lane part:

- Keep the export name `LOY_KRATHONG_RIVER_LANES` and its type `readonly RiverLaneDefinition[]`.
- Replace its placeholder value and its doc comment with the block below.
- Put the two new constants directly above it.
- Do not change any other export: channel, water/bank heights, pier, parts, environment, palette.

```ts
/** The river's only lane id (spec §4.1 "laneId … เช่น 1"). Lead design (open question 21). */
export const LOY_KRATHONG_RIVER_LANE_ID = 1;

/**
 * Width of the single wide lane (world units); lateralOffset ±0.5 ↔ ±width/2. Lead design (open question 21): the widest
 * centred lane that keeps the pier tip (channel lateral half-width − overWaterLength = 1.25) outside the lane with a margin,
 * and stays inside LOY_KRATHONG_RIVER_CHANNEL (half-width 1.6).
 */
export const LOY_KRATHONG_RIVER_LANE_WIDTH = 2.4;

/**
 * River lanes (spec §4.1). Owner decision 21: ONE single wide lane; krathongs spread across it by lateralOffset.
 * Values owned by MFW-24; name/type shared with MFW-27. Follows the channel centreline in xz, at the water surface in y
 * (the krathong model origin, its base centre, floats on the water). Flow runs from the first control point to the last
 * (+x): progress 0 = upstream end, 1 = downstream end; the % 1 wrap happens off-screen (open question 22).
 * Guarded by riverLayout.test.ts (MFW-27) and loyKrathong.river.lanes.test.ts (MFW-24).
 */
export const LOY_KRATHONG_RIVER_LANES: readonly RiverLaneDefinition[] = Object.freeze([
  Object.freeze({
    laneId: LOY_KRATHONG_RIVER_LANE_ID,
    width: LOY_KRATHONG_RIVER_LANE_WIDTH,
    controlPoints: Object.freeze(
      RIVER_CENTERLINE.map((p) => Object.freeze({ x: p.x, y: RIVER_WATER_SURFACE_Y, z: p.z })),
    ),
  }),
]);
```

`RIVER_CENTERLINE` and `RIVER_WATER_SURFACE_Y` are declared above this block in MFW-27's file. The lane uses the same xz points
as the channel, so its centreline is exactly the channel's. A constant y offset does not change the centripetal parametrisation,
so the xz curve is identical. `closed` is omitted, so the lane is open.

If an MFW-27 test hard-codes the old placeholder (for example `laneId 0`), change only that expectation so it reads from
`LOY_KRATHONG_RIVER_LANES`, and say so in the PR. Do not weaken any geometric check.

**1b. MFW-27 not merged (fallback).** Create `src/config/events/loyKrathong.river.config.ts` with **only** these contents:

- `import type { RiverLaneDefinition, WorldVec3 } from "@/core/coordinates";`
- `RIVER_WATER_SURFACE_Y`, the private `RIVER_CENTERLINE` and `LOY_KRATHONG_RIVER_CHANNEL`, copied **verbatim** (same names, values and
  doc comments) from `docs/plans/MFW-27.md` Step 5;
- the block from 1a.

MFW-27 later adds its remaining exports to the same file. Its §2 check finds this lane and keeps it, so there is one definition in
either order. Say in the PR which path you took.

In both paths, do **not** add the lane to `loyKrathongConfig` (`satisfies FestivalEventConfig`) or to `src/config/events/index.ts`.

### Step 2 — `src/config/riverFlow.config.ts` (new)

The file holds pure data: no imports, server-safe, event-agnostic. MFW-45's server route reads the speed and collision constants.

```ts
/**
 * The ONE drift speed for every new river krathong (owner decision 25: equal speed → spacing never changes).
 * Progress (fraction of the lane) per second, open question 6. Value = the spec §4.1 example "speedFactor … เช่น 0.008".
 * SplinePathCoord keeps its speedFactor field; every write path sets it to this value.
 */
export const RIVER_DRIFT_SPEED_FACTOR = 0.008;

/** Uniform scale of a river krathong model. Lead design, owner-delegated (open question 24). */
export const RIVER_KRATHONG_SCALE = 0.22;

/**
 * Horizontal footprint radius of a krathong model at scale 1 (world units). Covers MFW-19's widest part: base radius 1.2,
 * rim radius 1.0 + leaf radius 0.28 = 1.28 (checked by riverFlow.config.test.ts). Lead design.
 */
export const KRATHONG_MODEL_FOOTPRINT_RADIUS = 1.3;

/** Collision radius of a river krathong (world units) = footprint × river scale (owner decision 25). */
export const RIVER_COLLISION_RADIUS = KRATHONG_MODEL_FOOTPRINT_RADIUS * RIVER_KRATHONG_SCALE;

/**
 * Safety factor on the parametric spacing: on a bend, points at the same arc-length gap sit closer on the inner side.
 * 1.1 keeps world distance ≥ 2 × RIVER_COLLISION_RADIUS on the product lane (riverCollision.test.ts). Lead design.
 */
export const RIVER_COLLISION_CURVATURE_MARGIN = 1.1;

/** Minimum distance between two krathong centres in the lane's (arc length, lateral) metric, world units. */
export const RIVER_MIN_CENTER_SPACING = 2 * RIVER_COLLISION_RADIUS * RIVER_COLLISION_CURVATURE_MARGIN;

/** Free-spot search grid resolution: grid step = RIVER_MIN_CENTER_SPACING / this. Lead design. */
export const RIVER_SPOT_SEARCH_STEPS_PER_SPACING = 4;

/** Procedural bobbing (spec §6.5 Task 5.2 "ลอยโคลงเคลงเบาๆ"). Lead design, owner-delegated (open question 24). */
export const RIVER_BOB_HEAVE_AMPLITUDE = 0.02; // world units
export const RIVER_BOB_HEAVE_PERIOD_MS = 2_600;
export const RIVER_BOB_PITCH_AMPLITUDE_RAD = 0.05;
export const RIVER_BOB_PITCH_PERIOD_MS = 3_400;
export const RIVER_BOB_ROLL_AMPLITUDE_RAD = 0.04;
export const RIVER_BOB_ROLL_PERIOD_MS = 4_100;
```

Constant table:

| Constant | Value | File | Source |
|---|---|---|---|
| `LOY_KRATHONG_RIVER_LANE_ID` | `1` | `loyKrathong.river.config.ts` | lead design (row 21; spec example) |
| `LOY_KRATHONG_RIVER_LANE_WIDTH` | `2.4` | same | lead design (row 21), bounded by MFW-27's channel and pier |
| `LOY_KRATHONG_RIVER_LANES` | 1 lane on the channel centreline, y = `RIVER_WATER_SURFACE_Y` | same | row 21 |
| `RIVER_DRIFT_SPEED_FACTOR` | `0.008` /s | `riverFlow.config.ts` | row 25; spec §4.1 example value |
| `RIVER_KRATHONG_SCALE` | `0.22` | same | lead design, owner-delegated (row 24) |
| `KRATHONG_MODEL_FOOTPRINT_RADIUS` | `1.3` | same | lead design (covers MFW-19 art) |
| `RIVER_COLLISION_RADIUS` | `1.3 × 0.22` = 0.286 | same | row 25 (derived) |
| `RIVER_COLLISION_CURVATURE_MARGIN` | `1.1` | same | lead design |
| `RIVER_MIN_CENTER_SPACING` | `2 × 0.286 × 1.1` = 0.6292 | same | derived |
| `RIVER_SPOT_SEARCH_STEPS_PER_SPACING` | `4` | same | lead design |
| `RIVER_BOB_HEAVE_AMPLITUDE` / `_PERIOD_MS` | `0.02` / `2600` | same | lead design, owner-delegated (row 24) |
| `RIVER_BOB_PITCH_AMPLITUDE_RAD` / `_PERIOD_MS` | `0.05` / `3400` | same | same |
| `RIVER_BOB_ROLL_AMPLITUDE_RAD` / `_PERIOD_MS` | `0.04` / `4100` | same | same |

These values come from MFW-27 and are reused, not owned here: `RIVER_WATER_SURFACE_Y = -0.24`, `LOY_KRATHONG_RIVER_CHANNEL`.

These technical constants are lead decisions, not tunables:
- `RIVER_ITEM_EULER_ORDER = "YXZ"` in `src/core/world/riverFlow.ts`.
- In `src/core/world/bobbing.ts`, module-level and not exported: `FNV1A_32_OFFSET_BASIS = 0x811c9dc5`, `FNV1A_32_PRIME = 0x01000193`,
  `UINT32_RANGE = 2 ** 32`, `TWO_PI = 2 * Math.PI`.

### Step 3 — `src/core/coordinates/SplinePathCoord.ts` (modify)

The goal is an allocation-free pose writer whose results are **bit-identical** to `splineProgressToWorld`. Both functions must
therefore do the same arithmetic in the same order. Keep every existing export, signature and behaviour. The existing tests must
pass untouched.

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
3. Add these private helpers. Use them in `splineProgressToWorld` in place of its inline `u` / `lat` expressions (same expressions):
   ```ts
   function laneParam(lane: RiverLane, progress: number): number {
     return lane.closed ? wrap01(progress) : progress >= 0 && progress <= 1 ? progress : wrap01(progress);
   }
   function clampLateral(lateralOffset: number): number {
     return Math.min(0.5, Math.max(-0.5, lateralOffset)); // defensive clamp, rendering only
   }
   ```
4. Add these exports after `splineCoordToWorld`:
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
    * Bit-identical to splineProgressToWorld(lane, progress, lateralOffset).position / .yawRad. Not re-entrant.
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
   `scratchCenter` must be **separate** from `scratchA` / `scratchB`. Change nothing else in this file.

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

/** True if the item can be placed: coord passes the write-path validator as SPLINE_PATH and createdAtMs is finite. */
export function isValidRiverPlacement(item: RiverPlacementSource): boolean {
  if (typeof item !== "object" || item === null) return false;
  if (!Number.isFinite(item.createdAtMs)) return false;
  const parsed = parsePersistableCoord(item.coord);
  return parsed.ok && parsed.coord.mode === "SPLINE_PATH";
}
```

`createRiverLaneSet` works like this:

1. If `defs.length === 0`, throw `RangeError("at least one lane definition is required")`.
2. Go through the defs in order:
   - `const lane = createRiverLane(def)`. It throws `RangeError` on a bad def; let that propagate.
   - If the `laneId` was already seen, throw `RangeError(\`duplicate laneId: ${def.laneId}\`)`.
   - Call `lane.curve.getLengths()` once. This warms the arc-length cache, so later per-frame `getPointAt` calls and
     `getLength()` do not allocate.
   - Add the lane to a `Map<number, RiverLane>` and to an array.
3. Return `Object.freeze({ lanes: Object.freeze(array), get: (laneId: number) => map.get(laneId) })`.

There is no import cycle. In `src/core/coordinates/index.ts`, add `export * from "./riverLaneSet";` after the `SplinePathCoord` line.

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

/** 2D projection fitted to a whole lane set. */
export function createLaneSetProjection(lanes: RiverLaneSet, viewport: CanvasViewport): TopDownProjection {
  return createTopDownProjection(computeLaneBoundsXZ(lanes.lanes), viewport);
}

/** 2D twin of getRiverItemPositionAt: null for invalid input or an unknown lane. Not per-frame. */
export function getRiverItemCanvasPositionAt(
  item: RiverPlacementSource, lanes: RiverLaneSet, nowMs: number, projection: TopDownProjection,
): CanvasPoint | null {
  if (!isValidRiverPlacement(item)) return null;
  const lane = lanes.get(item.coord.laneId);
  return lane ? splineCoordToCanvas(item.coord, lane, item.createdAtMs, nowMs, projection) : null;
}
```

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

/** Stable per-item phase in [0, 2π) from the public creation id (FNV-1a 32-bit over UTF-16 code units). */
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
 * Procedural bobbing at wall-clock nowMs (epoch ms). Pure, stateless. Reduced motion (owner decision 23: only the
 * bobbing stops) or non-finite input → all zeros. Writes into and returns `out`. Never affects x or z.
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

### Step 7 — `src/core/world/riverLanes.ts` (new)

```ts
import { LOY_KRATHONG_RIVER_LANES } from "@/config/events/loyKrathong.river.config";
import { createRiverLaneSet, type RiverLaneSet } from "@/core/coordinates";

let loyKrathongLanes: RiverLaneSet | null = null;

/**
 * The ONE lane set of the Loy Krathong river, shared by 3D flow, 2D fallback, Find My, the release ritual and the server
 * collision re-check (invariant B). Built on first call, then the same object every call.
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

/** Find My Krathong query result. Derived at call time, NEVER persisted. No bobbing. */
export interface RiverItemPosition {
  readonly laneId: number;
  readonly progress: number;  // currentProgress(coord, createdAtMs, nowMs), in [0, 1)
  readonly world: WorldVec3;  // lane centreline + lateral offset; usable as a camera fly-to target
  readonly yawRad: number;
}
export function getRiverItemPositionAt(
  item: RiverPlacementSource, lanes: RiverLaneSet, nowMs: number,
): RiverItemPosition | null;

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

/** Per-frame, allocation-free: the item's pose at nowMs (+ bobbing unless reducedMotion) into target. */
export function applyRiverItemTransform(
  target: RiverTransformTarget, item: PreparedRiverItem, nowMs: number, reducedMotion: boolean, scratch: RiverFrameScratch,
): void;
```

**`getRiverItemPositionAt`**

1. If `!isValidRiverPlacement(item)`, return `null`.
2. Look up `lane = lanes.get(item.coord.laneId)`. If it is undefined, return `null`.
3. Compute `progress = currentProgress(item.coord, item.createdAtMs, nowMs)`.
4. Compute `placement = splineProgressToWorld(lane, progress, item.coord.lateralOffset)`.
5. Return `{ laneId: lane.laneId, progress, world: placement.position, yawRad: placement.yawRad }`.

Call it on tap/commit only, never in `useFrame`.

**`prepareRiverItems`**

Iterate in order. Keep an item only if all of these hold:
- `typeof item.id === "string"` and `item.id !== ""`;
- the id is unseen so far (the first one wins);
- `isValidRiverPlacement(item)`;
- the lane exists.

Then:
- The kept `coord` is `parsePersistableCoord(item.coord).coord`.
- Return a frozen array of frozen entries.
- Skip items silently: **no `console.*`**.
- Do **not** drop items whose `speedFactor` differs from `RIVER_DRIFT_SPEED_FACTOR`. The renderer shows each stored coord as it is;
  equal speed is enforced on the write paths (D9).
- Not per-frame: use `useMemo` with `[items, lanes]`.

**`applyRiverItemTransform`**, exactly:

```ts
const pose = splineCoordToPoseInto(item.coord, item.lane, item.createdAtMs, nowMs, scratch.pose);
const bob = writeBobbingAt(nowMs, item.bobPhaseRad, reducedMotion, scratch.bob);
target.position.set(pose.x, pose.y + bob.offsetY, pose.z);
target.rotation.set(bob.pitchRad, pose.yawRad, bob.rollRad, RIVER_ITEM_EULER_ORDER);
```

### Step 9 — `src/core/world/riverCollision.ts` (new) — owner decision 25

These are pure, deterministic and not per-frame. Callers:
- MFW-23 (client): on release, at the release time, before the bump animation;
- MFW-45 (server): re-check before insert, with server time and the zone's existing rows.

**The metric.** Distance between two spots on the same lane, in world units:

    d = hypot(circularDistance(pA, pB) × laneLength, (lA − lB) × laneWidth)

- `laneLength` is `lane.curve.getLength()` (arc-length parametrisation).
- Progress uses the **circular** distance: with the `% 1` wrap, 0.99 and 0.01 are neighbours.

All items drift at the same speed. That keeps `pA − pB` constant over time (in particular across the wrap), and the lateral
offsets never change, so `d` is time-invariant. A spot that is free now stays free for ever.

```ts
import {
  RIVER_COLLISION_RADIUS, RIVER_DRIFT_SPEED_FACTOR, RIVER_MIN_CENTER_SPACING, RIVER_SPOT_SEARCH_STEPS_PER_SPACING,
} from "@/config/riverFlow.config";
import {
  currentProgress, isValidRiverPlacement, splineCoordFromLocation,
  type RiverLane, type RiverLaneSet, type RiverPlacementSource, type SplinePathCoord,
} from "@/core/coordinates";
import { wrap01 } from "@/core/math/wrap01";

/** A place on a lane at one instant. Derived; persisted only via riverCoordFromSpot (invariant A). */
export interface RiverSpot {
  readonly laneId: number;
  readonly progress: number;      // [0, 1)
  readonly lateralOffset: number; // within ±riverSpotLateralLimit(lane)
}

/** Largest |lateralOffset| that keeps a krathong body inside the lane: max(0, 0.5 − RIVER_COLLISION_RADIUS / width). */
export function riverSpotLateralLimit(lane: RiverLane): number;

/** The time-invariant (arc length, lateral) distance in world units; assumes a.laneId === b.laneId === lane.laneId. */
export function riverSpotDistance(a: RiverSpot, b: RiverSpot, lane: RiverLane): number {
  const d = Math.abs(a.progress - b.progress) % 1;
  const along = Math.min(d, 1 - d) * lane.curve.getLength();
  const across = (a.lateralOffset - b.lateralOffset) * lane.width;
  return Math.hypot(along, across);
}

/** Spot of a stored item at nowMs; null if invalid (isValidRiverPlacement) or its lane is unknown. */
export function riverSpotOf(item: RiverPlacementSource, lanes: RiverLaneSet, nowMs: number): RiverSpot | null;

/** True iff the candidate is a valid spot and no existing item on its lane is closer than RIVER_MIN_CENTER_SPACING. */
export function isSpotFree(
  candidate: RiverSpot, existing: readonly RiverPlacementSource[], lanes: RiverLaneSet, nowMs: number,
): boolean;

/** Nearest free spot to the candidate (the candidate itself if free), or null when the lane is full. Deterministic. */
export function findNearestFreeSpot(
  candidate: RiverSpot, existing: readonly RiverPlacementSource[], lanes: RiverLaneSet, nowMs: number,
): RiverSpot | null;

/** The persistable coord for a spot chosen at createdAtMs: spawnProgress = spot.progress, speed = RIVER_DRIFT_SPEED_FACTOR. */
export function riverCoordFromSpot(spot: RiverSpot, createdAtMs: number): SplinePathCoord {
  return splineCoordFromLocation(
    { progress: spot.progress, lateralOffset: spot.lateralOffset },
    spot.laneId, RIVER_DRIFT_SPEED_FACTOR, createdAtMs, createdAtMs,
  );
}
```

**`riverSpotOf`**

1. If `!isValidRiverPlacement(item)`, return `null`.
2. If `lanes.get(item.coord.laneId)` is undefined, return `null`.
3. Otherwise return `{ laneId, progress: currentProgress(item.coord, item.createdAtMs, nowMs), lateralOffset: item.coord.lateralOffset }`.

**Private helper `occupiedSpots(existing, lane, lanes, nowMs): RiverSpot[]`**

Map every existing item through `riverSpotOf`, then keep only the non-null spots with `laneId === lane.laneId`. Compute this list
**once per call**. Other lanes and invalid rows are ignored. With one lane per river (row 21), cross-lane overlap cannot happen.

**Shared candidate check (both functions)**

- If `lanes.get(candidate.laneId)` is undefined → `isSpotFree` returns `false`, `findNearestFreeSpot` returns `null`.
- If `candidate.progress` or `candidate.lateralOffset` is not finite → also `false` / `null`.
- Let `lim = riverSpotLateralLimit(lane)` and `p0 = wrap01(candidate.progress)`.

**`isSpotFree`**

1. If `|candidate.lateralOffset| > lim`, return `false`.
2. Return `true` iff, for every occupied spot `o`, `riverSpotDistance({ laneId, progress: p0, lateralOffset }, o, lane) >= RIVER_MIN_CENTER_SPACING`.
   Touching at exactly the spacing counts as free.

**`findNearestFreeSpot`** (deterministic grid search)

1. Clamp the lateral offset: `l0 = Math.min(lim, Math.max(-lim, candidate.lateralOffset))`.
2. Collect `occupied` once.
3. Set up the grid:
   - `L = lane.curve.getLength()`
   - `step = RIVER_MIN_CENTER_SPACING / RIVER_SPOT_SEARCH_STEPS_PER_SPACING`
   - `N = Math.max(1, Math.ceil(L / step))` (progress steps around the full lap)
   - `latStep = step / lane.width`
   - `jMax = Math.floor((2 * lim) / latStep)`
4. Build the offset list:
   - For `i = 0 … N − 1`, let `s = i <= N / 2 ? i : i - N` (signed progress offset).
   - For each `j = −jMax … jMax`, let `l = l0 + j * latStep`. Skip it if `l < -lim || l > lim`.
   - Otherwise push `{ s, j, d2: (s * L / N) ** 2 + (j * step) ** 2 }`.
5. Sort the list with this total comparator:
   1. `d2` ascending;
   2. then `Math.abs(j)` ascending (stay near the release lateral);
   3. then `s` descending (downstream before upstream);
   4. then `j` descending.

   The sort is stable and the comparator is total, so the order is identical on every engine.
6. For each entry in order, build `spot = { laneId: lane.laneId, progress: wrap01(p0 + e.s / N), lateralOffset: l0 + e.j * latStep }`.
   Return `Object.freeze(spot)` for the first entry where `occupied.every((o) => riverSpotDistance(spot, o, lane) >= RIVER_MIN_CENTER_SPACING)`.
   The first entry is `(0, 0)`, so a free candidate is returned as it is (after the clamp).
7. If no entry is free, return `null` ("zone full").

The result depends only on the inputs, not on the order of `existing`.

Cost for the product lane: about 154 × 11 ≈ 1.7k grid points × up to about 120 occupied items. That is fine on tap or on the
server, but never per frame.

### Step 10 — `src/core/world/index.ts` (modify)

Keep the existing lines: the doc comment, and MFW-27's `export * from "./riverEnvironment";` if MFW-27 is merged. Add:

```ts
export * from "./bobbing";
export * from "./riverLanes";
export * from "./riverFlow";
export * from "./riverCollision";
```

In the fallback, replace `export {};` with these lines. The barrel pulls in three through `@/core/coordinates`. Server code
already does the same through `parsePersistableCoord`, so that is fine for MFW-45. Do **not** value-import the barrel from
`src/components/ui/**` or `src/app/(pages)`. The landing JS must stay free of three. API route handlers are server bundles, so
they may import it.

### Step 11 — `src/components/canvas3d/RiverFlow.tsx` (new)

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
    invalidate(); // keep the demand canvas rendering while krathongs drift (also under reduced motion)
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
- All hooks run before the early `return null`.
- The frame callback allocates nothing. It does only an indexed `for` loop, `Map.get` and `applyRiverItemTransform`. It reads
  `Date.now()`, never `new Date()`. It never sets React state.
- React 19 ref-callback cleanup removes a group on unmount or key change.
- The component creates no geometry, material or texture. Parts come from MFW-19's shared provider, so there is nothing to dispose
  (invariant E).
- Exactly one `useFrame` per `RiverFlow`.
- No decimal or hex literals in this file, comments included.
- No collision logic here: the renderer trusts stored coords (D9).
- If `KrathongModel`'s real props differ from the ASSUMED INTERFACE, adapt this one call and say so in the PR.

### Step 12 — `src/components/canvas3d/index.tsx` (modify)

Minimal edits:
1. Add the imports `import { RiverFlow, type RiverFlowItem } from "./RiverFlow";` and `import { getLoyKrathongRiverLanes } from "@/core/world";`.
2. Add `export const NO_RIVER_ITEMS: readonly RiverFlowItem[] = Object.freeze([]);` at module level.
3. `ToyNightSceneProps` gains `reducedMotion: boolean;` and `riverItems: readonly RiverFlowItem[];`.
4. In `ToyNightScene`, render
   `<RiverFlow items={riverItems} lanes={getLoyKrathongRiverLanes()} shadows={shadows} reducedMotion={reducedMotion} />`
   as the **last child of the world-view group**:
   - MFW-27 merged: inside `<group name={SCENE_OBJECT_NAMES.worldView} …>`, after `<RiverEnvironment …/>` and the krathong group;
   - fallback: after the lamp mesh in the existing world `<group>`.
   It is inside `<Canvas>`, so MFW-19's provider is above it.
5. `SceneViewport` props gain `riverItems = NO_RIVER_ITEMS` (type `riverItems?: readonly RiverFlowItem[]`). Pass `reducedMotion` (already
   read) and `riverItems` to `ToyNightScene`.
6. Change nothing else: camera, lights, pan, ring, chip, drag clamps, `frameloop="demand"` and `gl`/`key` all stay as they are.
   `FlowRoot` is not changed.

## Tests

All tests run in vitest, with no network, no DB and no WebGL. The new pure tests start with `// @vitest-environment node` unless noted.

Shared conventions:
- `const same = (a: number, b: number) => expect(a === b).toBe(true);` treats ±0 as equal.
- Twin converters are compared with `toBe`.
- `T0 = 1_700_000_000_000`.

### `src/config/events/loyKrathong.river.lanes.test.ts` (AC1, AC3, invariant B)

- `LOY_KRATHONG_RIVER_LANES.length === 1`. Its `laneId === LOY_KRATHONG_RIVER_LANE_ID === 1` and its `width === LOY_KRATHONG_RIVER_LANE_WIDTH`.
- The lane's xz control points equal `LOY_KRATHONG_RIVER_CHANNEL.controlPoints` xz, point by point, and every `y === RIVER_WATER_SURFACE_Y`.
  The def, the points array and every point are frozen.
- `createRiverLaneSet(LOY_KRATHONG_RIVER_LANES)` does not throw.
- Turning radius: take the minimum xz circumradius over `TURN_SAMPLES = 2000` arc-length samples. It must be greater than `width / 2`.
- Inside the channel:
  - Build `channel = createRiverLane({ laneId: 0, controlPoints: LOY_KRATHONG_RIVER_CHANNEL.controlPoints, width: LOY_KRATHONG_RIVER_CHANNEL.width })`.
  - At 64 samples, take both lane edges.
  - Each edge must satisfy `|locateOnLane(channel, edge).lateralOffset| ≤ 0.5 + 1e-9`. This repeats MFW-27's rule so the guard exists in either merge order.
- Parametric ↔ 3D round trip: for `PROGRESS_SAMPLES` × `LATERAL_SAMPLES`, the error stays within `TOLERANCE`.
- Parametric ↔ 2D ↔ coord round trip:
  - Run for both `VIEWPORTS`, with `createLaneSetProjection`.
  - Chain `splineCoordToCanvas` → `canvasToSplineLocation` → `splineCoordFromLocation`.
  - The result must be within `TOLERANCE`, and `isPersistableCoord(back)` must hold.
- Server-safety: the text of `loyKrathong.river.config.ts` contains no `from "three"`, no `@react-three` and no `from "react"`.

### `src/config/riverFlow.config.test.ts`

- Every amplitude is finite and ≥ 0. Every `*_PERIOD_MS` is a positive integer.
- `RIVER_KRATHONG_SCALE` > 0, `RIVER_DRIFT_SPEED_FACTOR` is in `(0, SPEED_FACTOR_MAX]`, and `RIVER_SPOT_SEARCH_STEPS_PER_SPACING` is an integer ≥ 1.
- The derived constants match their formulas:
  - `RIVER_COLLISION_RADIUS === KRATHONG_MODEL_FOOTPRINT_RADIUS * RIVER_KRATHONG_SCALE`;
  - `RIVER_MIN_CENTER_SPACING === 2 * RIVER_COLLISION_RADIUS * RIVER_COLLISION_CURVATURE_MARGIN`;
  - `RIVER_COLLISION_CURVATURE_MARGIN >= 1`.
- The footprint covers the model (ASSUMED MFW-19 names; adapt the names only, not the rule). For every base in `KRATHONG_BASE_MODELS`:
  - Base radius = for a cylinder, `max(radiusTop, radiusBottom) × scale[0]`; for a sphere, `radius × max(scale[0], scale[2])`.
  - Base radius must be ≤ `KRATHONG_MODEL_FOOTPRINT_RADIUS`.
  - For every leaf in `KRATHONG_LEAF_MODELS`, take the leaf radius (cone: `radius`; sphere: `radius × max(scale[0], scale[2])`).
    Then `rimRadius + leafRadius ≤ KRATHONG_MODEL_FOOTPRINT_RADIUS`.

### `src/core/coordinates/splinePoseInto.test.ts` (AC3; MFW-8 follow-up)

- Loop over fixture lanes × `PROGRESS_SAMPLES` × `LATERAL_SAMPLES`, plus progress `1.25` and `-0.75`. In each case,
  `splineProgressToPoseInto` x/y/z/yawRad `toBe` the values from `splineProgressToWorld`.
- It returns the passed `out`. Reusing one `out` over 50 calls gives the values of the last call.
- Interleave `Into(A)`, then `World(B)`, then `Into(A)`: the third call gives the same values as the first.
- `NaN` / `Infinity` input → `RangeError`. Lateral `0.7` gives the same result as `0.5`.
- `splineCoordToPoseInto` `toBe` `splineCoordToWorld` over spawn `{0, 0.37, 0.999}` × speed `{0, 0.008}` × dt `{0, 12_345, 30 days}`.
  A mismatched `laneId` → `RangeError`.

### `src/core/coordinates/riverLaneSet.test.ts`

- Build a set from the three fixture defs:
  - its ids are `[1, 2, 3]`;
  - `get(2)?.laneId === 2`;
  - `get(99)`, `get(-1)` and `get(1.5)` are all `undefined`;
  - it is frozen.
- `[]` → `RangeError`. A duplicate laneId 1 → `RangeError` containing `duplicate laneId: 1`. Width 0 → `RangeError`.
- `isValidRiverPlacement`:
  - a valid item → `true`;
  - each of these → `false`: an extra key `x`, a `PLANAR_ZONE` coord, `lateralOffset 0.7`, `speedFactor 2`, `createdAtMs` `NaN`/`Infinity`, a `null` item.

### `src/core/fallback2d/riverTopDownInto.test.ts` (AC3, invariant B)

- For `VIEWPORTS` × fixture lanes:
  - `worldToCanvasInto` / `splineCoordToCanvasInto` `toBe` their twins;
  - each returns the passed `out`.
- `createLaneSetProjection` deep-equals `createTopDownProjection(computeLaneBoundsXZ(set.lanes), vp)`.
- `getRiverItemCanvasPositionAt`:
  - a valid item → equals `splineCoordToCanvas`;
  - an unknown lane, an invalid coord or a NaN `createdAtMs` → `null`.

### `src/core/world/bobbing.test.ts` (AC1, invariant F, decision 23)

- Reduced motion: for `nowMs` ∈ `{T0, T0 + 1234, T0 + 999_999}`, all fields `=== 0`.
- A non-finite `nowMs` or phase → zeros.
- Bounds over 500 samples (`T0 + k * 37`):
  - each field stays within its amplitude;
  - at least one `offsetY !== 0`.
- Periodicity: each field at `T0 + 500` is `toBe` the same field one full period later.
- Determinism:
  - the same input → `Object.is`-equal output;
  - the function returns the passed `out`;
  - with phase 0, `offsetY(T0) !== offsetY(T0 + RIVER_BOB_HEAVE_PERIOD_MS / 4)`.
- `bobbingPhaseFromId`:
  - `""` → `(0x811c9dc5 / 2 ** 32) * 2 * Math.PI`;
  - `"a"` → `(0xe40c292c / 2 ** 32) * 2 * Math.PI`;
  - `"foobar"` → `(0xbf9cf968 / 2 ** 32) * 2 * Math.PI`;
  - every result is in `[0, 2π)`;
  - different ids give different phases, and the same id gives the same phase.

### `src/core/world/riverFlow.test.ts` (AC1, AC3, AC4)

Fixture: `lanes = getLoyKrathongRiverLanes()`, and `item(id, overrides, createdAtMs = T0)` with base coord
`{ mode: "SPLINE_PATH", laneId: 1, spawnProgress: 0.25, speedFactor: RIVER_DRIFT_SPEED_FACTOR, lateralOffset: 0.2 }`.

- `getLoyKrathongRiverLanes()` returns the same object on both calls, and its ids are `[1]`.
- **Deterministic across clients:**
  - Build two separate `createRiverLaneSet(LOY_KRATHONG_RIVER_LANES)` sets.
  - Loop spawn `{0, 0.5, 0.99}` × lateral `{-0.5, 0, 0.5}` × now `{T0, T0 + 1000, T0 + 30 days}`.
  - `progress`, `world.x/y/z` and `yawRad` are `toBe`-equal between the two sets.
- **Only coord + time:**
  - `progress` `toBe` `currentProgress(...)`;
  - `world` deep-equals `splineCoordToWorld(...).position`.
- **Moves downstream slowly:**
  - over 1000 ms, the progress delta is close to `RIVER_DRIFT_SPEED_FACTOR` (12 digits);
  - the displacement · tangent > 0.
- **Reduced motion keeps drifting** (decision 23): `applyRiverItemTransform(..., reducedMotion=true)` at `T0` and at `T0 + 1000`
  writes different x/z, and both equal `getRiverItemPositionAt` at those times.
- **Find My query:**
  - at `createdAt` → `0.25`;
  - spawn `0.9` at `T0 + 25_000` → close to `0.1` ("wraps past 1");
  - a future `createdAt` → `0.25`;
  - `laneId 99`, an extra key `position` or a NaN `createdAtMs` → `null`;
  - the result has exactly the keys `laneId, progress, world, yawRad`.
- **3D and 2D agree:**
  - `getRiverItemCanvasPositionAt` deep-equals `worldToCanvas(world, proj)`;
  - `canvasToSplineLocation` gives back progress and lateral within `TOLERANCE`.
- **prepareRiverItems:**
  - Order is kept.
  - These are dropped: an empty id, a duplicate id (the first one is kept), an extra key `x`, a `CYLINDRICAL_SURFACE` coord,
    `lateralOffset 0.7`, laneId 99, a NaN `createdAtMs`.
  - An item with `speedFactor 0.02` is **kept** (D9).
  - Each kept `coord` deep-equals the input but is a different object.
  - `bobPhaseRad`, `lane` and `source` are as specified.
  - The result is frozen. `[]` → `[]`.
- **applyRiverItemTransform** (a recording fake target plus a real `Object3D`):
  - reduced motion: position equals `world`, rotation is `[0, yawRad, 0, "YXZ"]`;
  - motion: x/z `toBe` the reduced-motion values, `y === world.y + bob.offsetY`, and pitch/roll come from the bob;
  - the real `Object3D` ends with `rotation.order === "YXZ"`;
  - **no accumulated state:** t1 → t2 → t1 gives the same result as the first t1.

### `src/core/world/riverCollision.test.ts` (AC2, decision 25)

Fixtures:
- `lanes = getLoyKrathongRiverLanes()`, `lane = lanes.get(1)!`, `lim = riverSpotLateralLimit(lane)`.
- `at(spot, createdAtMs)` builds a `RiverPlacementSource` with `riverCoordFromSpot(spot, createdAtMs)`.
- `NOW = T0 + 60_000`.

Cases:
- `riverSpotLateralLimit(lane) === 0.5 - RIVER_COLLISION_RADIUS / lane.width`. A fixture lane narrower than `2 × RIVER_COLLISION_RADIUS` gives `0`.
- `riverSpotDistance`:
  - it is symmetric;
  - progress 0.99 vs 0.01 at the same lateral → `0.02 × L` (close to 9 digits), so the wrap seam counts as a neighbour;
  - a pure lateral difference of 0.25 → `0.25 × lane.width`.
- **Spacing is time-invariant:**
  - A = spot `{1, 0.95, 0.1}` created at `T0`; B = spot `{1, 0.1, -0.2}` created at `T0 + 7000`.
  - Over 600 `now` values from `T0 + 7000` to `T0 + 7000 + 3 × (1 / RIVER_DRIFT_SPEED_FACTOR) × 1000` (3 laps; some samples have
    exactly one of A/B wrapped), `riverSpotDistance(riverSpotOf(A), riverSpotOf(B))` stays within `1e-9` of its value at the first sample.
- **World bodies never overlap at minimum spacing:**
  - For 60 base progresses × lateral `{-lim, 0, lim}` × 7 directions `θ = k·π/6`, place B at exactly `RIVER_MIN_CENTER_SPACING` from A
    in the metric: `Δp = cos θ · D / L`, `Δl = sin θ · D / W`. Skip a case if B's lateral leaves `[-lim, lim]`.
  - Shift both by 40 common progress steps over a lap.
  - The world xz distance between `splineProgressToWorld` positions must be `≥ 2 * RIVER_COLLISION_RADIUS`. The probe minimum is 0.5885 ≥ 0.572.
- `riverCoordFromSpot`:
  - `speedFactor === RIVER_DRIFT_SPEED_FACTOR`;
  - `spawnProgress === spot.progress`;
  - `isPersistableCoord` → `true`;
  - `riverSpotOf(at(spot, T0), lanes, T0)` deep-equals the spot.
- `isSpotFree`:
  - with no items → `true`;
  - an item at exactly `RIVER_MIN_CENTER_SPACING` along the lane → `true`;
  - at spacing − 1e-6 → `false`;
  - lateral `lim + 1e-6` → `false`;
  - an unknown lane or NaN → `false`;
  - an invalid existing row (extra key) is ignored;
  - on a two-lane fixture set (`STRAIGHT_LANE_DEF`, `S_LANE_DEF`), an item on lane 2 does not block lane 1.
- `findNearestFreeSpot`:
  - free candidate → the same spot (deep-equal);
  - candidate lateral `0.5` with no items → `lateralOffset === lim`;
  - candidate exactly on an existing item → a non-null spot `s` with `isSpotFree(s) === true`, and `riverSpotDistance(s, candidate) > 0`;
  - **never overlapping:** with 40 existing items placed by repeated search, 200 deterministic pseudo-random candidates (LCG seed 1)
    each give `null` or a spot with `isSpotFree === true`;
  - **deterministic:** the same call twice → deep-equal; `existing` reversed → deep-equal;
  - unknown lane / NaN → `null`.
- **Full lane and capacity (decision 4):**
  - Starting empty, repeat `s = findNearestFreeSpot({ laneId: 1, progress: 0.4, lateralOffset: 0.39 }, items, lanes, NOW)` and push
    `at(s, NOW)` until `s === null`. The candidate is MFW-27's release point.
  - Expect `items.length >= 80` (local `ZONE_ITEM_CAP_FOR_TEST = 80`, quoting decision 4; the probe gives 123).
  - Every pair is at least `RIVER_MIN_CENTER_SPACING − 1e-9` apart.
  - The next call returns `null`.
  - Give this test `{ timeout: 30_000 }`.

### `src/components/canvas3d/RiverFlow.test.tsx` (jsdom; AC1, invariant F)

Setup:
- `const r3f = vi.hoisted(() => ({ frame: null as null | (() => void), invalidate: vi.fn() }))`.
- `vi.mock("@react-three/fiber", () => ({ useFrame: (cb: () => void) => { r3f.frame = cb; }, useThree: (sel: (s: { invalidate: () => void }) => unknown) => sel({ invalidate: r3f.invalidate }) }))`.
- `vi.mock("@/components/models/loyKrathong", async () => { const React = await import("react"); return { KrathongModel: (p: { appearance: { base: string }; shadows: boolean }) => React.createElement("mesh", { name: "krathong-model", "data-base": p.appearance.base, "data-shadows": String(p.shadows) }) }; })`.
- In `beforeAll`, define `position` / `rotation` getters on `HTMLUnknownElement.prototype`. They return a per-element three
  `Vector3` / `Euler`, created on first access and stored in a `WeakMap`. Delete them in `afterAll`.
- `beforeEach` resets `r3f`.
- Items use `DEFAULT_KRATHONG_APPEARANCE`, `laneId 1` and `RIVER_DRIFT_SPEED_FACTOR`. Use `now = () => NOW` (a mutable `let`).

Cases:
- Two valid items plus one with laneId 99 → exactly `river-item-a` and `river-item-b`, each with one `mesh[name="krathong-model"]`
  (correct `data-base`), and `scale` = `String(RIVER_KRATHONG_SCALE)`.
- `items=[]` → no `river-flow`. Calling the frame does not call `invalidate` and does not throw.
- Mounting with items → the effect called `invalidate`.
- Frame with `reducedMotion={false}`:
  - x/z equal `getRiverItemPositionAt` at `NOW`;
  - y = `world.y` + the bob `offsetY`;
  - `invalidate` was called in the frame.
- Rerender with `reducedMotion={true}` and run the frame → y `=== world.y`, rotation x/z `=== 0`.
- `NOW += 1000` and run the frame again → x/z move to the new value. The frame still invalidates (drift continues under reduced motion).
- Two frames at the same `NOW` → identical positions.
- After unmount, the stale frame does not throw. `shadows` is passed through.

### `src/components/canvas3d/index.test.tsx` (modify — add 2 cases, change none)

- "renders no river krathongs by default": `setQualityTier("HIGH")` and render `WORLD_EXPLORE` → no `[name="river-flow"]`.
- "passes river items into the world-view group": with `riverItems={[validItem("a")]}`, `[name="river-item-a"]` is inside
  `[name="scene-world-view"]` (`SCENE_OBJECT_NAMES.worldView`). In the fallback, it is inside the group that contains `mesh[name="scene-water"]`.

These must still pass unchanged:
- `SplinePathCoord.test.ts`, `riverTopDown.test.ts`;
- MFW-27's `riverLayout.test.ts` (now guarding the single lane), `RiverEnvironment.test.tsx`, `tests/unit/scene-art-constants.test.ts`;
- `tests/unit/no-raw-xyz-persistence.test.ts`, `tests/unit/structure.test.ts`, `src/store/stores.test.ts`;
- all e2e specs.

**No new e2e** (D8).

## Do NOT

- Do not build anything from these cards:
  - the release interaction, the bump animation or the release-time call to `findNearestFreeSpot` (MFW-23);
  - the POST route or its server re-check (MFW-45);
  - zone loading, pagination, the 80 cap or new zones (MFW-25);
  - the environment, channel, pier or scene art (MFW-27; the Step 1b fallback copies only the three listed items);
  - the Find-My UI (MFW-30);
  - the 2D renderer (MFW-33);
  - instancing (MFW-34).
- Do not touch `src/services/**`, `src/app/api/**` or `supabase/**`.
- Do not change `LOY_KRATHONG_RIVER_CHANNEL`, `RIVER_WATER_SURFACE_Y`, the pier or the props to make the lane fit. If MFW-27's guard
  tests fail with the lane, stop and report.
- Do not add physics, a velocity state or any time-stepped collision response (decision 25 / row 11). Collision is only the pure
  spot search at release and insert time.
- Do not remove `speedFactor` from `SplinePathCoord` or change `parsePersistableCoord`, `currentProgress` or `SPEED_FACTOR_MAX`.
  Do not make `RiverFlow` override a stored coord's speed.
- Do not add demo krathongs to the scene, `FlowRoot` or the stores.
- Never persist or send a pose, `SplinePoseOut`, `CanvasPointOut`, `BobbingOut`, any x/y/z or a `RiverSpot` (invariant A).
  The only persistable output is `riverCoordFromSpot`, which returns a `SplinePathCoord`.
- `RiverFlowItem` must never carry `owner_token`, `owner_token_hash` or `private_wish_text` (invariant C).
- For positions or bobbing, do not use the R3F clock, `performance.now()` or the frame `delta`. Do not accumulate position. Do not use a spring.
- Do not allocate in `useFrame`, `applyRiverItemTransform`, `splineProgressToPoseInto`, `splineCoordToPoseInto`,
  `worldToCanvasInto`, `splineCoordToCanvasInto` or `writeBobbingAt`.
- Never call `locateOnLane`, `getRiverItemPositionAt`, `prepareRiverItems`, `isSpotFree` or `findNearestFreeSpot` per frame.
- Do not create geometries, materials or textures in `RiverFlow`.
- No `console.*` in new files.
- No decimal or hex literals in non-test files under `src/components/canvas3d/**` / `src/components/models/**`.
- Do not value-import `@/core/world` or `RiverFlow` from `src/components/ui/**` or page modules.
- Do not change `package.json`, the lockfile, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.mts`, `playwright.config.ts`
  or `next.config.ts`. No new dependency.
- Do not touch `.claude/**`, `scripts/**`, `.github/**`, `CLAUDE.md`, `AGENTS.md`, `docs/spec/**` (incl. `open-questions.md`),
  `docs/backlog*.json`, `docs/prompts/**`, `docs/plans/**`, `src/core/coordinates/__fixtures__/**`, `src/store/**` or `src/components/ui/**`.
- Do not weaken, skip or edit existing test cases. The only exception is a hard-coded placeholder-lane expectation in an MFW-27 test (Step 1a).

## Definition of done

- Run each of these separately, all green: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and
  `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell pnpm e2e` (the cloud container's browser path; locally, plain `pnpm e2e`).
- Every AC above has its listed tests.
- Before committing:
  - delete `playwright-report/` and `test-results/`;
  - never commit `.next/` or `*.tsbuildinfo`;
  - leave `AGENTS.md` as it is on `main`.
- Cut the branch `feat/MFW-24-deterministic-spline-river-flow` from the latest `main`, after MFW-19 (and normally MFW-27) have merged.
- Use conventional commits, e.g. `feat(core): deterministic spline river flow and no-overlap spots MFW-24`.
- Open a ready PR against `main` with the English title = the commit subject. The body contains:
  - a link to MFW-24;
  - the AC checklist with each test;
  - Decisions D1–D10;
  - the constant table (Step 2);
  - which Step 1 path was taken;
  - the capacity numbers from Facts;
  - the test plan (five commands and their results);
  - follow-ups: MFW-23 calls `findNearestFreeSpot` at release plus the bump, saves `riverCoordFromSpot`; MFW-45 re-checks with server
    time, forces `RIVER_DRIFT_SPEED_FACTOR`, returns the final coord; MFW-25 passes zone items, treats `null` as a full zone;
    MFW-30 Find My; MFW-33 the `…Into` helpers; MFW-34 instancing; server-time correction.
- Leave the PR open for reviewer + qa + **r3f-perf-reviewer**. The loop merges it after `ci` is SUCCESS.

## Interfaces this card provides

| Export | Path | Signature | Used by |
|---|---|---|---|
| `LOY_KRATHONG_RIVER_LANES` (values; the name/type are MFW-27's), `LOY_KRATHONG_RIVER_LANE_ID`, `LOY_KRATHONG_RIVER_LANE_WIDTH` | `@/config/events/loyKrathong.river.config` | `readonly RiverLaneDefinition[]` (one lane), `1`, `2.4` | MFW-27 guard tests, MFW-23 |
| `RIVER_DRIFT_SPEED_FACTOR`, `RIVER_COLLISION_RADIUS`, `RIVER_MIN_CENTER_SPACING`, `KRATHONG_MODEL_FOOTPRINT_RADIUS`, `RIVER_COLLISION_CURVATURE_MARGIN`, `RIVER_SPOT_SEARCH_STEPS_PER_SPACING`, `RIVER_KRATHONG_SCALE`, `RIVER_BOB_*` | `@/config/riverFlow.config` | numbers (server-safe data) | MFW-23, **MFW-45** ("collision radius from config"), MFW-34 |
| `RiverSpot`, `riverSpotLateralLimit`, `riverSpotDistance`, `riverSpotOf`, `isSpotFree`, `findNearestFreeSpot`, `riverCoordFromSpot` | `@/core/world` | see Step 9; `findNearestFreeSpot(candidate, existing, lanes, nowMs) => RiverSpot \| null` | **MFW-23** (candidate = `locateOnLane(lane, LOY_KRATHONG_RIVER_LAYOUT.pier.releasePoint)` at release time; bump toward the returned spot; save `riverCoordFromSpot(spot, createdAtMs)`), **MFW-45** (re-check with server `now` against the zone's rows; on `null` → next zone), MFW-25 (zone full) |
| `RiverLaneSet`, `createRiverLaneSet`, `RiverPlacementSource`, `isValidRiverPlacement` | `@/core/coordinates` | see Step 4 | all river cards |
| `SplinePoseOut`, `createSplinePoseOut`, `splineProgressToPoseInto`, `splineCoordToPoseInto` | `@/core/coordinates` | `(…, out) => out` | MFW-23 (drift-out), MFW-34 |
| `CanvasPointOut`, `createCanvasPointOut`, `worldToCanvasInto`, `splineCoordToCanvasInto`, `createLaneSetProjection`, `getRiverItemCanvasPositionAt` | `@/core/fallback2d` | see Step 5 | MFW-33, MFW-30 (2D) |
| `getLoyKrathongRiverLanes` | `@/core/world` | `() => RiverLaneSet` (singleton) | MFW-23, MFW-25, MFW-30, MFW-33, MFW-45 |
| `getRiverItemPositionAt`, `RiverItemPosition` | `@/core/world` | `(item, lanes, nowMs) => { laneId; progress; world; yawRad } \| null` | **MFW-30** (`world` → `createCameraController().flyTo`) |
| `prepareRiverItems`, `PreparedRiverItem`, `RiverRenderSource`, `applyRiverItemTransform`, `RiverTransformTarget`, `createRiverFrameScratch`, `RIVER_ITEM_EULER_ORDER` | `@/core/world` | see Step 8 | MFW-34 |
| `bobbingPhaseFromId`, `writeBobbingAt`, `BobbingOut`, `createBobbingOut` | `@/core/world` | see Step 6 | MFW-23, MFW-33 (optional) |
| `RiverFlow`, `RiverFlowItem`, `RiverFlowProps` | `@/components/canvas3d/RiverFlow` | `RiverFlow({ items, lanes, shadows, reducedMotion, now? })` | MFW-25 (`createdAtMs = Date.parse(created_at)`) |
| `SceneViewport` prop `riverItems?`, `NO_RIVER_ITEMS` | `@/components/canvas3d` | defaults to empty | MFW-25 / FlowRoot |

## Open questions

None. Owner decisions 21–25 (2026-11-24) answered every question from the previous revision. They are listed under "Owner decisions that apply".

## Decisions

- **D1 — One wide lane on MFW-27's channel centreline, width 2.4, at the water surface. It is stored in MFW-27's
  `LOY_KRATHONG_RIVER_LANES` (same file, name and type).** Row 21 requires one lane. Width 2.4 is the widest centred lane that keeps the
  pier tip (1.25 from the centre) outside the lane, with a 0.05 margin, and it stays inside the 3.2-wide channel. Reusing the channel's
  points means the lane exactly follows the water MFW-27 draws, and there are no competing definitions in either merge order.
- **D2 — Allocation-free `…Into` twins share the exact MFW-8 arithmetic (a refactored `writeLaneFrame`).** That keeps the renderer and the
  Find-My query bit-identical, which also makes `toBe` tests possible.
- **D3 — The time source is `Date.now()` epoch ms, injectable as `now`.** This follows row 6. The R3F clock differs per page.
- **D4 — Bobbing is a stateless sine with a per-id FNV-1a phase, not a spring.** It is deterministic and stores no field. It never moves x/z.
  Last-ulp `Math.sin` differences between engines are cosmetic. `progress` stays bit-identical.
- **D5 — Euler order `YXZ`.** Yaw follows the flow; pitch and roll are local. MFW-19's `UprightAnchor` keeps the candle vertical.
- **D6 — `frameloop="demand"` stays.** `RiverFlow` invalidates while it has items, under reduced motion too, because drift continues (row 23).
- **D7 — `isValidRiverPlacement` in `core/coordinates` is the one validity rule.** Render, Find My, 2D and collision all use it, and
  `fallback2d` does not depend on `core/world`.
- **D8 — No new e2e.** No user flow changes, and production has no river items yet. The existing real-WebGL specs mount the scene with
  an empty `RiverFlow`. MFW-25 or MFW-23 add the first e2e with real items.
- **D9 — Collision is guaranteed on the write paths, not in the renderer.** Row 25 requires equal speed. This card fixes the value
  (`RIVER_DRIFT_SPEED_FACTOR`) and the only coord builder for new krathongs (`riverCoordFromSpot`). MFW-45 must force that speed on
  the server. `RiverFlow` still draws any stored coord as it is ("position computed only from SplinePathCoord"). A stray speed in old
  data can therefore show as drift, but it never changes the math.
- **D10 — Collision uses the time-invariant (arc length, lateral) metric with a curvature margin of 1.1, plus a deterministic grid
  search.**
  - A world-space check would be time-dependent on bends. The parametric metric is constant under equal speed, also across the wrap,
    so a spot that is free once is free for ever.
  - The margin covers inner-bank compression; this is tested in world space.
  - The grid uses steps of a quarter of the spacing, sorted by distance and then by fixed tie-breaks. It gives identical results on
    client and server, whatever the input order.
  - `null` means the zone is full. MFW-25 and MFW-45 must then open the next zone even below 80.
  - Capacity: 103–123 krathongs in simulation, against the cap of 80. That is why the scale is 0.22 and not 0.25 (79–98) or 0.3 (53–68).

## Out of scope

- The release interaction and the bump animation (MFW-23).
- The server endpoint and its re-check (MFW-45).
- Zone loading and pagination (MFW-25).
- The environment and pan (MFW-27).
- The Find-My UI (MFW-30).
- The 2D renderer (MFW-33).
- Instancing (MFW-34).
- Server-time sync.
- Any other festival.

## Risks

- **Client clock skew.** A device clock that is off by *s* seconds shows every krathong shifted by `s × 0.008 × 24.17` units. All
  krathongs shift equally, so spacing and the no-overlap guarantee are unaffected. If the client and server disagree on `now`, MFW-23's
  release-time spot and MFW-45's re-check see the same relative layout. Only their shared offset differs, and the server re-check
  absorbs it. Follow-up: a server-corrected `now`.
- **Capacity is statistical, not a hard bound.** Sequential releases fill the lane less tightly than ideal packing. The worst simulated
  case was 103 (scale 0.22), but adversarial timing could fill earlier. `null` handling in MFW-25 and MFW-45 covers this. If the owner
  later raises the zone cap or the krathong scale, re-run the capacity test, which asserts ≥ 80.
- **Footprint depends on MFW-19's art.** If MFW-19's art grows past radius 1.3, `riverFlow.config.test.ts` fails. Then raise
  `KRATHONG_MODEL_FOOTPRINT_RADIUS` and re-check capacity.
- **The release point is near the lane's body limit.** Its lateral offset is 0.396, and the limit `lim` is 0.381. The first free spot is
  therefore clamped about 0.036 units toward the centre. MFW-23's settle animation covers that.
- **Draw calls at 80+ items.** At about 20 meshes per `KrathongModel`, that is about 1600 draw calls until instancing lands (MFW-34).
  Flag this for r3f-perf-reviewer.
- **Continuous rendering while items exist** costs battery. A tier-based frame cap would need an owner number.
- **Merge conflicts** in `src/components/canvas3d/index.tsx` (MFW-19, MFW-27) and in `loyKrathong.river.config.ts` (MFW-27). The edits
  here are small; rebase after those merge.
- **Reviewer grep noise for invariant A.** The lane control points and the `…Out`/`RiverSpot` types have x/y/z or progress fields.
  They are render-time or search-time values and never reach a persistence path except through `riverCoordFromSpot`.
- **The lane passes through the origin**, where the preview krathong sits today. There is no overlap in production until items are
  passed. MFW-23 moves the preview to the pier tip.
