# MFW-33 [8.1] Flat vector 2D fallback renderer — implementation spec

> Hand-off spec for one card. It is the source of truth for the implementer and the reviewer. If this file and
> `docs/backlog.json` / `docs/spec/open-questions.md` disagree, those files win; say so in the PR.
> Branch: `feat/MFW-33-flat-vector-2d-fallback-renderer` · Jira: MFW-33 · Epic: MFW-32 (Loop 8)
> Labels: `fallback2d` · Extra reviewer: `r3f-perf-reviewer` (the diff touches `src/core/fallback2d/**` and `src/core/world/**`).
> Not a privacy/db card and not an owner-merge card: the 2D view only reads public store data that already exists (no new
> endpoint, no `src/services/**`, no `supabase/**`). A FIX FIRST from any reviewer still blocks the merge.

## 1. Summary (Goal)

Today a `FALLBACK_2D` device (no WebGL, or FPS below the owner threshold) sees no scene at all: only the DOM panels. This card
adds the flat-vector 2D renderer that spec §6.8 Task 8.1 asks for: "หน้าแต่งกระทงแบบซ้อนเลเยอร์ 2D Flat Vector", "ฉากแม่น้ำ 2D มุมมองกึ่ง
Top-down ที่อ่านค่า SplinePathCoord ชุดเดียวกันมาวาดการเคลื่อนที่ของกระทง แตะน้ำเกิดวงน้ำ 2D และกด "ค้นหาของฉัน" เพื่อเลื่อนจอไปหากระทงได้ครบถ้วน", and
"เตรียมโมดูลแปลงพิกัด NormalizedCylindricalCoord → 4-Quadrant 2D View ไว้ใน `core/fallback2d/`". Concretely: an SVG layered krathong preview in
`CUSTOMIZE_OBJECT` (drawn from the same `useBuilderStore.appearance` as the 3D model), a horizontally scrollable top-down SVG river in
`RITUAL_RELEASE` and `SHARED_WORLD_EXPLORE` whose krathongs are placed from the same stored `SplinePathCoord` and the same lane
definitions as the 3D river (bit-identical, invariant B), pooled 2D ripples on a water tap, the anonymous inspect popup on a krathong tap,
Find My scrolling, and a pure `NormalizedCylindricalCoord` ↔ 4-quadrant 2D converter for the Christmas tree (no Christmas UI).
The whole 2D path must stay **three.js-free**: a FALLBACK_2D device must never download the WebGL chunk (MFW-44, MFW-23 D3).

## 2. Prerequisites

Read merged code with `git fetch --depth=50 origin main` and `git show origin/main:<path>` (main = `66bbc69` when this plan was written).

| Card | Merged? | What this card uses |
|---|---|---|
| MFW-8 [1.2] | yes | `SplinePathCoord`, `RiverLaneDefinition`, `SplinePoseOut`, `currentProgress`, `parsePersistableCoord`, `NormalizedCylindricalCoord`, `WorldXZ`, `WorldVec3`, constants in `src/core/coordinates/SplinePathCoord.ts`; `riverTopDown.ts` projection (`createTopDownProjection`, `worldToCanvasInto`, `canvasToWorldXZ`, …) |
| MFW-9 [1.3] | yes | `useDeviceStore` (`profiled`, `qualityTier`, `reducedMotion`), `QualityTier`, `EffectPoolCaps` |
| MFW-19 [4.1] | yes | `assembleKrathong`, `geometrySpecFor`, `materialSpecFor`, `DEFAULT_KRATHONG_APPEARANCE`, `KrathongAppearance`, `serializeKrathongAppearance`, `src/config/krathongModel.config.ts` |
| MFW-20 [4.2] | yes | `CustomizerPanel` (unchanged), `useBuilderStore.appearance` |
| MFW-24 [5.2] | yes | `LOY_KRATHONG_RIVER_LANES`, `LOY_KRATHONG_RIVER_LANE_ID`, `RIVER_KRATHONG_SCALE`, `RIVER_COLLISION_RADIUS`, `RIVER_DRIFT_SPEED_FACTOR`, `getLoyKrathongRiverLanes` (tests only), `splineCoordToCanvasInto` / `getRiverItemCanvasPositionAt` (tests only) |
| MFW-25 [5.3] | yes | `useWorldStore` (`eventId`, `currentZoneId`, `zoneItems`, `focusedCreationId`), `publicCreationsToRiverItems` (`src/core/world/zoneRiverItems.ts`), `ZONE_ITEM_CAP`, FlowRoot's `enterWorld` effect, `ZoneNavigator` |
| MFW-27 [6.1] | yes | `LOY_KRATHONG_RIVER_ENVIRONMENT`, `RIVER_BANK_MATERIAL`, `PIER_DECK_MATERIAL`, `RIVER_ENVIRONMENT_PARTS`, `TOY_SCENE_LIGHTING`, `TOY_MATTE_MATERIALS`; `resolveRiverEnvironment` / `LOY_KRATHONG_RIVER_LAYOUT` (tests only) |
| MFW-28 [6.2] | yes | `createObjectPoolManager`, `writeRippleFrameAt`, `createRippleFrame`, `RIPPLE_LOOK`, `EFFECT_POOL_CAPS`, `RIVER_KRATHONG_TAP_RADIUS`, `MS_PER_SECOND` (gimmicks.config), `InspectPopup`, `findInspectedCreation` |
| MFW-44 | yes | FlowRoot's lazy `SceneViewport` pattern; `getInteractionMode`; `createInputSeparator` (`WORLD_EXPLORE` taps) |
| **MFW-23 [5.1]** | **no (in review)** | see ASSUMED INTERFACE below |
| **MFW-30 [7.1]** | **no (backlog blocker of 8.1)** | see ASSUMED INTERFACE below |
| MFW-34 [8.2] | no (parallel) | nothing; MFW-34 changes `RiverFlow` (3D) only. If it lands first, rebase; no code of this card depends on it |

**Must be merged before you start: MFW-23 and MFW-30 (plus everything above). If either is not on `main`, stop and report `needs-human`.**
Before coding, `rg` every ASSUMED name on `main`. If a merged name or shape differs, use the merged one, change only the adapter line in
this card (`useFlatFocusTarget.ts` for MFW-30; the `FlatRiverView` store selectors for MFW-23) and list every difference in the PR.

- **ASSUMED INTERFACE (from MFW-23 plan):** `useUIStore` state `ritual: RitualState` with `ritual.phase: "IDLE" | "RELEASING" | "RELEASED"` and
  `ritual.saved: SavedRelease | null`, `SavedRelease = { id: string; zoneId: number; coord: SplinePathCoord; createdAtMs: number; serverClockOffsetMs: number; movedByServer: boolean }`
  (`@/core/ritual`, three-free); `excludeOwnAndCap(items, ownId, ownShown, cap = ZONE_ITEM_CAP)` and `isOwnZoneVisible(savedZoneId, visibleZoneId)` from `@/core/ritual`;
  `LOY_KRATHONG_PIER_RELEASE_SPOT = { laneId, progress, lateralOffset }` in `@/config/events/loyKrathong.river.config` (three-free); FlowRoot renders
  `RitualReleasePanel` (button "ปล่อยกระทง", which on FALLBACK_2D completes the ritual instantly) and loads the shared world already in
  `RITUAL_RELEASE`; after the save the ritual stays `RELEASED` with `saved` while the flow is in `SHARED_WORLD_EXPLORE`; the builder
  `appearance` is kept after the save. E2E fixture `mockCreateCreation(page)` / `E2E_CREATION_ID` in `tests/e2e/fixtures/ritualRoutes.ts`
  (POST only, non-POST → `route.fallback()`, 201 body has `zoneId: 1` and `createdAt: now`). `tests/unit/landing-import-graph.test.ts` skips dynamic `import(…)`.
- **ASSUMED INTERFACE (from MFW-30 plan, not written yet):** Find My selects a creation by setting `useWorldStore.focusedCreationId` to its id
  (the field exists on main, documented "Creation the camera follows (set by MFW-30 Find My)"), after loading that creation's zone with
  `loadZone` when another zone is visible. The drawer opens with a button named "ค้นหาของฉัน" (spec §3). If MFW-30 merged a different 2D hook
  (for example a registered "scroll to" callback or a request counter), implement it inside `src/components/canvas2d/useFlatFocusTarget.ts` only and keep
  the behaviour of §6 Step 13.

## 3. Acceptance criteria → checks

AC (verbatim, `docs/backlog.json` story 8.1):

1. **"Layered 2D flat-vector krathong customizer"**
   - Pure layer builder: `buildKrathongLayers2D(appearance, view)` returns one layer per MFW-19 part (base, `KRATHONG_LEAF_COUNT` leaves, one per
     non-null flower, candle, flame, `KRATHONG_INCENSE_MODEL.count` incense), colours from `materialSpecFor`, sorted back-to-front by depth:
     `src/core/fallback2d/krathongLayers2d.test.ts`.
   - In `CUSTOMIZE_OBJECT` on FALLBACK_2D an SVG preview (`data-testid="flat-krathong-preview"`) renders those layers and follows every
     `useBuilderStore.appearance` change made with the existing `CustomizerPanel`: `src/components/canvas2d/FlatKrathongPreview.test.tsx`;
     FlowRoot mounts it only on FALLBACK_2D in CUSTOMIZE: `src/components/ui/FlowRoot.test.tsx`.
   - E2E: `tests/e2e/fallback-2d.spec.ts` → "FALLBACK_2D customizer previews the krathong in flat vector" (360 × 640, no canvas, base change visible).
2. **"Semi top-down 2D river reading the same SplinePathCoord; 2D ripples on tap; Find My Krathong scrolls to it"**
   - Same coord, same lane: the three-free lane twin is bit-identical to MFW-8's three-based lane math (`src/core/fallback2d/flatLane.test.ts`), and the
     2D canvas point of a stored coord is bit-identical to MFW-24's `splineCoordToCanvasInto` and round-trips through MFW-8's `canvasToSplineLocation`
     within 1e-6: `src/core/fallback2d/flatRiverFrame.test.ts`. The scene (water, pier, props) equals MFW-27's resolved layout:
     `src/core/fallback2d/flatRiverScene.test.ts`.
   - The river view draws every zone krathong (≤ `ZONE_ITEM_CAP`) at that point and they drift with time; the user's own krathong is on the pier in
     `RITUAL_RELEASE` and rides the river from its saved coord after the release: `src/components/canvas2d/FlatRiverView.test.tsx`.
     E2E → "FALLBACK_2D river shows the zone and drifts".
   - Ripples: a tap on the water starts a pooled ripple at the tap point (pool = `createObjectPoolManager(FALLBACK_2D_EFFECT_POOL_CAPS)`, at most
     `caps.ripple` at once, oldest recycled, curve = `writeRippleFrameAt`, fade-only under reduced motion); a bank tap or a tap in `RITUAL_RELEASE`
     does nothing: `FlatRiverView.test.tsx`; e2e → "tap on the water ripples".
   - Find My: when `focusedCreationId` names a rendered krathong, the river scroller scrolls so the krathong is centred (clamped), smooth or instant
     under reduced motion, and a highlight ring follows it: `FlatRiverView.test.tsx` and `flatRiverFrame.test.ts` (`flatRiverScrollLeft`);
     e2e → "Find My scrolls to my krathong".
   - Semi top-down = the orthographic top-down map of open question 9 with 3/4-view krathong sprites (§12 D3).
3. **"core/fallback2d includes NormalizedCylindricalCoord → 4-quadrant 2D view converter (prepared for Christmas / CNY)"**
   - `src/core/fallback2d/cylindricalQuadrant.ts` implements spec §4.2 (`cos(angleRad − cameraAngleRad) >= 0`,
     `X_2D = X_center + R_2D(h) * sin(angleRad − cameraAngleRad)`, `Y_2D = Y_tierBase2D − (h * H_tier2D)`), the inverse, the quadrant switcher and the
     Find My quadrant: `src/core/fallback2d/cylindricalQuadrant.test.ts`, including round trips coord ↔ 2D (1e-9) and coord → 3D world
     (`cylindricalCoordToWorld`, new) → orthographic side view = coord → 2D (1e-9): `src/core/coordinates/CylindricalCoord.test.ts` and
     `cylindricalQuadrant.test.ts`. No Christmas config, scene or UI.

Invariant checks (CLAUDE.md):

| Invariant | Check |
|---|---|
| A | No new persisted or sent field. 2D positions (`CanvasPoint`, ripple x/z, scroll offsets) live only in render-time objects/DOM. `tests/unit/no-raw-xyz-persistence.test.ts` stays green; nothing under `src/services/**` changes |
| B | 3D and 2D read the same `SplinePathCoord` + the same `LOY_KRATHONG_RIVER_LANES` definitions; bit-identity tests (`flatLane.test.ts`, `flatRiverFrame.test.ts`, `flatRiverScene.test.ts`); round trip coord → 2D → coord (1e-6); cylindrical coord ↔ 2D ↔ 3D round trips (1e-9); the 2D krathong reads the same `appearance` |
| C | The river is fed only by `publicCreationsToRiverItems` (explicit public field copy); `FlatRiverView.test.tsx` → "never renders private fields" (input rows carrying `ownerTokenHash` / `privateWishText` / `owner_token` values: none of the values appear in the DOM) |
| D | Not touched |
| E | ≤ `ZONE_ITEM_CAP` items (`publicCreationsToRiverItems` + `excludeOwnAndCap`); ripples from `ObjectPoolManager` with the fixed FALLBACK_2D cap; ripple circles are pre-rendered (no node per tap); pools released on zone switch and unmount; the frame loop is cancelled on unmount (`FlatRiverView.test.tsx`) |
| F | The 2D view mounts only when `profiled && qualityTier === "FALLBACK_2D"`; reads `reducedMotion` from `useDeviceStore`: ripple fade-only and instant Find My scroll under reduced motion, drift continues (owner decision 23): tests in `FlatRiverView.test.tsx` |
| G | Not touched (public text shown only through MFW-28's `InspectPopup`, which shows server-approved public text) |
| MFW-44 / MFW-23 D3 | The 2D graph is three-free: `tests/unit/fallback2d-import-graph.test.ts` (static **and** dynamic imports from `src/components/canvas2d/index.ts`); FALLBACK_2D downloads no script containing "WebGLRenderer": `tests/e2e/fallback-2d.spec.ts` and the existing `scene-gating.spec.ts` |

## 4. Owner decisions that apply

Quoted from `docs/spec/open-questions.md` and CLAUDE.md. Do not reopen them.

- Row 4: "80 items per zone".
- Row 5: "FALLBACK_2D below 20 FPS sustained 5 s (2 s warm-up) or no WebGL" — this card only renders when the tier is already FALLBACK_2D.
- Row 6: "speedFactor is progress … per second; createdAt and now are Unix epoch milliseconds … Only + − × ÷ % are used, so results are bit-identical across clients."
- Row 9: "the 2D river is an orthographic top-down projection of the same 3D lane curve — world (x, z) to canvas (x, y) by a uniform scale plus centering
  offset fitted to the lanes' bounds, y dropped (src/core/fallback2d/riverTopDown.ts) … MFW-33 builds the renderer (and any semi-top-down styling) on top of it."
- Row 11: "@react-spring/three" — not used in 2D (it is a three package); 2D animation is time-based curves from `src/core/effects`.
- Row 12: creation ids are kept in LocalStorage (MFW-30 owns the list; this card reads only `focusedCreationId`).
- Row 16: build engine pieces generically; finish Loy Krathong only as far as the private test needs. The cylindrical converter is generic (layout passed in).
- Row 21: "one single wide lane per river". Row 22: "it reappears at the start; the jump happens off-screen" — the 2D map is cropped so the wrap is
  never drawn (§6 Step 8, `FLAT_RIVER_END_MARGIN_PROGRESS`). Row 23: "krathongs keep drifting; only the bobbing stops" (2D has no bobbing).
- Row 25: no overlap; every krathong drifts at the same speed (the 2D view draws what the server stored; it never places).
- Launch plan (CLAUDE.md): Loy Krathong only; no Christmas scene/UI.

Row 9 names MFW-33 in "Decide in": append to that cell (§6 Step 17) `— Decided in MFW-33: semi top-down = the same orthographic top-down map with
3/4-view krathong sprites drawn from the appearance; no extra projection, so the riverTopDown round trip still holds.`

## 5. Files

| Path | New/modify | Purpose |
|---|---|---|
| `src/core/coordinates/splineConstants.ts` | new | Three-free home of the constants now in `SplinePathCoord.ts` (moved verbatim) |
| `src/core/coordinates/splineProgress.ts` | new | Three-free `currentProgress`, `spawnProgressFromCurrent` (moved verbatim) |
| `src/core/coordinates/SplinePathCoord.ts` | modify | Import + re-export the moved names (public API unchanged) |
| `src/core/coordinates/validateCoord.ts` | modify | Import the speed bounds from `./splineConstants` (makes the validator three-free) |
| `src/core/coordinates/CylindricalCoord.ts` (+ `CylindricalCoord.test.ts`, new) | modify | `CylindricalTierGeometry`, `cylindricalCoordToWorld` (spec §4.2 3D formula) |
| `src/core/math/shadeHex.ts` (+ test) | new | Darken a `#RRGGBB` colour (puck sides) |
| `src/core/world/zoneRiverItems.ts` | modify | Three-free imports (deep `validateCoord`), same behaviour |
| `src/config/fallback2d.config.ts` (+ test) | new | 2D view constants, derived values, Thai copy |
| `src/config/performance.config.ts` | modify | `FALLBACK_2D_EFFECT_POOL_CAPS` |
| `src/core/fallback2d/topDownProjection.ts` | new | Three-free projection (moved verbatim from `riverTopDown.ts`) |
| `src/core/fallback2d/riverTopDown.ts` | modify | `export * from "./topDownProjection"` + import what it uses; rest unchanged |
| `src/core/fallback2d/flatLane.ts` (+ test) | new | Three-free twin of the lane curve (bit-identical to three r187 CatmullRomCurve3) |
| `src/core/fallback2d/flatRiverScene.ts` (+ test) | new | Three-free 2D twin of the MFW-27 environment (water outline, pier, props, map bounds) |
| `src/core/fallback2d/flatRiverFrame.ts` (+ test) | new | coord → canvas writer, map projection, scroll helper |
| `src/core/fallback2d/loyKrathongFlatRiver.ts` | new | Singleton `{ lanes, scene, projection }` of the Loy Krathong 2D river |
| `src/core/fallback2d/krathongLayers2d.ts` (+ test) | new | Appearance → layered 3/4-view 2D shapes |
| `src/core/fallback2d/cylindricalQuadrant.ts` (+ test) | new | AC3 converter |
| `src/core/fallback2d/__fixtures__/flatRiverItems.ts` | new | `makePublicCreation` test fixture |
| `src/core/fallback2d/flat.ts` | new | **Three-free barrel** for UI code |
| `src/core/fallback2d/index.ts` | modify | Also export the new modules (the root barrel stays three-based) |
| `src/components/canvas2d/FlatKrathongShapes.tsx` (+ test) | new | Layers → SVG elements |
| `src/components/canvas2d/FlatKrathongPreview.tsx` (+ test) | new | CUSTOMIZE preview |
| `src/components/canvas2d/FlatRiverView.tsx` (+ test) | new | River map, items, ripples, inspect, Find My |
| `src/components/canvas2d/useFlatFocusTarget.ts` | new | MFW-30 adapter |
| `src/components/canvas2d/FlatViewport.tsx` | new | Mode switch, tier guard |
| `src/components/canvas2d/index.ts` | modify | Barrel (keep the comment line) |
| `src/components/ui/FlowRoot.tsx` (+ `FlowRoot.test.tsx`) | modify | Lazy `FlatViewport` on FALLBACK_2D |
| `tests/unit/fallback2d-import-graph.test.ts` | new | 2D graph is three-free |
| `tests/unit/scene-art-constants.test.ts` | modify | Add `src/components/canvas2d` to `ROOTS` (strengthening only) |
| `tests/e2e/fallback-2d.spec.ts` | new | User flows on FALLBACK_2D |
| `docs/spec/open-questions.md` | modify | Row 9 "Decide in" note (one append) |

## 6. Implementation steps (Plan)

"PLACEHOLDER (spec silent)" = the spec gives no value; keep the value given here and list it in the PR under "Decisions" (owner may tune, §11 Q1).
Files under `src/components/canvas2d/**` may contain **no hex colour and no decimal literal** (also in comments; write card ids as `MFW-33`, never "8.1"):
`tests/unit/scene-art-constants.test.ts` enforces it after Step 16. Every number lives in config. Never use the Tailwind class `touch-none` in
`src/components/canvas2d/**` (`scene-gating.spec.ts` and `customizer.spec.ts` use `.touch-none` as the marker of the 3D viewport on FALLBACK_2D).

**Three-free rule (the core of this card).** Every module reachable from `src/components/canvas2d/index.ts` — statically or through `import()` — must not
import `three`, `@react-three/*`, `@react-spring/*`, nor any module that does. In particular **never** value-import from the barrels `@/core/coordinates`,
`@/core/world`, `@/core/fallback2d` (root), nor from `@/core/coordinates/SplinePathCoord`, `@/core/coordinates/riverLaneSet`,
`@/core/world/riverEnvironment`, `@/core/world/riverFlow`, `@/core/world/riverLanes`, `@/components/canvas3d/**`, `@/components/models/**`. Use
`import type` for their types, `@/core/fallback2d/flat` for 2D values, and the deep three-free paths named below. Tests may import three freely.
Reason: MFW-23 D3 lead probe — any lane math import puts the 390 kB three chunk (it contains "WebGLRenderer") into the FALLBACK_2D download.

### Step 1 — `src/core/coordinates/splineConstants.ts` and `splineProgress.ts` (new; moved code, no behaviour change)

`splineConstants.ts`: move **verbatim** (with their comments) from `SplinePathCoord.ts`: `SPAWN_PROGRESS_RANGE`, `LATERAL_OFFSET_RANGE`, `SPEED_FACTOR_MIN`,
`SPEED_FACTOR_MAX`, `MS_PER_SECOND`, `SPLINE_CURVE_TYPE`, `TANGENT_DELTA`, `HORIZONTAL_TANGENT_EPSILON`, `LOCATE_COARSE_SAMPLES`, `LOCATE_BISECTION_ITERATIONS`.
No imports. First line: `/** Three-free spline constants (moved from SplinePathCoord.ts in MFW-33 so the 2D fallback can use them without three). */`

`splineProgress.ts`: move **verbatim** the private `elapsedMsOf` and the exported `currentProgress`, `spawnProgressFromCurrent` (with their JSDoc). Imports:
```ts
import { wrap01 } from "@/core/math/wrap01";
import type { SplinePathCoord } from "./SplinePathCoord"; // type-only: no runtime cycle
import { MS_PER_SECOND } from "./splineConstants";
```

`SplinePathCoord.ts` (modify): delete the moved code; add at the top (after the `three` import):
```ts
export {
  SPAWN_PROGRESS_RANGE, LATERAL_OFFSET_RANGE, SPEED_FACTOR_MIN, SPEED_FACTOR_MAX, MS_PER_SECOND, SPLINE_CURVE_TYPE,
  TANGENT_DELTA, HORIZONTAL_TANGENT_EPSILON, LOCATE_COARSE_SAMPLES, LOCATE_BISECTION_ITERATIONS,
} from "./splineConstants";
export { currentProgress, spawnProgressFromCurrent } from "./splineProgress";
```
and a separate `import { … } from "./splineConstants"` / `import { currentProgress, spawnProgressFromCurrent } from "./splineProgress"` with **only** the names the
remaining code uses (eslint flags unused imports). Do **not** add `export * from "./splineConstants"` or `"./splineProgress"` to `src/core/coordinates/index.ts`
(the names already reach the barrel through `SplinePathCoord.ts`; a second path would be a duplicate export).

`validateCoord.ts` (modify one line): `import { SPEED_FACTOR_MAX, SPEED_FACTOR_MIN } from "./splineConstants";`.

All existing coordinate tests must pass unchanged.

### Step 2 — `src/core/coordinates/CylindricalCoord.ts` (modify: append)

Replace the comment line "Interface and ranges only; converters are out of scope for MFW-8." with "3D converter added in MFW-33 (spec §4.2 formula only)."
Append (three-free; `import type { WorldVec3 } from "./types";`):
```ts
/** World geometry of one tree tier (spec §4.2: R_bottom, R_top, Y_tierBase, H_tier). Scene config, never persisted. */
export interface CylindricalTierGeometry {
  readonly tierId: number;
  readonly baseY: number;       // Y_tierBase, world units
  readonly height: number;      // H_tier, finite > 0
  readonly bottomRadius: number; // R_bottom = R(0), finite >= 0
  readonly topRadius: number;    // R_top = R(1), finite >= 0
}

/**
 * Spec §4.2: R(h) = lerp(R_bottom, R_top, h); X = R(h)·sin(angleRad), Y = Y_tierBase + h·H_tier, Z = R(h)·cos(angleRad).
 * Derived at render time, NEVER persisted (invariant A). Surface-normal orientation and scale lock are out of scope (Christmas card).
 */
export function cylindricalCoordToWorld(coord: NormalizedCylindricalCoord, tier: CylindricalTierGeometry): WorldVec3;
```
Behaviour: `coord.tierId !== tier.tierId` → `RangeError("coord.tierId does not match tier")`; any of `coord.angleDeg`, `coord.heightRatio`, `tier.baseY`,
`tier.height`, `tier.bottomRadius`, `tier.topRadius` not finite → `RangeError("cylindrical inputs must be finite")`. Then
`h = coord.heightRatio; r = tier.bottomRadius + (tier.topRadius - tier.bottomRadius) * h; a = (coord.angleDeg * Math.PI) / HALF_TURN_DEG;`
return `{ x: r * Math.sin(a), y: tier.baseY + h * tier.height, z: r * Math.cos(a) }` (`const HALF_TURN_DEG = 180;` module-local).

### Step 3 — `src/core/math/shadeHex.ts` (new)

```ts
/** "#RRGGBB" (any case) with each channel × factor, rounded and clamped to 0..255 → lowercase "#rrggbb". Invalid hex or non-finite factor → input unchanged. */
export function shadeHex(hex: string, factor: number): string;
```
Regex `/^#([0-9a-fA-F]{6})$/`; channel `c = parseInt(pair, 16)`; `v = Math.min(255, Math.max(0, Math.round(c * factor)))`; output `v.toString(16).padStart(2, "0")`.

### Step 4 — `src/core/world/zoneRiverItems.ts` (modify imports only; behaviour identical)

Replace `import { isValidRiverPlacement, parsePersistableCoord, type SplinePathCoord } from "@/core/coordinates";` with
```ts
import { parsePersistableCoord } from "@/core/coordinates/validateCoord"; // three-free (MFW-33): the 2D fallback imports this module
import type { SplinePathCoord } from "@/core/coordinates/SplinePathCoord";
```
and `if (!isValidRiverPlacement({ coord, createdAtMs })) continue;` with `if (!Number.isFinite(createdAtMs)) continue;`
(equivalent: `isValidRiverPlacement` = finite `createdAtMs` ∧ `parsePersistableCoord(coord).ok` ∧ mode `SPLINE_PATH`, and the last two are checked one line above).
`src/core/world/index.ts` is unchanged; existing `zoneRiverItems.test.ts` must pass unchanged.

### Step 5 — `src/config/performance.config.ts` (modify: append under the MFW-28 block)

```ts
// Technical numbers (lead decision, MFW-33)

/** Pooled 2D effects on FALLBACK_2D (invariant E): the weakest 3D tier's caps, so a weak device never runs more effects in 2D than on LOW. */
export const FALLBACK_2D_EFFECT_POOL_CAPS: EffectPoolCaps = EFFECT_POOL_CAPS.LOW;
```

### Step 6 — `src/config/fallback2d.config.ts` (new; config imports only)

```ts
import { CAMERA_FLIGHT_OFFSET, HIGHLIGHT_RING_COLOR, HIGHLIGHT_RING_OPACITY, HIGHLIGHT_RING_SIZES } from "./camera.config";
import { MS_PER_SECOND, RIVER_KRATHONG_TAP_RADIUS } from "./gimmicks.config";
import { RIVER_KRATHONG_SCALE } from "./riverFlow.config";
import { TOY_MATTE_MATERIALS, TOY_SCENE_LIGHTING } from "./scene.config";
import { PIER_DECK_MATERIAL, RIVER_BANK_MATERIAL, RIVER_ENVIRONMENT_PARTS } from "./events/loyKrathong.river.config";

/** Flat vector 2D fallback (spec §6.8 Task 8.1, MFW-33). PLACEHOLDER = spec silent (art/feel), owner may tune (plan §11 Q1). */

/** 3/4 view of the 2D krathong = the 3D camera's viewing angles (derived from CAMERA_FLIGHT_OFFSET, no new number). */
export const FLAT_KRATHONG_VIEW_AZIMUTH_RAD = Math.atan2(CAMERA_FLIGHT_OFFSET[0], CAMERA_FLIGHT_OFFSET[2]);
export const FLAT_KRATHONG_VIEW_ELEVATION_RAD = Math.atan2(
  CAMERA_FLIGHT_OFFSET[1],
  Math.hypot(CAMERA_FLIGHT_OFFSET[0], CAMERA_FLIGHT_OFFSET[2]),
);
/** Puck sides are the top colour × this (flat shading cue). PLACEHOLDER. */
export const FLAT_KRATHONG_SIDE_SHADE = 0.8;
/** CUSTOMIZE preview viewBox, model units: square of half-size halfExtent centred centerLift above the model origin. PLACEHOLDER. */
export const FLAT_KRATHONG_PREVIEW_VIEW = Object.freeze({ halfExtent: 1.7, centerLift: 0.25 });

/** River map height in CSS px (= the 3D viewport's Tailwind h-64). The scale is fitted to it; the width follows. PLACEHOLDER. */
export const FLAT_RIVER_VIEW_HEIGHT_PX = 256;
/** Map padding in CSS px. Lead decision: none (the map is clipped by the scroller). */
export const FLAT_RIVER_PADDING_PX = 0;
/** World units of bank drawn on each side of the water. PLACEHOLDER. */
export const FLAT_RIVER_VISIBLE_BANK_DEPTH = 1.2;
/**
 * Lane progress cropped at each end of the map so the % 1 wrap is never drawn (owner decision 22). PLACEHOLDER; must hide a whole
 * sprite (flatRiverScene.test.ts pins margin × lane length > RIVER_COLLISION_RADIUS).
 */
export const FLAT_RIVER_END_MARGIN_PROGRESS = 0.05;
/** Frame budget of the 2D river (transform-only writes). PLACEHOLDER lead value. */
export const FLAT_RIVER_TARGET_FPS = 30;
export const FLAT_RIVER_FRAME_INTERVAL_MS = MS_PER_SECOND / FLAT_RIVER_TARGET_FPS;
/** World units per model unit of a river sprite = the 3D river krathong scale (invariant B: same size in both views). */
export const FLAT_RIVER_SPRITE_SCALE = RIVER_KRATHONG_SCALE;
/** Tap target radius of a river krathong in world units = MFW-28's 3D hit proxy (model units) × river scale. */
export const FLAT_RIVER_TAP_RADIUS = RIVER_KRATHONG_TAP_RADIUS * RIVER_KRATHONG_SCALE;
/** Find My ring around a river krathong, world units (MFW-17 krathong ring × river scale) and look. */
export const FLAT_RIVER_HIGHLIGHT = Object.freeze({
  innerRadius: HIGHLIGHT_RING_SIZES.krathong.innerRadius * RIVER_KRATHONG_SCALE,
  outerRadius: HIGHLIGHT_RING_SIZES.krathong.outerRadius * RIVER_KRATHONG_SCALE,
  color: HIGHLIGHT_RING_COLOR,
  opacity: HIGHLIGHT_RING_OPACITY,
});
/** Prop footprints, world units (from the 3D part specs). */
export const FLAT_RIVER_PROP_SIZES = Object.freeze({
  houseHalfWidth: RIVER_ENVIRONMENT_PARTS.houseBody.geometry.width / 2,
  houseHalfDepth: RIVER_ENVIRONMENT_PARTS.houseBody.geometry.depth / 2,
  treeRadius: RIVER_ENVIRONMENT_PARTS.treeCanopy.geometry.radius,
  lampRadius: RIVER_ENVIRONMENT_PARTS.lampHead.geometry.radius,
});
/** Unlit flat colours = the 3D materials' base colours (no new colour). */
export const FLAT_VIEW_COLORS = Object.freeze({
  background: TOY_SCENE_LIGHTING.background,
  bank: RIVER_BANK_MATERIAL.color,
  water: TOY_MATTE_MATERIALS.water.color,
  pier: PIER_DECK_MATERIAL.color,
  house: RIVER_ENVIRONMENT_PARTS.houseBody.material.color,
  roof: RIVER_ENVIRONMENT_PARTS.houseRoof.material.color,
  tree: RIVER_ENVIRONMENT_PARTS.treeCanopy.material.color,
  lamp: RIVER_ENVIRONMENT_PARTS.lampHead.material.color,
});
/** Accessible names. DRAFT Thai copy (owner review, §11 Q4). */
export const FLAT_VIEW_COPY = Object.freeze({
  previewLabel: "ตัวอย่างกระทง (ภาพ 2 มิติ)",
  riverLabel: "แม่น้ำลอยกระทง (ภาพ 2 มิติ)",
  riverScrollLabel: "เลื่อนดูแม่น้ำ",
});
/** Absolute tolerance of the cylindrical inverse (ratio units for heightRatio and sin). Technical. */
export const CYLINDRICAL_QUADRANT_EPSILON = 1e-9;
```
If `houseRoof.material` or `geometry.depth` do not type-check as written (check the `as const satisfies` literal types on main), read them the same way the
existing MFW-27 code does; do not add numbers.

### Step 7 — `src/core/fallback2d/topDownProjection.ts` (new) and `riverTopDown.ts` (modify)

Move **verbatim** from `riverTopDown.ts`: `CanvasPoint`, `BoundsXZ`, `CanvasViewport`, `TopDownProjection`, `createTopDownProjection`, `worldToCanvas`,
`canvasToWorldXZ`, `CanvasPointOut`, `createCanvasPointOut`, `worldToCanvasInto` (with their comments). Its only import:
`import type { WorldXZ } from "@/core/coordinates/types";`.
In `riverTopDown.ts`: delete those, add `export * from "./topDownProjection";` and import the names it still uses from `"./topDownProjection"`. Everything
else (`BOUNDS_SAMPLES`, `computeLaneBoundsXZ`, `splineCoordToCanvas`, `canvasToSplineLocation`, `splineCoordToCanvasInto`, `createLaneSetProjection`,
`getRiverItemCanvasPositionAt`) stays. Existing `riverTopDown*.test.ts` must pass unchanged.

### Step 8 — `src/core/fallback2d/flatLane.ts` (new; three-free twin of the lane curve)

Lead probe (three 0.187.0): this port matched `CatmullRomCurve3.getPointAt` on 30 003 samples and `splineProgressToPoseInto` on 80 020 poses
(STRAIGHT/S/LOOP fixtures + the product lane) with **zero** bit differences. Keep every expression and its order exactly as below.

```ts
import type { RiverLaneDefinition, SplinePathCoord, SplinePoseOut } from "@/core/coordinates/SplinePathCoord";
import { HORIZONTAL_TANGENT_EPSILON, TANGENT_DELTA } from "@/core/coordinates/splineConstants";
import { currentProgress } from "@/core/coordinates/splineProgress";
import type { WorldVec3 } from "@/core/coordinates/types";
import { wrap01 } from "@/core/math/wrap01";

/** Mirrors three r187 internals (Curve.arcLengthDivisions; CatmullRomCurve3 'centripetal' exponent and repeated-point guard). Pinned by flatLane.test.ts. */
export const CURVE_ARC_LENGTH_DIVISIONS = 200;
export const CATMULL_ROM_CENTRIPETAL_EXPONENT = 0.25;
export const CATMULL_ROM_REPEATED_POINT_EPSILON = 1e-4;

export interface MutableVec3 { x: number; y: number; z: number; }
/** Same lane as createRiverLane(def), without three. `arcLengths` = three's getLengths() cache (length divisions + 1). */
export interface FlatLane {
  readonly laneId: number;
  readonly width: number;
  readonly closed: boolean;
  readonly points: readonly WorldVec3[];   // frozen copies of the control points
  readonly arcLengths: readonly number[];  // frozen
}
export interface FlatLaneSet { readonly lanes: readonly FlatLane[]; get(laneId: number): FlatLane | undefined; }
/** Lane frame at a progress: centreline, unit tangent, unit horizontal right (y = 0). Derived, NEVER persisted. */
export interface FlatLaneFrameOut { cx: number; cy: number; cz: number; tx: number; ty: number; tz: number; rx: number; rz: number; }

export function createFlatLane(def: RiverLaneDefinition): FlatLane;
export function createFlatLaneSet(defs: readonly RiverLaneDefinition[]): FlatLaneSet;
export function flatLanePointAt(lane: FlatLane, u: number, out: MutableVec3): MutableVec3;        // = curve.getPointAt(u)
export function createFlatLaneFrameOut(): FlatLaneFrameOut;
export function flatLaneFrameInto(lane: FlatLane, progress: number, out: FlatLaneFrameOut): FlatLaneFrameOut; // = splineProgressToWorld(lane, p, 0)
export function createFlatPoseOut(): SplinePoseOut;                                               // { x: 0, y: 0, z: 0, yawRad: 0 }
export function flatProgressToPoseInto(lane: FlatLane, progress: number, lateralOffset: number, out: SplinePoseOut): SplinePoseOut;
export function flatCoordToPoseInto(coord: SplinePathCoord, lane: FlatLane, createdAtMs: number, nowMs: number, out: SplinePoseOut): SplinePoseOut;
```

Implementation (module-level scratch, allocation-free after creation; not re-entrant, like the 3D twin):
```ts
const cx = [0, 0, 0, 0], cy = [0, 0, 0, 0], cz = [0, 0, 0, 0];
const extrapolatedStart: MutableVec3 = { x: 0, y: 0, z: 0 };
const extrapolatedEnd: MutableVec3 = { x: 0, y: 0, z: 0 };
const scratchA: MutableVec3 = { x: 0, y: 0, z: 0 };
const scratchB: MutableVec3 = { x: 0, y: 0, z: 0 };
const scratchC: MutableVec3 = { x: 0, y: 0, z: 0 };
const tangent = { x: 0, y: 0, z: 0 };
const right = { x: 0, z: 0 };

function initNonuniform(x0: number, x1: number, x2: number, x3: number, dt0: number, dt1: number, dt2: number, c: number[]): void {
  let t1 = (x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1;
  let t2 = (x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2;
  t1 *= dt1;
  t2 *= dt1;
  c[0] = x1; c[1] = t1; c[2] = -3 * x1 + 3 * x2 - 2 * t1 - t2; c[3] = 2 * x1 - 2 * x2 + t1 + t2;
}
function calc(c: number[], t: number): number { const t2 = t * t; const t3 = t2 * t; return c[0] + c[1] * t + c[2] * t2 + c[3] * t3; }
function distSq(a: WorldVec3, b: WorldVec3): number { const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z; return dx * dx + dy * dy + dz * dz; }

/** = CatmullRomCurve3(points, closed, "centripetal").getPoint(t). */
function curvePoint(pts: readonly WorldVec3[], closed: boolean, t: number, out: MutableVec3): MutableVec3 {
  const l = pts.length;
  const p = (l - (closed ? 0 : 1)) * t;
  let intPoint = Math.floor(p);
  let weight = p - intPoint;
  if (closed) intPoint += intPoint > 0 ? 0 : (Math.floor(Math.abs(intPoint) / l) + 1) * l;
  else if (weight === 0 && intPoint === l - 1) { intPoint = l - 2; weight = 1; }
  let p0: WorldVec3;
  let p3: WorldVec3;
  if (closed || intPoint > 0) p0 = pts[(intPoint - 1) % l];
  else {
    extrapolatedStart.x = pts[0].x - pts[1].x + pts[0].x;
    extrapolatedStart.y = pts[0].y - pts[1].y + pts[0].y;
    extrapolatedStart.z = pts[0].z - pts[1].z + pts[0].z;
    p0 = extrapolatedStart;
  }
  const p1 = pts[intPoint % l];
  const p2 = pts[(intPoint + 1) % l];
  if (closed || intPoint + 2 < l) p3 = pts[(intPoint + 2) % l];
  else {
    extrapolatedEnd.x = pts[l - 1].x - pts[l - 2].x + pts[l - 1].x;
    extrapolatedEnd.y = pts[l - 1].y - pts[l - 2].y + pts[l - 1].y;
    extrapolatedEnd.z = pts[l - 1].z - pts[l - 2].z + pts[l - 1].z;
    p3 = extrapolatedEnd;
  }
  let dt0 = Math.pow(distSq(p0, p1), CATMULL_ROM_CENTRIPETAL_EXPONENT);
  let dt1 = Math.pow(distSq(p1, p2), CATMULL_ROM_CENTRIPETAL_EXPONENT);
  let dt2 = Math.pow(distSq(p2, p3), CATMULL_ROM_CENTRIPETAL_EXPONENT);
  if (dt1 < CATMULL_ROM_REPEATED_POINT_EPSILON) dt1 = 1;
  if (dt0 < CATMULL_ROM_REPEATED_POINT_EPSILON) dt0 = dt1;
  if (dt2 < CATMULL_ROM_REPEATED_POINT_EPSILON) dt2 = dt1;
  initNonuniform(p0.x, p1.x, p2.x, p3.x, dt0, dt1, dt2, cx);
  initNonuniform(p0.y, p1.y, p2.y, p3.y, dt0, dt1, dt2, cy);
  initNonuniform(p0.z, p1.z, p2.z, p3.z, dt0, dt1, dt2, cz);
  out.x = calc(cx, weight); out.y = calc(cy, weight); out.z = calc(cz, weight);
  return out;
}

/** = Curve.getUtoTmapping(u) with arcLengths = getLengths(). */
function uToT(arc: readonly number[], u: number): number {
  const il = arc.length;
  const target = u * arc[il - 1];
  let low = 0, high = il - 1, i = 0;
  while (low <= high) {
    i = Math.floor(low + (high - low) / 2);
    const comparison = arc[i] - target;
    if (comparison < 0) low = i + 1;
    else if (comparison > 0) high = i - 1;
    else { high = i; break; }
  }
  i = high;
  if (arc[i] === target) return i / (il - 1);
  const before = arc[i];
  const after = arc[i + 1];
  return (i + (target - before) / (after - before)) / (il - 1);
}
```
- `createFlatLane(def)`: the **same validation, in the same order, with the same `RangeError` messages** as `createRiverLane` (copy them from
  `SplinePathCoord.ts`: laneId integer ≥ 0; width finite > 0; ≥ 2 points (≥ 3 if closed); finite coordinates; consecutive points differ; closed: last ≠ first).
  Then `points = Object.freeze(def.controlPoints.map((p) => Object.freeze({ x: p.x, y: p.y, z: p.z })))`; arc lengths exactly like three's `getLengths()`:
  `arc = [0]; last = curvePoint(points, closed, 0, {…}); sum = 0; for d in 1..CURVE_ARC_LENGTH_DIVISIONS: cur = curvePoint(points, closed, d / DIV, new object);
  sum += Math.sqrt(distSq(cur, last)); arc.push(sum); last = cur;` (allocation here is fine: creation time). Return a frozen `FlatLane`.
- `createFlatLaneSet(defs)`: same checks/messages as `createRiverLaneSet` (empty → `"at least one lane definition is required"`; duplicate →
  `` `duplicate laneId: ${id}` ``); frozen `{ lanes, get }` backed by a `Map`.
- `flatLanePointAt(lane, u, out)` = `curvePoint(lane.points, lane.closed, uToT(lane.arcLengths, u), out)`.
- Private `laneParam(lane, progress)` and `clampLateral` = the 3D versions verbatim (`lane.closed ? wrap01(p) : p >= 0 && p <= 1 ? p : wrap01(p)`;
  `Math.min(0.5, Math.max(-0.5, lat))`).
- Private `writeFrame(lane, u)` (twin of `writeLaneFrame`): `a = u - TANGENT_DELTA; b = u + TANGENT_DELTA;` closed → `wrap01` both, else `a = Math.max(0, a); b = Math.min(1, b)`;
  `flatLanePointAt(lane, a, scratchA); flatLanePointAt(lane, b, scratchB);`
  `let bx = scratchB.x - scratchA.x, by = scratchB.y - scratchA.y, bz = scratchB.z - scratchA.z;`
  `const inv = 1 / (Math.sqrt(bx * bx + by * by + bz * bz) || 1); bx *= inv; by *= inv; bz *= inv;` (three's `normalize()` = `multiplyScalar(1 / (length || 1))`)
  `const h = Math.hypot(bx, bz); if (h < HORIZONTAL_TANGENT_EPSILON) throw new Error("lane tangent is vertical");`
  `tangent = { bx, by, bz }; right.x = -bz / h; right.z = bx / h;`
- `flatProgressToPoseInto`: non-finite `progress`/`lateralOffset` → `RangeError("progress and lateralOffset must be finite")`; `u = laneParam`; `lat = clampLateral`;
  `flatLanePointAt(lane, u, scratchC); writeFrame(lane, u); d = lat * lane.width;`
  `out.x = scratchC.x + right.x * d; out.y = scratchC.y; out.z = scratchC.z + right.z * d; out.yawRad = Math.atan2(tangent.x, tangent.z); return out;`
- `flatCoordToPoseInto`: `coord.laneId !== lane.laneId` → `RangeError("coord.laneId does not match lane")`; then
  `flatProgressToPoseInto(lane, currentProgress(coord, createdAtMs, nowMs), coord.lateralOffset, out)`.
- `flatLaneFrameInto(lane, progress, out)`: twin of MFW-27's `riverFrameAt` precondition: non-finite or outside [0, 1] → `RangeError("progress must be finite and in [0, 1]")`;
  `u = laneParam(lane, progress); flatLanePointAt(lane, u, scratchC); writeFrame(lane, u);` write `cx, cy, cz` from `scratchC`, `tx, ty, tz` from `tangent`, `rx, rz` from `right`.

### Step 9 — `src/core/fallback2d/flatRiverScene.ts` (new; three-free twin of the 2D-relevant part of `resolveRiverEnvironment`)

```ts
import type { WorldXZ } from "@/core/coordinates/types";
import type { BankPlacement, RiverEnvironmentDefinition } from "@/core/world/riverEnvironment"; // type-only
import { createFlatLane, createFlatLaneFrameOut, flatLaneFrameInto, type FlatLane } from "./flatLane";
import type { BoundsXZ } from "./topDownProjection";

/** = RIVER_CHANNEL_CURVE_ID in src/core/world/riverEnvironment.ts (pinned by flatRiverScene.test.ts; value import would load three). */
export const FLAT_RIVER_CHANNEL_CURVE_ID = 0;

export interface FlatProp { readonly x: number; readonly z: number; readonly scale: number; readonly yawRad: number; }
export interface FlatRiverScene {
  readonly channel: FlatLane;
  /** Closed polygon of the visible water (channel ±width/2): left edge at progress 0→1, then right edge 1→0. */
  readonly waterOutline: readonly WorldXZ[];
  /** Deck rectangle seen from above: [bankEnd − flow·w/2, bankEnd + flow·w/2, tip + flow·w/2, tip − flow·w/2]. */
  readonly pierDeck: readonly WorldXZ[];
  readonly pierTip: WorldXZ;
  readonly houses: readonly FlatProp[];
  readonly trees: readonly FlatProp[];
  readonly lamps: readonly FlatProp[];
  /** Map bounds: water ± visibleBankDepth, cropped by endMarginProgress at both lane ends (owner decision 22). */
  readonly bounds: BoundsXZ;
}
export function resolveFlatRiverScene(def: RiverEnvironmentDefinition, visibleBankDepth: number, endMarginProgress: number): FlatRiverScene;
```
Algorithm (all objects frozen; same expressions as MFW-27 so results are bit-identical):
1. `def.channel.controlPoints.some((p) => p.y !== 0)` → `RangeError("river channel control points must have y === 0")`. `visibleBankDepth` not finite or ≤ 0 →
   `RangeError("visibleBankDepth must be finite and > 0")`. `endMarginProgress` not finite, < 0 or ≥ 0.5 → `RangeError("endMarginProgress must be in [0, 0.5)")`.
2. `channel = createFlatLane({ laneId: FLAT_RIVER_CHANNEL_CURVE_ID, controlPoints: def.channel.controlPoints, width: def.channel.width, closed: false })`;
   `half = def.channel.width / 2; n = def.ribbonSegments; f = createFlatLaneFrameOut()`.
3. Water: for `i = 0..n`: `flatLaneFrameInto(channel, i / n, f)`; `left[i] = { x: f.cx + f.rx * -half, z: f.cz + f.rz * -half }`,
   `right[i] = { x: f.cx + f.rx * half, z: f.cz + f.rz * half }` (MFW-27 ribbon: `c.x + right.x * offset`). `waterOutline = [...left, ...right.reverse()]`.
4. Bounds: `outer = half + visibleBankDepth`; for `i = 0..n`: `p = endMarginProgress + (1 - 2 * endMarginProgress) * (i / n)`; frame at `p`; include
   `(f.cx + f.rx * s * outer, f.cz + f.rz * s * outer)` for `s ∈ {-1, 1}` in min/max x/z.
5. Props: `resolve = (p: BankPlacement): FlatProp` → frame at `p.progress`; `d = p.side * (half + p.setback)`;
   `{ x: f.cx + f.rx * d, z: f.cz + f.rz * d, scale: p.scale, yawRad: Math.atan2(-p.side * f.rx, -p.side * f.rz) + p.yawOffsetRad }`
   (= `resolveBankPlacement` + `facingWaterYaw`). Map `def.houses`, `def.trees`, `def.lamps`.
6. Pier: frame at `def.pier.progress`; `flow = { x: f.rz, z: -f.rx }`; `at = (lat) => ({ x: f.cx + f.rx * def.pier.side * lat, z: f.cz + f.rz * def.pier.side * lat })`;
   `bankEnd = half + def.pier.onBankLength; tipLat = half - def.pier.overWaterLength; w = def.pier.width / 2`; corners
   `[at(bankEnd) − flow·w, at(bankEnd) + flow·w, at(tipLat) + flow·w, at(tipLat) − flow·w]` (component-wise `x ± flow.x * w`, `z ± flow.z * w`);
   `pierTip = at(tipLat)`.

### Step 10 — `src/core/fallback2d/flatRiverFrame.ts` (new)

```ts
import type { SplinePathCoord, SplinePoseOut } from "@/core/coordinates/SplinePathCoord";
import { createFlatPoseOut, flatCoordToPoseInto, flatProgressToPoseInto, type FlatLane } from "./flatLane";
import { createTopDownProjection, worldToCanvasInto, type BoundsXZ, type CanvasPointOut, type TopDownProjection } from "./topDownProjection";

export interface FlatCanvasScratch { readonly pose: SplinePoseOut; }
export function createFlatCanvasScratch(): FlatCanvasScratch;     // { pose: createFlatPoseOut() }
/** Allocation-free 2D twin of splineCoordToCanvasInto (bit-identical). */
export function flatCoordToCanvasInto(coord: SplinePathCoord, lane: FlatLane, createdAtMs: number, nowMs: number,
  projection: TopDownProjection, out: CanvasPointOut, scratch: FlatCanvasScratch): CanvasPointOut;
/** Same for a lane location (pier preview). */
export function flatProgressToCanvasInto(lane: FlatLane, progress: number, lateralOffset: number,
  projection: TopDownProjection, out: CanvasPointOut, scratch: FlatCanvasScratch): CanvasPointOut;
/** Fixed-height map: scale = (heightPx − 2·paddingPx) / spanZ, width = ceil(spanX·scale + 2·paddingPx). */
export function createFlatRiverProjection(bounds: BoundsXZ, heightPx: number, paddingPx: number): TopDownProjection;
/** scrollLeft that centres canvas x `targetX`: clamp(targetX − viewportWidth/2, 0, max(0, contentWidth − viewportWidth)); any non-finite input → 0. */
export function flatRiverScrollLeft(targetX: number, viewportWidth: number, contentWidth: number): number;
```
- `flatCoordToCanvasInto`: `flatCoordToPoseInto(coord, lane, createdAtMs, nowMs, scratch.pose); return worldToCanvasInto(scratch.pose, projection, out);`
- `createFlatRiverProjection`: `heightPx`/`paddingPx` not finite, `paddingPx < 0` or `heightPx <= 2 * paddingPx` → `RangeError("heightPx must be finite and > 2 × paddingPx")`;
  `spanZ = bounds.maxZ - bounds.minZ`, `spanX = bounds.maxX - bounds.minX`, either ≤ 0 or non-finite → `RangeError("bounds must have positive span on both axes")`;
  then `createTopDownProjection(bounds, { width, height: heightPx, paddingPx })`.

### Step 11 — `src/core/fallback2d/loyKrathongFlatRiver.ts` (new)

```ts
import { LOY_KRATHONG_RIVER_ENVIRONMENT, LOY_KRATHONG_RIVER_LANES } from "@/config/events/loyKrathong.river.config";
import { FLAT_RIVER_END_MARGIN_PROGRESS, FLAT_RIVER_PADDING_PX, FLAT_RIVER_VIEW_HEIGHT_PX, FLAT_RIVER_VISIBLE_BANK_DEPTH } from "@/config/fallback2d.config";

export interface LoyKrathongFlatRiver { readonly lanes: FlatLaneSet; readonly scene: FlatRiverScene; readonly projection: TopDownProjection; }
/** The ONE 2D river of Loy Krathong, built from the same lane and environment definitions as 3D (invariant B). Built on first call, then the same object. */
export function getLoyKrathongFlatRiver(): LoyKrathongFlatRiver;
```
`lanes = createFlatLaneSet(LOY_KRATHONG_RIVER_LANES)`, `scene = resolveFlatRiverScene(LOY_KRATHONG_RIVER_ENVIRONMENT, FLAT_RIVER_VISIBLE_BANK_DEPTH, FLAT_RIVER_END_MARGIN_PROGRESS)`,
`projection = createFlatRiverProjection(scene.bounds, FLAT_RIVER_VIEW_HEIGHT_PX, FLAT_RIVER_PADDING_PX)`; frozen; cached in a module `let`.

### Step 12 — `src/core/fallback2d/krathongLayers2d.ts` (new; pure, three-free)

```ts
import { FLAT_KRATHONG_SIDE_SHADE } from "@/config/fallback2d.config";
import { assembleKrathong } from "@/core/customization/krathongAssembler";
import { geometrySpecFor, materialSpecFor } from "@/core/customization/krathongAssetKeys";
import type { KrathongAppearance, KrathongPartRole } from "@/core/customization/types";
import { shadeHex } from "@/core/math/shadeHex";

/** Orthographic 3/4 view: camera azimuth/elevation around the model, plus the model's own yaw (three rotation.y). */
export interface FlatKrathongView { readonly azimuthRad: number; readonly elevationRad: number; readonly modelYawRad: number; }
interface LayerBase { readonly id: string; readonly role: KrathongPartRole; readonly depth: number; readonly fill: string; }
/** Model units, screen x right, screen y DOWN, origin = projected model origin. Derived at render time, NEVER persisted. */
export type KrathongLayer2D =
  | (LayerBase & { readonly kind: "ellipse"; readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number })
  | (LayerBase & { readonly kind: "triangle"; readonly points: readonly [number, number, number, number, number, number] })
  | (LayerBase & { readonly kind: "puck"; readonly cx: number; readonly topY: number; readonly bottomY: number; readonly topRx: number;
      readonly topRy: number; readonly bottomRx: number; readonly bottomRy: number; readonly sideFill: string });
export interface ProjectedPoint2D { readonly x: number; readonly y: number; readonly depth: number; }

export function projectModelPoint(p: readonly [number, number, number], view: FlatKrathongView): ProjectedPoint2D;
export function buildKrathongLayers2D(appearance: KrathongAppearance, view: FlatKrathongView): readonly KrathongLayer2D[];
/** Side of a puck: bottom front half-arc + straight sides to the top ellipse. */
export function puckSidePath(layer: Extract<KrathongLayer2D, { kind: "puck" }>): string;
/** "x0,y0 x1,y1 x2,y2". */
export function trianglePoints(layer: Extract<KrathongLayer2D, { kind: "triangle" }>): string;
```
- `projectModelPoint([x, y, z], { azimuthRad: α, elevationRad: φ, modelYawRad: ρ })`:
  `xw = x * cos ρ + z * sin ρ; zw = -x * sin ρ + z * cos ρ;` (three `rotation.y = ρ`)
  `sx = xw * cos α - zw * sin α; zt = xw * sin α + zw * cos α;` (zt = toward the camera)
  return `{ x: sx, y: -y * cos φ + zt * sin φ, depth: zt * cos φ + y * sin φ }` (larger depth = nearer, drawn later).
- `buildKrathongLayers2D(appearance, view)`: `assembly = assembleKrathong(appearance)`; parts = `assembly.body` plus each `assembly.centerAnchor.parts` with
  position = component-wise sum of `assembly.centerAnchor.localPosition` and the part's `localPosition` (2D has no pitch/roll, so the upright anchor is rigid).
  For each part (index `k` in that order): `g = geometrySpecFor(part.geometryKey)`, `fill = materialSpecFor(part.materialKey).color`, `[sx, sy, sz] = part.scale`,
  `c = projectModelPoint(position, view)`, `cosφ`, `sinφ` of `view.elevationRad`:
  - `g.type === "cylinder"` → `half = (g.height * sy) / 2; top = project([px, py + half, pz]); bottom = project([px, py - half, pz]);`
    `{ kind: "puck", cx: c.x, topY: top.y, bottomY: bottom.y, topRx: g.radiusTop * sx, topRy: g.radiusTop * sz * sinφ, bottomRx: g.radiusBottom * sx,
    bottomRy: g.radiusBottom * sz * sinφ, fill, sideFill: shadeHex(fill, FLAT_KRATHONG_SIDE_SHADE), depth: c.depth }`.
  - `"sphere"` → `{ kind: "ellipse", cx: c.x, cy: c.y, rx: g.radius * sx, ry: g.radius * Math.hypot(sy * cosφ, sz * sinφ), fill, depth: c.depth }`
    (exact for sx = sz; an approximation for MFW-19's flattened `style_02` leaf — accepted, documented in the JSDoc).
  - `"cone"` → `half = (g.height * sy) / 2; apex = project([px, py + half, pz]); base = project([px, py - half, pz]); r = g.radius * sx;`
    `{ kind: "triangle", points: [c.x - r, base.y, c.x + r, base.y, c.x, apex.y], fill, depth: c.depth }`.
  - `id = part.id`, `role = part.role`.
  Sort ascending by `depth`, ties by `k` (stable); freeze each layer and the array. No validation (input is a parsed appearance; document "throws only on an
  unknown key, like geometrySpecFor").
- `puckSidePath(l)` (exact format; numbers with default `String(n)`):
  `` `M ${l.cx - l.bottomRx} ${l.bottomY} A ${l.bottomRx} ${l.bottomRy} 0 0 0 ${l.cx + l.bottomRx} ${l.bottomY} L ${l.cx + l.topRx} ${l.topY} L ${l.cx - l.topRx} ${l.topY} Z` ``
  (sweep 0 = through the front/bottom of the ellipse on a y-down screen).
- `trianglePoints(l)`: `` `${p[0]},${p[1]} ${p[2]},${p[3]} ${p[4]},${p[5]}` ``.

### Step 13 — `src/core/fallback2d/cylindricalQuadrant.ts` (new; AC3; pure, three-free, festival-agnostic)

```ts
import { CYLINDRICAL_QUADRANT_EPSILON } from "@/config/fallback2d.config";
import type { NormalizedCylindricalCoord } from "@/core/coordinates/CylindricalCoord";
import { parsePersistableCoord } from "@/core/coordinates/validateCoord";

/** Spec §4.2 4-Quadrant View Switcher: หน้า / ขวา / หลัง / ซ้าย (0 = front, 90 = right, 180 = back, 270 = left). */
export const QUADRANT_VIEW_ANGLES_DEG = Object.freeze([0, 90, 180, 270] as const);
export type QuadrantViewAngleDeg = (typeof QUADRANT_VIEW_ANGLES_DEG)[number];
export const QUADRANT_VIEW_NAMES: Readonly<Record<QuadrantViewAngleDeg, "front" | "right" | "back" | "left">> =
  Object.freeze({ 0: "front", 90: "right", 180: "back", 270: "left" });

/** One flat tier in 2D screen units (y down). Layout comes from the festival's 2D scene config (none in Phase 1). */
export interface CylindricalTier2D {
  readonly tierId: number;       // integer >= 0, unique in the view
  readonly baseY: number;        // Y_tierBase2D: screen y of heightRatio 0
  readonly height: number;       // H_tier2D: finite > 0 (heightRatio 1 is at baseY − height)
  readonly bottomRadius: number; // R_2D(0): finite >= 0
  readonly topRadius: number;    // R_2D(1): finite >= 0
}
export interface CylindricalView2D { readonly centerX: number; readonly tiers: readonly CylindricalTier2D[]; }
export interface QuadrantPoint2D { readonly x: number; readonly y: number; readonly facing: number; } // facing = cos(Δ) in [0, 1]

export function createCylindricalView2D(def: CylindricalView2D): CylindricalView2D;
export function normalizeAngleDeg(angleDeg: number): number;                        // [0, 360); non-finite → NaN
export function angleDeltaDeg(angleDeg: number, cameraAngleDeg: number): number;   // [-180, 180)
export function cylindricalRadius2D(tier: CylindricalTier2D, heightRatio: number): number; // lerp(bottomRadius, topRadius, h)
export function isVisibleInQuadrant(angleDeg: number, cameraAngleDeg: number): boolean;
export function cylindricalToQuadrant2D(coord: NormalizedCylindricalCoord, cameraAngleDeg: number, view: CylindricalView2D): QuadrantPoint2D | null;
export function quadrant2DToCylindrical(point: { readonly x: number; readonly y: number }, tierId: number, cameraAngleDeg: number,
  view: CylindricalView2D): NormalizedCylindricalCoord | null;
export function nearestQuadrantAngle(angleDeg: number): QuadrantViewAngleDeg;
export function stepQuadrant(current: QuadrantViewAngleDeg, step: -1 | 1): QuadrantViewAngleDeg;
export function quadrantFocusFor(coord: NormalizedCylindricalCoord, view: CylindricalView2D):
  { readonly cameraAngleDeg: QuadrantViewAngleDeg; readonly point: QuadrantPoint2D } | null;
```
Module constants: `const FULL_TURN_DEG = 360; const HALF_TURN_DEG = 180; const QUADRANT_STEP_DEG = 90; const QUADRANT_COUNT = 4;`
- `createCylindricalView2D`: `centerX` finite; each tier: `tierId` integer ≥ 0 and unique, `baseY` finite, `height` finite > 0, radii finite ≥ 0; else `RangeError`
  naming the field (e.g. `"tiers[1].height must be finite and > 0"`); returns a frozen deep copy.
- `normalizeAngleDeg(a)`: `r = a % 360; w = r < 0 ? r + 360 : r; return w >= 360 ? 0 : w === 0 ? 0 : w;` (normalises −0).
- `angleDeltaDeg(a, c) = normalizeAngleDeg(a - c + HALF_TURN_DEG) - HALF_TURN_DEG`. Both ±90° edges map to Δ = ±90 and stay visible (§12 D13).
- `isVisibleInQuadrant(a, c) = Math.cos((angleDeltaDeg(a, c) * Math.PI) / HALF_TURN_DEG) >= 0` (spec: `cos(angleRad − cameraAngleRad) >= 0`); non-finite → false.
- `cylindricalToQuadrant2D`: `parsePersistableCoord(coord)` not ok or mode ≠ `CYLINDRICAL_SURFACE` → null; `cameraAngleDeg` not finite → null; tier = `view.tiers.find((t) => t.tierId === coord.tierId)`
  missing → null; `Δrad = angleDeltaDeg(...) * Math.PI / 180`; `facing = Math.cos(Δrad)`; `facing < 0` → null;
  return `{ x: view.centerX + cylindricalRadius2D(tier, h) * Math.sin(Δrad), y: tier.baseY - h * tier.height, facing }` (spec formulas verbatim).
- `quadrant2DToCylindrical`: tier missing, non-finite inputs → null; `hRaw = (tier.baseY - point.y) / tier.height`; `hRaw < -ε || hRaw > 1 + ε` → null;
  `h = Math.min(1, Math.max(0, hRaw))`; `r = cylindricalRadius2D(tier, h)`; `dx = point.x - view.centerX`; if `r === 0`: `Math.abs(dx) > ε` → null, else `s = 0`;
  else `s = dx / r`, `Math.abs(s) > 1 + ε` → null, `s = clamp(s, -1, 1)`; `angleDeg = normalizeAngleDeg(cameraAngleDeg + (Math.asin(s) * 180) / Math.PI)`;
  return `{ mode: "CYLINDRICAL_SURFACE", tierId, angleDeg, heightRatio: h }` (ε = `CYLINDRICAL_QUADRANT_EPSILON`). Overlap checks are the Christmas placement card's job.
- `nearestQuadrantAngle(a) = ((Math.round(normalizeAngleDeg(a) / 90) % 4) * 90)` (tie 45° → 90; 315° → 0).
- `stepQuadrant(c, step) = normalizeAngleDeg(c + step * 90)` (+1 = next angle 0 → 90 → 180 → 270; which button label maps to which step is the Christmas UI's choice).
- `quadrantFocusFor(coord, view)`: spec "ตอนกด ค้นหาของฉัน ในโหมด 2D: ระบบอ่านค่า angleDeg … สั่งสลับด้านต้นไม้ 2D ไปยังมุมองศานั้น" →
  `cam = nearestQuadrantAngle(coord.angleDeg)`; `point = cylindricalToQuadrant2D(coord, cam, view)`; null if point null.

### Step 14 — barrels

`src/core/fallback2d/flat.ts` (new; the **three-free** barrel UI code imports):
```ts
/** Three-free 2D fallback API (MFW-33). UI code imports this, never the root barrel (which loads three via riverTopDown). */
export * from "./topDownProjection";
export * from "./flatLane";
export * from "./flatRiverScene";
export * from "./flatRiverFrame";
export * from "./loyKrathongFlatRiver";
export * from "./krathongLayers2d";
export * from "./cylindricalQuadrant";
```
`src/core/fallback2d/index.ts`: keep `export * from "./riverTopDown";` (it already carries the projection names) and add the six lines above **except**
`./topDownProjection`.
`src/components/canvas2d/index.ts`: keep the comment line; replace `export {};` with
`export * from "./FlatViewport"; export * from "./FlatKrathongPreview"; export * from "./FlatRiverView"; export * from "./FlatKrathongShapes";`.

### Step 15 — `src/components/canvas2d/*` (new, all `"use client"`)

Shared: import 2D values only from `@/core/fallback2d/flat`; config from `@/config/*`; stores from `@/store/*`.

**`FlatKrathongShapes.tsx`** — `export function FlatKrathongShapes({ layers }: { readonly layers: readonly KrathongLayer2D[] })`: a `<g pointerEvents="none">` with,
per layer in order: `ellipse` → `<ellipse key cx cy rx ry fill data-layer-id data-layer-role />`; `triangle` → `<polygon key points={trianglePoints(l)} fill … />`;
`puck` → `<g key data-layer-id data-layer-role><path d={puckSidePath(l)} fill={l.sideFill} /><ellipse cx={l.cx} cy={l.topY} rx={l.topRx} ry={l.topRy} fill={l.fill} /></g>`.

**`FlatKrathongPreview.tsx`** — `export function FlatKrathongPreview()` (no props):
```tsx
const appearance = useBuilderStore((s) => s.appearance) ?? DEFAULT_KRATHONG_APPEARANCE;
const layers = useMemo(() => buildKrathongLayers2D(appearance, PREVIEW_VIEW), [appearance]);
// module: const PREVIEW_VIEW = Object.freeze({ azimuthRad: FLAT_KRATHONG_VIEW_AZIMUTH_RAD, elevationRad: FLAT_KRATHONG_VIEW_ELEVATION_RAD, modelYawRad: 0 });
// module: const { halfExtent: H, centerLift: L } = FLAT_KRATHONG_PREVIEW_VIEW; const VIEW_BOX = `${-H} ${-L - H} ${2 * H} ${2 * H}`;
<section aria-label={FLAT_VIEW_COPY.previewLabel} data-testid="flat-krathong-preview"
  data-krathong-base={appearance.base} data-flower-count={appearance.flowers.filter((f) => f !== null).length} data-layer-count={layers.length}
  className="relative mb-8 h-64 w-full select-none overflow-hidden rounded-3xl border border-indigo-950/30 shadow-lg"
  style={{ backgroundColor: FLAT_VIEW_COLORS.background }}>
  <svg role="img" aria-label={FLAT_VIEW_COPY.previewLabel} viewBox={VIEW_BOX} preserveAspectRatio="xMidYMid meet" className="block h-full w-full">
    <FlatKrathongShapes layers={layers} />
  </svg>
</section>
```
`DEFAULT_KRATHONG_APPEARANCE` from `@/core/customization` (three-free barrel). No animation, no pointer handling (rotate/zoom in 2D is §11 Q3; MFW-20's
FALLBACK_2D tests pin "no view buttons").

**`useFlatFocusTarget.ts`** — `export function useFlatFocusTarget(): string | null { return useWorldStore((s) => s.focusedCreationId); }` with the JSDoc
"ASSUMED INTERFACE (from MFW-30 plan): Find My sets useWorldStore.focusedCreationId. If MFW-30 merged another 2D hook, adapt here only."

**`FlatRiverView.tsx`**:
```ts
export interface FrameScheduler { request(callback: () => void): number; cancel(handle: number): void; }
export interface FlatRiverViewProps {
  readonly mode: "RITUAL_RELEASE" | "WORLD_EXPLORE";
  readonly now?: () => number;          // default Date.now (injectable for tests)
  readonly frames?: FrameScheduler;     // default { request: (cb) => requestAnimationFrame(cb), cancel: (h) => cancelAnimationFrame(h) }
}
export function FlatRiverView(props: FlatRiverViewProps): JSX.Element;
```
Data (React, not per frame):
1. `const { lanes, scene, projection } = getLoyKrathongFlatRiver();` `W = projection.viewport.width`, `H = projection.viewport.height`.
   Static map strings via `useMemo` once: `waterPath = "M x0 y0 L x1 y1 … Z"` from `scene.waterOutline` through `worldToCanvas`; `pierPoints` (`"x,y x,y …"`);
   props in canvas px (`worldToCanvas`; sizes × `projection.scale`).
2. Store: `reducedMotion` (device); `eventId`, `currentZoneId`, `zoneItems` (world); `ritual` (ui, MFW-23); `appearance` (builder, default
   `DEFAULT_KRATHONG_APPEARANCE`); `focusId = useFlatFocusTarget()`.
3. `zoneRiverItems = useMemo(() => eventId !== null && currentZoneId !== null ? publicCreationsToRiverItems(zoneItems, { eventId, zoneId: currentZoneId }) : [], …)`
   — import from `@/core/world/zoneRiverItems` (deep path; three-free after Step 4).
4. Own krathong: `saved = ritual.saved`; `pierPreview = mode === "RITUAL_RELEASE" && ritual.phase !== "RELEASED"`;
   `ownOnRiver = mode === "WORLD_EXPLORE" && ritual.phase === "RELEASED" && saved !== null && isOwnZoneVisible(saved.zoneId, currentZoneId)`;
   `shared = excludeOwnAndCap(zoneRiverItems, saved?.id ?? null, pierPreview || ownOnRiver)` (`@/core/ritual`, ≤ `ZONE_ITEM_CAP` with the own one).
   Render list `items: FlatRiverRenderItem[]` = each shared item `{ id, coord, createdAtMs, lane, layers, own: false, publicWishText, appearance }` (skip an item whose
   `lanes.get(coord.laneId)` is undefined) plus, if `ownOnRiver`, `{ id: saved.id, coord: saved.coord, createdAtMs: saved.createdAtMs, lane, layers, own: true }`
   built from `appearance`. `layers = buildKrathongLayers2D(item.appearance, SPRITE_VIEW)` with `SPRITE_VIEW = { azimuthRad: FLAT_KRATHONG_VIEW_AZIMUTH_RAD,
   elevationRad: FLAT_KRATHONG_VIEW_ELEVATION_RAD, modelYawRad: 0 }` (module constant). All in one `useMemo`.
   Pier preview position: `flatProgressToCanvasInto(lane, LOY_KRATHONG_PIER_RELEASE_SPOT.progress, LOY_KRATHONG_PIER_RELEASE_SPOT.lateralOffset, projection, …)` once (`useMemo`).
5. `clockOffsetMs = saved?.serverClockOffsetMs ?? 0` (MFW-23 D7: all krathongs share the server-corrected clock).
6. `spritePx = FLAT_RIVER_SPRITE_SCALE * projection.scale` (px per model unit); `tapPx = FLAT_RIVER_TAP_RADIUS * projection.scale`;
   ring radius px `(FLAT_RIVER_HIGHLIGHT.innerRadius + FLAT_RIVER_HIGHLIGHT.outerRadius) / 2 * projection.scale`, stroke width
   `(outerRadius − innerRadius) * projection.scale`.
7. `pools = useMemo(() => createObjectPoolManager(FALLBACK_2D_EFFECT_POOL_CAPS), [])`; `useEffect(() => () => pools.releaseAll(), [pools])`;
   on `currentZoneId` change: `pools.releaseAll()` and `setInspectedId(null)` (zone-switch cleanup, invariant E).
8. `const [inspectedId, setInspectedId] = useState<string | null>(null)`; `inspected = mode === "WORLD_EXPLORE" && inspectedId !== null ?
   findInspectedCreation(shared, inspectedId) : null` (`@/components/ui/inspectedCreation`); `gimmick` state `{ kind: "ripple" | "inspect" | null; count }` like SceneViewport.

DOM (no `touch-none`; ids are public data, allowed in `data-*`):
```tsx
<>
<section aria-label={FLAT_VIEW_COPY.riverLabel} data-testid="flat-river-view" data-interaction-mode={mode}
  data-zone-id={currentZoneId ?? undefined} data-river-item-count={items.length}
  data-flat-own-krathong={pierPreview ? "pier" : ownOnRiver ? "river" : "none"} data-focused-creation-id={focusId ?? undefined}
  data-ripple-capacity={pools.ripple.capacity} data-last-gimmick={gimmick.kind ?? undefined} data-gimmick-count={gimmick.count}
  className="relative mb-8 w-full overflow-hidden rounded-3xl border border-indigo-950/30 shadow-lg" style={{ backgroundColor: FLAT_VIEW_COLORS.bank }}>
  <div ref={scrollerRef} data-testid="flat-river-scroller" role="region" aria-label={FLAT_VIEW_COPY.riverScrollLabel} tabIndex={0}
    className="w-full touch-manipulation select-none overflow-x-auto overflow-y-hidden">
    <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block"
      onPointerDown={…} onPointerMove={…} onPointerUp={…} onPointerCancel={…}>
      <rect width={W} height={H} fill={FLAT_VIEW_COLORS.bank} />                                   {/* bank: no input target */}
      <path d={waterPath} fill={FLAT_VIEW_COLORS.water} data-input-target="water" />
      {/* trees: circle r = treeRadius × scale × prop.scale; houses: rect (house colour) centred, half sizes × scale × prop.scale; lamps: circle; all pointerEvents="none" */}
      <polygon points={pierPoints} fill={FLAT_VIEW_COLORS.pier} pointerEvents="none" />
      <g pointerEvents="none">{/* caps.ripple circles, rendered once */}
        {rippleSlots.map((slot) => <circle key={slot} ref={…} data-testid="flat-ripple" visibility="hidden" fill="none" stroke={RIPPLE_LOOK.color} />)}
      </g>
      {pierPreview && <g data-testid="flat-own-krathong" transform={`translate(${pier.x} ${pier.y})`} pointerEvents="none">
        <g transform={`scale(${spritePx})`}><FlatKrathongShapes layers={ownLayers} /></g></g>}
      {items.map((it) => (
        <g key={it.id} ref={registerItem(it)} data-testid="flat-river-item" data-creation-id={it.id} data-own={it.own ? "true" : undefined}>
          <g transform={`scale(${spritePx})`}><FlatKrathongShapes layers={it.layers} /></g>
          {!it.own && mode === "WORLD_EXPLORE" && <circle r={tapPx} fill="transparent" data-input-target="krathong" data-creation-id={it.id} />}
        </g>))}
      <circle ref={ringRef} data-testid="flat-focus-ring" visibility="hidden" fill="none" stroke={FLAT_RIVER_HIGHLIGHT.color}
        strokeOpacity={FLAT_RIVER_HIGHLIGHT.opacity} strokeWidth={ringStrokePx} r={ringRadiusPx} pointerEvents="none" />
    </svg>
  </div>
</section>
{inspected && <InspectPopup key={inspected.id} creation={inspected} onClose={() => setInspectedId(null)} />}
</>
```
Never pass the per-frame `transform`, `cx`, `cy`, `r`, `visibility` or `opacity` of items/ripples/ring as changing React props (React would overwrite the
imperative values); the outer item `<g>` has **no** `transform` prop.

Frame loop (one `useEffect`, started once; latest `items`, `clockOffsetMs`, `reducedMotion`, `focusId` kept in refs updated by a separate effect):
- `writeFrame(tMs)` (allocation-free apart from the attribute strings; reuse one `CanvasPointOut` and one `FlatCanvasScratch` from `useRef`):
  1. `riverNow = tMs + clockOffsetMs`. For each item with a registered element: `flatCoordToCanvasInto(it.coord, it.lane, it.createdAtMs, riverNow, projection, out, scratch)`;
     `el.setAttribute("transform", "translate(" + out.x + " " + out.y + ")")`; if `it.id === focusId` remember `out.x/out.y` for the ring.
  2. Ring: focused item rendered → set `cx`, `cy`, `visibility="visible"`; else `visibility="hidden"`.
  3. Ripples: for `slot` in `0..capacity-1`: `e = pools.ripple.entryAt(slot)`; inactive → `visibility="hidden"`; else
     `writeRippleFrameAt(tMs - e.startedAtMs, reducedMotion, rippleFrame)`; `done` → `pools.ripple.release(e)`, hidden; else `worldToCanvasInto(e.state, projection, out)`,
     `r = rippleFrame.radius * (1 + RIPPLE_LOOK.ringInnerRatio) / 2 * projection.scale`, `stroke-width = rippleFrame.radius * (1 - RIPPLE_LOOK.ringInnerRatio) * projection.scale`,
     `stroke-opacity = rippleFrame.intensity`, `cx/cy = out`, visible.
- Item registration: the `ref` callback stores the element in a `Map<string, SVGGElement>` and immediately writes that item's transform at `now()` (no
  frame at the origin); on `null` it deletes the entry.
- Loop: `tick = () => { handle = frames.request(tick); const t = now(); if (t - last < FLAT_RIVER_FRAME_INTERVAL_MS) return; last = t; writeFrame(t); }`;
  on mount `writeFrame(now())` then `handle = frames.request(tick)`; cleanup `frames.cancel(handle)`.

Input (WORLD_EXPLORE only; RITUAL_RELEASE ignores all pointer events, like the 3D ritual):
- `separatorRef = useRef(createInputSeparator("WORLD_EXPLORE", onAction))` (re-create if needed when `mode` changes); `pendingTapRef = { pointerId, target, creationId, point }`.
- `onPointerDown(e)`: `mode !== "WORLD_EXPLORE"` → return. `hit = e.target instanceof Element ? e.target.closest("[data-input-target]") : null`;
  `target = hit?.getAttribute("data-input-target")` (`"water" | "krathong"`, anything else → null); `creationId = hit?.getAttribute("data-creation-id") ?? null`;
  `rect = svgRef.current.getBoundingClientRect(); point = { x: e.clientX - rect.left, y: e.clientY - rect.top }` (SVG px = CSS px); store in `pendingTapRef`;
  `separator.pointerDown({ pointerId, x: clientX, y: clientY, time: e.timeStamp, target })`. No pointer capture (native scroll must keep working).
- `onPointerMove` / `onPointerUp` / `onPointerCancel` forward to the separator.
- `onAction`: `TAP_INTERACT` → read `pendingTapRef`: `target === "water"` → `world = canvasToWorldXZ(point, projection)`; `entry = pools.ripple.acquire(now())`;
  `entry.state.x = world.x; entry.state.z = world.z`; `recordGimmick("ripple")`. `target === "krathong" && creationId` → `setInspectedId(creationId)`; `recordGimmick("inspect")`.
  Otherwise nothing (bank). `PAN_RIVER` → `scrollerRef.current.scrollLeft -= action.deltaX` (mouse drag on desktop; touch pans scroll natively). Ignore the rest.

Scrolling:
- Mount (`useLayoutEffect`, once): if `focusId` is null, centre the pier tip: `left = flatRiverScrollLeft(worldToCanvas(scene.pierTip, projection).x, scroller.clientWidth, W)`; `scrollTo(left, "auto")`.
- Find My (`useEffect` on `[focusId, items, reducedMotion]`): `focusId === null` → `scrolledForRef.current = null`, return. If `scrolledForRef.current === focusId` → return.
  Find the item; absent (other zone not loaded yet) → return (the effect re-runs when `items` changes). Else compute its canvas x at `now() + clockOffsetMs`
  with `flatCoordToCanvasInto`, `left = flatRiverScrollLeft(x, scroller.clientWidth, W)`, `scrollTo(left, reducedMotion ? "auto" : "smooth")`,
  `scrolledForRef.current = focusId`.
- `scrollTo(left, behavior)`: `typeof el.scrollTo === "function" ? el.scrollTo({ left, behavior }) : (el.scrollLeft = left)` (jsdom has no `scrollTo`).

**`FlatViewport.tsx`**:
```tsx
export function FlatViewport({ mode }: { readonly mode: InteractionMode }) {
  const profiled = useDeviceStore((s) => s.profiled);
  const qualityTier = useDeviceStore((s) => s.qualityTier);
  if (!profiled || qualityTier !== "FALLBACK_2D") return null; // defence in depth, like SceneViewport
  return mode === "CUSTOMIZE" ? <FlatKrathongPreview /> : <FlatRiverView mode={mode} />;
}
```

### Step 16 — `src/components/ui/FlowRoot.tsx` (modify, on top of MFW-23's version)

- Next to `SceneViewport`: `const FlatViewport = lazy(() => import("@/components/canvas2d").then((m) => ({ default: m.FlatViewport })));`
  with the comment "The 2D fallback is its own async chunk, three-free (MFW-33)."
- `const show2D = profiled && qualityTier === "FALLBACK_2D";`
- Render, in the same place as the 3D block: `{show2D && interactionMode !== null && (<Suspense fallback={null}><FlatViewport mode={interactionMode} /></Suspense>)}`.
- Do **not** pass `viewControlRef` for 2D (CustomizerPanel keeps `viewControlRef={show3D ? viewControlRef : null}`). Change nothing else of MFW-23's FlowRoot.
- `tests/unit/scene-art-constants.test.ts`: `const ROOTS = ["src/components/canvas3d", "src/components/models", "src/components/canvas2d"];` (only change).

### Step 17 — docs and verification

Append to the "Decide in" cell of row 9 of `docs/spec/open-questions.md` the sentence in §4 (one edit, nothing else in `docs/spec/**`). Then run §9 and
report the 2D chunk: after `pnpm build`, `grep -rl "flat-river-view" .next/static/chunks` → for each file print `wc -c` and `gzip -c <file> | wc -c`, and
`grep -c WebGLRenderer <file>` (must be 0). Put these numbers in the PR (MFW-8 follow-up "Check the FALLBACK_2D chunk size").

## 7. Tests

All vitest tests run without a database or WebGL. Tests may import three to compare against the 3D math.

**`src/core/fallback2d/flatLane.test.ts`** (node)
- Pins: `CURVE_ARC_LENGTH_DIVISIONS === new CatmullRomCurve3().arcLengthDivisions`; `SPLINE_CURVE_TYPE === "centripetal"` (from `@/core/coordinates`).
- For `STRAIGHT_LANE_DEF`, `S_LANE_DEF`, `LOOP_LANE_DEF` (`@/core/coordinates/__fixtures__/riverLanes`) and `LOY_KRATHONG_RIVER_LANES[0]`:
  `createFlatLane(def).arcLengths` deep-equals `createRiverLane(def).curve.getLengths()` (`toEqual`, exact); `flatLanePointAt` equals `curve.getPointAt` with `toBe`
  on x, y, z for `u = k / 2000`, `k = 0..2000`.
- `flatProgressToPoseInto` vs `splineProgressToPoseInto` (`toBe` on x, y, z, yawRad) for progress `k / 1000` plus `-0.25`, `1.25`, `PROGRESS_SAMPLES`, lateral
  `LATERAL_SAMPLES` plus `±0.7` (clamped); the closed lane wraps the same.
- `flatCoordToPoseInto` vs `splineCoordToPoseInto` for `(createdAtMs, nowMs)` in `[(0, 0), (1_000, 61_000), (5_000, 1_000) /* negative elapsed */, (0, NaN)]`; laneId mismatch → both throw `RangeError`.
- Validation parity: for each invalid def (laneId −1 / 1.5; width 0 / NaN; 1 point; closed with 2 points; NaN coordinate; repeated consecutive point; closed last = first),
  `createFlatLane` throws a `RangeError` whose message equals `createRiverLane`'s. `createFlatLaneSet([])` and duplicate ids: same messages as `createRiverLaneSet`.
- Returns `out` itself; `flatLaneFrameInto` centreline/right equal `splineProgressToWorld(lane, p, 0).centerline` / `.right` (`toBe`) and rejects `1.5`.

**`src/core/fallback2d/flatRiverScene.test.ts`** (node) — vs `LOY_KRATHONG_RIVER_LAYOUT` (`@/components/models/loyKrathong`)
- `FLAT_RIVER_CHANNEL_CURVE_ID === RIVER_CHANNEL_CURVE_ID`.
- houses / trees / lamps: same counts; `x`, `z`, `yawRad`, `scale` equal the layout's `position.x/z`, `yawRad`, `scale` (`toBeCloseTo(…, 12)`).
- `pierTip` x/z equal `layout.pier.tip` (12 digits); the centroid of `pierDeck` equals `layout.pier.deckCenter` x/z (12 digits); deck side lengths equal `layout.pier.length` / `.width` (9 digits).
- `waterOutline.length === 2 × (ribbonSegments + 1)`; its left edge equals the inner edge (vertex `2i + 1`) of `layout.banks.left` and its right edge (reversed) the inner edge
  (vertex `2i`) of `layout.banks.right` within 1e-5 (Float32 in 3D).
- Bounds: every waterOutline point with progress in `[margin, 1 − margin]` lies inside; for the product lane, `FLAT_RIVER_END_MARGIN_PROGRESS × lane length (getLength) > RIVER_COLLISION_RADIUS`.
- Wrap off-screen (owner decision 22): with `getLoyKrathongFlatRiver()`, for progress `p ∈ {0, margin / 4, margin / 2, 1 − margin / 2, 1 − margin / 4}` and lateral `±0.5, 0`,
  the sprite circle (canvas x ± `RIVER_COLLISION_RADIUS × projection.scale`) is entirely outside `[0, projection.viewport.width]`.
- Rejections: control point with y ≠ 0; `visibleBankDepth` 0; `endMarginProgress` 0.5.

**`src/core/fallback2d/flatRiverFrame.test.ts`** (node)
- Bit-identity with MFW-24 (invariant B): for each lane fixture × `VIEWPORTS` × progress/lateral samples × `(createdAtMs, nowMs)` pairs,
  `flatCoordToCanvasInto` equals `splineCoordToCanvasInto` (three) with `toBe` on x and y.
- Product lane: the canvas point equals `getRiverItemCanvasPositionAt(item, getLoyKrathongRiverLanes(), nowMs, projection)` (`toBe`).
- Round trip (tolerance 1e-6): `canvasToSplineLocation(flatPoint, riverLane, projection)` gives `progress ≈ currentProgress(...)` and `lateralOffset ≈ coord.lateralOffset`
  for interior progress `[0.05, 0.95]` (open lanes) and lateral `[-0.45, 0.45]`.
- `createFlatRiverProjection`: height = `FLAT_RIVER_VIEW_HEIGHT_PX`, `scale ≈ (H − 2p) / spanZ` (12 digits), width integer ≥ `spanX × scale`; throws on `heightPx = 0`, zero span.
- `flatRiverScrollLeft`: `(500, 360, 1000) → 320`; `(100, 360, 1000) → 0`; `(990, 360, 1000) → 640`; `(50, 360, 200) → 0`; `(NaN, 360, 1000) → 0`.

**`src/core/fallback2d/krathongLayers2d.test.ts`** (node)
- `DEFAULT_KRATHONG_APPEARANCE`: role counts base 1, leaf `KRATHONG_LEAF_COUNT`, flower = non-null flowers, candle 1, flame 1, incense `KRATHONG_INCENSE_MODEL.count`; ids unique;
  depths non-decreasing; every `fill` equals `materialSpecFor(part.materialKey).color` of the part with that id.
- Kinds: `banana_trunk_01` base → `puck` (sideFill = `shadeHex(fill, FLAT_KRATHONG_SIDE_SHADE)`), `toy_bread_01` → `ellipse`, `style_01` leaves → `triangle`, `style_02` → `ellipse`, candle → `puck`.
- All flowers null → no flower layers; changing `candleColor` changes only the candle fill.
- `projectModelPoint`: view `(0, 0, 0)`: `[1, 2, 3] → { x: 1, y: -2, depth: 3 }`; elevation `π/2`: `[1, 2, 3] → { x: 1, y ≈ 3, depth ≈ 2 }`; modelYaw `π/2`, azimuth 0, elevation 0:
  `[1, 0, 0] → x ≈ 0, depth ≈ -1` (three rotation.y maps +X to −Z).
- Pure: same input → deep-equal frozen output; the appearance object is not mutated.
- `puckSidePath({ cx: 0, topY: -1, bottomY: 1, topRx: 2, topRy: 1, bottomRx: 3, bottomRy: 1, … })` === `"M -3 1 A 3 1 0 0 0 3 1 L 2 -1 L -2 -1 Z"`; `trianglePoints` format.

**`src/core/fallback2d/cylindricalQuadrant.test.ts`** (node) — fixture view (test-only numbers): `centerX 200`, tiers
`[{ tierId: 0, baseY: 400, height: 120, bottomRadius: 150, topRadius: 90 }, { tierId: 1, baseY: 280, height: 100, bottomRadius: 100, topRadius: 0 }]`.
- Forward (spec formulas): camera 0, `{ tierId: 0, angleDeg: 0, heightRatio: 0 }` → `(200, 400)`, facing 1; `angleDeg 90` → `x = 350` (edge, visible); `angleDeg 180` → null;
  `angleDeg 270` → `x = 50` (visible, the other edge); `h = 0.5` → `y = 340`, radius 120. Camera 90: `angleDeg 90` → `(200, …)` front; `angleDeg 0` → `x = 50`.
- Visibility: `isVisibleInQuadrant(a, c)` equals `Math.cos(rad(a − c)) >= -1e-12` for a 5° grid × the four cameras, and both ±90° edges are visible; non-finite → false.
- Inverse: for every visible coord on a 5° × 0.1 grid with `R_2D(h) > 0`, `quadrant2DToCylindrical(cylindricalToQuadrant2D(c))` returns the same tierId and
  `angleDeg`/`heightRatio` within 1e-9 (angles compared modulo 360). Outside the silhouette (`x = centerX + R + 1`) → null; above the tier (`h = 1.1`) → null; unknown tier → null;
  apex of tier 1 (`h = 1`, R = 0): `x = centerX` → `angleDeg = camera`, `x = centerX + 1` → null.
- Invalid coord (`angleDeg 400`, `mode "SPLINE_PATH"`, extra key `x`) → null.
- `normalizeAngleDeg(-90) = 270`, `(360) = 0`, `(-0) = 0` (`Object.is(…, 0)`); `angleDeltaDeg(270, 0) = -90`, `(180, 0) = -180`.
- `nearestQuadrantAngle`: `44 → 0`, `45 → 90`, `226 → 270`, `315 → 0`, `359 → 0`; `stepQuadrant(270, 1) = 0`, `(0, -1) = 270`.
- `quadrantFocusFor({ tierId: 1, angleDeg: 200, heightRatio: 0.5 })` → camera 180, point visible with facing ≥ cos(45°).
- 3D consistency (invariant B): with `tier3D = { tierId: 0, baseY: 2, height: 3, bottomRadius: 1.5, topRadius: 0.9 }`, scale `k = 100`, `Y0 = 600`, view tier
  `{ baseY: Y0 − k·2, height: k·3, bottomRadius: k·1.5, topRadius: k·0.9 }`: for visible coords and each camera `c`, `w = cylindricalCoordToWorld(coord, tier3D)`,
  2D point `x ≈ centerX + k·(w.x·cos c − w.z·sin c)`, `y ≈ Y0 − k·w.y` (1e-9).
- `createCylindricalView2D` rejects height 0, negative radius, duplicate tierId, non-integer tierId.

**`src/core/coordinates/CylindricalCoord.test.ts`** (node, new): angle 0 → `(0, baseY, R_bottom)`; 90 at `h = 1` → `(R_top, baseY + H, ≈0)`; 180 → `z ≈ −R`; `h = 0.5` radius = lerp;
tierId mismatch and NaN → `RangeError`; returns a new object each call.

**`src/core/math/shadeHex.test.ts`**: `("#FFFFFF", 0.5) → "#808080"`, `("#5e8c3a", 1) → "#5e8c3a"`, `("#102030", 2) → "#204060"`, `("#F0F0F0", 2) → "#ffffff"`,
`("#abc", 0.5) → "#abc"`, `("#123456", NaN) → "#123456"`.

**`src/config/fallback2d.config.test.ts`** (node): the derived constants equal their formulas (`FLAT_KRATHONG_VIEW_*`, `FLAT_RIVER_SPRITE_SCALE`, `FLAT_RIVER_TAP_RADIUS`,
`FLAT_RIVER_HIGHLIGHT`, `FLAT_RIVER_FRAME_INTERVAL_MS`); `FALLBACK_2D_EFFECT_POOL_CAPS` equals `EFFECT_POOL_CAPS.LOW`; PLACEHOLDERs finite and > 0 (padding ≥ 0;
`0 < FLAT_RIVER_END_MARGIN_PROGRESS < 0.5`); every `FLAT_VIEW_COLORS` value matches `/^#[0-9a-fA-F]{6}$/`; the copy strings are non-empty; objects frozen.

**`src/components/canvas2d/FlatKrathongShapes.test.tsx`**: a puck layer renders one `path` (fill = sideFill) and one `ellipse` (fill); triangle → `polygon` with `trianglePoints`;
`data-layer-role` set; the group has `pointer-events="none"`.

**`src/components/canvas2d/FlatKrathongPreview.test.tsx`**
- Default appearance: `data-krathong-base="banana_trunk_01"`, `data-layer-count` = `buildKrathongLayers2D(DEFAULT…).length`, an `svg` with that many `[data-layer-id]` nodes, no `canvas`.
- `useBuilderStore.setState({ appearance: { …, base: "lotus_petal_01" } })` → `data-krathong-base` updates and the base ellipse fill = `KRATHONG_BASE_MODELS.lotus_petal_01.color`.
- `viewBox` equals the formula from `FLAT_KRATHONG_PREVIEW_VIEW`.

**`src/components/canvas2d/FlatRiverView.test.tsx`** (jsdom; inject `now` and a manual `frames` queue; `useWorldStore` / `useUIStore` / `useDeviceStore` set per test;
items from `src/core/fallback2d/__fixtures__/flatRiverItems.ts` → `makePublicCreation(i, overrides?)`: id `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, `loy_krathong`,
zone 1, `serializeKrathongAppearance(DEFAULT_KRATHONG_APPEARANCE)`, coord `{ mode: "SPLINE_PATH", laneId: LOY_KRATHONG_RIVER_LANE_ID, spawnProgress: i / 10, speedFactor: RIVER_DRIFT_SPEED_FACTOR,
lateralOffset: 0 }`, `publicWishText: "ขอให้มีความสุข"`, `createdAt: "2026-11-24T12:00:00.000Z"`, `expiresAt: "2099-01-01T00:00:00.000Z"`)
1. "renders every zone krathong": 5 items → 5 `[data-testid="flat-river-item"]`, `data-river-item-count="5"`, no `canvas`.
2. "places them from the stored coord": after mount at `now = T`, each item's `transform` is `translate(x y)` with `(x, y)` = `getRiverItemCanvasPositionAt(item, getLoyKrathongRiverLanes(), T, projection)`
   (three-based, imported in the test) — exact string match of `"translate(" + x + " " + y + ")"`.
3. "drifts with time": run a frame at `T + 10_000` → x larger (flow runs +x), still equal to the three-based position at that time.
4. "throttles frames": a frame at `T + 1` (< interval) leaves transforms unchanged.
5. "server clock offset": `ritual.saved.serverClockOffsetMs = 5_000` → positions equal those at `now + 5_000`.
6. "water tap ripples": WORLD_EXPLORE; `fireEvent.pointerDown` + `pointerUp` (same pointerId and coords) on the water `path` → after a frame exactly one `flat-ripple` has
   `visibility="visible"`, `data-last-gimmick="ripple"`, `data-gimmick-count="1"`; its `r` at age 0 = `RIPPLE_LOOK.startRadius × (1 + ringInnerRatio) / 2 × scale`.
7. "reduced motion: fade only": `reducedMotion: true` → `r` at age 0 uses `RIPPLE_LOOK.endRadius`; drift still happens (owner decision 23).
8. "pool cap": `capacity + 2` water taps → exactly `FALLBACK_2D_EFFECT_POOL_CAPS.ripple` visible circles; the number of `flat-ripple` elements never changes (pre-rendered).
9. "ripple ends": a frame after `RIPPLE_LOOK.durationMs` → all hidden and `pools` inactive.
10. "bank tap and ritual taps do nothing": tap on the background `rect` → no ripple; `mode="RITUAL_RELEASE"` water tap → no ripple, `data-gimmick-count="0"`.
11. "krathong tap opens the anonymous popup": tap on an item's hit circle → `InspectPopup` dialog (title `INSPECT_POPUP_COPY.dialogTitle`) shows that item's public wish; close → gone.
12. "own krathong": RITUAL_RELEASE with `ritual.phase "IDLE"` → `flat-own-krathong` at the pier spot canvas point (`flatProgressToCanvasInto` of `LOY_KRATHONG_PIER_RELEASE_SPOT`),
    `data-flat-own-krathong="pier"`; WORLD_EXPLORE with `phase "RELEASED"` and `saved` (id equal to a zone item's id) → one `[data-own="true"]` item at the saved coord, the zone
    copy is not duplicated, it has no hit circle, `data-flat-own-krathong="river"`; saved zone ≠ visible zone → no own item.
13. "Find My scrolls" (stub `HTMLElement.prototype.scrollTo` with `vi.fn`, define `clientWidth` = 360 on the scroller, `mockClear()` after the mount's pier scroll): set `focusedCreationId` to item 3 →
    `scrollTo` called once with `{ left: flatRiverScrollLeft(x3, 360, W), behavior: "smooth" }`; ring `visibility="visible"` at item 3; setting the same id again → no new call;
    `reducedMotion: true` → `behavior: "auto"`; an id not in the zone → no call, then `zoneItems` updated to include it → one call.
14. "initial scroll centres the pier": no focus → mount calls `scrollTo` with the pier tip's `flatRiverScrollLeft` and `behavior: "auto"`.
15. "zone switch cleans up": active ripple + open popup, then `currentZoneId` 1 → 2 → ripples hidden, popup closed.
16. "never renders private fields" (invariant C): zone rows carrying extra keys `ownerTokenHash: "HASH-SENTINEL"`, `privateWishText: "PRIVATE-SENTINEL"`, `owner_token: "TOKEN-SENTINEL"`
    (cast) → `container.innerHTML` contains none of the three sentinels.
17. "unmount cancels the frame": the injected `frames.cancel` is called with the last handle.

**`src/components/ui/FlowRoot.test.tsx`** (modify): add `vi.mock("@/components/canvas2d", …)` returning `FlatViewport: ({ mode }) => <div data-testid="flat-viewport" data-mode={mode} />`.
New cases: FALLBACK_2D → CUSTOMIZE shows `flat-viewport` with `data-mode="CUSTOMIZE"` (`findByTestId`, lazy) and still no view buttons; WRITE_WISH → no `flat-viewport`;
RITUAL_RELEASE → `data-mode="RITUAL_RELEASE"`; HIGH → no `flat-viewport`; unprofiled → none. Existing tests stay unchanged and green.

**`tests/unit/fallback2d-import-graph.test.ts`** (node): BFS over imports from the entries `src/components/canvas2d/index.ts`, `src/core/fallback2d/flat.ts`,
`src/core/world/zoneRiverItems.ts`, `src/core/coordinates/validateCoord.ts`, `src/core/coordinates/splineProgress.ts`, `src/core/coordinates/CylindricalCoord.ts`.
Strip `/* … */` and `//…` comments first. Follow static `import … from "x"`, `import "x"`, `export … from "x"` **and dynamic `import("x")`**. Skip `import type …`, `export type …` and
`import { type A, type B } from …` where every member starts with `type `. Resolve `@/` → `src/` and relative paths with `.ts`, `.tsx`, `/index.ts`, `/index.tsx`.
Fail if a reached bare specifier matches `/^(three|@react-three\/|@react-spring\/)/` or a reached file is under `src/components/canvas3d/` or `src/components/models/`; print the
import chain. Positive controls on fixture strings: `import { Vector3 } from "three"` detected; multi-line `import {\n  Vector3,\n} from "three"` detected; `import("three")` detected;
`import type { X } from "three"` and `import { type X } from "three"` not detected.

**`tests/e2e/fallback-2d.spec.ts`** (`test.use({ hasTouch: true })`; WebGL disabled with the same init script as `scene-gating.spec.ts`; collect `pageerror` (must stay empty) and
script bodies like `scene-gating.spec.ts`; `mockCreateCreation(page)` first, then `routeZones` = `page.route((url) => url.pathname === "/api/zones", …)` and a GET-only
`/api/creations` handler that calls `route.fallback()` for any other method, both serving `makeZoneBody` from `fixtures/zoneFixtures.ts`)
1. "FALLBACK_2D customizer previews the krathong in flat vector" (viewport 360 × 640): Loy Krathong → `[data-testid="flat-krathong-preview"] svg` visible,
   `data-krathong-base="banana_trunk_01"`, canvas 0, `.touch-none` 0; tap the option "กลีบบัว" → `data-krathong-base="lotus_petal_01"`; no horizontal page overflow
   (`document.documentElement.scrollWidth <= innerWidth`).
2. "FALLBACK_2D river shows the zone and drifts": zone 1 with 5 items; walk to the world (`completeWishStep`, "ปล่อยกระทง") → `[data-testid="flat-river-view"]` visible,
   `data-flow-state="SHARED_WORLD_EXPLORE"`, 5 `flat-river-item:not([data-own])` plus one `[data-own="true"]` (`E2E_CREATION_ID`); read one item's `transform` x, then
   `expect.poll` until it is larger (drift); the scroller's `scrollWidth > clientWidth`; canvas 0; no loaded script contains "WebGLRenderer".
3. "tap on the water ripples": find a water point with `page.evaluate`: for the scroller's centre x and fractions `[0.3, 0.35, 0.4, 0.6, 0.65, 0.7]` of its height, take the first
   point where `document.elementFromPoint(x, y)?.getAttribute("data-input-target") === "water"`; `page.touchscreen.tap` there → `data-last-gimmick="ripple"`, `data-gimmick-count="1"`,
   at least one `[data-testid="flat-ripple"][visibility="visible"]`.
4. "krathong tap shows the anonymous popup": tap the first `[data-input-target="krathong"]` → a dialog with the inspect title (duplicate the literal of
   `INSPECT_POPUP_COPY.dialogTitle` with a comment, as `helpers/wishStep.ts` does).
5. "Find My scrolls to my krathong": `page.emulateMedia({ reducedMotion: "reduce" })`; in the world, set the scroller to its far end (`el.scrollLeft = el.scrollWidth`); open
   MFW-30's drawer (button "ค้นหาของฉัน") and choose the released creation with the selector MFW-30's own e2e uses (read `tests/e2e/` on main) → `data-focused-creation-id`
   = `E2E_CREATION_ID` and `expect.poll` of `|scrollLeft + clientWidth / 2 − ownX| <= FIND_MY_TOLERANCE_PX` where `ownX` is read from the own item's `transform` in the same
   `evaluate`; `const FIND_MY_TOLERANCE_PX = 16; // ≈ 2 s of drift at 2D scale`. If the own krathong is near an end the clamp applies: then expect the clamped value instead.

## 8. Do NOT (Out of scope and traps)

- Do not build: drag-to-release or tap-to-release in 2D (MFW-23: button only), rotate/zoom/drag in the 2D preview (§11 Q3), the part-change bounce, lamp glow or krathong
  bounce in 2D (§11 Q2), the Find My drawer or the creation-id list (MFW-30), owner private view (MFW-31), instancing (MFW-34), zone UI (MFW-25), any Christmas/CNY scene,
  config or UI (the cylindrical converter takes its layout as a parameter), a 2D placement inverse for the river (not needed: 2D never places).
- Do not change the 3D renderer (`src/components/canvas3d/**`, `src/components/models/**`), MFW-23's ritual, MFW-25's pagination, MFW-28's pool/curves, the MFW-8 math
  (Step 1 only moves code; Step 2 only appends), `CustomizerPanel`, the stores, any API route or `src/services/**`, `supabase/**`.
- Never value-import three or a three-importing module from the 2D graph (see the three-free rule in §6). Never import the root `@/core/fallback2d` barrel from UI code.
- Never use the class `touch-none` in canvas2d; never put hex colours or decimal literals in `src/components/canvas2d/**`; never `console.*`.
- Never persist or send a 2D position (canvas point, ripple x/z, scroll value) — they are render-time only (invariant A).
- Do not weaken or delete tests. The only edits to existing tests: `FlowRoot.test.tsx` (mock + new cases) and `scene-art-constants.test.ts` (one root added).
- Do not touch `.claude/**`, `scripts/**`, `.github/**`, `CLAUDE.md`, `AGENTS.md`, `docs/backlog*.json`, `docs/plans/**`, `docs/spec/**` (except the row 9 append), `package.json`,
  the lockfile, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.mts`, `playwright.config.ts`, `next.config.ts`. No new dependency.
- Next.js: this card uses no new Next API (`React.lazy` is already used by FlowRoot). If you need one, read `node_modules/next/dist/docs/` first.

## 9. Definition of done

- Each green, run separately: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm e2e` (in this container:
  `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell pnpm e2e`).
- Every check in §3 has its test. Delete `playwright-report/` and `test-results/` before committing; never commit `.next/` or `*.tsbuildinfo`.
- Branch `feat/MFW-33-flat-vector-2d-fallback-renderer` from the latest `main`. Conventional commits with the key, e.g.
  `feat(fallback2d): flat vector 2D fallback renderer MFW-33` (format: CLAUDE.md, `docs/prompts/README.md`).
- Ready PR against `main`, same title. Body (English): summary + link to MFW-33; the AC checklist with the proving file/test; "Decisions" (every PLACEHOLDER constant and §12);
  "Open questions" (§11); ASSUMED INTERFACE differences found on `main` (MFW-23, MFW-30); the 2D chunk size and the "WebGLRenderer" count (Step 17); test plan (five commands and
  results); follow-ups (§13).
- Leave the PR open for reviewer + qa + `r3f-perf-reviewer`. Not an owner-merge card.

## 10. Interfaces this card provides

| Export | Path | Signature | For |
|---|---|---|---|
| `FlatViewport`, `FlatRiverView`, `FlatKrathongPreview`, `FlatKrathongShapes`, `FrameScheduler` | `@/components/canvas2d` | §6 Step 15 | FlowRoot; later festivals' 2D views |
| DOM hooks | `data-testid` `flat-krathong-preview`, `flat-river-view`, `flat-river-scroller`, `flat-river-item` (`data-creation-id`, `data-own`), `flat-own-krathong`, `flat-ripple`, `flat-focus-ring`; section `data-flat-own-krathong`, `data-focused-creation-id`, `data-last-gimmick`, `data-gimmick-count`, `data-river-item-count` | — | e2e of later cards (MFW-30/31 2D checks) |
| `useFlatFocusTarget` | `@/components/canvas2d/useFlatFocusTarget` | `() => string \| null` | MFW-30 adapter point |
| Three-free barrel | `@/core/fallback2d/flat` | everything below | any 2D/landing code |
| `createFlatLane`, `createFlatLaneSet`, `flatLanePointAt`, `flatLaneFrameInto`, `flatProgressToPoseInto`, `flatCoordToPoseInto`, `createFlatPoseOut`, `FlatLane`, `FlatLaneSet` | `@/core/fallback2d/flat` | Step 8 | 2D lane math without three (MFW-23 FALLBACK_2D release could use it later) |
| `resolveFlatRiverScene`, `FlatRiverScene`, `getLoyKrathongFlatRiver` | same | Steps 9, 11 | 2D river art, later festivals' 2D maps |
| `flatCoordToCanvasInto`, `flatProgressToCanvasInto`, `createFlatRiverProjection`, `flatRiverScrollLeft`, projection types (`TopDownProjection`, `CanvasPoint`, …) | same | Steps 7, 10 | MFW-30 (2D Find My math), MFW-31 |
| `buildKrathongLayers2D`, `projectModelPoint`, `puckSidePath`, `trianglePoints`, `KrathongLayer2D`, `FlatKrathongView` | same | Step 12 | 2D krathong anywhere (e.g. a 2D inspect thumbnail) |
| `cylindricalToQuadrant2D`, `quadrant2DToCylindrical`, `isVisibleInQuadrant`, `nearestQuadrantAngle`, `stepQuadrant`, `quadrantFocusFor`, `createCylindricalView2D`, `normalizeAngleDeg`, `angleDeltaDeg`, `cylindricalRadius2D`, `QUADRANT_VIEW_ANGLES_DEG`, `QUADRANT_VIEW_NAMES`, `CylindricalTier2D`, `CylindricalView2D` | same | Step 13 | **Christmas / CNY** 2D tree (tap-to-hang, find-my-ornament) |
| `cylindricalCoordToWorld`, `CylindricalTierGeometry` | `@/core/coordinates` | Step 2 | Christmas 3D tree |
| `currentProgress`, `spawnProgressFromCurrent` (three-free path), spline constants | `@/core/coordinates/splineProgress`, `@/core/coordinates/splineConstants` | Step 1 | any three-free client code |
| `FALLBACK_2D_EFFECT_POOL_CAPS` | `@/config/performance.config` | `EffectPoolCaps` | later 2D effects |
| `FLAT_*` constants, `FLAT_VIEW_COLORS`, `FLAT_VIEW_COPY` | `@/config/fallback2d.config` | Step 6 | owner tuning |
| `shadeHex` | `@/core/math/shadeHex` | Step 3 | flat-vector art |

## 11. Open questions (owner)

Product decisions only. The card ships the default under each; each can change later without rework.

1. **2D look and feel numbers** (all PLACEHOLDER): map height 256 px, bank depth 1.2 world units each side, end crop 5 % of the lane at each end, puck side shade 0.8,
   preview framing (half-extent 1.7, lift 0.25), 30 FPS frame budget, unlit colours taken from the 3D materials, krathong sprite = the 3D river size (about 20 px wide on the
   256 px map). Default: as given; owner reviews on a FALLBACK_2D phone (open question 20 testers/devices).
2. **Gimmicks in 2D beyond the AC.** Default: water ripple and the anonymous inspect popup (same as 3D taps); no lamp glow, no krathong bounce, no part-change bounce in 2D.
   Options: add lamp glow (MFW-28 pool `glow`), bounce on tap/part change with `writeBounceAt` (fade-free, off under reduced motion).
3. **Rotate/zoom in the 2D customizer.** Default: none — MFW-20 decided FALLBACK_2D shows no view buttons (its tests pin it) and the 3/4 view already shows every part.
   Option: the preview implements `CustomizeViewControl` (yaw/zoom of `FlatKrathongView`), FlowRoot passes the ref on FALLBACK_2D, and MFW-20's two FALLBACK_2D tests change.
4. **Thai copy** of `FLAT_VIEW_COPY` (accessible names; DRAFT).
5. **Find My behaviour in 2D.** Default: one scroll that centres the krathong (instant under reduced motion) and a highlight ring that keeps following it while it drifts out of view.
   Option: keep auto-scrolling with the krathong until the user scrolls (continuous motion; would need a reduced-motion rule). Also: where the 2D river starts — default centred on the pier.

## 12. Decisions (lead, technical)

- **D1 — SVG, not Canvas 2D.** jsdom has no canvas context, so SVG keeps every 2D behaviour unit-testable and e2e-queryable (`data-*`, `transform`); it is crisp at any DPR
  (no DPR budget needed on FALLBACK_2D); the same layer components draw the customizer and the river sprites. Per frame only ≤ 80 group transforms + ≤ 3 ripples + 1 ring
  change (throttled to `FLAT_RIVER_TARGET_FPS`). The stack allows "HTML5 Canvas/SVG".
- **D2 — A three-free twin of the lane curve instead of importing MFW-8's.** MFW-8's lanes are three `CatmullRomCurve3` objects; any import puts the three chunk (with
  "WebGLRenderer") on the FALLBACK_2D device (MFW-23 D3). The twin reproduces three r187's centripetal Catmull-Rom, arc-length table and MFW-8's frame code with the same
  expressions, so 3D and 2D positions are **bit-identical** (lead probe: 0 differences; tests pin it). Replacing the 3D math with the twin (one implementation) was rejected:
  invasive across MFW-24/27/34 code while MFW-34 is in flight. A three upgrade that changes internals fails `flatLane.test.ts` loudly.
- **D3 — "Semi top-down" = row 9's orthographic top-down map + 3/4-view sprites.** No vertical squash, so MFW-8's top-down round trip and `riverTopDown` stay the 2D truth.
- **D4 — Fixed-height, horizontally scrollable map** at the 3D river's apparent size (sprite scale = `RIVER_KRATHONG_SCALE`); "Find My scrolls" is the scroller's `scrollLeft`
  (native, accessible, no custom pan state). Mouse drags map `PAN_RIVER` to `scrollLeft`; touch pans scroll natively (`touch-manipulation`).
- **D5 — The 2D krathong is a projection of MFW-19's `assembleKrathong` parts** with the 3D camera's azimuth/elevation (derived from `CAMERA_FLIGHT_OFFSET`), so it shows the
  same parts, sockets and colours as 3D from the same `appearance` (invariant B for appearance). Painter's order by depth gives the layering.
- **D6 — Small refactors to make existing pure code three-free** (moved verbatim, public API unchanged): spline constants/progress out of `SplinePathCoord.ts`, the
  projection out of `riverTopDown.ts`, `zoneRiverItems.ts` imports. Reason: reuse instead of duplicating validation and conversion.
- **D7 — Ripples reuse MFW-28's `ObjectPoolManager` and `writeRippleFrameAt`**, sized by `FALLBACK_2D_EFFECT_POOL_CAPS = EFFECT_POOL_CAPS.LOW` (no new number); pre-rendered
  circles = no DOM node per tap (invariant E). Tap detection reuses `createInputSeparator("WORLD_EXPLORE")`; the hit target is read at pointer-down because the separator
  defaults unknown targets to "water".
- **D8 — Find My interface = `useWorldStore.focusedCreationId`** (exists, documented for MFW-30), isolated in `useFlatFocusTarget.ts`; one scroll per focus id.
- **D9 — Own krathong in 2D**: pier preview at MFW-23's three-free `LOY_KRATHONG_PIER_RELEASE_SPOT` in `RITUAL_RELEASE`; after the release it is drawn from `ritual.saved`
  with the server clock offset and excluded from the zone list with MFW-23's `excludeOwnAndCap` (no duplicate, cap kept). It is not tappable (owner view is MFW-31).
- **D10 — All zone items are drawn in 2D** (≤ 80, no tier cap): FALLBACK_2D has no `TIER_BUDGETS` entry and the SVG cost per item is small; pinning (MFW-25 follow-up) is moot.
- **D11 — Lazy `canvas2d` chunk**, like `SceneViewport`: 3D users never download it; `landing-import-graph.test.ts` skips dynamic imports, so a dedicated graph test covers it.
- **D12 — The map is cropped by `FLAT_RIVER_END_MARGIN_PROGRESS`** so the `% 1` wrap is never drawn (owner decision 22); the margin is pinned to hide a whole sprite.
- **D13 — Cylindrical converter**: Δ normalised to [−180°, 180°) so both ±90° edges count as visible (spec `>= 0`), consistent for 90° and 270°; the inverse returns null
  outside the tier or silhouette (clamping within `CYLINDRICAL_QUADRANT_EPSILON` absorbs float error at the edges); the Find My quadrant rounds to the nearest of
  0/90/180/270 (45° → 90°). `cylindricalCoordToWorld` (the spec's own 3D formula) is added so the 2D ↔ 3D consistency can be tested (invariant B).
- **D14 — The inspect popup is reused on a 2D krathong tap**, matching the 3D tap behaviour already shipped by MFW-28 (not a new product behaviour).

## 13. Risks

- **Unmerged prerequisites (MFW-23, MFW-30).** Names come from MFW-23's plan and an assumed MFW-30 contract. Stop if either is missing; adapt only the adapter lines and list
  differences. MFW-30 may define a different 2D hook — `useFlatFocusTarget.ts` is the single place to change.
- **Bit-identity depends on three's internals** (`three` ^0.187.0, pinned by the lockfile). An upgrade can break `flatLane.test.ts`; then update the twin, never loosen the test.
- **SVG cost on very weak phones**: up to 80 sprites × ~27 nodes. Throttled transform-only updates should hold; re-test on a FALLBACK_2D device (follow-up: `<symbol>`/`<use>` per
  appearance, or a Canvas 2D painter behind the same pure layer builder).
- **Chunk splitting**: if Turbopack places a shared module that imports three into the 2D chunk's dependencies, the e2e "no WebGLRenderer" check fails. The import-graph test
  catches source-level leaks; report build evidence in the PR if it still happens.
- **Merge conflicts** in `FlowRoot.tsx` / `FlowRoot.test.tsx` with MFW-30 (both modify them) and in `docs/follow-ups.md`-adjacent areas with MFW-34. Rebase on the latest `main`.
- **Smooth scrolling timing in headless Chromium**: the Find My e2e runs with reduced motion (instant) to stay deterministic; the smooth path is unit-tested.
- **jsdom gaps**: no `scrollTo`, zero-size `getBoundingClientRect`; the component feature-detects `scrollTo` and tests stub it.
- **Unlit flat colours** may look darker than the lit 3D scene; owner art review (§11 Q1).
