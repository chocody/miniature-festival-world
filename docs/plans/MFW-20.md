# MFW-20 [4.2] Mobile-first customizer UI (CustomizerPanel) — implementation spec

> Hand-off spec for one card. This file is the source of truth for the implementer and the reviewer. If it
> disagrees with `docs/backlog.json` or `docs/spec/open-questions.md`, those files win; say so in the PR.
> Branch: `feat/MFW-20-mobile-first-customizer-ui-customizerpan` · Jira: MFW-20 · Epic: MFW-18 (Loop 4)
> Labels: `loy-krathong`, `ui` · Not a privacy/db card. Extra reviewer: **`r3f-perf-reviewer`** (the diff touches
> `src/components/canvas3d/**`).

## Summary

This card adds the Loy Krathong customizer UI. A bar fixed to the bottom of the screen has four tabs (base, banana
leaves, flowers, candle). Each tab shows part and colour buttons from the MFW-19 catalogue. The same bar has four
view buttons (rotate left / right, zoom in / out) and the existing "ถัดไป" button. The view buttons go through the
same rotation and zoom code that the drag and pinch gestures already use in `SceneViewport`. Every choice runs through
the MFW-19 builder ops and the strict appearance parser, so `useBuilderStore` never holds an appearance that the
create API would reject. When the appearance changes, the 3D krathong plays a short scale bounce with
`@react-spring/three` (owner decision 11). Under `prefers-reduced-motion` there is no bounce. The bar works at 360 px
width, and a Playwright test at a 360 × 640 viewport proves it on a 3D tier and on FALLBACK_2D.

## Prerequisites

**Order: implement this card only after MFW-27 is merged.** MFW-27 is in progress and also edits
`src/components/canvas3d/index.tsx`. Cut the branch from `main` once MFW-27 is on it. If MFW-27 is not merged when you
start, stop and say so.

| Card | State | What this card uses |
|---|---|---|
| MFW-7 [1.1] | merged | `FlowRoot` (`src/components/ui/FlowRoot.tsx`), `useUIStore` (`flowState`, `selectedEventId`, `dispatch`), `FlowStepPlaceholder`, flow event `{ type: "FINISH_CUSTOMIZE" }` |
| MFW-9 [1.3] | merged | `useDeviceStore` (`profiled`, `qualityTier`, `reducedMotion`; reduced motion is kept live from `matchMedia` by `startDeviceProfiler`) |
| MFW-15/16/17/44 [3.1–3.4] | merged | `SceneViewport` and its `objectRotation` state, `zoomRef`/`cameraRef`/`invalidateRef` refs and the `ROTATE_KRATHONG` / `PINCH_ZOOM` cases of `onAction`; `src/core/interaction` (`getPinchZoomFactor`, `InteractionMode`); `src/config/interaction.config.ts` (`ROTATION_RADIANS_PER_PIXEL`, `PINCH_ZOOM_MIN` 0.75, `PINCH_ZOOM_MAX` 1.6) |
| MFW-19 [4.1] | **merged** (d2337fb, PR #17) | the verified names below |
| MFW-11 [2.1] | **merged** (2ade761, PR #16) | `FlowRoot` renders `{flowState === "WRITE_WISH" && <OwnershipNotice />}`, and `FlowRoot.test.tsx` has "shows the ownership notice only in WRITE_WISH" |
| MFW-27 [6.1] | **in progress** (plan: `docs/plans/MFW-27.md`) | see ASSUMED INTERFACE (from MFW-27 plan) below |

**Verified on `origin/main` (2ade761) — MFW-19 interface.** These are the real names. Use them as written.

- `src/config/events/loyKrathong.config.ts`:
  - `KRATHONG_BASE_IDS = ["banana_trunk_01", "lotus_petal_01", "toy_bread_01"]`;
  - `LEAF_FOLD_STYLE_IDS = ["style_01", "style_02"]`;
  - `LEAF_COLOR_PALETTE = ["#5E8C3A", "#8DB255", "#3F6B4A"]`;
  - `FLOWER_KINDS = ["marigold", "orchid", "lotus"]`;
  - `CANDLE_COLOR_PALETTE = ["#FFD166", "#FFF1D6", "#FF9F6B"]`;
  - `CENTER_SOCKET_ID = "center_socket"`, `RIM_SOCKET_ID_PREFIX = "rim_socket_"`, `RIM_SOCKET_COUNT = 8`,
    `DEFAULT_KRATHONG_CHOICES`;
  - the types `KrathongBaseId`, `LeafFoldStyleId`, `LeafColor`, `FlowerKind`, `CandleColor`.
- `src/config/krathongModel.config.ts` (pure data, no three):
  - `KRATHONG_BASE_MODELS: Readonly<Record<KrathongBaseId, BaseModelSpec>>` (`BaseModelSpec.color: string`);
  - `KRATHONG_FLOWER_MODELS: Readonly<Record<FlowerKind, ColoredPartModelSpec>>` (`.color: string`).
- `@/core/customization` (barrel `src/core/customization/index.ts` re-exports `types`, `sockets`, `krathongAppearance`,
  `krathongBuilder`, `krathongAssetKeys`, `krathongAssembler`, `appearanceRegistry`; `uprightConstraint` is by path only):
  - types:
    - `KrathongAppearance { readonly base; readonly lotusFold; readonly leafColor; readonly flowers: readonly (FlowerKind | null)[]; readonly candleColor }`;
    - `EventAppearance = KrathongAppearance`;
    - ``RimSocketId = `${typeof RIM_SOCKET_ID_PREFIX}${number}` ``;
    - `KrathongSocketDef` (`id`, `kind: "center" | "rim"`, `rimIndex: number | null`, …);
    - `SocketRuleViolation = "UNKNOWN_SOCKET" | "PART_NOT_ALLOWED_IN_SOCKET" | "SOCKET_OCCUPIED" | "CANDLE_REQUIRED"`;
    - `AppearanceParseResult<T> = { ok: true; appearance: T } | { ok: false; reason: string }`.
  - `src/core/customization/krathongBuilder.ts`:
    `type SocketPlacement = { part: "flower"; kind: FlowerKind; socketId: string } | { part: "candleAndIncense"; socketId: string }`,
    `type BuilderResult = { ok: true; appearance: KrathongAppearance } | { ok: false; violation: SocketRuleViolation; socketId: string }`,
    `placeInSocket(appearance: KrathongAppearance, placement: SocketPlacement): BuilderResult` and
    `clearSocket(appearance: KrathongAppearance, socketId: string): BuilderResult`.
    - Neither mutates its input; both return canonicalized results.
    - `clearSocket` returns `UNKNOWN_SOCKET` with `socketId: String(socketId)` for an unknown id, and `CANDLE_REQUIRED` at
      `"center_socket"` for the center socket.
    - `placeInSocket` returns `PART_NOT_ALLOWED_IN_SOCKET` / `UNKNOWN_SOCKET` from `validateSocketPlacement`.
  - `src/core/customization/krathongAppearance.ts`:
    - `DEFAULT_KRATHONG_APPEARANCE` is frozen: base `banana_trunk_01`, fold `style_01`, leaf `#5E8C3A`, flowers
      8 × `"marigold"`, candle `#FFD166`.
    - `canonicalizeKrathongAppearance(a)`: key order `base, lotusFold, leafColor, flowers, candleColor`, trailing nulls
      trimmed, no validation.
    - `parseKrathongAppearance(input: unknown)`: strict, a fresh canonical copy, colours uppercased, never throws.
      Reason strings used by this card's tests: `"base is not a known krathong base"`.
    - `serializeKrathongAppearance(a)`.
  - `src/core/customization/sockets.ts`: `KRATHONG_SOCKETS` (`[center_socket, rim_socket_0 … rim_socket_7]`),
    `getKrathongSocket(id: unknown): KrathongSocketDef | undefined`, `rimSocketId(index)` (throws `RangeError`).
- `src/store/useBuilderStore.ts`: `BuilderState { appearance: EventAppearance | null }`, created with
  `create<BuilderState>()(() => ({ appearance: null }))`. It has no actions and only `import type` from `@/core/customization`.
- `src/components/models/loyKrathong` (barrel): `KrathongModel` (root `<group name="krathong-model">`, the candle in
  `UprightAnchor name="center_socket"`), `KrathongAssetsProvider`, `useKrathongAssets`, `UprightAnchor`, `createKrathongAssets`.
- `src/components/canvas3d/index.tsx` on main:
  - `<KrathongAssetsProvider>` wraps everything inside `<Canvas>`.
  - `ToyNightSceneProps` has `appearance: KrathongAppearance`.
  - The krathong target `<group ref={krathongTargetRef} rotation={[0, objectRotation, 0]} onClick=…>` contains only
    `<KrathongModel appearance={appearance} shadows={shadows} />`.
  - `SceneViewport` computes `builderAppearance = useBuilderStore((state) => state.appearance)` and
    `appearance = builderAppearance ?? DEFAULT_KRATHONG_APPEARANCE`.
- `src/components/canvas3d/index.test.tsx` on main:
  - imports `act`;
  - resets `useBuilderStore` in `beforeEach`;
  - its `@react-three/fiber` mock provides `Canvas`, `useFrame`, `useThree`, `addEffect`, `applyProps` and `invalidate`;
  - selectors `waterMesh` = `mesh[name="scene-water"]` and `krathongMesh` = `[name="krathong-model"] mesh[name="base"]`;
  - has the case "renders the builder appearance, default when null".
- `src/core/customization/purity.test.ts` on main:
  - builds `files` from ``["types", "sockets", …, "index"].map((name) => `src/core/customization/${name}.ts`)`` plus the
    two config files;
  - asserts no match of `/from\s+["'](three|@react-three\/[^"']+|react)["']/`;
  - has the case "keeps the three.js helper out of the barrel".
- `src/store/stores.test.ts` on main still has `expect(useBuilderStore.getState()).toEqual({ appearance: null });`.

**ASSUMED INTERFACE (from MFW-27 plan, `docs/plans/MFW-27.md` Steps 1, 2, 8, 13 and §7).** Check each item on the
merged `main` before you start. If one differs, follow the merged code and list the difference in the PR body.

- `src/config/camera.config.ts` exports `SCENE_CAMERA_ZOOM` (52). `src/components/canvas3d/index.tsx` still exports
  `TOY_SCENE_CAMERA` (with `zoom: SCENE_CAMERA_ZOOM`) and the single module-level `TOY_SCENE_CANVAS_CAMERA`.
- `src/components/canvas3d/sceneObjectNames.ts` exports `SCENE_OBJECT_NAMES` with `krathong: "scene-krathong"`,
  `water: "scene-water"` and `worldView: "scene-world-view"`.
- `ToyNightScene` structure:
  - lights are world-fixed, outside the `SCENE_OBJECT_NAMES.worldView` group;
  - `<RiverEnvironment …>` sits inside that group;
  - the krathong target is `<group ref={krathongTargetRef} name={SCENE_OBJECT_NAMES.krathong} rotation={[0, objectRotation, 0]} onClick=…>`.
    Its children are the candle `<pointLight …>` and `<KrathongModel appearance={appearance} shadows={shadows} />`.
- `SceneViewport`:
  - `onAction`'s `PINCH_ZOOM` case sets `cameraRef.current.zoom = SCENE_CAMERA_ZOOM * zoomRef.current`;
  - `<Canvas key={settings.antialias ? "aa-on" : "aa-off"} …>` re-creates the renderer when the tier's antialias flips;
  - `onCreated` re-applies `SCENE_CAMERA_ZOOM * zoomRef.current` to the new camera;
  - `PAN_RIVER` is unchanged, with a comment that pan awaits an owner decision;
  - the lamp target is a `Group` (`lampTargetRef`) from the instanced lamp heads, and `onLampSelected` exists.
- `src/config/interaction.config.ts` gains `RITUAL_CHIP_START_PERCENT`, `RITUAL_CHIP_MIN_PERCENT`,
  `RITUAL_CHIP_MAX_PERCENT` and `PERCENT_SCALE`. This card appends two other constants (no name clash).
- `tests/unit/scene-art-constants.test.ts` scans every non-test `.ts`/`.tsx` file under `src/components/canvas3d/**` and
  `src/components/models/**`. It fails on a hex colour (`/#[0-9a-fA-F]{3,8}\b/`), a decimal literal
  (`/(?<![\w.$])\d+\.\d+/`) or a texture loader. This card's new `src/components/canvas3d/PartChangeBounce.tsx` and its
  edits to `index.tsx` must contain none. All numbers come from config.

Everything this card needs from `index.tsx` is identified by **component, prop and `onAction` case names, not line
numbers**: `SceneViewport`, its props object, `onAction` (`ROTATE_KRATHONG`, `PINCH_ZOOM` cases), the hook block before
`if (!profiled || qualityTier === "FALLBACK_2D") return null;`, `ToyNightScene` / `ToyNightSceneProps`, and the
`<KrathongModel …/>` element inside the krathong target group. **Pan semantics are an open owner decision. Do not
change `PAN_RIVER`, `worldRotation`, `worldOffset` or the `worldView` group.**

No Next.js API is used (client components only), so there is no `node_modules/next/dist/docs/` page to follow. Do not
add a `viewport` export or change `src/app/layout.tsx`.

## Acceptance criteria → checks

AC text is verbatim from `docs/backlog.json` story 4.2.

1. **"Bottom bar for parts and colors; rotate-around and zoom-detail controls"**
   - In CUSTOMIZE_OBJECT, `FlowRoot` renders `CustomizerPanel` (region "แต่งกระทง"). It has a tablist
     ฐาน / ใบตอง / ดอกไม้ / เทียน, part buttons for every base, fold style and flower kind, colour buttons for every leaf
     and candle colour, and one "ถัดไป" → `src/components/ui/CustomizerPanel.test.tsx`, `src/components/ui/FlowRoot.test.tsx`.
   - Each button changes exactly its field in `useBuilderStore`, and the result always passes
     `parseKrathongAppearance` → `CustomizerPanel.test.tsx`, `src/store/useBuilderStore.test.ts`,
     `src/core/customization/krathongChoices.test.ts`.
   - The bar is `position: fixed` at the bottom, and its bottom edge equals the window bottom at 360 × 640 →
     `tests/e2e/customizer.spec.ts`.
   - Rotate buttons call `rotate(-1 | 1)` and zoom buttons call `zoom(1 | -1)` on the `CustomizeViewControl` handle →
     `CustomizerPanel.test.tsx`. FlowRoot wires the handle to the scene → `FlowRoot.test.tsx`.
   - In `SceneViewport`, the handle rotates the krathong through the same `objectRotation` that drag uses, and zooms
     through the same `getPinchZoomFactor` clamp and camera update that pinch uses. It does nothing outside CUSTOMIZE →
     `src/components/canvas3d/index.test.tsx`, `src/core/interaction/index.test.ts`.
   - With no 3D view (FALLBACK_2D or not profiled), the view buttons and the gesture hint are absent →
     `CustomizerPanel.test.tsx`, `FlowRoot.test.tsx`, `customizer.spec.ts`.
2. **"Gentle bounce animation on part change (off under reduced motion)"**
   - `createPartChangeBounce(api, false).play()` starts `{ from: { scale: fromScale }, to: { scale: 1 }, immediate: false, config }`.
     With `reducedMotion = true`, `play()` starts only `{ to: { scale: 1 }, immediate: true }` →
     `src/core/customization/partChangeBounce.test.ts`.
   - In `SceneViewport`, a builder appearance change starts one non-immediate bounce. Mount does not start one. A no-op
     choice does not start one. Under reduced motion the start is `immediate: true` with no `from` →
     `src/components/canvas3d/index.test.tsx`.
   - The bounce group (`name="part-change-bounce"`) wraps `krathong-model` inside the krathong target group →
     `index.test.tsx`.
3. **"Works at 360px width"**
   - At a 360 × 640 viewport on HIGH and on FALLBACK_2D:
     - no horizontal page overflow;
     - every tab and button lies inside 0–360 px and is at least 44 × 44 px;
     - the bar does not cover the 3D viewport;
     - each tab can be opened, a part and a colour can be picked, the view buttons work without page errors;
     - "ถัดไป" reaches WRITE_WISH.
     → `tests/e2e/customizer.spec.ts`.

## Owner decisions that apply

Quoted from `docs/spec/open-questions.md`. Do not reopen them.

- **Row 11 (MFW-15):** "Animation library: GSAP or `@react-spring/three`" → "Decided in MFW-15: @react-spring/three".
  The bounce uses `useSpring` + `animated.group` from `@react-spring/three`. No new animation dependency.
- **Row 5 (MFW-9):** per-tier budgets live in `TIER_BUDGETS`. → This card adds no tier numbers. The bounce animates one
  transform, so it runs the same on HIGH / MEDIUM / LOW. FALLBACK_2D has no 3D scene, so it has no bounce (see D7).
- **Row 16 (MFW-36):** "build the engine loops … generically; finish Loy Krathong only as far as the private test needs".
  → The view-control handle and the bounce are generic. Only the Loy Krathong catalogue gets tabs. Other events get the
  bar without part tabs, and they cannot reach CUSTOMIZE_OBJECT today anyway.
- **CLAUDE.md invariant F** (reduced motion): reduced motion turns the bounce off. The step rotation and step zoom
  are instant cuts in every mode.
- **Pan (MFW-27 review, owner decision pending):** do not change pan. This card only touches the CUSTOMIZE rotate and
  zoom paths.

No row of `open-questions.md` names MFW-20, so nothing is appended there.

## Files

| Path | New/modify | Purpose |
|---|---|---|
| `src/config/customizer.config.ts` | new | Tabs, Thai labels/copy, bounce numbers, touch-target and min-width constants |
| `src/config/interaction.config.ts` | modify | `CUSTOMIZE_ROTATE_STEP_RADIANS`, `CUSTOMIZE_ZOOM_STEP_SCALE` |
| `src/core/interaction/index.ts` | modify | `ViewStepDirection`, `CustomizeViewControl`, `getRotationAfterDrag`, `getRotationAfterStep`, `getZoomFactorAfterStep` |
| `src/core/interaction/index.test.ts` | modify | Cases for the three new helpers |
| `src/core/customization/krathongChoices.ts` | new | `applyKrathongChoice`, `krathongAppearanceEquals`, `getFlowerSelection`, `ALL_RIM_SOCKETS`, choice types |
| `src/core/customization/krathongChoices.test.ts` | new | Pure op tests |
| `src/core/customization/partChangeBounce.ts` | new | `createPartChangeBounce(api, reducedMotion)`. Pure, NOT exported from the barrel |
| `src/core/customization/partChangeBounce.test.ts` | new | Reduced-motion and normal branches |
| `src/core/customization/index.ts` | modify | Add `export * from "./krathongChoices";` |
| `src/core/customization/purity.test.ts` | modify | Add the two new core files and `customizer.config.ts` to the scanned list |
| `src/store/useBuilderStore.ts` | modify | Add action `chooseKrathong(choice)` |
| `src/store/useBuilderStore.test.ts` | new | Store action tests |
| `src/store/stores.test.ts` | modify | The builder shape assertion now includes the action (kept exact) |
| `src/components/canvas3d/PartChangeBounce.tsx` | new | `animated.group` that bounces on `changeKey` change |
| `src/components/canvas3d/index.tsx` | modify (after MFW-27) | `viewControlRef` prop + `useImperativeHandle`, shared `applyZoomFactor`, helpers in the rotate/pinch cases, `PartChangeBounce` around `<KrathongModel>` inside the `SCENE_OBJECT_NAMES.krathong` group |
| `src/components/canvas3d/index.test.tsx` | modify | Handle and bounce cases (existing cases unchanged) |
| `src/components/ui/CustomizerPanel.tsx` | new | The bottom bar (spec §3 file name) |
| `src/components/ui/CustomizerPanel.test.tsx` | new | Component tests |
| `src/components/ui/CustomizerPanel.boundary.test.ts` | new | Static import check (no three / R3F / spring / canvas3d / models) |
| `src/components/ui/FlowRoot.tsx` | modify | Render `CustomizerPanel` in CUSTOMIZE_OBJECT; one `viewControlRef` shared with `SceneViewport` |
| `src/components/ui/FlowRoot.test.tsx` | modify | Mock exposes the handle; three new cases |
| `src/components/ui/FlowStepPlaceholder.tsx` | modify | Remove the now-dead CUSTOMIZE_OBJECT hint branch (copy moves to `CUSTOMIZER_COPY.gestureHint`) |
| `tests/e2e/customizer.spec.ts` | new | 360 × 640 checks, HIGH and FALLBACK_2D |

## Implementation steps

Conventions for every file:
- TypeScript strict, English comments, no `any`.
- Freeze exported constant objects with `Object.freeze` (as the existing configs do).
- No inline numbers in logic except `0`, `1`, `-1` and those in the formulas below. Tailwind classes are styling, not
  constants.
- New React components start with `"use client";`.

### Step 1 — `src/config/customizer.config.ts` (new)

Pure data. Import types only (`import type`), so it has no runtime import of React, three or any `src/core` module.

```ts
import type {
  CandleColor, FlowerKind, KrathongBaseId, LeafColor, LeafFoldStyleId,
} from "@/config/events/loyKrathong.config";

export const CUSTOMIZER_TAB_IDS = ["base", "leaves", "flowers", "candle"] as const;
export type CustomizerTabId = (typeof CUSTOMIZER_TAB_IDS)[number];

export interface CustomizerTab { readonly id: CustomizerTabId; readonly label: string; }
/** Bottom-bar tabs in display order (spec §6.4 Task 4.2 "แถบเลือกชิ้นส่วนและสี"). */
export const CUSTOMIZER_TABS: readonly CustomizerTab[] = Object.freeze([
  Object.freeze({ id: "base", label: "ฐาน" }),
  Object.freeze({ id: "leaves", label: "ใบตอง" }),
  Object.freeze({ id: "flowers", label: "ดอกไม้" }),
  Object.freeze({ id: "candle", label: "เทียน" }),
] as const);

/** Part names from spec §6.4 Task 4.1 (ฐานหยวกกล้วย / ฐานกลีบบัว / ฐานขนมปังสไตล์ของเล่น). */
export const KRATHONG_BASE_LABELS: Readonly<Record<KrathongBaseId, string>> = Object.freeze({
  banana_trunk_01: "หยวกกล้วย",
  lotus_petal_01: "กลีบบัว",
  toy_bread_01: "ขนมปัง",
});
/** PLACEHOLDER copy (spec silent; follows MFW-19's placeholder styles: style_01 pointed, style_02 rounded). */
export const LEAF_FOLD_STYLE_LABELS: Readonly<Record<LeafFoldStyleId, string>> = Object.freeze({
  style_01: "พับแหลม",
  style_02: "พับมน",
});
/** PLACEHOLDER copy for MFW-19's placeholder palette (spec silent). */
export const LEAF_COLOR_LABELS: Readonly<Record<LeafColor, string>> = Object.freeze({
  "#5E8C3A": "เขียวใบตอง",
  "#8DB255": "เขียวอ่อน",
  "#3F6B4A": "เขียวเข้ม",
});
/** Flower names from spec §6.4 Task 4.1 (ดอกดาวเรือง ดอกกล้วยไม้ ดอกบัว). */
export const FLOWER_KIND_LABELS: Readonly<Record<FlowerKind, string>> = Object.freeze({
  marigold: "ดาวเรือง",
  orchid: "กล้วยไม้",
  lotus: "ดอกบัว",
});
/** PLACEHOLDER copy for MFW-19's candle palette (spec silent). */
export const CANDLE_COLOR_LABELS: Readonly<Record<CandleColor, string>> = Object.freeze({
  "#FFD166": "เหลืองทอง",
  "#FFF1D6": "ขาวนวล",
  "#FF9F6B": "ส้มอ่อน",
});
export const NO_FLOWER_LABEL = "ไม่ใส่";

export const CUSTOMIZER_COPY = Object.freeze({
  panelLabel: "แต่งกระทง",
  tabListLabel: "ส่วนประกอบกระทง",
  baseGroupLabel: "ฐานกระทง",
  foldGroupLabel: "แบบพับใบตอง",
  leafColorGroupLabel: "สีใบตอง",
  flowerGroupLabel: "ดอกไม้รอบขอบ",
  candleColorGroupLabel: "สีเทียน",
  viewGroupLabel: "มุมมอง",
  rotateLeft: "หมุนซ้าย",
  rotateRight: "หมุนขวา",
  zoomIn: "ซูมเข้า",
  zoomOut: "ซูมออก",
  /** Same label as the other flow steps; e2e and FlowRoot tests click it by this name. */
  done: "ถัดไป",
  /** Moved verbatim from FlowStepPlaceholder (MFW-16). */
  gestureHint: "ลากเพื่อหมุนกระทง ใช้สองนิ้วเพื่อซูม",
});

/**
 * Part-change bounce: the krathong scale jumps to `fromScale` and springs back to `restScale` with an
 * under-damped spring. With these values (damping ratio ≈ 0.29) the overshoot is ≈ 4 % and it settles in ≈ 0.8 s.
 * fromScale / tension / friction: PLACEHOLDER (spec silent: "แอนิเมชันเด้งเบาๆ"). restScale 1 = the model's own size.
 */
export const PART_CHANGE_BOUNCE = Object.freeze({
  restScale: 1,
  fromScale: 0.9,
  spring: Object.freeze({ mass: 1, tension: 300, friction: 10 }),
});

/** Minimum touch target edge (WCAG 2.5.5 / Apple HIG 44 pt). Tailwind `min-h-11 min-w-11` = 2.75rem = 44 px. Lead decision. */
export const MIN_TOUCH_TARGET_PX = 44;
/** Narrowest supported screen width (backlog 4.2 AC3). */
export const CUSTOMIZER_MIN_WIDTH_PX = 360;
```

Use `Readonly<Record<…>>` so that changing an MFW-19 palette without changing these labels fails `pnpm typecheck`.

### Step 2 — `src/config/interaction.config.ts` (modify)

Append (keep every existing line):

```ts
/** One tap on หมุนซ้าย / หมุนขวา turns the krathong by this much (CUSTOMIZE). PLACEHOLDER (spec silent): 8 taps = one turn. */
export const CUSTOMIZE_ROTATE_STEP_RADIANS = Math.PI / 4;
/** One tap on ซูมเข้า multiplies the zoom factor by this, ซูมออก divides by it; clamped to PINCH_ZOOM_MIN..MAX. PLACEHOLDER (spec silent). */
export const CUSTOMIZE_ZOOM_STEP_SCALE = 1.25;
```

### Step 3 — `src/core/interaction/index.ts` (modify)

Add to the config import: `CUSTOMIZE_ROTATE_STEP_RADIANS`, `CUSTOMIZE_ZOOM_STEP_SCALE`, `ROTATION_RADIANS_PER_PIXEL`.
Add these exports. Change nothing else in the file, including `createInputSeparator`.

```ts
/** -1 = left / out, 1 = right / in. */
export type ViewStepDirection = -1 | 1;

/** Imperative view commands for the customizer's rotate/zoom buttons; implemented by SceneViewport (CUSTOMIZE only). */
export interface CustomizeViewControl {
  rotate(direction: ViewStepDirection): void;
  zoom(direction: ViewStepDirection): void;
}

/** Krathong yaw after a CUSTOMIZE drag of deltaX px (the formula SceneViewport used inline). */
export function getRotationAfterDrag(current: number, deltaX: number): number {
  return current + deltaX * ROTATION_RADIANS_PER_PIXEL;
}

/** Krathong yaw after one rotate-button tap. Drag right and หมุนขวา both increase the angle. */
export function getRotationAfterStep(current: number, direction: ViewStepDirection): number {
  return current + direction * CUSTOMIZE_ROTATE_STEP_RADIANS;
}

/** Zoom factor after one zoom-button tap, through the same clamp as pinch. */
export function getZoomFactorAfterStep(current: number, direction: ViewStepDirection): number {
  return getPinchZoomFactor(current, direction === 1 ? CUSTOMIZE_ZOOM_STEP_SCALE : 1 / CUSTOMIZE_ZOOM_STEP_SCALE);
}
```

`src/core/camera` is **not** changed. Fly-to belongs to WORLD_EXPLORE (MFW-17). In CUSTOMIZE, "rotate around" is the
krathong yaw and "zoom detail" is the orthographic zoom factor. Both already live in `SceneViewport` + `core/interaction`.

### Step 4 — `src/core/customization/krathongChoices.ts` (new; pure, no three/React)

```ts
import { parseKrathongAppearance, canonicalizeKrathongAppearance } from "./krathongAppearance";
import { clearSocket, placeInSocket, type BuilderResult } from "./krathongBuilder";
import { getKrathongSocket, KRATHONG_SOCKETS } from "./sockets";
import type {
  CandleColor, FlowerKind, KrathongAppearance, KrathongBaseId, LeafColor, LeafFoldStyleId, RimSocketId,
} from "./types";
import { RIM_SOCKET_COUNT } from "@/config/events/loyKrathong.config";

/** Flower target meaning "every rim socket". */
export const ALL_RIM_SOCKETS = "ALL_RIM_SOCKETS" as const;
export type KrathongFlowerTarget = typeof ALL_RIM_SOCKETS | RimSocketId;

/** One customizer action. `value: null` on a flower choice empties the target socket(s). */
export type KrathongChoice =
  | { readonly part: "base"; readonly value: KrathongBaseId }
  | { readonly part: "lotusFold"; readonly value: LeafFoldStyleId }
  | { readonly part: "leafColor"; readonly value: LeafColor }
  | { readonly part: "candleColor"; readonly value: CandleColor }
  | { readonly part: "flower"; readonly target: KrathongFlowerTarget; readonly value: FlowerKind | null };

export type KrathongChoiceResult =
  | { readonly ok: true; readonly appearance: KrathongAppearance }
  | { readonly ok: false; readonly reason: string };

/** What the flower buttons show as pressed: one kind, empty (null), or a mix. */
export type FlowerSelection = FlowerKind | null | "MIXED";

export function applyKrathongChoice(appearance: KrathongAppearance, choice: KrathongChoice): KrathongChoiceResult;
export function krathongAppearanceEquals(a: KrathongAppearance, b: KrathongAppearance): boolean;
export function getFlowerSelection(appearance: KrathongAppearance, target: KrathongFlowerTarget): FlowerSelection;
```

Module-level: `const RIM_SOCKET_IDS: readonly string[] = Object.freeze(KRATHONG_SOCKETS.filter((s) => s.kind === "rim").map((s) => s.id));`

`applyKrathongChoice`. It never mutates `appearance` and never throws.
1. Build a `candidate` with a `switch (choice.part)`:
   - `"base"` → `{ ...appearance, base: choice.value }`. Same pattern for `"lotusFold"`, `"leafColor"` and `"candleColor"`, each
     setting its own key.
   - `"flower"` → `targets = choice.target === ALL_RIM_SOCKETS ? RIM_SOCKET_IDS : [choice.target]`. Start with
     `acc = appearance`. For each `socketId` in order:
     `r: BuilderResult = choice.value === null ? clearSocket(acc, socketId) : placeInSocket(acc, { part: "flower", kind: choice.value, socketId })`.
     If `!r.ok`, return `{ ok: false, reason: \`socket rule: ${r.violation} at ${r.socketId}\` }`. Otherwise set
     `acc = r.appearance`. After the loop, `candidate = acc`.
   - `default:` (runtime-only, e.g. a cast) → `return { ok: false, reason: "unknown choice part" }`. Write it as
     `const unreachable: never = choice; void unreachable;` followed by the return, so TS checks exhaustiveness.
2. `const parsed = parseKrathongAppearance(candidate);` Return `parsed.ok ? { ok: true, appearance: parsed.appearance } : { ok: false, reason: parsed.reason }`.
   Every successful result has therefore passed the same strict parser the create API (MFW-45) uses (D4). Values
   outside the catalogue (casts) are rejected with the parser's reason string. Example: `"base is not a known krathong base"`.

`krathongAppearanceEquals(a, b)` = `JSON.stringify(canonicalizeKrathongAppearance(a)) === JSON.stringify(canonicalizeKrathongAppearance(b))`
(the key order is fixed by canonicalize). The store gets only parsed appearances, so colours are already uppercase.

`getFlowerSelection(appearance, target)`:
- `ALL_RIM_SOCKETS`: `first = appearance.flowers[0] ?? null`. For `i = 1 … RIM_SOCKET_COUNT - 1`, if
  `(appearance.flowers[i] ?? null) !== first`, return `"MIXED"`. Otherwise return `first`. So `flowers: []` returns `null`, and the
  default appearance returns `"marigold"`.
- Otherwise: `socket = getKrathongSocket(target)`. If `!socket || socket.rimIndex === null`, throw
  `new RangeError(\`not a rim socket: ${String(target)}\`)` (a programming error). Otherwise return
  `appearance.flowers[socket.rimIndex] ?? null`.

### Step 5 — `src/core/customization/partChangeBounce.ts` (new; pure; NOT in the barrel)

```ts
import { PART_CHANGE_BOUNCE } from "@/config/customizer.config";

export interface BounceSpringConfig { readonly mass: number; readonly tension: number; readonly friction: number; }
export interface PartChangeBounceStart {
  readonly from?: { readonly scale: number };
  readonly to: { readonly scale: number };
  readonly immediate: boolean;
  readonly config?: BounceSpringConfig;
}
/** The subset of a react-spring SpringRef this needs (mirrors CameraAnimationApi in src/core/camera). */
export interface PartChangeBounceApi { start: (options: PartChangeBounceStart) => void; }
export interface PartChangeBounce {
  /** Play the bounce once (reduced motion: snap to rest instead). */
  play(): void;
  /** Snap to rest immediately (used when reduced motion turns on mid-bounce). */
  settle(): void;
}

export function createPartChangeBounce(api: PartChangeBounceApi, reducedMotion: boolean): PartChangeBounce {
  const settle = () => api.start({ to: { scale: PART_CHANGE_BOUNCE.restScale }, immediate: true });
  return {
    play() {
      if (reducedMotion) { settle(); return; }
      api.start({
        from: { scale: PART_CHANGE_BOUNCE.fromScale },
        to: { scale: PART_CHANGE_BOUNCE.restScale },
        immediate: false,
        config: { ...PART_CHANGE_BOUNCE.spring },
      });
    },
    settle,
  };
}
```

It is kept out of the barrel because it is UI animation, not server-safe customization data, and it imports the UI copy
config. Import it by path: `@/core/customization/partChangeBounce`.

### Step 6 — `src/core/customization/index.ts` (modify)

Add one line after the MFW-19 exports: `export * from "./krathongChoices";`. Do not export `partChangeBounce` or
`uprightConstraint` from the barrel.

### Step 7 — `src/store/useBuilderStore.ts` (modify)

```ts
import { create } from "zustand";
import {
  applyKrathongChoice,
  DEFAULT_KRATHONG_APPEARANCE,
  krathongAppearanceEquals,
  type EventAppearance,
  type KrathongChoice,
  type KrathongChoiceResult,
} from "@/core/customization";

export interface BuilderActions {
  /**
   * Applies one customizer choice to the current appearance (null = DEFAULT_KRATHONG_APPEARANCE).
   * Updates the store only when the result is valid AND different, so a no-op keeps the same reference (no bounce).
   */
  chooseKrathong: (choice: KrathongChoice) => KrathongChoiceResult;
}

/** The creation currently being customized (spec §3: useBuilderStore). */
export interface BuilderState extends BuilderActions {
  appearance: EventAppearance | null;
}

export const useBuilderStore = create<BuilderState>()((set, get) => ({
  appearance: null,
  chooseKrathong: (choice) => {
    const current = get().appearance ?? DEFAULT_KRATHONG_APPEARANCE;
    const result = applyKrathongChoice(current, choice);
    if (result.ok && !krathongAppearanceEquals(result.appearance, current)) set({ appearance: result.appearance });
    return result;
  },
}));
```

No `persist` middleware, no `localStorage`, no fetch. The appearance stays in memory until the release card (MFW-23)
sends it.

### Step 8 — `src/components/canvas3d/PartChangeBounce.tsx` (new)

```tsx
"use client";

import { animated, useSpring } from "@react-spring/three";
import { useEffect, useRef, type ReactNode } from "react";
import { PART_CHANGE_BOUNCE } from "@/config/customizer.config";
import { createPartChangeBounce } from "@/core/customization/partChangeBounce";

export interface PartChangeBounceProps {
  /** Any change of identity (Object.is) plays one bounce; the first render does not. */
  changeKey: unknown;
  reducedMotion: boolean;
  children: ReactNode;
}

/** Gentle scale bounce on part change (backlog 4.2 AC2); reduced motion → no animation. */
export function PartChangeBounce({ changeKey, reducedMotion, children }: PartChangeBounceProps) {
  const [spring, api] = useSpring(() => ({ scale: PART_CHANGE_BOUNCE.restScale }));
  const lastKey = useRef(changeKey);

  useEffect(() => {
    const bounce = createPartChangeBounce({ start: (options) => void api.start(options) }, reducedMotion);
    if (Object.is(lastKey.current, changeKey)) {
      if (reducedMotion) bounce.settle();
      return;
    }
    lastKey.current = changeKey;
    bounce.play();
  }, [api, changeKey, reducedMotion]);

  return (
    <animated.group name="part-change-bounce" scale={spring.scale}>
      {children}
    </animated.group>
  );
}
```

Notes:
- `@react-spring/three` already invalidates the `frameloop="demand"` canvas on every spring step. Do not add
  `useFrame` here.
- One spring per scene. The only allocation is the options object, once per tap and never per frame.
- If `api.start(options)` has a readonly-typing complaint, pass `{ ...options }`. Do not loosen the core types.

### Step 9 — `src/components/canvas3d/index.tsx` (modify, on top of MFW-27's version)

Every edit is described by component, prop or `onAction` case name. Find them by name, not by line. Keep everything
else as MFW-27 left it: lights, `RiverEnvironment`, the `worldView` group, the candle `pointLight`, `TargetHighlight`,
the lamp selection, the `Canvas` `key`/`gl`/`onCreated`, `PAN_RIVER`, `DRAG_KRATHONG` and the RITUAL chip. Use no
literal numbers or colours (`tests/unit/scene-art-constants.test.ts`).

1. **Imports.**
   - Add `useImperativeHandle` and `type Ref` to the existing `react` import.
   - Add `getRotationAfterDrag`, `getRotationAfterStep`, `getZoomFactorAfterStep` and `type CustomizeViewControl` to the
     existing `@/core/interaction` import.
   - Add `import { PartChangeBounce } from "./PartChangeBounce";`.
   - Keep `ROTATION_RADIANS_PER_PIXEL` if `PAN_RIVER` still uses it. Keep `SCENE_CAMERA_ZOOM`, which MFW-27 imports from
     `@/config/camera.config`.
2. **`ToyNightSceneProps` / `ToyNightScene`.**
   - Add the prop `reducedMotion: boolean` and destructure it.
   - Inside the krathong target group (the `<group ref={krathongTargetRef} name={SCENE_OBJECT_NAMES.krathong} …>`),
     wrap **only** the `<KrathongModel …/>` element. Leave the group's `ref`, `name`, `rotation`, `onClick` and the
     candle `<pointLight>` exactly as they are, so the light does not scale with the bounce:
     ```tsx
     <PartChangeBounce changeKey={appearance} reducedMotion={reducedMotion}>
       <KrathongModel appearance={appearance} shadows={shadows} />
     </PartChangeBounce>
     ```
   - Do not add a new `name` to the target group. Tests select it by `SCENE_OBJECT_NAMES.krathong`.
   - `appearance` changes identity only when `useBuilderStore` changes (the `?? DEFAULT_KRATHONG_APPEARANCE` fallback
     is a frozen module constant), so no other bounce trigger is needed. A `Canvas` re-creation (MFW-27's antialias
     `key`) remounts `PartChangeBounce`, which does not bounce on mount.
3. **`SceneViewport` props.** Add `viewControlRef?: Ref<CustomizeViewControl>` to the destructured props and to their
   inline type. Keep `mode = null` and `onGestureRelease`. Pass `reducedMotion={reducedMotion}` (already read from
   `useDeviceStore` there) to `<ToyNightScene …>`.
4. **Shared zoom applier.** Add it in the hook block, above `onAction`. Use the same base-zoom constant as MFW-27's
   `PINCH_ZOOM` line (`SCENE_CAMERA_ZOOM`; if MFW-27 merged with another name, use that). Keep the
   `cameraRef.current` access shape that lint already accepts:
   ```ts
   const applyZoomFactor = useCallback((factor: number) => {
     zoomRef.current = factor;
     if (cameraRef.current) {
       cameraRef.current.zoom = SCENE_CAMERA_ZOOM * zoomRef.current;
       cameraRef.current.updateProjectionMatrix();
       invalidateRef.current?.();
     }
   }, []);
   ```
   Leave MFW-27's `onCreated` re-apply of `zoomRef.current` as it is. It already reads the same `zoomRef`, so button zoom
   survives a canvas re-creation.
5. **`onAction`.**
   - `case "ROTATE_KRATHONG"` → `setObjectRotation((value) => getRotationAfterDrag(value, action.deltaX));`
   - `case "PINCH_ZOOM"` → `applyZoomFactor(getPinchZoomFactor(zoomRef.current, action.scale));`
   - Add `applyZoomFactor` to `onAction`'s `useCallback` deps.
   - Do not touch the other cases.
   Behaviour must stay identical: the existing pinch test still expects `zoom === TOY_SCENE_CAMERA.zoom * 1.5`.
6. **Imperative handle.** Add it right after `onAction`, still in the hook block before
   `if (!profiled || qualityTier === "FALLBACK_2D") return null;`, so the hook order is stable:
   ```ts
   useImperativeHandle(viewControlRef, () => ({
     rotate(direction) {
       if (mode !== "CUSTOMIZE") return;
       setObjectRotation((value) => getRotationAfterStep(value, direction));
     },
     zoom(direction) {
       if (mode !== "CUSTOMIZE") return;
       applyZoomFactor(getZoomFactorAfterStep(zoomRef.current, direction));
     },
   }), [mode, applyZoomFactor]);
   ```
   Steps are instant (no tween), so they need no reduced-motion branch (D2). Zoom stays imperative (no React state),
   as MFW-44 intended.

`src/components/canvas3d/PartChangeBounce.tsx` (Step 8) must also pass the MFW-27 scan: it has no hex or decimal
literal, and its numbers come from `PART_CHANGE_BOUNCE`.

### Step 10 — `src/components/ui/CustomizerPanel.tsx` (new)

```tsx
"use client";

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import type { FestivalEventId } from "@/config/events";
import {
  CANDLE_COLOR_PALETTE, FLOWER_KINDS, KRATHONG_BASE_IDS, LEAF_COLOR_PALETTE, LEAF_FOLD_STYLE_IDS,
} from "@/config/events/loyKrathong.config";
import { KRATHONG_BASE_MODELS, KRATHONG_FLOWER_MODELS } from "@/config/krathongModel.config";
import {
  CANDLE_COLOR_LABELS, CUSTOMIZER_COPY, CUSTOMIZER_TABS, FLOWER_KIND_LABELS, KRATHONG_BASE_LABELS,
  LEAF_COLOR_LABELS, LEAF_FOLD_STYLE_LABELS, NO_FLOWER_LABEL, type CustomizerTabId,
} from "@/config/customizer.config";
import { ALL_RIM_SOCKETS, DEFAULT_KRATHONG_APPEARANCE, getFlowerSelection, type KrathongChoice } from "@/core/customization";
import type { CustomizeViewControl } from "@/core/interaction";
import { useBuilderStore } from "@/store/useBuilderStore";

export interface CustomizerPanelProps {
  eventId: FestivalEventId | null;
  /** Dispatches FINISH_CUSTOMIZE. */
  onDone: () => void;
  /** null = no 3D view mounted (FALLBACK_2D / not profiled): rotate/zoom buttons and the gesture hint are hidden. */
  viewControlRef: RefObject<CustomizeViewControl | null> | null;
}
```

Private helpers in the same file:
- `OptionButton({ label, pressed, onPress, swatch }: { label: string; pressed: boolean; onPress: () => void; swatch?: string })`
  → `<button type="button" aria-pressed={pressed} onClick={onPress} className="flex min-h-11 min-w-11 shrink-0 items-center gap-2 rounded-full border px-3 text-sm transition-colors motion-reduce:transition-none …">`.
  - Pressed style: `border-amber-500 bg-amber-100 font-semibold text-amber-950 dark:bg-amber-400/20 dark:text-amber-100`.
  - Unpressed style: `border-black/10 bg-white text-zinc-800 dark:border-white/15 dark:bg-zinc-800 dark:text-zinc-100`.
  - If `swatch` is set, render `<span aria-hidden="true" className="h-5 w-5 shrink-0 rounded-full border border-black/20" style={{ backgroundColor: swatch }} />`
    before the label.
  - The visible label text is the accessible name.
- `OptionRow({ label, children }: { label: string; children: ReactNode })` →
  `<div role="group" aria-label={label} className="flex gap-2 overflow-x-auto pb-1">{children}</div>`. If a later
  catalogue grows, the row scrolls inside itself and the page never overflows.
- `ViewButton({ label, glyph, onPress })` → `<button type="button" aria-label={label} onClick={onPress} className="grid min-h-11 min-w-11 place-items-center rounded-full border border-black/10 bg-white text-lg dark:border-white/15 dark:bg-zinc-800"><span aria-hidden="true">{glyph}</span></button>`.
  The glyphs are `"⟲"` (rotate left), `"⟳"` (rotate right), `"+"` (zoom in) and `"−"` (U+2212, zoom out).

Component body:
```tsx
export function CustomizerPanel({ eventId, onDone, viewControlRef }: CustomizerPanelProps) {
  const idBase = useId();
  const [tab, setTab] = useState<CustomizerTabId>(CUSTOMIZER_TABS[0].id);
  const stored = useBuilderStore((s) => s.appearance);
  const chooseKrathong = useBuilderStore((s) => s.chooseKrathong);
  const appearance = stored ?? DEFAULT_KRATHONG_APPEARANCE;
  const barRef = useRef<HTMLElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);

  // Keep an in-flow spacer as tall as the fixed bar, so content above it can always scroll clear of the bar.
  useEffect(() => {
    const bar = barRef.current;
    const spacer = spacerRef.current;
    if (!bar || !spacer || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      spacer.style.height = `${bar.offsetHeight}px`;
    });
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  const choose = (choice: KrathongChoice) => { chooseKrathong(choice); };
  const flowerSelection = getFlowerSelection(appearance, ALL_RIM_SOCKETS);
  const tabId = (id: CustomizerTabId) => `${idBase}-tab-${id}`;
  const panelId = `${idBase}-tabpanel`;
  // …JSX below
}
```

The `chooseKrathong` result is ignored on purpose. The buttons only offer catalogue values, so a failure is
unreachable. Do not `console.*` it.

JSX structure. Put the classes on the elements exactly as written:
```tsx
<>
  <div ref={spacerRef} aria-hidden="true" data-testid="customizer-spacer" className="shrink-0" />
  <section
    ref={barRef}
    aria-label={CUSTOMIZER_COPY.panelLabel}
    data-testid="customizer-panel"
    className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-3xl flex-col gap-2 rounded-t-3xl border-t border-black/10 bg-white/95 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.12)] touch-manipulation dark:border-white/15 dark:bg-zinc-900/95"
  >
    {viewControlRef && <p className="text-xs text-zinc-600 dark:text-zinc-300">{CUSTOMIZER_COPY.gestureHint}</p>}
    {eventId === "loy_krathong" && (
      <>
        <div role="tablist" aria-label={CUSTOMIZER_COPY.tabListLabel} className="grid grid-cols-4 gap-1">
          {CUSTOMIZER_TABS.map((t) => (
            <button key={t.id} type="button" role="tab" id={tabId(t.id)} aria-selected={tab === t.id}
              aria-controls={panelId} data-tab-id={t.id} onClick={() => setTab(t.id)}
              className={`min-h-11 min-w-11 rounded-full text-sm ${tab === t.id ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={panelId} aria-labelledby={tabId(tab)} className="flex min-h-26 flex-col gap-2">
          {/* tab content, see below */}
        </div>
      </>
    )}
    <div className="flex items-center gap-2">
      {viewControlRef && (
        <div role="group" aria-label={CUSTOMIZER_COPY.viewGroupLabel} className="flex gap-1">
          <ViewButton label={CUSTOMIZER_COPY.rotateLeft} glyph="⟲" onPress={() => viewControlRef.current?.rotate(-1)} />
          <ViewButton label={CUSTOMIZER_COPY.rotateRight} glyph="⟳" onPress={() => viewControlRef.current?.rotate(1)} />
          <ViewButton label={CUSTOMIZER_COPY.zoomIn} glyph="+" onPress={() => viewControlRef.current?.zoom(1)} />
          <ViewButton label={CUSTOMIZER_COPY.zoomOut} glyph="−" onPress={() => viewControlRef.current?.zoom(-1)} />
        </div>
      )}
      <button type="button" onClick={onDone}
        className="ml-auto min-h-11 min-w-11 rounded-full bg-zinc-900 px-5 text-white transition-colors motion-reduce:transition-none hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">
        {CUSTOMIZER_COPY.done}
      </button>
    </div>
  </section>
</>
```

Tab content (catalogue order everywhere):
- `"base"`: one `OptionRow` labelled `baseGroupLabel`. For each `id` of `KRATHONG_BASE_IDS`:
  `<OptionButton label={KRATHONG_BASE_LABELS[id]} swatch={KRATHONG_BASE_MODELS[id].color} pressed={appearance.base === id} onPress={() => choose({ part: "base", value: id })} />`.
- `"leaves"`: two rows.
  - `foldGroupLabel`: for each id of `LEAF_FOLD_STYLE_IDS`, label `LEAF_FOLD_STYLE_LABELS[id]`, pressed
    `appearance.lotusFold === id`, choice `{ part: "lotusFold", value: id }`.
  - `leafColorGroupLabel`: for each colour of `LEAF_COLOR_PALETTE`, label `LEAF_COLOR_LABELS[c]`, `swatch={c}`,
    pressed `appearance.leafColor === c`, choice `{ part: "leafColor", value: c }`.
- `"flowers"`: one row labelled `flowerGroupLabel`.
  - For each `kind` of `FLOWER_KINDS`: label `FLOWER_KIND_LABELS[kind]`, `swatch={KRATHONG_FLOWER_MODELS[kind].color}`,
    pressed `flowerSelection === kind`, choice `{ part: "flower", target: ALL_RIM_SOCKETS, value: kind }`.
  - Then one more button: label `NO_FLOWER_LABEL`, pressed `flowerSelection === null`, choice
    `{ part: "flower", target: ALL_RIM_SOCKETS, value: null }`.
  - `"MIXED"` presses nothing.
- `"candle"`: one row labelled `candleColorGroupLabel`. For each colour of `CANDLE_COLOR_PALETTE`: label
  `CANDLE_COLOR_LABELS[c]`, `swatch={c}`, pressed `appearance.candleColor === c`, choice `{ part: "candleColor", value: c }`.

Hard rules for this file:
- No `touch-none` class anywhere: the FALLBACK_2D e2e asserts `.touch-none` count 0.
- No `role="note"`, because of MFW-11.
- Exactly one button whose name contains "ถัดไป". Playwright `getByRole("button", { name: "ถัดไป" })` matches substrings.
- No runtime import of `three`, `@react-three/*`, `@react-spring/*`, `@/components/canvas3d` or
  `@/components/models/**`. This file is in the landing chunk (MFW-44 keeps three out of it).

### Step 11 — `src/components/ui/FlowRoot.tsx` (modify)

```tsx
import { lazy, Suspense, useRef } from "react";
import type { CustomizeViewControl } from "@/core/interaction";
import { CustomizerPanel } from "./CustomizerPanel";
// …
const selectedEventId = useUIStore((s) => s.selectedEventId);
const viewControlRef = useRef<CustomizeViewControl | null>(null);
const show3D = profiled && qualityTier !== "FALLBACK_2D";
```
- Change the scene condition to `{show3D && interactionMode !== null && (…)}` and pass
  `viewControlRef={viewControlRef}` to `<SceneViewport …>` (keep `mode` and `onGestureRelease` as they are).
- Replace the step ternary with:
  ```tsx
  {flowState === "LANDING_EVENT_SELECT" ? (
    <EventSelector onSelect={(eventId) => dispatch({ type: "SELECT_EVENT", eventId })} />
  ) : flowState === "CUSTOMIZE_OBJECT" ? (
    <CustomizerPanel
      eventId={selectedEventId}
      onDone={() => dispatch({ type: "FINISH_CUSTOMIZE" })}
      viewControlRef={show3D ? viewControlRef : null}
    />
  ) : (
    <FlowStepPlaceholder … unchanged … />
  )}
  ```
  `NEXT_EVENT.CUSTOMIZE_OBJECT` may stay. The placeholder simply never renders for that state any more.
- Keep MFW-11's `{flowState === "WRITE_WISH" && <OwnershipNotice />}` line (on main since 2ade761) where it is, directly
  before the step ternary.

### Step 12 — `src/components/ui/FlowStepPlaceholder.tsx` (modify)

Delete only the `{step === "CUSTOMIZE_OBJECT" && (<p>…ลากเพื่อหมุนกระทง…</p>)}` block. The same text now lives in
`CUSTOMIZER_COPY.gestureHint`. Leave everything else as is.

### Step 13 — `src/core/customization/purity.test.ts` (modify)

The file on main builds `files` from a name array mapped to `src/core/customization/${name}.ts`, plus two config paths.
- Append `"krathongChoices"` and `"partChangeBounce"` to that name array.
- Append `"src/config/customizer.config.ts"` after the two config paths.
- The existing regex must not match any of them.
- Add one case next to "keeps the three.js helper out of the barrel": `index.ts` does not contain `partChangeBounce`.
- Keep the existing cases unchanged.

## Tests

All vitest tests run without network or DB. Use `toBeCloseTo(x, 9)` for float results. Reset every store touched
in `beforeEach` with `setState(getInitialState(), true)`.

### `src/core/interaction/index.test.ts` (add a `describe("customize view steps")`)
- `getRotationAfterDrag(0, 20)` → `20 * ROTATION_RADIANS_PER_PIXEL` (the same formula the old inline code used).
- `getRotationAfterStep(0, 1)` → `CUSTOMIZE_ROTATE_STEP_RADIANS`; `getRotationAfterStep(1, -1)` → `1 - CUSTOMIZE_ROTATE_STEP_RADIANS`.
- `getZoomFactorAfterStep(1, 1)` → `CUSTOMIZE_ZOOM_STEP_SCALE`; `getZoomFactorAfterStep(1, -1)` → `1 / CUSTOMIZE_ZOOM_STEP_SCALE`.
- Clamp: applying `(·, 1)` ten times from 1 → `PINCH_ZOOM_MAX`; `(·, -1)` ten times → `PINCH_ZOOM_MIN`.
- Zoom in then out from 1 → `toBeCloseTo(1, 9)` (inside the bounds the steps are inverse).

### `src/core/customization/krathongChoices.test.ts` (AC1)
Let `D = DEFAULT_KRATHONG_APPEARANCE`.
- `it.each(KRATHONG_BASE_IDS)` base choice → ok, `appearance.base === id`, all other keys equal `D`.
- `it.each(LEAF_FOLD_STYLE_IDS)` / `LEAF_COLOR_PALETTE` / `CANDLE_COLOR_PALETTE` → the same for `lotusFold` / `leafColor` / `candleColor`.
- Lowercase colour cast (`"#ffd166" as CandleColor`) → ok and `candleColor === "#FFD166"`. The parser canonicalizes it.
- `it.each(FLOWER_KINDS)` `{ part: "flower", target: ALL_RIM_SOCKETS, value: kind }` on `{ ...D, flowers: [] }` →
  `flowers` has length `RIM_SOCKET_COUNT` and every entry is `kind`.
- `ALL_RIM_SOCKETS` + `null` on `D` → `flowers` equals `[]`.
- Single socket: `{ part: "flower", target: "rim_socket_3", value: "orchid" }` on `{ ...D, flowers: [] }` →
  `[null, null, null, "orchid"]`. Then `value: null` on that → `[]`.
- Input is never mutated: after each call, the input deep-equals a `structuredClone` taken before the call.
- Rejections:
  - `{ part: "base", value: "x" as never }` → `{ ok: false, reason: "base is not a known krathong base" }`;
  - `{ part: "flower", target: "rim_socket_99" as never, value: "orchid" }` → `{ ok: false, reason: "socket rule: UNKNOWN_SOCKET at rim_socket_99" }`;
  - `{ part: "flower", target: "center_socket" as never, value: null }` → `reason "socket rule: CANDLE_REQUIRED at center_socket"`;
  - `{ part: "nope" } as never` → `{ ok: false, reason: "unknown choice part" }`.
- Every ok result passes `parseKrathongAppearance` and `toEqual`s its `appearance`.
- `krathongAppearanceEquals(D, { ...D, flowers: [...D.flowers] })` → true.
  `krathongAppearanceEquals({ ...D, flowers: ["orchid", null] }, { ...D, flowers: ["orchid"] })` → true (trailing null).
  Any single changed key → false.
- `getFlowerSelection`:
  - `D` + ALL → `"marigold"`;
  - `{ ...D, flowers: [] }` + ALL → `null`;
  - `{ ...D, flowers: ["orchid"] }` + ALL → `"MIXED"`;
  - `{ ...D, flowers: ["orchid"] }` + `"rim_socket_0"` → `"orchid"`, and `"rim_socket_5"` → `null`;
  - `"center_socket" as never` and `"rim_socket_99" as never` throw `RangeError`.

### `src/core/customization/partChangeBounce.test.ts` (AC2, invariant F reduced-motion branch)
- `const start = vi.fn()`.
- `createPartChangeBounce({ start }, false).play()` → called once with
  `{ from: { scale: PART_CHANGE_BOUNCE.fromScale }, to: { scale: PART_CHANGE_BOUNCE.restScale }, immediate: false, config: { mass, tension, friction } }`
  (values read from `PART_CHANGE_BOUNCE.spring`).
- `createPartChangeBounce({ start }, true).play()` → called once with exactly `{ to: { scale: PART_CHANGE_BOUNCE.restScale }, immediate: true }`
  (`toStrictEqual`, so there is no `from` and no `config`).
- `settle()` (either flag) → `{ to: { scale: restScale }, immediate: true }`.
- `PART_CHANGE_BOUNCE.restScale === 1`. `0 < fromScale < 1` keeps the bounce gentle: it never grows past the
  overshoot.

### `src/store/useBuilderStore.test.ts` (new, AC1)
- Initial `appearance` is `null`.
- `chooseKrathong({ part: "base", value: "toy_bread_01" })` from `null` → returns ok. `appearance` equals
  `{ ...DEFAULT_KRATHONG_APPEARANCE, base: "toy_bread_01" }` and passes `parseKrathongAppearance`.
- Choosing the default value from `null` (`base: "banana_trunk_01"`) → returns ok and `appearance` stays `null`.
- Choosing the same value twice → after the second call, `getState().appearance` is the same reference (`toBe`).
- A base choice then a candle choice accumulate. Both fields are set.
- An invalid cast choice → `ok: false`, and the `getState()` reference is unchanged.
- Flower ALL `"orchid"` → every socket `"orchid"`. Then ALL `null` → `flowers` `[]`.
- Other stores are unchanged (`useUIStore.getState()` and `useDeviceStore.getState()` keep the same reference).

### `src/store/stores.test.ts` (modify one assertion only)
Replace `expect(useBuilderStore.getState()).toEqual({ appearance: null });` with:
```ts
const builder = useBuilderStore.getState();
expect(builder.appearance).toBeNull();
expect(Object.keys(builder).sort()).toEqual(["appearance", "chooseKrathong"]);
expect(typeof builder.chooseKrathong).toBe("function");
```
This is as strict as before: the exact key set is still pinned. Do not change anything else in the file.

### `src/components/ui/CustomizerPanel.test.tsx` (new, AC1)
Render helper: `render(<CustomizerPanel eventId="loy_krathong" onDone={onDone} viewControlRef={ref} />)` with
`ref = { current: { rotate: vi.fn(), zoom: vi.fn() } }`. Match names with `{ exact: true }`.
1. Region "แต่งกระทง" exists and its class list contains `fixed` and `bottom-0`. The tablist "ส่วนประกอบกระทง" has 4 tabs
   whose names, in order, are `CUSTOMIZER_TABS.map((t) => t.label)`. "ฐาน" has `aria-selected="true"` and the tabpanel's
   `aria-labelledby` equals that tab's id.
2. Base tab: the buttons in group "ฐานกระทง" are named `KRATHONG_BASE_IDS.map((id) => KRATHONG_BASE_LABELS[id])`. "หยวกกล้วย"
   has `aria-pressed="true"` and the others `"false"`. Click "ขนมปัง" → `useBuilderStore.getState().appearance?.base === "toy_bread_01"`,
   "ขนมปัง" is pressed and "หยวกกล้วย" is not.
3. Leaves tab (click tab "ใบตอง"): it has 2 fold buttons and 3 colour buttons. Click "พับมน" → `lotusFold === "style_02"`. Click "เขียวเข้ม" → `leafColor === "#3F6B4A"`.
4. Flowers tab: the buttons are `[...FLOWER_KINDS labels, "ไม่ใส่"]`, and "ดาวเรือง" is pressed by default. Click "กล้วยไม้" →
   every one of the `RIM_SOCKET_COUNT` flowers is `"orchid"` and "กล้วยไม้" is pressed. Click "ไม่ใส่" → `flowers` equals `[]` and
   "ไม่ใส่" is pressed. Then `act(() => useBuilderStore.setState({ appearance: { ...DEFAULT_KRATHONG_APPEARANCE, flowers: ["orchid"] } }))`
   → none of the 4 buttons is pressed (MIXED).
5. Candle tab: it has 3 buttons. Click "ขาวนวล" → `candleColor === "#FFF1D6"`.
6. No-op: with `appearance === null`, clicking "หยวกกล้วย" (the default) leaves `appearance` `null`. After step 2, clicking
   "ขนมปัง" again leaves the same reference (`toBe`).
7. After every click above, `parseKrathongAppearance(useBuilderStore.getState().appearance ?? DEFAULT_KRATHONG_APPEARANCE).ok` is true.
8. View buttons:
   - "หมุนซ้าย" → `rotate` called with `-1`; "หมุนขวา" → `1`; "ซูมเข้า" → `zoom(1)`; "ซูมออก" → `zoom(-1)`. Each is called once
     per click.
   - The hint "ลากเพื่อหมุนกระทง ใช้สองนิ้วเพื่อซูม" is shown.
   - `ref.current = null`, then click "หมุนขวา" → does not throw.
9. `viewControlRef={null}` → `queryByRole("group", { name: "มุมมอง" })` is null, none of the 4 view buttons exist, the hint
   is absent, and the tabs and "ถัดไป" still exist.
10. "ถัดไป" → `onDone` is called once. `getAllByRole("button", { name: /ถัดไป/ })` has length 1.
11. `container.querySelector(".touch-none")` is null, `queryByRole("note")` is null, and every `button` element has
    `type="button"` and a class list containing `min-h-11` and `min-w-11`.
12. `eventId="christmas"` → `queryByRole("tablist")` is null and "ถัดไป" exists.

### `src/components/ui/CustomizerPanel.boundary.test.ts` (first line `// @vitest-environment node`)
- Read the text of `src/components/ui/CustomizerPanel.tsx`, `src/store/useBuilderStore.ts`,
  `src/config/customizer.config.ts` and `src/core/customization/krathongChoices.ts`.
- Assert that none matches
  `/from\s+["'](three|@react-three\/[^"']+|@react-spring\/[^"']+|@\/components\/canvas3d[^"']*|@\/components\/models\/[^"']+)["']/`.
- A self-check proves the regex matches the sample `import { animated } from "@react-spring/three"`.

### `src/components/canvas3d/index.test.tsx` (modify; keep every existing case)
Start from the file as MFW-27 left it, with its selectors, the stub R3F mock and the MFW-19 builder-appearance case.
Additions:
- Add `bounceStarts: [] as { immediate: boolean; from?: { scale: number }; to: { scale: number } }[]` to the
  `vi.hoisted` object and reset it in `beforeEach`.
- Add a mock that wraps the real controller, like the camera one:
  ```ts
  vi.mock("@/core/customization/partChangeBounce", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/core/customization/partChangeBounce")>();
    return {
      ...actual,
      createPartChangeBounce: (api: Parameters<typeof actual.createPartChangeBounce>[0], reducedMotion: boolean) =>
        actual.createPartChangeBounce({ start: (o) => { r3f.bounceStarts.push(o); api.start(o); } }, reducedMotion),
    };
  });
  ```
- Helpers:
  - ``krathongTarget = (c) => c.querySelector(`[name="${SCENE_OBJECT_NAMES.krathong}"]`)!`` (import
    `SCENE_OBJECT_NAMES` from `./sceneObjectNames`, ASSUMED INTERFACE from MFW-27);
  - `yaw = (c) => Number(krathongTarget(c).getAttribute("rotation")!.split(",")[1])`. The stub DOM renders the
    `rotation` array as a comma-joined attribute.

New cases:
1. **"view handle rotates like a drag and zooms through the pinch clamp"**:
   - Setup: `setQualityTier("HIGH")`, `const ref = createRef<CustomizeViewControl>()`,
     `render(<SceneViewport mode="CUSTOMIZE" viewControlRef={ref} />)`.
   - `act(() => ref.current!.rotate(1))` → `yaw ≈ CUSTOMIZE_ROTATE_STEP_RADIANS`.
   - Then a 30 px drag (pointerDown at x 10, pointerMove to x 40, pointerUp) → `yaw ≈ CUSTOMIZE_ROTATE_STEP_RADIANS + 30 * ROTATION_RADIANS_PER_PIXEL`.
   - `act(() => ref.current!.rotate(-1))` → `yaw ≈ 30 * ROTATION_RADIANS_PER_PIXEL`.
   - `act(() => ref.current!.zoom(1))` → `r3f.camera!.zoom ≈ TOY_SCENE_CAMERA.zoom * CUSTOMIZE_ZOOM_STEP_SCALE`.
   - Five more `zoom(1)` → `≈ TOY_SCENE_CAMERA.zoom * PINCH_ZOOM_MAX`. Ten `zoom(-1)` → `≈ TOY_SCENE_CAMERA.zoom * PINCH_ZOOM_MIN`.
   - Every recorded camera prop is still `TOY_SCENE_CANVAS_CAMERA`.
2. **"pinch and zoom buttons share one zoom factor"**: pinch ×1.5 (copy the existing pinch gesture), then
   `zoom(1)` → `≈ TOY_SCENE_CAMERA.zoom * Math.min(PINCH_ZOOM_MAX, 1.5 * CUSTOMIZE_ZOOM_STEP_SCALE)`.
3. **"view handle does nothing outside CUSTOMIZE"**: `it.each(["RITUAL_RELEASE", "WORLD_EXPLORE"])`.
   `rotate(1)` and `zoom(1)` → `yaw === 0` and `r3f.camera!.zoom === TOY_SCENE_CAMERA.zoom`.
4. **"bounce group wraps the krathong model"**: inside `krathongTarget(c)`, the selector
   `[name="part-change-bounce"] [name="krathong-model"]` exists. The krathong target's `pointLight` is **not** inside
   `[name="part-change-bounce"]`.
5. **"bounces on an appearance change, not on mount or on a no-op"**:
   - HIGH, CUSTOMIZE → `r3f.bounceStarts` has length 0.
   - `act(() => useBuilderStore.getState().chooseKrathong({ part: "base", value: "toy_bread_01" }))` → length 1. The last
     entry has `immediate === false`, `from.scale === PART_CHANGE_BOUNCE.fromScale` and `to.scale === PART_CHANGE_BOUNCE.restScale`.
   - The same choice again → length still 1.
   - A colour choice (`candleColor "#FF9F6B"`) → length 2.
6. **"reduced motion: the part change does not animate"**:
   - `setReducedMotion(true)` before render. Choose a base → the last start `toStrictEqual({ to: { scale: PART_CHANGE_BOUNCE.restScale }, immediate: true })`.
   - No entry in `bounceStarts` has `immediate: false`.
   - Then `act(() => setReducedMotion(false))` and choose another base → the last start has `immediate: false`.

### `src/components/ui/FlowRoot.test.tsx` (modify; keep existing cases)
- Extend the `@/components/canvas3d` mock so the fake `SceneViewport` also takes `viewControlRef`. It calls
  `React.useImperativeHandle(viewControlRef, () => ({ rotate: viewSpies.rotate, zoom: viewSpies.zoom }))`, with
  `viewSpies = vi.hoisted(() => ({ rotate: vi.fn(), zoom: vi.fn() }))`. Clear the spies and reset `useBuilderStore` in
  `beforeEach`.
- New cases:
  1. **"CUSTOMIZE_OBJECT shows the customizer panel only in that step"**: at landing, region "แต่งกระทง" is absent.
     Click Loy Krathong → present. Click "ถัดไป" → absent (WRITE_WISH).
  2. **"3D tier: the bar's view buttons drive the scene"**: `setQualityTier("HIGH")`. Click Loy Krathong and
     `await screen.findByTestId("scene-viewport")`. Click "หมุนขวา" → `viewSpies.rotate` called with `1`. Click "ซูมออก" →
     `viewSpies.zoom` called with `-1`.
  3. **"FALLBACK_2D and unprofiled: bar without view buttons"**: unprofiled → click Loy Krathong → the region is present and
     `queryByRole("button", { name: "ซูมเข้า" })` is null. Then `act(() => setQualityTier("FALLBACK_2D"))` → still null and
     the region is still present.
- The existing "clicks through all 5 states" case passes unchanged: "ถัดไป" in CUSTOMIZE is now the panel's button.

### `tests/e2e/customizer.spec.ts` (new, AC3 + AC1 smoke)
```ts
import { expect, test, type Locator, type Page } from "@playwright/test";

/** Backlog 4.2 AC3 width; 640 px is a common small Android height (lead decision). */
const SMALL_PHONE = { width: 360, height: 640 } as const;
/** Duplicated literal of MIN_TOUCH_TARGET_PX in src/config/customizer.config.ts (do not import src/ into Playwright). */
const MIN_TOUCH_TARGET_PX = 44;
const PANEL = "แต่งกระทง";
const TABS = ["ฐาน", "ใบตอง", "ดอกไม้", "เทียน"];
const VIEW_BUTTONS = ["หมุนซ้าย", "หมุนขวา", "ซูมเข้า", "ซูมออก"];
const VIEWPORT = '[aria-label="Toy-like night river preview"]';

test.use({ viewport: SMALL_PHONE, hasTouch: true });
```
Helpers:
- `expectNoHorizontalOverflow(page)`: `page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])`
  → `scrollWidth <= clientWidth`.
- `expectTargetsFit(panel: Locator)`:
  - for every element of `[...await panel.getByRole("tab").all(), ...await panel.getByRole("button").all()]`, take
    `box = await el.boundingBox()`;
  - expect `box.x >= 0` and `box.x + box.width <= SMALL_PHONE.width + 0.5`;
  - expect `Math.round(box.width) >= MIN_TOUCH_TARGET_PX` and `Math.round(box.height) >= MIN_TOUCH_TARGET_PX`.
- Collect `page.on("pageerror", (e) => errors.push(e))` in each test and assert `errors` is `[]` at the end.

Test 1, **"3D tier at 360 px: bottom bar picks parts and colours; rotate and zoom work"**:
1. Copy the `addInitScript` from `scene-gating.spec.ts` that sets `deviceMemory` and `hardwareConcurrency` to 8.
2. `goto("/")`, then wait until the root has `data-quality-tier="HIGH"`.
3. Tap "Loy Krathong" (`getByRole("button", { name: /Loy Krathong/ }).tap()`).
4. Wait for `canvas` count 1, then `window.scrollTo(0, 0)`.
5. `panel = page.getByRole("region", { name: PANEL })` is visible. Its box has `Math.round(y + height) === SMALL_PHONE.height`,
   `x === 0` and `Math.round(width) === SMALL_PHONE.width`.
6. The viewport box bottom is `<=` the panel box top.
7. `expectNoHorizontalOverflow`.
8. For each tab in `TABS`: tap it, expect `aria-selected="true"`, then `expectTargetsFit(panel)` and `expectNoHorizontalOverflow`.
9. Picks:
   - tab "ฐาน" → tap "ขนมปัง" (exact) → `aria-pressed="true"`;
   - tab "ใบตอง" → tap "เขียวเข้ม" → pressed;
   - tab "ดอกไม้" → tap "กล้วยไม้" → pressed and "ดาวเรือง" not pressed.
10. Tap each of `VIEW_BUTTONS` once. `canvas` count is still 1.
11. Tap "ถัดไป" → `data-flow-state="WRITE_WISH"` and the panel count is 0.

Test 2, **"FALLBACK_2D at 360 px: same bar, no view buttons, no canvas"**:
1. Copy the WebGL-null `addInitScript` from `scene-gating.spec.ts`.
2. Wait for `FALLBACK_2D`, then tap Loy Krathong.
3. The panel is visible and at the bottom (same check as test 1).
4. Each of `VIEW_BUTTONS` has count 0. `canvas` and `.touch-none` have count 0.
5. For each tab: tap, `expectTargetsFit`, `expectNoHorizontalOverflow`.
6. Tab "เทียน" → tap "ส้มอ่อน" → pressed.
7. Tap "ถัดไป" → `WRITE_WISH`.

These existing e2e specs must pass unchanged: `flow.spec.ts`, `scene-gating.spec.ts`, `smoke.spec.ts` and
`device-profiler.spec.ts`. In particular, `flow.spec` counts 0 buttons in SHARED_WORLD_EXPLORE and `scene-gating`
counts 0 `.touch-none` elements on FALLBACK_2D.

Invariant notes for the reviewer:
- A: the appearance holds only catalogue ids and colours. It is never persisted or sent in this card.
- B: the panel is DOM and edits the one builder appearance that both the 3D model and the later 2D customizer (MFW-33)
  read.
- C/D/G: no wish text, token or API.
- E: one spring, no pooled effects, nothing allocated per frame, no new geometry or material.
- F: the reduced-motion branch is tested in `partChangeBounce.test.ts` and `index.test.tsx`. On FALLBACK_2D no canvas
  is created (`customizer.spec.ts` test 2).

## Do NOT

- Do not build:
  - the wish modal (MFW-21);
  - release, persistence or the create API call (MFW-23 / MFW-45);
  - the 2D customizer preview (MFW-33);
  - per-socket flower placement UI or socket highlights in 3D (Open question 1);
  - a reset-view button, camera orbit or fly-to in CUSTOMIZE;
  - instancing (MFW-34);
  - MFW-27's scene/config cleanup;
  - any Christmas or other-festival parts.
- Do not change pan (`PAN_RIVER`, `worldRotation`, `worldOffset`, the `worldView` group), `createInputSeparator`,
  `src/core/camera`, or anything MFW-27 owns: lights, `RiverEnvironment`, the candle `pointLight`, the highlight ring,
  the lamp selection, the `Canvas` `key`/`gl`/`onCreated`, the RITUAL chip and its clamps, and the files
  `src/config/scene.config.ts`, `src/components/canvas3d/sceneObjectNames.ts`, `tests/unit/scene-art-constants.test.ts`.
  Do not add hex colours or decimal literals under `src/components/canvas3d/**` or `src/components/models/**`.
- Do not keep the zoom factor in React state or in a store. Do not disable the zoom buttons at the clamp (D2). Do not
  tween the step rotation.
- Do not persist the appearance (no zustand `persist`, no `localStorage`) and do not send it anywhere. Never put a
  position, rotation or `Vector3` into `appearance` (invariant A).
- Do not import `three`, `@react-three/*`, `@react-spring/*`, `@/components/canvas3d` or `@/components/models/**` from
  `CustomizerPanel.tsx`, `FlowRoot.tsx` (except the existing `lazy(() => import("@/components/canvas3d"))`), the store
  or `src/core/customization/*`.
- In the panel: no `touch-none` class, no `role="note"`, and no second button whose name contains "ถัดไป".
- No `useFrame` and no per-frame allocation in this card's code. Do not create effect objects per tap.
- Do not add dependencies. Do not change `package.json`, the lockfile, `tsconfig.json`, `eslint.config.mjs`,
  `vitest.config.mts`, `vitest.setup.ts`, `playwright.config.ts` or `src/app/layout.tsx`.
- Do not touch `.claude/**`, `scripts/**`, `.github/**`, `CLAUDE.md`, `AGENTS.md`, `docs/spec/**`,
  `docs/backlog*.json`, `docs/plans/**` or `docs/prompts/**`.
- Do not weaken or delete existing tests. The only edits to existing tests are the `stores.test.ts` assertion and the
  additions listed above.

## Definition of done

- Run each command separately; all must be green: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`,
  `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell pnpm e2e`. The browser path is for this cloud container;
  locally run plain `pnpm e2e`.
- Every AC above has its listed tests.
- Delete `playwright-report/` and `test-results/` before committing. Never commit `.next/` or `*.tsbuildinfo`.
- Cut branch `feat/MFW-20-mobile-first-customizer-ui-customizerpan` from the latest `main` **after MFW-27 is merged**
  (MFW-19 and MFW-11 already are). If MFW-27 is not merged, stop and say so.
- Use conventional commit(s) with the key in the subject, e.g. `feat(ui): mobile-first customizer panel MFW-20`.
- Open a ready PR against `main` with the commit subject as its English title. The body must:
  - link MFW-20;
  - list each AC with the file/test that proves it;
  - list Decisions D1–D10;
  - list every PLACEHOLDER constant (Step 1: fold/colour labels and `PART_CHANGE_BOUNCE`; Step 2: the two step
    constants);
  - list the Open questions below;
  - list any deviation from the ASSUMED INTERFACE (from MFW-27 plan);
  - include the test plan with the five command results.
- Leave the PR open for review (reviewer + qa + `r3f-perf-reviewer`) and do not merge. This is not a privacy/db card.

## Interfaces this card provides

- `@/core/interaction`:
  - `ViewStepDirection` (`-1 | 1`);
  - `CustomizeViewControl { rotate(direction); zoom(direction) }`;
  - `getRotationAfterDrag(current, deltaX)`, `getRotationAfterStep(current, direction)` and
    `getZoomFactorAfterStep(current, direction)`.
- `@/core/customization` (barrel, pure, server-safe):
  - `ALL_RIM_SOCKETS`, `KrathongFlowerTarget`, `KrathongChoice`, `KrathongChoiceResult`, `FlowerSelection`;
  - `applyKrathongChoice(appearance, choice): KrathongChoiceResult`;
  - `krathongAppearanceEquals(a, b): boolean`;
  - `getFlowerSelection(appearance, target): FlowerSelection`.
- `@/core/customization/partChangeBounce` (by path): `createPartChangeBounce(api, reducedMotion): { play(); settle() }`,
  `PartChangeBounceApi`, `PartChangeBounceStart`. MFW-29 (tap a krathong in the river, "เด้งตอบสนองเบาๆ") can reuse it.
- `src/components/canvas3d/PartChangeBounce.tsx`: `PartChangeBounce({ changeKey, reducedMotion, children })`.
- `SceneViewport` has a new optional prop `viewControlRef?: Ref<CustomizeViewControl>` (active in CUSTOMIZE only).
  The bounce group is `name="part-change-bounce"`. It sits inside MFW-27's `SCENE_OBJECT_NAMES.krathong` group and
  wraps `krathong-model`.
- `useBuilderStore`:
  - state `appearance: EventAppearance | null` (null means `DEFAULT_KRATHONG_APPEARANCE`);
  - action `chooseKrathong(choice): KrathongChoiceResult`.
  - MFW-21 and MFW-23 read `useBuilderStore.getState().appearance ?? DEFAULT_KRATHONG_APPEARANCE` and send
    `serializeKrathongAppearance(...)` from it.
- `src/components/ui/CustomizerPanel.tsx`: `CustomizerPanel({ eventId, onDone, viewControlRef })`. MFW-33 keeps it as
  the FALLBACK_2D parts bar and adds a 2D preview above it.
- `src/config/customizer.config.ts`: `CUSTOMIZER_TABS`, `CUSTOMIZER_TAB_IDS`, the `*_LABELS` maps, `NO_FLOWER_LABEL`,
  `CUSTOMIZER_COPY`, `PART_CHANGE_BOUNCE`, `MIN_TOUCH_TARGET_PX`, `CUSTOMIZER_MIN_WIDTH_PX`.
- `src/config/interaction.config.ts`: `CUSTOMIZE_ROTATE_STEP_RADIANS`, `CUSTOMIZE_ZOOM_STEP_SCALE`.

## Open questions

These are owner decisions only. The plan uses the PLACEHOLDER shown, so the card can be built now; the owner confirms
or replaces it.

1. **How are flowers placed?** Planned: one flower kind fills every rim socket, and "ไม่ใส่" empties them all (D3).
   Options:
   - (a) keep it;
   - (b) per-socket choice, which needs a socket highlight/tap target in 3D and in 2D (the pure op already supports one
     socket);
   - (c) preset patterns, e.g. alternating two kinds.
2. **View and bounce feel numbers**:
   - rotate step `π/4` per tap;
   - zoom step ×1.25 per tap, within the existing pinch range 0.75–1.6;
   - bounce from scale 0.9 with spring tension 300 / friction 10 (≈ 4 % overshoot, ≈ 0.8 s).
   Also: should a **colour** change bounce too? Planned: yes, every appearance change bounces. Options: confirm, give
   numbers, or bounce on part (shape) changes only.
3. **Thai labels for placeholder catalogue items**: fold styles "พับแหลม" / "พับมน"; leaf colours "เขียวใบตอง" / "เขียวอ่อน" /
   "เขียวเข้ม"; candle colours "เหลืองทอง" / "ขาวนวล" / "ส้มอ่อน". They follow MFW-19's placeholder palette, so they change if
   that palette changes (MFW-19 Open question 1).
4. **FALLBACK_2D before MFW-33**: planned, the parts bar shows on FALLBACK_2D even though there is no preview yet (D7).
   Option: hide the parts on FALLBACK_2D until the 2D customizer lands, showing only "ถัดไป".

## Decisions

- **D1 — The view buttons live in the bottom bar and reach the scene through an imperative handle
  (`CustomizeViewControl`).** The goal is "one thumb", so the buttons belong in the thumb zone rather than on the
  viewport at the top. A handle keeps `SceneViewport` the single owner of the camera zoom and the krathong yaw. It
  adds no store state and does not import the lazy 3D chunk into the landing bundle (only a type is shared, via
  `@/core/interaction`).
- **D2 — The buttons reuse the gesture paths.**
  - Rotate steps the same `objectRotation` that drag uses, which spins the krathong. "หมุนดูรอบด้าน" means turning the
    krathong to see all sides.
  - Zoom steps go through `getPinchZoomFactor` and one shared `applyZoomFactor`.
  - Steps are instant cuts, so they are reduced-motion-safe with no extra branch.
  - The zoom buttons are never disabled at the clamp, because that would need the zoom factor in React state and a
    re-render per pinch move, which MFW-44 avoided.
- **D3 — Flowers: one kind for all rim sockets.** Nothing in 3D or 2D shows a user which socket is "ช่อง 3", so
  per-socket chips would be confusing. `applyKrathongChoice` already supports a single socket, so per-socket UI can be
  added later without rework (Open question 1).
- **D4 — Every choice is re-validated with `parseKrathongAppearance`.** The builder store therefore never holds an
  appearance that the create API (MFW-45, `parseEventAppearance`) would reject, even if a caller casts a value.
- **D5 — A no-op choice keeps the same store reference.** That means no bounce, no re-render and no canvas
  invalidation when a user taps the already-selected option.
- **D6 — The bounce is a scale pop of the whole krathong, driven by appearance identity.**
  - It uses one `useSpring` and plays on any appearance change, but not on mount.
  - Under reduced motion it snaps to rest with `immediate: true`.
  - It runs the same on all 3D tiers: it animates one transform, has no per-frame allocation and needs no tier budget.
  - Scaling the parent keeps MFW-19's world-upright candle upright.
- **D7 — The panel is plain DOM and also renders on FALLBACK_2D, without view buttons.** FALLBACK_2D users can still
  customize. MFW-33's 2D preview will read the same `useBuilderStore.appearance` (invariant B).
- **D8 — Semantics: tabs use `role="tab"`, options are `aria-pressed` toggle buttons, and every target is at least
  44 px (`min-h-11 min-w-11`).** This needs no new dependency. Pressed state is testable by role, and tabs are not
  counted as "buttons" by existing tests.
- **D9 — The bar is fixed with an in-flow spacer sized by `ResizeObserver`.** This gives a true "bottom of screen" bar
  that cannot hide content. The spacer is written directly to the DOM style, so it causes no re-render. It is guarded
  for jsdom (no `ResizeObserver` there).
- **D10 — `krathongChoices.ts` is in the pure barrel; `partChangeBounce.ts` is imported by path.** Choices are domain
  logic that later cards (21/23/33) need. The bounce controller is UI animation that imports UI copy config.
  `src/core/camera` is unchanged.

## Out of scope

- WishModal (MFW-21).
- Release, persistence and the create API (MFW-23, MFW-45).
- River flow (MFW-24).
- Environment and scene-config cleanup, including the pan fix (MFW-27).
- The 2D customizer preview (MFW-33).
- Instancing and memory audit (MFW-34).
- Per-socket flower UI, a reset-view button, camera orbit in CUSTOMIZE.
- Other festivals' customizers.

## Risks

- **MFW-27 may merge with different names than its plan** (e.g. `SCENE_CAMERA_ZOOM`, `SCENE_OBJECT_NAMES.krathong`, the
  krathong target's children). Step 9 is written against component, prop and case names, so a dev can re-target it.
  Any difference goes in the PR body. If MFW-27 also adds `useImperativeHandle` or changes the `PINCH_ZOOM` case
  shape, keep its behaviour and route both through `applyZoomFactor`.
- **The canvas test file is shared with MFW-27's new cases** (lamp instancing, antialias key). Add this card's cases
  without editing theirs.
- **`animated.group` under the stub R3F context in `index.test.tsx`.** react-spring renders the host `group` element.
  With the mocked `applyProps` (a no-op returning `undefined`) it does not force updates, so the DOM keeps `scale="1"`.
  If the stub ever breaks it, add `useSpring`/`animated` handling to the test mock. Do not remove `PartChangeBounce`
  from the scene.
- **React Compiler lint (`eslint-plugin-react-hooks` 7).** Keep the `cameraRef.current` access shape from Step 9.4, read
  refs only in effects and handlers, and never set state in an effect body. The `ResizeObserver` callback writes DOM
  style, not state.
- **The landing bundle grows by the pure customization barrel.** It is plain data and parsers, with no three, and
  `scene-gating.spec.ts` still proves no `WebGLRenderer` chunk on landing. The boundary test guards the imports.
- **Bar height on very short screens** (landscape phones below ≈ 560 px tall): the bar can cover part of the viewport.
  The spacer still lets the page scroll, so the scene can be seen. The e2e test pins 360 × 640 only.
- **Placeholder palette churn from MFW-19.** The label maps are `Record<…>` over the palette types, so any palette change
  fails `pnpm typecheck` until the labels are updated, which is intended.
