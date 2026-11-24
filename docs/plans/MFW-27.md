# MFW-27 [6.1] Low-poly night river environment — implementation spec

> Hand-off spec for one card. It is the source of truth for the implementer and the reviewer. If this file and
> `docs/backlog.json` / `docs/spec/open-questions.md` disagree, those files win; say so in the PR.
> Branch: `feat/MFW-27-low-poly-night-river-environment` · Jira: MFW-27 · Epic: MFW-26 (Loop 6)
> Labels: `loy-krathong`, `3d`, `perf` · Extra reviewer: `r3f-perf-reviewer` (the diff touches `src/components/canvas3d/**`,
> `src/components/models/**` and `src/core/world/**`). Not a privacy/db card: no `privacy-auditor`, and it is not an owner-merge card.

## 1. Summary (Goal)

The card replaces the look-dev water disc with a small, cheap Loy Krathong diorama: a river channel (a water ribbon
along a spline), two raised banks, riverside wooden houses, trees, riverside lamps and a pier (ท่าน้ำ). Spec §6.6
Task 6.1 says: "จัดวางฉากหลังรายละเอียดต่ำแต่มีเสน่ห์: บ้านไม้ริมฝั่ง ต้นไม้ โคมไฟริมน้ำ และท่าน้ำ โดยคุมโทนให้กระทงที่ Interact
ได้มีความโดดเด่นและสังเกตง่ายที่สุด". Every repeated prop is one `InstancedMesh` built from config. The layout is pure,
tested data, and props are placed parametrically along the river so the lanes from MFW-24 can change without
rework. The environment is kept dark, matte and static, and solid props stay off the lanes and out of the camera's
line of sight to the water, so krathongs stay the focal point. The card also does the retro-review clean-up assigned
to it: scene art numbers move from `src/components/canvas3d/index.tsx` into `src/config`, `antialias` and the shadow
map size follow the quality tier, and the lights move out of the panned/rotated world group. The pan gesture itself
is **not** fixed here, because it needs an owner decision (§11). The scene structure is planned so the pan fix can
be added later without rework.

## 2. Prerequisites

Merged on `main` (35057a8):

| Card | What this card uses |
|---|---|
| MFW-15 [3.1] | `src/components/canvas3d/index.tsx`: `SceneViewport`, `ToyNightScene` (internal), `TOY_SCENE_CAMERA`, `TOY_SCENE_CANVAS_CAMERA`, `TOY_SCENE_LIGHTING`, `TOY_MATTE_MATERIALS`, `getSceneRenderSettings` |
| MFW-16 [3.2] | `src/core/interaction` (`createInputSeparator`, `InteractionMode`, `PAN_RIVER` action), `src/config/interaction.config.ts` |
| MFW-17 [3.3] | `src/core/camera` (`createCameraController`, `updateHighlightPosition`, `CameraTargetKind = "water" \| "krathong" \| "lamp"`), `src/config/camera.config.ts` (`CAMERA_FLIGHT_OFFSET`, `HIGHLIGHT_RING_SIZES`) |
| MFW-44 [3.4] | Lazy scene chunk (`FlowRoot` lazy-imports `@/components/canvas3d`). three must stay out of the landing JS. The stable `TOY_SCENE_CANVAS_CAMERA` object and the stub-R3F component tests in `src/components/canvas3d/index.test.tsx` |
| MFW-8 [1.2] | `src/core/coordinates`: `createRiverLane`, `splineProgressToWorld`, `locateOnLane`, `RiverLane`, `RiverLaneDefinition`, `WorldVec3`, `WorldXZ` |
| MFW-9 [1.3] | `TIER_BUDGETS`, `RenderTier` in `src/config/performance.config.ts`; `useDeviceStore` (`qualityTier`, `reducedMotion`, `profiled`) |

Not merged. This card does not wait for them, but it must fit them:

- **MFW-24 [5.2] (river lanes).** ASSUMED INTERFACE (from the MFW-24 prompt `docs/prompts/MFW-24.md`: "If the spec gives no
  lane points, put them in loyKrathong config as clearly labelled placeholders"):
  `export const LOY_KRATHONG_RIVER_LANES: readonly RiverLaneDefinition[]` exported from
  `src/config/events/loyKrathong.river.config.ts`. This card **creates** that export with one placeholder lane. MFW-24
  owns its values (count, points, widths) and must keep the export name and type. The containment test in this card
  keeps guarding MFW-24's values.
  *Before you start:* run `rg -n "RiverLaneDefinition\[\]" src --glob '!**/__fixtures__/**'`. If MFW-24 already merged
  and exports product lanes somewhere else, do not create a second set. Re-export theirs as
  `LOY_KRATHONG_RIVER_LANES` from `loyKrathong.river.config.ts` and point the tests at it.
- **MFW-19 [4.1] (krathong model)** also edits `src/components/canvas3d/index.tsx` (see `docs/plans/MFW-19.md`, Step 18). Check
  `git log --oneline main -- src/components/models/loyKrathong` before you start:
  - *MFW-19 not merged (expected):* keep the island/pebble placeholder krathong and move its numbers into config (Step 4).
    `LOY_KRATHONG_PROMINENCE_REFERENCE_COLORS` = the placeholder colours (Step 5).
  - *MFW-19 merged first:* keep its `KrathongAssetsProvider` / `KrathongModel` exactly as they are. Skip the placeholder parts of
    Step 4. Build `LOY_KRATHONG_PROMINENCE_REFERENCE_COLORS` from its body palettes instead: the base model colours,
    `LEAF_COLOR_PALETTE`, the flower model colours and `CANDLE_COLOR_PALETTE`; not the incense stick. Keep its `name="scene-water"`. Its
    `scene-lamp` mesh is replaced by this card's lamp heads, so update that one test selector.
- **MFW-23 [5.1]** (pier ritual) and **MFW-28 [6.2]** (tap gimmicks) wait for this card and use the interfaces in §10.

## 3. Acceptance criteria → checks

AC (verbatim, `docs/backlog.json` story 6.1):

1. **"Riverside wooden houses, trees, riverside lamps, pier"**
   - The config holds at least one house, tree and lamp placement, and a pier. Each one resolves to world transforms:
     `src/components/models/loyKrathong/riverLayout.test.ts` → "has houses, trees, lamps and a pier".
   - The scene renders one `instancedMesh` per repeated part (house bodies, house roofs, tree trunks, tree canopies, lamp posts,
     lamp heads, pier piles), plus the pier deck, the water and two bank meshes:
     `src/components/models/loyKrathong/RiverEnvironment.test.tsx` → "renders every environment part once".
   - At least one house, one tree, one lamp and the pier tip are inside the default camera view on the narrowest supported
     viewport (320 × 256 CSS px), and nothing visible is clipped by the near/far planes: `riverLayout.test.ts` →
     "default mobile view shows each prop kind" and "visible props are inside the near/far planes".
   - On WebGL (SwiftShader) the canvas renders the scene in all three canvas modes with no page error and no console error:
     `tests/e2e/river-environment.spec.ts`.
2. **"Low detail; interactive krathongs remain the most visually prominent objects"**
   - Low detail: every instanced part geometry has ≤ `ENVIRONMENT_PART_MAX_TRIANGLES` triangles: `riverLayout.test.ts` → "every
     part is low-poly". Draw calls do not grow with prop count (one element per part kind): `RiverEnvironment.test.tsx`.
   - Darker than the krathong: the relative luminance of every environment colour (and of emissive × intensity) is lower than the darkest
     colour in `LOY_KRATHONG_PROMINENCE_REFERENCE_COLORS`: `riverLayout.test.ts` → "environment palette is darker than the krathong".
   - Matte: every environment material has `roughness: 1`, `metalness: 0`: `riverLayout.test.ts`.
   - Off the lanes: no house, tree or lamp footprint is in the water channel, and the pier tip does not reach into any lane:
     `riverLayout.test.ts` → "props stay on the banks" and "pier stops before the lanes".
   - No occlusion: in the default camera view no house or tree top is projected onto a lane (props never hide a krathong):
     `riverLayout.test.ts` → "solid props never hide a lane in the default view".
   - The only warm point light is the krathong candle. Lamps glow through a dim emissive material and add no light:
     `src/components/canvas3d/index.test.tsx` → "the candle is the only point light".
   - Static: the environment uses no `useFrame` and no animation, so it needs no reduced-motion branch. A test proves that
     `useFrame` is never called: `RiverEnvironment.test.tsx` → "is static".
3. **"Fits the quality-tier budgets"**
   - `getSceneRenderSettings(tier)` returns `dpr`, `shadows`, `maxTextureSize`, `antialias` (from `TIER_ANTIALIAS`) and
     `shadowMapSizePx = min(MOON_SHADOW_MAP_SIZE_PX, TIER_BUDGETS[tier].maxTextureSize)`: `index.test.tsx`.
   - The canvas `gl.antialias` follows the tier, and the canvas is re-created when the value flips (e.g. MEDIUM → LOW) without losing the
     pinch zoom: `index.test.tsx` → "antialias follows the tier".
   - Shadows: environment parts cast/receive only when the tier has shadows: `InstancedPart.test.tsx` → `partShadowProps`.
   - No textures in scene code, which trivially fits `maxTextureSize` and keeps the GPU memory flat: `tests/unit/scene-art-constants.test.ts`.
   - Dispose: every geometry and material the environment creates is disposed on unmount, and none is re-created on re-render:
     `RiverEnvironment.test.tsx`, `InstancedPart.test.tsx` (invariant E).
   - The FALLBACK_2D tier still renders no canvas and downloads no WebGL chunk. The existing `tests/e2e/scene-gating.spec.ts` must stay green unchanged.

Retro-review findings assigned to this card (from the MFW-1 plan guide):

| Finding | Check |
|---|---|
| Scene art numbers inline in `canvas3d/index.tsx` (zoom 52, near/far, light palette, ring `#ffd166` + opacity, chip default 50/55, drag clamp 8–92, water disc 3.1 / y 0.24) | Moved to `src/config/*` (Steps 1–5). `tests/unit/scene-art-constants.test.ts` fails on any hex colour or decimal literal in `src/components/canvas3d/**` / `src/components/models/**` (non-test files) |
| `gl={{ antialias: true }}` ignores the tier | `TIER_ANTIALIAS` + Canvas `key` (Step 13), tested |
| `maxTextureSize` from `TIER_BUDGETS` computed but unused | Applied to the moon shadow map size (Step 13), tested; no textures elsewhere |
| Lights are children of the panned/rotated world group | Ambient + moon light move to the scene root. The candle moves into the krathong group. Tested by DOM structure (`index.test.tsx` → "lights are not inside the world-view group") |
| Pan is wrong (inverted signs, world x/z instead of camera right/up, horizontal drag also rotates, no bounds/reset) | **Not changed here: owner decision pending (§11 Q1).** This card provides `layout.bounds` and the `scene-world-view` group seam (§10) |

## 4. Owner decisions that apply

Quoted from `docs/spec/open-questions.md` and CLAUDE.md. Do not reopen them.

- Q5 (MFW-9): "budgets DPR cap 2/1.5/1, shadows on/off/off, max texture 2048/1024/512 px (owner, 2026-11-23)". Read them from
  `TIER_BUDGETS`, and do not change their values.
- Q4 (MFW-25): "80 items per zone (owner, 2026-11-23)". The environment is per scene, not per zone, and adds no krathong items.
- Q11 (MFW-15): "@react-spring/three (owner, 2026-11-23)". Not used by this card, because the environment is static.
- Q16 (MFW-36): "build the engine loops … generically; finish Loy Krathong only as far as the private test needs". So the generic
  pieces (`InstancedPart`, part geometry/material factories, ribbon and bank-placement math in `src/core/world`) are festival-agnostic.
  Only the config and `RiverEnvironment` are Loy Krathong specific.
- Launch plan (CLAUDE.md): Phase 1 is Loy Krathong only, and Christmas stays a stub. Build no Christmas scene.

No row of `open-questions.md` names MFW-27 in "Decide in", so no row needs an update.

## 5. Files

| Path | New/modify | Purpose |
|---|---|---|
| `src/config/camera.config.ts` | modify | `SCENE_CAMERA_ZOOM`, `SCENE_CAMERA_NEAR`, `SCENE_CAMERA_FAR`, `HIGHLIGHT_RING_COLOR`, `HIGHLIGHT_RING_OPACITY`, `HIGHLIGHT_RING_SEGMENTS` |
| `src/config/interaction.config.ts` | modify | Ritual chip start position and drag clamp constants, `PERCENT_SCALE` |
| `src/config/performance.config.ts` | modify | `TIER_ANTIALIAS` (lead decision, MFW-27). `TIER_BUDGETS` is untouched |
| `src/config/performance.config.test.ts` | modify | One new case for `TIER_ANTIALIAS` |
| `src/config/scene.config.ts` | new | Generic toy-scene look: `TOY_SCENE_LIGHTING`, `TOY_MATTE_MATERIALS`, krathong placeholder meshes, `MOON_SHADOW_MAP_SIZE_PX`, `ENVIRONMENT_PART_MAX_TRIANGLES`, part spec types |
| `src/config/events/loyKrathong.river.config.ts` | new | River channel, placeholder lanes (ASSUMED INTERFACE for MFW-24), environment placements, pier, part specs and palette, prominence reference colours |
| `src/core/math/relativeLuminance.ts` + `.test.ts` | new | WCAG relative luminance of `#rrggbb` |
| `src/core/world/riverEnvironment.ts` + `.test.ts` | new | Pure layout: channel, bank placement, ribbons, pier, bounds |
| `src/core/world/index.ts` | modify | `export * from "./riverEnvironment";` |
| `src/components/canvas3d/sceneObjectNames.ts` | new | `SCENE_OBJECT_NAMES`: stable three `name`s (also the test selectors) |
| `src/components/canvas3d/geometry.ts` + `.test.ts` | new | `createPartGeometry`, `createMatteMaterial`, `createRibbonGeometry`, `countTriangles` |
| `src/components/canvas3d/instancing.ts` | new | `composeInstanceMatrix`, `applyInstanceTransforms`, `partShadowProps` |
| `src/components/canvas3d/InstancedPart.tsx` + `.test.tsx` | new | Generic instanced part with dispose |
| `src/components/models/loyKrathong/riverLayout.ts` + `.test.ts` | new | `LOY_KRATHONG_RIVER_LAYOUT`, `lampIndexFromInstanceId` |
| `src/components/models/loyKrathong/RiverEnvironment.tsx` + `.test.tsx` | new | Renders water, banks, houses, trees, lamps, pier |
| `src/components/models/loyKrathong/index.ts` | modify | Barrel exports (keep the existing comment line) |
| `src/components/canvas3d/index.tsx` | modify | Uses config constants and the new environment; lights moved; tier-aware `gl`/shadow map; lamp selection by index |
| `src/components/canvas3d/index.test.tsx` | modify | Name-based selectors, the stub passes `gl`, new cases |
| `tests/unit/scene-art-constants.test.ts` | new | Static scan: no hex colours / decimal literals / texture loaders in scene component files |
| `tests/e2e/river-environment.spec.ts` | new | Scene renders on HIGH and LOW with no page/console errors |

## 6. Implementation steps (Plan)

All numbers below are constants in the named config file. "PLACEHOLDER (spec silent)" means the spec gives no value: keep it
exactly as given and list it in the PR under "Decisions". The owner may tune it later (§11 Q2). Values marked "existing" are
moved unchanged from `src/components/canvas3d/index.tsx`.

### Step 1 — `src/config/camera.config.ts` (modify, append)

```ts
/** Toy scene orthographic camera (MFW-15 values, moved from canvas3d in MFW-27). */
export const SCENE_CAMERA_ZOOM = 52;   // existing
export const SCENE_CAMERA_NEAR = 0.1;  // existing
export const SCENE_CAMERA_FAR = 40;    // existing
/** Highlight ring look (MFW-17 values, moved in MFW-27). */
export const HIGHLIGHT_RING_COLOR = "#ffd166"; // existing
export const HIGHLIGHT_RING_OPACITY = 0.9;     // existing
export const HIGHLIGHT_RING_SEGMENTS = 32;     // existing
```
Do not change `CAMERA_FLIGHT_OFFSET`, `CAMERA_FLIGHT_SPRING_CONFIG` or `HIGHLIGHT_RING_SIZES`.

### Step 2 — `src/config/interaction.config.ts` (modify, append)

```ts
/** RITUAL_RELEASE "กระทง" chip start position, percent of the viewport (MFW-16 values, moved in MFW-27). */
export const RITUAL_CHIP_START_PERCENT = Object.freeze({ x: 50, y: 55 }); // existing
/** The chip is clamped to this percent range on both axes so it stays reachable (existing). */
export const RITUAL_CHIP_MIN_PERCENT = 8;  // existing
export const RITUAL_CHIP_MAX_PERCENT = 92; // existing
/** px delta / viewport size × PERCENT_SCALE = percent delta. */
export const PERCENT_SCALE = 100;
```

### Step 3 — `src/config/performance.config.ts` (modify, append under a new heading)

```ts
// Technical numbers (lead decision, MFW-27)

/**
 * WebGL MSAA per 3D tier. The renderer reads it only when it is created, so SceneViewport re-creates the canvas when
 * the value flips (at most once per session: tiers never step up). Lead decision, MFW-27.
 */
export const TIER_ANTIALIAS: Readonly<Record<RenderTier, boolean>> = Object.freeze({
  HIGH: true,
  MEDIUM: true,
  LOW: false,
});
```
Do not edit `TIER_BUDGETS` or the `TierBudget` interface: they are owner numbers, and their test asserts exact equality.

### Step 4 — `src/config/scene.config.ts` (new)

```ts
/** Generic toy-scene look shared by festival scenes (MFW-15 values moved here in MFW-27; spec §2.1, backlog 3.1). */

export const TOY_SCENE_LIGHTING = {
  background: "#101a32",
  ambient: { color: "#8499c5", intensity: 0.75 },
  moon: { color: "#bdceff", intensity: 1.15, position: [-4, 7, 3] as [number, number, number] },
  candle: { color: "#ffb35c", intensity: 14, distance: 7, position: [0.15, 1.25, 0.1] as [number, number, number] },
}; // all existing

/** Matte, non-glossy (backlog 3.1 AC2). */
export const TOY_MATTE_MATERIALS = {
  water: { color: "#243d65", roughness: 1, metalness: 0 },  // existing
  island: { color: "#536e74", roughness: 1, metalness: 0 }, // existing (krathong placeholder, removed by MFW-19)
  pebble: { color: "#91a88f", roughness: 1, metalness: 0 }, // existing (krathong placeholder, removed by MFW-19)
};
// The old `moon` entry is deleted: it only coloured the single look-dev lamp sphere that this card replaces.

/** Placeholder krathong (MFW-15) until MFW-19's model lands. Args are three.js constructor args. Existing values. */
export const KRATHONG_PLACEHOLDER = {
  island: { cylinderArgs: [1.18, 1.32, 0.42, 12] as [number, number, number, number], position: [0, 0.02, 0] as [number, number, number] },
  pebbles: [
    { sphereArgs: [0.32, 16, 12] as [number, number, number], position: [0, 0.34, 0] as [number, number, number] },
    { sphereArgs: [0.22, 12, 10] as [number, number, number], position: [-0.66, 0.28, 0.2] as [number, number, number] },
    { sphereArgs: [0.18, 12, 10] as [number, number, number], position: [0.55, 0.27, -0.3] as [number, number, number] },
  ],
} as const;

/** Moon shadow map edge (px) before the tier clamp min(…, TIER_BUDGETS[tier].maxTextureSize). PLACEHOLDER (spec silent). */
export const MOON_SHADOW_MAP_SIZE_PX = 1024;

/** "Low detail" regression guard: max triangles per environment part geometry. Lead decision, MFW-27 (not a product limit). */
export const ENVIRONMENT_PART_MAX_TRIANGLES = 32;

/** three.js primitive used by one scene part (constructor args by name). */
export type PartGeometrySpec =
  | { readonly kind: "box"; readonly width: number; readonly height: number; readonly depth: number }
  | { readonly kind: "cone"; readonly radius: number; readonly height: number; readonly radialSegments: number }
  | {
      readonly kind: "cylinder";
      readonly radiusTop: number;
      readonly radiusBottom: number;
      readonly height: number;
      readonly radialSegments: number;
    }
  | { readonly kind: "icosahedron"; readonly radius: number }; // detail 0 (20 faces)

/** Matte material (the literal types enforce backlog 3.1 "non-glossy"). */
export interface MatteMaterialSpec {
  readonly color: string; // "#rrggbb"
  readonly roughness: 1;
  readonly metalness: 0;
  readonly flatShading: boolean;
  readonly emissive?: string; // "#rrggbb"
  readonly emissiveIntensity?: number;
}

/** One repeated scene part, drawn as one InstancedMesh. */
export interface ScenePartSpec {
  readonly geometry: PartGeometrySpec;
  readonly material: MatteMaterialSpec;
  /** Height of the geometry centre above the instance base, in local units (multiplied by the instance scale). */
  readonly yOffset: number;
  /** Added to the instance yaw (e.g. π/4 turns a 4-sided cone into a square roof). */
  readonly yawOffsetRad: number;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}
```
If MFW-19 merged first, skip `KRATHONG_PLACEHOLDER` and the `island`/`pebble` entries (see §2).

### Step 5 — `src/config/events/loyKrathong.river.config.ts` (new)

Use `import type` only from `@/core/coordinates`, `@/core/world` and `@/config/scene.config` (value import of
`TOY_MATTE_MATERIALS` is fine: it is plain data). World units are the same as the scene (y up). The channel runs
along +x. In this layout, side `1` (+right of the flow = +z) is the bank nearer the default camera.

```ts
import type { RiverLaneDefinition, WorldVec3 } from "@/core/coordinates";
import type { RiverEnvironmentDefinition } from "@/core/world";
import { TOY_MATTE_MATERIALS, type MatteMaterialSpec, type ScenePartSpec } from "@/config/scene.config";

/** Water surface height (existing: the MFW-15 disc sat at y = -0.24). */
export const RIVER_WATER_SURFACE_Y = -0.24;
/** Bank top height, slightly above the water. PLACEHOLDER (spec silent). */
export const RIVER_BANK_TOP_Y = -0.14;

/** River centreline (flat: y must be 0). Passes through the origin, where the krathong sits. PLACEHOLDER (spec silent). */
const RIVER_CENTERLINE: readonly WorldVec3[] = [
  { x: -12, y: 0, z: 0.6 },
  { x: -6, y: 0, z: -0.3 },
  { x: 0, y: 0, z: 0 },
  { x: 6, y: 0, z: 0.4 },
  { x: 12, y: 0, z: -0.5 },
];

/** Visible water channel. Width PLACEHOLDER (spec silent). */
export const LOY_KRATHONG_RIVER_CHANNEL = { controlPoints: RIVER_CENTERLINE, width: 3.2 } as const;

/**
 * ASSUMED INTERFACE for MFW-24 (river lanes): MFW-24 owns these values and keeps this name/type.
 * Every lane must stay inside LOY_KRATHONG_RIVER_CHANNEL (riverLayout.test.ts). PLACEHOLDER (spec silent): one lane on the centreline.
 */
export const LOY_KRATHONG_RIVER_LANES: readonly RiverLaneDefinition[] = [
  { laneId: 0, controlPoints: RIVER_CENTERLINE, width: 2.4 },
];

const matte = (color: string, extra: Partial<MatteMaterialSpec> = {}): MatteMaterialSpec => ({
  color, roughness: 1, metalness: 0, flatShading: true, ...extra,
});

/** Environment palette: dark, desaturated night tones (must stay darker than the krathong, see test). PLACEHOLDER (spec silent). */
export const RIVER_BANK_MATERIAL = matte("#2c3a2f");
export const PIER_DECK_MATERIAL = matte("#56402e");

/** Pier (ท่าน้ำ) on the near bank. PLACEHOLDER (spec silent). */
export const LOY_KRATHONG_PIER = {
  progress: 0.4,
  side: 1,
  onBankLength: 0.5,
  overWaterLength: 0.35,
  width: 0.5,
  deckThickness: 0.06,
  deckTopY: -0.1,
  pileBottomY: -0.34,
  releaseInset: 0.3,
  pileAlongFractions: [0.5, 1],
} as const;

/** Repeated parts, one InstancedMesh each. PLACEHOLDER (spec silent) sizes/colours. */
export const RIVER_ENVIRONMENT_PARTS = {
  houseBody: { geometry: { kind: "box", width: 0.8, height: 0.5, depth: 0.6 }, material: matte("#4a3628"),
    yOffset: 0.25, yawOffsetRad: 0, castShadow: true, receiveShadow: true },
  houseRoof: { geometry: { kind: "cone", radius: 0.6, height: 0.35, radialSegments: 4 }, material: matte("#3a2a22"),
    yOffset: 0.675, yawOffsetRad: Math.PI / 4, castShadow: true, receiveShadow: false },
  treeTrunk: { geometry: { kind: "cylinder", radiusTop: 0.05, radiusBottom: 0.07, height: 0.3, radialSegments: 5 },
    material: matte("#3b2e25"), yOffset: 0.15, yawOffsetRad: 0, castShadow: true, receiveShadow: false },
  treeCanopy: { geometry: { kind: "cone", radius: 0.32, height: 0.8, radialSegments: 6 }, material: matte("#24402f"),
    yOffset: 0.7, yawOffsetRad: 0, castShadow: true, receiveShadow: false },
  lampPost: { geometry: { kind: "cylinder", radiusTop: 0.025, radiusBottom: 0.025, height: 0.45, radialSegments: 5 },
    material: matte("#2f2a26"), yOffset: 0.225, yawOffsetRad: 0, castShadow: false, receiveShadow: false },
  lampHead: { geometry: { kind: "icosahedron", radius: 0.07 },
    material: matte("#5a4b32", { emissive: "#5c4c27", emissiveIntensity: 0.2 }), // emissive values: existing look-dev lamp
    yOffset: 0.5, yawOffsetRad: 0, castShadow: false, receiveShadow: false },
  pierPile: { geometry: { kind: "cylinder", radiusTop: 0.035, radiusBottom: 0.035,
      height: LOY_KRATHONG_PIER.deckTopY - LOY_KRATHONG_PIER.deckThickness - LOY_KRATHONG_PIER.pileBottomY, radialSegments: 5 },
    material: PIER_DECK_MATERIAL, yOffset: 0, yawOffsetRad: 0, castShadow: false, receiveShadow: false },
} as const satisfies Record<string, ScenePartSpec>;

export type RiverEnvironmentPartId = keyof typeof RIVER_ENVIRONMENT_PARTS;

/** Full environment definition. Placements are PLACEHOLDER (spec silent). setback = world units from the water edge. */
export const LOY_KRATHONG_RIVER_ENVIRONMENT: RiverEnvironmentDefinition = {
  channel: LOY_KRATHONG_RIVER_CHANNEL,
  waterSurfaceY: RIVER_WATER_SURFACE_Y,
  bankTopY: RIVER_BANK_TOP_Y,
  bankWidth: 4,
  waterUnderlap: 0.3,
  ribbonSegments: 64,
  houses: [
    { progress: 0.36, side: -1, setback: 0.7, scale: 1, yawOffsetRad: 0 },
    { progress: 0.45, side: -1, setback: 0.7, scale: 1.1, yawOffsetRad: 0 },
    { progress: 0.56, side: -1, setback: 0.7, scale: 0.9, yawOffsetRad: 0 },
    { progress: 0.66, side: -1, setback: 0.7, scale: 1, yawOffsetRad: 0 },
    { progress: 0.3, side: 1, setback: 2.6, scale: 1, yawOffsetRad: 0 },
    { progress: 0.7, side: 1, setback: 2.6, scale: 1, yawOffsetRad: 0 },
  ],
  trees: [
    { progress: 0.33, side: -1, setback: 1.5, scale: 1, yawOffsetRad: 0 },
    { progress: 0.4, side: -1, setback: 1.7, scale: 1.1, yawOffsetRad: 0 },
    { progress: 0.5, side: -1, setback: 1.4, scale: 0.9, yawOffsetRad: 0 },
    { progress: 0.61, side: -1, setback: 1.7, scale: 1, yawOffsetRad: 0 },
    { progress: 0.36, side: 1, setback: 2.2, scale: 1, yawOffsetRad: 0 },
    { progress: 0.55, side: 1, setback: 2.4, scale: 1.1, yawOffsetRad: 0 },
    { progress: 0.64, side: 1, setback: 2, scale: 0.9, yawOffsetRad: 0 },
  ],
  lamps: [
    { progress: 0.44, side: 1, setback: 0.2, scale: 1, yawOffsetRad: 0 },
    { progress: 0.52, side: 1, setback: 0.2, scale: 1, yawOffsetRad: 0 },
    { progress: 0.6, side: 1, setback: 0.2, scale: 1, yawOffsetRad: 0 },
    { progress: 0.41, side: -1, setback: 0.2, scale: 1, yawOffsetRad: 0 },
    { progress: 0.5, side: -1, setback: 0.2, scale: 1, yawOffsetRad: 0 },
    { progress: 0.6, side: -1, setback: 0.2, scale: 1, yawOffsetRad: 0 },
  ],
  pier: LOY_KRATHONG_PIER,
};

/**
 * Krathong body colours the environment must stay darker than (AC2). MFW-19 replaces these with its body palettes
 * (base, leaf, flower, candle colours; not incense) when its model lands.
 */
export const LOY_KRATHONG_PROMINENCE_REFERENCE_COLORS: readonly string[] = [
  TOY_MATTE_MATERIALS.island.color,
  TOY_MATTE_MATERIALS.pebble.color,
];
```
If TypeScript widens `side: 1` from `as const` objects, it is fine, because `BankSide` is `-1 | 1` and the literals satisfy it. If an
`as const` readonly tuple does not match `readonly number[]`, change the `RiverEnvironmentDefinition` field types to `readonly`
arrays rather than casting.

The lead probed these values with three (scratch script). Water/bank ribbons never fold (min turning radius ≈ 13.4 > 5.6, the outer
bank offset). The pier tip sits at lateral 1.25 > lane half-width 1.2. The release point is at lane lateralOffset ≈ 0.40. On a
320 × 256 view, houses #2/#3, trees #1–#3, all lamps and the pier tip are on screen.

### Step 6 — `src/core/math/relativeLuminance.ts` (new)

```ts
/** WCAG 2.x relative luminance of an sRGB "#rrggbb" colour, in [0, 1]. */
export const SRGB_CHANNEL_MAX = 255;
export const SRGB_LINEAR_THRESHOLD = 0.04045;
export const SRGB_LINEAR_DIVISOR = 12.92;
export const SRGB_GAMMA_OFFSET = 0.055;
export const SRGB_GAMMA_SCALE = 1.055;
export const SRGB_GAMMA_EXPONENT = 2.4;
export const LUMINANCE_WEIGHTS = Object.freeze({ r: 0.2126, g: 0.7152, b: 0.0722 });
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function relativeLuminance(hex: string): number {
  if (!HEX_COLOR.test(hex)) throw new RangeError(`expected "#rrggbb", got ${JSON.stringify(hex)}`);
  const lin = (offset: number) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / SRGB_CHANNEL_MAX;
    return c <= SRGB_LINEAR_THRESHOLD ? c / SRGB_LINEAR_DIVISOR : ((c + SRGB_GAMMA_OFFSET) / SRGB_GAMMA_SCALE) ** SRGB_GAMMA_EXPONENT;
  };
  return LUMINANCE_WEIGHTS.r * lin(1) + LUMINANCE_WEIGHTS.g * lin(3) + LUMINANCE_WEIGHTS.b * lin(5);
}
```

### Step 7 — `src/core/world/riverEnvironment.ts` (new, pure; festival-agnostic)

Imports: `createRiverLane`, `splineProgressToWorld`, types `RiverLane`, `WorldVec3`, `WorldXZ` from `@/core/coordinates`. No
React, no rendering. Nothing here is persisted (invariant A): these are scene-layout values, derived on the client.

```ts
/** The channel reuses the lane curve machinery; this id is never matched against a SplinePathCoord. */
export const RIVER_CHANNEL_CURVE_ID = 0;

/** -1 = left of the flow, 1 = right of the flow (the +right vector of splineProgressToWorld). */
export type BankSide = -1 | 1;

export interface RiverChannelDefinition {
  readonly controlPoints: readonly WorldVec3[]; // y must be 0 (flat channel)
  readonly width: number; // world units, > 0
}
export interface BankPlacement {
  readonly progress: number;     // [0, 1] along the channel (arc length)
  readonly side: BankSide;
  readonly setback: number;      // world units from the water edge, >= 0 and < bankWidth
  readonly scale: number;        // uniform, finite > 0
  readonly yawOffsetRad: number; // finite; added to the "face the water" yaw
}
export interface PierDefinition {
  readonly progress: number; readonly side: BankSide;
  readonly onBankLength: number;    // > 0, deck length over the bank
  readonly overWaterLength: number; // > 0, deck length over the water
  readonly width: number;           // > 0, across the pier (along the flow)
  readonly deckThickness: number;   // > 0
  readonly deckTopY: number;
  readonly pileBottomY: number;     // < deckTopY - deckThickness
  readonly releaseInset: number;    // > 0, release point distance beyond the tip, over water
  readonly pileAlongFractions: readonly number[]; // each in (0, 1]: fraction of overWaterLength from the water edge
}
export interface RiverEnvironmentDefinition {
  readonly channel: RiverChannelDefinition;
  readonly waterSurfaceY: number;
  readonly bankTopY: number;
  readonly bankWidth: number;      // > 0
  readonly waterUnderlap: number;  // >= 0 and < bankWidth: water extends this far under each bank
  readonly ribbonSegments: number; // integer >= 1
  readonly houses: readonly BankPlacement[];
  readonly trees: readonly BankPlacement[];
  readonly lamps: readonly BankPlacement[];
  readonly pier: PierDefinition;
}
export interface InstanceTransform {
  readonly position: WorldVec3; // instance base (derived, never persisted)
  readonly yawRad: number;      // rotation about +Y; local +Z maps to (sin yaw, 0, cos yaw)
  readonly scale: number;
}
export interface RibbonGeometryData {
  readonly positions: Float32Array; // xyz per vertex, y = 0 (the mesh position sets the height)
  readonly indices: Uint32Array;
  readonly vertexCount: number;
}
export interface WorldBoundsXZ { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number; }
export interface PierLayout {
  readonly deckCenter: WorldVec3;
  readonly yawRad: number;          // deck local +Z points from the bank toward the river
  readonly length: number;          // onBankLength + overWaterLength (box depth)
  readonly width: number;           // box width
  readonly thickness: number;       // box height
  readonly tip: WorldVec3;          // top of the deck at its river end (y = deckTopY): preview spot for MFW-23
  readonly releasePoint: WorldVec3; // on the water (y = waterSurfaceY), releaseInset beyond the tip
  readonly piles: readonly InstanceTransform[]; // position = pile centre, scale 1, yaw = pier yaw
  readonly pileHeight: number;      // deckTopY - deckThickness - pileBottomY
}
export interface RiverFrame { readonly centerline: WorldVec3; readonly right: WorldVec3; readonly flow: WorldXZ; }
export interface RiverEnvironmentLayout {
  readonly channel: RiverLane;
  readonly waterSurfaceY: number;
  readonly bankTopY: number;
  readonly water: RibbonGeometryData;
  readonly banks: { readonly left: RibbonGeometryData; readonly right: RibbonGeometryData };
  readonly houses: readonly InstanceTransform[];
  readonly trees: readonly InstanceTransform[];
  readonly lamps: readonly InstanceTransform[];
  readonly pier: PierLayout;
  readonly bounds: WorldBoundsXZ; // union of the water and both bank ribbons; for a future pan clamp
}
```

Functions (all throw `RangeError` with a clear message on invalid input; validate with `Number.isFinite`):

1. `createRiverChannel(def: RiverChannelDefinition): RiverLane`. If any control point has `y !== 0`, it throws
   `"river channel control points must have y === 0"`. Otherwise it returns `createRiverLane({ laneId: RIVER_CHANNEL_CURVE_ID, controlPoints, width, closed: false })`,
   which validates the width and the points.
2. `riverFrameAt(channel: RiverLane, progress: number): RiverFrame`. The progress must be finite and in [0, 1]. It takes
   `{ centerline, right } = splineProgressToWorld(channel, progress, 0)` and returns `flow = { x: right.z, z: -right.x }` (the unit horizontal flow direction).
3. `facingWaterYaw(right: WorldVec3, side: BankSide): number` = `Math.atan2(-side * right.x, -side * right.z)`. Local +Z then
   faces the water.
4. `resolveBankPlacement(channel: RiverLane, placement: BankPlacement, baseY: number): InstanceTransform`. It validates the
   progress ([0, 1]), `side ∈ {-1, 1}`, the setback (finite ≥ 0), the scale (finite > 0) and yawOffsetRad (finite). With
   `d = side * (channel.width / 2 + setback)`, it returns
   `{ position: { x: c.x + right.x * d, y: baseY, z: c.z + right.z * d }, yawRad: facingWaterYaw(right, side) + yawOffsetRad, scale }`.
5. `buildRibbonGeometryData(channel: RiverLane, fromOffset: number, toOffset: number, segments: number): RibbonGeometryData`.
   The offsets are signed world distances along `right` and must be finite, with `fromOffset < toOffset`. `segments` must be an integer ≥ 1.
   `vertexCount = (segments + 1) * 2`. For `i = 0..segments`, `{centerline: c, right} = riverFrameAt(channel, i / segments)`.
   Vertex `2i` = `(c.x + right.x*fromOffset, 0, c.z + right.z*fromOffset)` and vertex `2i+1` = the same with `toOffset`.
   Indices per segment `i`: `a = 2i, b = a+1, c = a+2, d = a+3` → `[a, b, c, b, d, c]`. This winding faces +y (verified by
   the lead; the test re-checks every triangle).
6. `ribbonBoundsXZ(data: RibbonGeometryData): WorldBoundsXZ` gives the min/max over all vertices (x and z).
   `mergeBoundsXZ(a, b): WorldBoundsXZ` merges two bounds.
7. `resolvePierLayout(channel: RiverLane, pier: PierDefinition, waterSurfaceY: number): PierLayout`. It validates the fields as documented above, and
   `overWaterLength + releaseInset <= channel.width / 2` (the release point never passes the centreline). Then:
   ```ts
   const { centerline: c, right, flow } = riverFrameAt(channel, pier.progress);
   const half = channel.width / 2;
   const at = (lateral: number, y: number): WorldVec3 =>
     ({ x: c.x + right.x * pier.side * lateral, y, z: c.z + right.z * pier.side * lateral });
   const bankEnd = half + pier.onBankLength;
   const tipLateral = half - pier.overWaterLength;
   const deckBottomY = pier.deckTopY - pier.deckThickness;
   const yawRad = facingWaterYaw(right, pier.side);
   const pileY = (deckBottomY + pier.pileBottomY) / 2;
   const piles = pier.pileAlongFractions.flatMap((f) => {
     const base = at(half - f * pier.overWaterLength, pileY);
     return ([-1, 1] as const).map((s) => ({
       position: { x: base.x + flow.x * s * pier.width / 2, y: pileY, z: base.z + flow.z * s * pier.width / 2 },
       yawRad, scale: 1,
     }));
   });
   return {
     deckCenter: at((bankEnd + tipLateral) / 2, pier.deckTopY - pier.deckThickness / 2),
     yawRad, length: pier.onBankLength + pier.overWaterLength, width: pier.width, thickness: pier.deckThickness,
     tip: at(tipLateral, pier.deckTopY),
     releasePoint: at(tipLateral - pier.releaseInset, waterSurfaceY),
     piles, pileHeight: deckBottomY - pier.pileBottomY,
   };
   ```
8. `resolveRiverEnvironment(def: RiverEnvironmentDefinition): RiverEnvironmentLayout`. It validates `bankWidth > 0`,
   `0 <= waterUnderlap < bankWidth`, and every house/tree/lamp `setback < bankWidth` (message names the list and index). Then,
   with `half = def.channel.width / 2`:
   - `channel = createRiverChannel(def.channel)`
   - `water = buildRibbonGeometryData(channel, -(half + waterUnderlap), half + waterUnderlap, ribbonSegments)`
   - `banks.left = buildRibbonGeometryData(channel, -(half + bankWidth), -half, ribbonSegments)`,
     `banks.right = buildRibbonGeometryData(channel, half, half + bankWidth, ribbonSegments)`
   - houses/trees/lamps = each placement through `resolveBankPlacement(channel, p, def.bankTopY)`, in config order
   - `pier = resolvePierLayout(channel, def.pier, def.waterSurfaceY)`
   - `bounds` = the merge of the three ribbon bounds.

`src/core/world/index.ts`: keep the comment line and add `export * from "./riverEnvironment";`.

### Step 8 — `src/components/canvas3d/sceneObjectNames.ts` (new)

```ts
/** three.js `name`s of scene objects (debugging aid and stable test selectors). */
export const SCENE_OBJECT_NAMES = Object.freeze({
  worldView: "scene-world-view",
  water: "scene-water",
  bankLeft: "scene-bank-left",
  bankRight: "scene-bank-right",
  krathong: "scene-krathong",
  houseBodies: "scene-house-bodies",
  houseRoofs: "scene-house-roofs",
  treeTrunks: "scene-tree-trunks",
  treeCanopies: "scene-tree-canopies",
  lampPosts: "scene-lamp-posts",
  lampHeads: "scene-lamp-heads",
  lampFocus: "scene-lamp-focus",
  pierDeck: "scene-pier-deck",
  pierPiles: "scene-pier-piles",
});
```

### Step 9 — `src/components/canvas3d/geometry.ts` (new)

```ts
import { BoxGeometry, BufferAttribute, BufferGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry, MeshStandardMaterial } from "three";
import type { MatteMaterialSpec, PartGeometrySpec } from "@/config/scene.config";
import type { RibbonGeometryData } from "@/core/world";

export function createPartGeometry(spec: PartGeometrySpec): BufferGeometry  // switch on kind:
//  box → new BoxGeometry(width, height, depth); cone → new ConeGeometry(radius, height, radialSegments);
//  cylinder → new CylinderGeometry(radiusTop, radiusBottom, height, radialSegments); icosahedron → new IcosahedronGeometry(radius, 0)
//  (exhaustive switch; `const never: never = spec` in default)

export function createMatteMaterial(spec: MatteMaterialSpec): MeshStandardMaterial
//  new MeshStandardMaterial({ color, roughness, metalness, flatShading, ...(emissive ? { emissive, emissiveIntensity: spec.emissiveIntensity ?? 1 } : {}) })
//  (`1` here is three's default emissiveIntensity; write it as a named const DEFAULT_EMISSIVE_INTENSITY = 1)

export function createRibbonGeometry(data: RibbonGeometryData): BufferGeometry
//  g.setAttribute("position", new BufferAttribute(data.positions, 3));
//  normals: Float32Array(vertexCount*3) filled with (0, 1, 0) → g.setAttribute("normal", new BufferAttribute(normals, 3));
//  g.setIndex(new BufferAttribute(data.indices, 1)); g.computeBoundingSphere(); return g;

export function countTriangles(geometry: BufferGeometry): number
//  (geometry.index ? geometry.index.count : geometry.getAttribute("position").count) / 3
```

### Step 10 — `src/components/canvas3d/instancing.ts` (new)

```ts
import { Euler, Matrix4, Quaternion, Vector3, type InstancedMesh } from "three";
import type { ScenePartSpec } from "@/config/scene.config";
import type { InstanceTransform } from "@/core/world";

const scratchPosition = new Vector3(); const scratchScale = new Vector3();
const scratchEuler = new Euler(); const scratchQuaternion = new Quaternion(); const scratchMatrix = new Matrix4();

/** Allocation-free: writes T(position + (0, yOffset·scale, 0)) · R_y(yaw + yawOffset) · S(scale) into `out`. */
export function composeInstanceMatrix(t: InstanceTransform, part: Pick<ScenePartSpec, "yOffset" | "yawOffsetRad">, out: Matrix4): Matrix4 {
  scratchPosition.set(t.position.x, t.position.y + part.yOffset * t.scale, t.position.z);
  scratchQuaternion.setFromEuler(scratchEuler.set(0, t.yawRad + part.yawOffsetRad, 0));
  scratchScale.setScalar(t.scale);
  return out.compose(scratchPosition, scratchQuaternion, scratchScale);
}

/** Writes all instance matrices, flags the upload and refreshes the bounding sphere (raycast + frustum culling). */
export function applyInstanceTransforms(
  mesh: Pick<InstancedMesh, "setMatrixAt" | "instanceMatrix" | "computeBoundingSphere">,
  transforms: readonly InstanceTransform[],
  part: Pick<ScenePartSpec, "yOffset" | "yawOffsetRad">,
): void {
  transforms.forEach((t, i) => mesh.setMatrixAt(i, composeInstanceMatrix(t, part, scratchMatrix)));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

/** Tier gate: nothing casts or receives shadows unless the tier budget has shadows. */
export function partShadowProps(part: Pick<ScenePartSpec, "castShadow" | "receiveShadow">, tierShadows: boolean) {
  return { castShadow: tierShadows && part.castShadow, receiveShadow: tierShadows && part.receiveShadow };
}
```

### Step 11 — `src/components/canvas3d/InstancedPart.tsx` (new)

```tsx
"use client";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { InstancedMesh } from "three";
import type { ScenePartSpec } from "@/config/scene.config";
import type { InstanceTransform } from "@/core/world";
import { createMatteMaterial, createPartGeometry } from "./geometry";
import { applyInstanceTransforms, partShadowProps } from "./instancing";

export interface InstancedPartProps {
  readonly name: string;
  readonly part: ScenePartSpec;
  readonly transforms: readonly InstanceTransform[];
  readonly shadows: boolean; // getSceneRenderSettings(tier).shadows
  readonly onClick?: (event: ThreeEvent<MouseEvent>) => void;
}

/** One draw call for every instance of a part; owns (and disposes) one geometry and one material. */
export function InstancedPart({ name, part, transforms, shadows, onClick }: InstancedPartProps) {
  const geometry = useMemo(() => createPartGeometry(part.geometry), [part.geometry]);
  const material = useMemo(() => createMatteMaterial(part.material), [part.material]);
  const meshRef = useRef<InstancedMesh | null>(null);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!(mesh instanceof InstancedMesh)) return; // the DOM test stub renders a plain element
    applyInstanceTransforms(mesh, transforms, part);
    invalidate();
  }, [geometry, material, transforms, part, invalidate]);

  if (transforms.length === 0) return null;
  return (
    <instancedMesh
      ref={meshRef}
      name={name}
      args={[geometry, material, transforms.length]}
      {...partShadowProps(part, shadows)}
      onClick={onClick}
    />
  );
}
```
Rules: create no geometry or material per render or per instance, and do not use `useFrame`. R3F does not dispose objects passed
through `args`, so the effect above disposes them. R3F calls `InstancedMesh.dispose()` itself on unmount.

### Step 12 — `src/components/models/loyKrathong/riverLayout.ts` and `RiverEnvironment.tsx` (new)

`riverLayout.ts`:
```ts
import { LOY_KRATHONG_RIVER_ENVIRONMENT } from "@/config/events/loyKrathong.river.config";
import { resolveRiverEnvironment, type RiverEnvironmentLayout } from "@/core/world";

/** Resolved once when the lazy scene chunk loads (deterministic, no I/O). */
export const LOY_KRATHONG_RIVER_LAYOUT: RiverEnvironmentLayout = resolveRiverEnvironment(LOY_KRATHONG_RIVER_ENVIRONMENT);

/** R3F gives `instanceId` for InstancedMesh hits; anything else (or out of range) falls back to lamp 0. */
export function lampIndexFromInstanceId(instanceId: number | undefined, lampCount: number): number {
  return instanceId !== undefined && Number.isInteger(instanceId) && instanceId >= 0 && instanceId < lampCount ? instanceId : 0;
}
```

`RiverEnvironment.tsx` (`"use client"`). Import from the **file paths** `@/components/canvas3d/InstancedPart`,
`@/components/canvas3d/geometry` and `@/components/canvas3d/sceneObjectNames`, never from the `@/components/canvas3d` barrel
(that would create an import cycle).

```tsx
export interface RiverEnvironmentProps {
  readonly layout: RiverEnvironmentLayout;
  readonly shadows: boolean;
  readonly waterRef: RefObject<Mesh | null>;
  readonly onWaterSelected: () => void;
  readonly lampFocusRef: RefObject<Group | null>;
  readonly selectedLampIndex: number;
  readonly onLampSelected: (lampIndex: number) => void;
}

function useRibbonGeometry(data: RibbonGeometryData) {
  const geometry = useMemo(() => createRibbonGeometry(data), [data]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

export function RiverEnvironment(props: RiverEnvironmentProps) {
  const { layout, shadows } = props;
  const water = useRibbonGeometry(layout.water);
  const bankLeft = useRibbonGeometry(layout.banks.left);
  const bankRight = useRibbonGeometry(layout.banks.right);
  const parts = RIVER_ENVIRONMENT_PARTS;
  const focusLamp = layout.lamps[props.selectedLampIndex] ?? layout.lamps[0];
  const { pier } = layout;
  return (
    <>
      <mesh ref={props.waterRef} name={SCENE_OBJECT_NAMES.water} geometry={water}
        position={[0, layout.waterSurfaceY, 0]} receiveShadow={shadows}
        onClick={(event) => { event.stopPropagation(); props.onWaterSelected(); }}>
        <meshStandardMaterial {...TOY_MATTE_MATERIALS.water} />
      </mesh>
      <mesh name={SCENE_OBJECT_NAMES.bankLeft} geometry={bankLeft} position={[0, layout.bankTopY, 0]} receiveShadow={shadows}>
        <meshStandardMaterial {...RIVER_BANK_MATERIAL} />
      </mesh>
      {/* same for bankRight */}
      <InstancedPart name={SCENE_OBJECT_NAMES.houseBodies} part={parts.houseBody} transforms={layout.houses} shadows={shadows} />
      <InstancedPart name={SCENE_OBJECT_NAMES.houseRoofs} part={parts.houseRoof} transforms={layout.houses} shadows={shadows} />
      <InstancedPart name={SCENE_OBJECT_NAMES.treeTrunks} part={parts.treeTrunk} transforms={layout.trees} shadows={shadows} />
      <InstancedPart name={SCENE_OBJECT_NAMES.treeCanopies} part={parts.treeCanopy} transforms={layout.trees} shadows={shadows} />
      <InstancedPart name={SCENE_OBJECT_NAMES.lampPosts} part={parts.lampPost} transforms={layout.lamps} shadows={shadows} />
      <InstancedPart name={SCENE_OBJECT_NAMES.lampHeads} part={parts.lampHead} transforms={layout.lamps} shadows={shadows}
        onClick={(event) => { event.stopPropagation(); props.onLampSelected(lampIndexFromInstanceId(event.instanceId, layout.lamps.length)); }} />
      <mesh name={SCENE_OBJECT_NAMES.pierDeck} position={[pier.deckCenter.x, pier.deckCenter.y, pier.deckCenter.z]}
        rotation={[0, pier.yawRad, 0]} castShadow={shadows} receiveShadow={shadows}>
        <boxGeometry args={[pier.width, pier.thickness, pier.length]} />
        <meshStandardMaterial {...PIER_DECK_MATERIAL} />
      </mesh>
      <InstancedPart name={SCENE_OBJECT_NAMES.pierPiles} part={parts.pierPile} transforms={pier.piles} shadows={shadows} />
      {focusLamp && (
        <group ref={props.lampFocusRef} name={SCENE_OBJECT_NAMES.lampFocus}
          position={[focusLamp.position.x, focusLamp.position.y + parts.lampHead.yOffset * focusLamp.scale, focusLamp.position.z]} />
      )}
    </>
  );
}
```
The water mesh origin stays at `(0, RIVER_WATER_SURFACE_Y, 0)`, so a water fly-to targets the same point as before (MFW-17).
Declarative child geometries/materials (`boxGeometry`, `meshStandardMaterial`) are disposed by R3F on unmount.

`src/components/models/loyKrathong/index.ts`: keep the existing comment line, then
`export * from "./RiverEnvironment"; export * from "./riverLayout";`.

### Step 13 — `src/components/canvas3d/index.tsx` (modify)

1. Imports: the new config constants (Steps 1–4), `TIER_ANTIALIAS`, `MOON_SHADOW_MAP_SIZE_PX`, `KRATHONG_PLACEHOLDER`,
   `SCENE_OBJECT_NAMES`, `RiverEnvironment` and `LOY_KRATHONG_RIVER_LAYOUT` from `@/components/models/loyKrathong`.
2. Keep the exported names that tests and other code use, built from config:
   `TOY_SCENE_CAMERA = { orthographic: true, position: [...CAMERA_FLIGHT_OFFSET], zoom: SCENE_CAMERA_ZOOM, near: SCENE_CAMERA_NEAR, far: SCENE_CAMERA_FAR }`,
   `TOY_SCENE_CANVAS_CAMERA` (unchanged shape, still one module-level object), and
   `export { TOY_SCENE_LIGHTING, TOY_MATTE_MATERIALS } from "@/config/scene.config";`. Delete the local definitions.
3. `SceneRenderSettings` gains `antialias: boolean` and `shadowMapSizePx: number`. `getSceneRenderSettings(tier)` returns
   `{ dpr: [1, budget.pixelRatioCap], shadows: budget.shadows, maxTextureSize: budget.maxTextureSize, antialias: TIER_ANTIALIAS[tier], shadowMapSizePx: Math.min(MOON_SHADOW_MAP_SIZE_PX, budget.maxTextureSize) }`.
4. Add module-level `const CANVAS_GL_ANTIALIAS_ON = { antialias: true }; const CANVAS_GL_ANTIALIAS_OFF = { antialias: false };`
   (stable `gl` objects).
5. `ToyNightScene` new tree. Props: replace `onTargetSelected` usage for the lamp with `onLampSelected`, add `selectedLampIndex`
   and `shadowMapSizePx`. `lampTargetRef` becomes `RefObject<Group | null>`.
   ```tsx
   <>
     <color attach="background" args={[TOY_SCENE_LIGHTING.background]} />
     {/* World-fixed lights: NOT inside the view-transform group, so pan/rotate never changes the moon direction. */}
     <ambientLight color={…ambient.color} intensity={…ambient.intensity} />
     <directionalLight color={…moon.color} intensity={…moon.intensity} position={…moon.position}
       castShadow={shadows} shadow-mapSize={[shadowMapSizePx, shadowMapSizePx]} />
     {/* View transform seam: today's legacy pan/rotate. The pan fix (owner decision pending) replaces it with camera movement. */}
     <group name={SCENE_OBJECT_NAMES.worldView} position={[worldOffset[0], 0, worldOffset[1]]} rotation={[0, worldRotation, 0]}>
       <RiverEnvironment layout={LOY_KRATHONG_RIVER_LAYOUT} shadows={shadows} waterRef={waterTargetRef}
         onWaterSelected={() => onTargetSelected("water")} lampFocusRef={lampTargetRef}
         selectedLampIndex={selectedLampIndex} onLampSelected={onLampSelected} />
       <group ref={krathongTargetRef} name={SCENE_OBJECT_NAMES.krathong} rotation={[0, objectRotation, 0]}
         onClick={(event) => { event.stopPropagation(); onTargetSelected("krathong"); }}>
         <pointLight color={…candle.color} intensity={…candle.intensity} distance={…candle.distance} position={…candle.position} />
         {/* placeholder meshes from KRATHONG_PLACEHOLDER (or MFW-19's KrathongModel if merged) */}
       </group>
     </group>
   </>
   ```
   The old look-dev lamp sphere is deleted: the lamp heads replace it.
6. `TargetHighlight`: `<ringGeometry args={[inner, outer, HIGHLIGHT_RING_SEGMENTS]} />` and
   `<meshBasicMaterial color={HIGHLIGHT_RING_COLOR} transparent opacity={HIGHLIGHT_RING_OPACITY} toneMapped={false} />`.
7. `SceneViewport`:
   - Put every new hook next to the existing ones, **before** the early `if (!profiled || qualityTier === "FALLBACK_2D") return null;`.
   - `const [selectedLampIndex, setSelectedLampIndex] = useState(0);`
   - `const onLampSelected = useCallback((index: number) => { if (mode !== "WORLD_EXPLORE") return; setSelectedLampIndex(index); setSelectedTarget("lamp"); setFlyRequestId((r) => r + 1); }, [mode]);`
     This uses the same mode gate as `onTargetSelected`, so CUSTOMIZE and RITUAL_RELEASE taps never select (MFW-44).
   - `lampTargetRef = useRef<Group | null>(null)` (`activeTargetRef` logic unchanged).
   - Chip state: `useState<[number, number]>([RITUAL_CHIP_START_PERCENT.x, RITUAL_CHIP_START_PERCENT.y])`. In `DRAG_KRATHONG`, replace
     `100`, `8`, `92` with `PERCENT_SCALE`, `RITUAL_CHIP_MIN_PERCENT`, `RITUAL_CHIP_MAX_PERCENT` (same formula).
   - `PINCH_ZOOM`: `cameraRef.current.zoom = SCENE_CAMERA_ZOOM * zoomRef.current` (was `TOY_SCENE_CAMERA.zoom`; same value).
   - **Do not change** the `PAN_RIVER` case (signs, rotation, no bounds). Leave a one-line comment:
     `// Legacy pan/rotate kept as is: the gesture model awaits an owner decision (MFW-27 plan §11 Q1).`
   - Section: remove the Tailwind class `bg-[#101a32]` and add `style={{ backgroundColor: TOY_SCENE_LIGHTING.background }}`
     (one source for the colour; the static scan forbids hex literals here).
   - `<Canvas key={settings.antialias ? "aa-on" : "aa-off"} gl={settings.antialias ? CANVAS_GL_ANTIALIAS_ON : CANVAS_GL_ANTIALIAS_OFF} …>`.
     The key re-creates the renderer only when the antialias value flips.
   - `onCreated`: after storing `cameraRef`/`invalidateRef`, re-apply the pinch zoom to a new camera:
     `if (cameraRef.current) { cameraRef.current.zoom = SCENE_CAMERA_ZOOM * zoomRef.current; cameraRef.current.updateProjectionMatrix(); }`.
   - Pass `shadowMapSizePx={settings.shadowMapSizePx}`, `selectedLampIndex`, `onLampSelected` to `ToyNightScene`.
   - Leave the rest unchanged: pointer handlers, the chip (`role="img"`, `aria-label="กระทง ลากลงน้ำ"`, `data-input-target="krathong"`),
     `aria-label="Toy-like night river preview"`, the `data-*` attributes, `frameloop="demand"`, `CameraFlightController`.

### Step 14 — Tests (see §7) and verify (§9)

## 7. Tests

All vitest tests run without a database or WebGL. Component tests render R3F intrinsics as unknown DOM elements, with
`@react-three/fiber` mocked like in `src/components/canvas3d/index.test.tsx`.

**`src/core/math/relativeLuminance.test.ts`**
- `#000000` → 0; `#ffffff` → 1 (`toBeCloseTo(1, 10)`); `#ff0000` → `toBeCloseTo(0.2126, 10)`; `#536e74` → `toBeCloseTo(0.1425, 3)`.
- `"#fff"`, `"red"`, `"#gggggg"` → throws `RangeError`.

**`src/core/world/riverEnvironment.test.ts`**. Fixture: straight channel `{ controlPoints: [(0,0,0), (10,0,0), (20,0,0)], width: 4 }`
(right = +z, flow = +x). Compare yaw through `Math.sin`/`Math.cos`, never raw (`atan2(-0, -1)` is −π).
- `createRiverChannel`: a point with `y: 1` → `RangeError`; `width: 0` → `RangeError`; valid → `closed === false`, `laneId === RIVER_CHANNEL_CURVE_ID`.
- `riverFrameAt(ch, 0.5)`: centerline ≈ (10, 0, 0), right ≈ (0, 0, 1), flow ≈ {x: 1, z: 0}; progress `1.5` / `NaN` → `RangeError`.
- `resolveBankPlacement(ch, {progress 0.5, side 1, setback 1, scale 2, yawOffsetRad 0}, -0.14)` → position ≈ (10, −0.14, 3),
  (sin, cos)(yaw) ≈ (0, −1), scale 2. With side −1 → position ≈ (10, −0.14, −3), (sin, cos) ≈ (0, 1). With yawOffsetRad π/2 and side 1
  → (sin, cos) ≈ (−1, 0). Invalid `progress 1.5`, `side 0`, `setback −1`, `scale 0` → `RangeError` each.
- `buildRibbonGeometryData(ch, −1, 1, 4)`: `vertexCount` 10, `positions.length` 30, `indices.length` 24; v0 ≈ (0,0,−1),
  v1 ≈ (0,0,1), v2 ≈ (5,0,−1), v9 ≈ (20,0,1); first six indices `[0,1,2,1,3,2]`; **every** triangle's normal (cross(b−a, c−a)) has y > 0.
  `from 1, to 1` / `from 2, to 1` / `segments 0` / `segments 1.5` → `RangeError`.
- `resolvePierLayout(ch, {progress 0.5, side 1, onBankLength 1, overWaterLength 0.5, width 0.6, deckThickness 0.1, deckTopY 0.2,
  pileBottomY −0.5, releaseInset 0.3, pileAlongFractions [0.5, 1]}, −0.24)` → deckCenter ≈ (10, 0.15, 2.25); length 1.5; tip ≈ (10, 0.2, 1.5);
  releasePoint ≈ (10, −0.24, 1.2); (sin, cos)(yaw) ≈ (0, −1); pileHeight ≈ 0.6; piles (in order) ≈ (9.7, −0.2, 1.75), (10.3, −0.2, 1.75),
  (9.7, −0.2, 1.5), (10.3, −0.2, 1.5). With `overWaterLength 1.8` (1.8 + 0.3 > 2) → `RangeError`; `pileBottomY 0.15` → `RangeError`.
- `resolveRiverEnvironment` (straight channel, bankWidth 3, waterUnderlap 0.2, ribbonSegments 4, one house/tree/lamp, the pier above):
  counts 1/1/1, 4 piles; water v0 ≈ (0,0,−2.2); bounds ≈ {minX 0, maxX 20, minZ −5, maxZ 5}; a house with `setback 3` → `RangeError`;
  `waterUnderlap 3` → `RangeError`; `bankWidth 0` → `RangeError`.

**`src/components/canvas3d/geometry.test.ts`**
- `createPartGeometry` per kind returns `BoxGeometry` / `ConeGeometry` / `CylinderGeometry` / `IcosahedronGeometry`, and
  `countTriangles` gives box 12, cone(4) 8, cylinder(5) 20, icosahedron 20.
- `createMatteMaterial(matte spec)`: `MeshStandardMaterial`, roughness 1, metalness 0, flatShading true; with emissive `#5c4c27` / 0.2
  → `material.emissive.getHexString() === "5c4c27"` and `emissiveIntensity === 0.2`.
- `createRibbonGeometry(buildRibbonGeometryData(straight, −1, 1, 4))`: position count 10, every normal (0,1,0), index count 24.

**`src/components/canvas3d/InstancedPart.test.tsx`** (mock `@react-three/fiber`: `useThree: (s) => s({ invalidate: () => {} })`)
- `composeInstanceMatrix({position (1,2,3), yawRad π/2, scale 2}, {yOffset 0.5, yawOffsetRad 0}, new Matrix4())`: decompose →
  position ≈ (1, 3, 3), scale ≈ (2,2,2); `new Vector3(0,0,1).applyMatrix4(m)` ≈ (3, 3, 3).
- `applyInstanceTransforms` on a real `new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial(), 2)` (three works without
  WebGL): `getMatrixAt(1)` equals `composeInstanceMatrix(t1, …)`, `instanceMatrix.version > 0`, `boundingSphere !== null`.
- `partShadowProps({castShadow true, receiveShadow true}, false)` → both false; with `true` → the part flags.
- Rendering `<InstancedPart name="x" part={…} transforms={[t0, t1]} shadows={false} />` gives exactly one `instancedMesh[name="x"]`.
  With `transforms={[]}` it renders nothing.
- Dispose: spy `BufferGeometry.prototype.dispose` and `Material.prototype.dispose`. `rerender` with the same props → 0 calls;
  rerender with `shadows` toggled → 0 calls; `unmount()` → geometry 1 call, material 1 call.

**`src/components/models/loyKrathong/riverLayout.test.ts`** (node-safe; uses three math only). Helpers in the test:
`footprintRadius(geometry)` = box `hypot(width, depth)/2`, cone `radius`, cylinder `max(radiusTop, radiusBottom)`, icosahedron
`radius`. `topY(part)` = `part.yOffset + height/2` (icosahedron: `+ radius`). Default camera:
`new OrthographicCamera(−w/2, w/2, h/2, −h/2, SCENE_CAMERA_NEAR, SCENE_CAMERA_FAR)`, `zoom = SCENE_CAMERA_ZOOM × factor`,
`position = CAMERA_FLIGHT_OFFSET`, `lookAt(0,0,0)`, `updateProjectionMatrix()`, `updateMatrixWorld()`. This matches R3F's default
orthographic camera, which looks at the origin.
- "has houses, trees, lamps and a pier": `LOY_KRATHONG_RIVER_LAYOUT.houses/trees/lamps.length ≥ 1`; `pier.piles.length ===
  2 × pileAlongFractions.length`; `RIVER_ENVIRONMENT_PARTS.pierPile.geometry.height ≈ pier.pileHeight` (config/layout consistency).
- "lanes stay inside the channel": for each lane in `LOY_KRATHONG_RIVER_LANES` (via `createRiverLane`), at 64 progress samples take
  both lane edges (`centerline ± right × width/2`, from `splineProgressToWorld`). `locateOnLane(layout.channel, edge).lateralOffset`
  must have `|lat| ≤ 0.5 + 1e-9`.
- "pier stops before the lanes": for every lane, `|locateOnLane(lane, pier.tip).lateralOffset| × lane.width ≥ lane.width/2`.
  "release point is on a lane": some lane gives `|lat| ≤ 0.5` and `0 < progress < 1`.
- "props stay on the banks": for every house/tree/lamp instance, `|locateOnLane(channel, position).lateralOffset| × channel.width ≥
  channel.width/2 + footprintRadius × scale`. Use the house body for houses, the canopy for trees and the post for lamps.
- "solid props never hide a lane in the default view": `f = normalize(−CAMERA_FLIGHT_OFFSET)`. For each house (top = body+roof) and
  tree (top = canopy), take `T = base + (0, topY × scale, 0)`, step `t = (T.y − waterSurfaceY) / (−f.y)` and `hit = T + f·t`. For
  every lane, `|locateOnLane(lane, hit).lateralOffset| × lane.width − lane.width/2 ≥ footprintRadius × scale`.
- "default mobile view shows each prop kind": camera 320 × 256, factor 1. At least one house body centre, one tree canopy centre,
  one lamp head centre and `pier.tip` project to NDC with |x| ≤ 1 and |y| ≤ 1.
- "visible props are inside the near/far planes": for viewports 320 × 256 and 704 × 256 and zoom factors `1` and `PINCH_ZOOM_MIN`,
  check every instance base and top, and the pier tip, deck centre and release point. If a point is inside |x|,|y| ≤ 1, then its
  NDC z is in [−1, 1].
- "every part is low-poly": for each `RIVER_ENVIRONMENT_PARTS` entry, `countTriangles(createPartGeometry(geometry)) ≤ ENVIRONMENT_PART_MAX_TRIANGLES`.
- "environment palette is darker than the krathong": the reference is the minimum `relativeLuminance` over
  `LOY_KRATHONG_PROMINENCE_REFERENCE_COLORS`. Every part material colour, `RIVER_BANK_MATERIAL.color`, `PIER_DECK_MATERIAL.color` and
  `TOY_MATTE_MATERIALS.water.color` must be `<` the reference. For a material with an emissive, `relativeLuminance(emissive) ×
  emissiveIntensity` must also be `<` the reference.
- "materials are matte": every part material, the bank and the deck have roughness 1, metalness 0.

**`src/components/models/loyKrathong/RiverEnvironment.test.tsx`**. Mock `@react-three/fiber` with
`useThree: (s) => s({ invalidate: () => {} })` and `useFrame: useFrameSpy` (`vi.hoisted(() => vi.fn())`). Render `<RiverEnvironment …/>`
directly with `LOY_KRATHONG_RIVER_LAYOUT`, `shadows={false}`, refs from `createRef()` and `vi.fn()` callbacks.
- "renders every environment part once": exactly one element for each `SCENE_OBJECT_NAMES` entry of water, bankLeft, bankRight,
  houseBodies, houseRoofs, treeTrunks, treeCanopies, lampPosts, lampHeads, pierDeck, pierPiles, lampFocus; `instancedMesh` count = 7.
- "is static": `useFrameSpy` was never called.
- "renders the same tree with reduced motion on": the environment does not read `reducedMotion`, so the element count is the same before
  and after `useDeviceStore.getState().setReducedMotion(true)`. This documents that there is no motion to reduce.
- Clicks: `fireEvent.click` on `[name="scene-water"]` → `onWaterSelected` once; on `[name="scene-lamp-heads"]` → `onLampSelected(0)`.
- `lampIndexFromInstanceId`: `(2, 6)` → 2; `(undefined, 6)` → 0; `(6, 6)` → 0; `(-1, 6)` → 0; `(1.5, 6)` → 0.
- Lamp focus: rerender with `selectedLampIndex={2}` → `[name="scene-lamp-focus"]`'s `position` attribute equals
  `[l2.x, l2.y + lampHead.yOffset × l2.scale, l2.z].join(",")`. With `selectedLampIndex={99}` it falls back to lamp 0.
- Dispose: spy `BufferGeometry.prototype.dispose` and `Material.prototype.dispose`. A rerender with the same props, then with
  `shadows={true}` → 0 calls. `unmount()` → geometry calls `=== 3 + 7` (3 ribbons + 7 instanced parts) and material calls `=== 7`.

**`src/components/canvas3d/index.test.tsx`** (modify)
- Stub `Canvas`: accept `gl?: { antialias?: boolean }` and render `"data-antialias": String(props.gl?.antialias)` on the div.
- Selectors: `waterMesh = c => c.querySelector('[name="scene-water"]')!`, `lampMesh = c => c.querySelector('[name="scene-lamp-heads"]')!`,
  `krathongMesh = c => c.querySelector('[name="scene-krathong"]')!`. All existing cases keep their assertions.
- `getSceneRenderSettings` case: expected object adds `antialias: TIER_ANTIALIAS[tier]` and
  `shadowMapSizePx: Math.min(MOON_SHADOW_MAP_SIZE_PX, TIER_BUDGETS[tier].maxTextureSize)`. Also assert `shadowMapSizePx ≤ maxTextureSize` for all tiers.
- "antialias follows the tier": `setQualityTier("MEDIUM")`, render CUSTOMIZE → `data-antialias="true"`. Pinch to 1.5 (same pointer
  sequence as the existing pinch test) and remember `r3f.camera`. `act(() => setQualityTier("LOW"))` → `data-antialias="false"`,
  `r3f.camera` is a **different** object, and `r3f.camera.zoom === TOY_SCENE_CAMERA.zoom * 1.5` (zoom survives the re-creation).
  `act(() => setQualityTier("MEDIUM"))` is not needed (tiers never step up).
- "lights are not inside the world-view group": `[name="scene-world-view"] ambientLight` and `[name="scene-world-view"] directionalLight`
  are null; `ambientLight` and `directionalLight` exist; `[name="scene-krathong"] pointLight` exists.
- "the candle is the only point light": `querySelectorAll("pointLight, spotLight").length === 1`.
- "section background comes from config": `viewport()` has `style.backgroundColor` equal to the rgb of `TOY_SCENE_LIGHTING.background`
  (`rgb(16, 26, 50)`) and no class containing `bg-[`.
- Lamp selection in WORLD_EXPLORE (in the existing "only WORLD_EXPLORE taps…" case) still gives `data-selected-target="lamp"`, a ring and
  a flight. CUSTOMIZE/RITUAL_RELEASE lamp taps still select nothing (existing case, new selector).

**`src/config/performance.config.test.ts`** (modify): add "antialias per tier (lead decision, MFW-27)":
`TIER_ANTIALIAS` equals `{ HIGH: true, MEDIUM: true, LOW: false }` and is frozen. Do not touch the owner-number cases.

**`tests/unit/scene-art-constants.test.ts`** (new, `// @vitest-environment node`). Walk `src/components/canvas3d` and
`src/components/models` for `.ts`/`.tsx` files not ending in `.test.ts(x)`. Offenders: any match of `/#[0-9a-fA-F]{3,8}\b/` (hex
colour), `/(?<![\w.$])\d+\.\d+/` (decimal literal) or `/TextureLoader|useTexture|CanvasTexture|DataTexture|VideoTexture/`. Expect
the offender list to be empty, and print the file names. Add a positive control proving that each regex matches a sample string.
Comments count too: in these files write card ids as `MFW-27`, never section numbers like `6.1`, or the decimal regex fires.

**`tests/e2e/river-environment.spec.ts`** (new). `test.use({ hasTouch: true })`. For tiers `HIGH` (init script: `deviceMemory 8`,
`hardwareConcurrency 8`) and `LOW` (`deviceMemory 2`, `hardwareConcurrency 2`):
- collect `page.on("pageerror")` and `page.on("console")` messages of type `"error"`;
- `goto("/")`, expect `[data-flow-state]` to have `data-quality-tier` = the tier;
- click `Loy Krathong` → `canvas` count 1; click `ถัดไป` twice → `RITUAL_RELEASE`, canvas count 1; click `ปล่อยกระทง` →
  `SHARED_WORLD_EXPLORE`, canvas count 1; wait two animation frames (same helper as `scene-gating.spec.ts`);
- expect both error lists to be empty.

`tests/e2e/scene-gating.spec.ts` is unchanged and must stay green. Its WORLD_EXPLORE tap 40 px left of the centre must still hit the
krathong/water, which holds because the krathong stays at the origin and the water ribbon covers it.

## 8. Do NOT (Out of scope and traps)

- Do not build: ripples, lamp glow/flicker/bounce, the InspectPopup (MFW-28), lane movement or bobbing (MFW-24), the pier ritual
  camera, the krathong preview or the release animation (MFW-23), zones (MFW-25), the krathong model (MFW-19), the 2D environment
  (MFW-33), the memory audit (MFW-34), or any Christmas or other-festival scene.
- **Do not change the pan/rotate behaviour** (`PAN_RIVER` case, `PAN_WORLD_UNITS_PER_PIXEL`, `ROTATION_RADIANS_PER_PIXEL`,
  `createInputSeparator`). It waits for the owner (§11 Q1).
- Do not change `TIER_BUDGETS`, `CAMERA_FLIGHT_OFFSET`, `HIGHLIGHT_RING_SIZES`, the gesture thresholds, the flow state machine or `FlowRoot`.
- No textures, no `useFrame`, no `pointLight`/`spotLight` for lamps or windows, no per-instance `<mesh>` for repeated parts, and no
  geometry/material created in render or per frame.
- Do not import `@/components/canvas3d` (the barrel) from `src/components/models/**` (import cycle). Import scene code only through the
  lazy chunk: nothing outside `src/components/canvas3d`, `src/components/models` and their tests may import `RiverEnvironment` /
  `LOY_KRATHONG_RIVER_LAYOUT` (keeps three out of the landing JS, MFW-44).
- Never persist or send any world position: `InstanceTransform`, `PierLayout.releasePoint` etc. are render-time values (invariant A).
  MFW-23 must turn the release point into a `SplinePathCoord` via `locateOnLane` + `splineCoordFromLocation`.
- No new dependency (no drei). Do not edit `package.json`, the lockfile, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.mts`,
  `playwright.config.ts`.
- Do not touch `.claude/**`, `scripts/**`, `.github/**`, `CLAUDE.md`, `AGENTS.md`, `docs/spec/**`, `docs/backlog*.json`, `docs/plans/**`,
  `src/core/coordinates/**` (use it, don't change it).
- Do not weaken, skip or delete existing tests. The only allowed changes to existing tests are the selector/stub changes listed in §7.
- Next.js: this card uses no Next.js API. If you find you need one, read `node_modules/next/dist/docs/` first.

## 9. Definition of done

- Each run separately and green: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm e2e`. In this cloud container run
  e2e as `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell pnpm e2e`.
- Every check in §3 has its test. Delete `playwright-report/` and `test-results/` before committing; never commit `.next/` or `*.tsbuildinfo`.
- Branch `feat/MFW-27-low-poly-night-river-environment` from the latest `main`. Use conventional commits with the key, e.g.
  `feat(core): low-poly night river environment MFW-27` (format: CLAUDE.md, `docs/prompts/README.md`).
- Ready PR against `main` with the same title. The body (English) has: a summary + link to MFW-27; the AC checklist with the proving
  file/test; "Decisions" (every PLACEHOLDER constant with its value, plus §12); "Open questions" (§11); the test plan (five commands
  and results); follow-ups (pan fix; MFW-19/24 coordination).
- Leave the PR open for review (reviewer + qa + `r3f-perf-reviewer`). This is not an owner-merge card.

## 10. Interfaces this card provides

| Export | Path | For |
|---|---|---|
| `LOY_KRATHONG_RIVER_LANES: readonly RiverLaneDefinition[]` (placeholder), `LOY_KRATHONG_RIVER_CHANNEL` | `src/config/events/loyKrathong.river.config.ts` | MFW-24 owns the lane values; the containment test guards them |
| `LOY_KRATHONG_RIVER_LAYOUT: RiverEnvironmentLayout` (`.pier.tip`, `.pier.releasePoint`, `.pier.yawRad`, `.pier.deckCenter`, `.lamps`, `.bounds`, `.channel`, `.waterSurfaceY`) | `src/components/models/loyKrathong/riverLayout.ts` | MFW-23 (preview on `tip`, release at `releasePoint` → `locateOnLane`), MFW-28 (lamps), pan follow-up (`bounds` clamp) |
| `resolveRiverEnvironment`, `resolveBankPlacement`, `resolvePierLayout`, `buildRibbonGeometryData`, `riverFrameAt`, `facingWaterYaw`, `createRiverChannel`, `ribbonBoundsXZ`, `mergeBoundsXZ` + types `RiverEnvironmentDefinition`, `RiverEnvironmentLayout`, `BankPlacement`, `BankSide`, `InstanceTransform`, `PierDefinition`, `PierLayout`, `RibbonGeometryData`, `WorldBoundsXZ`, `RiverFrame` | `src/core/world` | MFW-33 (draw banks/props top-down with `worldToCanvas`), later festivals |
| `RiverEnvironment` (props in Step 12), `lampIndexFromInstanceId(instanceId, lampCount)` | `src/components/models/loyKrathong` | MFW-28 (lamp tap → index; water tap) |
| `InstancedPart`, `createPartGeometry`, `createMatteMaterial`, `createRibbonGeometry`, `countTriangles`, `composeInstanceMatrix`, `applyInstanceTransforms`, `partShadowProps` | `src/components/canvas3d/*` | MFW-34 (instancing audit), MFW-19/later props |
| `SCENE_OBJECT_NAMES` | `src/components/canvas3d/sceneObjectNames.ts` | tests and debugging for all scene cards |
| `getSceneRenderSettings(tier)` → `{ dpr, shadows, maxTextureSize, antialias, shadowMapSizePx }` | `src/components/canvas3d/index.tsx` | all 3D cards |
| `TIER_ANTIALIAS` | `src/config/performance.config.ts` | renderer setup |
| `TOY_SCENE_LIGHTING`, `TOY_MATTE_MATERIALS`, `ScenePartSpec`, `PartGeometrySpec`, `MatteMaterialSpec`, `ENVIRONMENT_PART_MAX_TRIANGLES`, `MOON_SHADOW_MAP_SIZE_PX` | `src/config/scene.config.ts` | all 3D cards |
| `LOY_KRATHONG_PROMINENCE_REFERENCE_COLORS`, `relativeLuminance(hex)` | config / `src/core/math/relativeLuminance.ts` | MFW-19 swaps in its palette; the prominence test keeps running |
| `scene-world-view` group | `ToyNightScene` | Pan follow-up: remove its transform and move the camera instead. Lights are already world-fixed |

## 11. Open questions (owner)

1. **WORLD_EXPLORE pan/rotate gesture model (blocks only the pan fix, not this card).** Today a drag pans with inverted signs along
   world x/z instead of camera right/up, a horizontal drag also rotates, and there are no bounds or reset. Options:
   (a) *proposal:* one finger rotates the view, two fingers pan along camera right/up, clamped to the environment bounds, with a reset
   button; (b) one finger pans along camera right/up (clamped), two-finger twist rotates, plus a reset; (c) pan only (no rotation),
   clamped, plus a reset. The owner also decides whether the reset is a button or a double-tap, and its label. This card ships with the legacy
   behaviour unchanged and provides `layout.bounds` and the world-view group seam so the fix is a local change.
2. **Art placeholders (non-blocking).** The spec gives no layout, sizes, counts or colours for the environment. This card ships the
   PLACEHOLDER values in `src/config/events/loyKrathong.river.config.ts` and `MOON_SHADOW_MAP_SIZE_PX`. Options: accept them for the
   private test, or have the owner (or an artist) tune them in config later. The tests keep any tuning honest: lanes inside the channel,
   props off the water and not hiding lanes, a palette darker than the krathong, and low-poly parts.

## 12. Decisions (lead, technical)

- **D1 — Props are placed parametrically along a river channel** (`progress`, `side`, `setback`), not by raw world xz. MFW-24 can move
  the river and the props follow it. It reuses the MFW-8 spline code, so no second curve system is needed.
- **D2 — The channel is separate from the lanes.** The visible water is a channel; lanes (MFW-24) must lie inside it (tested). This
  card owns the channel, and MFW-24 owns the lanes. A one-lane placeholder lets this card ship first.
- **D3 — Every repeated part is one `InstancedMesh`** (invariant E), including lamp heads, which stay tappable through `instanceId`.
  The lamp fly-to uses an anchor group placed at the selected lamp head, so the existing `CameraFlightController` works unchanged.
- **D4 — Geometry/material are created imperatively once per part and disposed in an effect.** Ribbons get the same treatment. This
  makes disposal explicit and testable with spies. Single declarative objects (pier deck, ribbon materials) are left to R3F's own dispose.
- **D5 — Krathong prominence is enforced by rules, not by eye.** The environment palette is darker than the krathong (WCAG luminance),
  materials are matte, lamps add no light (the candle is the only point light), there is no environment animation, solid props stay off
  the lanes, and no near-bank prop hides a lane in the default view.
- **D6 — Flat shading on environment parts**, for the low-poly look the card title asks for. The krathong keeps the 3.1 smooth matte look.
- **D7 — `TIER_ANTIALIAS = { HIGH: true, MEDIUM: true, LOW: false }` and the canvas is re-created when the value flips.** `antialias` is
  creation-only in WebGL, and the flip happens at most once per session (tiers never step up). LOW is the struggling tier, so it drops
  MSAA. The pinch zoom is re-applied on re-creation.
- **D8 — `maxTextureSize` is applied to the moon shadow map** (`min(MOON_SHADOW_MAP_SIZE_PX, maxTextureSize)`). The scene has no other
  textures (enforced by a static test).
- **D9 — Lights are world-fixed.** Ambient + moon move to the scene root and the candle becomes a child of the krathong group.
  Panning never changes the moon direction: before this change, the light moved with the group while its target stayed at the world
  origin. This matches the camera-based pan the owner is likely to choose.
- **D10 — `ENVIRONMENT_PART_MAX_TRIANGLES = 32`** is a regression guard for "low detail". It is not a product limit (current parts use 8–20).
- **D11 — New Loy Krathong scene data goes in `src/config/events/loyKrathong.river.config.ts`** rather than in `loyKrathong.config.ts`.
  It keeps the event-selector config (and MFW-19's server-safe catalogue there) small and free of scene data.

## 13. Risks

- **Merge order with MFW-19 / MFW-24.** Both touch the same files (`canvas3d/index.tsx`, Loy Krathong config). §2 gives both orders.
  The reviewer should check that the prominence reference colours are the real krathong palette once MFW-19 is in.
- **SwiftShader e2e and FPS fallback.** HIGH draws shadows for a larger scene. If the FPS meter dropped the tier to FALLBACK_2D
  mid-test, the canvas would vanish. `frameloop="demand"` keeps GPU work near zero between interactions, so this is unlikely. If it
  happens, report it; do not raise thresholds.
- **Console-error e2e flakiness.** Chromium GPU messages are warnings, not errors, so they should not trip the check. If a third-party
  error appears, list it in the PR rather than filtering blindly.
- **Panning reveals the diorama edge** (banks end at `bankWidth`, the river ends at x = ±12) because pan has no bounds yet. This is
  fixed by the pan follow-up using `layout.bounds`.
- **Shadow-map toggling on a tier step-down** relies on R3F's existing `shadows` handling (unchanged since MFW-15).
