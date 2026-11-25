# MFW-23 [5.1] "Make & Release" ritual interaction — implementation spec

> Hand-off spec for one card. It is the source of truth for the implementer and the reviewer. If this file and
> `docs/backlog.json` / `docs/spec/open-questions.md` disagree, those files win; say so in the PR.
> Branch: `feat/MFW-23-make-release-ritual-interaction` · Jira: MFW-23 · Epic: MFW-22 (Loop 5)
> Labels: `loy-krathong`, `ritual` · Extra reviewers: `privacy-auditor` (the diff touches `src/services/**` and sends the raw owner
> token for the first time) and `r3f-perf-reviewer` (the diff touches `src/components/canvas3d/**`). The labels are not `privacy`/`db`, so by
> the loop rules this is not an owner-merge card. A FIX FIRST from either auditor still blocks the merge.

## 1. Summary (Goal)

This card closes the loop of the Loy Krathong flow: the user's own krathong waits on the pier (ท่าน้ำ), the user drags it onto the
water or presses "ปล่อยกระทง", a ripple spreads, the candle brightens, and the krathong drifts out into the shared river among other
people's krathongs. Spec §6.5 Task 5.1: "แสดง Preview กระทงของตัวเองก่อนวาง เมื่อผู้ใช้ลากกระทงลงสู่ผิวน้ำ (หรือกดปุ่ม "ปล่อยกระทง") จะเกิดวงน้ำ
กระเพื่อม (Ripple) แสงเทียนสว่างขึ้น และกระทงค่อยๆ เคลื่อนออกสู่สายน้ำส่วนรวม". The release saves the creation through `POST /api/creations`
(MFW-45) with a `SplinePathCoord`, the composed wish (MFW-21) and the device's raw owner token in the JSON body. If the chosen spot is taken,
the krathong plays a short procedural bump and settles in the nearest free spot; the server's returned coord is final (owner decision 25).
Failures (network, 503, closed event, server-side moderation block) are handled with Thai copy, and FALLBACK_2D releases through the same
button with no canvas and no three.js download.

## 2. Prerequisites

Merged on `main` (read the real code with `git show origin/main:<path>`; main = `adda547` when this plan was written):

| Card | What this card uses |
|---|---|
| MFW-7 [1.1] | `src/core/flow` (`FLOW_TRANSITIONS`, `transition`, `FlowEvent`), `useUIStore` (`flowState`, `selectedEventId`, `dispatch`) |
| MFW-8 [1.2] | `src/core/coordinates`: `SplinePathCoord`, `locateOnLane`, `splineProgressToWorld`, `splineCoordToPoseInto`, `createSplinePoseOut`, `LATERAL_OFFSET_RANGE`, `RiverLane`, `RiverLaneSet`, `RiverPlacementSource`, `WorldXZ`, `WorldVec3` |
| MFW-9 [1.3] | `useDeviceStore` (`profiled`, `qualityTier`, `reducedMotion`) |
| MFW-11 [2.1] | `getDeviceOwnerVault().getOrCreate()` → `{ token, persisted }`, `DeviceOwnerToken`, `isDeviceOwnerToken` (`@/services/auth`); `DEVICE_OWNER_TOKEN_STORAGE_KEY` |
| MFW-12 [2.2] | `PublicCreation`, `PUBLIC_CREATION_KEYS` (`@/services/api/creationTypes`), `ZONE_ITEM_CAP`, `ZONE_ID_MIN` (`@/config/world.config`) |
| MFW-13 [2.3] | `parseModerationBlockedBody`, `ModerationReason` (`@/services/moderation`, `@/config/moderation.config`) |
| MFW-16/17/44 | `createInputSeparator` (RITUAL_RELEASE drag → `DRAG_KRATHONG` / `RELEASE_KRATHONG`), `getCameraFlightPose`, `CameraFlightController` (internal to `src/components/canvas3d/index.tsx`), lazy scene chunk |
| MFW-19 [4.1] | `KrathongModel`, `KrathongAssetsProvider`, `DEFAULT_KRATHONG_APPEARANCE`, `serializeKrathongAppearance` (`@/core/customization/krathongAppearance`) |
| MFW-20 [4.2] | `useBuilderStore.appearance`, `PartChangeBounce` |
| MFW-24 [5.2] | `getLoyKrathongRiverLanes`, `RiverSpot`, `riverSpotLateralLimit`, `isSpotFree`, `findNearestFreeSpot`, `riverCoordFromSpot`, `prepareRiverItems`, `applyRiverItemTransform`, `createRiverFrameScratch`, `RiverFlow` (`now` prop), `RIVER_DRIFT_SPEED_FACTOR`, `RIVER_KRATHONG_SCALE`, `RIVER_COLLISION_RADIUS`, `LOY_KRATHONG_RIVER_LANE_ID`, `LOY_KRATHONG_RIVER_LANE_WIDTH` |
| MFW-27 [6.1] | `LOY_KRATHONG_RIVER_LAYOUT` (`.pier.tip`, `.pier.releasePoint`, `.channel`, `.waterSurfaceY`), `LOY_KRATHONG_PIER`, `LOY_KRATHONG_RIVER_CHANNEL`, `SCENE_OBJECT_NAMES`, `TOY_SCENE_LIGHTING.candle` |

**Must be merged before you start. If any of these is not on `main`, stop and report `needs-human` (do not build their parts):**
MFW-21 [4.3], MFW-45 [2.4] (both are backlog blockers of 5.1), MFW-25 [5.3] and MFW-28 [6.2]. Their plans are on the
`docs/card-specs-wave4` branch (`docs/plans/MFW-21.md`, `MFW-45.md`, `MFW-25.md`, `MFW-28.md`). Every name below from them is an
**ASSUMED INTERFACE (from MFW-<x> plan)**. Before coding, `rg` each name on `main`; if a merged name or shape differs, use the merged one,
change only the adapter line in this card, and list every difference in the PR.

- **ASSUMED INTERFACE (from MFW-21 plan):** `useBuilderStore` state `wish: ComposedWish | null`, `wishServerReasons`, action
  `rejectWishFromServer(body: unknown): boolean`; `@/services/api/wishPayload`: `evaluateWishDraft(draft: { text: string; visibility: WishVisibility | null }) => { ok: true; wish: ComposedWish } | { ok: false; issues; moderationReasons }`
  (throws `TypeError` on a malformed draft), `toWishRequestFields(wish) => { wishText: string; wishVisibility: WishVisibility }`;
  `WishVisibility = "private" | "public"` in `@/config/wish.config`; WishModal reopens with the stored wish and shows `wishServerReasons`
  (`data-testid="wish-moderation-warning"`); e2e helper `completeWishStep(page, text?)` in `tests/e2e/helpers/wishStep.ts` (private wish
  `CLEAN_WISH = "ขอให้ทุกคนมีความสุข"`). MFW-21 keeps the flow forward-only; this card adds the only back edge (Step 4).
- **ASSUMED INTERFACE (from MFW-45 plan):** `POST /api/creations`, JSON body with exactly the six keys of `CREATE_CREATION_BODY_KEYS`
  (`eventId`, `appearance`, `coord`, `wishText`, `wishVisibility`, `ownerToken`) → 201 `{ creation: PublicCreation }` · 400
  `{ error: "invalid_body", field }` · 409 `{ error: "event_closed" }` · 413 · 415 · 422 `ModerationBlockedBody` · 503 `{ error: "unavailable" }`.
  Types `CreateCreationRequestBody`, `CreateCreationResponseBody` from the `@/services/api` barrel. The server reads the client coord's
  `spawnProgress`/`lateralOffset` as the desired spot **at server time**, forces `speedFactor = RIVER_DRIFT_SPEED_FACTOR`, re-checks
  collisions and may move the spot (MFW-45 D8). Outside `VERCEL_ENV=production` the route uses the in-memory backend. Unit fixture
  `OWNER_TOKEN_FIXTURE` in `@/services/api/__fixtures__/createCreation`.
- **ASSUMED INTERFACE (from MFW-25 plan):** `CREATIONS_API_PATH = "/api/creations"` (`@/services/api/apiPaths`); `useWorldStore` fields
  `eventId`, `currentZoneId`, `zoneStatus`, `zoneItems: readonly PublicCreation[]`; `getZonePagination()` with `enterWorld(eventId)`,
  `loadZone(zoneId)`, `leaveWorld()`; `publicCreationsToRiverItems(creations, { eventId, zoneId })` (`@/core/world`); FlowRoot's
  `useEffect` that calls `enterWorld` in `SHARED_WORLD_EXPLORE`; SceneViewport's `visibleRiverItems` (store items in WORLD_EXPLORE, `riverItems`
  prop overrides).
- **ASSUMED INTERFACE (from MFW-28 plan):** in `SceneViewport`: `effectsRef: RefObject<SceneEffectsHandle | null>` with
  `spawnRipple(at: WorldXZ)` (world-view-group-local point; pooled, capped per tier by `EFFECT_POOL_CAPS`), `recordGimmick("ripple")`
  (→ section `data-last-gimmick`); `SceneEffects` is always mounted inside the world-view group, also in `RITUAL_RELEASE`. This card
  creates **no** ripple mesh or pool of its own.

## 3. Acceptance criteria → checks

AC (verbatim, `docs/backlog.json` story 5.1):

1. **"Pier scene previews the user's own krathong before release"**
   - In `RITUAL_RELEASE` the camera frames the pier: one camera flight to `LOY_KRATHONG_RIVER_LAYOUT.pier.tip` at mount (instant cut under reduced
     motion); taps still never select: `src/components/canvas3d/index.test.tsx` → "RITUAL_RELEASE frames the pier once" and the updated
     "RITUAL_RELEASE taps never select a target".
   - The user's own krathong (builder appearance) stands on the pier tip at river scale, facing the flow: `src/components/canvas3d/ownKrathongPose.test.ts`
     → "PIER pose" (position = tip, scale = `RIVER_KRATHONG_SCALE`, yaw = lane yaw at the release spot); the section reports
     `data-own-krathong-pose="PIER"`: `index.test.tsx` → "ritual preview".
   - The pier tip is the screen centre of the ritual view, and the drag handle sits on it: `src/components/canvas3d/ritualSite.test.ts` →
     "the ritual view centres the pier tip" (NDC (0, 0) ± 1e-9) and `RITUAL_CHIP_START_PERCENT` = 50/50.
   - E2E: `tests/e2e/ritual-release.spec.ts` → "3D: releases from the pier" sees the canvas and `data-own-krathong-pose="PIER"` before the release.
2. **"Drag into water or press "ปล่อยกระทง" → ripple, candle brightens, krathong drifts out into the shared river"**
   - Button: `RitualReleasePanel.test.tsx` → "the button releases from the pier"; FALLBACK_2D works (button only, no canvas, no WebGL chunk):
     `ritual-release.spec.ts` → "FALLBACK_2D releases with the button" and the updated `tests/e2e/scene-gating.spec.ts`.
   - Drag: a drop on the water releases with the dropped lane location; a drop on a bank snaps back and shows "วางกระทงบนผิวน้ำเพื่อปล่อย":
     `index.test.tsx` → "a drag onto the water releases there" and "a drop on the bank does not release"; e2e → "3D: drag onto the water".
   - Ripple: touchdown calls MFW-28's `spawnRipple` at the touchdown point exactly once per release (`data-last-gimmick="ripple"`):
     `index.test.tsx` → "touchdown ripples once".
   - Candle: the candle point light springs from `TOY_SCENE_LIGHTING.candle.intensity` to `× RELEASE_CANDLE.brightenFactor` at touchdown, instantly
     under reduced motion, and back on failure: `src/core/ritual/releaseMotion.test.ts`; still exactly one point light: `index.test.tsx`.
   - Drift out: after the server answers, the krathong settles onto its live river pose (`splineCoordToPoseInto` of the saved coord with the
     server-corrected clock) and then follows it with bobbing in `SHARED_WORLD_EXPLORE` (`data-own-krathong-pose="RIVER"`):
     `ownKrathongPose.test.ts` → "RELEASING pose" and "RIVER pose"; `index.test.tsx` → "after the release the own krathong rides the river";
     the flow reaches `SHARED_WORLD_EXPLORE` only after the settle: `FlowRoot.test.tsx` → "release finishes the ritual".
   - The user's own zone is shown after the release: `releaseCreation.test.ts` → "loads the creation's zone when another zone is visible".
3. **"Creation is saved with a SplinePathCoord"**
   - The POST body has exactly the six keys; `coord` has exactly the five `SPLINE_PATH` keys, `speedFactor = RIVER_DRIFT_SPEED_FACTOR`, no
     `x`/`y`/`z`/`position`; `ownerToken` only in the body, never in the URL; the URL is `CREATIONS_API_PATH` with no query:
     `src/services/api/createCreationClient.test.ts` and `releaseCreation.test.ts` → "builds the request"; e2e → "3D: releases from the pier".
   - `buildReleaseCoord(spot)` equals MFW-24's `riverCoordFromSpot(spot, t)` for any `t` and passes `parsePersistableCoord`:
     `src/core/ritual/releaseCoord.test.ts`.
   - The saved state keeps the **server's** coord and `createdAt` (not the client's): `releaseCreation.test.ts` → "the server coord is final".
4. **"Releasing onto another krathong collides instead of overlapping (open question 25): a short procedural bump plays (instant under reduced
   motion) and the new krathong settles in the nearest free spot, which is the coord that is saved"**
   - Client pre-check (3D tiers): a candidate within `RIVER_MIN_CENTER_SPACING` of a visible krathong resolves to MFW-24's nearest free spot and
     `collided: true`: `src/core/world/releaseSpot.test.ts`; the request coord is that free spot: `releaseCreation.test.ts` → "sends the free spot".
   - Server move: a response coord that differs from the sent one sets `movedByServer: true`: `releaseCoord.test.ts` → `didServerMoveSpot`.
   - Bump: plays once per release when `collided || movedByServer`, from `RELEASE_BUMP.fromValue` to rest with a spring, and as an immediate set
     under reduced motion: `releaseMotion.test.ts` and `index.test.tsx` → "bump plays once"; e2e → "server moved the spot" (`data-ritual-bumped="true"`).
   - Settles in the nearest free spot = the saved coord: the settle target is the server coord (`ownKrathongPose.test.ts`), and the own river item
     after the release is built from the server coord (`releaseCreation.test.ts` → "the server coord is final").

Invariant checks (CLAUDE.md):

| Invariant | Check |
|---|---|
| A | The request coord is built only by `buildReleaseCoord` (5 keys); `createCreationClient.test.ts` rejects a response coord with `x`; no world position in any request or store field that is sent; `tests/unit/no-raw-xyz-persistence.test.ts` stays green |
| B | The release coord is the same `SplinePathCoord` the 3D river and the 2D projection read; `ritualSite.test.ts` round-trips screen ↔ deck plane ↔ lane location (1e-6) |
| C | Raw token only in the POST JSON body; never in a URL, store, log or `data-*`; the saved creation in `useUIStore` holds no private field: `releaseCreation.test.ts` → "keeps private data out of stores"; the private wish text is cleared from `useBuilderStore` after a save |
| E | Ripples come from MFW-28's pool (no new effect objects); river items + own krathong ≤ `ZONE_ITEM_CAP`: `ownKrathong.test.ts` → `excludeOwnAndCap` |
| F | Every animation has a reduced-motion branch (camera cut, immediate springs, MFW-28 ripple fades only); tests listed above |
| G | Server enforces moderation (MFW-45); a 422 returns the user to the wish step with the server reasons: `releaseCreation.test.ts` → "moderation-blocked" |
| MFW-44 | The landing graph stays free of three/R3F/react-spring: `tests/unit/landing-import-graph.test.ts`; FALLBACK_2D downloads no WebGL chunk (e2e) |

## 4. Owner decisions that apply

Quoted from `docs/spec/open-questions.md` and CLAUDE.md. Do not reopen them.

- Row 1: "the device keeps the raw DeviceOwnerToken in LocalStorage; the server stores only SHA-256(token). To prove ownership the device sends the raw
  token over HTTPS to the ownership-proof endpoint (POST body or Authorization header, never a URL or query string) … the raw token is never stored or
  logged server-side". This card sends it only in the POST JSON body of the create call.
- Row 4: "80 items per zone". Row 6: speedFactor is progress per **second**, `createdAt`/`now` are epoch ms.
- Row 11: "@react-spring/three" for procedural micro-animation (no physics).
- Row 12: "creation ids are kept in LocalStorage next to the token" — implemented by MFW-30; this card only exposes a listener hook.
- Row 13: "profanity is blocked from public_wish_text" — enforced by MFW-21 (client) and MFW-45 (server); this card handles the server's 422.
- Row 16: build engine pieces generically, finish Loy Krathong only as far as the private test needs.
- Row 21: "one single wide lane per river". Row 23: "krathongs keep drifting; only the bobbing stops" (reduced motion).
- Row 25: "no overlap — releasing onto another krathong collides instead … every krathong drifts at the same speed … on release, a spot within the
  collision radius of another krathong plays a short procedural bump and the new krathong settles in the nearest free spot, which is the coord that is
  saved; the server re-checks the spot against the zone and moves it to the nearest free spot if two releases race".
- Launch plan (CLAUDE.md): Loy Krathong only; no Christmas work.

Row 25 already names MFW-23 in "Decide in" and is decided; no row needs an update.

## 5. Files

| Path | New/modify | Purpose |
|---|---|---|
| `src/config/ritual.config.ts` (+ `.test.ts`) | new | Release motion springs, bump, candle, tolerances, timeout, Thai copy |
| `src/config/events/loyKrathong.river.config.ts` | modify | `LOY_KRATHONG_PIER_RELEASE_SPOT` (three-free lane location of the pier release point) |
| `src/config/events/loyKrathong.river.release.test.ts` | new | Pins that constant to `locateOnLane` + `riverSpotLateralLimit` |
| `src/config/interaction.config.ts` | modify | `RITUAL_CHIP_START_PERCENT` y 55 → 50 |
| `src/core/flow/flowStateMachine.ts` (+ test) | modify | `REVISE_WISH`: RITUAL_RELEASE → WRITE_WISH |
| `src/core/ritual/ritualStateMachine.ts` (+ test) | new | Pure release reducer (`RitualState`, `transitionRitual`) |
| `src/core/ritual/releaseCoord.ts` (+ test) | new | `buildReleaseCoord`, `isSplinePathCoordShape`, `didServerMoveSpot` (three-free) |
| `src/core/ritual/serverClock.ts` (+ test) | new | `estimateServerClockOffsetMs` |
| `src/core/ritual/releaseMotion.ts` (+ test) | new | Spring choreography with a reduced-motion branch |
| `src/core/ritual/ownKrathong.ts` (+ test) | new | `ownKrathongPoseKind`, `isOwnZoneVisible`, `excludeOwnAndCap` |
| `src/core/ritual/index.ts` | modify | Barrel (keep the comment line) |
| `src/core/world/releaseSpot.ts` (+ test) | new | Client collision pre-check (three; lazy-loaded) |
| `src/core/world/index.ts` | modify | `export * from "./releaseSpot";` |
| `src/store/useUIStore.ts` (+ test) | modify | `ritual` state, `dispatchRitual`; REVISE_WISH resets the ritual |
| `src/services/api/createCreationClient.ts` (+ test) | new | Client POST + response allowlist (three-free) |
| `src/services/api/releaseCreation.ts` (+ test) | new | Release orchestrator (token, wish, coord, POST, stores, zone, hooks) |
| `src/components/canvas3d/sceneObjectNames.ts` | modify | `krathongPose`, `pierFocus` |
| `src/components/canvas3d/ritualSite.ts` (+ test) | new | Pier site values, ritual view camera, screen → deck plane → lane mapping |
| `src/components/canvas3d/ownKrathongPose.ts` (+ test) | new | Allocation-free per-frame pose writer |
| `src/components/canvas3d/OwnKrathong.tsx` | new | Pose group + krathong group + animated candle + springs |
| `src/components/canvas3d/index.tsx` (+ `index.test.tsx`) | modify | Ritual framing, chip drag/drop, own krathong, ripple at touchdown, river items without own, server clock |
| `src/components/ui/RitualReleasePanel.tsx` (+ test) | new | Button, status line, FALLBACK_2D completion |
| `src/components/ui/FlowRoot.tsx` (+ test) | modify | Panel, drop wiring, FINISH_RITUAL on RELEASED, world loaded from RITUAL_RELEASE, `data-ritual-*` |
| `tests/unit/landing-import-graph.test.ts` | new | Static graph from `src/app/page.tsx` has no three/R3F/react-spring |
| `tests/e2e/fixtures/ritualRoutes.ts` | new | `mockCreateCreation(page, options)` (route interception, no `src/` imports) |
| `tests/e2e/ritual-release.spec.ts` | new | The user flows below |
| `tests/e2e/flow.spec.ts`, `scene-gating.spec.ts`, `river-environment.spec.ts` | modify | One `mockCreateCreation(page)` line each |

## 6. Implementation steps (Plan)

"PLACEHOLDER (spec silent)" = the spec gives no value; keep it as given and list it in the PR under "Decisions" (owner may tune, §11 Q7).
Scene component files (`src/components/canvas3d/**`, `src/components/models/**`) may contain **no hex colour and no decimal literal**, also in
comments (`tests/unit/scene-art-constants.test.ts`): write card ids as `MFW-23`, never "5.1". Every number lives in config.

### Step 1 — `src/config/ritual.config.ts` (new; no imports)

```ts
/** Release ritual (backlog story "Make & Release", MFW-23). Feel values are PLACEHOLDER (spec silent); see plan §11 Q7. */

/** spec §4.1: lateralOffset ∈ [-0.5, 0.5]. Three-free copy of LATERAL_OFFSET_RANGE[1] (pinned by ritual.config.test.ts). */
export const SPLINE_LATERAL_OFFSET_LIMIT = 0.5;

/** Spring progress values: 0 = start pose, 1 = end pose. */
export const RELEASE_MOTION_START = 0;
export const RELEASE_MOTION_END = 1;

/** Krathong from the pier (or the drop point at deck height) down to the water. PLACEHOLDER. */
export const RELEASE_LOWER_SPRING = Object.freeze({ mass: 1, tension: 140, friction: 22 });
/** Touchdown point → saved river spot. PLACEHOLDER. */
export const RELEASE_SETTLE_SPRING = Object.freeze({ mass: 1, tension: 90, friction: 20 });
/** Collision bump (owner decision 25): a hop that springs back to rest. hopHeight in world units. PLACEHOLDER. */
export const RELEASE_BUMP = Object.freeze({
  hopHeight: 0.08,
  fromValue: 1,
  restValue: 0,
  spring: Object.freeze({ mass: 1, tension: 320, friction: 8 }),
});
/** "แสงเทียนสว่างขึ้น": candle point light intensity × brightenFactor at touchdown. PLACEHOLDER. */
export const RELEASE_CANDLE = Object.freeze({
  brightenFactor: 1.8,
  spring: Object.freeze({ mass: 1, tension: 120, friction: 26 }),
});

/** Float tolerance when comparing a sent coord with the server's (JSON round-trips doubles exactly). Lead decision, MFW-23. */
export const RELEASE_SPOT_MATCH_EPSILON = 1e-9;
/** Client timeout of POST /api/creations; then the release fails with "timeout" (shown as a network error). Lead decision, MFW-23. */
export const CREATE_CREATION_TIMEOUT_MS = 15_000;

/** Thai UI copy. PLACEHOLDER wording except the two strings marked "existing" (plan §11 Q6). */
export const RITUAL_COPY = Object.freeze({
  panelLabel: "พิธีปล่อยกระทง",
  hint: "ลากกระทงลงน้ำ หรือกดปุ่มปล่อยกระทง", // existing (FlowStepPlaceholder)
  releaseButton: "ปล่อยกระทง", // existing
  releasing: "กำลังปล่อยกระทง…",
  dropOnWater: "วางกระทงบนผิวน้ำเพื่อปล่อย",
  errors: Object.freeze({
    network: "เชื่อมต่อไม่ได้ ลองกดปล่อยกระทงอีกครั้ง",
    timeout: "เชื่อมต่อไม่ได้ ลองกดปล่อยกระทงอีกครั้ง",
    unavailable: "ยังบันทึกกระทงไม่ได้ในขณะนี้ ลองใหม่อีกครั้งภายหลัง",
    event_closed: "ช่วงเวลาปล่อยกระทงของเทศกาลนี้ปิดแล้ว",
    rejected: "บันทึกกระทงไม่สำเร็จ ลองอีกครั้ง",
    invalid_response: "บันทึกกระทงไม่สำเร็จ ลองอีกครั้ง",
    unexpected: "บันทึกกระทงไม่สำเร็จ ลองอีกครั้ง",
  }),
});
```

`src/config/ritual.config.test.ts` (node): `SPLINE_LATERAL_OFFSET_LIMIT === LATERAL_OFFSET_RANGE[1]`; every spring has finite `mass/tension/friction > 0`;
`RELEASE_CANDLE.brightenFactor > 1`; `RELEASE_BUMP.hopHeight > 0`; `RITUAL_COPY.errors` has a non-empty string for every `RitualErrorKind`
(import the kind list from Step 5a); `RITUAL_COPY.releaseButton === "ปล่อยกระทง"`.

### Step 2 — `src/config/events/loyKrathong.river.config.ts` (modify: append after `LOY_KRATHONG_PIER`)

Add `import { RIVER_COLLISION_RADIUS } from "@/config/riverFlow.config";` and
`import { SPLINE_LATERAL_OFFSET_LIMIT } from "@/config/ritual.config";` (both are import-free data files, no cycle), then:

```ts
/**
 * Lane location of the pier release point (LOY_KRATHONG_RIVER_LAYOUT.pier.releasePoint), clamped to the krathong body limit
 * (riverSpotLateralLimit). Three-free so the FALLBACK_2D release needs no lane math (MFW-23). Valid because the single lane shares the channel
 * centreline in xz, so the pier's channel progress is its lane progress. Pinned by loyKrathong.river.release.test.ts.
 */
const PIER_RELEASE_LATERAL_OFFSET =
  (LOY_KRATHONG_PIER.side *
    (LOY_KRATHONG_RIVER_CHANNEL.width / 2 - LOY_KRATHONG_PIER.overWaterLength - LOY_KRATHONG_PIER.releaseInset)) /
  LOY_KRATHONG_RIVER_LANE_WIDTH;
const KRATHONG_LATERAL_LIMIT = SPLINE_LATERAL_OFFSET_LIMIT - RIVER_COLLISION_RADIUS / LOY_KRATHONG_RIVER_LANE_WIDTH;

export const LOY_KRATHONG_PIER_RELEASE_SPOT = Object.freeze({
  laneId: LOY_KRATHONG_RIVER_LANE_ID,
  progress: LOY_KRATHONG_PIER.progress,
  lateralOffset: Math.min(KRATHONG_LATERAL_LIMIT, Math.max(-KRATHONG_LATERAL_LIMIT, PIER_RELEASE_LATERAL_OFFSET)),
});
```
Place the constant **below** `LOY_KRATHONG_RIVER_LANE_ID`, `LOY_KRATHONG_RIVER_LANE_WIDTH`, `LOY_KRATHONG_RIVER_CHANNEL` and `LOY_KRATHONG_PIER`
(module order matters). Lead probe on main: release point → lane `{ progress: 0.4000000000000001, lateralOffset: 0.39583 }`, limit 0.38083,
so the constant is `{ laneId: 1, progress: 0.4, lateralOffset: 0.38083… }`.

`src/config/events/loyKrathong.river.release.test.ts` (node): with `lane = getLoyKrathongRiverLanes().get(LOY_KRATHONG_RIVER_LANE_ID)!` and
`loc = locateOnLane(lane, LOY_KRATHONG_RIVER_LAYOUT.pier.releasePoint)`, `lim = riverSpotLateralLimit(lane)`:
`progress` `toBeCloseTo(loc.progress, 9)`; `lateralOffset` `toBeCloseTo(Math.min(lim, Math.max(-lim, loc.lateralOffset)), 9)`;
`laneId === LOY_KRATHONG_RIVER_LANE_ID`; the object is frozen.

### Step 3 — `src/config/interaction.config.ts` (modify one value)

`RITUAL_CHIP_START_PERCENT = Object.freeze({ x: 50, y: 50 })` (was 55). Update its comment: "The ritual camera centres the pier tip (MFW-23), so the
drag handle starts on the preview krathong." Keep the clamp constants.

### Step 4 — `src/core/flow/flowStateMachine.ts` (modify)

- `FlowEvent` gains `| { type: "REVISE_WISH" }`; `FLOW_EVENT_TYPES` gains `"REVISE_WISH"` (last).
- `RITUAL_RELEASE: Object.freeze({ FINISH_RITUAL: "SHARED_WORLD_EXPLORE", REVISE_WISH: "WRITE_WISH" })`.
- Comment: "Forward-only, except REVISE_WISH: a server-side moderation block sends the user back to the wish (MFW-23)."
- Test (`flowStateMachine.test.ts`): add `["RITUAL_RELEASE", "REVISE_WISH", "WRITE_WISH"]` to `VALID`; the "every other pair" count becomes
  `5 × 5 − 5 = 20`; the eventId carry-through test is unchanged. If MFW-21 already added an equivalent back edge, reuse it instead.

### Step 5 — `src/core/ritual/*` (new; all three-free, no React, no stores, no I/O)

Allowed imports: `@/config/*`, `@/core/math/*`, `@/core/interaction` (types), and `import type` from `@/core/coordinates/*` and
`@/core/world/riverCollision`. Never a value import from `@/core/coordinates` or `@/core/world` (they load three).

#### 5a — `ritualStateMachine.ts`

```ts
import type { RiverSpot } from "@/core/world/riverCollision";
import type { SplinePathCoord } from "@/core/coordinates/SplinePathCoord";

export type RitualPhase = "IDLE" | "RELEASING" | "RELEASED";
/** How a release started. Parametric only: the drop's world point stays in the 3D layer (invariant A). */
export type ReleaseOrigin =
  | { readonly kind: "pier" }
  | { readonly kind: "drop"; readonly candidate: RiverSpot };
export const RITUAL_ERROR_KINDS = Object.freeze([
  "network", "timeout", "unavailable", "event_closed", "rejected", "invalid_response", "unexpected",
] as const);
export type RitualErrorKind = (typeof RITUAL_ERROR_KINDS)[number];
export interface RitualError { readonly kind: RitualErrorKind; }
export type RitualHint = "DROP_ON_WATER";

/** What the client keeps of a saved creation: public, parametric, no wish text (invariant C). */
export interface SavedRelease {
  readonly id: string;
  readonly zoneId: number;
  readonly coord: SplinePathCoord;      // the SERVER's final coord
  readonly createdAtMs: number;         // Date.parse(creation.createdAt), server time
  readonly serverClockOffsetMs: number; // estimateServerClockOffsetMs
  readonly movedByServer: boolean;      // didServerMoveSpot(sent, final)
}

export interface RitualState {
  readonly phase: RitualPhase;
  readonly attempt: number;            // 0 before the first release; RELEASE_STARTED uses attempt + 1; never reset
  readonly origin: ReleaseOrigin | null;
  readonly landing: RiverSpot | null;  // the spot sent to the server (client pre-check), null until LANDING_RESOLVED
  readonly collided: boolean;          // the client pre-check moved the candidate
  readonly touchedDown: boolean;       // lowering finished: ripple + candle
  readonly instant: boolean;           // no scene animates this ritual (FALLBACK_2D or the scene is gone)
  readonly saved: SavedRelease | null;
  readonly error: RitualError | null;
  readonly hint: RitualHint | null;
}

export type RitualEvent =
  | { readonly type: "RELEASE_STARTED"; readonly attempt: number; readonly origin: ReleaseOrigin }
  | { readonly type: "LANDING_RESOLVED"; readonly attempt: number; readonly landing: RiverSpot; readonly collided: boolean }
  | { readonly type: "TOUCHED_DOWN"; readonly attempt: number }
  | { readonly type: "SAVED"; readonly attempt: number; readonly saved: SavedRelease }
  | { readonly type: "SETTLED"; readonly attempt: number }
  | { readonly type: "SAVE_FAILED"; readonly attempt: number; readonly error: RitualError }
  | { readonly type: "SKIP_ANIMATION" }
  | { readonly type: "DROP_REJECTED" }
  | { readonly type: "RESET" };

export const INITIAL_RITUAL_STATE: RitualState = Object.freeze({
  phase: "IDLE", attempt: 0, origin: null, landing: null, collided: false, touchedDown: false,
  instant: false, saved: null, error: null, hint: null,
});

/** Pure. Any event that does not apply returns `s` itself (same reference). */
export function transitionRitual(s: RitualState, e: RitualEvent): RitualState;
/** True when the bump must play: client collision or server move. */
export function isRitualBumped(s: RitualState): boolean; // s.collided || (s.saved?.movedByServer ?? false)
```
`transitionRitual` rules (`match` = `s.phase === "RELEASING" && e.attempt === s.attempt`); return frozen new objects:
- `RELEASE_STARTED`: only if `s.phase === "IDLE" && e.attempt === s.attempt + 1` →
  `{ ...INITIAL_RITUAL_STATE, phase: "RELEASING", attempt: e.attempt, origin: e.origin, instant: s.instant, touchedDown: s.instant }`.
- `LANDING_RESOLVED`: `match && s.landing === null` → `{ ...s, landing: e.landing, collided: e.collided }`.
- `TOUCHED_DOWN`: `match && !s.touchedDown` → `{ ...s, touchedDown: true }`.
- `SAVED`: `match && s.saved === null` → `{ ...s, saved: e.saved }`; if `s.instant` also `touchedDown: true, phase: "RELEASED"`.
- `SETTLED`: `match && s.touchedDown && s.saved !== null` → `{ ...s, phase: "RELEASED" }`.
- `SAVE_FAILED`: `match` → `{ ...INITIAL_RITUAL_STATE, attempt: s.attempt, instant: s.instant, error: e.error }`.
- `SKIP_ANIMATION`: if `s.instant` → `s`. Else `instant: true`; if `RELEASING` also `touchedDown: true`, and if `saved !== null` also `phase: "RELEASED"`.
- `DROP_REJECTED`: only in `IDLE` → `{ ...s, hint: "DROP_ON_WATER", error: null }` (same reference if already so).
- `RESET`: `{ ...INITIAL_RITUAL_STATE, attempt: s.attempt }`.

#### 5b — `releaseCoord.ts`

```ts
import { RIVER_DRIFT_SPEED_FACTOR } from "@/config/riverFlow.config";
import { RELEASE_SPOT_MATCH_EPSILON, SPLINE_LATERAL_OFFSET_LIMIT } from "@/config/ritual.config";
import { wrap01 } from "@/core/math/wrap01";
import type { SplinePathCoord } from "@/core/coordinates/SplinePathCoord";

export interface LaneSpotLike { readonly laneId: number; readonly progress: number; readonly lateralOffset: number; }

/** The coord for a spot chosen now: three-free twin of riverCoordFromSpot(spot, t) (createdAt = now ⇒ spawnProgress = progress). */
export function buildReleaseCoord(spot: LaneSpotLike): SplinePathCoord;
/** Shallow three-free shape check of an untrusted coord (exactly 5 keys). The 3D chunk deep-validates again (prepareRiverItems). */
export function isSplinePathCoordShape(value: unknown): value is SplinePathCoord;
/** True when the server stored a different spot than the one sent (lane, circular progress or lateral beyond RELEASE_SPOT_MATCH_EPSILON). */
export function didServerMoveSpot(sent: SplinePathCoord, final: SplinePathCoord): boolean;
```
- `buildReleaseCoord`: throw `RangeError` unless `Number.isInteger(laneId) && laneId >= 0`, `Number.isFinite(progress)`, `Number.isFinite(lateralOffset)`.
  Return `{ mode: "SPLINE_PATH", laneId, spawnProgress: wrap01(progress), speedFactor: RIVER_DRIFT_SPEED_FACTOR,
  lateralOffset: Math.min(SPLINE_LATERAL_OFFSET_LIMIT, Math.max(-SPLINE_LATERAL_OFFSET_LIMIT, lateralOffset)) }` (this key order).
- `isSplinePathCoordShape`: plain object (`Object.getPrototypeOf(v) === Object.prototype || === null`), `Object.keys(v).sort()` equals
  `["laneId", "lateralOffset", "mode", "spawnProgress", "speedFactor"]`, `mode === "SPLINE_PATH"`, `Number.isSafeInteger(laneId) && laneId >= 0`,
  `spawnProgress` finite in `[0, 1]`, `speedFactor` finite `>= 0`, `lateralOffset` finite in `[-SPLINE_LATERAL_OFFSET_LIMIT, SPLINE_LATERAL_OFFSET_LIMIT]`.
- `didServerMoveSpot`: `d = Math.abs(sent.spawnProgress - final.spawnProgress) % 1; circ = Math.min(d, 1 - d);`
  return `sent.laneId !== final.laneId || circ > RELEASE_SPOT_MATCH_EPSILON || Math.abs(sent.lateralOffset - final.lateralOffset) > RELEASE_SPOT_MATCH_EPSILON`.

#### 5c — `serverClock.ts`

```ts
/** Server − client clock offset from one request: Date.parse(serverIso) − (sentAtMs + receivedAtMs) / 2. Any non-finite input → 0. */
export function estimateServerClockOffsetMs(serverIso: string, sentAtMs: number, receivedAtMs: number): number;
```
Used as `now = () => Date.now() + offset` for every river pose after a release, so the user's own krathong lands where it was released even on a
skewed device clock (follow-up from the MFW-24 review). All krathongs share the same `now`, so spacing is unchanged.

#### 5d — `releaseMotion.ts` (mirrors `src/core/customization/partChangeBounce.ts`)

```ts
import { RELEASE_BUMP, RELEASE_CANDLE, RELEASE_LOWER_SPRING, RELEASE_MOTION_END, RELEASE_MOTION_START, RELEASE_SETTLE_SPRING } from "@/config/ritual.config";

export interface ReleaseSpringConfig { readonly mass: number; readonly tension: number; readonly friction: number; }
export interface ScalarSpringStart {
  readonly from?: { readonly value: number };
  readonly to: { readonly value: number };
  readonly immediate: boolean;
  readonly config?: ReleaseSpringConfig;
  readonly onRest?: () => void; // called once when the animation finishes
}
export interface ScalarSpringApi { start(options: ScalarSpringStart): void; }
export interface ReleaseMotionApis {
  readonly lower: ScalarSpringApi; readonly settle: ScalarSpringApi; readonly bump: ScalarSpringApi; readonly candle: ScalarSpringApi;
}
export interface ReleaseMotion {
  lower(onDone: () => void): void;
  settle(onDone: () => void): void;
  bump(): void;
  brightenCandle(): void;
  reset(): void;
}
export function createReleaseMotion(apis: ReleaseMotionApis, reducedMotion: boolean, baseCandleIntensity: number): ReleaseMotion;
```
Behaviour (`bright = baseCandleIntensity * RELEASE_CANDLE.brightenFactor`):
- `lower(onDone)`: reduced → `apis.lower.start({ to: { value: RELEASE_MOTION_END }, immediate: true })` then call `onDone()` synchronously.
  Else `start({ from: { value: RELEASE_MOTION_START }, to: { value: RELEASE_MOTION_END }, immediate: false, config: { ...RELEASE_LOWER_SPRING }, onRest: onDone })`.
- `settle(onDone)`: same with `apis.settle` and `RELEASE_SETTLE_SPRING`.
- `bump()`: reduced → `start({ to: { value: RELEASE_BUMP.restValue }, immediate: true })`; else
  `start({ from: { value: RELEASE_BUMP.fromValue }, to: { value: RELEASE_BUMP.restValue }, immediate: false, config: { ...RELEASE_BUMP.spring } })`.
- `brightenCandle()`: reduced → `start({ to: { value: bright }, immediate: true })`; else `start({ to: { value: bright }, immediate: false, config: { ...RELEASE_CANDLE.spring } })`.
- `reset()`: four immediate starts: lower → START, settle → START, bump → `restValue`, candle → `baseCandleIntensity`.

#### 5e — `ownKrathong.ts`

```ts
import { ZONE_ITEM_CAP } from "@/config/world.config";
import type { InteractionMode } from "@/core/interaction";
import type { RitualPhase } from "./ritualStateMachine";

/** Where the user's own krathong is drawn (MFW-23). */
export type OwnKrathongPoseKind = "ORIGIN" | "PIER" | "DRAG" | "RELEASING" | "RIVER" | "HIDDEN";
export interface OwnKrathongPoseInput {
  readonly mode: InteractionMode | null;
  readonly phase: RitualPhase;
  readonly hasSaved: boolean;
  readonly dragging: boolean;
  readonly ownZoneVisible: boolean;
}
export function ownKrathongPoseKind(input: OwnKrathongPoseInput): OwnKrathongPoseKind;
/** savedZoneId null → false; visibleZoneId null (world not loaded yet) → true; else equality. */
export function isOwnZoneVisible(savedZoneId: number | null, visibleZoneId: number | null): boolean;
/** Drops the own id and caps the list so items + own krathong ≤ cap (invariant E). Returns `items` itself when nothing changes. */
export function excludeOwnAndCap<T extends { readonly id: string }>(
  items: readonly T[], ownId: string | null, ownShown: boolean, cap: number = ZONE_ITEM_CAP,
): readonly T[];
```
`ownKrathongPoseKind` in this order: `mode === null || mode === "CUSTOMIZE"` → `ORIGIN`; `phase === "RELEASED" && hasSaved` →
`ownZoneVisible ? "RIVER" : "HIDDEN"`; `mode === "WORLD_EXPLORE"` → `ORIGIN` (legacy look-dev when no release happened, e.g. tests);
`phase === "RELEASING"` → `RELEASING`; `dragging` → `DRAG`; else `PIER`.
`excludeOwnAndCap`: `limit = ownShown ? cap - 1 : cap`; `kept = ownId === null ? items : items.filter((i) => i.id !== ownId)`; return
`kept.length > limit ? kept.slice(0, limit) : kept` (so `items` itself when nothing was removed).

#### 5f — `src/core/ritual/index.ts`

Keep the comment line `/** RitualStateMachine (Drag-to-release, Tap-to-hang, Swipe-to-splash) */` and replace `export {};` with
`export * from "./ritualStateMachine"; export * from "./releaseCoord"; export * from "./serverClock"; export * from "./releaseMotion"; export * from "./ownKrathong";`.

### Step 6 — `src/core/world/releaseSpot.ts` (new; uses three via coordinates; loaded lazily by the orchestrator)

```ts
import type { FestivalEventId } from "@/config/events/types";
import type { RiverLane, RiverLaneSet, RiverPlacementSource } from "@/core/coordinates";
import type { PublicCreation } from "@/services/api/creationTypes";
import { findNearestFreeSpot, isSpotFree, riverSpotLateralLimit, type RiverSpot } from "./riverCollision";
import { getLoyKrathongRiverLanes } from "./riverLanes";
import { publicCreationsToRiverItems } from "./zoneRiverItems"; // ASSUMED INTERFACE (from MFW-25 plan)
import { wrap01 } from "@/core/math/wrap01";

export interface ReleaseLanding { readonly landing: RiverSpot; readonly collided: boolean; }

/** progress wrapped to [0, 1), lateral clamped to ±riverSpotLateralLimit(lane). */
export function clampSpotToLane(spot: RiverSpot, lane: RiverLane): RiverSpot;
/** Client pre-check at release (owner decision 25). Never per frame. */
export function resolveReleaseLanding(candidate: RiverSpot, existing: readonly RiverPlacementSource[], lanes: RiverLaneSet, nowMs: number): ReleaseLanding;
/** The orchestrator's entry point: visible zone items → river sources, Loy Krathong lanes. zone null → no existing items. */
export function resolveReleaseLandingForZone(
  candidate: RiverSpot,
  zoneItems: readonly PublicCreation[],
  zone: { readonly eventId: FestivalEventId; readonly zoneId: number } | null,
  nowMs: number,
): ReleaseLanding;
```
- `resolveReleaseLanding`: `lane = lanes.get(candidate.laneId)`; no lane → `{ landing: candidate, collided: false }`.
  `clamped = clampSpotToLane(candidate, lane)`; `free = findNearestFreeSpot(clamped, existing, lanes, nowMs)`;
  `free === null` (lane full) → `{ landing: clamped, collided: false }` (the server opens the next zone); else
  `{ landing: free, collided: !isSpotFree(clamped, existing, lanes, nowMs) }`. (`findNearestFreeSpot` returns the clamped candidate itself when it is free.)
- `resolveReleaseLandingForZone`: `existing = zone === null ? [] : publicCreationsToRiverItems(zoneItems, zone)`; delegate with `getLoyKrathongRiverLanes()`.
- `src/core/world/index.ts`: keep all lines, add `export * from "./releaseSpot";`.

### Step 7 — `src/store/useUIStore.ts` (modify)

```ts
import { INITIAL_RITUAL_STATE, transitionRitual, type RitualEvent, type RitualState } from "@/core/ritual";

export interface UIState {
  flowState: FlowState;
  selectedEventId: FestivalEventId | null;
  dispatch: (event: FlowEvent) => void;
  /** Release ritual sub-state of RITUAL_RELEASE (MFW-23). Public, parametric data only (invariant C). */
  ritual: RitualState;
  dispatchRitual: (event: RitualEvent) => void;
}
```
- Initial `ritual: INITIAL_RITUAL_STATE`.
- `dispatchRitual(e)`: `const next = transitionRitual(get().ritual, e); if (next !== get().ritual) set({ ritual: next });`.
- `dispatch(event)`: unchanged, except when the flow actually transitions on `REVISE_WISH`, set `ritual: transitionRitual(get().ritual, { type: "RESET" })`
  in the same `set` call.
- `useUIStore.test.ts`: add "dispatchRitual applies the reducer and skips no-ops (same state reference)" and "REVISE_WISH returns to WRITE_WISH and resets the
  ritual but keeps `attempt`". Keep the existing cases.

### Step 8 — `src/services/api/createCreationClient.ts` (new; client-safe, three-free)

Allowed imports: `@/config/events/types` (type), `@/config/world.config`, `@/config/ritual.config`, `@/core/ritual/releaseCoord`,
`@/services/moderation`, `./apiPaths` (MFW-25), and `import type` from `./creationTypes` and the MFW-45 request types. No `console`, no
`localStorage`, no store, no `"*"` literal.

```ts
export type CreateCreationFailure =
  | "aborted" | "network" | "timeout" | "unavailable" | "event_closed" | "moderation_blocked" | "rejected" | "invalid_response";
export type CreateCreationResult =
  | { readonly ok: true; readonly creation: PublicCreation }
  | { readonly ok: false; readonly reason: CreateCreationFailure; readonly moderationBody: unknown | null };
export interface SubmitCreationOptions {
  readonly fetch?: typeof fetch;   // default: (input, init) => globalThis.fetch(input, init) (looked up at call time)
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;     // default CREATE_CREATION_TIMEOUT_MS
}
/** POST /api/creations. The raw ownerToken travels only in this JSON body (owner decision 1). Never logs. */
export function submitCreation(body: CreateCreationRequestBody, options?: SubmitCreationOptions): Promise<CreateCreationResult>;
/** Allowlist copy of the 201 `creation`, or null (invariant C defence in depth). Coord must be a SPLINE_PATH shape. */
export function toCreatedPublicCreation(raw: unknown, eventId: FestivalEventId): PublicCreation | null;
```
`submitCreation`:
1. `const controller = new AbortController(); let timedOut = false;` start `setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs)`;
   if `options.signal` is given, forward its `abort` event to `controller.abort()` (and abort at once if already aborted). Clear the timer and the
   listener in `finally`.
2. `res = await fetchImpl(CREATIONS_API_PATH, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
   body: JSON.stringify(body), cache: "no-store", credentials: "same-origin", signal: controller.signal })`. The URL is the constant itself:
   **no query string, nothing appended**. A throw → `timedOut ? "timeout" : options.signal?.aborted ? "aborted" : "network"`.
3. `const json = await res.json().catch(() => undefined);`
4. `res.ok` → `creation = isPlainObject(json) ? toCreatedPublicCreation(json.creation, body.eventId) : null` → ok, else `invalid_response`.
5. `422` and `parseModerationBlockedBody(json) !== null` → `{ ok: false, reason: "moderation_blocked", moderationBody: json }`.
6. `409` → `event_closed`; `503` or any other `>= 500` → `unavailable`; any other status → `rejected`. `moderationBody` is `null` except in 5.

`toCreatedPublicCreation(raw, eventId)`: plain object; read only the eight `PUBLIC_CREATION_KEYS` by name (no spread); `id` non-empty string;
`raw.eventId === eventId`; `Number.isSafeInteger(zoneId) && zoneId >= ZONE_ID_MIN`; `appearance` plain object; `isSplinePathCoordShape(coord)`;
`publicWishText` null or string; `createdAt`/`expiresAt` strings with finite `Date.parse`; reject when
`containsPrivateKey(appearance) || containsPrivateKey(coord)` with `PRIVATE_KEY_PATTERN = /owner_?token|private_?wish/i` (same helper as MFW-25's
`zoneClient`; if MFW-25 exported it, import it instead of copying). Return a fresh object built field by field.

### Step 9 — `src/services/api/releaseCreation.ts` (new; client orchestrator; three-free at module level)

```ts
import { LOY_KRATHONG_PIER_RELEASE_SPOT } from "@/config/events/loyKrathong.river.config";
import { DEFAULT_KRATHONG_APPEARANCE, serializeKrathongAppearance } from "@/core/customization/krathongAppearance";
import { buildReleaseCoord, didServerMoveSpot, estimateServerClockOffsetMs, type ReleaseOrigin, type RitualErrorKind } from "@/core/ritual";
import type { ReleaseLanding } from "@/core/world/releaseSpot";
import type { RiverSpot } from "@/core/world/riverCollision";
import { getDeviceOwnerVault, type DeviceOwnerToken } from "@/services/auth";
import { evaluateWishDraft, toWishRequestFields } from "./wishPayload";       // ASSUMED INTERFACE (from MFW-21 plan)
import { getZonePagination } from "./zonePagination";                        // ASSUMED INTERFACE (from MFW-25 plan)
import { submitCreation, type CreateCreationFailure, type CreateCreationResult } from "./createCreationClient";
import { useBuilderStore } from "@/store/useBuilderStore";
import { useDeviceStore } from "@/store/useDeviceStore";
import { useUIStore } from "@/store/useUIStore";
import { useWorldStore } from "@/store/useWorldStore";

export type ResolveReleaseLanding = (
  candidate: RiverSpot, zoneItems: readonly PublicCreation[], zone: { eventId: FestivalEventId; zoneId: number } | null, nowMs: number,
) => ReleaseLanding;
export type ReleaseOutcome = "saved" | "failed" | "revise_wish" | "ignored";

export interface ReleaseCreationDeps {
  readonly submit?: (body: CreateCreationRequestBody) => Promise<CreateCreationResult>; // default submitCreation
  readonly getOwnerToken?: () => DeviceOwnerToken;         // default () => getDeviceOwnerVault().getOrCreate().token
  readonly now?: () => number;                            // default Date.now
  readonly loadLandingResolver?: () => Promise<ResolveReleaseLanding>;
  // default: () => import("@/core/world/releaseSpot").then((m) => m.resolveReleaseLandingForZone)
  readonly loadZone?: (zoneId: number) => Promise<unknown>; // default (id) => getZonePagination().loadZone(id)
}
export interface ReleaseCreation {
  release(origin: ReleaseOrigin): Promise<ReleaseOutcome>;
  /** Hook point for MFW-30 (creation-id list in LocalStorage, owner decision 12). Returns an unsubscribe. */
  onCreationSaved(listener: (creation: PublicCreation) => void): () => void;
}
export function createReleaseCreation(deps?: ReleaseCreationDeps): ReleaseCreation;
/** App singleton (created on first call). */
export function getReleaseCreation(): ReleaseCreation;
```

`release(origin)` — in this order; `ui = useUIStore.getState()` etc. are read fresh at each step:
1. Guard: `flowState !== "RITUAL_RELEASE"`, `ritual.phase !== "IDLE"` or `selectedEventId !== "loy_krathong"` → return `"ignored"` (other festivals are stubs).
2. Wish: `const wish = useBuilderStore.getState().wish;` Re-evaluate: `let evaluation; try { evaluation = wish === null ? null : evaluateWishDraft({ text: wish.text, visibility: wish.visibility }); } catch { evaluation = null; }`.
   If `evaluation === null || !evaluation.ok` → `ui.dispatch({ type: "REVISE_WISH" })`, return `"revise_wish"` (no request).
3. `attempt = ritual.attempt + 1`; `dispatchRitual({ type: "RELEASE_STARTED", attempt, origin })`.
4. `candidate = origin.kind === "drop" ? origin.candidate : LOY_KRATHONG_PIER_RELEASE_SPOT`.
5. Landing: `const device = useDeviceStore.getState(); const sceneTier = device.profiled && device.qualityTier !== "FALLBACK_2D";`
   If `sceneTier`: `try { const resolve = await loadLandingResolver(); const w = useWorldStore.getState();
   const zone = w.eventId === "loy_krathong" && w.currentZoneId !== null ? { eventId: w.eventId, zoneId: w.currentZoneId } : null;
   landed = resolve(candidate, w.zoneItems, zone, now()); } catch { landed = { landing: candidate, collided: false }; }`
   Else `landed = { landing: candidate, collided: false }` — **FALLBACK_2D never imports `@/core/world/releaseSpot`** (lead probe: Turbopack puts the lane
   math in the three chunk, which contains the string "WebGLRenderer").
   Then if the attempt is stale (`ritual.attempt !== attempt || ritual.phase !== "RELEASING"`) return `"ignored"`, else
   `dispatchRitual({ type: "LANDING_RESOLVED", attempt, landing: landed.landing, collided: landed.collided })`.
6. Body (key order as listed):
   ```ts
   const coord = buildReleaseCoord(landed.landing);
   const body: CreateCreationRequestBody = {
     eventId: "loy_krathong",
     appearance: serializeKrathongAppearance(useBuilderStore.getState().appearance ?? DEFAULT_KRATHONG_APPEARANCE),
     coord,
     ...toWishRequestFields(evaluation.wish), // wishText, wishVisibility
     ownerToken: getOwnerToken(),
   };
   ```
   `getOwnerToken` throwing (no secure random) → `SAVE_FAILED { kind: "unexpected" }`, return `"failed"`. `persisted: false` is not checked
   (§11 Q5). The token is never stored in a variable that outlives the call, never put in a store, never logged.
7. `sentAt = now(); result = await submit(body); receivedAt = now();` If stale (as in 5) return `"ignored"`.
8. Success: `c = result.creation`. Build `saved = { id: c.id, zoneId: c.zoneId, coord: c.coord as SplinePathCoord, createdAtMs: Date.parse(c.createdAt),
   serverClockOffsetMs: estimateServerClockOffsetMs(c.createdAt, sentAt, receivedAt), movedByServer: didServerMoveSpot(coord, c.coord) }`
   (`c.coord` passed `isSplinePathCoordShape` in Step 8). Then, in order:
   - `dispatchRitual({ type: "SAVED", attempt, saved })`;
   - `useBuilderStore.setState({ wish: null, wishServerReasons: null })` (private text must not linger; coordinator note);
   - call each listener with `c` inside `try { … } catch { /* ignore */ }` (no console);
   - `const w = useWorldStore.getState(); if (w.eventId === "loy_krathong" && w.currentZoneId !== c.zoneId) void loadZone(c.zoneId).catch(() => undefined);`
   - return `"saved"`.
9. `moderation_blocked`: `useBuilderStore.getState().rejectWishFromServer(result.moderationBody)`; `dispatchRitual({ type: "RESET" })`;
   `ui.dispatch({ type: "REVISE_WISH" })`; return `"revise_wish"`. (WishModal shows the server reasons; MFW-21 D10.)
10. Any other failure: `kind: RitualErrorKind = result.reason === "aborted" ? "network" : result.reason` (the remaining names map 1:1);
    `dispatchRitual({ type: "SAVE_FAILED", attempt, error: { kind } })`; return `"failed"`. The wish stays for the retry.

No automatic retry. No timers other than the client timeout. No `console.*`.

### Step 10 — `src/components/canvas3d/ritualSite.ts` and `ownKrathongPose.ts` (new; three, no React)

`sceneObjectNames.ts`: add `krathongPose: "scene-krathong-pose"` and `pierFocus: "scene-pier-focus"` (keep every entry, including MFW-28's).

`ritualSite.ts`:
```ts
import { OrthographicCamera, Plane, Raycaster, Vector2, Vector3 } from "three";
import { SCENE_CAMERA_FAR, SCENE_CAMERA_NEAR, SCENE_CAMERA_ZOOM } from "@/config/camera.config";
import { LOY_KRATHONG_PIER_RELEASE_SPOT, LOY_KRATHONG_RIVER_LANE_ID } from "@/config/events/loyKrathong.river.config";
import { PERCENT_SCALE } from "@/config/interaction.config";
import { getCameraFlightPose } from "@/core/camera";
import { LATERAL_OFFSET_RANGE, locateOnLane, splineProgressToWorld, type RiverLane, type RiverLaneSet, type WorldVec3, type WorldXZ } from "@/core/coordinates";
import { clampSpotToLane, getLoyKrathongRiverLanes, type RiverSpot } from "@/core/world";
import { LOY_KRATHONG_RIVER_LAYOUT } from "@/components/models/loyKrathong/riverLayout";

export interface RitualSite {
  readonly tip: WorldVec3;           // preview spot (deck top)
  readonly releasePoint: WorldVec3;  // button touchdown (water)
  readonly waterSurfaceY: number;
  readonly releaseYawRad: number;    // lane yaw at LOY_KRATHONG_PIER_RELEASE_SPOT
  readonly channel: RiverLane;       // visible water (on-water test)
  readonly lane: RiverLane;          // the river lane
}
/** Memoised; render-time values only, never persisted (invariant A). */
export function getLoyKrathongRitualSite(): RitualSite;

export interface ViewportSize { readonly width: number; readonly height: number; }
export interface PercentPoint { readonly x: number; readonly y: number; } // 0..PERCENT_SCALE, origin top-left
export interface RitualDrop { readonly point: WorldXZ; readonly onWater: boolean; readonly candidate: RiverSpot; }
export interface RitualDropMapper {
  /** Screen percent → the deck-height plane (y = site.tip.y) of the ritual view. null if the size is not positive/finite or the ray misses. */
  toDeckPlane(percent: PercentPoint, size: ViewportSize, zoomFactor: number): WorldXZ | null;
  /** Same, plus the on-water test and the clamped lane location of the drop. */
  mapDrop(percent: PercentPoint, size: ViewportSize, zoomFactor: number): RitualDrop | null;
  /** Inverse used by tests: world point → screen percent in the ritual view. */
  toPercent(point: WorldVec3, size: ViewportSize, zoomFactor: number): PercentPoint;
}
export function createRitualDropMapper(site?: RitualSite, lanes?: RiverLaneSet): RitualDropMapper;
```
- `getLoyKrathongRitualSite()`: `lane = getLoyKrathongRiverLanes().get(LOY_KRATHONG_RIVER_LANE_ID)` (throw `Error` if missing); `releaseYawRad =
  splineProgressToWorld(lane, LOY_KRATHONG_PIER_RELEASE_SPOT.progress, 0).yawRad`; the rest from `LOY_KRATHONG_RIVER_LAYOUT` (`pier.tip`,
  `pier.releasePoint`, `waterSurfaceY`, `channel`). Cache in a module `let`.
- The "ritual view" is the camera **after** the RITUAL_RELEASE framing flight: an `OrthographicCamera(-w/2, w/2, h/2, -h/2, SCENE_CAMERA_NEAR, SCENE_CAMERA_FAR)`,
  `zoom = SCENE_CAMERA_ZOOM * zoomFactor`, position/look-at from `getCameraFlightPose(site.tip)`, `updateProjectionMatrix()`, `updateMatrixWorld()`. That is R3F's
  default orthographic camera (MFW-27 tests use the same construction). Create **one** camera, raycaster, plane, `Vector2` and `Vector3` per mapper and reuse them.
- `toDeckPlane`: `ndc = (percent.x / PERCENT_SCALE * 2 - 1, -(percent.y / PERCENT_SCALE * 2 - 1))`; `raycaster.setFromCamera(ndc, camera)`;
  `plane.set(UP, -site.tip.y)` with `UP = (0, 1, 0)`; `raycaster.ray.intersectPlane(plane, hit)` → `{ x: hit.x, z: hit.z }` or `null`.
- `mapDrop`: `p = toDeckPlane(...)`; `null` → `null`. `onWater = Math.abs(locateOnLane(site.channel, p).lateralOffset) <= LATERAL_OFFSET_RANGE[1]`.
  `loc = locateOnLane(site.lane, p)`; `candidate = clampSpotToLane({ laneId: site.lane.laneId, progress: loc.progress, lateralOffset: loc.lateralOffset }, site.lane)`.
- Note: the live camera equals the ritual view once the framing flight has finished (instant under reduced motion). The world-view group has no
  pan/rotate in RITUAL_RELEASE (PAN_RIVER exists only in WORLD_EXPLORE), so world = group-local coordinates here.

`ownKrathongPose.ts`:
```ts
import type { Object3D } from "three";
import { RELEASE_BUMP } from "@/config/ritual.config";
import { RIVER_KRATHONG_SCALE } from "@/config/riverFlow.config";
import { createSplinePoseOut, splineCoordToPoseInto, type SplinePoseOut, type WorldXZ } from "@/core/coordinates";
import type { OwnKrathongPoseKind } from "@/core/ritual";
import { applyRiverItemTransform, createRiverFrameScratch, type PreparedRiverItem, type RiverFrameScratch } from "@/core/world";
import type { RitualSite } from "./ritualSite";

export interface OwnPoseFrame {
  readonly kind: OwnKrathongPoseKind;
  readonly site: RitualSite;
  readonly dragPoint: WorldXZ | null;   // deck-plane point under the finger (DRAG)
  readonly releaseDrop: WorldXZ | null; // accepted drop point of a "drop" release; null for "pier"
  readonly own: PreparedRiverItem | null; // prepared saved creation (server coord + createdAt), null before SAVED
  readonly lower: number;  // spring values
  readonly settle: number;
  readonly bump: number;
  readonly nowMs: number;  // Date.now() + serverClockOffsetMs
  readonly reducedMotion: boolean;
}
export interface OwnPoseScratch { readonly pose: SplinePoseOut; readonly river: RiverFrameScratch; }
export function createOwnPoseScratch(): OwnPoseScratch;
/** Per frame, allocation-free. Writes position, rotation (YXZ), scale and visible of `target`. */
export function writeOwnKrathongPose(target: Object3D, frame: OwnPoseFrame, scratch: OwnPoseScratch): void;
```
With `lerp = (a, b, t) => a + (b - a) * t`, `hop = frame.bump * RELEASE_BUMP.hopHeight`, `tip = site.tip`:
- `ORIGIN`: position (0, 0, 0), rotation (0, 0, 0), scale 1, visible.
- `PIER`: position = tip, rotation (0, `site.releaseYawRad`, 0), scale `RIVER_KRATHONG_SCALE`, visible.
- `DRAG`: `d = dragPoint ?? { x: tip.x, z: tip.z }`; position `(d.x, tip.y, d.z)`; yaw and scale as PIER.
- `RELEASING`: `start = releaseDrop ? (releaseDrop.x, tip.y, releaseDrop.z) : tip`; `touch = releaseDrop ? (releaseDrop.x, site.waterSurfaceY, releaseDrop.z) : site.releasePoint`;
  `b = lerp(start, touch, lower)` per axis; `yaw = site.releaseYawRad`. If `own !== null`:
  `t = splineCoordToPoseInto(own.coord, own.lane, own.createdAtMs, nowMs, scratch.pose)`; `b = lerp(b, t, settle)` per axis; `yaw = lerp(yaw, t.yawRad, settle)`.
  position `(b.x, b.y + hop, b.z)`, rotation (0, yaw, 0), scale river, visible.
- `RIVER`: `own === null` → as HIDDEN. Else `applyRiverItemTransform(target, own, nowMs, reducedMotion, scratch.river)`, then `target.position.y += hop`,
  scale river, visible.
- `HIDDEN`: `visible = false` (leave the rest).
Also export `ritualTouchdownXZ(site: RitualSite, releaseDrop: WorldXZ | null): WorldXZ` = `releaseDrop ?? { x: site.releasePoint.x, z: site.releasePoint.z }`
(the ripple point).

### Step 11 — `src/components/canvas3d/OwnKrathong.tsx` (new, `"use client"`)

Replaces the inline krathong group of `ToyNightScene`. Import scene code by file path (not the `@/components/canvas3d` barrel).

```tsx
export interface OwnKrathongProps {
  readonly targetRef: RefObject<Group | null>;     // krathongTargetRef (camera "krathong" target)
  readonly appearance: KrathongAppearance;
  readonly shadows: boolean;
  readonly reducedMotion: boolean;
  readonly objectRotation: number;
  readonly onSelected: () => void;                 // () => onTargetSelected("krathong") (unchanged MFW-17 behaviour)
  readonly poseKind: OwnKrathongPoseKind;
  readonly ritual: RitualState;
  readonly site: RitualSite;
  readonly lanes: RiverLaneSet;
  readonly dragPointRef: RefObject<WorldXZ | null>;
  readonly releaseDropRef: RefObject<WorldXZ | null>;
  readonly now: () => number;
  readonly onTouchedDown: (attempt: number, at: WorldXZ) => void;
  readonly onSettled: (attempt: number) => void;
}
```
Body:
1. `invalidate = useThree((s) => s.invalidate)`. Four springs: `const [lowerS, lowerApi] = useSpring(() => ({ value: RELEASE_MOTION_START, onChange: invalidate }))`;
   same for `settle` (START), `bump` (`RELEASE_BUMP.restValue`) and `candle` (`TOY_SCENE_LIGHTING.candle.intensity`).
2. Adapter: `const toApi = (api) => ({ start: (o: ScalarSpringStart) => void api.start({ from: o.from, to: o.to, immediate: o.immediate,
   config: o.config, onRest: o.onRest ? (result: { finished?: boolean }) => { if (result.finished !== false) o.onRest?.(); } : undefined }) })`.
   `motion = useMemo(() => createReleaseMotion({ lower: toApi(lowerApi), settle: …, bump: …, candle: … }, reducedMotion, TOY_SCENE_LIGHTING.candle.intensity), [lowerApi, settleApi, bumpApi, candleApi, reducedMotion])`.
3. `own = useMemo(() => ritual.saved ? prepareRiverItems([{ id: ritual.saved.id, coord: ritual.saved.coord, createdAtMs: ritual.saved.createdAtMs }], lanes)[0] ?? null : null, [ritual.saved, lanes])`.
4. Effects (refs `bumpedFor`, `settledFor` hold the attempt number already handled; initial `-1`):
   - A: `if (ritual.phase === "RELEASING" && !ritual.touchedDown) motion.lower(() => onTouchedDown(ritual.attempt, ritualTouchdownXZ(site, ritual.origin?.kind === "drop" ? releaseDropRef.current : null)));` deps `[ritual.phase, ritual.attempt, ritual.touchedDown, motion]`.
   - B: `if (ritual.phase !== "IDLE" && ritual.touchedDown) motion.brightenCandle();` deps `[ritual.phase, ritual.attempt, ritual.touchedDown, motion]`.
   - C: `if (ritual.phase === "RELEASING" && ritual.touchedDown && isRitualBumped(ritual) && bumpedFor.current !== ritual.attempt) { bumpedFor.current = ritual.attempt; motion.bump(); }`.
   - D: `if (ritual.phase === "RELEASING" && ritual.touchedDown && ritual.saved && settledFor.current !== ritual.attempt) { settledFor.current = ritual.attempt; motion.settle(() => onSettled(ritual.attempt)); }`.
   - E: `if (ritual.phase === "IDLE") motion.reset();` deps `[ritual.phase, ritual.attempt, motion]`.
   - No unmount effect: a Canvas re-creation (antialias flip) remounts this component while `SceneViewport` stays mounted, and the new
     instance restarts the animation from the store state. A scene that disappears (FALLBACK_2D) is completed by the panel (Step 13).
5. `poseRef = useRef<Group | null>(null); scratch = useRef(createOwnPoseScratch());`
   `useFrame(() => { const g = poseRef.current; if (!g) return; writeOwnKrathongPose(g, { kind: poseKind, site, dragPoint: dragPointRef.current,
   releaseDrop: ritual.origin?.kind === "drop" ? releaseDropRef.current : null, own, lower: lowerS.value.get(), settle: settleS.value.get(),
   bump: bumpS.value.get(), nowMs: now(), reducedMotion }, scratch.current); if (poseKind === "RELEASING" || poseKind === "RIVER" || poseKind === "DRAG") invalidate(); });`
6. JSX:
   ```tsx
   <group ref={poseRef} name={SCENE_OBJECT_NAMES.krathongPose}>
     <group ref={targetRef} name={SCENE_OBJECT_NAMES.krathong} rotation={[0, objectRotation, 0]}
       onClick={(event) => { event.stopPropagation(); onSelected(); }}>
       <animated.pointLight color={TOY_SCENE_LIGHTING.candle.color} intensity={candleS.value}
         distance={TOY_SCENE_LIGHTING.candle.distance} position={TOY_SCENE_LIGHTING.candle.position} />
       <PartChangeBounce changeKey={appearance} reducedMotion={reducedMotion}>
         <KrathongModel appearance={appearance} shadows={shadows} />
       </PartChangeBounce>
     </group>
   </group>
   ```
   The `scene-krathong` group keeps its name, `rotation` and `onClick`, so existing selectors and the MFW-17/28 behaviour stay. No new geometry or material.

### Step 12 — `src/components/canvas3d/index.tsx` (modify)

Imports: `OwnKrathong`, `createRitualDropMapper`, `getLoyKrathongRitualSite`, `type RitualDropMapper`, `type PercentPoint` (file paths);
`excludeOwnAndCap`, `isOwnZoneVisible`, `ownKrathongPoseKind`, `type RitualState` from `@/core/ritual`; `type RiverSpot` from `@/core/world`;
`useUIStore`; `type WorldXZ`.

1. **Props.** Remove `onGestureRelease`. Add `onReleaseDrop?: (candidate: RiverSpot) => void` (FlowRoot wires it to the orchestrator).
2. **Hooks** (all before the early `return null`, next to the existing ones):
   ```ts
   const ritual = useUIStore((s) => s.ritual);
   const site = getLoyKrathongRitualSite();
   const mapperRef = useRef<RitualDropMapper | null>(null);
   const mapper = () => (mapperRef.current ??= createRitualDropMapper(site));
   const chipPercentRef = useRef<PercentPoint>({ x: RITUAL_CHIP_START_PERCENT.x, y: RITUAL_CHIP_START_PERCENT.y });
   const draggingRef = useRef(false);
   const [dragging, setDragging] = useState(false);
   const dragPointRef = useRef<WorldXZ | null>(null);
   const releaseDropRef = useRef<WorldXZ | null>(null);
   const pierFocusRef = useRef<Group | null>(null);
   const [framedPier, setFramedPier] = useState(false);
   if (mode === "RITUAL_RELEASE" && !framedPier) setFramedPier(true); // same render-phase pattern as selectionMode
   const offsetMs = ritual.saved?.serverClockOffsetMs ?? 0;
   const riverNow = useMemo(() => () => Date.now() + offsetMs, [offsetMs]);
   const ownShown = ritual.phase === "RELEASED" && isOwnZoneVisible(ritual.saved?.zoneId ?? null, worldZoneId /* MFW-25 */);
   const sceneRiverItems = useMemo(() => excludeOwnAndCap(visibleRiverItems, ritual.saved?.id ?? null, ownShown), [visibleRiverItems, ritual.saved, ownShown]);
   const poseKind = ownKrathongPoseKind({ mode, phase: ritual.phase, hasSaved: ritual.saved !== null, dragging, ownZoneVisible: isOwnZoneVisible(ritual.saved?.zoneId ?? null, worldZoneId) });
   ```
   MFW-25's `storeRiverItems` condition `mode === "WORLD_EXPLORE"` becomes `(mode === "WORLD_EXPLORE" || mode === "RITUAL_RELEASE")`, so the ritual
   shows the shared zone and the client pre-check sees the same krathongs (§11 Q1). Pass `sceneRiverItems` wherever `visibleRiverItems` went
   (`ToyNightScene`, MFW-28's inspect lookup). `data-river-item-count` stays `visibleRiverItems.length`.
3. **Camera.** `const cameraTargetRef = activeTargetRef ?? (framedPier && (mode === "RITUAL_RELEASE" || mode === "WORLD_EXPLORE") ? pierFocusRef : null);`
   Render `{cameraTargetRef && <CameraFlightController targetRef={cameraTargetRef} requestId={flyRequestId} reducedMotion={reducedMotion} />}` and, separately,
   `{activeTargetRef && selectedTarget && <TargetHighlight targetRef={activeTargetRef} target={selectedTarget} />}`. Keeping the one controller
   mounted from the ritual into the world means a later selection flies from the current pose (no snap back to the default view).
4. **Chip and drag** (`onAction`):
   - `DRAG_KRATHONG`: compute the next percent from `chipPercentRef.current` with the **same** clamp formula as today (`PERCENT_SCALE`,
     `RITUAL_CHIP_MIN_PERCENT`, `RITUAL_CHIP_MAX_PERCENT`), store it in `chipPercentRef.current` and `setKrathongPosition([x, y])`;
     `draggingRef.current = true; setDragging(true); dragPointRef.current = mapper().toDeckPlane(next, rect, zoomRef.current); invalidateRef.current?.();`
   - `RELEASE_KRATHONG`: `draggingRef.current = false; setDragging(false); const drop = rect ? mapper().mapDrop(chipPercentRef.current, rect, zoomRef.current) : null; resetChip();`
     If `drop === null || !drop.onWater` → `useUIStore.getState().dispatchRitual({ type: "DROP_REJECTED" })`. Else `releaseDropRef.current = drop.point; onReleaseDrop?.(drop.candidate);`.
     `resetChip()` = chip percent back to `RITUAL_CHIP_START_PERCENT` (ref + state) and `dragPointRef.current = null`.
   - In `handlePointerUp`, after `input.pointerUp(...)`: `if (mode === "RITUAL_RELEASE" && draggingRef.current) { draggingRef.current = false; setDragging(false); resetChip(); useUIStore.getState().dispatchRitual({ type: "DROP_REJECTED" }); }`
     (a drag that ended without a release, e.g. outside the viewport). In `handlePointerCancel` do the same without the hint.
   - The chip renders only when `mode === "RITUAL_RELEASE" && ritual.phase === "IDLE"`. Keep `role="img"`, `aria-label="กระทง ลากลงน้ำ"`,
     `data-input-target="krathong"`, size and position. Make it a see-through ring so the 3D preview shows: replace `bg-amber-400/80` with
     `bg-transparent` and wrap the text `กระทง` in `<span className="sr-only">`.
5. **Ripple + ritual callbacks:**
   ```ts
   const onTouchedDown = useCallback((attempt: number, at: WorldXZ) => {
     effectsRef.current?.spawnRipple(at);   // MFW-28 pool (invariant E)
     recordGimmick("ripple");
     useUIStore.getState().dispatchRitual({ type: "TOUCHED_DOWN", attempt });
   }, [recordGimmick]);
   const onSettled = useCallback((attempt: number) => useUIStore.getState().dispatchRitual({ type: "SETTLED", attempt }), []);
   ```
6. **ToyNightScene** gets the new props (`poseKind`, `ritual`, `site`, `dragPointRef`, `releaseDropRef`, `riverNow`, `onTouchedDown`, `onSettled`,
   `pierFocusRef`) and renders, inside the `scene-world-view` group: `<group ref={pierFocusRef} name={SCENE_OBJECT_NAMES.pierFocus} position={[site.tip.x, site.tip.y, site.tip.z]} />`,
   `<OwnKrathong …/>` in place of the old krathong group (pass `lanes={getLoyKrathongRiverLanes()}`, `now={riverNow}`), and `RiverFlow` with
   `items={sceneRiverItems}` and `now={riverNow}`. Everything else (environment, `SceneEffects`, lights outside the group) unchanged.
7. **Section attribute:** `data-own-krathong-pose={mode ? poseKind : undefined}`. No ids, coords or wish text in `data-*`.
8. Do not change the `PAN_RIVER` case, `getSceneRenderSettings`, `TOY_SCENE_*`, `NO_RIVER_ITEMS`, or MFW-28's handlers.

### Step 13 — `src/components/ui/RitualReleasePanel.tsx` (new, `"use client"`; three-free)

```tsx
export interface RitualReleasePanelProps {
  /** True when a 3D scene animates the ritual (FlowRoot's show3D). False → completes without animation (FALLBACK_2D). */
  readonly animateInScene: boolean;
  /** Injected in tests; default getReleaseCreation(). */
  readonly releaser?: Pick<ReleaseCreation, "release">;
}
export function RitualReleasePanel({ animateInScene, releaser }: RitualReleasePanelProps): JSX.Element;
```
- Reads `ritual` from `useUIStore` and `reducedMotion` from `useDeviceStore`.
- Effect: `useEffect(() => { if (!animateInScene) useUIStore.getState().dispatchRitual({ type: "SKIP_ANIMATION" }); }, [animateInScene, ritual.instant, ritual.phase]);`
  (covers FALLBACK_2D and a tier drop to FALLBACK_2D mid-release).
- Markup:
  ```tsx
  <section aria-label={RITUAL_COPY.panelLabel} data-testid="ritual-release-panel" className="flex w-full flex-col items-start gap-4">
    <p className="text-sm text-zinc-600 dark:text-zinc-300">{RITUAL_COPY.hint}</p>
    <button type="button" disabled={ritual.phase !== "IDLE"} onClick={() => void (releaser ?? getReleaseCreation()).release({ kind: "pier" })}
      className={`min-h-12 rounded-full bg-zinc-900 px-5 text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 ${reducedMotion ? "" : "transition-colors hover:bg-zinc-700 dark:hover:bg-zinc-300"}`}>
      {RITUAL_COPY.releaseButton}
    </button>
    <p role="status" aria-live="polite" data-testid="ritual-status" className="text-sm">{status}</p>
  </section>
  ```
  `status`: `RELEASING` → `RITUAL_COPY.releasing`; `IDLE` with `error` → `RITUAL_COPY.errors[error.kind]`; `IDLE` with `hint` → `RITUAL_COPY.dropOnWater`; else `""`.

### Step 14 — `src/components/ui/FlowRoot.tsx` (modify)

1. Remove `RITUAL_RELEASE: { type: "FINISH_RITUAL" }` from `NEXT_EVENT`.
2. Step switch: add `flowState === "RITUAL_RELEASE" ? <RitualReleasePanel animateInScene={show3D} />` before the placeholder branch.
3. `SceneViewport`: replace `onGestureRelease={…}` with
   `onReleaseDrop={interactionMode === "RITUAL_RELEASE" ? (candidate) => void getReleaseCreation().release({ kind: "drop", candidate }) : undefined}`.
4. Finish effect: `const ritualPhase = useUIStore((s) => s.ritual.phase);`
   `useEffect(() => { if (flowState === "RITUAL_RELEASE" && ritualPhase === "RELEASED") dispatch({ type: "FINISH_RITUAL" }); }, [flowState, ritualPhase, dispatch]);`
5. MFW-25's world effect: `const inWorld = flowState === "RITUAL_RELEASE" || flowState === "SHARED_WORLD_EXPLORE";` and use
   `[inWorld, selectedEventId]` as deps (`if (!inWorld || selectedEventId === null) return; … enterWorld … return () => pagination.leaveWorld();`), so
   the world loads once when the ritual starts and is not re-entered on FINISH_RITUAL. `ZoneNavigator` stays SHARED_WORLD_EXPLORE only.
6. Root attributes: `data-ritual-phase={ritual.phase}`, `data-ritual-bumped={ritual.saved ? String(isRitualBumped(ritual)) : undefined}`,
   `data-own-krathong={ritual.phase === "RELEASED" ? "released" : undefined}`, `data-ritual-error={ritual.error?.kind ?? undefined}`
   (read `ritual` with one selector).

### Step 15 — e2e fixtures and existing specs

`tests/e2e/fixtures/ritualRoutes.ts` (imports only `@playwright/test` types; never `src/`):
```ts
export const E2E_CREATION_ID = "0f8b6c1e-3a2d-4c5b-9e7f-1a2b3c4d5e6f";
export const E2E_OWNER_TOKEN_STORAGE_KEY = "mfw:deviceOwnerToken:v1"; // duplicated literal of DEVICE_OWNER_TOKEN_STORAGE_KEY
export interface CapturedCreate { readonly url: string; readonly body: Record<string, unknown>; }
export interface MockCreateOptions {
  readonly status?: number;          // default 201
  readonly errorBody?: unknown;      // body for a non-201 status
  readonly abort?: boolean;          // simulate a network failure
  readonly moveLateralBy?: number;   // 201 with the coord's lateralOffset moved (server collision), clamped to ±0.5
}
/** Intercepts POST /api/creations only (GET falls through to the real server). */
export async function mockCreateCreation(page: Page, options?: MockCreateOptions): Promise<{ readonly requests: CapturedCreate[] }>;
```
201 body: `{ creation: { id: E2E_CREATION_ID, eventId: sent.eventId, zoneId: 1, appearance: sent.appearance, coord: <sent coord, lateral moved>,
publicWishText: sent.wishVisibility === "public" ? sent.wishText : null, createdAt: new Date().toISOString(), expiresAt: <+30 days ISO> } }` with header
`cache-control: no-store`. Non-POST → `route.fallback()`.

Existing specs (after MFW-21's `completeWishStep` edits): add `await mockCreateCreation(page);` as the first line of `flow.spec.ts` "flow walks …", both tests
of `scene-gating.spec.ts` and the tier loop test of `river-environment.spec.ts`. Change nothing else. Reason: the release now saves; the stub keeps those
specs independent of MFW-45's write window (`event_closed` after the festival).

## 7. Tests

All vitest tests run without a database or WebGL. Component tests use the existing stub-R3F pattern of `src/components/canvas3d/index.test.tsx`.

**`src/core/ritual/ritualStateMachine.test.ts`** (node)
- Happy path: `RELEASE_STARTED(1)` → `LANDING_RESOLVED` → `TOUCHED_DOWN` → `SAVED` → `SETTLED` gives `RELEASED` with the saved object; each step a new frozen object.
- Order independence: `SAVED` before `TOUCHED_DOWN` then `TOUCHED_DOWN`, `SETTLED` → `RELEASED`; `SETTLED` before `SAVED` → same reference.
- Stale attempt: `TOUCHED_DOWN(attempt 0)` while attempt 1 is running → same reference; `RELEASE_STARTED(3)` from attempt 1 → same reference.
- `SAVE_FAILED` → `IDLE`, error set, `attempt` kept, `saved` null; the next `RELEASE_STARTED(attempt + 1)` clears the error.
- `SKIP_ANIMATION` during RELEASING → `touchedDown`; then `SAVED` → `RELEASED` directly; `SKIP_ANIMATION` in IDLE then `RELEASE_STARTED` starts with `touchedDown: true`.
- `DROP_REJECTED` only in IDLE; `RESET` keeps `attempt`. `isRitualBumped` for (collided, moved) = (F,F) F, (T,F) T, (F,T) T.

**`src/core/ritual/releaseCoord.test.ts`** (jsdom ok; imports MFW-24 for the equality)
- For spots `{1, 0.4, 0.38}`, `{1, 0.999, -0.2}`, `{1, 1.25, 0}`, `{1, -0.1, 0.6}` and `t` in `[0, 1_700_000_000_000]`:
  `buildReleaseCoord(s)` `toStrictEqual(riverCoordFromSpot(s, t))` where MFW-24 accepts it (lateral 0.6 → clamped 0.5 in both); result passes
  `parsePersistableCoord` and has exactly the five keys.
- `laneId 1.5` / `NaN` progress → `RangeError`.
- `isSplinePathCoordShape`: valid → true; extra `x: 0` → false; `mode "CYLINDRICAL_SURFACE"` → false; `spawnProgress 1.2` → false; array → false.
- `didServerMoveSpot`: identical → false; spawn 0.9999999999999 vs 0 → false (circular, below ε); lateral +0.2 → true; laneId 2 → true.

**`src/core/ritual/serverClock.test.ts`**: `("2026-11-24T12:00:10.000Z", T−200, T+200)` with `T = Date.parse("2026-11-24T12:00:05.000Z")` → `5000`; bad ISO → 0; `NaN` → 0.

**`src/core/ritual/releaseMotion.test.ts`**: fake apis record `start` calls.
- Non-reduced: `lower(done)` → one start `{ from: {value: 0}, to: {value: 1}, immediate: false, config: RELEASE_LOWER_SPRING }`, `done` not called until the
  recorded `onRest()` runs; same for `settle`; `bump()` from `RELEASE_BUMP.fromValue` to rest; `brightenCandle()` to `base × brightenFactor`.
- Reduced: every call is `immediate: true`, no `from`, no `config`; `lower(done)` / `settle(done)` call `done` synchronously exactly once (invariant F).
- `reset()` → four immediate starts to START, START, rest, base.

**`src/core/ritual/ownKrathong.test.ts`**: the `ownKrathongPoseKind` table (CUSTOMIZE → ORIGIN; WORLD without release → ORIGIN; WORLD released + visible
→ RIVER; released + other zone → HIDDEN; RITUAL IDLE → PIER; dragging → DRAG; RELEASING → RELEASING; RITUAL RELEASED → RIVER).
`isOwnZoneVisible(null, 1)` false, `(2, null)` true, `(2, 2)` true, `(2, 3)` false. `excludeOwnAndCap`: 80 items without own and `ownShown` false →
same reference; 80 items incl. own and `ownShown` → 79 without own; 80 items without own, `ownShown` → 79 (cap holds); `ownId null` → same reference.

**`src/core/world/releaseSpot.test.ts`** (real `getLoyKrathongRiverLanes()`, `now = 1_700_000_000_000`):
- No existing items: candidate `LOY_KRATHONG_PIER_RELEASE_SPOT` → landing equals it, `collided false`.
- One item at the candidate (`coord = riverCoordFromSpot(candidate, now)`, `createdAtMs = now`) → `collided true`, landing `isSpotFree`, and
  `riverSpotDistance(landing, candidate, lane) >= RIVER_MIN_CENTER_SPACING − 1e-9`; deterministic (two calls deep-equal).
- Candidate lateral 0.45 → landing lateral `<= riverSpotLateralLimit(lane)`, `collided false` (clamp is not a collision).
- `resolveReleaseLandingForZone` with one `PublicCreation` fixture at the candidate (MFW-12 fixture shape, `zoneId 1`) and `zone { loy_krathong, 1 }` → collided;
  with `zone null` → not collided; an item of zone 2 is ignored.

**`src/services/api/createCreationClient.test.ts`** (fake `fetch`)
- Request: called once with `CREATIONS_API_PATH` exactly (no `?`), `method "POST"`, JSON content type, `cache "no-store"`, `credentials "same-origin"`;
  `JSON.parse(init.body)` equals the body; the URL string does not contain the token.
- 201 `{ creation }` → ok with exactly `PUBLIC_CREATION_KEYS`; an extra `ownerToken` key on the creation is dropped; `coord` with `x: 1` → `invalid_response`;
  appearance with `{ private_wish_text: "a" }` nested → `invalid_response`; another `eventId` → `invalid_response`; non-JSON 201 → `invalid_response`.
- 422 + `{ error: "moderation_blocked", reasons: ["phone"] }` → `moderation_blocked` with that body; 422 with another body → `rejected`;
  409 → `event_closed`; 503 → `unavailable`; 500 → `unavailable`; 400 → `rejected`; fetch throws → `network`; external signal aborted → `aborted`;
  fake timers past `timeoutMs` → `timeout` (and the fetch signal is aborted).
- No `console` call (spy) in any case.

**`src/services/api/releaseCreation.test.ts`** (real zustand stores reset in `beforeEach`; deps faked; flow set to `RITUAL_RELEASE` with `selectedEventId "loy_krathong"`;
builder `wish = { text: "ขอให้ทุกคนมีความสุข", visibility: "private" }`; token `OWNER_TOKEN_FIXTURE`; `now` returns 1_000, 1_100, 1_300 …)
- "builds the request": body keys exactly `CREATE_CREATION_BODY_KEYS`; `coord = buildReleaseCoord(LOY_KRATHONG_PIER_RELEASE_SPOT)` in FALLBACK_2D;
  `appearance = serializeKrathongAppearance(DEFAULT_KRATHONG_APPEARANCE)` when the builder appearance is null; `wishText`/`wishVisibility` from `toWishRequestFields`.
- "FALLBACK_2D never loads the resolver": `loadLandingResolver` not called when the tier is FALLBACK_2D or unprofiled.
- "sends the free spot": HIGH tier, resolver fake returns `{ landing: L, collided: true }` → `coord = buildReleaseCoord(L)`, ritual `collided true`.
- "resolver failure falls back to the candidate": `loadLandingResolver` rejects → coord from the candidate, outcome `saved`.
- "the server coord is final": fake 201 with lateral moved → `ritual.saved.coord` equals the response coord, `createdAtMs = Date.parse(createdAt)`,
  `movedByServer true`, `serverClockOffsetMs` from the fake clock.
- "clears the wish after a save": `useBuilderStore.getState().wish === null`; on failure the wish stays.
- "keeps private data out of stores": `JSON.stringify` of all four stores after a save contains neither the token string nor `ownerToken`, `owner_token`,
  `privateWish`, `private_wish`; `ritual.saved` keys are exactly `id, zoneId, coord, createdAtMs, serverClockOffsetMs, movedByServer`.
- "notifies listeners": a listener receives the `PublicCreation`; a throwing listener does not break the save; unsubscribe works.
- "loads the creation's zone when another zone is visible": world `{ eventId: loy_krathong, currentZoneId: 1 }`, response `zoneId 2` → `loadZone(2)` once; same zone → not called.
- "moderation-blocked": 422 → `rejectWishFromServer` stored the reasons, flow `WRITE_WISH`, ritual `IDLE` without error, outcome `revise_wish`.
- "invalid stored wish": `wish = null` or `{ text: "  ", visibility: "private" }` → no submit, flow `WRITE_WISH`.
- Failures map to `ritual.error.kind` (`network`, `timeout`, `unavailable`, `event_closed`, `rejected`, `invalid_response`; `aborted` → `network`); outcome `failed`, phase `IDLE`.
- Guards: second `release` while RELEASING → `ignored`, one submit; flow not RITUAL_RELEASE → `ignored`; a stale response after `RESET` → `ignored`, no `SAVED`.

**`src/components/canvas3d/ritualSite.test.ts`** (node)
- "the ritual view centres the pier tip": `toPercent(site.tip, {320, 256}, 1)` ≈ `{ 50, 50 }` (1e-9); `toDeckPlane({50, 50}, …)` ≈ tip xz.
- Round trip (invariant B): for lane points at progress `0.36, 0.38, 0.40, 0.42, 0.44`, lateral `-0.3, 0, 0.3` lifted to `y = tip.y`: `toDeckPlane(toPercent(p))` ≈ p (1e-6)
  and `mapDrop(...).candidate` ≈ `clampSpotToLane(locateOnLane(lane, p))` for both 320 × 256 and 704 × 256 and zoom factors 1 and `PINCH_ZOOM_MIN`.
- Lead-probed drops (320 × 256, zoom 1, from the centre): 40 px up (`{50, 50 − 40/256 × 100}`) → `onWater true`, candidate lateral ≈ 0.057; 60 px down → `onWater false`
  (near bank); 120 px up → `onWater false` (far bank). Zero size → `null`.
- `releaseYawRad` equals `splineProgressToWorld(lane, LOY_KRATHONG_PIER_RELEASE_SPOT.progress, 0).yawRad`.

**`src/components/canvas3d/ownKrathongPose.test.ts`** (node, real `Group`): one case per kind with the values of Step 10 — PIER (position = tip, scale
`RIVER_KRATHONG_SCALE`, yaw), DRAG with/without a point, RELEASING at `lower 0/1` × `settle 0/1` for pier and drop origins (with `own` from `prepareRiverItems`
of a coord at the release spot: `settle 1` ⇒ position = `splineCoordToPoseInto(...)` + hop), bump 1 adds `RELEASE_BUMP.hopHeight`, RIVER equals
`applyRiverItemTransform` (reduced motion → no bobbing), RIVER with `own null` and HIDDEN → `visible false`. Allocation check: 1 000 RIVER writes create no new
`Vector3` (spy on the constructor).

**`src/components/canvas3d/index.test.tsx`** (modify; stub R3F; add `vi.mock("@/core/ritual/releaseMotion")` that wraps the real factory and records starts like the
existing `partChangeBounce` mock; reset `useUIStore` in `beforeEach`). Existing cases stay; changes:
- "%s taps never select a target or fly the camera": read `before = r3f.flightStarts.length` after render and assert it is unchanged after the taps (CUSTOMIZE `before 0`, RITUAL `before 1`).
- "ritual chip drag releases only past the drag threshold": rename to "a drag onto the water releases there"; prop `onReleaseDrop`; second drag goes **up**
  40 px (`clientY 140 → 100`) and expects one call whose candidate ≈ `mapDrop({50, 50 − 40/256×100}, {320, 256}, 1).candidate`.
New cases:
- "RITUAL_RELEASE frames the pier once": one flight at mount (`immediate false`; `true` with reduced motion), still none of the rings.
- "ritual preview": section `data-own-krathong-pose="PIER"`; `[name="scene-krathong-pose"] [name="scene-krathong"] pointLight` exists; exactly one point light.
- "a drop on the bank does not release": drag 60 px down → `onReleaseDrop` not called, `ritual.hint === "DROP_ON_WATER"`, chip back at 50 %/50 %.
- "the chip hides while releasing": dispatch `RELEASE_STARTED` → no `img` "กระทง ลากลงน้ำ".
- "touchdown ripples once" (reduced motion): dispatch `RELEASE_STARTED` → `TOUCHED_DOWN` is dispatched synchronously, section `data-last-gimmick="ripple"`,
  gimmick count +1; re-render keeps the count.
- "bump plays once": non-reduced, `LANDING_RESOLVED collided` + `TOUCHED_DOWN` (call the recorded lower `onRest`) → exactly one bump start; `SAVED` with
  `movedByServer` afterwards → still one.
- "after the release the own krathong rides the river": state RELEASED with a saved coord, mode WORLD_EXPLORE → `data-own-krathong-pose="RIVER"`; with MFW-25's
  world zone 2 and saved zone 1 → `HIDDEN`; `riverItems` containing the own id are not rendered as `river-item-<id>`.

**`src/components/ui/RitualReleasePanel.test.tsx`**: button calls `release({ kind: "pier" })`; disabled while RELEASING; status texts for every error kind and the drop
hint; `animateInScene false` dispatches `SKIP_ANIMATION` (state `instant true`), `true` does not; reduced motion removes `transition-colors`; works at a 360 px
container (no horizontal overflow of the button: `scrollWidth <= 360`).

**`src/components/ui/FlowRoot.test.tsx`** (modify; MFW-21/25 versions are the base). `vi.stubGlobal("fetch", …)` answers POST with a 201 fixture (zones/creations
GETs with empty bodies). Changes: the SceneViewport mock calls `onReleaseDrop?.(LOY_KRATHONG_PIER_RELEASE_SPOT)` on click; "clicks through all 5 states" awaits
`SHARED_WORLD_EXPLORE` (`findBy`/`waitFor`); the ownership-notice case asserts the token key is `null` **before** the release click and set **after** it (MFW-23 is
the first vault caller, MFW-11 plan). New: "release finishes the ritual" (FALLBACK_2D: button → POST → `SHARED_WORLD_EXPLORE`, `data-own-krathong="released"`);
"a failed save stays in the ritual" (503 → `data-ritual-error="unavailable"`, button enabled); "moderation-blocked returns to the wish" (422 → `WRITE_WISH`).

**`src/core/flow/flowStateMachine.test.ts`, `src/store/useUIStore.test.ts`, `src/config/ritual.config.test.ts`,
`src/config/events/loyKrathong.river.release.test.ts`**: Steps 1, 2, 4, 7.

**`tests/unit/landing-import-graph.test.ts`** (node): BFS over static value imports from `src/app/page.tsx` (resolve `@/` → `src/` and relative paths
to `.ts`/`.tsx`/`/index.ts`/`/index.tsx`). Skip `import type …`, `export type …`, `import { type A, type B } …` where every member starts with `type `, and
dynamic `import(…)`. Fail if any reached bare specifier matches `/^(three|@react-three\/|@react-spring\/)/`; print the chain. Positive control: a fixture
string `import { Vector3 } from "three"` is detected and `import type { X } from "three"` is not. (Lead probe: main's landing graph has 36 modules and only
`react`/`zustand` as packages.)

**`tests/e2e/ritual-release.spec.ts`** (`test.use({ hasTouch: true })`; every test calls `mockCreateCreation` first and `completeWishStep` from MFW-21; collect `pageerror`):
1. "3D: releases from the pier" (HIGH init script): canvas in RITUAL_RELEASE, `data-own-krathong-pose="PIER"`; click "ปล่อยกระทง"; one captured request:
   `new URL(url).pathname === "/api/creations"` and `search === ""`; body keys sorted = the six; `body.ownerToken` equals `localStorage[E2E_OWNER_TOKEN_STORAGE_KEY]`
   and is absent from the URL; `coord` keys exactly the five, `mode "SPLINE_PATH"`, `laneId 1`, `speedFactor 0.008`; `wishVisibility "private"`;
   then `data-flow-state="SHARED_WORLD_EXPLORE"`, `data-own-krathong="released"`, `data-ritual-bumped="false"`, `data-own-krathong-pose="RIVER"`, canvas 1, no page error.
2. "3D: drag onto the water": `page.mouse` drag of the chip 60 px down → no request, `ritual-status` shows "วางกระทงบนผิวน้ำเพื่อปล่อย"; drag 40 px up → one request,
   `SHARED_WORLD_EXPLORE`.
3. "server moved the spot": `moveLateralBy: -0.2` → `data-ritual-bumped="true"`.
4. "503 then retry": status 503 `{ error: "unavailable" }` → status text unavailable, still `RITUAL_RELEASE`, button enabled; `page.unroute` + success mock; click → `SHARED_WORLD_EXPLORE`.
5. "network failure": `abort: true` → the network text.
6. "moderation-blocked returns to the wish": 422 `{ error: "moderation_blocked", reasons: ["phone"] }` → `WRITE_WISH` and `getByTestId("wish-moderation-warning")` visible.
7. "FALLBACK_2D releases with the button": WebGL disabled (same init script as `scene-gating.spec.ts`) → one request, `SHARED_WORLD_EXPLORE`, no canvas, and no
   `/_next/static/*.js` body contains "WebGLRenderer".
8. "reduced motion": `page.emulateMedia({ reducedMotion: "reduce" })` → root `data-reduced-motion="true"`; release completes.
9. "360 px": viewport 360 × 640 → the "ปล่อยกระทง" button is in the viewport and enabled.

## 8. Do NOT (Out of scope and traps)

- Do not build: the creation-id list in LocalStorage or the drawer (MFW-30 — use `onCreationSaved`), ownership proof / private reading (MFW-31), the 2D river
  renderer (MFW-33), instancing (MFW-34), zone UI changes (MFW-25), new ripple meshes or pools (MFW-28 owns them), the pan fix (MFW-27 OQ 1), any Christmas work.
- Do not change MFW-45's route, request parser or placement; MFW-24's collision helpers; MFW-21's wish rules; MFW-25's pagination internals (only the FlowRoot
  effect condition and the SceneViewport `storeRiverItems` mode condition change).
- Never put the raw token in a URL, query string, header, `data-*`, store, log, error message or test snapshot (JSON body only); never `console.*` in the new modules.
  Never send world positions: the drop point stays in `releaseDropRef` (3D layer only).
- Never import `three`, `@react-three/*`, `@react-spring/*`, `@/core/coordinates` (value) or `@/core/world` (value) from `src/core/ritual/**`,
  `src/services/api/createCreationClient.ts`, `src/services/api/releaseCreation.ts`, `src/components/ui/**`. The only path to lane math from the landing graph is
  the guarded dynamic `import("@/core/world/releaseSpot")` in 3D tiers.
- No `useFrame` work outside `OwnKrathong`; no allocation per frame (reuse scratch objects); no new geometry/material/texture; no hex/decimal literals in scene files.
- Do not weaken tests. The only existing-test edits allowed are the ones listed in §7 and the one-line `mockCreateCreation` additions in §6 Step 15.
- Do not touch `.claude/**`, `scripts/**`, `.github/**`, `CLAUDE.md`, `AGENTS.md`, `docs/spec/**`, `docs/backlog*.json`, `docs/plans/**`, `supabase/**`,
  `package.json`, the lockfile, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.mts`, `playwright.config.ts`, `next.config.ts`. No new dependency.
- Next.js: this card uses no new Next API (client `fetch` only). If you need one, read `node_modules/next/dist/docs/` first.

## 9. Definition of done

- Each green, run separately: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm e2e` (in this container:
  `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell pnpm e2e`).
- Every check in §3 has its test. Delete `playwright-report/` and `test-results/` before committing; never commit `.next/` or `*.tsbuildinfo`.
- Branch `feat/MFW-23-make-release-ritual-interaction` from the latest `main`. Conventional commits with the key, e.g.
  `feat(ritual): make and release ritual on the pier MFW-23` (format: CLAUDE.md, `docs/prompts/README.md`).
- Ready PR against `main`, same title. Body (English): summary + link to MFW-23; the AC checklist with the proving file/test; "Decisions" (every PLACEHOLDER
  constant and §12); "Open questions" (§11); ASSUMED INTERFACE differences found on `main`; test plan (five commands and results); follow-ups (§13).
- Leave the PR open for reviewer + qa + `privacy-auditor` + `r3f-perf-reviewer`.

## 10. Interfaces this card provides

| Export | Path | Signature | For |
|---|---|---|---|
| `getReleaseCreation`, `createReleaseCreation`, `ReleaseCreation.release`, `.onCreationSaved` | `@/services/api/releaseCreation` | `release(origin: ReleaseOrigin) => Promise<"saved" \| "failed" \| "revise_wish" \| "ignored">`, `onCreationSaved(listener: (c: PublicCreation) => void) => () => void` | **MFW-30** (store `creation.id` in LocalStorage), MFW-33 (2D release) |
| `submitCreation`, `toCreatedPublicCreation`, `CreateCreationResult`, `CreateCreationFailure` | `@/services/api/createCreationClient` | Step 8 | other write clients |
| `RitualState`, `RitualEvent`, `transitionRitual`, `INITIAL_RITUAL_STATE`, `SavedRelease`, `ReleaseOrigin`, `RitualErrorKind`, `isRitualBumped` | `@/core/ritual` | Step 5a | Christmas tap-to-hang ritual (generalise the spot type), MFW-30 |
| `useUIStore` → `ritual`, `dispatchRitual` | `@/store/useUIStore` | Step 7 | **MFW-30** (`ritual.saved`: own id, zone, coord, createdAtMs, clock offset), MFW-33 |
| `buildReleaseCoord`, `isSplinePathCoordShape`, `didServerMoveSpot`, `estimateServerClockOffsetMs`, `createReleaseMotion`, `ownKrathongPoseKind`, `isOwnZoneVisible`, `excludeOwnAndCap` | `@/core/ritual` | Step 5 | MFW-30, MFW-33 |
| `resolveReleaseLanding`, `resolveReleaseLandingForZone`, `clampSpotToLane`, `ReleaseLanding` | `@/core/world` (`releaseSpot.ts`) | Step 6 | MFW-33 (2D drop) |
| `LOY_KRATHONG_PIER_RELEASE_SPOT` | `@/config/events/loyKrathong.river.config` | `{ laneId, progress, lateralOffset }` | MFW-33 |
| `FlowEvent` `REVISE_WISH` | `@/core/flow` | RITUAL_RELEASE → WRITE_WISH | later write errors |
| `getLoyKrathongRitualSite`, `createRitualDropMapper`, `RitualSite` | `@/components/canvas3d/ritualSite` | Step 10 | MFW-30 (pier view), later rituals |
| `OwnKrathong`, `writeOwnKrathongPose`, `SCENE_OBJECT_NAMES.krathongPose` / `.pierFocus` | `@/components/canvas3d/*` | Steps 10–11 | **MFW-30** (fly to `scene-krathong`, which now rides the river), MFW-34 |
| `RITUAL_COPY`, `RELEASE_*`, `CREATE_CREATION_TIMEOUT_MS`, `SPLINE_LATERAL_OFFSET_LIMIT` | `@/config/ritual.config` | Step 1 | owner tuning |
| DOM hooks | FlowRoot root `data-ritual-phase`, `data-ritual-bumped`, `data-own-krathong`, `data-ritual-error`; section `data-own-krathong-pose`; `data-testid` `ritual-release-panel`, `ritual-status` | — | e2e of later cards |
| `mockCreateCreation`, `E2E_CREATION_ID` | `tests/e2e/fixtures/ritualRoutes.ts` | Step 15 | every later e2e that walks past the ritual |

## 11. Open questions (owner)

Product decisions only. The card ships the default under each; each can change later without rework.

1. **Which krathongs does the ritual show, and which zone after the release?** (MFW-25 OQ 1 and 6.) Default: the ritual already shows the shared world's
   initial zone (MFW-25 policy, NEWEST), so the user sees the krathongs they might bump into and the client pre-check uses them; after the save the world
   switches to the zone of the user's own krathong if it differs. Options: no shared krathongs during the ritual (MFW-25's original default; the bump then
   happens only when the server moves the spot); always stay on the initial zone.
2. **A drop that is not on the water.** Default: the krathong snaps back to the pier and the status line says "วางกระทงบนผิวน้ำเพื่อปล่อย". Option: release at the
   nearest water point instead.
3. **Server-side moderation block at release.** Default: back to the wish step automatically, where MFW-21 shows the server's reasons (new flow edge
   `REVISE_WISH`). Options: stay on the pier with the reasons and a "แก้ไขคำอธิษฐาน" button; offer "เก็บเป็นส่วนตัวแทน".
4. **Save failure.** Default: the krathong goes back to the pier, a Thai error shows, the user retries with the same button; no automatic retry, no "enter the
   world without saving", no offline queue. Options: one automatic retry; continue to the world unsaved; queue and retry later.
5. **LocalStorage unavailable** (`getOrCreate().persisted === false`, MFW-11 follow-up). Default: release anyway with the in-memory token (the creation is saved but
   cannot be found after a reload; the MFW-11 notice already warns). Options: block the release; show an extra warning first.
6. **Thai copy** of `RITUAL_COPY` (all but the two existing strings are DRAFT) and the see-through drag ring look.
7. **Feel placeholders:** spring tensions, `RELEASE_BUMP.hopHeight`, `RELEASE_CANDLE.brightenFactor`, the candle staying bright on the own krathong after the
   release, and the ritual framing (camera centred on the pier tip at the normal zoom; the preview krathong is river-size, about 30 px on a phone).
   Option: a closer ritual zoom (needs an owner number).

## 12. Decisions (lead, technical)

- **D1 — One release orchestrator in `src/services/api/releaseCreation.ts`** with injected deps, like MFW-25's `zonePagination`. Both the button (origin `pier`) and
  the drag (origin `drop` with a parametric candidate) go through it, so token, wish, coord and error handling exist once and are unit-testable without React.
- **D2 — Ritual sub-state lives in `useUIStore`** (`ritual`, pure reducer in `src/core/ritual`). It is flow state shared by the 3D chunk, the DOM panel and
  FALLBACK_2D. The builder store keeps the creation's content; the world store stays MFW-25's data-only zone store. The ritual state holds only public,
  parametric data (`SavedRelease`), never the wish or the token.
- **D3 — FALLBACK_2D never loads lane math.** Lead probe (Next 16 Turbopack build of main + a dynamic import of `riverCollision`): the lane math lands in the
  390 kB three chunk, which contains "isWebGLRenderer", so `scene-gating.spec.ts` would fail and weak devices would download three. The pier release spot is a
  three-free config constant pinned by a test; 3D tiers lazy-load the resolver (three is already loaded there). A static landing-graph test guards it.
- **D4 — Client pre-check in 3D, server is final.** The client runs MFW-24's `findNearestFreeSpot` against the visible zone so the bump can play at touchdown
  (no visible overlap while waiting); the server re-checks at its own time (MFW-45 D8) and its coord is what the krathong settles into and what is kept.
  The bump plays when either moved the spot.
- **D5 — The own krathong is one object across modes.** A new pose group wraps the existing `scene-krathong` group: origin in CUSTOMIZE, pier in the ritual,
  live river pose after the release. The candle light stays the single point light and follows it; MFW-17 selection and MFW-30's fly-to target keep working.
  The own id is removed from `RiverFlow` (no duplicate) and the cap counts it (invariant E).
- **D6 — Animation by react-spring values read in one `useFrame`** (same pattern as `CameraFlightController`), with a pure `createReleaseMotion` that has the
  reduced-motion branch (immediate + synchronous completion) and a pure pose writer. Tests drive both without WebGL.
- **D7 — Server clock offset from the create response** (`createdAt` vs request midpoint) feeds `RiverFlow.now` and the own pose. It removes the skew jump at
  hand-over (MFW-24 follow-up) without a new endpoint; all krathongs share the clock, so spacing is unchanged.
- **D8 — The drag maps through a pure "ritual view" camera** (framing pose from `getCameraFlightPose(pier.tip)`, viewport size, zoom) instead of the live R3F camera.
  It is exact once the framing finishes, deterministic, and testable in jsdom; the chip starts at 50/50, the projection of the pier tip.
- **D9 — On water = inside the visible channel; the candidate is clamped to the lane body limit.** Lead probe on the 320 × 256 ritual view: 40 px up → channel
  lateral 0.04 (water), 60 px down → 0.91 (bank), 120 px up → −0.67 (far bank).
- **D10 — Re-run `evaluateWishDraft` before sending and clear the wish after a save** (coordinator note). An invalid or missing wish sends nothing and returns to the
  wish step; private text does not linger in memory after the save.
- **D11 — 15 s client timeout, no automatic retry.** A hung request must not lock the ritual; a retry without idempotency could duplicate a krathong (§13).
- **D12 — e2e stubs the POST** (`mockCreateCreation`) so flows do not depend on MFW-45's write window (`event_closed` after the festival) and failure cases are
  deterministic; MFW-45's own e2e covers the real route.

## 13. Risks

- **Many unmerged prerequisites (MFW-21, 25, 28, 45).** Names come from their plans. Stop if one is missing; adapt and list differences if names moved.
- **Duplicate krathong on a lost 201.** No idempotency key in MFW-45's contract; a user retry after a timeout can create a second krathong. Follow-up: an optional client
  request id (contract change in MFW-45).
- **Ritual frame cost.** The ritual now renders the shared zone (up to 80 × ~20 meshes until MFW-34) plus continuous frames while the own krathong rides the river.
  Flag to `r3f-perf-reviewer` as deliberate; MFW-34 instancing is the fix.
- **Highlight ring size.** Selecting the own krathong after the release shows MFW-17's ring sized for the large preview krathong (MFW-28 OQ 6 has the same issue).
- **Dragging during the framing flight** maps with the final ritual view, so the krathong may jump under the finger for the first ~0.5 s. Reduced motion has no flight.
- **One-time world shift on the first release** when the device clock is skewed: other krathongs jump by `skew × 0.008` of the lane when the offset becomes known.
- **Scene chunk not yet loaded when the button is pressed** (3D tier): the ritual waits in RELEASING until the scene mounts and animates it; if the chunk never loads,
  the release stays pending (the save itself completes). Rare; report if seen.
- **SwiftShader e2e timing:** the release needs springs plus a request; Playwright's default 5 s expect timeout should cover it. If the FPS meter drops the tier to
  FALLBACK_2D mid-test, the panel completes the ritual instantly (by design). Do not raise thresholds.
- **Reviewer grep noise:** `ownerToken` appears in the request type, the orchestrator and tests (ownership write path); `x`/`z` appear in render-time drop points
  under `src/components/canvas3d/` only.
