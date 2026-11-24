# MFW-25 [5.3] Growing river world & zone pagination — implementation spec

> Hand-off spec for one card. It is the source of truth for the implementer and the reviewer. If this file and
> `docs/backlog.json` / `docs/spec/open-questions.md` disagree, those files win, and the PR must say so.
> Branch: `feat/MFW-25-growing-river-world-zone-pagination` · Jira: MFW-25 · Epic: MFW-22 (Loop 5)
> Labels: `loy-krathong`, `world`, `perf`. Extra reviewers: **r3f-perf-reviewer** (the diff touches `src/components/canvas3d/**`,
> `src/core/world/**`, label `perf`; it also checks the gate in "Required scope from the MFW-24 perf review" below) and **privacy-auditor**
> (the diff touches `src/services/**` and `src/app/api/**`). The card does **not** touch `supabase/**`, so it is not an owner-merge card. It merges
> after review and a green `ci` check.

## Summary

The shared river must grow instead of getting crowded. Krathongs are grouped into numbered river-bend zones (Zone 1, 2, 3, …),
and each zone holds at most 80 (owner decision 4). This card adds:
1. **ZoneManager**: pure functions. One of them is the rule the server write path (MFW-45) calls to choose a new creation's zone:
   the first zone below 80 items that still has a free spot, otherwise a new zone (owner decision 25). The others help the client pick a zone.
2. **GrowingWorldScaler**: a pure view model of the growing world. It gives the open zone count, the visible zone and its up- and
   downstream neighbours.
3. **Server zone directory**: a small public endpoint, `GET /api/zones?event=…`, that returns how many zones are open.
4. **Client zone pagination**: it loads **only the visible zone** from `GET /api/creations` into `useWorldStore`, and it switches zones. The
   old zone's items are released first.
5. **The river render budget required by the MFW-24 perf review.** This card is the first to feed real items into `RiverFlow`. `RiverFlow`
   is guarded by `ZONE_ITEM_CAP`. It also gets a per-tier visible-item cap and a per-tier river shadow switch in `TIER_BUDGETS`, plus a
   deterministic rule for which items show when a tier's cap is below the zone size. Find My can still locate and pin any item.

The visual stays minimal on purpose: every zone reuses the same river bend (MFW-27 environment, MFW-24 lane). A small DOM navigator moves
up- and downstream. The product questions about the look are listed at the end.

## Prerequisites

All blockers are merged on `main` (a6ce8f3, 2026-11-24): MFW-12 (d8934b3), MFW-24 (a6ce8f3), MFW-27 (e7e391a), MFW-20 (c466788),
MFW-19, MFW-11. Cut the branch from the latest `main`. There is **no ASSUMED INTERFACE** left in this card. Every name below was read from `main`.

| Card | What this card uses (real names on `main`) |
|---|---|
| MFW-7 [1.1] flow | `useUIStore` (`flowState`, `selectedEventId`), the flow state `"SHARED_WORLD_EXPLORE"`, and `FESTIVAL_EVENT_IDS` / `FestivalEventId` (`src/config/events/types.ts`) |
| MFW-9 [1.3] device | `useDeviceStore` (`qualityTier`, `reducedMotion`, `profiled`, `setQualityTier`), plus `TIER_BUDGETS`, `TierBudget`, `RenderTier` and `QualityTier` in `src/config/performance.config.ts` |
| MFW-19 [4.1] krathong | `parseEventAppearance(eventId, input)`, `parseKrathongAppearance`, `serializeKrathongAppearance`, `DEFAULT_KRATHONG_APPEARANCE` and `type KrathongAppearance` from `@/core/customization` (a server-safe barrel). `createKrathongAssets` (`src/components/models/loyKrathong/krathongAssets.ts`) and `KrathongAssetsProvider`: one shared asset set per canvas. `KrathongModel({ appearance, shadows })`, where `shadows` drives `castShadow` on every part and `receiveShadow` on the base |
| **MFW-12 [2.2]** API & DB | `src/config/world.config.ts`: `ZONE_ITEM_CAP = 80`, `ZONE_ID_MIN = 1`. `src/config/database.config.ts`: `CREATIONS_PUBLIC_VISIBLE_VIEW`, `PUBLIC_CREATION_COLUMNS`, `PUBLIC_ZONE_ORDER`, `PG_INT4_MAX`, `UUID_PATTERN`. `src/services/api/creationTypes.ts`: `PublicCreation`, `PublicZoneResponse`, `ApiErrorBody`, `ZoneQueryField`, `PUBLIC_CREATION_KEYS` (the only value export; its other imports are `import type`). `creationRepository.ts`: `CreationRepository { backend; listPublicZone; insertCreation }`, `CreationRepositoryError(code, detail?)`. `inMemoryCreationRepository.ts`: `createInMemoryCreationRepository({ now?, newId? })` with `setModeration`, the private maps `publicRows` / `privateRows`, and the visible filter written inline in `listPublicZone`. `supabaseCreationRepository.ts`: the closure helpers `send(target, method, body?)` and `restBase`. `creationValidation.ts`: `isFestivalEventId`, `isZoneId`. `json.ts`: `isPlainObject`. `zoneQuery.ts`: `ZONE_QUERY_PARAMS`, `parseZoneQuery`. `listCreations.ts`: `handleListCreations` (template for Step 11). `creationRepositoryFactory.ts`: `getCreationRepository()`. Fixtures in `__fixtures__/creations.ts`: `makeNewCreation`, `makePrivateWish`, `OWNER_HASH_FIXTURE`, `PRIVATE_CIPHERTEXT_FIXTURE`, `KEY_ID_FIXTURE`, `FAR_FUTURE`. `GET /api/creations?event=&zone=` returns at most 80 items, oldest first, with `no-store` |
| **MFW-24 [5.2]** river flow | `src/components/canvas3d/RiverFlow.tsx`: `RiverFlow({ items, lanes, shadows, reducedMotion, now? })` and `RiverFlowItem { id; coord: SplinePathCoord; createdAtMs; appearance: KrathongAppearance }`. Today it renders **every** prepared item: one `<group name="river-item-<id>">` with a full `KrathongModel` each, one `useFrame` that invalidates every frame while items exist, and no cap. `src/components/canvas3d/index.tsx`: `SceneViewport({ mode?, onGestureRelease?, viewControlRef?, riverItems = NO_RIVER_ITEMS })`, `NO_RIVER_ITEMS`, and `<RiverFlow items={riverItems} lanes={getLoyKrathongRiverLanes()} shadows={shadows} …>` inside `SCENE_OBJECT_NAMES.worldView`. `@/core/world`: `getLoyKrathongRiverLanes()`, `prepareRiverItems`, `PreparedRiverItem`, `RiverRenderSource`, `getRiverItemPositionAt`, and from `riverCollision.ts`: `RiverSpot { laneId; progress; lateralOffset }`, `riverSpotOf(item, lanes, nowMs)`, `isSpotFree(candidate, existing, lanes, nowMs)` and **`findNearestFreeSpot(candidate: RiverSpot, existing: readonly RiverPlacementSource[], lanes: RiverLaneSet, nowMs: number): RiverSpot \| null`** (null = lane full). `@/core/coordinates`: `parsePersistableCoord`, `isValidRiverPlacement`, `SplinePathCoord`, `RiverPlacementSource`, `RiverLaneSet`. `src/config/riverFlow.config.ts`: `RIVER_DRIFT_SPEED_FACTOR = 0.008` (the one drift speed, owner decision 25). `src/config/events/loyKrathong.river.config.ts`: `LOY_KRATHONG_RIVER_LANE_ID = 1`, `LOY_KRATHONG_RIVER_LANES` (one lane). `src/core/math/wrap01.ts`: `wrap01` |
| MFW-27 [6.1] environment | Nothing directly (`RiverFlow` already sits in its world-view group) |

Facts checked on `main` (a6ce8f3):
- `src/store/useWorldStore.ts` = `{ currentZoneId: number | null; participantCount: number | null }` with no actions. `src/store/stores.test.ts`
  line 27 asserts that exact shape with `toEqual`. This card updates that one line (D8).
- `src/core/world/index.ts` re-exports `riverEnvironment`, `bobbing`, `riverLanes`, `riverFlow` and `riverCollision`, and pulls in `three`. Landing-chunk code
  (FlowRoot, stores, the `src/services/api` client code) imports world files **by path** (`@/core/world/zoneManager`), never through the barrel.
- `FlowRoot` already reads `selectedEventId` and already imports `lazy, Suspense, useRef` from `react`. It lazy-imports `@/components/canvas3d`.
  `tests/e2e/scene-gating.spec.ts` asserts that the landing page ships no WebGL chunk. `tests/e2e/flow.spec.ts` (line 43) and `FlowRoot.test.tsx` (line 60) assert
  **zero buttons** at `SHARED_WORLD_EXPLORE` in an empty world. D6 keeps that true.
- `src/config/performance.config.test.ts` asserts `TIER_BUDGETS` with an exact `toEqual`. This card adds two fields to it, so that expectation is
  extended (Step 3). `src/components/canvas3d/index.test.tsx` reads `TIER_BUDGETS[tier].pixelRatioCap / shadows / maxTextureSize` only, so it is unaffected.
- `RiverFlow.test.tsx` mocks `KrathongModel` to a `mesh` carrying `data-shadows`. Its only shadow case passes `shadows={false}` and expects `"false"`, which
  stays true under any tier. It does not reset `useDeviceStore` (the default tier is `MEDIUM`).
- `tests/unit/no-raw-xyz-persistence.test.ts` scans `src/services`, `src/app/api` and `supabase` (tests too) for a `three` import, `Vector3` and `.toArray()`.
- `next.config.ts` has `cacheComponents: true`. A `GET` route that reads `request.url` is dynamic, so do not export `dynamic`, `revalidate` or `runtime`.
  `src/app/api/creations/route.ts` is the template. Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` before writing `route.ts`.

### Required scope from the MFW-24 perf review (gate recorded on Jira MFW-25)

r3f-perf-reviewer found that `RiverFlow` mounts a full `KrathongModel` (about 20 meshes) per item, with no cap, no instancing and no tier scaling.
A full zone of 80 is therefore about 1,600 draw calls, plus a shadow pass on HIGH, inside a continuous demand loop. This card makes `riverItems`
non-empty for the first time, so it must:
- (a) guard `RiverFlow` itself with `ZONE_ITEM_CAP`, not only the query (Step 9);
- (b) add per-tier river limits to `TIER_BUDGETS` and have `RiverFlow` read them from the store tier (Steps 3 and 9):
  - a visible river-item cap (`riverItemCap`, PLACEHOLDER values, with LOW below 80);
  - a river-item cast-shadow switch (`riverItemCastShadow`, off on MEDIUM and LOW);
  - a deterministic choice of the shown items when the tier cap is below the zone size, which keeps Find My able to locate and pin a hidden item
    (Step 8, D11);
- (c) state that MFW-34 instancing (krathong parts batched across river items) is the real fix and should land before the Christmas public launch
  (Risks, Definition of done).

## Acceptance criteria → checks

The AC text is verbatim from `docs/backlog.json`, story 5.3.

1. **"Max 80 krathongs rendered per river-bend zone (owner decision, open question 4)"**
   - Server: MFW-12 caps `GET /api/creations` at `ZONE_ITEM_CAP`. Its tests stay green.
   - Client fetch: `fetchZoneItems` keeps at most `ZONE_ITEM_CAP` items. Test: `src/services/api/zoneClient.test.ts` → "keeps at most 80 of 85 items".
   - Store: `zoneItems.length <= ZONE_ITEM_CAP` after any load. Test: `src/services/api/zonePagination.test.ts` → "store never holds more than 80".
   - Mapper: `publicCreationsToRiverItems` returns at most `ZONE_ITEM_CAP`. Test: `src/core/world/zoneRiverItems.test.ts` → "caps at 80 valid items".
   - **Renderer guard (perf gate a):** `RiverFlow` renders at most `min(ZONE_ITEM_CAP, TIER_BUDGETS[tier].riverItemCap)` items even when it is given 85
     directly. Tests: `src/components/canvas3d/RiverFlow.test.tsx` → "never renders more than ZONE_ITEM_CAP", "LOW renders at most its tier cap";
     `src/components/canvas3d/index.test.tsx` → "renders at most 80 river items from the store".
   - **Tier budget (perf gate b):** `TIER_BUDGETS` has `riverItemCap` (each ≤ 80, LOW < 80, HIGH ≥ MEDIUM ≥ LOW) and `riverItemCastShadow` (false on
     MEDIUM and LOW). `RiverFlow` passes `shadows && riverItemCastShadow` to every river `KrathongModel`. Tests: `src/config/performance.config.test.ts`;
     `RiverFlow.test.tsx` → "river shadows follow the tier".
   - **Which items show (perf gate b):** `selectVisibleRiverItems` is deterministic, time-invariant, spreads the shown items evenly along the lane and always
     includes pinned ids. Test: `src/core/world/riverVisibility.test.ts`. Find My can still locate a hidden item (`getRiverItemPositionAt` on any store
     item), and `focusedCreationId` pins it into the rendered set. Tests: `riverVisibility.test.ts` → "pinned ids are always shown";
     `index.test.tsx` → "a focused creation is rendered even when the tier cap hides it".
   - Write side: `assignZoneForNewCreation` never returns a zone that has `ZONE_ITEM_CAP` items or no free spot. Test: `src/core/world/zoneManager.test.ts`.
   - E2E: an intercepted zone of 85 shows `data-zone-item-count="80"`. Test: `tests/e2e/zone-pagination.spec.ts`.
2. **"New zones (Zone 2, 3, …) open along the river as participation grows (ZoneManager / GrowingWorldScaler)"**
   - ZoneManager: `assignZoneForNewCreation` returns Zone 1 for an empty event, stays in the first zone that is below the cap with a free spot, and opens
     `max + 1` when every zone is full (80 items **or** `findNearestFreeSpot` returned `null`, owner decision 25). It also fills gaps. Test: `zoneManager.test.ts`.
   - Directory: `GET /api/zones?event=loy_krathong` → `{ eventId, zoneCount }`, where `zoneCount` is the highest zone id with a visible creation (minimum 1). Tests:
     `src/services/api/zoneDirectory.test.ts`, `src/app/api/zones/route.test.ts`, new cases in `inMemoryCreationRepository.test.ts` /
     `supabaseCreationRepository.test.ts`, and `tests/e2e/zones-api.spec.ts`.
   - GrowingWorldScaler: zone ids increase **downstream** ("ต่อเนื่องไปตามลำน้ำ"), and its view model gives the visible zone, the count and the neighbours. Test:
     `src/core/world/growingWorldScaler.test.ts`.
   - UI: `ZoneNavigator` shows "คุ้งน้ำที่ n จาก N" and the up/down buttons only when that neighbour exists. Tests: `src/components/ui/ZoneNavigator.test.tsx`;
     `zone-pagination.spec.ts` (3 zones: start on the newest, go upstream, then downstream).
3. **"Only the visible zone is loaded"**
   - `enterWorld` fetches the directory and then exactly **one** `GET /api/creations`. `loadZone(z)` fetches only zone `z`. A superseded request is aborted and
     ignored. Test: `zonePagination.test.ts` → "enter loads exactly one zone", "switch aborts and ignores the previous zone", "store only ever holds the
     visible zone's items".
   - A switch clears the old items before the new request resolves. Test: `zonePagination.test.ts` → "switch releases the old zone first".
   - Scene: after a switch, the old `river-item-*` groups unmount. The krathong asset set is created once and never disposed or re-created per zone, and
     no geometry/material is created per zone (invariant E). Tests: `index.test.tsx` → "zone switch swaps river items", "zone switch reuses the one
     krathong asset set"; `tests/unit/world-zone-boundary.test.ts` → "no per-zone three resources".
   - E2E: the browser requested only the visible zones, in order. Test: `zone-pagination.spec.ts`.

## Owner decisions that apply

These are quoted from `docs/spec/open-questions.md`. Do not reopen them.

- **Row 4:** "80 items per zone (owner, 2026-11-23)". → `ZONE_ITEM_CAP` is the only per-zone cap. The tier caps are render budgets **below** it, so
  they never change how many items a zone holds or loads.
- **Row 3:** public reads exclude hidden, flagged and auto-hidden items. → The directory counts only visible creations, using the same view or filter as `listPublicZone`.
- **Row 5 (MFW-9):** the tier budgets live in `performance.config.ts`. → The new river limits are added to `TIER_BUDGETS` as **PLACEHOLDER** lead values
  (Open question 7), and code reads them from there. There are no inline numbers.
- **Row 21:** "one single wide lane per river". → This card does not depend on the number of lanes. Fixtures use `LOY_KRATHONG_RIVER_LANE_ID`.
- **Row 23:** "krathongs keep drifting; only the bobbing stops". → Zone switching adds no animation. The tier cap does not depend on motion.
- **Row 25:** "no overlap … the server re-checks the spot against the zone and moves it to the nearest free spot if two releases race". → A zone is full at
  `ZONE_ITEM_CAP` items **or** when `findNearestFreeSpot(…)` returns `null`, whichever comes first. `ZoneFill.hasFreeSpot` carries the second signal.
  The collision check always uses **all** of the zone's items, never the tier-visible subset (Do NOT).
- **Row 16 / launch plan:** build engine pieces generically. → ZoneManager, GrowingWorldScaler, the directory, the pagination and `selectVisibleRiverItems` are event-agnostic.
- **Backlog 2.4 AC (MFW-45):** "The server assigns zone_id (first zone of the event below the 80-item cap, else a new zone)". → This is
  `assignZoneForNewCreation`. MFW-45 calls it, so this card writes no `POST`.

Row 4 already names MFW-25 and is already decided. No other row names this card. **Do not edit `docs/spec/open-questions.md`.**

## Files

| Path | New/modify | Purpose |
|---|---|---|
| `src/config/world.config.ts` | modify | Add `INITIAL_ZONE_POLICIES`, `InitialZonePolicy`, `WORLD_INITIAL_ZONE_POLICY` |
| `src/config/database.config.ts` | modify | Add `ZONE_DIRECTORY_COLUMNS`, `HIGHEST_ZONE_ORDER`, `ZONE_DIRECTORY_LIMIT` |
| `src/config/performance.config.ts` | modify | `TierBudget` gains `riverItemCap`, `riverItemCastShadow`; values in `TIER_BUDGETS` |
| `src/config/performance.config.test.ts` | modify | Extend the `TIER_BUDGETS` expectation; add a river-budget case |
| `src/core/world/zoneManager.ts` | new | ZoneManager (pure, no three) |
| `src/core/world/growingWorldScaler.ts` | new | GrowingWorldScaler (pure, no three) |
| `src/core/world/zoneRiverItems.ts` | new | `publicCreationsToRiverItems` (3D chunk) |
| `src/core/world/riverVisibility.ts` | new | `riverPhaseOf`, `selectVisibleRiverItems`, `NO_PINNED_RIVER_IDS` (tier-cap selection) |
| `src/core/world/index.ts` | modify | Add four `export *` lines |
| `src/components/canvas3d/RiverFlow.tsx` | modify | `ZONE_ITEM_CAP` guard, tier cap + tier shadows from `useDeviceStore`, `pinnedIds` prop |
| `src/components/canvas3d/RiverFlow.test.tsx` | modify | Add cases; existing cases unchanged |
| `src/services/api/apiPaths.ts` | new | `CREATIONS_API_PATH`, `ZONES_API_PATH`, `ZONE_API_QUERY_PARAMS` |
| `src/services/api/zoneQuery.ts` | modify | `ZONE_QUERY_PARAMS` becomes a re-export of `ZONE_API_QUERY_PARAMS` |
| `src/services/api/creationTypes.ts` | modify | Add `ZoneDirectoryResponse` |
| `src/services/api/creationRepository.ts` | modify | Add `highestVisibleZoneId(eventId)` |
| `src/services/api/inMemoryCreationRepository.ts` | modify | Extract `isVisible`; implement `highestVisibleZoneId` |
| `src/services/api/supabaseCreationRepository.ts` | modify | Implement `highestVisibleZoneId` |
| `src/services/api/zoneDirectory.ts` | new | `parseZoneDirectoryQuery`, `handleZoneDirectory` |
| `src/app/api/zones/route.ts` | new | `GET` only |
| `src/services/api/zoneClient.ts` | new | Client fetch (allowlist + private-key guard + cap) |
| `src/services/api/zonePagination.ts` | new | `createZonePagination`, `getZonePagination`, `loadZone` |
| `src/services/api/index.ts` | modify | Export `ZoneDirectoryResponse` type and the `apiPaths` constants |
| `src/store/useWorldStore.ts` | modify | Data-only world state (+ `focusedCreationId`); `INITIAL_WORLD_STATE`, `NO_ZONE_ITEMS` |
| `src/store/stores.test.ts` | modify | Update line 27 only (D8) |
| `src/components/ui/ZoneNavigator.tsx` | new | DOM zone navigator (Thai copy) |
| `src/components/ui/FlowRoot.tsx` | modify | Enter/leave the world; render `<ZoneNavigator />` |
| `src/components/ui/FlowRoot.test.tsx` | modify | Add a `vi.mock` and two cases |
| `src/components/canvas3d/index.tsx` | modify | Visible zone from `useWorldStore`; pin `focusedCreationId`; `data-zone-id`, `data-river-item-count` |
| `src/components/canvas3d/index.test.tsx` | modify | Add cases to the existing `describe("river flow in the scene")` |
| `src/core/world/zoneManager.test.ts`, `growingWorldScaler.test.ts`, `zoneRiverItems.test.ts`, `riverVisibility.test.ts` | new | Pure tests |
| `src/services/api/zoneClient.test.ts`, `zonePagination.test.ts`, `zoneDirectory.test.ts`, `apiPaths.test.ts` | new | Client/server tests |
| `src/services/api/inMemoryCreationRepository.test.ts`, `supabaseCreationRepository.test.ts` | modify | Add `highestVisibleZoneId` cases only |
| `src/app/api/zones/route.test.ts` | new | Route through the real `GET` |
| `src/components/ui/ZoneNavigator.test.tsx` | new | Navigator tests |
| `tests/unit/world-zone-boundary.test.ts` | new | Landing-path import allowlist, no per-zone three resources, no console |
| `tests/e2e/fixtures/zoneFixtures.ts` | new | Fixture builders for intercepted responses (pure TS) |
| `tests/unit/zone-e2e-fixtures.test.ts` | new | The e2e fixtures pass the real validators |
| `tests/e2e/zones-api.spec.ts` | new | Real `/api/zones` without Supabase env |
| `tests/e2e/zone-pagination.spec.ts` | new | Zone flow with an intercepted API (FALLBACK_2D + 3D smoke) |

## Implementation steps

Conventions for every file:
- TypeScript strict, English comments, no `any`, no `console.*` in non-test files.
- Named constants only, with no inline numbers except `0`, `1` and those written below. `Object.freeze` exported constant arrays and objects.
- Error messages carry only codes or field names, never input values.
- In `src/components/canvas3d/**` (non-test), write no decimal literal and no hex colour, comments included (MFW-27 static scan).
- **Landing-path files** (`apiPaths.ts`, `zoneClient.ts`, `zonePagination.ts`, `zoneManager.ts`, `growingWorldScaler.ts`, `useWorldStore.ts`,
  `ZoneNavigator.tsx`, `FlowRoot.tsx`) import only what `tests/unit/world-zone-boundary.test.ts` allows.

### Step 1 — `src/config/world.config.ts` (modify: append)

```ts
/** Which zone a visitor sees first when entering the shared world. */
export const INITIAL_ZONE_POLICIES = Object.freeze(["NEWEST", "FIRST"] as const);
export type InitialZonePolicy = (typeof INITIAL_ZONE_POLICIES)[number];
/**
 * PLACEHOLDER product default (spec silent, MFW-25 Open question 1): start at the newest (most downstream) open zone,
 * the "front" of the growing river. Flip to "FIRST" to start at Zone 1.
 */
export const WORLD_INITIAL_ZONE_POLICY: InitialZonePolicy = "NEWEST";
```

### Step 2 — `src/config/database.config.ts` (modify: append)

```ts
/** Zone directory read (MFW-25): explicit column allowlist, never "*". */
export const ZONE_DIRECTORY_COLUMNS = Object.freeze(["zone_id"] as const);
/** Highest visible zone first. */
export const HIGHEST_ZONE_ORDER = "zone_id.desc";
/** One row is enough to know the highest zone id. */
export const ZONE_DIRECTORY_LIMIT = 1;
```

### Step 3 — `src/config/performance.config.ts` (modify: river budget, perf gate b)

Extend `TierBudget` (keep the three existing fields and their docs):
```ts
  /**
   * Max river krathongs rendered at once on this tier (≤ ZONE_ITEM_CAP; a zone still loads up to 80 — the rest stay in the
   * store for Find My). PLACEHOLDER lead values (spec silent, MFW-25 Open question 7) until MFW-34 instancing lands.
   */
  readonly riverItemCap: number;
  /** River krathongs cast shadows (only where `shadows` is on too). PLACEHOLDER (MFW-25 Open question 7). */
  readonly riverItemCastShadow: boolean;
```
Append the new fields to each entry of `TIER_BUDGETS`, and leave the existing values unchanged:
```ts
HIGH: Object.freeze({ pixelRatioCap: 2, shadows: true, maxTextureSize: 2048, riverItemCap: 80, riverItemCastShadow: true }),
MEDIUM: Object.freeze({ pixelRatioCap: 1.5, shadows: false, maxTextureSize: 1024, riverItemCap: 48, riverItemCastShadow: false }),
LOW: Object.freeze({ pixelRatioCap: 1, shadows: false, maxTextureSize: 512, riverItemCap: 24, riverItemCastShadow: false }),
```
Above `TIER_BUDGETS`, add a one-line comment: `// riverItemCap / riverItemCastShadow: PLACEHOLDER lead values (MFW-25, MFW-24 perf review), not owner numbers.`
Do **not** import `ZONE_ITEM_CAP` into this file, so the config files stay independent. A test checks `riverItemCap <= ZONE_ITEM_CAP`.

`src/config/performance.config.test.ts`: in the case "has the owner budgets, frozen", extend the `toEqual` object with the two new fields per tier (the values
above). Add one new case, "river budget (lead PLACEHOLDER, MFW-25)":
- for each tier, `riverItemCap` is a safe integer with `1 <= cap <= ZONE_ITEM_CAP`;
- `HIGH >= MEDIUM >= LOW`;
- `LOW < ZONE_ITEM_CAP`;
- `MEDIUM.riverItemCastShadow === false` and `LOW.riverItemCastShadow === false`.

Constant table:

| Constant | Value | File | Source |
|---|---|---|---|
| `ZONE_ITEM_CAP` / `ZONE_ID_MIN` | `80` / `1` (existing) | `world.config.ts` | owner OQ 4 / MFW-12 |
| `WORLD_INITIAL_ZONE_POLICY` | `"NEWEST"` | `world.config.ts` | **PLACEHOLDER (spec silent)**, Open question 1 |
| `TIER_BUDGETS.*.riverItemCap` | HIGH `80`, MEDIUM `48`, LOW `24` | `performance.config.ts` | **PLACEHOLDER (spec silent)**, Open question 7 |
| `TIER_BUDGETS.*.riverItemCastShadow` | HIGH `true`, MEDIUM `false`, LOW `false` | `performance.config.ts` | **PLACEHOLDER**, Open question 7 (MEDIUM/LOW off per perf review) |
| `ZONE_DIRECTORY_COLUMNS` / `HIGHEST_ZONE_ORDER` / `ZONE_DIRECTORY_LIMIT` | `["zone_id"]` / `"zone_id.desc"` / `1` | `database.config.ts` | lead |
| `CREATIONS_API_PATH` / `ZONES_API_PATH` | `"/api/creations"` / `"/api/zones"` | `src/services/api/apiPaths.ts` | MFW-12 contract / lead |
| `MS_PER_SECOND` | `1000` (module-private unit constant) | `src/core/world/riverVisibility.ts` | unit (open question 6: speedFactor per second) |

### Step 4 — `src/core/world/zoneManager.ts` (new; pure; imports **only** `@/config/world.config`)

```ts
import { ZONE_ID_MIN, ZONE_ITEM_CAP, type InitialZonePolicy } from "@/config/world.config";

/**
 * Occupancy of one existing zone, as counted by the server write path (MFW-45).
 * MFW-45: itemCount = every stored, non-expired row of the zone INCLUDING hidden/flagged ones (so an un-hidden item can never
 * push a zone above the cap); hasFreeSpot = findNearestFreeSpot(candidate, zoneItems, getLoyKrathongRiverLanes(), nowMs) !== null
 * (src/core/world/riverCollision.ts; owner decision 25). Make read + insert atomic (e.g. a per-event advisory lock in a new SQL function).
 */
export interface ZoneFill {
  readonly zoneId: number;      // safe integer >= ZONE_ID_MIN
  readonly itemCount: number;   // safe integer >= 0
  readonly hasFreeSpot: boolean;
}

/** A zone is full at the item cap OR when no free spot is left, whichever comes first (owner decisions 4 and 25). */
export function isZoneFull(fill: ZoneFill, cap: number = ZONE_ITEM_CAP): boolean;
/** Backlog 2.4: "first zone of the event below the 80-item cap, else a new zone". Missing ids in [ZONE_ID_MIN, max] count as empty. */
export function assignZoneForNewCreation(fills: readonly ZoneFill[], cap: number = ZONE_ITEM_CAP): number;
/** Open zones = highest zone id with a visible creation; at least ZONE_ID_MIN. */
export function zoneCountFromHighestZoneId(highestZoneId: number | null): number;
export function isClientZoneId(value: unknown): value is number;
export function pickInitialZoneId(zoneCount: number, policy: InitialZonePolicy): number;
```

Behaviour:
- `isZoneFull(fill, cap)`: `return fill.itemCount >= cap || !fill.hasFreeSpot;`
- `assignZoneForNewCreation(fills, cap)`:
  1. If `!Number.isSafeInteger(cap) || cap < 1`, throw `RangeError("cap must be a positive integer")`.
  2. Build `byZone = new Map<number, ZoneFill>()`. For each fill, in order:
     - `zoneId` must be a safe integer `>= ZONE_ID_MIN`, otherwise throw `RangeError("invalid zoneId")`;
     - `itemCount` must be a safe integer `>= 0`, otherwise throw `"invalid itemCount"`;
     - `typeof hasFreeSpot === "boolean"`, otherwise throw `"invalid hasFreeSpot"`;
     - a duplicate id throws `"duplicate zoneId"`.
  3. `if (byZone.size === 0) return ZONE_ID_MIN;`
  4. `const max = Math.max(...byZone.keys());`
  5. `for (let z = ZONE_ID_MIN; z <= max; z++) { const f = byZone.get(z); if (f === undefined || !isZoneFull(f, cap)) return z; }`
  6. `return max + 1;`
- `zoneCountFromHighestZoneId(h)`: `null` → `ZONE_ID_MIN`. A value that is not a safe integer `>= ZONE_ID_MIN` throws `RangeError("invalid highestZoneId")`.
  Otherwise return `h`.
- `isClientZoneId(v)`: `typeof v === "number" && Number.isSafeInteger(v) && v >= ZONE_ID_MIN`.
- `pickInitialZoneId(count, policy)`: `!isClientZoneId(count)` → `RangeError("invalid zoneCount")`. Return `policy === "FIRST" ? ZONE_ID_MIN : count`.

### Step 5 — `src/core/world/growingWorldScaler.ts` (new; pure; imports **only** `@/config/world.config`)

```ts
/**
 * GrowingWorldScaler: view model of the growing river (spec §6.5 Task 5.3 "เปิดโซนคุ้งน้ำใหม่ (Zone 2, Zone 3, ...) ต่อเนื่องไปตามลำน้ำ").
 * Zone ids increase downstream: Zone 1 is the most upstream bend. Every zone renders the same river bend (one environment,
 * one lane set); zone_id only selects which krathongs are shown.
 */
export interface GrowingWorldView {
  readonly zoneCount: number;                 // open zones (growth level), >= visibleZoneId
  readonly visibleZoneId: number;
  readonly upstreamZoneId: number | null;     // visibleZoneId - 1, null at Zone 1
  readonly downstreamZoneId: number | null;   // visibleZoneId + 1, null at the newest zone
}
export function describeGrowingWorld(zoneCount: number | null, visibleZoneId: number | null): GrowingWorldView | null;
```
- `visibleZoneId === null` → `null`.
- If `visibleZoneId` is not a safe integer `>= ZONE_ID_MIN`, or `zoneCount` is neither `null` nor one, throw `RangeError("invalid zone")`.
- `const count = Math.max(zoneCount ?? ZONE_ID_MIN, visibleZoneId);`
- Return a frozen `{ zoneCount: count, visibleZoneId, upstreamZoneId: visibleZoneId > ZONE_ID_MIN ? visibleZoneId - 1 : null,
  downstreamZoneId: visibleZoneId < count ? visibleZoneId + 1 : null }`.

### Step 6 — `src/core/world/zoneRiverItems.ts` (new; 3D chunk only)

```ts
import type { FestivalEventId } from "@/config/events/types";
import { ZONE_ITEM_CAP } from "@/config/world.config";
import { isValidRiverPlacement, parsePersistableCoord, type SplinePathCoord } from "@/core/coordinates";
import { parseEventAppearance, type KrathongAppearance } from "@/core/customization";
import type { PublicCreation } from "@/services/api/creationTypes";
import type { RiverRenderSource } from "./riverFlow";

/** One renderable krathong of the visible zone. Public fields only (invariant C). Structurally a RiverFlowItem. */
export interface ZoneRiverItem extends RiverRenderSource {
  readonly appearance: KrathongAppearance;
}
export interface ZoneRiverItemsQuery { readonly eventId: FestivalEventId; readonly zoneId: number }

/** Store items → river items, at most ZONE_ITEM_CAP (AC1). Skips invalid items silently. Not per-frame (useMemo). */
export function publicCreationsToRiverItems(creations: readonly PublicCreation[], query: ZoneRiverItemsQuery): readonly ZoneRiverItem[];
```
```ts
const out: ZoneRiverItem[] = [];
const seen = new Set<string>();
for (let i = 0; i < creations.length && out.length < ZONE_ITEM_CAP; i++) {
  const c = creations[i];
  if (c.eventId !== query.eventId || c.zoneId !== query.zoneId) continue;
  if (typeof c.id !== "string" || c.id === "" || seen.has(c.id)) continue;
  const createdAtMs = Date.parse(c.createdAt);
  const parsed = parsePersistableCoord(c.coord);
  if (!parsed.ok || parsed.coord.mode !== "SPLINE_PATH") continue;
  const coord: SplinePathCoord = parsed.coord;
  if (!isValidRiverPlacement({ coord, createdAtMs })) continue; // also rejects NaN createdAtMs
  const appearance = parseEventAppearance(query.eventId, c.appearance);
  if (!appearance.ok) continue;
  seen.add(c.id);
  out.push(Object.freeze({ id: c.id, coord, createdAtMs, appearance: appearance.appearance }));
}
return Object.freeze(out);
```
Never copy `publicWishText`, `expiresAt` or other fields into a river item.

### Step 7 — `src/core/world/index.ts` (modify)

Keep every existing line and add:
```ts
export * from "./zoneManager";
export * from "./growingWorldScaler";
export * from "./zoneRiverItems";
export * from "./riverVisibility";
```

### Step 8 — `src/core/world/riverVisibility.ts` (new; the tier-cap selection, perf gate b)

```ts
import type { SplinePathCoord } from "@/core/coordinates";
import { wrap01 } from "@/core/math/wrap01";

const MS_PER_SECOND = 1000; // open question 6: speedFactor is progress per second, createdAt is epoch ms

/** Stable empty pin list (memo-friendly default). */
export const NO_PINNED_RIVER_IDS: readonly string[] = Object.freeze([]);

/**
 * Time-invariant "phase" of a river item: where it would have been at epoch 0, wrap01(spawn − createdAt[s] × speed).
 * All krathongs drift at RIVER_DRIFT_SPEED_FACTOR (owner decision 25), so phase order = order along the lane at ANY moment,
 * and it never changes while they drift. Pure, + − × ÷ % only (bit-identical across clients).
 */
export function riverPhaseOf(coord: SplinePathCoord, createdAtMs: number): number {
  return wrap01(coord.spawnProgress - (createdAtMs / MS_PER_SECOND) * coord.speedFactor);
}

/**
 * Which river items to RENDER when the tier cap is below the zone size (MFW-24 perf review). Deterministic and time-invariant:
 * 1) pinned ids present in `items` (e.g. the Find My target) first, in `items` order, up to `cap`;
 * 2) the remaining slots are spread evenly along the lane: sort the rest by (phase asc, id asc), take indices ⌊i·n/m⌋.
 * Returns `items` itself (same reference) when items.length <= cap; otherwise a frozen subset in the original `items` order.
 * Hidden items stay in the store, so Find My can still locate them (getRiverItemPositionAt) and pin them.
 */
export function selectVisibleRiverItems<T extends { readonly id: string; readonly coord: SplinePathCoord; readonly createdAtMs: number }>(
  items: readonly T[],
  cap: number,
  pinnedIds: readonly string[] = NO_PINNED_RIVER_IDS,
): readonly T[];
```
Algorithm:
1. `if (!Number.isSafeInteger(cap) || cap <= 0) return Object.freeze([]) as readonly T[];`
2. `if (items.length <= cap) return items;`
3. `const pinned = new Set(pinnedIds); const chosen = new Set<string>();`
   `for (const it of items) if (chosen.size < cap && pinned.has(it.id)) chosen.add(it.id);`
4. `const rest = items.filter((it) => !chosen.has(it.id)).map((it) => ({ id: it.id, phase: riverPhaseOf(it.coord, it.createdAtMs) }));`
   `rest.sort((a, b) => a.phase - b.phase || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));`
5. `const m = cap - chosen.size; const n = rest.length;`
   `for (let i = 0; i < m; i++) chosen.add(rest[Math.floor((i * n) / m)].id);` (indices are distinct because `m < n`).
6. `return Object.freeze(items.filter((it) => chosen.has(it.id)));`

This is not per-frame: call it in a `useMemo` keyed on the items, the cap and the pins.

### Step 9 — `src/components/canvas3d/RiverFlow.tsx` (modify; perf gates a and b)

Keep the public props and behaviour. Add:
1. Imports: `import { TIER_BUDGETS } from "@/config/performance.config";`, `import { ZONE_ITEM_CAP } from "@/config/world.config";`,
   `import { useDeviceStore } from "@/store/useDeviceStore";`, and add `selectVisibleRiverItems, NO_PINNED_RIVER_IDS` to the existing `@/core/world` import.
2. `RiverFlowProps` gains:
   `/** Ids always rendered even above the tier cap (Find My target, MFW-30). Default none. */ readonly pinnedIds?: readonly string[];`
3. In the body, before any early return:
   ```ts
   const qualityTier = useDeviceStore((state) => state.qualityTier);
   const budget = qualityTier === "FALLBACK_2D" ? null : TIER_BUDGETS[qualityTier];
   const visibleCap = budget === null ? 0 : Math.min(ZONE_ITEM_CAP, budget.riverItemCap); // perf gate (a) + (b)
   const castShadow = shadows && budget !== null && budget.riverItemCastShadow;
   const prepared = useMemo(() => prepareRiverItems(items, lanes), [items, lanes]);
   const visible = useMemo(
     () => selectVisibleRiverItems(prepared, visibleCap, pinnedIds),
     [prepared, visibleCap, pinnedIds],
   );
   ```
   Destructure `pinnedIds = NO_PINNED_RIVER_IDS` in the parameter list.
4. Replace every later use of `prepared` (the `useEffect` that invalidates, the `useFrame` loop, the `if (… .length === 0) return null`, and the `.map`) with
   `visible`. The frame loop stays an indexed `for` with no allocation.
5. Pass `shadows={castShadow}` to the river `KrathongModel` (it already drives both cast and receive; river krathongs do not need to receive shadows on
   MEDIUM/LOW, where the canvas has no shadow map anyway).
6. Add `data-visible-cap={visibleCap}` to the `<group name="river-flow">` (a debugging/test aid; it is an integer, not a decimal literal).
7. Update the component TSDoc: "Renders at most min(ZONE_ITEM_CAP, TIER_BUDGETS[tier].riverItemCap) krathongs (MFW-24 perf review). Each is a full
   KrathongModel (about 20 meshes); MFW-34 instancing is the real fix."

A tier step-down at runtime changes `visibleCap`. The `useMemo` re-selects, and React unmounts the dropped groups. Their ref cleanup removes them from `groups`.

### Step 10 — `src/services/api/apiPaths.ts` (new; no imports) and `zoneQuery.ts`

```ts
/** Public API paths and query names shared by the server routes and the client (MFW-12 / MFW-25). Dependency-free: safe in the landing chunk. */
export const CREATIONS_API_PATH = "/api/creations";
export const ZONES_API_PATH = "/api/zones";
export const ZONE_API_QUERY_PARAMS = Object.freeze({ event: "event", zone: "zone" } as const);
```
In `src/services/api/zoneQuery.ts`, replace the line `export const ZONE_QUERY_PARAMS = Object.freeze({ event: "event", zone: "zone" } as const);` with
`import { ZONE_API_QUERY_PARAMS as ZONE_QUERY_PARAMS } from "./apiPaths";` (at the top) and `export { ZONE_QUERY_PARAMS };`. Change nothing else.
Reason: the client must not import `zoneQuery.ts`, because it imports `creationValidation` → `validateCoord` → `three` and `@/services/auth`.

### Step 11 — server zone directory

`src/services/api/creationTypes.ts`: append
```ts
/** Body of GET /api/zones (200). Counts only; never item data. */
export interface ZoneDirectoryResponse {
  readonly eventId: FestivalEventId;
  /** Open zones = highest zone id with a visible creation, at least 1. Zones are 1..zoneCount. */
  readonly zoneCount: number;
}
```
Example body: `{ "eventId": "loy_krathong", "zoneCount": 3 }`. The errors use `ApiErrorBody`: `{ "error": "invalid_query", "field": "event" }` (400) and
`{ "error": "unavailable" }` (503).

`src/services/api/creationRepository.ts`: add to the interface, after `listPublicZone`:
```ts
  /**
   * Highest zone id that has at least one VISIBLE creation of `eventId` (same filter as listPublicZone), or null.
   * Rejects with CreationRepositoryError("invalid_input", "eventId") for an unknown event.
   */
  highestVisibleZoneId(eventId: FestivalEventId): Promise<number | null>;
```
Add `| "zone"` to the comment that lists the details of `invalid_backend_response`. Import `FestivalEventId` as a type.

`src/services/api/inMemoryCreationRepository.ts`:
- Extract the two inline `.filter(...)` predicates of `listPublicZone` (event/zone/expiry, then moderation) into a private
  `function isVisible(row: StoredPublicRow, nowMs: number): boolean` that checks `expiresAtMs > nowMs`, a private row exists,
  `moderationStatus === "approved"` and `reportCount < AUTO_HIDE_REPORT_THRESHOLD`.
- `listPublicZone` keeps its event/zone check and uses `isVisible`. Its results must stay identical, and the existing tests prove that.
- Add:
  ```ts
  async highestVisibleZoneId(eventId) {
    if (!isFestivalEventId(eventId)) throw new CreationRepositoryError("invalid_input", "eventId");
    const nowMs = now();
    let highest: number | null = null;
    for (const row of publicRows.values()) {
      if (row.eventId !== eventId || !isVisible(row, nowMs)) continue;
      if (highest === null || row.zoneId > highest) highest = row.zoneId;
    }
    return highest;
  }
  ```

`src/services/api/supabaseCreationRepository.ts` (inside the returned object, next to `listPublicZone`):
```ts
async highestVisibleZoneId(eventId: FestivalEventId): Promise<number | null> {
  if (!isFestivalEventId(eventId)) throw new CreationRepositoryError("invalid_input", "eventId");
  const target = new URL(CREATIONS_PUBLIC_VISIBLE_VIEW, restBase);
  target.searchParams.set("select", ZONE_DIRECTORY_COLUMNS.join(","));
  target.searchParams.set("event_id", `eq.${eventId}`);
  target.searchParams.set("order", HIGHEST_ZONE_ORDER);
  target.searchParams.set("limit", String(ZONE_DIRECTORY_LIMIT));
  const data = await send(target, "GET");
  if (!Array.isArray(data)) throw new CreationRepositoryError("invalid_backend_response", "list");
  if (data.length === 0) return null;
  const row: unknown = data[0];
  const zone = isPlainObject(row) ? row.zone_id : undefined;
  if (!isZoneId(zone)) throw new CreationRepositoryError("invalid_backend_response", "zone");
  return zone;
}
```
It reads the server-only view, so no SQL is needed. **Do not touch `supabase/**`.**

`src/services/api/zoneDirectory.ts` (new):
```ts
export type ZoneDirectoryQueryResult =
  | { readonly ok: true; readonly eventId: FestivalEventId }
  | { readonly ok: false; readonly field: "event" };
export function parseZoneDirectoryQuery(params: URLSearchParams): ZoneDirectoryQueryResult;
/** GET /api/zones logic. `getRepository` may throw (misconfigured env) → 503. Never logs. */
export async function handleZoneDirectory(request: Request, getRepository: () => CreationRepository): Promise<Response>;
```
- `parseZoneDirectoryQuery`: `const events = params.getAll(ZONE_API_QUERY_PARAMS.event);`. If `events.length !== 1 || !isFestivalEventId(events[0])`,
  return `{ ok: false, field: "event" }`. Ignore every other param.
- `handleZoneDirectory`: copy the structure of `listCreations.ts` (`HTTP_OK`, `HTTP_BAD_REQUEST`, `HTTP_SERVICE_UNAVAILABLE`, `NO_STORE`, `respond`):
  ```ts
  const parsed = parseZoneDirectoryQuery(new URL(request.url).searchParams);
  if (!parsed.ok) return respond(HTTP_BAD_REQUEST, { error: "invalid_query", field: "event" });
  let zoneCount: number;
  try {
    zoneCount = zoneCountFromHighestZoneId(await getRepository().highestVisibleZoneId(parsed.eventId));
  } catch {
    return respond(HTTP_SERVICE_UNAVAILABLE, { error: "unavailable" });
  }
  return respond(HTTP_OK, { eventId: parsed.eventId, zoneCount });
  ```
  Import `zoneCountFromHighestZoneId` from `@/core/world/zoneManager` (by path, because the barrel pulls in three).

`src/app/api/zones/route.ts` (new):
```ts
import { getCreationRepository } from "@/services/api/creationRepositoryFactory";
import { handleZoneDirectory } from "@/services/api/zoneDirectory";

/** GET /api/zones?event=<FestivalEventId> — number of open river-bend zones (backlog 5.3). */
export async function GET(request: Request): Promise<Response> {
  return handleZoneDirectory(request, getCreationRepository);
}
```
Export only `GET`.

### Step 12 — `src/services/api/zoneClient.ts` (new; client-safe)

Allowed imports: `@/config/events/types` (type), `@/config/world.config`, `./apiPaths`, `./creationTypes` (`import type` only).

```ts
export type ZoneFetchFailure = "aborted" | "network" | "http" | "invalid_body";
export type ZoneDirectoryResult = { readonly ok: true; readonly zoneCount: number } | { readonly ok: false; readonly reason: ZoneFetchFailure };
export type ZoneItemsResult = { readonly ok: true; readonly items: readonly PublicCreation[] } | { readonly ok: false; readonly reason: ZoneFetchFailure };
export interface ZoneFetchOptions { readonly fetch?: typeof fetch; readonly signal?: AbortSignal }

export function buildZoneDirectoryUrl(eventId: FestivalEventId): string;           // "/api/zones?event=loy_krathong"
export function buildZoneItemsUrl(eventId: FestivalEventId, zoneId: number): string; // "/api/creations?event=loy_krathong&zone=2"
export function fetchZoneDirectory(eventId: FestivalEventId, options?: ZoneFetchOptions): Promise<ZoneDirectoryResult>;
export function fetchZoneItems(eventId: FestivalEventId, zoneId: number, options?: ZoneFetchOptions): Promise<ZoneItemsResult>;
/** Allowlist copy of one received item, or null (invariant C defence in depth). Coord/appearance are deep-validated in Step 6. */
export function toClientPublicCreation(raw: unknown, eventId: FestivalEventId, zoneId: number): PublicCreation | null;
```
- Build each URL as `` `${PATH}?${new URLSearchParams({ [ZONE_API_QUERY_PARAMS.event]: eventId, … })}` ``. These are the **only** params; never a token or id.
- The private `getJson(url, options)`:
  ```ts
  const fetchImpl = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
  let res: Response;
  try {
    res = await fetchImpl(url, { method: "GET", cache: "no-store", headers: { Accept: "application/json" }, signal: options.signal });
  } catch {
    return { ok: false, reason: options.signal?.aborted ? "aborted" : "network" };
  }
  if (!res.ok) { await res.body?.cancel().catch(() => undefined); return { ok: false, reason: "http" }; }
  try { return { ok: true, body: await res.json() }; }
  catch { return { ok: false, reason: options.signal?.aborted ? "aborted" : "invalid_body" }; }
  ```
- `fetchZoneDirectory`: the body must be a plain object with `eventId === eventId` and `zoneCount` a safe integer `>= ZONE_ID_MIN` (check inline). Otherwise return `invalid_body`.
- `fetchZoneItems`: the body must be a plain object with `eventId === eventId`, `zoneId === zoneId` and `Array.isArray(items)`. Otherwise return `invalid_body`. Then
  run `toClientPublicCreation` on each item, skip `null`s and duplicate ids, and **stop at `ZONE_ITEM_CAP`**. Return `Object.freeze(items)`.
- `toClientPublicCreation`:
  1. `raw` must be a plain object (write a local `isPlainRecord`).
  2. Destructure only the 8 `PUBLIC_CREATION_KEYS`.
  3. `id` is a non-empty string, `eventId`/`zoneId` match, `appearance` and `coord` are plain objects, `publicWishText` is `null` or a string, and
     `createdAt`/`expiresAt` are strings with a finite `Date.parse`.
  4. Reject the item if `containsPrivateKey(appearance) || containsPrivateKey(coord)`, with `PRIVATE_KEY_PATTERN = /owner_?token|private_?wish/i`:
     ```ts
     function containsPrivateKey(value: unknown): boolean {
       if (Array.isArray(value)) return value.some(containsPrivateKey);
       if (typeof value !== "object" || value === null) return false;
       return Object.entries(value).some(([k, v]) => PRIVATE_KEY_PATTERN.test(k) || containsPrivateKey(v));
     }
     ```
  5. Return a fresh object built field by field, with no spread.

### Step 13 — `src/store/useWorldStore.ts` (modify; data-only)

```ts
import { create } from "zustand";
import type { FestivalEventId } from "@/config/events/types";
import type { PublicCreation } from "@/services/api/creationTypes";

export type ZoneLoadStatus = "idle" | "loading" | "ready" | "error";

/** Shared-world status (spec §3: โซนปัจจุบัน, จำนวนผู้เล่น, ระดับการเติบโตของโลก). Fed from public endpoints only (invariant C). */
export interface WorldState {
  currentZoneId: number | null;       // visible zone
  participantCount: number | null;    // spec §3 "จำนวนผู้เล่น"; not set by any card yet
  eventId: FestivalEventId | null;    // world being shown; null outside SHARED_WORLD_EXPLORE
  zoneCount: number | null;           // open zones = growth level (GET /api/zones)
  zoneStatus: ZoneLoadStatus;
  /** ONLY the visible zone's public items, ≤ ZONE_ITEM_CAP. All of them, even those above the tier render cap (Find My, collisions). */
  zoneItems: readonly PublicCreation[];
  /** Creation the camera follows (set by MFW-30 Find My); always rendered even above the tier cap. */
  focusedCreationId: string | null;
}
export const NO_ZONE_ITEMS: readonly PublicCreation[] = Object.freeze([]);
export const INITIAL_WORLD_STATE: Readonly<WorldState> = Object.freeze({
  currentZoneId: null, participantCount: null, eventId: null, zoneCount: null,
  zoneStatus: "idle", zoneItems: NO_ZONE_ITEMS, focusedCreationId: null,
});
export const useWorldStore = create<WorldState>()(() => ({ ...INITIAL_WORLD_STATE }));
```
`src/store/stores.test.ts` line 27 becomes:
```ts
expect(useWorldStore.getState()).toEqual({
  currentZoneId: null, participantCount: null, eventId: null, zoneCount: null,
  zoneStatus: "idle", zoneItems: [], focusedCreationId: null,
});
```
Change nothing else in that file.

### Step 14 — `src/services/api/zonePagination.ts` (new; client-safe)

Allowed imports: `@/config/events/types`, `@/config/world.config`, `@/core/world/zoneManager`, `@/store/useWorldStore`, `./zoneClient`.

```ts
export type ZoneLoadOutcome = "loaded" | "failed" | "superseded" | "invalid";
export interface WorldStoreLike { getState(): WorldState; setState(partial: Partial<WorldState>): void }
export interface ZonePaginationOptions {
  readonly fetch?: typeof fetch;
  readonly store?: WorldStoreLike;                  // default useWorldStore
  readonly initialZonePolicy?: InitialZonePolicy;   // default WORLD_INITIAL_ZONE_POLICY
}
export interface ZonePagination {
  enterWorld(eventId: FestivalEventId): Promise<ZoneLoadOutcome>;
  /** Make `zoneId` the visible zone: drop the old items, load only this zone (spec §6.7 "await loadZone(zoneId)"). */
  loadZone(zoneId: number): Promise<ZoneLoadOutcome>;
  retry(): Promise<ZoneLoadOutcome>;
  leaveWorld(): void;
}
export function createZonePagination(options?: ZonePaginationOptions): ZonePagination;
export function getZonePagination(): ZonePagination; // app singleton (useWorldStore + global fetch), created on first call
export function loadZone(zoneId: number): Promise<ZoneLoadOutcome>; // getZonePagination().loadZone(zoneId)
```
Closure: `let generation = 0; let controller: AbortController | null = null;`.
`begin()` aborts the old controller, creates a new one, increments `generation` and returns `{ gen, signal }`.

`loadZoneInternal(zoneId, refreshDirectory)`:
1. `const { eventId } = store.getState();`. If `eventId === null || !isClientZoneId(zoneId)`, return `"invalid"` (no change).
2. `const { gen, signal } = begin();`
3. Release the old zone first:
   `store.setState({ currentZoneId: zoneId, zoneStatus: "loading", zoneItems: NO_ZONE_ITEMS, focusedCreationId: null });`
   (MFW-30 sets the focus again after `await loadZone(...)` resolves.)
4. Run `fetchZoneItems(eventId, zoneId, { fetch, signal })` in parallel with, if `refreshDirectory`, `fetchZoneDirectory(eventId, { fetch, signal })`.
5. `if (gen !== generation) return "superseded";`
6. If the zone failed: `store.setState({ zoneStatus: "error" })` and return `"failed"`.
7. Otherwise: `zoneCount = Math.max(dir?.ok ? dir.zoneCount : (store.getState().zoneCount ?? ZONE_ID_MIN), zone.items.length > 0 ? zoneId : ZONE_ID_MIN)`,
   then `store.setState({ zoneItems: zone.items, zoneStatus: "ready", zoneCount })` and return `"loaded"`.

`enterWorld(eventId)`:
1. An unknown id (not in `FESTIVAL_EVENT_IDS`) → `"invalid"`.
2. `begin()`, then `store.setState({ eventId, zoneCount: null, currentZoneId: null, zoneStatus: "loading", zoneItems: NO_ZONE_ITEMS, focusedCreationId: null })`.
3. Fetch the directory. If stale → `"superseded"`. If it failed → `zoneStatus: "error"`, return `"failed"`.
4. Otherwise `setState({ zoneCount })` and `return loadZoneInternal(pickInitialZoneId(zoneCount, policy), false)`.

`loadZone(z)` = `loadZoneInternal(z, true)`. `retry()`: only when `zoneStatus === "error"` and `eventId !== null`. Then `currentZoneId === null` →
`enterWorld(eventId)`, else `loadZoneInternal(currentZoneId, true)`. Otherwise return `"invalid"`.
`leaveWorld()`: abort, `controller = null`, `generation += 1`, `store.setState({ ...INITIAL_WORLD_STATE })`.

No timers, no polling, no `console.*`, and no owner token.

### Step 15 — `src/services/api/index.ts` (modify)

Add:
```ts
export { CREATIONS_API_PATH, ZONES_API_PATH, ZONE_API_QUERY_PARAMS } from "./apiPaths";
export type { ZoneDirectoryResponse } from "./creationTypes";
```
Do not export the zone client, the pagination or any server module from the barrel.

### Step 16 — `src/components/ui/ZoneNavigator.tsx` (new)

```tsx
"use client";
import { describeGrowingWorld } from "@/core/world/growingWorldScaler";
import { getZonePagination, type ZonePagination } from "@/services/api/zonePagination";
import { useWorldStore } from "@/store/useWorldStore";

/** Thai UI copy. PLACEHOLDER wording (spec silent beyond "โซนคุ้งน้ำ" / "Zone 2, Zone 3"), Open question 2. */
export const ZONE_NAV_COPY = Object.freeze({
  navLabel: "คุ้งน้ำ",
  zoneLabel: (zoneId: number, zoneCount: number) => `คุ้งน้ำที่ ${zoneId} จาก ${zoneCount}`,
  upstream: "คุ้งน้ำก่อนหน้า",
  downstream: "คุ้งน้ำถัดไป",
  loading: "กำลังโหลดคุ้งน้ำ…",
  error: "โหลดคุ้งน้ำไม่สำเร็จ",
  retry: "ลองอีกครั้ง",
});
export interface ZoneNavigatorProps { readonly pagination?: Pick<ZonePagination, "loadZone" | "retry"> }
export function ZoneNavigator({ pagination }: ZoneNavigatorProps): JSX.Element | null;
```
Behaviour:
- Use separate primitive `useWorldStore` selectors: `eventId`, `currentZoneId`, `zoneCount`, `zoneStatus`, and `zoneItems.length`. Then
  `const p = pagination ?? getZonePagination();`.
- If `eventId === null`, return `null`. Otherwise `const view = describeGrowingWorld(zoneCount, currentZoneId);`,
  `const up = view?.upstreamZoneId ?? null; const down = view?.downstreamZoneId ?? null;`.
- Render a `<nav aria-label={navLabel} data-testid="zone-navigator">` with the attributes `data-zone-id`, `data-zone-count` (= `view?.zoneCount`),
  `data-zone-status` and `data-zone-item-count`, and Tailwind classes `mb-4 flex w-full items-center justify-between gap-2 text-sm`. Its children:
  - when `up !== null`: `<button type="button" onClick={() => void p.loadZone(up)}>‹ {upstream}</button>`;
  - `<p aria-live="polite">`, whose text is `error` when status is `"error"`, else `loading` when `view === null`, else `zoneLabel(view.visibleZoneId, view.zoneCount)`;
  - when status is `"error"`: `<button type="button" onClick={() => void p.retry()}>{retry}</button>`;
  - when `down !== null`: `<button …>{downstream} ›</button>`.
- Buttons appear only when the neighbour exists (D6). Do not use animation or transition classes.

### Step 17 — `src/components/ui/FlowRoot.tsx` (modify)

1. Add `useEffect` to the existing `react` import. Import `getZonePagination` from `@/services/api/zonePagination` and `ZoneNavigator` from `./ZoneNavigator`.
   `selectedEventId` is already read.
2. Add this effect:
   ```ts
   useEffect(() => {
     if (flowState !== "SHARED_WORLD_EXPLORE" || selectedEventId === null) return;
     const pagination = getZonePagination();
     void pagination.enterWorld(selectedEventId);
     return () => pagination.leaveWorld();
   }, [flowState, selectedEventId]);
   ```
   It runs on every tier, FALLBACK_2D included, so MFW-33's 2D river can read the same store (invariant B).
3. Directly after the `{show3D && interactionMode !== null && (…)}` block, add `{flowState === "SHARED_WORLD_EXPLORE" && <ZoneNavigator />}`. Change nothing else.

### Step 18 — `src/components/canvas3d/index.tsx` (modify)

1. Add `useMemo` to the `react` import. Change the `@/core/world` import to `getLoyKrathongRiverLanes, publicCreationsToRiverItems, NO_PINNED_RIVER_IDS`.
   Add `import { useWorldStore } from "@/store/useWorldStore";`.
2. `SceneViewport`: `riverItems?: readonly RiverFlowItem[]` loses its default (`riverItems,` in the destructuring). When it is given, it **overrides** the store
   (tests, the MFW-23 preview). Keep `NO_RIVER_ITEMS` exported.
3. With the other hooks, before the early `return null`:
   ```ts
   const worldEventId = useWorldStore((s) => s.eventId);
   const worldZoneId = useWorldStore((s) => s.currentZoneId);
   const worldZoneItems = useWorldStore((s) => s.zoneItems);
   const focusedCreationId = useWorldStore((s) => s.focusedCreationId);
   const storeRiverItems = useMemo(
     () => (mode === "WORLD_EXPLORE" && worldEventId !== null && worldZoneId !== null
       ? publicCreationsToRiverItems(worldZoneItems, { eventId: worldEventId, zoneId: worldZoneId })
       : NO_RIVER_ITEMS),
     [mode, worldEventId, worldZoneId, worldZoneItems],
   );
   const visibleRiverItems = riverItems ?? storeRiverItems;
   const pinnedRiverIds = useMemo(
     () => (focusedCreationId === null ? NO_PINNED_RIVER_IDS : Object.freeze([focusedCreationId])),
     [focusedCreationId],
   );
   ```
4. `ToyNightSceneProps` gains `pinnedRiverIds: readonly string[]`. Pass `riverItems={visibleRiverItems}` and `pinnedRiverIds={pinnedRiverIds}`, and give
   `<RiverFlow … pinnedIds={pinnedRiverIds} />`.
5. On the `<section>`, add `data-zone-id={mode === "WORLD_EXPLORE" ? worldZoneId ?? undefined : undefined}` and `data-river-item-count={visibleRiverItems.length}`
   (zone items handed to the river; the tier-rendered count is `RiverFlow`'s `data-visible-cap`).
6. Change nothing else. A zone switch creates no geometry, material, texture, `useFrame` or camera flight. Old item groups unmount, and they hold only the
   shared `KrathongAssetsProvider` assets (D4).

### Step 19 — e2e fixtures `tests/e2e/fixtures/zoneFixtures.ts` (new; no imports from `src/` or Playwright)

```ts
/** = LOY_KRATHONG_RIVER_LANE_ID (src/config/events/loyKrathong.river.config.ts); zone-e2e-fixtures.test.ts checks it. */
export const E2E_LANE_ID = 1;
/** = RIVER_DRIFT_SPEED_FACTOR (src/config/riverFlow.config.ts); checked by the same test. */
export const E2E_SPEED_FACTOR = 0.008;
export const E2E_EVENT_ID = "loy_krathong";
export const E2E_APPEARANCE = { base: "banana_trunk_01", lotusFold: "style_01", leafColor: "#5E8C3A", flowers: ["marigold"], candleColor: "#FFD166" };
export function e2eItemId(zoneId: number, index: number): string; // `00000000-0000-4000-8000-${String(zoneId * 1000 + index).padStart(12, "0")}`
export function makeZoneItem(zoneId: number, index: number): Record<string, unknown>;
// { id, eventId, zoneId, appearance: E2E_APPEARANCE, coord: { mode: "SPLINE_PATH", laneId: E2E_LANE_ID, spawnProgress: (index % 100) / 100,
//   speedFactor: E2E_SPEED_FACTOR, lateralOffset: 0 }, publicWishText: null, createdAt: "2026-11-24T12:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z" }
export function makeZoneBody(zoneId: number, count: number): { eventId: string; zoneId: number; limit: number; items: Record<string, unknown>[] }; // limit 80
```

## Tests

Everything runs under `pnpm test` with no network and no DB. Server tests start with `// @vitest-environment node`. In `src/services/**` / `src/app/api/**`
never write `Vector3`, `.toArray()` or a `three` import, tests included.

### `src/config/performance.config.test.ts` (modify) — see Step 3.

### `src/core/world/riverVisibility.test.ts` (node; perf gate b)
Fixture: `item(id, spawnProgress, createdAtMs = T0)` with `coord = { mode: "SPLINE_PATH", laneId: LOY_KRATHONG_RIVER_LANE_ID, spawnProgress, speedFactor:
RIVER_DRIFT_SPEED_FACTOR, lateralOffset: 0 }`, where `T0 = 1_700_000_000_000`.
1. "returns the same array when it fits": 5 items, cap 5 and cap 80 → `toBe(items)`. Cap `0`, `-1`, `1.5` or `NaN` → `[]`.
2. "caps": 80 items, cap 24 → length 24, every element is from the input, the input order is kept, and the result is frozen.
3. "deterministic": the same input twice gives the same ids. A shuffled input gives the same id **set**.
4. "time-invariant (owner decision 25)": `riverPhaseOf(item.coord, item.createdAtMs)` equals the `currentProgress` difference ordering. For two items created
   at `T0` and `T0 + 10_000` with equal speed, `wrap01(currentProgress(b, now) − currentProgress(a, now))` is the same (to 1e-9) at `now = T0 + 20_000` and
   `T0 + 3_600_000`, and equals `wrap01(riverPhaseOf(b) − riverPhaseOf(a))` to 1e-9.
5. "spread evenly along the lane": 80 items with `spawnProgress = k / 80` (all at `T0`), cap 24 → the sorted phases of the selection have every consecutive gap
   (wrapping) ≤ `Math.ceil(80 / 24) / 80 + 1e-9`.
6. "pinned ids are always shown": an id that case 2 does not select, given in `pinnedIds` → it is in the result, which still has length 24. An unknown pinned id
   is ignored. More pins than the cap → the first `cap` pins in input order.
7. Ties: equal phases → ordered by id (`"a"` before `"b"`).

### `src/components/canvas3d/RiverFlow.test.tsx` (modify: add cases; existing cases unchanged)
Add `import { useDeviceStore } from "@/store/useDeviceStore";` and, in a new `describe("river render budget (MFW-25)")` with
`afterEach(() => useDeviceStore.setState(useDeviceStore.getInitialState(), true))`, build `many(n)` = n valid items with `spawnProgress = k / n`:
1. "never renders more than ZONE_ITEM_CAP": `setQualityTier("HIGH")` (cap 80), `items = many(85)` → exactly 80 `[name^="river-item-"]`, and `data-visible-cap="80"`.
2. "LOW renders at most its tier cap": `setQualityTier("LOW")`, `many(80)` → `TIER_BUDGETS.LOW.riverItemCap` groups, which are exactly the ids of
   `selectVisibleRiverItems(prepareRiverItems(items, lanes), TIER_BUDGETS.LOW.riverItemCap)`.
3. "MEDIUM uses its cap": `setQualityTier("MEDIUM")`, `many(80)` → `TIER_BUDGETS.MEDIUM.riverItemCap` groups.
4. "river shadows follow the tier": `shadows={true}`. HIGH → every `mesh` has `data-shadows="true"`. MEDIUM and LOW → `"false"`.
5. "tier step-down re-selects": render HIGH with `many(80)`, then `act(() => setQualityTier("LOW"))` → the group count drops to the LOW cap, and the ids equal a
   fresh LOW render. Run `r3f.frame!()` and it does not throw (the stale groups were removed from the map).
6. "pinned id survives the cap": LOW with `many(80)`, plus `pinnedIds={[idNotSelected]}` → that group exists, and the count is still the LOW cap.
7. "frame loop moves only rendered items": LOW with `many(80)` → after `r3f.frame!()`, every rendered group's position equals
   `getRiverItemPositionAt(item, lanes, NOW).world` in x/z. There is no throw for the hidden ones.
8. "FALLBACK_2D renders nothing": `setQualityTier("FALLBACK_2D")` → no `[name="river-flow"]` (defensive; `SceneViewport` never mounts there).

### `src/core/world/zoneManager.test.ts` (node)
1. `assignZoneForNewCreation([])` → `1`.
2. `[{1, 79, true}]` → `1`; `[{1, 80, true}]` → `2`; `[{1, 85, true}]` → `2`.
3. "free spot rule (owner decision 25)": `[{1, 10, false}]` → `2`; `[{1, 80, true}, {2, 3, true}]` → `2`; `[{1, 80, true}, {2, 3, false}]` → `3`.
4. "first zone below the cap wins": `[{1, 80, true}, {2, 40, true}, {3, 10, true}]` → `2`, in any input order.
5. "gaps count as empty": `[{1, 80, true}, {3, 80, true}]` → `2`. Custom cap: `([{1, 2, true}], 2)` → `2`.
6. "integrates with findNearestFreeSpot": build `existing` = items packed along lane 1 until
   `findNearestFreeSpot({ laneId: 1, progress: 0, lateralOffset: 0 }, existing, getLoyKrathongRiverLanes(), T0)` returns `null`. Add items in a deterministic
   grid loop and stop at the first `null`, at most `ZONE_ITEM_CAP` iterations. If the lane holds ≥ 80 before it is full, assert instead that `hasFreeSpot` stays
   `true` at 79 items and the zone becomes full by count at 80. Then `assignZoneForNewCreation([{ zoneId: 1, itemCount: existing.length, hasFreeSpot: <that result !== null> }])`
   → `2`.
7. Throws `RangeError` for: cap `0`/`1.5`/`NaN`; zoneId `0`/`-1`/`1.5`; itemCount `-1`/`NaN`; `hasFreeSpot "yes"`; a duplicate zoneId. For zoneId `987654`
   the message does not contain `"987654"`.
8. `isZoneFull`; `zoneCountFromHighestZoneId(null)` → `1`, `(3)` → `3`, and `(0)` / `(1.5)` throw; `isClientZoneId` (`1`, `2147483647` true; `0`, `-1`, `1.5`, `"1"`,
   `NaN`, `MAX_SAFE_INTEGER + 1` false); `pickInitialZoneId(3, "NEWEST")` → `3`, `(3, "FIRST")` → `1`, `(0, …)` throws; `WORLD_INITIAL_ZONE_POLICY` is in
   `INITIAL_ZONE_POLICIES`.

### `src/core/world/growingWorldScaler.test.ts` (node)
`(null, null)` / `(3, null)` → `null`. `(3, 2)` → `{ 3, 2, up 1, down 3 }`, frozen. `(3, 1)` → up `null`. `(3, 3)` → down `null`. `(1, 1)` → both `null`.
`(null, 1)` → count 1. `(2, 5)` → count 5, down `null`, up 4. It throws for visible `0` / `1.5` and count `0`.

### `src/core/world/zoneRiverItems.test.ts`
Fixture `creation(i, overrides)`: zone 2 loy_krathong, `appearance: serializeKrathongAppearance(DEFAULT_KRATHONG_APPEARANCE)`,
`coord { mode: "SPLINE_PATH", laneId: LOY_KRATHONG_RIVER_LANE_ID, spawnProgress: 0.25, speedFactor: RIVER_DRIFT_SPEED_FACTOR, lateralOffset: 0 }`.
1. One valid item → sorted keys `["appearance", "coord", "createdAtMs", "id"]`. `coord` deep-equals the input coord but is `not.toBe` it. The result is frozen.
2. "caps at 80 valid items": 85 valid → the first 80. 5 invalid + 80 valid → 80 valid.
3. Dropped: another zone, another event, an empty id, a duplicate id, coord with an `x` key, `PLANAR_ZONE`, `lateralOffset 0.7`, `createdAt "garbage"`, `base "nope"`.
4. The public wish is never copied. `[]` → `[]`.

### `src/services/api/apiPaths.test.ts` (node)
`ZONE_API_QUERY_PARAMS` equals `{ event: "event", zone: "zone" }`, and `ZONE_QUERY_PARAMS` from `./zoneQuery` `toBe` it. The two path constants have their values.

### `src/services/api/zoneClient.test.ts`
1. URLs: `"/api/creations?event=loy_krathong&zone=2"` and `"/api/zones?event=loy_krathong"`.
2. Request: one call, `GET`, `cache "no-store"`, the given signal, no `Authorization`.
3. "keeps at most 80 of 85 items".
4. "allowlist (invariant C)": extra top-level `owner_token`, `owner_token_hash`, `private_wish_text`, `ownerTokenHash`, `privateWishText`, `report_count` and
   `moderation_status` → the sorted keys equal sorted `PUBLIC_CREATION_KEYS`, and the JSON contains none of the names.
5. Private keys nested in `appearance` / `coord` → the item is dropped.
6. Body mismatch (eventId, zoneId, non-array `items`, `null`) → `invalid_body`.
7. Bad items dropped: an item-level zone mismatch, a non-string id, `createdAt "x"`, `publicWishText 5`, `coord` an array, a duplicate id.
8. 503 → `http`, and the body is not read (spy on `json`). A rejecting fetch → `network`. Bad JSON → `invalid_body`. Aborted → `aborted`.
9. Directory: `{ eventId, zoneCount: 3 }` → ok 3. `0`, `1.5`, `"3"` or the wrong eventId → `invalid_body`.

### `src/services/api/zonePagination.test.ts`
Use a fake store from `createStore<WorldState>()(() => ({ ...INITIAL_WORLD_STATE }))` (`zustand/vanilla`) and a routed, recording, deferrable fetch fake.
1. "enter loads exactly one zone": zoneCount 3 → requests are exactly the directory, then zone 3. The store is ready with zone 3's items.
2. `FIRST` policy → zone 1 only.
3. "loadZone fetches only that zone" (+ one directory refresh).
4. "switch releases the old zone first": while zone 2 is pending, `currentZoneId 2`, `loading`, `zoneItems []` and `focusedCreationId null`.
5. "switch aborts and ignores the previous zone": the late zone-2 result → `"superseded"`, its signal is aborted, and the store holds zone 1 only.
6. "store never holds more than 80".
7. "store only ever holds the visible zone's items": checked across every store snapshot.
8. Zone count grows from the refreshed directory, or from a non-empty zone beyond the count when the directory fails.
9. Errors and `retry()` (directory failure → re-enter; zone failure → reload that zone).
10. Invalid calls (`0`, `1.5`, before enter, unknown event, retry when not in error) → `"invalid"`, with no request.
11. `leaveWorld()` during a pending load → `INITIAL_WORLD_STATE`, and the late response changes nothing.
12. No private data reaches the store (a JSON check).
13. The `getZonePagination` singleton is the same instance each call, and `loadZone` delegates to it.

### `src/services/api/zoneDirectory.test.ts` (node)
1. The query parser (valid; `zone` ignored; missing / `""` / `LOY_KRATHONG` / `nope` / duplicate → `field "event"`).
2. Empty repository → 200 `{ eventId, zoneCount: 1 }`, keys exactly `["eventId", "zoneCount"]`, `no-store`.
3. Inserts in zones 1, 2 and 4 (loy_krathong) and zone 9 (christmas) → 4 and 9.
4. Hiding, or `reportCount: AUTO_HIDE_REPORT_THRESHOLD` on, the only zone-4 item → 2.
5. 400 body exact.
6. 503 exact when the repository rejects (message with the hash), when the getter throws `backend_misconfigured`, and when the highest is invalid (`0`).
7. A private creation seeded → the response text contains none of the private names or fixture values.

### Repository tests (modify: add cases only)
- `inMemoryCreationRepository.test.ts`: "highestVisibleZoneId": empty → `null`; zones 1 and 3 → `3`; another event does not count; expired does not count;
  unknown event → `invalid_input` / `eventId`. All existing `listPublicZone` cases still pass after the `isVisible` extraction.
- `supabaseCreationRepository.test.ts`: request shape (`/rest/v1/creations_public_visible`, `select "zone_id"`, `event_id "eq.loy_krathong"`,
  `order "zone_id.desc"`, `limit "1"`, `no-store`, service headers). `[]` → `null`; `[{ zone_id: 4 }]` → `4`; `[{ zone_id: 0 }]` / `[{}]` → `zone`; `{}` → `list`;
  400 → `backend_request_failed` with no body read.

### `src/app/api/zones/route.test.ts` (node)
With empty env stubs, `GET(new Request("http://localhost/api/zones?event=loy_krathong"))` → 200 `{ eventId: "loy_krathong", zoneCount: 1 }`. The module exports
exactly `["GET"]`.

### `src/components/ui/ZoneNavigator.test.tsx`
1. `eventId null` → nothing.
2. 1 of 1 → `"คุ้งน้ำที่ 1 จาก 1"` and no button.
3. 2 of 3 → both buttons, wired to `loadZone(1)` / `loadZone(3)`.
4. Edges: zone 3 of 3 → upstream only; zone 1 of 3 → downstream only.
5. Loading text, with no buttons.
6. Error text, with retry wired.
7. `data-zone-item-count`.
8. No `animate-` or `transition` classes.

### `src/components/ui/FlowRoot.test.tsx` (modify: add a mock + two cases)
```ts
const zones = vi.hoisted(() => ({ enterWorld: vi.fn(async () => "loaded"), leaveWorld: vi.fn(), loadZone: vi.fn(async () => "loaded"), retry: vi.fn(async () => "loaded") }));
vi.mock("@/services/api/zonePagination", () => ({ getZonePagination: () => zones, loadZone: zones.loadZone }));
```
In `beforeEach`, clear the mocks and reset `useWorldStore`.
1. `enterWorld("loy_krathong")` is called once, only at SHARED_WORLD_EXPLORE. Unmount → `leaveWorld` once.
2. The navigator renders only at SHARED_WORLD_EXPLORE (store: 1 of 1, ready), and `queryByRole("button")` is still null there.

### `src/components/canvas3d/index.test.tsx` (modify: add to `describe("river flow in the scene")`)
Add a passthrough mock of `@/components/models/loyKrathong/krathongAssets` that counts `createKrathongAssets` calls and `dispose` calls (`assets.created` /
`assets.disposed`), plus `beforeEach` resets of `useWorldStore`, `assets` and the device store. Build store items with the zoneRiverItems fixture helper.
1. "renders the visible zone from the store": HIGH, WORLD_EXPLORE, zone 2 `[a, b]` → both `river-item-*`, `data-river-item-count="2"`, `data-zone-id="2"`. CUSTOMIZE →
   none, `"0"`.
2. "renders at most 80 river items from the store": HIGH, 85 → 80 groups, `data-river-item-count="80"`.
3. "zone switch swaps river items": zone 2 → zone 3 `[]` → zone 3 `[c]`. Under `reducedMotion` false and true, `r3f.flightStarts` is unchanged and so is
   `data-selected-target`.
4. "zone switch reuses the one krathong asset set": `created === 1` and `disposed === 0` across the switches; after unmount, `disposed === 1`.
5. "a focused creation is rendered even when the tier cap hides it": LOW, 80 store items, `focusedCreationId` = an id outside
   `selectVisibleRiverItems(..., TIER_BUDGETS.LOW.riverItemCap)` → its `river-item-*` exists, and the group count equals the LOW cap.
6. "the riverItems prop overrides the store": the prop `[x]` with store items `[a]` → only `river-item-x`. The existing MFW-24 cases stay unchanged.

### `tests/unit/world-zone-boundary.test.ts` (node)
Extract specifiers with `/\b(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g`.
1. Landing-path allowlist:
   ```ts
   const ALLOWED: Record<string, readonly string[]> = {
     "src/services/api/apiPaths.ts": [],
     "src/services/api/zoneClient.ts": ["@/config/events/types", "@/config/world.config", "./apiPaths", "./creationTypes"],
     "src/services/api/zonePagination.ts": ["@/config/events/types", "@/config/world.config", "@/core/world/zoneManager", "@/store/useWorldStore", "./zoneClient"],
     "src/core/world/zoneManager.ts": ["@/config/world.config"],
     "src/core/world/growingWorldScaler.ts": ["@/config/world.config"],
     "src/store/useWorldStore.ts": ["zustand", "@/config/events/types", "@/services/api/creationTypes"],
     "src/components/ui/ZoneNavigator.tsx": ["react", "@/core/world/growingWorldScaler", "@/services/api/zonePagination", "@/store/useWorldStore"],
   };
   ```
   Also, `src/services/api/creationTypes.ts` and `src/config/world.config.ts` contain no non-type import (`/^import (?!type\b)/m` does not match).
2. `FlowRoot.tsx` does not import `@/core/world` (the barrel) or `zoneRiverItems`.
3. No `new …Geometry|Material|Texture` in `src/core/world/zone*.ts`, `riverVisibility.ts`, `growingWorldScaler.ts`, `src/services/api/zone*.ts` or `ZoneNavigator.tsx`.
4. No `console.` in those files.
5. No `deviceOwnerToken|getDeviceOwnerVault|ownerToken|Authorization` in `zoneClient.ts`, `zonePagination.ts` or `ZoneNavigator.tsx`.
6. A self-check of the specifier regex on a sample string built from parts.

### `tests/unit/zone-e2e-fixtures.test.ts`
`E2E_LANE_ID === LOY_KRATHONG_RIVER_LANE_ID`; `E2E_SPEED_FACTOR === RIVER_DRIFT_SPEED_FACTOR`; `parsePersistableCoord(makeZoneItem(1, 0).coord).ok`;
`parseKrathongAppearance(E2E_APPEARANCE).ok`; `publicCreationsToRiverItems(makeZoneBody(3, 85).items as PublicCreation[], { eventId: "loy_krathong", zoneId: 3 }).length === 80`;
the ids are unique lowercase uuids.

### `tests/e2e/zones-api.spec.ts` (new)
`GET /api/zones?event=loy_krathong` → 200, `no-store`, `{ eventId: "loy_krathong", zoneCount: 1 }`. `?event=nope` → 400 `{ error: "invalid_query", field: "event" }`.

### `tests/e2e/zone-pagination.spec.ts` (new)
`routeZones(page, zoneCount, sizes)` uses `page.route((url) => url.pathname === "/api/zones", …)` and `page.route((url) => url.pathname === "/api/creations", …)`
with `makeZoneBody`, and records the requested zones.
1. **FALLBACK_2D** (the WebGL-blocking init script from `scene-gating.spec.ts`), `routeZones(page, 3, { 2: 2, 3: 85 })`:
   - the navigator shows `data-zone-id="3"`, `data-zone-count="3"`, `ready`, `data-zone-item-count="80"` and the text `"คุ้งน้ำที่ 3 จาก 3"`;
   - `requested` = `["3"]`, and there is no downstream button;
   - upstream → zone 2, count `"2"`, `["3", "2"]`;
   - downstream → zone 3, `["3", "2", "3"]`;
   - there is no `canvas`.
2. **3D smoke** (HIGH via the `deviceMemory` / `hardwareConcurrency` init script), `routeZones(page, 1, { 1: 3 })` → the viewport has `data-river-item-count="3"` and
   `data-zone-id="1"`, there is 1 `canvas`, and there are 0 buttons. Assert right after the load.

Unchanged and must still pass: every MFW-12 / MFW-24 / MFW-27 / MFW-20 test, `flow.spec.ts` (0 buttons at SHARED_WORLD_EXPLORE), `scene-gating.spec.ts`
(no WebGL chunk on landing), `river-environment.spec.ts`, `creations-api.spec.ts`, `no-raw-xyz-persistence`, `public-private-boundary` and `structure`.

Invariant coverage:
- **A:** coords are re-parsed before render, and nothing new is persisted.
- **B:** one store for 3D now and 2D later; positions come from MFW-24's converters.
- **C:** client allowlist + private-key guard, the counts-only directory, and the store JSON check.
- **E:** caps at fetch, store, mapper and renderer; the tier budget; release on switch; assets created once and disposed on unmount; perf gate (a)–(c).
- **F:** the tier is read from `useDeviceStore`; the switch has no animation (tested under both motion settings); FALLBACK_2D renders no canvas.
- **G:** not applicable.

## Do NOT

- Do not build `POST /api/creations`, write-side zone counting, the atomic assign + insert or collision re-checks (MFW-45). Call `findNearestFreeSpot` only in
  `zoneManager.test.ts` (to prove the integration).
- **Never feed the tier-visible subset into collision checks** (`isSpotFree`, `findNearestFreeSpot`, MFW-23/45) or into Find My. Use all `zoneItems` / all zone rows.
- Do not edit `supabase/**` or MFW-12's migration.
- Do not build the Find-My drawer, camera flights or highlight (MFW-30; only `loadZone` and the `focusedCreationId` field / pin are provided), the release flow
  (MFW-23), the 2D renderer (MFW-33), the inspect popup (MFW-28) or **instancing (MFW-34)**.
- Do not change lanes, the environment, `prepareRiverItems`, bobbing, `currentProgress` or the collision helpers. In `RiverFlow`, change only what Step 9 lists.
- Do not change the existing `TIER_BUDGETS` values (`pixelRatioCap`, `shadows`, `maxTextureSize`) or any owner threshold.
- No polling, timers, realtime, camera fly-to on switch, zone transitions, zone art or minimap.
- Landing-path files must not import `@/core/world` (the barrel), `@/core/coordinates`, `three`, `@react-three/*`, `zoneQuery.ts`, `creationValidation.ts` or any repository module.
- Never put a token, hash or device id in a URL. Send no auth header from the zone client. Never copy private fields or wish text into river items. No `select=*`,
  no row spreading, and never read a non-2xx Supabase body.
- No `console.*`. No new dependency, and no `package.json` / lockfile change.
- Do not touch `.claude/**`, `scripts/**`, `.github/**`, `CLAUDE.md`, `AGENTS.md`, `docs/**`, `vitest.config.mts`, `playwright.config.ts`, `eslint.config.mjs`,
  `tsconfig.json`, `next.config.ts`, `src/services/auth/**`, `src/config/events/**` or `src/core/coordinates/**`.
- Do not change existing test cases, except `stores.test.ts` line 27 and the `TIER_BUDGETS` `toEqual` in `performance.config.test.ts`. Only add the cases listed.

## Definition of done

- Each of these is green, run separately: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell pnpm e2e`
  (cloud container; locally plain `pnpm e2e`), with no Supabase env in the shell. `pnpm build` lists `ƒ /api/zones`.
- Every AC and every perf-gate item has its tests.
- Delete `playwright-report/` and `test-results/` before committing. Never commit `.next/` or `*.tsbuildinfo`. Leave `AGENTS.md` as it is on `main`.
- Branch `feat/MFW-25-growing-river-world-zone-pagination` from the latest `main`. Commit e.g.
  `feat(world): zone manager, zone directory, visible-zone pagination and river tier budget MFW-25`.
- PR title = the commit subject. The English body contains:
  - the MFW-25 link;
  - the AC checklist with tests;
  - a **perf-gate checklist** (a), (b), (c) with tests;
  - Decisions D1–D13;
  - the PLACEHOLDER values (`WORLD_INITIAL_ZONE_POLICY`, `riverItemCap`, `riverItemCastShadow`) and the Thai copy;
  - the Open questions;
  - the test plan.
- Also list these follow-ups in the PR:
  - **MFW-34 instancing of krathong parts across river items is the real draw-call fix and should land before the Christmas public launch**;
  - MFW-45 calls `assignZoneForNewCreation` with `hasFreeSpot = findNearestFreeSpot(…) !== null`, counts hidden rows and makes it atomic;
  - MFW-23 calls `loadZone(response.zoneId)` after a release;
  - MFW-30 uses `loadZone` and sets `focusedCreationId`;
  - MFW-33 reads `zoneItems` and should apply the same tier cap rule if 2D needs one.
- Leave the PR open for reviewer + qa + **r3f-perf-reviewer** + **privacy-auditor**. It merges after the `ci` check is SUCCESS. It is not an owner-merge card.

## Interfaces this card provides

| Export | Path | Signature | Used by |
|---|---|---|---|
| `assignZoneForNewCreation`, `ZoneFill`, `isZoneFull` | `@/core/world/zoneManager` (by path on the server) | `(fills: readonly { zoneId; itemCount; hasFreeSpot }[], cap = ZONE_ITEM_CAP) => number` | **MFW-45** |
| `zoneCountFromHighestZoneId`, `isClientZoneId`, `pickInitialZoneId` | `@/core/world/zoneManager` | Step 4 | directory, pagination |
| `describeGrowingWorld`, `GrowingWorldView` | `@/core/world/growingWorldScaler` | `(zoneCount \| null, visibleZoneId \| null) => view \| null` | MFW-33, Christmas tiers |
| `publicCreationsToRiverItems`, `ZoneRiverItem` | `@/core/world` | `(creations, { eventId, zoneId }) => readonly ZoneRiverItem[]` (≤ 80) | MFW-33, MFW-30 |
| `selectVisibleRiverItems`, `riverPhaseOf`, `NO_PINNED_RIVER_IDS` | `@/core/world` | `(items, cap, pinnedIds?) => readonly T[]` | MFW-33 (2D cap), MFW-34 (instanced selection) |
| `TierBudget.riverItemCap`, `TierBudget.riverItemCastShadow` | `@/config/performance.config` | `number`, `boolean` | RiverFlow, MFW-33, MFW-34 |
| `RiverFlow` prop `pinnedIds?`; `data-visible-cap` | `@/components/canvas3d/RiverFlow` | `readonly string[]` | MFW-30 (via `focusedCreationId`) |
| `GET /api/zones?event=` | `src/app/api/zones/route.ts` | 200 `{ eventId, zoneCount }` · 400 · 503 · `no-store` | client |
| `CreationRepository.highestVisibleZoneId` | `@/services/api/creationRepository` | `(eventId) => Promise<number \| null>` | directory; MFW-45 may reuse it |
| `handleZoneDirectory`, `parseZoneDirectoryQuery` | `@/services/api/zoneDirectory` | Step 11 | route |
| `ZoneDirectoryResponse`, `CREATIONS_API_PATH`, `ZONES_API_PATH`, `ZONE_API_QUERY_PARAMS` | `@/services/api` | types/constants | all API clients (MFW-45 client POST) |
| `fetchZoneItems`, `fetchZoneDirectory`, `toClientPublicCreation`, `build*Url` | `@/services/api/zoneClient` | Step 12 | pagination, MFW-30 |
| `createZonePagination`, `getZonePagination`, **`loadZone`**, `ZoneLoadOutcome` | `@/services/api/zonePagination` | `loadZone(zoneId) => Promise<"loaded" \| "failed" \| "superseded" \| "invalid">` | **MFW-30**, MFW-23 |
| `useWorldStore`: `eventId`, `currentZoneId`, `zoneCount`, `zoneStatus`, `zoneItems`, **`focusedCreationId`**; `INITIAL_WORLD_STATE`, `NO_ZONE_ITEMS`, `ZoneLoadStatus` | `@/store/useWorldStore` | Step 13 | MFW-28, MFW-30, MFW-33 |
| `ZoneNavigator`, `ZONE_NAV_COPY` | `@/components/ui/ZoneNavigator` | `({ pagination? })` | FlowRoot |
| `INITIAL_ZONE_POLICIES`, `InitialZonePolicy`, `WORLD_INITIAL_ZONE_POLICY` | `@/config/world.config` | `"NEWEST" \| "FIRST"` | owner tuning |
| `SceneViewport` reads the visible zone from the store, pins `focusedCreationId`; the `riverItems` prop overrides; `data-zone-id`, `data-river-item-count` | `@/components/canvas3d` | Step 18 | MFW-23, later e2e |

## Open questions

Product decisions only. Each one ships with the default stated, and the owner can change it later without rework.

1. **Which zone does a visitor see first?** (a) the newest, most downstream zone (default, `WORLD_INITIAL_ZONE_POLICY = "NEWEST"`); (b) Zone 1; (c) after a release, the
   user's own zone (MFW-23 calls `loadZone(zoneId)`; recommended on top of (a) or (b)).
2. **Zone navigation UI and copy.** Default: a DOM bar with "‹ คุ้งน้ำก่อนหน้า", "คุ้งน้ำที่ n จาก N", "คุ้งน้ำถัดไป ›" (buttons only when the neighbour exists) and
   "โหลดคุ้งน้ำไม่สำเร็จ" / "ลองอีกครั้ง". Options: other wording, arrows over the canvas, swipe, or hiding "จาก N".
3. **How does a zone switch look?** Default: an instant swap. Options: a camera slide down- or upstream (an instant cut under reduced motion), a fade, or a title card.
4. **Live updates?** Default: no polling (the directory refreshes on each switch). Options: poll the visible zone every N s (the owner gives N; it costs Supabase
   requests), realtime later, or a refresh button.
5. **Should zones look different?** Default: they share the same bend. Options: per-zone variations, a zone sign, or a river map.
6. **Show the shared zone during RITUAL_RELEASE?** Default: no.
7. **River render budget per tier (until MFW-34).** PLACEHOLDER: visible cap HIGH 80 / MEDIUM 48 / LOW 24, and river shadows on HIGH only. On MEDIUM/LOW some of a
   full zone's krathongs are therefore not drawn. They are still in the zone, Find My still finds and pins them, and the shown ones are spread evenly along the
   river. Options: accept these values; other numbers; turn river shadows off on HIGH too; or show a hint ("แสดง 24 จาก 80") when items are hidden.

## Decisions

- **D1 — A server zone directory, not client probing.** Probing breaks when moderation hides items, cannot find the newest zone, and loads invisible zones (AC3).
  One count query on the existing view needs no SQL.
- **D2 — `zoneCount` = the highest visible zone id (at least 1).** Gap-filling assignment keeps the ids contiguous. It uses the same moderated view as every public read.
- **D3 — Assignment = the first zone below the cap with a free spot, else `max + 1`; a missing id counts as empty.** This is the 2.4 AC plus owner decision 25.
  `hasFreeSpot` is `findNearestFreeSpot(…) !== null`, computed by MFW-45, so the pure rule has no lane dependency.
- **D4 — A zone switch clears the store first, and nothing in 3D is per zone.** All zones share one bend, one lane and one asset set, so invariant E's "dispose on switch"
  holds by creating nothing per zone. Tests prove it.
- **D5 — The 80 cap is enforced at fetch, store, mapper and renderer** (`RiverFlow` itself, perf gate a). A bad server or a direct caller can never draw more than 80.
- **D6 — Navigation buttons only when the neighbour exists.** That keeps the "no buttons in an empty world" tests true and the UI minimal.
- **D7 — The client fetch is dependency-free (allowlist + private-key guard); deep validation happens in the 3D chunk.** The coord validator imports three, and the
  landing page must ship no WebGL code.
- **D8 — `useWorldStore` is data-only, and `zonePagination` is its only writer.** The race handling is testable without React. The `stores.test.ts` shape line changes
  because the spec §3 store now holds zone state (`focusedCreationId` included).
- **D9 — Zone ids increase downstream**, following "ต่อเนื่องไปตามลำน้ำ" and MFW-24's flow direction.
- **D10 — `apiPaths.ts` is the single source of the paths and query names.** `zoneQuery.ts` re-exports it, and a test asserts identity.
- **D11 — The tier-cap selection is phase-spread, not camera-nearest.** With equal drift speed (owner decision 25), an item's phase
  `wrap01(spawn − createdAt·speed)` is time-invariant, so sampling evenly in phase order gives:
  - a set that never churns while krathongs drift (no mount/unmount every frame, and no React work in the frame loop);
  - an even density along the whole river instead of a clump;
  - the same subset on every client and in 2D (invariant B);
  - independence from the pan or the camera.

  "Nearest to the default view" would change continuously as items drift and wrap, and it would differ once the pan fix lands. Pins (`focusedCreationId`) always win,
  so MFW-30 can render and highlight any item. Find My locates hidden items from the store with `getRiverItemPositionAt`.
- **D12 — The river limits live in `TIER_BUDGETS`, as the perf review asked, and are read in `RiverFlow` from `useDeviceStore`.** That gives one budget table per tier
  (invariant F), and a runtime step-down re-selects automatically. River shadows use `shadows && riverItemCastShadow`, so they are off on MEDIUM/LOW even if
  scene shadows are turned on there later.
- **D13 — No instancing in this card.** Batching krathong parts across river items (MFW-34) is the real fix for the ~20 meshes per item, and it should land before the
  Christmas public launch. The tier caps keep the private test inside budget until then.

## Out of scope

POST/create, server zone assignment, the collision re-check and atomicity (MFW-45). Release, and the user's own zone after release (MFW-23). Find My UI, flights,
highlight (MFW-30). The 2D renderer (MFW-33). The inspect popup (MFW-28). **Instancing (MFW-34).** Live updates, zone transitions, per-zone art, minimap,
participant counts (`participantCount` stays `null`). Any `supabase/**` change. Christmas.

## Risks

- **Draw calls until MFW-34.** HIGH still allows 80 × about 20 meshes ≈ 1,600 draw calls, plus a shadow pass, in a continuous demand loop. MEDIUM is about 960 and LOW
  about 480. These caps are a stop-gap. **MFW-34 instancing must land before the Christmas public launch.** The FPS meter can still step a struggling HIGH
  device down (owner thresholds), and the caps then shrink at runtime.
- **The last slot can be taken twice (MFW-45).** Two releases can both see 79 items. MFW-45 must make the step atomic and count hidden rows (Step 4 TSDoc).
- **The directory and moderation.** If every item of the highest zone is hidden, the directory reports one zone fewer. That is harmless, because new items still
  go to the first non-full zone.
- **Two extra requests per switch** (zone + directory). They are small and `no-store`. The abuse posture is MFW-12 Open question 4.
- **SwiftShader e2e.** `RiverFlow` renders continuously while items exist. The 3D e2e uses 3 items and asserts immediately, and the 80-item path runs in FALLBACK_2D.
  If the FPS meter drops the tier, report it; do not raise thresholds.
- **Hidden-by-tier items are invisible but still tappable nowhere.** That is expected: their wish can only be reached by Find My (pinned) or after a tier change.
  It is the product trade-off in Open question 7.
- **Reviewer grep noise.** The private-key guard regex and the negative tests contain the private names. They are guards, not data paths.
