# MFW-28 [6.2] Interactive scene gimmicks & object pool — implementation spec

> Hand-off spec for one card. It is the source of truth for the implementer and the reviewer. If this file and
> `docs/backlog.json` / `docs/spec/open-questions.md` disagree, those files win; say so in the PR.
> Branch: `feat/MFW-28-interactive-scene-gimmicks-object-pool` · Jira: MFW-28 · Epic: MFW-26 (Loop 6)
> Labels: `loy-krathong`, `interaction`, `perf` · Extra reviewers: `r3f-perf-reviewer` (the diff touches `src/components/canvas3d/**`,
> `src/components/models/**`, `src/core/effects/**`) **and** `privacy-auditor` (the diff touches `src/services/**`, shows wish text and
> sends reports). It is not labelled `privacy`/`db`/`migration`, so it is **not** an owner-merge card (`docs/prompts/index.json`: `ownerMerge: false`).

## 1. Summary (Goal)

Backlog 6.2 goal: "Small delights on tap without frame drops." Spec §6.6 Task 6.2 lists three gimmicks: "แตะผิวน้ำ: เกิดวงน้ำกระเพื่อม
(Water Ripple) โดยจำกัดจำนวน Ripple ที่แสดงพร้อมกันด้วย Object Pool", "แตะโคมไฟ/ไฟริมฝั่ง: ไฟสว่างขึ้นหรือกะพริบอบอุ่นพร้อมแอนิเมชันเด้งเล็กน้อย"
and "แตะกระทงในแม่น้ำ: กระทงเด้งตอบสนองเบาๆ และเปิดการ์ดแสดงรูปลักษณ์พร้อมคำอธิษฐานสาธารณะแบบ Anonymous". This card builds a small,
framework-free `ObjectPoolManager` in `src/core/effects/` with per-tier caps from `performance.config.ts`. It adds one pooled
`InstancedMesh` for ripples and one for lamp glows (one draw call each, nothing allocated per tap), a closed-form tap bounce for
river krathongs, and an anonymous `InspectPopup` (`src/components/ui/`) that shows the tapped krathong's appearance and public wish
and has a Report button that calls `POST /api/reports` (MFW-13). Every gimmick runs only in `WORLD_EXPLORE` (flow state
`SHARED_WORLD_EXPLORE`). Under reduced motion, motion is replaced by fades or turned off.

## 2. Prerequisites

Merged on `main` (a6ce8f3). Read the real code with `git show origin/main:<path>` before you start:

| Card | What this card uses |
|---|---|
| MFW-16 [3.2] | `src/core/interaction` (`InteractionMode`, `getInteractionMode`), `DRAG_START_DISTANCE_PX` in `src/config/interaction.config.ts` |
| MFW-17 [3.3] | `SceneViewport` selection/flight: `onTargetSelected`, `onLampSelected`, `CameraFlightController`, `TargetHighlight` (unchanged) |
| MFW-44 [3.4] | Mode gate: only `WORLD_EXPLORE` selects. Lazy 3D chunk: three must stay out of the landing JS |
| MFW-27 [6.1] | `RiverEnvironment` (`onWaterSelected`, `onLampSelected`, `lampIndexFromInstanceId`), `LOY_KRATHONG_RIVER_LAYOUT` (`.lamps`, `.waterSurfaceY`), `RIVER_ENVIRONMENT_PARTS.lampHead`, `SCENE_OBJECT_NAMES`, `createPartGeometry`, the `scene-world-view` group, the static scan `tests/unit/scene-art-constants.test.ts` |
| MFW-24 [5.2] | `RiverFlow` / `RiverFlowItem` (`src/components/canvas3d/RiverFlow.tsx`), `SceneViewport` prop `riverItems` (default `NO_RIVER_ITEMS`), `RIVER_KRATHONG_SCALE`, `KRATHONG_MODEL_FOOTPRINT_RADIUS`, `RIVER_MIN_CENTER_SPACING` (`src/config/riverFlow.config.ts`), the closed-form bobbing precedent (`src/core/world/bobbing.ts`) |
| MFW-19 / MFW-20 | `KrathongAppearance` (`src/core/customization/types.ts`), palettes in `src/config/events/loyKrathong.config.ts`, Thai labels in `src/config/customizer.config.ts` (`KRATHONG_BASE_LABELS`, `LEAF_FOLD_STYLE_LABELS`, `LEAF_COLOR_LABELS`, `FLOWER_KIND_LABELS`, `CANDLE_COLOR_LABELS`, `NO_FLOWER_LABEL`, `CUSTOMIZER_COPY`, `MIN_TOUCH_TARGET_PX`) |
| MFW-9 [1.3] | `useDeviceStore` (`qualityTier`, `reducedMotion`), `RenderTier`, `TIER_BUDGETS` (do not change) |
| MFW-12 [2.2] | `PublicCreation.publicWishText` (public field); `src/services/api/index.ts` (client-safe barrel) |

Blocker that is **not merged yet** (backlog 6.2 is `blockedBy` 2.3 — do not start until it is merged):

- **MFW-13 [2.3] report endpoint.** ASSUMED INTERFACE (from MFW-13 plan, `docs/plans/MFW-13.md` Steps 13–16):
  `src/services/api/reportTypes.ts` exports `REPORT_ENDPOINT_PATH = "/api/reports"`, `ReportRequestBody { creationId: string }`,
  `ReportAcceptedBody { status: "received" }`, `ReportErrorBody`. `POST /api/reports` takes `Content-Type: application/json` and body
  exactly `{"creationId":"<lowercase uuid>"}`. It answers `202 {"status":"received"}` for every well-formed report (counted or not), and
  `400/413/415/503` with `{ error }` otherwise. *Before you start:* `git show origin/main:src/services/api/reportTypes.ts`. If the file is
  missing, stop and report "MFW-13 not merged". If the names differ, use the merged names and list each difference in the PR.

Not a blocker, but it may land before or after this card:

- **MFW-25 [5.3] zones.** ASSUMED INTERFACE (from MFW-25 plan, Steps 5, 13, 18): `src/core/world/zoneRiverItems.ts`
  (`publicCreationsToRiverItems`, `ZoneRiverItem`). In `SceneViewport`, `visibleRiverItems = riverItems ?? storeRiverItems`.
  Check with `git show origin/main:src/core/world/zoneRiverItems.ts`.
  - *MFW-25 not merged:* the app has no river krathongs yet (`riverItems` defaults to empty). The inspect flow is proven by component
    tests that pass `riverItems`. Use the `riverItems` value that `SceneViewport` passes to `ToyNightScene`.
  - *MFW-25 merged first:* do Step 14b (copy `publicWishText` into `ZoneRiverItem`), and use `visibleRiverItems` everywhere this spec says
    "the river items passed to `ToyNightScene`".
- **MFW-23 [5.1]** (release ritual) will call `SceneEffectsHandle.spawnRipple` in `RITUAL_RELEASE`. **MFW-31 [7.2]** extends `InspectPopup`
  with the owner's private view. **MFW-33 [8.1]** reuses `writeRippleFrameAt`, the pools and `InspectPopup` for the 2D fallback. Each of
  them uses the interfaces in §10. Build none of their features here.

## 3. Acceptance criteria → checks

AC (verbatim, `docs/backlog.json` story 6.2):

1. **"Tap water → stylized ripple, concurrent ripples capped by ObjectPoolManager"**
   - The pool is fixed-size and pre-allocated. When it is full, `acquire` recycles the oldest entry, so the active count never exceeds
     capacity. `createState` runs only at creation: `src/core/effects/objectPool.test.ts`.
   - Pool capacities come from `EFFECT_POOL_CAPS[tier]`: `src/core/effects/objectPoolManager.test.ts`. Caps are positive integers and
     do not increase from HIGH to LOW: `src/config/performance.config.test.ts`.
   - The ripple shape over time (expanding ring, fade-out, done flag): `src/core/effects/gimmickCurves.test.ts`.
   - Rendering: one `InstancedMesh` sized to the cap. `count` equals the number of active ripples, it is invisible when idle, it has
     additive blending and a per-instance colour fade, and expired entries are released: `src/components/canvas3d/effects/effectMeshes.test.ts`.
   - `SceneEffects`: ten `spawnRipple` calls with `caps.ripple = 3` leave `activeCount("ripple") === 3`. The mesh is created once per cap
     (not per tap) and disposed on unmount and on a cap change: `src/components/canvas3d/effects/SceneEffects.test.tsx`.
   - The tap point is converted into the world-view group's space, and a click that ended a drag gives no point:
     `src/components/canvas3d/effects/tapPoint.test.ts`.
   - Scene wiring: a water tap in `WORLD_EXPLORE` spawns a ripple (`data-last-gimmick="ripple"`) and still selects water. CUSTOMIZE and
     RITUAL_RELEASE taps spawn nothing: `src/components/canvas3d/index.test.tsx`.
   - On WebGL (SwiftShader), water taps in `SHARED_WORLD_EXPLORE` record ripples on HIGH and LOW and with reduced motion. Thirteen rapid
     taps cause no page or console error: `tests/e2e/scene-gimmicks.spec.ts`.
2. **"Tap lamp → warm light up/flicker with small bounce"**
   - The glow curve (attack, hold with flicker, release), the bounce, and the reduced-motion branch (steady, no flicker, no bounce):
     `gimmickCurves.test.ts`. The flicker stays below 3 Hz (WCAG 2.3.1): `src/config/gimmicks.config.test.ts`.
   - The glow mesh sits at the tapped lamp head, scaled by `lamp.scale × shellScale × bounce`, with a warm additive colour × intensity.
     A tap on a lamp that is already lit restarts that lamp's entry instead of adding a second one. An unknown lamp index is ignored:
     `effectMeshes.test.ts`, `SceneEffects.test.tsx`.
   - No light source is added (the candle stays the only point light, MFW-27): the existing `index.test.tsx` case
     "the candle is the only point light" stays green.
   - Scene wiring: a lamp tap in `WORLD_EXPLORE` gives `data-last-gimmick="lamp-glow"` and still selects the lamp and flies the camera:
     `index.test.tsx`.
3. **"Tap a krathong → gentle bounce + InspectPopup with appearance and anonymous public wish + Report button"**
   - Bounce: a tap on a river krathong's hit proxy calls `onItemTapped(id)` and scales that krathong's bounce group by `writeBounceAt`
     over time, back to exactly 1. Under reduced motion the scale stays 1 and the tap still inspects. Without `onItemTapped`
     there are no hit proxies: `src/components/canvas3d/RiverFlow.test.tsx`.
   - The hit proxy is invisible, created once, disposed on unmount, at least the model footprint, and never overlaps a neighbour at the
     minimum spacing: `RiverFlow.test.tsx`, `gimmicks.config.test.ts`.
   - Popup content: Thai appearance rows (base, fold, leaf colour, flowers, candle colour), the public wish as plain text (HTML is not
     interpreted), a "no public wish" line when there is none, the anonymous note, and no id, name or profile:
     `src/components/ui/InspectPopup.test.tsx`, `src/components/ui/krathongAppearanceSummary.test.ts`.
   - Report: confirm → POST → received / failed / retry. The body is exactly `{ creationId }`, with no token, no `Authorization` header and
     no id in the URL. 202 means received, anything else means failed, and a timeout means failed. Repeat taps are de-duplicated in
     memory per session: `src/services/api/reportClient.test.ts`, `InspectPopup.test.tsx`.
   - Invariant C: `pickInspectedCreation` copies only `id`, `appearance` and `publicWishText`, so extra runtime keys never reach the
     popup: `src/components/ui/inspectedCreation.test.ts`.
   - Scene wiring: in `WORLD_EXPLORE` a river-krathong tap opens the dialog with that item's wish. Close, a mode change, or the item
     leaving the river items closes it. CUSTOMIZE/RITUAL_RELEASE render no hit proxies: `index.test.tsx`.
   - Boundary: `InspectPopup` and its helpers import no 3D module, no `@/services/auth`, and use no `dangerouslySetInnerHTML`:
     `tests/unit/inspect-boundary.test.ts`.

Invariant checks that this card must keep or add:

| Invariant | Check |
|---|---|
| A | Tap points and ripple positions are render-time values in memory only. Nothing is persisted or sent except the report's `creationId`. `tests/unit/no-raw-xyz-persistence.test.ts` stays green (no three in `src/services`) |
| C | `pickInspectedCreation` allowlist test. The report body has one key. The section's `data-*` attributes never hold wish text or ids (`index.test.tsx`) |
| E | Fixed per-tier caps, pre-allocated pool entries, one mesh per effect kind created per cap and disposed on unmount (spy tests). No geometry, material or mesh per tap or per frame. The hit proxy geometry is shared by all items |
| F | Reduced-motion branches tested in `gimmickCurves.test.ts`, `effectMeshes.test.ts`, `RiverFlow.test.tsx`, and e2e with `reducedMotion: "reduce"`. The popup has no animation. FALLBACK_2D renders no canvas and no popup (existing `index.test.tsx` and `scene-gating.spec.ts` cases stay green) |
| G | Reports go to the server route, which owns the moderation state. The popup shows only `publicWishText`, which already passed the server guard (MFW-13/45) |

## 4. Owner decisions that apply

Quoted from `docs/spec/open-questions.md` and CLAUDE.md. Do not reopen them.

- Q4 (MFW-25): "80 items per zone". A zone has at most 80 river krathongs, so the hit-proxy count is ≤ 80.
- Q5 (MFW-9): "budgets DPR cap 2/1.5/1, shadows on/off/off, max texture 2048/1024/512 px". Do not change `TIER_BUDGETS`. The new
  `EFFECT_POOL_CAPS` sits next to it and the owner may tune it (§11 Q3).
- Q11 (MFW-15): "Animation library: GSAP or `@react-spring/three` … @react-spring/three". This card adds no animation library. The
  gimmicks use closed-form time curves, like MFW-24's bobbing (D3).
- Q3 (MFW-12) and Q13 (MFW-13): reports and auto-hide are server-side (threshold 3). This card only sends the report.
- Q1 (MFW-12): the raw owner token goes only to ownership endpoints. The report endpoint is not one, so the popup never reads or sends
  the token.
- Q23 (MFW-24): "krathongs keep drifting; only the bobbing stops" under reduced motion. The tap bounce stops too (it is motion). The drift
  is unchanged.
- Q16 (MFW-36): build engine pieces generically. The pool, curves, `SceneEffects` and `InspectPopup` contract are festival-agnostic. Only
  the wiring in `canvas3d/index.tsx` and the appearance summary are Loy Krathong specific.
- Launch plan (CLAUDE.md): Phase 1 is Loy Krathong only. Build no Christmas or other-festival gimmicks (no fireworks or confetti pools).

No row of `open-questions.md` names MFW-28 in "Decide in", so no row needs an update.

## 5. Files

| Path | New/modify | Purpose |
|---|---|---|
| `src/config/performance.config.ts` | modify | `EFFECT_KINDS`, `EffectKind`, `EffectPoolCaps`, `EFFECT_POOL_CAPS` (append; owner numbers untouched) |
| `src/config/performance.config.test.ts` | modify | One new case for `EFFECT_POOL_CAPS` |
| `src/config/gimmicks.config.ts` + `.test.ts` | new | Ripple/glow look and timing, `GIMMICK_BOUNCE`, `RIVER_KRATHONG_TAP_RADIUS`, WCAG flash constant |
| `src/config/inspect.config.ts` | new | `INSPECT_POPUP_COPY` (Thai), `REPORT_REQUEST_TIMEOUT_MS` |
| `src/core/effects/objectPool.ts` + `.test.ts` | new | Generic pre-allocated pool with recycle-oldest |
| `src/core/effects/objectPoolManager.ts` + `.test.ts` | new | `createObjectPoolManager(caps)` → ripple and glow pools |
| `src/core/effects/gimmickCurves.ts` + `.test.ts` | new | `writeRippleFrameAt`, `writeLampGlowFrameAt`, `writeBounceAt` (pure, allocation-free) |
| `src/core/effects/index.ts` | modify | Barrel (keep the comment line) |
| `src/components/canvas3d/sceneObjectNames.ts` | modify | Add `ripples`, `lampGlows` |
| `src/components/canvas3d/effects/tapPoint.ts` + `.test.ts` | new | `isTapClick`, `tapPointInParentSpace` |
| `src/components/canvas3d/effects/effectMeshes.ts` + `.test.ts` | new | `createRippleMesh`, `createLampGlowMesh`, `writeRippleInstances`, `writeLampGlowInstances`, `disposeEffectMesh` |
| `src/components/canvas3d/effects/riverTapProxy.ts` + `.test.ts` | new | Shared invisible hit-proxy geometry/material |
| `src/components/canvas3d/effects/SceneEffects.tsx` + `.test.tsx` | new | R3F layer that owns the pools and meshes; imperative `SceneEffectsHandle` |
| `src/components/canvas3d/RiverFlow.tsx` | modify | `RiverFlowItem.publicWishText?`, `onItemTapped?`, bounce group, hit proxies |
| `src/components/canvas3d/RiverFlow.test.tsx` | modify | Add a `scale` stub and new cases. Existing cases unchanged |
| `src/components/models/loyKrathong/RiverEnvironment.tsx` | modify | `onWaterSelected(tap: WorldXZ \| null)` |
| `src/components/models/loyKrathong/RiverEnvironment.test.tsx` | modify | One new assertion line |
| `src/components/canvas3d/index.tsx` | modify | Wire effects, inspect state, popup and data attributes |
| `src/components/canvas3d/index.test.tsx` | modify | One `vi.mock` and new cases. Existing cases unchanged |
| `src/components/ui/inspectedCreation.ts` + `.test.ts` | new | `InspectedCreation`, `pickInspectedCreation`, `findInspectedCreation` |
| `src/components/ui/krathongAppearanceSummary.ts` + `.test.ts` | new | `describeKrathongAppearance` → Thai rows |
| `src/components/ui/InspectPopup.tsx` + `.test.tsx` | new | The card (spec §3 `InspectPopup.tsx`) |
| `src/services/api/reportClient.ts` + `.test.ts` | new | `createReportSession`, `getReportSession`, `ReportSubmitOutcome` |
| `src/services/api/index.ts` | modify | Export the report client (client-safe) |
| `tests/unit/inspect-boundary.test.ts` | new | Static import/HTML boundary scan |
| `tests/e2e/scene-gimmicks.spec.ts` | new | Water-tap ripples on WebGL, no errors |
| `src/core/world/zoneRiverItems.ts` + `.test.ts` | modify **only if MFW-25 merged first** (Step 14b) | Copy `publicWishText` |

## 6. Implementation steps (Plan)

All numbers live in config files as named constants. "PLACEHOLDER (spec silent)" means the spec gives no value. Keep the value exactly
as given and list it in the PR under "Decisions". The owner may tune it later (§11 Q3).

**Static-scan trap (MFW-27):** non-test files under `src/components/canvas3d/**` and `src/components/models/**` must contain **no hex colour,
no decimal literal (`0.5`, also in comments) and no texture API**. Write `Math.PI / 2`, never `1.5707…`. Write card ids as `MFW-28`, never
`6.2`. All looks come from `src/config/gimmicks.config.ts`.

**Privacy-scan traps:** in non-test `src/**` files, never write the snake-case private column names (the boundary test greps for them).
In `src/services/api/**` there must be no `console.` and no `"*"` string literal (the star-select scan matches any `"*"`).

### Step 1 — `src/config/performance.config.ts` (modify: append at the end)

```ts
// Technical numbers (lead decision, MFW-28). Values PLACEHOLDER (spec silent); the owner may tune them (MFW-28 plan §11 Q3).

/** Pooled scene effects (spec §3 core/effects: "ObjectPoolManager (Ripples, Fireworks, Confetti, Glow)"). Phase 1 uses ripple + glow only. */
export const EFFECT_KINDS = ["ripple", "glow"] as const;
export type EffectKind = (typeof EFFECT_KINDS)[number];
export type EffectPoolCaps = Readonly<Record<EffectKind, number>>;

/** Max concurrent pooled effects per 3D tier (invariant E: fixed cap; a new tap recycles the oldest). PLACEHOLDER (spec silent). */
export const EFFECT_POOL_CAPS: Readonly<Record<RenderTier, EffectPoolCaps>> = Object.freeze({
  HIGH: Object.freeze({ ripple: 8, glow: 6 }),
  MEDIUM: Object.freeze({ ripple: 6, glow: 4 }),
  LOW: Object.freeze({ ripple: 3, glow: 2 }),
});
```
Do not touch anything above this block.

### Step 2 — `src/config/gimmicks.config.ts` (new)

```ts
import { SCENE_CAMERA_ZOOM } from "./camera.config";
import { MIN_TOUCH_TARGET_PX } from "./customizer.config";
import { KRATHONG_MODEL_FOOTPRINT_RADIUS, RIVER_KRATHONG_SCALE, RIVER_MIN_CENTER_SPACING } from "./riverFlow.config";

/** Scene tap gimmicks (spec §6.6 Task 6.2). Looks and timings are PLACEHOLDER (spec silent) unless marked. */

/** WCAG 2.3.1 "Three Flashes": no luminance cycle faster than this many per second. Standard, not a product number. */
export const WCAG_MAX_FLASHES_PER_SECOND = 3;
export const MS_PER_SECOND = 1_000;

/** Water ripple: a flat ring (unit outer radius, scaled to `radius`) that expands and fades. Additive colour × intensity. */
export const RIPPLE_LOOK = Object.freeze({
  color: "#cfe3ff",
  peakIntensity: 0.55,
  startRadius: 0.08, // world units
  endRadius: 0.6, // world units; also the reduced-motion radius (no expansion)
  durationMs: 900,
  ringInnerRatio: 0.82, // inner radius of the unit ring
  ringSegments: 32,
  surfaceOffsetY: 0.01, // above the water surface (no z-fighting)
});

/** Lamp light-up: an unlit additive shell over the lamp head; attack → hold (flicker) → release. No light source (MFW-27 D5). */
export const LAMP_GLOW_LOOK = Object.freeze({
  color: "#ffc46b",
  peakIntensity: 1,
  shellScale: 1.35, // × lamp head size; encloses the head
  durationMs: 1_600,
  attackMs: 120,
  releaseMs: 500,
  flickerDepth: 0.3, // intensity dips to (1 − depth) at most
  flickerPeriodAMs: 430, // two sines are ADDED (a product would create a sum frequency above 3 Hz)
  flickerPeriodBMs: 690,
});

/** "เด้งเล็กน้อย / เด้งตอบสนองเบาๆ": scale = 1 + amplitude · e^(−t/decay) · sin(2πt/period) for t < duration. Shared by lamp and krathong. */
export const GIMMICK_BOUNCE = Object.freeze({ amplitude: 0.12, periodMs: 280, decayMs: 200, durationMs: 700 });

/** Lead decision: the residual bounce at durationMs is below this, so ending at exactly 1 is not a visible snap. */
export const BOUNCE_SETTLE_EPSILON = 0.005;

/**
 * Hit-proxy radius of a river krathong, in MODEL units (inside the group scaled by RIVER_KRATHONG_SCALE). Lead decision, derived only
 * from existing constants: aim for a MIN_TOUCH_TARGET_PX-wide target at the default zoom, never smaller than the model footprint, and
 * never larger than half the no-overlap spacing (owner decision 25), so two proxies never overlap.
 */
export const RIVER_KRATHONG_TAP_RADIUS = Math.max(
  KRATHONG_MODEL_FOOTPRINT_RADIUS,
  Math.min(
    MIN_TOUCH_TARGET_PX / 2 / SCENE_CAMERA_ZOOM / RIVER_KRATHONG_SCALE,
    RIVER_MIN_CENTER_SPACING / 2 / RIVER_KRATHONG_SCALE,
  ),
);
```
With today's values `RIVER_KRATHONG_TAP_RADIUS` = max(1.3, min(1.923…, 1.43)) = 1.43 model units (0.3146 world units, about 33 px wide at zoom 52).

### Step 3 — `src/config/inspect.config.ts` (new)

```ts
/** InspectPopup copy (spec §3 "ดูคำอวยพรคนอื่นแบบ Anonymous + ปุ่ม Report"). DRAFT Thai copy, PLACEHOLDER (spec silent; MFW-28 plan §11 Q1). */
export const INSPECT_POPUP_COPY = Object.freeze({
  dialogTitle: "กระทงในสายน้ำ",
  anonymousNote: "ไม่ระบุชื่อผู้ปล่อย",
  appearanceHeading: "รูปลักษณ์",
  wishHeading: "คำอธิษฐาน",
  noPublicWish: "ไม่มีคำอธิษฐานสาธารณะ",
  close: "ปิด",
  report: "รายงาน",
  reportPrompt: "รายงานคำอธิษฐานนี้ว่าไม่เหมาะสมใช่ไหม",
  reportConfirm: "ยืนยันรายงาน",
  reportCancel: "ยกเลิก",
  reportSending: "กำลังส่งรายงาน…",
  reportReceived: "ได้รับรายงานแล้ว ขอบคุณที่แจ้งให้ทราบ",
  reportFailed: "ส่งรายงานไม่สำเร็จ",
  reportRetry: "ลองอีกครั้ง",
  unknownPart: "—",
  flowerListSeparator: " · ",
  flowerCountPrefix: "×",
});

/** A report request that takes longer than this counts as failed (the user can retry). Lead decision, MFW-28. */
export const REPORT_REQUEST_TIMEOUT_MS = 10_000;
```
`noPublicWish` must stay neutral. It must not reveal whether a private wish exists.

### Step 4 — `src/core/effects/objectPool.ts` (new; pure, no three, no React)

```ts
/** One pre-allocated pool slot. `state` is mutated in place by the caller; nothing is allocated after creation. */
export interface PooledEntry<T> {
  readonly slot: number;
  readonly state: T;
  active: boolean;
  startedAtMs: number;
}

export interface ObjectPool<T> {
  readonly capacity: number;
  /** Number of active entries (0..capacity). */
  readonly activeCount: number;
  /** Entry at slot 0..capacity-1 (active or not). Out of range → RangeError. Use it for allocation-free iteration. */
  entryAt(slot: number): PooledEntry<T>;
  /** A free entry, or, when every entry is active, the OLDEST one (smallest startedAtMs; tie → lowest slot), recycled. Never null. */
  acquire(nowMs: number): PooledEntry<T>;
  /** Marks the entry inactive. Releasing an inactive entry or one of another pool is a no-op. */
  release(entry: PooledEntry<T>): void;
  releaseAll(): void;
}

/** capacity must be a positive integer (else RangeError). createState(slot) runs exactly `capacity` times, here, never later. */
export function createObjectPool<T>(capacity: number, createState: (slot: number) => T): ObjectPool<T>;
```
Implementation notes:
- `const entries: PooledEntry<T>[] = Array.from({ length: capacity }, (_, slot) => ({ slot, state: createState(slot), active: false, startedAtMs: 0 }));`
  Keep a private `let active = 0;` and expose it with a getter `get activeCount() { return active; }`.
- `acquire`: first look for an inactive entry with an indexed `for` loop. If there is none, pick the active entry with the smallest
  `startedAtMs` (strict `<`, so ties keep the lowest slot). Set `active = true` and `startedAtMs = nowMs`, and update the counter only
  when the entry was inactive. Return it. A non-finite `nowMs` is stored as `0`.
- `release(entry)`: `if (entries[entry.slot] !== entry || !entry.active) return;` then set it inactive and decrement the counter.
- No array or object allocation in `acquire`, `release` or `entryAt`.

### Step 5 — `src/core/effects/objectPoolManager.ts` (new; pure)

```ts
import type { EffectKind, EffectPoolCaps } from "@/config/performance.config";
import { createObjectPool, type ObjectPool } from "./objectPool";

/** Ripple centre in the world-view group's local x/z. Render-time only — NEVER persisted or sent (invariant A). */
export interface RippleState { x: number; z: number; }
/** Index into the scene layout's lamps. */
export interface LampGlowState { lampIndex: number; }

export interface ObjectPoolManager {
  readonly ripple: ObjectPool<RippleState>;
  readonly glow: ObjectPool<LampGlowState>;
  activeCount(kind: EffectKind): number;
  releaseAll(): void;
}

/** One pool per effect kind, sized from the tier caps (EFFECT_POOL_CAPS[tier]). */
export function createObjectPoolManager(caps: EffectPoolCaps): ObjectPoolManager;
```
`ripple = createObjectPool(caps.ripple, () => ({ x: 0, z: 0 }))` and `glow = createObjectPool(caps.glow, () => ({ lampIndex: 0 }))`.
`activeCount(kind)` uses a `switch` on `kind`. `releaseAll` releases both pools.

### Step 6 — `src/core/effects/gimmickCurves.ts` (new; pure, allocation-free)

```ts
import { GIMMICK_BOUNCE, LAMP_GLOW_LOOK, RIPPLE_LOOK } from "@/config/gimmicks.config";

export interface RippleFrame { radius: number; intensity: number; done: boolean; }
export interface LampGlowFrame { intensity: number; scale: number; done: boolean; }
export interface BounceFrame { scale: number; done: boolean; }

export function createRippleFrame(): RippleFrame;     // { radius: 0, intensity: 0, done: true }
export function createLampGlowFrame(): LampGlowFrame; // { intensity: 0, scale: 1, done: true }
export function createBounceFrame(): BounceFrame;     // { scale: 1, done: true }

export function writeRippleFrameAt(ageMs: number, reducedMotion: boolean, out: RippleFrame, look = RIPPLE_LOOK): RippleFrame;
export function writeLampGlowFrameAt(ageMs: number, reducedMotion: boolean, out: LampGlowFrame, look = LAMP_GLOW_LOOK, bounce = GIMMICK_BOUNCE): LampGlowFrame;
export function writeBounceAt(ageMs: number, reducedMotion: boolean, out: BounceFrame, bounce = GIMMICK_BOUNCE): BounceFrame;
```
Every function writes into `out` and returns `out`. Define `const TAU = 2 * Math.PI;`. First normalise the age: `const t = Number.isFinite(ageMs) && ageMs > 0 ? ageMs : 0;`.

- **Ripple:** if `t >= look.durationMs`, then `done = true`, `intensity = 0`, `radius = look.endRadius`. Otherwise `u = t / look.durationMs`,
  `radius = reducedMotion ? look.endRadius : look.startRadius + (look.endRadius - look.startRadius) * (1 - (1 - u) ** 3)` (ease-out cubic),
  `intensity = look.peakIntensity * (1 - u) ** 2`, `done = false`. Under reduced motion the ring does not expand, it only fades.
- **Bounce:** if `reducedMotion` or `t >= bounce.durationMs`, then `scale = 1`, `done = true`. Otherwise
  `scale = 1 + bounce.amplitude * Math.exp(-t / bounce.decayMs) * Math.sin(TAU * t / bounce.periodMs)`, `done = false`.
- **Lamp glow:** if `t >= look.durationMs`, then `done = true`, `intensity = 0`, `scale = 1`. Otherwise:
  - envelope `e = t < look.attackMs ? t / look.attackMs : t > look.durationMs - look.releaseMs ? (look.durationMs - t) / look.releaseMs : 1`;
  - flicker `f = reducedMotion ? 1 : 1 - look.flickerDepth * (1 + (Math.sin(TAU * t / look.flickerPeriodAMs) + Math.sin(TAU * t / look.flickerPeriodBMs)) / 2) / 2`
    (so `f ∈ [1 − depth, 1]`);
  - `intensity = look.peakIntensity * e * f`;
  - `scale` = `writeBounceAt(t, reducedMotion, scratchBounce, bounce).scale`, where `scratchBounce` is one module-level `BounceFrame`;
  - `done = false`.

### Step 7 — `src/core/effects/index.ts` (modify)

Keep the first line `/** ObjectPoolManager (Ripples, Fireworks, Confetti, Glow) */` and replace `export {};` with:
```ts
export * from "./objectPool";
export * from "./objectPoolManager";
export * from "./gimmickCurves";
```

### Step 8 — `src/components/canvas3d/sceneObjectNames.ts` (modify)

Add two entries to the frozen object (keep the existing ones): `ripples: "scene-ripples"`, `lampGlows: "scene-lamp-glows"`.

### Step 9 — `src/components/canvas3d/effects/tapPoint.ts` (new)

```ts
import { Object3D, Vector3 } from "three";
import { DRAG_START_DISTANCE_PX } from "@/config/interaction.config";
import type { WorldXZ } from "@/core/coordinates";

/** The R3F click fields this reads (ThreeEvent<MouseEvent> fits; so does the DOM test stub's synthetic event). */
export interface TapClickLike {
  readonly delta?: unknown; // px between pointerdown and click (R3F)
  readonly point?: unknown; // world-space hit point (R3F)
  readonly object?: unknown; // the hit Object3D (R3F)
}

/** False only when R3F reports that the click ended a drag (delta > DRAG_START_DISTANCE_PX). A missing delta counts as a tap. */
export function isTapClick(event: Pick<TapClickLike, "delta">): boolean;

/**
 * Hit point in the hit object's PARENT space (x, z), for effects rendered as siblings of the hit mesh (the world-view group).
 * Null when not a tap, when the point/object are missing or not three objects, or when the result is not finite.
 * Render-time only — NEVER persisted or sent (invariant A).
 */
export function tapPointInParentSpace(event: TapClickLike): WorldXZ | null;
```
Body of `isTapClick`: `return typeof event.delta !== "number" || !(event.delta > DRAG_START_DISTANCE_PX);`
Body of `tapPointInParentSpace`: return `null` unless `isTapClick(event)`, `event.point instanceof Vector3` and `event.object instanceof Object3D`.
Then:
```ts
const frame = event.object.parent ?? event.object;
frame.updateWorldMatrix(true, false);
scratch.copy(event.point);          // module-level `const scratch = new Vector3();`
frame.worldToLocal(scratch);
return Number.isFinite(scratch.x) && Number.isFinite(scratch.z) ? { x: scratch.x, z: scratch.z } : null;
```

### Step 10 — `src/components/canvas3d/effects/effectMeshes.ts` (new)

```ts
import { AdditiveBlending, Color, InstancedMesh, Matrix4, MeshBasicMaterial, RingGeometry, type Raycaster, type Intersection } from "three";
import { LAMP_GLOW_LOOK, RIPPLE_LOOK } from "@/config/gimmicks.config";
import type { PartGeometrySpec, ScenePartSpec } from "@/config/scene.config";
import {
  createLampGlowFrame, createRippleFrame, writeLampGlowFrameAt, writeRippleFrameAt,
  type LampGlowFrame, type LampGlowState, type ObjectPool, type RippleFrame, type RippleState,
} from "@/core/effects";
import type { InstanceTransform } from "@/core/world";
import { createPartGeometry } from "../geometry";
import { SCENE_OBJECT_NAMES } from "../sceneObjectNames";

/** One pooled effect kind = one InstancedMesh sized to the pool cap + its colour at intensity 1. */
export interface EffectMesh {
  readonly mesh: InstancedMesh;
  readonly baseColor: Color;
  readonly capacity: number;
}

/** Per-layer scratch so the frame writers allocate nothing. */
export interface EffectFrameScratch {
  readonly matrix: Matrix4;
  readonly color: Color;
  readonly ripple: RippleFrame;
  readonly glow: LampGlowFrame;
}
export function createEffectFrameScratch(): EffectFrameScratch;

export function createRippleMesh(capacity: number): EffectMesh;
export function createLampGlowMesh(capacity: number, lampHeadGeometry: PartGeometrySpec): EffectMesh;

/** Writes the active ripples into instances 0..n-1, releases expired ones, sets count/visible; returns n. Allocation-free. */
export function writeRippleInstances(
  target: EffectMesh, pool: ObjectPool<RippleState>, nowMs: number, reducedMotion: boolean, surfaceY: number, scratch: EffectFrameScratch,
): number;

/** Same for lamp glows; an entry whose lampIndex is outside `lamps` is released. Returns n. */
export function writeLampGlowInstances(
  target: EffectMesh, pool: ObjectPool<LampGlowState>, lamps: readonly InstanceTransform[], lampHead: Pick<ScenePartSpec, "yOffset">,
  nowMs: number, reducedMotion: boolean, scratch: EffectFrameScratch,
): number;

/** Disposes geometry, material and the mesh (instance buffers). R3F never disposes a <primitive>. */
export function disposeEffectMesh(target: EffectMesh): void;
```
Shared mesh setup in a private `function setupEffectMesh(geometry, color: string, capacity, name): EffectMesh`:
```ts
const material = new MeshBasicMaterial({ color: WHITE_HEX_NUMBER, blending: AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false });
const mesh = new InstancedMesh(geometry, material, capacity);
mesh.name = name;
mesh.frustumCulled = false;                 // instances move; the cached bounding sphere would be stale
mesh.raycast = NO_RAYCAST;                  // effects never intercept taps: `const NO_RAYCAST = (_r: Raycaster, _i: Intersection[]) => {};`
const black = new Color(0, 0, 0);
for (let i = 0; i < capacity; i++) mesh.setColorAt(i, black); // create instanceColor BEFORE the first render (shader variant)
mesh.count = 0;
mesh.visible = false;                       // no draw call while idle
return { mesh, baseColor: new Color(color), capacity };
```
Do not write a hex literal here. Use `const WHITE_HEX_NUMBER = 0xffffff;` (a hexadecimal number literal does not match the `#…` scan)
or omit `color` (the MeshBasicMaterial default is white). Prefer omitting it.
- `createRippleMesh`: `const g = new RingGeometry(RIPPLE_LOOK.ringInnerRatio, 1, RIPPLE_LOOK.ringSegments); g.rotateX(-Math.PI / 2);`
  (the ring lies flat with its normal up) → `setupEffectMesh(g, RIPPLE_LOOK.color, capacity, SCENE_OBJECT_NAMES.ripples)`.
- `createLampGlowMesh`: `setupEffectMesh(createPartGeometry(lampHeadGeometry), LAMP_GLOW_LOOK.color, capacity, SCENE_OBJECT_NAMES.lampGlows)`.
  `capacity` must be a positive integer (`RangeError` otherwise, for both).

`writeRippleInstances` algorithm:
```ts
let n = 0;
for (let s = 0; s < pool.capacity; s++) {
  const e = pool.entryAt(s);
  if (!e.active) continue;
  const f = writeRippleFrameAt(nowMs - e.startedAtMs, reducedMotion, scratch.ripple);
  if (f.done) { pool.release(e); continue; }
  scratch.matrix.makeScale(f.radius, 1, f.radius).setPosition(e.state.x, surfaceY + RIPPLE_LOOK.surfaceOffsetY, e.state.z);
  target.mesh.setMatrixAt(n, scratch.matrix);
  target.mesh.setColorAt(n, scratch.color.copy(target.baseColor).multiplyScalar(f.intensity));
  n++;
}
target.mesh.count = n;
target.mesh.visible = n > 0;
if (n > 0) { target.mesh.instanceMatrix.needsUpdate = true; target.mesh.instanceColor!.needsUpdate = true; }
return n;
```
`writeLampGlowInstances` is the same loop. Release an entry when `lamps[e.state.lampIndex]` is `undefined` or the frame is done. Otherwise
`const s = lamp.scale * LAMP_GLOW_LOOK.shellScale * f.scale;`
`scratch.matrix.makeScale(s, s, s).setPosition(lamp.position.x, lamp.position.y + lampHead.yOffset * lamp.scale, lamp.position.z);`
and the colour is `baseColor × f.intensity`. The head centre formula is the same one `RiverEnvironment` uses for `lampFocus`.

### Step 11 — `src/components/canvas3d/effects/riverTapProxy.ts` (new)

```ts
import { IcosahedronGeometry, MeshBasicMaterial, type BufferGeometry, type Material } from "three";
import { RIVER_KRATHONG_TAP_RADIUS } from "@/config/gimmicks.config";

/** One invisible low-poly sphere shared by every river krathong's hit proxy (rendered with visible={false}: raycast only, no draw call). */
export interface RiverTapProxy {
  readonly geometry: BufferGeometry;
  readonly material: Material;
  dispose(): void;
}
export function createRiverTapProxy(radius: number = RIVER_KRATHONG_TAP_RADIUS): RiverTapProxy;
```
Use `new IcosahedronGeometry(radius, 0)` (detail 0 = 20 faces; write `ICOSAHEDRON_DETAIL = 0` as a named const) and `new MeshBasicMaterial()`.
`dispose()` disposes both. three's `Raycaster` does not skip invisible objects, so `visible={false}` keeps the proxy tappable.

### Step 12 — `src/components/canvas3d/effects/SceneEffects.tsx` (new, `"use client"`)

```tsx
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from "react";
import type { EffectKind, EffectPoolCaps } from "@/config/performance.config";
import type { ScenePartSpec } from "@/config/scene.config";
import type { WorldXZ } from "@/core/coordinates";
import { createObjectPoolManager } from "@/core/effects";
import type { InstanceTransform } from "@/core/world";
import {
  createEffectFrameScratch, createLampGlowMesh, createRippleMesh, disposeEffectMesh, writeLampGlowInstances, writeRippleInstances,
} from "./effectMeshes";

/** Kinds recorded on the scene section's data-last-gimmick attribute (tests/e2e). */
export type SceneGimmickKind = "ripple" | "lamp-glow" | "inspect";

export interface SceneEffectsHandle {
  /** Starts a ripple at a world-view-group-local point (non-finite → ignored). Recycles the oldest when the pool is full. */
  spawnRipple(at: WorldXZ): void;
  /** Lights lamp `lampIndex` (restarts it if already lit; a non-integer or out-of-range index → ignored). */
  lightLamp(lampIndex: number): void;
  activeCount(kind: EffectKind): number;
}

export interface SceneEffectsProps {
  readonly handleRef: Ref<SceneEffectsHandle>;
  readonly caps: EffectPoolCaps; // EFFECT_POOL_CAPS[tier] (stable frozen object per tier)
  readonly reducedMotion: boolean;
  readonly waterSurfaceY: number;
  readonly lamps: readonly InstanceTransform[];
  readonly lampHead: ScenePartSpec;
  /** Clock in ms; default Date.now. Injectable for tests. */
  readonly now?: () => number;
}

/** Pooled tap effects (invariant E): one InstancedMesh per kind, created per cap, disposed on unmount/cap change. */
export function SceneEffects({ handleRef, caps, reducedMotion, waterSurfaceY, lamps, lampHead, now = Date.now }: SceneEffectsProps) {
  const invalidate = useThree((state) => state.invalidate);
  const pools = useMemo(() => createObjectPoolManager(caps), [caps]);
  const ripple = useMemo(() => createRippleMesh(caps.ripple), [caps.ripple]);
  const glow = useMemo(() => createLampGlowMesh(caps.glow, lampHead.geometry), [caps.glow, lampHead.geometry]);
  const scratch = useRef(createEffectFrameScratch());
  useEffect(() => () => disposeEffectMesh(ripple), [ripple]);
  useEffect(() => () => disposeEffectMesh(glow), [glow]);
  useEffect(() => () => pools.releaseAll(), [pools]);

  useImperativeHandle(handleRef, () => ({
    spawnRipple(at) {
      if (!Number.isFinite(at.x) || !Number.isFinite(at.z)) return;
      const entry = pools.ripple.acquire(now());
      entry.state.x = at.x;
      entry.state.z = at.z;
      invalidate();
    },
    lightLamp(lampIndex) {
      if (!Number.isInteger(lampIndex) || lampIndex < 0 || lampIndex >= lamps.length) return;
      const t = now();
      for (let s = 0; s < pools.glow.capacity; s++) {
        const e = pools.glow.entryAt(s);
        if (e.active && e.state.lampIndex === lampIndex) { e.startedAtMs = t; invalidate(); return; }
      }
      pools.glow.acquire(t).state.lampIndex = lampIndex;
      invalidate();
    },
    activeCount: (kind) => pools.activeCount(kind),
  }), [pools, lamps, now, invalidate]);

  useFrame(() => {
    const t = now();
    const a = writeRippleInstances(ripple, pools.ripple, t, reducedMotion, waterSurfaceY, scratch.current);
    const b = writeLampGlowInstances(glow, pools.glow, lamps, lampHead, t, reducedMotion, scratch.current);
    if (a + b > 0) invalidate(); // keep the demand loop alive only while an effect is running
  });

  return (
    <>
      <primitive object={ripple.mesh} dispose={null} />
      <primitive object={glow.mesh} dispose={null} />
    </>
  );
}
```
There is no `useState` and no React re-render per tap or per frame. When a pool is full, a new effect recycles the oldest one. A
glow's `lampIndex` refers to `lamps`. If `lamps` changes to a shorter list, the writer releases the stale entries.

### Step 13 — `src/components/canvas3d/RiverFlow.tsx` (modify)

1. `RiverFlowItem` gains one optional field (a public field; RiverFlow does not render it):
   ```ts
   /** creations_public public wish (already moderated). RiverFlow ignores it; the InspectPopup (MFW-28) shows it. */
   readonly publicWishText?: string | null;
   ```
2. `RiverFlowProps` gains `readonly onItemTapped?: (id: string) => void;`. Document it: "WORLD_EXPLORE only. When it is absent, items are not
   tappable: no hit proxies, no handlers."
3. New imports (no `useState`/`useCallback` needed): `type ThreeEvent` from `@react-three/fiber`, `createBounceFrame, writeBounceAt`
   from `@/core/effects`, `isTapClick` from `./effects/tapPoint`, and `createRiverTapProxy` from `./effects/riverTapProxy`.
4. New refs and memo (next to the existing ones):
   ```ts
   const bounceGroups = useRef(new Map<string, Group>());
   /** One bouncing krathong at a time (the latest tap). resetId: the previous one, set back to scale 1 on the next frame. */
   const bounce = useRef<{ id: string | null; startMs: number; resetId: string | null }>({ id: null, startMs: 0, resetId: null });
   const bounceOut = useRef(createBounceFrame());
   const tappable = onItemTapped !== undefined;
   const hitProxy = useMemo(() => (tappable ? createRiverTapProxy() : null), [tappable]);
   useEffect(() => () => hitProxy?.dispose(), [hitProxy]);
   ```
5. In `useFrame`, after the existing item loop and **before** the existing `invalidate()`:
   ```ts
   const b = bounce.current;
   if (b.resetId !== null) { bounceGroups.current.get(b.resetId)?.scale.setScalar(1); b.resetId = null; }
   if (b.id !== null) {
     const node = bounceGroups.current.get(b.id);
     const f = writeBounceAt(nowMs - b.startMs, reducedMotion, bounceOut.current);
     node?.scale.setScalar(f.scale);
     if (f.done || !node) b.id = null;
   }
   ```
   The click handler must not touch other nodes. Only the frame writes scales, so the DOM test stub never needs a `scale` on the
   elements it clicks.
6. Item JSX. Keep the outer group exactly as it is (name `river-item-${id}`, `scale={RIVER_KRATHONG_SCALE}`, ref callback). Its children become:
   ```tsx
   <group name={`river-bounce-${item.id}`} ref={(node: Group | null) => {
     if (!node) return;
     bounceGroups.current.set(item.id, node);
     return () => { bounceGroups.current.delete(item.id); };
   }}>
     <KrathongModel appearance={item.source.appearance} shadows={shadows} />
   </group>
   {hitProxy && (
     <mesh name={`river-hit-${item.id}`} geometry={hitProxy.geometry} material={hitProxy.material} visible={false}
       onClick={(event: ThreeEvent<MouseEvent>) => {
         if (!isTapClick(event)) return;
         event.stopPropagation();               // the water behind must not also ripple
         const b = bounce.current;
         if (b.id !== null && b.id !== item.id) b.resetId = b.id;
         b.id = item.id;
         b.startMs = now();
         invalidate();
         onItemTapped?.(item.id);
       }} />
   )}
   ```
   **Names:** never start an inner name with `river-item-`, because the existing test counts `[name^="river-item-"]`. Keep the proxy **after**
   the bounce group, because an existing test reads the first `mesh` inside the item group. The bounce group sits inside the item group,
   so bobbing and drift stay unchanged and the per-frame transform is still written to the outer group only.
7. Change nothing else. Do not change `prepareRiverItems`, the transform, the bobbing or the `useEffect` that starts the demand loop.

### Step 14 — `src/components/models/loyKrathong/RiverEnvironment.tsx` (modify)

- `RiverEnvironmentProps.onWaterSelected` becomes `readonly onWaterSelected: (tap: WorldXZ | null) => void;`. Document it: "tap = hit point in the
  parent (world-view group) space, or null when unavailable / the click ended a drag".
- Import `tapPointInParentSpace` from `@/components/canvas3d/effects/tapPoint` (file path, never the `@/components/canvas3d` barrel) and
  `type WorldXZ` from `@/core/coordinates`.
- Water `onClick`: `(event) => { event.stopPropagation(); onWaterSelected(tapPointInParentSpace(event)); }`.
- Nothing else changes. The environment stays static: no `useFrame`, no effects here (MFW-27 test "is static").

### Step 14b — only if MFW-25 merged first: `src/core/world/zoneRiverItems.ts` (modify)

Add `readonly publicWishText: string | null;` to `ZoneRiverItem`, and add `publicWishText: c.publicWishText` to the frozen object in
`publicCreationsToRiverItems`. Replace the comment "Never copy publicWishText …" with "Copies the public wish (a public field) for the
InspectPopup (MFW-28). Never copy expiresAt or any non-public field." In `zoneRiverItems.test.ts` add one case: an item with
`publicWishText: "ขอให้สุขภาพแข็งแรง"` maps to the same text, and one with `null` maps to `null`. Change no existing case.

### Step 15 — `src/components/ui/inspectedCreation.ts` (new; no three)

```ts
import type { KrathongAppearance } from "@/core/customization/types"; // type-only: the barrel pulls in three

/** The ONLY data the InspectPopup gets (invariant C): no owner token/hash, no private wish, no zone/time, no name. */
export interface InspectedCreation {
  readonly id: string; // for the report request only; never displayed
  readonly appearance: KrathongAppearance;
  readonly publicWishText: string | null;
}

/** Structural source (RiverFlowItem fits). */
export interface InspectableSource {
  readonly id: string;
  readonly appearance: KrathongAppearance;
  readonly publicWishText?: string | null;
}

/** Explicit allowlist copy. publicWishText: a string with non-whitespace content → that string (unchanged); anything else → null. */
export function pickInspectedCreation(source: InspectableSource): InspectedCreation;

/** Linear search (≤ ZONE_ITEM_CAP items); null when the id is not in the list (e.g. after a zone switch). */
export function findInspectedCreation(items: readonly InspectableSource[], id: string): InspectedCreation | null;
```

### Step 16 — `src/components/ui/krathongAppearanceSummary.ts` (new; no three)

```ts
import type { KrathongAppearance } from "@/core/customization/types";

export type AppearanceSummaryKey = "base" | "lotusFold" | "leafColor" | "flowers" | "candleColor";
export interface AppearanceSummaryRow {
  readonly key: AppearanceSummaryKey;
  readonly label: string;
  readonly value: string;
  /** "#rrggbb" from the palette for colour rows, else null. */
  readonly swatch: string | null;
}
/** Thai rows in this order: base, lotusFold, leafColor, flowers, candleColor. */
export function describeKrathongAppearance(appearance: KrathongAppearance): readonly AppearanceSummaryRow[];
```
Labels come from `CUSTOMIZER_COPY`: `baseGroupLabel`, `foldGroupLabel`, `leafColorGroupLabel`, `flowerGroupLabel`, `candleColorGroupLabel`.
Values come from `KRATHONG_BASE_LABELS`, `LEAF_FOLD_STYLE_LABELS`, `LEAF_COLOR_LABELS`, `CANDLE_COLOR_LABELS`. Look each key up with
`Object.hasOwn(map, value) ? map[value] : INSPECT_POPUP_COPY.unknownPart`. Colour rows get `swatch = value` only when the label lookup
hit (an unknown colour has no swatch). Flowers: count each kind in `FLOWER_KINDS` order (from `@/config/events/loyKrathong.config`), skip
`null`, and format `${FLOWER_KIND_LABELS[kind]} ${flowerCountPrefix}${n}`, joined by `flowerListSeparator`. With no flowers the value is
`NO_FLOWER_LABEL`; `swatch` is null. Example for `DEFAULT_KRATHONG_APPEARANCE`:
`[{base,"ฐานกระทง","หยวกกล้วย",null},{lotusFold,"แบบพับใบตอง","พับแหลม",null},{leafColor,"สีใบตอง","เขียวใบตอง","#5E8C3A"},{flowers,"ดอกไม้รอบขอบ","ดาวเรือง ×8",null},{candleColor,"สีเทียน","เหลืองทอง","#FFD166"}]`.

### Step 17 — `src/services/api/reportClient.ts` (new; client-safe: no three, no auth, no console, no `"*"` literal)

```ts
import { REPORT_REQUEST_TIMEOUT_MS } from "@/config/inspect.config";
import { REPORT_ENDPOINT_PATH, type ReportRequestBody } from "./reportTypes"; // MFW-13

export type ReportSubmitOutcome = "received" | "failed";
export type ReportFetch = (input: string, init: RequestInit) => Promise<Response>;

/** In-memory, per page session. NEVER persisted (no LocalStorage): which wishes a device reported is not stored (plan §11 Q2). */
export interface ReportSession {
  hasReported(creationId: string): boolean;
  /** Already received → "received" without a request; concurrent calls for one id share one request; "failed" may be retried. */
  submit(creationId: string): Promise<ReportSubmitOutcome>;
}

export function createReportSession(fetchImpl?: ReportFetch, timeoutMs?: number): ReportSession;
/** Lazy singleton used by the InspectPopup. */
export function getReportSession(): ReportSession;
```
Implementation:
```ts
const HTTP_ACCEPTED = 202;
const defaultFetch: ReportFetch = (input, init) => fetch(input, init); // looks up the global at call time

async function postReport(creationId: string, fetchImpl: ReportFetch, timeoutMs: number): Promise<ReportSubmitOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body: ReportRequestBody = { creationId };
    const response = await fetchImpl(REPORT_ENDPOINT_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
    return response.status === HTTP_ACCEPTED ? "received" : "failed";
  } catch {
    return "failed"; // never log: the id and the error stay out of the console
  } finally {
    clearTimeout(timer);
  }
}
```
`createReportSession(fetchImpl = defaultFetch, timeoutMs = REPORT_REQUEST_TIMEOUT_MS)` keeps `received = new Set<string>()` and
`inFlight = new Map<string, Promise<ReportSubmitOutcome>>()`. `submit(id)` returns `"failed"` for `""` (no request). It returns `"received"`
when the id is in `received`. Otherwise it returns the pending promise, or starts `postReport(...).then((o) => { inFlight.delete(id);
if (o === "received") received.add(id); return o; })`.
The id goes **only** in the JSON body: never in the URL, a query string or a header. Nothing reads the device owner token.

`src/services/api/index.ts`: append
`export { createReportSession, getReportSession, type ReportFetch, type ReportSession, type ReportSubmitOutcome } from "./reportClient";`.

### Step 18 — `src/components/ui/InspectPopup.tsx` (new, `"use client"`)

```tsx
export interface InspectPopupProps {
  readonly creation: InspectedCreation;
  readonly onClose: () => void;
  /** Default getReportSession(). Injectable for tests. */
  readonly reportSession?: ReportSession;
}
export function InspectPopup(props: InspectPopupProps): JSX.Element;
```
Imports: only `react`, `@/config/inspect.config`, `./inspectedCreation` (type), `./krathongAppearanceSummary`, `@/services/api/reportClient`.
No three, R3F, react-spring, canvas3d, models or auth import.

Behaviour:
- Report state type: `type ReportUiState = "idle" | "confirming" | "sending" | "received" | "failed";`. The initial state is
  `session.hasReported(creation.id) ? "received" : "idle"`. The parent mounts it with `key={creation.id}`, so the state resets per krathong.
- Mount effect: `dialogRef.current?.focus()`.
- Root: `<section ref={dialogRef} role="dialog" aria-modal="false" aria-labelledby={titleId} tabIndex={-1} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
  className="mb-8 w-full rounded-2xl border border-indigo-950/20 bg-white px-4 py-3 text-sm text-zinc-900 shadow-lg dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100">`.
- Header row: `<h2 id={titleId} className="text-base font-semibold">{dialogTitle}</h2>` and a close button
  `<button type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-full px-3">{close}</button>`.
- `<p className="text-xs opacity-75">{anonymousNote}</p>`.
- `<h3>{appearanceHeading}</h3>`, then a `<dl>` with one `<div>` per row from `describeKrathongAppearance`. Each row is
  `<dt>{label}</dt><dd>{swatch && <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full border border-black/20 align-middle" style={{ backgroundColor: swatch }} />} {value}</dd>`.
- `<h3>{wishHeading}</h3>`, then `<p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words">{creation.publicWishText ?? noPublicWish}</p>`.
  Render it as a React text child only. Never use `dangerouslySetInnerHTML`.
- Report controls only when `creation.publicWishText !== null` (see §11 Q2):
  - `idle`: a `report` button → `confirming`.
  - `confirming`: `<p>{reportPrompt}</p>`, a `reportConfirm` button → `send()`, and a `reportCancel` button → `idle`.
  - `sending`: a disabled button with the label `reportSending`.
  - `received`: no button. The status text is `reportReceived`.
  - `failed`: the status text is `reportFailed` and a `reportRetry` button → `send()`.
  - `send = () => { setState("sending"); void session.submit(creation.id).then((o) => setState(o === "received" ? "received" : "failed")); }`.
  - Every button has `type="button"` and `className` containing `min-h-11 min-w-11`.
  - A polite live region `<p aria-live="polite">` holds the current status text (`reportReceived` / `reportFailed` / empty).
- No CSS transition or animation classes anywhere (reduced motion is trivially honoured). Never render `creation.id`, a time, a zone or any name.

### Step 19 — `src/components/canvas3d/index.tsx` (modify)

1. Imports: `EFFECT_POOL_CAPS` (value) from `@/config/performance.config`; `RIVER_ENVIRONMENT_PARTS` from
   `@/config/events/loyKrathong.river.config`; `type WorldXZ` from `@/core/coordinates`; `SceneEffects`,
   `type SceneEffectsHandle` and `type SceneGimmickKind` from `./effects/SceneEffects`; `InspectPopup` from `@/components/ui/InspectPopup`;
   `findInspectedCreation` from `@/components/ui/inspectedCreation`; `useMemo` merged into the react import; `type EffectPoolCaps`.
2. `ToyNightSceneProps` gains `effectCaps: EffectPoolCaps`, `effectsRef: Ref<SceneEffectsHandle>`,
   `onWaterSelected: (tap: WorldXZ | null) => void` and `onRiverItemTapped?: (id: string) => void`.
3. In `ToyNightScene`, inside the `scene-world-view` group:
   - `RiverEnvironment`'s `onWaterSelected={onWaterSelected}` (replaces `() => onTargetSelected("water")`).
   - `RiverFlow` gets `onItemTapped={onRiverItemTapped}`.
   - After `RiverFlow`, add:
     ```tsx
     <SceneEffects handleRef={effectsRef} caps={effectCaps} reducedMotion={reducedMotion}
       waterSurfaceY={LOY_KRATHONG_RIVER_LAYOUT.waterSurfaceY} lamps={LOY_KRATHONG_RIVER_LAYOUT.lamps}
       lampHead={RIVER_ENVIRONMENT_PARTS.lampHead} />
     ```
     It is always mounted (idle meshes are invisible), so MFW-23 can ripple in `RITUAL_RELEASE` later. Spawning is gated in `SceneViewport`.
   The origin krathong group's `onClick` stays exactly as it is.
4. `SceneViewport`: add all new hooks next to the existing ones, **before** `if (!profiled || qualityTier === "FALLBACK_2D") return null;`:
   ```ts
   const effectsRef = useRef<SceneEffectsHandle | null>(null);
   const [inspectedId, setInspectedId] = useState<string | null>(null);
   const [gimmick, setGimmick] = useState<{ kind: SceneGimmickKind | null; count: number }>({ kind: null, count: 0 });
   const recordGimmick = useCallback((kind: SceneGimmickKind) => setGimmick((g) => ({ kind, count: g.count + 1 })), []);
   ```
   - In the existing `if (selectionMode !== mode) { … }` block, also call `setInspectedId(null);`.
   - `onWaterSelected = useCallback((tap: WorldXZ | null) => { if (mode !== "WORLD_EXPLORE") return; onTargetSelected("water"); if (tap && effectsRef.current) { effectsRef.current.spawnRipple(tap); recordGimmick("ripple"); } }, [mode, onTargetSelected, recordGimmick]);`
   - In the existing `onLampSelected`, after `setFlyRequestId(...)`, add `if (effectsRef.current) { effectsRef.current.lightLamp(index); recordGimmick("lamp-glow"); }`
     and add `recordGimmick` to its deps.
   - `onRiverItemTapped = useCallback((id: string) => { if (mode !== "WORLD_EXPLORE") return; setInspectedId(id); recordGimmick("inspect"); }, [mode, recordGimmick]);`
   - `const inspected = useMemo(() => (mode === "WORLD_EXPLORE" && inspectedId !== null ? findInspectedCreation(<river items passed to ToyNightScene>, inspectedId) : null), [mode, inspectedId, <same items>]);`
     (`riverItems` today; `visibleRiverItems` if MFW-25 merged first.)
5. Render. After the early return, compute `const effectCaps = EFFECT_POOL_CAPS[qualityTier as RenderTier];`. Pass `effectCaps`, `effectsRef`,
   `onWaterSelected` and `onRiverItemTapped={mode === "WORLD_EXPLORE" ? onRiverItemTapped : undefined}` to `ToyNightScene`.
6. Wrap the returned `<section>` in a fragment and render the popup as a **sibling after** the section (not inside it: the section calls
   `setPointerCapture` on pointerdown, which would steal the popup's button clicks):
   ```tsx
   <>
     <section … existing … data-last-gimmick={gimmick.kind ?? undefined} data-gimmick-count={gimmick.count}>…</section>
     {inspected && <InspectPopup key={inspected.id} creation={inspected} onClose={() => setInspectedId(null)} />}
   </>
   ```
   These two attributes are the only new section attributes. Never put wish text or ids into `data-*`.
7. Change nothing else: no change to the pan/rotate legacy code, chip, flight, highlight, `getSceneRenderSettings`, `TOY_SCENE_*`, or `NO_RIVER_ITEMS`.

### Step 20 — Tests (§7) and verify (§9)

## 7. Tests

All vitest tests run without a database or WebGL. three works in jsdom/node without a GL context (as in MFW-27's tests). Component tests
mock `@react-three/fiber` the same way the neighbouring tests do. Derive expected numbers from the config constants, never from copied
literals.

**`src/core/effects/objectPool.test.ts`** (`// @vitest-environment node`)
- `createObjectPool(0 | -1 | 1.5 | NaN, …)` → `RangeError`. `createState` spy is called exactly 3 times for capacity 3, with slots 0, 1, 2.
- Acquire at t = 10, 20, 30 → three distinct entries (slots 0, 1, 2), `activeCount` 3. Acquire at 40 → the slot-0 entry (oldest), `startedAtMs` 40,
  `activeCount` still 3. The next acquire at 50 → slot 1. `createState` is still called 3 times in total, and every returned entry is `===` one of `entryAt(0..2)`.
- Tie: two entries both started at 5 → recycle the lower slot.
- `release(entry)` → `activeCount` −1, and the next `acquire` returns that entry. Releasing twice is a no-op. Releasing an entry from another pool is a no-op.
- `releaseAll()` → 0. `entryAt(3)` / `entryAt(-1)` → `RangeError`. `acquire(NaN)` stores `startedAtMs` 0.

**`src/core/effects/objectPoolManager.test.ts`** (node)
- For each tier: `createObjectPoolManager(EFFECT_POOL_CAPS[tier])` → `ripple.capacity === caps.ripple`, `glow.capacity === caps.glow`.
- `activeCount("ripple")` after 2 acquires → 2, and `activeCount("glow")` → 0. After `releaseAll()` both are 0.

**`src/core/effects/gimmickCurves.test.ts`** (node). Use `D = RIPPLE_LOOK.durationMs` etc.
- Ripple: age 0 → radius `startRadius`, intensity `peakIntensity`, `done` false. At `D/2` → radius `start + (end − start)(1 − 0.5³)`, intensity `peak · 0.25`.
  At `D` and beyond → done, intensity 0. Age −5 / NaN → same as 0. Reduced motion → radius `endRadius` at 0 and at `D/2`, intensity unchanged.
  The return value is `===` `out`.
- Bounce: age 0 → 1. At `P/4` → `1 + A·e^(−(P/4)/τ)`. At `duration` → 1 and done. Reduced motion at `P/4` → 1, done.
- Lamp glow: age 0 → intensity 0 (envelope start). At `attackMs` with reduced motion → `peak`. In the hold window the reduced-motion
  intensity is exactly `peak` and the scale is exactly 1. Without reduced motion, 200 samples across the hold give intensities in
  `[peak·(1−depth), peak]` and at least two distinct values (it flickers). Scale equals `writeBounceAt(t).scale`. At
  `durationMs − releaseMs/2` the reduced-motion intensity is `peak/2`. At `durationMs` → done.
- Determinism: two calls with the same inputs → identical fields.

**`src/config/gimmicks.config.test.ts`** (node)
- `RIPPLE_LOOK.endRadius > startRadius > 0`, `0 < ringInnerRatio < 1`, `ringSegments` is an integer ≥ 3, all durations > 0.
- `LAMP_GLOW_LOOK.attackMs + releaseMs ≤ durationMs`, `0 < flickerDepth < 1`.
- Photosensitivity: `flickerPeriodAMs` and `flickerPeriodBMs` are both `≥ MS_PER_SECOND / WCAG_MAX_FLASHES_PER_SECOND`.
- Bounce settles: `amplitude · e^(−durationMs/decayMs) ≤ BOUNCE_SETTLE_EPSILON`, and `0 < amplitude < 1`.
- Colours match `/^#[0-9a-f]{6}$/i`.
- Tap radius: `RIVER_KRATHONG_TAP_RADIUS ≥ KRATHONG_MODEL_FOOTPRINT_RADIUS`, and
  `2 · RIVER_KRATHONG_TAP_RADIUS · RIVER_KRATHONG_SCALE ≤ RIVER_MIN_CENTER_SPACING + 1e-12` (proxies never overlap).

**`src/config/performance.config.test.ts`** (modify: add one case "effect pool caps per tier (lead decision, MFW-28)")
- `EFFECT_POOL_CAPS` and each tier object are frozen. Every tier has exactly the keys of `EFFECT_KINDS`, each a positive integer.
  For each kind, `HIGH ≥ MEDIUM ≥ LOW`. Do not touch the owner-number cases.

**`src/components/canvas3d/effects/tapPoint.test.ts`**
- Build a real `Group` at position (1, 0, 2) with rotation y = π/2, a child `Mesh` at (0, −0.24, 0), and call `group.updateMatrixWorld(true)`.
  Pick a world point `p = group.localToWorld(new Vector3(0.5, −0.24, −0.3))`. `tapPointInParentSpace({ point: p, object: mesh, delta: 0 })`
  ≈ `{ x: 0.5, z: −0.3 }` (`toBeCloseTo(…, 9)`).
- `delta: DRAG_START_DISTANCE_PX` → a value. `delta: DRAG_START_DISTANCE_PX + 1` → null. No `point` / a plain `{x,y,z}` point /
  no `object` → null. An object with no parent uses itself as the frame.
- `isTapClick({})` → true, `isTapClick({ delta: "x" })` → true, `isTapClick({ delta: 9 })` → `9 <= DRAG_START_DISTANCE_PX`.

**`src/components/canvas3d/effects/effectMeshes.test.ts`** (real three)
- `createRippleMesh(4)`: `mesh.instanceMatrix.count === 4`, `count === 0`, `visible === false`, `frustumCulled === false`, `instanceColor !== null`,
  material `blending === AdditiveBlending`, `transparent`, `depthWrite === false`, `toneMapped === false`, `mesh.name === SCENE_OBJECT_NAMES.ripples`.
  Every position attribute y is ≈ 0 (flat). `mesh.raycast(new Raycaster(), hits)` leaves `hits` empty. `createRippleMesh(0)` → `RangeError`.
- `writeRippleInstances`: pool cap 4. Acquire A at t = 0 with (1, 2) and B at t = 100 with (−1, 0). Write at `now = 300`, `surfaceY = −0.24`
  → returns 2, `count` 2, `visible` true. Decompose instance 0 → position (1, −0.24 + surfaceOffsetY, 2), scale (r, 1, r) with
  r = `writeRippleFrameAt(300).radius`. The instance-0 colour ≈ `baseColor × intensity(300)`. `instanceMatrix.needsUpdate` was set (version
  increased). At `now = D + 1` → A released, returns 1 (B is now at index 0). At `now = D + 200` → 0, `visible` false, `activeCount` 0.
- Reduced motion: the instance scale x equals `endRadius` at any age.
- `createLampGlowMesh(2, RIVER_ENVIRONMENT_PARTS.lampHead.geometry)`: name `SCENE_OBJECT_NAMES.lampGlows`, geometry is an `IcosahedronGeometry`.
  `writeLampGlowInstances` with `LOY_KRATHONG_RIVER_LAYOUT.lamps` and an entry `{ lampIndex: 2 }` started at 0, now = `attackMs`: position ≈
  `(l2.x, l2.y + lampHead.yOffset · l2.scale, l2.z)`, uniform scale ≈ `l2.scale × shellScale × writeBounceAt(attackMs).scale`. Reduced motion →
  scale `l2.scale × shellScale`. An entry with `lampIndex: 99` is released and not drawn.
- `disposeEffectMesh`: spies on `BufferGeometry.prototype.dispose`, `Material.prototype.dispose` and `InstancedMesh.prototype.dispose` → 1 call each.

**`src/components/canvas3d/effects/riverTapProxy.test.ts`**
- `createRiverTapProxy()` → `IcosahedronGeometry` with `parameters.radius === RIVER_KRATHONG_TAP_RADIUS`, a `MeshBasicMaterial`. `dispose()` → geometry
  and material dispose spies 1 call each.

**`src/components/canvas3d/effects/SceneEffects.test.tsx`**. Mock `@react-three/fiber`: `useThree: (s) => s({ invalidate })` with `invalidate = vi.fn()`
(hoisted), and `useFrame: (cb) => { r3f.frame = cb; }`. Wrap `./effectMeshes` with `vi.mock(…, async (importOriginal) => …)` so that
`createRippleMesh` / `createLampGlowMesh` are counted (`vi.fn` calling the real function). Render with `handleRef = createRef<SceneEffectsHandle>()`,
caps `{ ripple: 3, glow: 2 }`, the real layout lamps and lamp head, and `now={() => NOW}`.
- Cap: ten `spawnRipple({ x: 0, z: 0 })` → `activeCount("ripple") === 3` and `invalidate` called 10 times. `createRippleMesh` was called once.
- `spawnRipple({ x: NaN, z: 0 })` → ignored (count unchanged, no extra invalidate).
- Lamps: `lightLamp(1)` twice → `activeCount("glow") === 1`. `lightLamp(0)` → 2. `lightLamp(5)` with 6 lamps and a full pool → still 2 (recycles).
  `lightLamp(-1)`, `lightLamp(1.5)`, `lightLamp(lamps.length)` → ignored.
- Frame: spy `InstancedMesh.prototype.setMatrixAt`. Call `r3f.frame()` → called at least once, and `invalidate` was called by the frame.
  Advance `NOW` past both durations and call the frame → both counts 0. `invalidate.mockClear()`, call the frame again → `invalidate` not called (idle stops the loop).
- Rerender with the same props → no new mesh and 0 dispose calls. Rerender with caps `{ ripple: 2, glow: 2 }` → `createRippleMesh` called again,
  the old ripple mesh disposed (geometry/material/mesh dispose spies +1 each), `createLampGlowMesh` not called again. `unmount()` → both remaining
  meshes disposed.
- Renders exactly two `primitive` elements.

**`src/components/canvas3d/RiverFlow.test.tsx`** (modify). In `beforeAll` add a `scale` getter on `HTMLUnknownElement.prototype` (a per-element
`Vector3` from a `WeakMap`, like `position`), and delete it in `afterAll`. Extend `ui()` with an optional `onItemTapped`. Existing cases unchanged.
- "no hit proxies without onItemTapped": `[name^="river-hit-"]` count 0.
- "renders one invisible hit proxy per item": with `onItemTapped` → 2 elements, each with `visible="false"`, placed after `river-bounce-<id>`.
  The `river-item-` count is still 2.
- "tap bounces once and inspects": `fireEvent.click(river-hit-a)` → `onItemTapped` called with `"a"` once, and `invalidate` was called. Frame at the
  same `NOW` → `river-bounce-a` scale x = 1 (sin 0). `NOW += GIMMICK_BOUNCE.periodMs / 4`, frame → scale x =
  `writeBounceAt(periodMs/4, false, createBounceFrame()).scale` (> 1). `NOW += GIMMICK_BOUNCE.durationMs`, frame → exactly 1, and the next frame keeps it at 1.
- "reduced motion: tap inspects but never scales": `reducedMotion: true` → `onItemTapped("a")`, and the scale stays 1 at `periodMs/4`.
- "a tap on another krathong settles the first": tap a, advance `periodMs/4`, frame (a > 1), tap b, frame → a's scale is exactly 1.
- "hit proxy assets are shared, created once and disposed": spy on `BufferGeometry.prototype.dispose`. A rerender with new `items` → 0 calls.
  `unmount()` → 1 call (the shared proxy geometry; the krathong model is mocked).

**`src/components/models/loyKrathong/RiverEnvironment.test.tsx`** (modify, add one line in "reports water and lamp taps"):
`expect(props.onWaterSelected).toHaveBeenCalledWith(null);` (the DOM stub gives no hit point).

**`src/components/canvas3d/index.test.tsx`** (modify). Add a hoisted `tapStub = vi.hoisted(() => ({ value: { x: 0.5, z: 0 } as { x: number; z: number } | null }))`
and `vi.mock("./effects/tapPoint", async (importOriginal) => ({ ...(await importOriginal<typeof import("./effects/tapPoint")>()), tapPointInParentSpace: () => tapStub.value }))`.
Reset `tapStub.value = { x: 0.5, z: 0 }` in `beforeEach`. All existing cases keep their assertions. New cases (a new
`describe("scene gimmicks (MFW-28)")`; the item fixture is the same as the existing "passes river items" case, with id
`"950118ce-7d93-4cb6-bd84-44d91c5de9e3"` and `publicWishText: "ขอให้ครอบครัวมีความสุข"`):
- "water tap in WORLD_EXPLORE spawns a ripple": click water → `data-last-gimmick="ripple"`, `data-gimmick-count="1"`, `data-selected-target="water"`.
- "a water tap without a hit point selects but spawns nothing": `tapStub.value = null` → `data-selected-target="water"`, no `data-last-gimmick`.
- "lamp tap lights the lamp": click `scene-lamp-heads` → `data-last-gimmick="lamp-glow"`, `data-selected-target="lamp"`, and one more flight start.
- "CUSTOMIZE and RITUAL_RELEASE taps spawn no gimmick" (`it.each`): click water and lamp → no `data-last-gimmick`. With the fixture item, no
  `[name^="river-hit-"]`.
- "river krathong tap opens the inspect popup": click `[name="river-hit-<id>"]` → `screen.getByRole("dialog", { name: INSPECT_POPUP_COPY.dialogTitle })` contains
  the wish, `data-last-gimmick="inspect"`. The dialog is **not** inside the section (`viewport().contains(dialog) === false`). No section `data-*`
  value contains the id or the wish. `fireEvent.click(getByRole("button", { name: INSPECT_POPUP_COPY.close }))` → no dialog.
- "the popup closes on mode change and when the item leaves": open, `rerender(<SceneViewport mode="RITUAL_RELEASE" riverItems={items} />)` → no dialog.
  Open again in WORLD_EXPLORE, then `rerender` with `riverItems={[]}` → no dialog.
- "the candle is still the only point light" is the existing case and must stay green (no light added).

**`src/components/ui/inspectedCreation.test.ts`**
- `pickInspectedCreation` of an object that, at runtime, also has `ownerToken`, `ownerTokenHash`, `privateWishText`, `zoneId`, `createdAtMs` and `coord`
  (cast through `unknown`) → `Object.keys(result)` equals `["id", "appearance", "publicWishText"]`, and `JSON.stringify(result)` contains none of
  the extra values.
- `publicWishText`: `"ขอให้สมหวัง"` → the same; `"   "` → null; `undefined` → null; `null` → null; a number (cast) → null.
- `findInspectedCreation([a, b], b.id)` → b's pick; an unknown id → null; `[]` → null.

**`src/components/ui/krathongAppearanceSummary.test.ts`**
- `DEFAULT_KRATHONG_APPEARANCE` → exactly the five rows of the Step 16 example.
- Flowers `["lotus", null, "marigold", "lotus"]` → `"ดาวเรือง ×1 · ดอกบัว ×2"` (FLOWER_KINDS order). All `null` → `NO_FLOWER_LABEL`. `[]` → `NO_FLOWER_LABEL`.
- An unknown leaf colour (cast) → value `INSPECT_POPUP_COPY.unknownPart`, `swatch` null.

**`src/components/ui/InspectPopup.test.tsx`** (jsdom). Use a fake session:
`{ hasReported: vi.fn(() => false), submit: vi.fn(() => deferred.promise) }`.
- Content: the dialog has the title, `anonymousNote`, every row label and value from `describeKrathongAppearance`, and the wish text.
  `document.activeElement` is the dialog. The text content contains neither `creation.id` nor any `data-` attribute holding it.
- HTML is shown as text: the wish `"<b>bold</b><img src=x onerror=alert(1)>"` → `getByText` finds the literal string, and the container has no `b` / `img`.
- No public wish → `noPublicWish` is shown, there is no `report` button, and `submit` is never called.
- Report success: click `report` → `reportPrompt` is visible. Click `reportConfirm` → `submit` is called once with the id, and a disabled
  `reportSending` button shows. Resolve `"received"` (inside `act`) → `reportReceived` is shown and no report button remains.
- Cancel: `report` → `reportCancel` → back to the `report` button, and `submit` is not called.
- Failure + retry: resolve `"failed"` → `reportFailed` and a `reportRetry` button. Click it → `submit` is called a second time.
- Already reported (`hasReported → true`) → `reportReceived` is shown from the start, with no report button.
- Close: the `close` button and the Escape key each call `onClose` once.
- Touch targets: every `button` has the classes `min-h-11` and `min-w-11`. No element's `className` matches `/\banimate-|\btransition\b/`.

**`src/services/api/reportClient.test.ts`** (jsdom). Fake `fetchImpl = vi.fn(async () => new Response(null, { status: 202 }))`.
- Request: `fetchImpl` is called once with `(REPORT_ENDPOINT_PATH, init)`. The URL has no `?` and does not contain the id. `init.method === "POST"`,
  `init.headers` is `{ "Content-Type": "application/json" }` (no `Authorization`), `init.cache === "no-store"`, `init.credentials === "same-origin"`, and
  `Object.keys(JSON.parse(init.body))` equals `["creationId"]`. This holds even when `localStorage` holds a value under the device token key
  (`DEVICE_OWNER_TOKEN_STORAGE_KEY` from `src/config/ownership.config.ts`): the body still has only `creationId`.
- Outcomes: 202 → `"received"`. 200, 400, 415, 503 → `"failed"`. A rejecting fetch → `"failed"`. `submit("")` → `"failed"` with no request.
- Timeout: `vi.useFakeTimers()`, a fetch that rejects when its `signal` aborts, advance `REPORT_REQUEST_TIMEOUT_MS` → `"failed"` and `signal.aborted === true`.
- Session: after `"received"`, `hasReported(id)` is true and a second `submit` resolves `"received"` with no second request. Two concurrent submits →
  one request. After `"failed"`, `submit` sends again.
- Side effects: spy `Storage.prototype.setItem` → never called. Spy `console.error/warn/log` → never called.

**`tests/unit/inspect-boundary.test.ts`** (new, `// @vitest-environment node`)
- `FORBIDDEN_3D` = the same regex as `src/components/ui/CustomizerPanel.boundary.test.ts`. It must match none of `src/components/ui/InspectPopup.tsx`,
  `src/components/ui/inspectedCreation.ts`, `src/components/ui/krathongAppearanceSummary.ts`, `src/services/api/reportClient.ts` and
  `src/config/inspect.config.ts`. The `@/core/customization` import in the two ui helpers must be `import type … from "@/core/customization/types"`.
- None of those files matches `/@\/services\/auth|deviceOwnerToken|getDeviceOwnerVault/` or `/dangerouslySetInnerHTML/`.
- Positive controls: each regex matches a sample string.

**`tests/e2e/scene-gimmicks.spec.ts`** (new). `test.use({ hasTouch: true })`. Navigate as in `tests/e2e/river-environment.spec.ts`:
Loy Krathong → `ถัดไป` → `ถัดไป` → `ปล่อยกระทง` → `SHARED_WORLD_EXPLORE`, canvas count 1. Collect `pageerror` and console `"error"` messages.
- Water tap point: `WATER_TAP_OFFSET_PX = { x: -127, y: -40 }` from the centre of `[aria-label="Toy-like night river preview"]`. Comment: "world
  (−3, −0.24, −0.15) on the river centreline, projected by the default orthographic camera (position CAMERA_FLIGHT_OFFSET looking at the
  origin, zoom 52). An orthographic projection does not depend on the viewport width. It is about 133 px from the centre krathong, and
  MFW-27's no-occlusion test keeps props off the lanes." (The lead checked it with three: (−127.0, −39.7) px; a ray through it hits y = −0.24 at (−3, −0.15).)
- Tests (each tier: init script `deviceMemory`/`hardwareConcurrency` as in `river-environment.spec.ts`):
  1. HIGH: one tap → the viewport has `data-last-gimmick="ripple"` and `data-gimmick-count="1"`. Twelve more taps → `data-gimmick-count="13"`.
     Two animation frames → both error lists are empty.
  2. LOW: the same with 6 taps (`data-gimmick-count="6"`), no errors.
  3. HIGH + reduced motion (`test.use({ reducedMotion: "reduce" })` in a `describe`): the root has `data-reduced-motion="true"`. One tap →
     `data-last-gimmick="ripple"`, no errors.
- No lamp or krathong e2e: the lamp head is about 7 px wide on screen, and the app has no river krathongs until MFW-25 (Risks). These are
  covered by component tests. `tests/e2e/scene-gating.spec.ts` and `river-environment.spec.ts` stay unchanged and green.

## 8. Do NOT (Out of scope and traps)

- Do not build: the release ripple or candle light-up of the ritual (MFW-23; it may call `spawnRipple` later); the owner's private view or
  token proof in the popup (MFW-31); Find My, cross-zone flights or a river-krathong highlight/fly-to (MFW-30); 2D ripples or a 2D popup
  host (MFW-33); zone loading or pagination (MFW-25); krathong-part instancing (MFW-34); report anti-abuse, reporter ids or report reasons
  (MFW-13 OQ1); fireworks or confetti pools; any Christmas or other-festival gimmick.
- **No light sources.** No `pointLight`, `spotLight` or emissive change on the shared lamp material. The glow is an unlit additive shell (MFW-27 D5).
- No new dependency (no drei, no GSAP). Do not edit `package.json`, the lockfile, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.mts`,
  `playwright.config.ts`.
- Do not change `TIER_BUDGETS`, `TIER_ANTIALIAS`, the gesture thresholds, the legacy `PAN_RIVER` code, `createInputSeparator`, the flow state
  machine, `FlowRoot`, `CameraFlightController`, `TargetHighlight`, `HIGHLIGHT_RING_SIZES` or `PART_CHANGE_BOUNCE`.
- Do not allocate per tap or per frame in three: no `new InstancedMesh/Geometry/Material/Color/Matrix4/Vector3` outside the `useMemo`
  factories and module scratch. No `useState` set per frame. No `react-spring` for these gimmicks.
- Do not put the popup inside the `<section>` (pointer capture). Never use `dangerouslySetInnerHTML`. Never display the id, a time, a zone or any name.
- **Report request:** body `{ creationId }` only. Never send the owner token, never read `@/services/auth`, and never put the id in the URL,
  a query string or a header. Never log anything about a report. Never persist reported ids (no LocalStorage).
- Never persist or send a tap point, ripple position or any world position (invariant A). `RippleState` lives only in the pool.
- Do not import the `@/components/canvas3d` barrel from `src/components/models/**` or `src/components/ui/**`. Do not import
  `@/core/customization` (value barrel, pulls three) into `src/components/ui/**`: use type-only imports from `@/core/customization/types`.
- Do not touch `.claude/**`, `scripts/**`, `.github/**`, `CLAUDE.md`, `AGENTS.md`, `docs/spec/**`, `docs/backlog*.json`, `docs/plans/**`,
  `src/core/coordinates/**`, `supabase/**`, `src/app/api/**`, or MFW-13's files (`reportTypes.ts`, `reportHandler.ts`, the route).
- Do not weaken, skip or delete existing tests. The only allowed edits to existing tests are the additions listed in §7.
- Next.js: this card uses no Next.js API (client components and `fetch` only). If you find you need one, read `node_modules/next/dist/docs/` first.

## 9. Definition of done

- Each run separately and green: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm e2e`. In this cloud container run e2e as
  `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell pnpm e2e`.
- Every check in §3 has its test. Delete `playwright-report/` and `test-results/` before committing. Never commit `.next/` or `*.tsbuildinfo`.
- Branch `feat/MFW-28-interactive-scene-gimmicks-object-pool` from the latest `main` (after MFW-13 is merged). Use conventional commits with
  the key, e.g. `feat(scene): pooled tap gimmicks and inspect popup MFW-28` (format: CLAUDE.md, `docs/prompts/README.md`).
- Open a ready PR against `main` with the same title. The body (English) has: a summary + link to MFW-28; the AC checklist with the proving
  file/test; "Decisions" (every PLACEHOLDER constant with its value, plus §12); "Open questions" (§11); the test plan (five commands and
  results); and follow-ups (MFW-23 release ripple, MFW-31 owner view, MFW-33 2D reuse, the MFW-25 merge order).
- Leave the PR open for review (reviewer + qa + `r3f-perf-reviewer` + `privacy-auditor`). This is not an owner-merge card.

## 10. Interfaces this card provides

| Export | Path | Signature | For |
|---|---|---|---|
| `createObjectPool`, `ObjectPool<T>`, `PooledEntry<T>` | `@/core/effects` | Step 4 | any pooled effect (Christmas lights, fireworks later) |
| `createObjectPoolManager`, `ObjectPoolManager`, `RippleState`, `LampGlowState` | `@/core/effects` | `(caps: EffectPoolCaps) => ObjectPoolManager` | MFW-33 (2D ripples share caps), MFW-23 |
| `writeRippleFrameAt`, `writeLampGlowFrameAt`, `writeBounceAt`, `create*Frame` | `@/core/effects` | Step 6 | MFW-33 (2D ripple drawing reads the same curve), MFW-23 |
| `EFFECT_KINDS`, `EffectKind`, `EffectPoolCaps`, `EFFECT_POOL_CAPS` | `@/config/performance.config` | Step 1 | all effect layers |
| `RIPPLE_LOOK`, `LAMP_GLOW_LOOK`, `GIMMICK_BOUNCE`, `RIVER_KRATHONG_TAP_RADIUS`, `WCAG_MAX_FLASHES_PER_SECOND` | `@/config/gimmicks.config` | Step 2 | owner tuning, MFW-33 |
| `SceneEffects`, `SceneEffectsHandle` (`spawnRipple`, `lightLamp`, `activeCount`), `SceneGimmickKind` | `@/components/canvas3d/effects/SceneEffects` | Step 12 | **MFW-23** (release ripple via the same handle in RITUAL_RELEASE) |
| `isTapClick`, `tapPointInParentSpace` | `@/components/canvas3d/effects/tapPoint` | Step 9 | MFW-23 (drop point), later tap targets |
| `createRippleMesh`, `createLampGlowMesh`, `writeRippleInstances`, `writeLampGlowInstances`, `disposeEffectMesh` | `@/components/canvas3d/effects/effectMeshes` | Step 10 | MFW-34 (draw-call audit) |
| `RiverFlowItem.publicWishText?`, `RiverFlowProps.onItemTapped?` | `@/components/canvas3d/RiverFlow` | Step 13 | MFW-25 (fills the wish), MFW-30 (tap-to-find) |
| `RiverEnvironmentProps.onWaterSelected(tap: WorldXZ \| null)` | `@/components/models/loyKrathong` | Step 14 | MFW-23 |
| `InspectPopup`, `InspectPopupProps` | `@/components/ui/InspectPopup` | Step 18 | **MFW-31** (adds the owner's private view section), MFW-33 (2D host) |
| `InspectedCreation`, `pickInspectedCreation`, `findInspectedCreation` | `@/components/ui/inspectedCreation` | Step 15 | MFW-31, MFW-33 |
| `describeKrathongAppearance`, `AppearanceSummaryRow` | `@/components/ui/krathongAppearanceSummary` | Step 16 | MFW-30 (My Creations list), MFW-33 |
| `createReportSession`, `getReportSession`, `ReportSession`, `ReportSubmitOutcome` | `@/services/api` | Step 17 | MFW-33 (2D popup), moderation follow-ups |
| `INSPECT_POPUP_COPY`, `REPORT_REQUEST_TIMEOUT_MS` | `@/config/inspect.config` | Step 3 | owner copy edits |
| Section `data-last-gimmick`, `data-gimmick-count`; scene names `scene-ripples`, `scene-lamp-glows`, `river-bounce-<id>`, `river-hit-<id>` | `SceneViewport` / `SCENE_OBJECT_NAMES` | Steps 8, 13, 19 | e2e of later cards |

## 11. Open questions (owner)

Product decisions only. This card ships the default listed under each one. Each can be changed later in config or copy without rework.

1. **Inspect card look and copy.** Default: a card **below** the scene (not over it), with a text summary of the parts plus colour
   swatches, no 3D preview, and the DRAFT Thai copy in `INSPECT_POPUP_COPY` (title "กระทงในสายน้ำ", note "ไม่ระบุชื่อผู้ปล่อย", "ไม่มีคำอธิษฐานสาธารณะ").
   Options: a bottom sheet over the scene; a small 3D close-up (costs a second render target); other wording.
2. **Report UX.** Defaults: (a) a confirmation step before sending; (b) no Report button when the krathong has no public wish (the server
   counts only public-text items, MFW-13 D11); (c) "already reported" is remembered in memory for the page session only, so a reload allows
   another report. Options: one-tap report without a confirmation; always show the button; remember reported ids across reloads in LocalStorage
   (this stores which wishes a device reported, a privacy posture). It is linked to MFW-13 Open question 1 (anti-abuse).
3. **Gimmick tuning and per-tier caps (PLACEHOLDER).** `EFFECT_POOL_CAPS` (HIGH 8/6, MEDIUM 6/4, LOW 3/2 ripples/glows) is a per-tier budget
   like the owner's Q5 numbers. `RIPPLE_LOOK`, `LAMP_GLOW_LOOK` and `GIMMICK_BOUNCE` (colours, sizes, durations, flicker) are art values. Options:
   accept them for the private test, or tune them in config. The tests keep any tuning safe (flicker below 3 Hz, the bounce settles, caps do not
   increase toward LOW).
4. **Reduced-motion versions.** Defaults: the ripple appears at its final size and only fades; the lamp glows steadily (no flicker, no bounce);
   the krathong does not bounce, but the card still opens. Options: no ripple at all under reduced motion; no lamp fade.
5. **Lamp behaviour.** Default: a short light-up (about 1.6 s) that fades back, and the existing MFW-17 camera fly-to the lamp stays.
   Options: toggle the lamp on/off until tapped again; drop the camera flight for lamps.
6. **River krathong tap and the camera.** Default: bounce + card only, with no camera flight or highlight ring (the krathong drifts and the ring
   is sized for the large preview krathong). Options: fly to it and follow it (overlaps with MFW-30 Find My).
7. **The user's own preview krathong at the centre** in `SHARED_WORLD_EXPLORE` keeps its MFW-17 behaviour (select + fly) with no card, because it
   has no public record until MFW-23 releases it. Option: also bounce it / show the user's own appearance.

## 12. Decisions (lead, technical)

- **D1 — A framework-free, pre-allocated pool in `src/core/effects/`; when it is full, the oldest entry is recycled.** Every tap gets feedback
  and the cap still holds (invariant E). Pure code is unit-testable, and the 2D fallback can reuse it. Iteration uses `entryAt`, so there are
  no per-frame closures or iterators.
- **D2 — One `InstancedMesh` per effect kind, sized to the tier cap, additive, with a per-instance colour fade.** That is one draw call per kind
  while active and none while idle (`visible = false`). Nothing is created per tap. Additive blending lets a colour fade to black mean "fully
  transparent" without per-instance opacity. `frustumCulled = false` (instances move), and the raycast is a no-op (effects never block taps).
- **D3 — Closed-form time curves instead of springs** for the ripple, glow and tap bounce. This follows MFW-24's bobbing: deterministic,
  allocation-free, testable with an injected clock, and driven inside the existing demand-frame loop. Owner decision 11 chose react-spring as
  the animation *library*. This card adds no library, and react-spring stays in use for the camera flight and the part-change bounce.
- **D4 — The lamp light-up is an unlit shell, not a light.** Adding or removing lights forces shader recompiles and lights every fragment.
  MFW-27 also asserts that the candle is the only point light.
- **D5 — An invisible low-poly hit proxy per river krathong, sized from existing constants.** One 20-face mesh per krathong is raycast instead
  of about 20 part meshes. The target is larger than the model on a phone, and it is capped at half the no-overlap spacing, so neighbours'
  proxies never overlap.
- **D6 — The public wish travels on the river item (`RiverFlowItem.publicWishText?`).** The card shows exactly the item that was tapped and
  rendered, with no second lookup that could go out of sync. `pickInspectedCreation` is an explicit allowlist (invariant C). If MFW-25
  merges first, it copies the field (Step 14b).
- **D7 — The popup is a sibling of the scene section.** The section captures the pointer on pointerdown, which would retarget the popup's
  button clicks to the section.
- **D8 — Report client:** JSON body `{ creationId }` only, `202` = received, a timeout, an in-memory session de-duplication and no logging. The
  server is authoritative. MFW-13 returns the same 202 for counted and ignored reports, so the client shows one "received" message.
- **D9 — Gimmicks only in `WORLD_EXPLORE`.** This is the same gate as selection (MFW-44). `SceneEffects` is always mounted, and only spawning is
  gated, so MFW-23 can add a ritual ripple without restructuring.
- **D10 — Clicks that ended a drag spawn no gimmick** (`isTapClick`: R3F `delta` > `DRAG_START_DISTANCE_PX`). This reuses the existing gesture
  threshold. The existing selection behaviour is unchanged.
- **D11 — Effects live in the world-view group's local space.** The hit point is converted from world to parent space, so ripples stay on the
  water under the legacy pan/rotate and after the pan fix.
- **D12 — One bouncing krathong at a time and one bounce curve for lamp and krathong.** This keeps the bounce state at one small ref instead of
  a map, and gives one consistent "toy" feel.
- **D13 — The flicker adds two sines (periods ≥ 1000/3 ms) rather than multiplying them.** A product would create a sum frequency above 3 Hz
  (WCAG 2.3.1). The config test enforces it.
- **D14 — `data-last-gimmick` / `data-gimmick-count` on the section** are the test and e2e observables. They are cheap (one state update per
  tap, none per frame) and hold no ids or text.

## 13. Risks

- **MFW-13 interface drift.** If `reportTypes.ts` lands with different names or status codes, adapt `reportClient.ts` and list the differences in
  the PR. The 202 = received rule follows MFW-13 D10.
- **MFW-25 merge order.** If MFW-25 lands after this card, its plan says "never copy publicWishText". Its implementer must apply Step 14b. The
  reviewer of whichever card lands second should check that the card shows real wishes.
- **No end-to-end inspect test.** The app shows no river krathongs until MFW-25 feeds the store, and drifting krathongs have no stable screen
  position. The inspect flow is covered by component tests only. After MFW-25, the owner should do a manual check on the staging deployment:
  tap a krathong, read the wish, report it, and get "received".
- **First-tap shader compile.** Idle effect meshes are invisible and never compiled, so the first ripple or glow compiles a small
  `MeshBasicMaterial` instancing shader (a few ms on a phone). If `r3f-perf-reviewer` flags it, a follow-up can pre-compile through
  `gl.compile` with the meshes made visible for one frame.
- **Raycast cost with 80 krathongs.** Each tap raycasts up to 80 proxy spheres (bounding-sphere early-outs), plus the environment. Pointer-move
  is not affected, because R3F raycasts only objects with move handlers. This is well under a millisecond, but say so to the perf reviewer.
- **The glow is brighter than the krathong for about 1.6 s.** MFW-27's "krathong is the most prominent" rule covers the static palette. A
  transient tap effect is intended. The static test is unaffected.
- **e2e tap geometry.** `WATER_TAP_OFFSET_PX` depends on `CAMERA_FLIGHT_OFFSET`, `SCENE_CAMERA_ZOOM` and the river centreline. If one of them
  changes, recompute it (the formula is in the comment). Do not loosen the assertion.
- **Three taps within one frame** on three different krathongs can leave the first at a mid-bounce scale until its next tap (`resetId` holds
  one id). This is practically impossible at 60 Hz, and it is documented in the code.
