# MFW-25 [5.3] Growing river world & zone pagination — implementation spec

> Hand-off spec for one card. It is the source of truth for the implementer and the reviewer. If this file and
> `docs/backlog.json` / `docs/spec/open-questions.md` disagree, those files win, and the PR must say so.
> Branch: `feat/MFW-25-growing-river-world-zone-pagination` · Jira: MFW-25 · Epic: MFW-22 (Loop 5)
> Labels: `loy-krathong`, `world`, `perf`. Extra reviewers: **r3f-perf-reviewer** (the diff touches `src/components/canvas3d/**`
> and `src/core/world/**`) and **privacy-auditor** (the diff touches `src/services/**` and `src/app/api/**`).
> The card does **not** touch `supabase/**`, so it is not an owner-merge card: it merges after review and a green `ci` check.

## Summary

The shared river must grow instead of getting crowded. Krathongs are grouped into numbered river-bend zones (Zone 1, 2, 3, …),
and each zone holds at most 80 (owner decision 4). This card adds four things:
1. **ZoneManager** — pure functions. One of them is the rule the server write path (MFW-45) calls to choose the zone of a new
   creation: the first zone below the cap that still has a free spot, otherwise a new zone. The others help the client
   choose a zone.
2. **GrowingWorldScaler** — a pure view model of the growing world: how many zones are open, which one is visible, and which
   zones are up- and downstream of it.
3. **Server zone directory** — a small public endpoint, `GET /api/zones?event=…`, that returns how many zones are open.
4. **Client zone pagination** — it loads **only the visible zone** from `GET /api/creations`, keeps it in `useWorldStore`, and
   switches zones. A switch releases the old zone's items before it loads the new one.

The 3D scene renders the store's zone items through MFW-24's `RiverFlow`, with at most 80 of them. A small DOM zone navigator
lets the user go up- and downstream. The visual stays minimal on purpose: every zone reuses the same river bend (MFW-27
environment, MFW-24 lane). The product questions about the look are listed at the end.

## Prerequisites

The backlog blocks this card on 2.2 (MFW-12) and 5.2 (MFW-24). Cut the branch from `main` only after **both** are merged. MFW-27
(6.1) should be merged too, because MFW-24 builds on it. If one is missing, stop and report it.

| Card | State (2026-11-24) | What this card uses |
|---|---|---|
| MFW-7 [1.1] flow | merged | `useUIStore` (`flowState`, `selectedEventId`), flow state `"SHARED_WORLD_EXPLORE"`, `FESTIVAL_EVENT_IDS` / `FestivalEventId` (`src/config/events/types.ts`) |
| MFW-9 [1.3] device | merged | `useDeviceStore` (`qualityTier`, `reducedMotion`, `profiled`) — already read by `SceneViewport` / `FlowRoot` |
| MFW-19 [4.1] krathong | merged (`main` 2ade761) | `parseEventAppearance(eventId, input)` and `type KrathongAppearance` from `@/core/customization` (server-safe barrel); `KrathongAssetsProvider` + `createKrathongAssets` (`src/components/models/loyKrathong/krathongAssets.ts`): one shared asset set per canvas, nothing per item |
| **MFW-12 [2.2] API & DB** | NOT merged (plan `docs/plans/MFW-12.md`) | **ASSUMED INTERFACE (from MFW-12 plan)** — see list A below |
| **MFW-24 [5.2] river flow** | NOT merged (plan `docs/plans/MFW-24.md`, **being revised** after owner decisions 21–25) | **ASSUMED INTERFACE (from MFW-24 plan)** — see list B below |
| MFW-27 [6.1] environment | NOT merged (plan `docs/plans/MFW-27.md`) | Nothing directly. `RiverFlow` is placed in its `scene-world-view` group by MFW-24 |

**A. ASSUMED INTERFACE (from MFW-12 plan).** Check each item against `main` before you start. If a name differs, adapt your
code to it and list the difference in the PR.
- `src/config/world.config.ts`: `ZONE_ITEM_CAP = 80`, `ZONE_ID_MIN = 1`.
- `src/services/api/creationTypes.ts`: `PublicCreation` (`id, eventId, zoneId, appearance, coord, publicWishText, createdAt,
  expiresAt`), `PublicZoneResponse` (`eventId, zoneId, limit, items`), `ApiErrorBody`, `ZoneQueryField`, `PUBLIC_CREATION_KEYS`.
  The file's only value export is `PUBLIC_CREATION_KEYS`; everything else is `import type`.
- `src/services/api/creationRepository.ts`: `CreationRepository { backend; listPublicZone(q); insertCreation(i) }` and
  `CreationRepositoryError(code, detail?)` with codes `invalid_input | backend_misconfigured | backend_request_failed | invalid_backend_response`.
- `src/services/api/inMemoryCreationRepository.ts`: `createInMemoryCreationRepository({ now?, newId? })` with `setModeration`. It keeps
  two private maps, `publicRows` / `privateRows`, and has the visible filter (approved, `reportCount < AUTO_HIDE_REPORT_THRESHOLD`,
  `expiresAtMs > now`).
- `src/services/api/supabaseCreationRepository.ts`: `createSupabaseCreationRepository(...)` with the private helpers `send(target, method, body?)`
  and `restBase`, and the constants `CREATIONS_PUBLIC_VISIBLE_VIEW` (from `src/config/database.config.ts`).
- `src/services/api/creationValidation.ts`: `isFestivalEventId`, `isZoneId`. `src/services/api/json.ts`: `isPlainObject`.
- `src/services/api/zoneQuery.ts`: `ZONE_QUERY_PARAMS = { event: "event", zone: "zone" }`, `parseZoneQuery`.
- `src/services/api/creationRepositoryFactory.ts`: `getCreationRepository()`.
- `GET /api/creations?event=<id>&zone=<n>` → 200 `PublicZoneResponse` (≤ 80 items, oldest first), 400 `{ error: "invalid_query", field }`,
  503 `{ error: "unavailable" }`, `Cache-Control: no-store`.
- The fixtures in `src/services/api/__fixtures__/creations.ts` (`makeNewCreation`, `OWNER_HASH_FIXTURE`, `PRIVATE_CIPHERTEXT_FIXTURE`,
  `KEY_ID_FIXTURE`, `FAR_FUTURE`).
- The static tests `tests/unit/public-private-boundary.test.ts` and `tests/unit/creations-migration.test.ts` must keep passing.

**B. ASSUMED INTERFACE (from MFW-24 plan; that plan is being revised now).** Check each item against `main`.
- `@/core/world`: `getLoyKrathongRiverLanes(): RiverLaneSet`, `prepareRiverItems`, `type RiverRenderSource = { id; coord: SplinePathCoord; createdAtMs }`.
- `@/core/coordinates`: `parsePersistableCoord(input): { ok: true; coord } | { ok: false; … }`, `isValidRiverPlacement({ coord, createdAtMs })`,
  `type SplinePathCoord`.
- `@/components/canvas3d/RiverFlow`: `RiverFlow`, `type RiverFlowItem = { id; coord: SplinePathCoord; createdAtMs; appearance: KrathongAppearance }`.
  `RiverFlow` renders `<group name="river-item-<id>">` per item and caps nothing (MFW-24 "Do NOT": the cap is this card's job).
- `@/components/canvas3d` (`index.tsx`): `SceneViewport` has the prop `riverItems?: readonly RiverFlowItem[]` (default `NO_RIVER_ITEMS`) and
  renders `<RiverFlow>` inside the world-view group.
- Owner decisions 21 and 25 (2026-11-24): there is **one single wide lane** per river, and krathongs never overlap. MFW-24's revised plan
  provides the pure helpers `isSpotFree(…)` and `findNearestFreeSpot(…)`. The second one returns `null` when the lane is full. This card
  does **not** call them. It only defines the boolean `hasFreeSpot` input that MFW-45 fills from `findNearestFreeSpot(…) !== null`
  (exact signature: MFW-24 revised plan). This card's code must not depend on the number of lanes or on lane ids.

Facts checked in this repo (2026-11-24, `main` = 2ade761):
- `src/store/useWorldStore.ts` = `{ currentZoneId: number | null; participantCount: number | null }` and holds no actions.
  `src/store/stores.test.ts` asserts that exact shape with `toEqual`, so this card updates that one expectation (D8).
- `src/core/world/index.ts` is `export {};` today. MFW-24/27 add `export *` lines. The barrel pulls in `three` (via `@/core/coordinates`).
  Landing-chunk code (FlowRoot, stores, `src/services/api` client code) must import world files **by path**
  (`@/core/world/zoneManager`), never through the barrel.
- `FlowRoot` lazy-imports `@/components/canvas3d`. `tests/e2e/scene-gating.spec.ts` asserts that the landing page ships no WebGL chunk.
  `tests/e2e/flow.spec.ts` and `FlowRoot.test.tsx` assert **zero buttons** at `SHARED_WORLD_EXPLORE` when the world is empty (D6 keeps that true).
- `tests/unit/no-raw-xyz-persistence.test.ts` scans `src/services`, `src/app/api` and `supabase` (tests too) for a `three` import, `Vector3`
  and `.toArray()`. None of those may appear in this card's files there.
- `next.config.ts` has `cacheComponents: true`. A `GET` route handler that reads `request.url` becomes dynamic. Do not export
  `dynamic`/`revalidate`/`runtime` (MFW-12 plan, verified there). Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
  and `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` before you write `route.ts`.

## Acceptance criteria → checks

The AC text is verbatim from `docs/backlog.json`, story 5.3.

1. **"Max 80 krathongs rendered per river-bend zone (owner decision, open question 4)"**
   - Server: MFW-12 already caps `GET /api/creations` at `ZONE_ITEM_CAP`. Its tests stay green.
   - Client fetch: `fetchZoneItems` keeps at most `ZONE_ITEM_CAP` items even when the server sends more. Test:
     `src/services/api/zoneClient.test.ts` → "keeps at most 80 of 85 items".
   - Store: `useWorldStore.zoneItems.length <= ZONE_ITEM_CAP` after any load. Test: `src/services/api/zonePagination.test.ts` → "store never holds more than 80".
   - Render: `publicCreationsToRiverItems` returns at most `ZONE_ITEM_CAP` items, and `SceneViewport` passes only those to `RiverFlow`.
     Tests: `src/core/world/zoneRiverItems.test.ts` → "caps at 80 valid items"; `src/components/canvas3d/index.test.tsx` →
     "renders at most 80 river items from the store".
   - Write side: `assignZoneForNewCreation` never returns a zone that already holds `ZONE_ITEM_CAP` items or has no free spot
     (MFW-45 calls it). Test: `src/core/world/zoneManager.test.ts`.
   - E2E: an intercepted zone of 85 items shows `data-zone-item-count="80"`. Test: `tests/e2e/zone-pagination.spec.ts`.
2. **"New zones (Zone 2, 3, …) open along the river as participation grows (ZoneManager / GrowingWorldScaler)"**
   - ZoneManager (`src/core/world/zoneManager.ts`):
     - `assignZoneForNewCreation` returns Zone 1 for an empty event, and stays in the first zone that is below the cap with a free spot;
     - it opens zone `max + 1` when every zone is full (80 items **or** no free spot, owner decision 25);
     - it fills gaps (a missing zone id counts as empty).
     Test: `zoneManager.test.ts`.
   - Zone directory: `GET /api/zones?event=loy_krathong` returns `{ eventId, zoneCount }`, where `zoneCount` = the highest zone id with a visible
     creation (minimum 1). Tests: `src/services/api/zoneDirectory.test.ts`, `src/app/api/zones/route.test.ts`,
     `src/services/api/inMemoryCreationRepository.test.ts` (new cases), `src/services/api/supabaseCreationRepository.test.ts` (new cases),
     and `tests/e2e/zones-api.spec.ts`.
   - GrowingWorldScaler (`src/core/world/growingWorldScaler.ts`): zone ids increase **downstream** ("ต่อเนื่องไปตามลำน้ำ"). The view model gives
     the visible zone, the zone count and the up-/downstream neighbours. Test: `src/core/world/growingWorldScaler.test.ts`.
   - UI: `ZoneNavigator` shows "คุ้งน้ำที่ n จาก N" and shows the up-/downstream buttons only when the neighbour exists. Tests:
     `src/components/ui/ZoneNavigator.test.tsx`; e2e `zone-pagination.spec.ts` (3 zones: start on the newest zone, go upstream, then downstream).
3. **"Only the visible zone is loaded"**
   - `zonePagination.enterWorld` fetches the directory and then exactly **one** `GET /api/creations` (the initial zone). `loadZone(z)` fetches
     only zone `z`. A superseded request is aborted, and its late response is ignored. Test: `zonePagination.test.ts` → "enter loads exactly one zone",
     "switch aborts and ignores the previous zone", "store only ever holds the visible zone's items".
   - A switch clears the old items **before** the new request resolves (`zoneItems` is `[]` while loading). Test: `zonePagination.test.ts`.
   - Scene: after a store switch, the old zone's `river-item-*` groups are unmounted, the krathong asset set is created once and not disposed or
     re-created per zone, and no geometry/material is created per zone (invariant E). Tests: `index.test.tsx` → "zone switch swaps river items",
     "zone switch reuses the one krathong asset set"; `tests/unit/world-zone-boundary.test.ts` → "no per-zone three resources".
   - E2E: with intercepted routes, the browser requested only the visible zones, in order (`["3"]`, then `["3", "2"]`, …). Test: `zone-pagination.spec.ts`.

## Owner decisions that apply

These are quoted from `docs/spec/open-questions.md`. Do not reopen them.

- **Row 4:** "80 items per zone (owner, 2026-11-23)". → `ZONE_ITEM_CAP` (MFW-12's `world.config.ts`) is the only cap value. No new number.
- **Row 3:** "public reads … exclude hidden and flagged items; … auto-hidden when report_count reaches 3". → The directory counts only
  **visible** creations, from the same view / in-memory filter as `listPublicZone`.
- **Row 21 (2026-11-24):** "one single wide lane per river; krathongs spread across it by lateralOffset". → This card is lane-agnostic.
- **Row 25 (2026-11-24):** "no overlap … the server re-checks the spot against the zone and moves it to the nearest free spot if two releases race".
  → A zone is full when it has `ZONE_ITEM_CAP` items **or** no free spot is left, whichever comes first. `ZoneFill.hasFreeSpot` carries the second
  signal into `assignZoneForNewCreation`.
- **Row 23:** drift continues under reduced motion. → Zone switching adds no animation, so there is no new reduced-motion branch. The
  existing bobbing switch in `RiverFlow` stays as it is.
- **Row 5 (MFW-9):** tier budgets live in `performance.config.ts`. → This card adds no tier numbers. The 80 cap applies on every tier.
- **Row 16 / launch plan:** build engine pieces generically. → ZoneManager, GrowingWorldScaler, the directory and the pagination are
  event-agnostic (Christmas tiers can reuse them). Only `publicCreationsToRiverItems` is river-specific.
- **Backlog 2.4 AC (MFW-45):** "The server assigns zone_id (first zone of the event below the 80-item cap, else a new zone)". →
  This is the rule implemented by `assignZoneForNewCreation`. MFW-45 calls it, so this card writes no `POST`.

Row 4 already names MFW-25 and is already decided. No other row names this card. **Do not edit `docs/spec/open-questions.md`.**

## Files

| Path | New/modify | Purpose |
|---|---|---|
| `src/config/world.config.ts` | modify (MFW-12 created it) | Add `INITIAL_ZONE_POLICIES`, `InitialZonePolicy`, `WORLD_INITIAL_ZONE_POLICY` |
| `src/config/database.config.ts` | modify (MFW-12) | Add `ZONE_DIRECTORY_COLUMNS`, `HIGHEST_ZONE_ORDER`, `ZONE_DIRECTORY_LIMIT` |
| `src/core/world/zoneManager.ts` | new | ZoneManager: `assignZoneForNewCreation`, `isZoneFull`, `zoneCountFromHighestZoneId`, `isClientZoneId`, `pickInitialZoneId` (pure, no three) |
| `src/core/world/growingWorldScaler.ts` | new | GrowingWorldScaler: `describeGrowingWorld` (pure, no three) |
| `src/core/world/zoneRiverItems.ts` | new | `publicCreationsToRiverItems`: store items → validated, capped river items (3D chunk only) |
| `src/core/world/index.ts` | modify | Add three `export *` lines |
| `src/services/api/apiPaths.ts` | new | `CREATIONS_API_PATH`, `ZONES_API_PATH`, `ZONE_API_QUERY_PARAMS` (dependency-free, client-safe) |
| `src/services/api/zoneQuery.ts` | modify (MFW-12) | `ZONE_QUERY_PARAMS` becomes a re-export of `ZONE_API_QUERY_PARAMS` (one source) |
| `src/services/api/creationTypes.ts` | modify (MFW-12) | Add `ZoneDirectoryResponse` |
| `src/services/api/creationRepository.ts` | modify (MFW-12) | Add `highestVisibleZoneId(eventId)` to the interface; doc the `"zone"` detail |
| `src/services/api/inMemoryCreationRepository.ts` | modify (MFW-12) | Implement `highestVisibleZoneId` |
| `src/services/api/supabaseCreationRepository.ts` | modify (MFW-12) | Implement `highestVisibleZoneId` (view GET, explicit column) |
| `src/services/api/zoneDirectory.ts` | new | `parseZoneDirectoryQuery`, `handleZoneDirectory` (GET logic) |
| `src/app/api/zones/route.ts` | new | `GET` only; delegates to `handleZoneDirectory` |
| `src/services/api/zoneClient.ts` | new | Client fetch of the directory and of one zone (allowlist + private-key guard + cap) |
| `src/services/api/zonePagination.ts` | new | `createZonePagination`, `getZonePagination`, `loadZone` (writes `useWorldStore`) |
| `src/services/api/index.ts` | modify (MFW-12) | Also export `ZoneDirectoryResponse` type and the `apiPaths` constants |
| `src/store/useWorldStore.ts` | modify | Data-only world state: `eventId`, `zoneCount`, `zoneStatus`, `zoneItems`; `INITIAL_WORLD_STATE`, `NO_ZONE_ITEMS` |
| `src/store/stores.test.ts` | modify | Update the one world-store shape expectation (D8) |
| `src/components/ui/ZoneNavigator.tsx` | new | DOM zone navigator (Thai copy) |
| `src/components/ui/FlowRoot.tsx` | modify | Enter/leave the world on `SHARED_WORLD_EXPLORE`; render `<ZoneNavigator />` |
| `src/components/ui/FlowRoot.test.tsx` | modify | Add a `vi.mock` of `@/services/api/zonePagination` and two cases; existing cases unchanged |
| `src/components/canvas3d/index.tsx` | modify | Read the visible zone from `useWorldStore`, map with `publicCreationsToRiverItems`, `data-zone-id` / `data-river-item-count` |
| `src/components/canvas3d/index.test.tsx` | modify | Add four cases (store items, cap, zone switch, asset reuse) |
| `src/core/world/zoneManager.test.ts`, `growingWorldScaler.test.ts`, `zoneRiverItems.test.ts` | new | Pure tests |
| `src/services/api/zoneClient.test.ts`, `zonePagination.test.ts`, `zoneDirectory.test.ts`, `apiPaths.test.ts` | new | Client and server tests |
| `src/services/api/inMemoryCreationRepository.test.ts`, `supabaseCreationRepository.test.ts` | modify (MFW-12) | Add `highestVisibleZoneId` cases only |
| `src/app/api/zones/route.test.ts` | new | Route through the handler and the real `GET` |
| `src/components/ui/ZoneNavigator.test.tsx` | new | Navigator tests |
| `tests/unit/world-zone-boundary.test.ts` | new | Static import allowlist (landing chunk stays three-free), no per-zone three resources, no console |
| `tests/e2e/fixtures/zoneFixtures.ts` | new | Fixture builders for intercepted zone responses (pure TS, no Playwright import) |
| `tests/unit/zone-e2e-fixtures.test.ts` | new | Proves the e2e fixtures pass the real coord / appearance validators |
| `tests/e2e/zones-api.spec.ts` | new | Real `/api/zones` in the production build (no Supabase env) |
| `tests/e2e/zone-pagination.spec.ts` | new | Zone flow with intercepted API (FALLBACK_2D and a 3D smoke) |

## Implementation steps

Conventions for every file:
- TypeScript strict, English comments, no `any`, no `console.*` in non-test files.
- Use named constants only. No inline numbers except `0`, `1` and the ones written in the code below.
- Freeze exported constant arrays and objects with `Object.freeze`.
- Error messages carry only codes or field names, never input values.
- In `src/components/canvas3d/**` (non-test) write no decimal literal and no hex colour, comments included (MFW-27 static scan).
- Files on the **landing path** must import only what `tests/unit/world-zone-boundary.test.ts` allows (Step 18). The landing-path files are
  `apiPaths.ts`, `zoneClient.ts`, `zonePagination.ts`, `zoneManager.ts`, `growingWorldScaler.ts`, `useWorldStore.ts`, `ZoneNavigator.tsx` and `FlowRoot.tsx`.

### Step 1 — `src/config/world.config.ts` (modify: append; keep MFW-12's two constants)

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

Constant table:

| Constant | Value | File | Source |
|---|---|---|---|
| `ZONE_ITEM_CAP` | `80` (existing) | `world.config.ts` | owner, OQ 4 |
| `ZONE_ID_MIN` | `1` (existing) | `world.config.ts` | MFW-12 |
| `WORLD_INITIAL_ZONE_POLICY` | `"NEWEST"` | `world.config.ts` | **PLACEHOLDER (spec silent)**, Open question 1 |
| `ZONE_DIRECTORY_COLUMNS` / `HIGHEST_ZONE_ORDER` / `ZONE_DIRECTORY_LIMIT` | `["zone_id"]` / `"zone_id.desc"` / `1` | `database.config.ts` | lead (query shape) |
| `CREATIONS_API_PATH` / `ZONES_API_PATH` | `"/api/creations"` / `"/api/zones"` | `src/services/api/apiPaths.ts` | MFW-12 contract / lead |

### Step 3 — `src/core/world/zoneManager.ts` (new; pure; imports **only** `@/config/world.config`)

```ts
import { ZONE_ID_MIN, ZONE_ITEM_CAP, type InitialZonePolicy } from "@/config/world.config";

/** Occupancy of one existing zone, as counted by the server write path (MFW-45). */
export interface ZoneFill {
  readonly zoneId: number;      // safe integer >= ZONE_ID_MIN
  readonly itemCount: number;   // safe integer >= 0
  /** false when no non-overlapping spot is left (owner decision 25; MFW-45: findNearestFreeSpot(...) !== null). */
  readonly hasFreeSpot: boolean;
}

/** A zone is full at the item cap OR when no free spot is left, whichever comes first (owner decisions 4 and 25). */
export function isZoneFull(fill: ZoneFill, cap: number = ZONE_ITEM_CAP): boolean;

/**
 * Backlog 2.4: "first zone of the event below the 80-item cap, else a new zone". Pure and deterministic.
 * Zone ids in [ZONE_ID_MIN, max] that have no entry count as empty (with a free spot), so gaps are filled first.
 * Throws RangeError (fixed messages, no values) on invalid input.
 */
export function assignZoneForNewCreation(fills: readonly ZoneFill[], cap: number = ZONE_ITEM_CAP): number;

/** Open zones = highest zone id with a visible creation; at least ZONE_ID_MIN (Zone 1 is always open). */
export function zoneCountFromHighestZoneId(highestZoneId: number | null): number;

/** Client-side zone id check (the server applies the int4 bound too). */
export function isClientZoneId(value: unknown): value is number;

/** First visible zone for a given policy. `zoneCount` must be >= ZONE_ID_MIN. */
export function pickInitialZoneId(zoneCount: number, policy: InitialZonePolicy): number;
```

Behaviour:
- `isZoneFull(fill, cap)`: `return fill.itemCount >= cap || !fill.hasFreeSpot;`
- `assignZoneForNewCreation(fills, cap)`:
  1. If `!Number.isSafeInteger(cap) || cap < 1`, throw `RangeError("cap must be a positive integer")`.
  2. Build `const byZone = new Map<number, ZoneFill>()`. For each fill, in order:
     - `zoneId` must be a safe integer `>= ZONE_ID_MIN`, otherwise throw `RangeError("invalid zoneId")`;
     - `itemCount` must be a safe integer `>= 0`, otherwise throw `RangeError("invalid itemCount")`;
     - `typeof hasFreeSpot === "boolean"`, otherwise throw `RangeError("invalid hasFreeSpot")`;
     - a duplicate `zoneId` throws `RangeError("duplicate zoneId")`.
  3. `if (byZone.size === 0) return ZONE_ID_MIN;`
  4. `const max = Math.max(...byZone.keys());`
  5. `for (let z = ZONE_ID_MIN; z <= max; z++) { const f = byZone.get(z); if (f === undefined || !isZoneFull(f, cap)) return z; }`
  6. `return max + 1;`
- `zoneCountFromHighestZoneId(h)`: if `h === null`, return `ZONE_ID_MIN`. If `!Number.isSafeInteger(h) || h < ZONE_ID_MIN`, throw
  `RangeError("invalid highestZoneId")`. Return `h`.
- `isClientZoneId(v)`: `typeof v === "number" && Number.isSafeInteger(v) && v >= ZONE_ID_MIN`.
- `pickInitialZoneId(count, policy)`: if `!isClientZoneId(count)`, throw `RangeError("invalid zoneCount")`. Return `policy === "FIRST" ? ZONE_ID_MIN : count`.

Recommendation for MFW-45 (write it in this file's TSDoc on `ZoneFill`): count every stored, non-expired row of a zone, **including hidden or
flagged ones**. Then an un-hidden item can never push a zone above 80. Make the read + insert atomic (for example a new SQL function with a
per-event advisory lock), so two concurrent releases cannot both take the last slot. This card does not do either of those (Risks).

### Step 4 — `src/core/world/growingWorldScaler.ts` (new; pure; imports **only** `@/config/world.config`)

```ts
import { ZONE_ID_MIN } from "@/config/world.config";

/**
 * GrowingWorldScaler: view model of the growing river (spec §6.5 Task 5.3 "เปิดโซนคุ้งน้ำใหม่ (Zone 2, Zone 3, ...) ต่อเนื่องไปตามลำน้ำ").
 * Zone ids increase downstream: Zone 1 is the most upstream bend, the newest zone is the most downstream one.
 * Every zone renders the same river bend (one environment, one lane set); zone_id only selects which krathongs are shown.
 */
export interface GrowingWorldView {
  readonly zoneCount: number;                 // open zones (the growth level), >= visibleZoneId
  readonly visibleZoneId: number;
  readonly upstreamZoneId: number | null;     // visibleZoneId - 1, null at Zone 1
  readonly downstreamZoneId: number | null;   // visibleZoneId + 1, null at the newest zone
}

/** null when no zone is visible yet. A visible zone beyond the known count raises the count (e.g. a just-opened zone). */
export function describeGrowingWorld(zoneCount: number | null, visibleZoneId: number | null): GrowingWorldView | null;
```

Behaviour:
- If `visibleZoneId === null`, return `null`.
- If `visibleZoneId` is not a safe integer `>= ZONE_ID_MIN`, or `zoneCount` is neither `null` nor a safe integer `>= ZONE_ID_MIN`, throw
  `RangeError("invalid zone")`.
- `const count = Math.max(zoneCount ?? ZONE_ID_MIN, visibleZoneId);`
- Return a frozen `{ zoneCount: count, visibleZoneId, upstreamZoneId: visibleZoneId > ZONE_ID_MIN ? visibleZoneId - 1 : null,
  downstreamZoneId: visibleZoneId < count ? visibleZoneId + 1 : null }`.

### Step 5 — `src/core/world/zoneRiverItems.ts` (new; 3D-chunk only, because it imports three via coordinates)

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

export interface ZoneRiverItemsQuery {
  readonly eventId: FestivalEventId;
  readonly zoneId: number;
}

/**
 * Store items → river items, at most ZONE_ITEM_CAP (AC1). Skips (silently, no console) any item that is from another
 * event/zone, has a duplicate id, a non-SPLINE_PATH or invalid coord (invariant A), an unparseable created_at, or an
 * appearance the event's validator rejects. Not per-frame: call it in a useMemo.
 */
export function publicCreationsToRiverItems(
  creations: readonly PublicCreation[],
  query: ZoneRiverItemsQuery,
): readonly ZoneRiverItem[];
```

Algorithm (indexed `for`, stop as soon as `out.length === ZONE_ITEM_CAP`):
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
Never copy `publicWishText`, `expiresAt` or any other field into a river item. The krathong renderer does not need them (MFW-28 reads the
wish from the store when it builds the inspect popup).

### Step 6 — `src/core/world/index.ts` (modify)

Keep every existing line and add:
```ts
export * from "./zoneManager";
export * from "./growingWorldScaler";
export * from "./zoneRiverItems";
```

### Step 7 — `src/services/api/apiPaths.ts` (new; no imports)

```ts
/** Public API paths and query names shared by the server routes and the client (MFW-12 / MFW-25). Dependency-free: safe in the landing chunk. */
export const CREATIONS_API_PATH = "/api/creations";
export const ZONES_API_PATH = "/api/zones";
export const ZONE_API_QUERY_PARAMS = Object.freeze({ event: "event", zone: "zone" } as const);
```

In `src/services/api/zoneQuery.ts` (MFW-12), delete the local `ZONE_QUERY_PARAMS` definition and put
`export { ZONE_API_QUERY_PARAMS as ZONE_QUERY_PARAMS } from "./apiPaths";` in its place. Also add
`import { ZONE_API_QUERY_PARAMS as ZONE_QUERY_PARAMS } from "./apiPaths";` if the file uses the name internally. Change nothing else in that file.
Reason: the client must not import `zoneQuery.ts`, because it imports `creationValidation` → `validateCoord` → `three` and `@/services/auth`.

### Step 8 — `src/services/api/creationTypes.ts` (modify: append)

```ts
/** Body of GET /api/zones (200). Counts only; never item data. */
export interface ZoneDirectoryResponse {
  readonly eventId: FestivalEventId;
  /** Open zones = highest zone id with a visible creation, at least 1. Zones are 1..zoneCount. */
  readonly zoneCount: number;
}
```

Example 200 body:
```json
{ "eventId": "loy_krathong", "zoneCount": 3 }
```
The errors use MFW-12's `ApiErrorBody`: `{ "error": "invalid_query", "field": "event" }` (400) and `{ "error": "unavailable" }` (503).

### Step 9 — repository: `highestVisibleZoneId`

`src/services/api/creationRepository.ts`: add this to the `CreationRepository` interface, after `listPublicZone`:
```ts
  /**
   * Highest zone id that has at least one VISIBLE creation of `eventId` (same filter as listPublicZone), or null.
   * Rejects with CreationRepositoryError("invalid_input", "eventId") for an unknown event.
   */
  highestVisibleZoneId(eventId: FestivalEventId): Promise<number | null>;
```
Add `"zone"` to the documented `invalid_backend_response` details comment.

`src/services/api/inMemoryCreationRepository.ts`. The method is `async`:
1. `if (!isFestivalEventId(eventId)) throw new CreationRepositoryError("invalid_input", "eventId");`
2. `const nowMs = now(); let highest: number | null = null;`
3. Loop over `publicRows.values()`. A row counts when it passes the **same** visible predicate as `listPublicZone`: event match,
   `expiresAtMs > nowMs`, a private row exists, `moderationStatus === "approved"` and `reportCount < AUTO_HIDE_REPORT_THRESHOLD`.
   Extract that predicate into one private function `isVisible(row, nowMs)` that **both** methods call, so the two can never drift apart.
   Then `if (highest === null || row.zoneId > highest) highest = row.zoneId;`.
4. Return `highest`.

`src/services/api/supabaseCreationRepository.ts`:
```ts
async highestVisibleZoneId(eventId) {
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
It reads the server-only view `creations_public_visible`, so hidden, flagged and expired rows do not count. No SQL or migration change is needed.
**Do not touch `supabase/**`.**

### Step 10 — `src/services/api/zoneDirectory.ts` (new; server)

```ts
import { isFestivalEventId } from "./creationValidation";
import { ZONE_API_QUERY_PARAMS } from "./apiPaths";
import type { CreationRepository } from "./creationRepository";
import type { ApiErrorBody, ZoneDirectoryResponse } from "./creationTypes";
import { zoneCountFromHighestZoneId } from "@/core/world/zoneManager"; // by path: the barrel pulls in three

export type ZoneDirectoryQueryResult =
  | { readonly ok: true; readonly eventId: FestivalEventId }
  | { readonly ok: false; readonly field: "event" };

export function parseZoneDirectoryQuery(params: URLSearchParams): ZoneDirectoryQueryResult;
/** GET /api/zones logic. `getRepository` may throw (misconfigured env) → 503. Never logs. */
export async function handleZoneDirectory(request: Request, getRepository: () => CreationRepository): Promise<Response>;
```
- `parseZoneDirectoryQuery`: `const events = params.getAll(ZONE_API_QUERY_PARAMS.event);`. If `events.length !== 1 || !isFestivalEventId(events[0])`,
  return `{ ok: false, field: "event" }`. Ignore other params (`zone` included). Otherwise return `{ ok: true, eventId: events[0] }`.
- `handleZoneDirectory`: the same structure as MFW-12's `handleListCreations`, with the module constants `HTTP_OK = 200`, `HTTP_BAD_REQUEST = 400`
  and `HTTP_SERVICE_UNAVAILABLE = 503`, and `Cache-Control: no-store` on every response:
  ```ts
  const parsed = parseZoneDirectoryQuery(new URL(request.url).searchParams);
  if (!parsed.ok) return respond(HTTP_BAD_REQUEST, { error: "invalid_query", field: "event" });
  let highest: number | null;
  try {
    highest = await getRepository().highestVisibleZoneId(parsed.eventId);
  } catch {
    return respond(HTTP_SERVICE_UNAVAILABLE, { error: "unavailable" });
  }
  let zoneCount: number;
  try {
    zoneCount = zoneCountFromHighestZoneId(highest);
  } catch {
    return respond(HTTP_SERVICE_UNAVAILABLE, { error: "unavailable" });
  }
  const body: ZoneDirectoryResponse = { eventId: parsed.eventId, zoneCount }; // built field by field
  return respond(HTTP_OK, body);
  ```
  The `field` type of `ApiErrorBody` is `ZoneQueryField` (`"event" | "zone"`), so `"event"` fits.

### Step 11 — `src/app/api/zones/route.ts` (new)

```ts
import { getCreationRepository } from "@/services/api/creationRepositoryFactory";
import { handleZoneDirectory } from "@/services/api/zoneDirectory";

/** GET /api/zones?event=<FestivalEventId> — number of open river-bend zones (backlog 5.3). */
export async function GET(request: Request): Promise<Response> {
  return handleZoneDirectory(request, getCreationRepository);
}
```
Export **only** `GET`. Do not export `dynamic`, `revalidate` or `runtime`.

### Step 12 — `src/services/api/zoneClient.ts` (new; client-safe)

Allowed imports: `@/config/events/types` (type), `@/config/world.config`, `./apiPaths`, `./creationTypes` (`import type` only).

```ts
export type ZoneFetchFailure = "aborted" | "network" | "http" | "invalid_body";
export type ZoneDirectoryResult =
  | { readonly ok: true; readonly zoneCount: number }
  | { readonly ok: false; readonly reason: ZoneFetchFailure };
export type ZoneItemsResult =
  | { readonly ok: true; readonly items: readonly PublicCreation[] }
  | { readonly ok: false; readonly reason: ZoneFetchFailure };
export interface ZoneFetchOptions {
  readonly fetch?: typeof fetch;   // default: (i, init) => globalThis.fetch(i, init)
  readonly signal?: AbortSignal;
}

/** "/api/zones?event=loy_krathong" (relative: same origin). */
export function buildZoneDirectoryUrl(eventId: FestivalEventId): string;
/** "/api/creations?event=loy_krathong&zone=2". */
export function buildZoneItemsUrl(eventId: FestivalEventId, zoneId: number): string;
export function fetchZoneDirectory(eventId: FestivalEventId, options?: ZoneFetchOptions): Promise<ZoneDirectoryResult>;
export function fetchZoneItems(eventId: FestivalEventId, zoneId: number, options?: ZoneFetchOptions): Promise<ZoneItemsResult>;
/** Allowlist copy of one received item, or null (invariant C defence in depth). Coord/appearance are deep-validated later (Step 5). */
export function toClientPublicCreation(raw: unknown, eventId: FestivalEventId, zoneId: number): PublicCreation | null;
```

URLs: `` `${ZONES_API_PATH}?${new URLSearchParams({ [ZONE_API_QUERY_PARAMS.event]: eventId })}` `` and
`` `${CREATIONS_API_PATH}?${new URLSearchParams({ [ZONE_API_QUERY_PARAMS.event]: eventId, [ZONE_API_QUERY_PARAMS.zone]: String(zoneId) })}` ``.
These are the **only** query parameters. No token, hash or device id ever goes into a URL (invariant C).

The shared private request helper `getJson(url, options): Promise<{ ok: true; body: unknown } | { ok: false; reason }>`:
```ts
const fetchImpl = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
let res: Response;
try {
  res = await fetchImpl(url, { method: "GET", cache: "no-store", headers: { Accept: "application/json" }, signal: options.signal });
} catch {
  return { ok: false, reason: options.signal?.aborted ? "aborted" : "network" };
}
if (!res.ok) {
  await res.body?.cancel().catch(() => undefined);
  return { ok: false, reason: "http" };
}
try {
  return { ok: true, body: await res.json() };
} catch {
  return { ok: false, reason: options.signal?.aborted ? "aborted" : "invalid_body" };
}
```
No credentials and no custom auth header. Never log the body.

`fetchZoneDirectory`: `getJson(buildZoneDirectoryUrl(eventId), options)`. The body is valid only if it is a plain object with `body.eventId === eventId` and
`isClientZoneIdLike(body.zoneCount)` (safe integer `>= ZONE_ID_MIN`; write this check inline in this file — do not import `@/core/world/zoneManager` here, to keep the
allowlist small). Return `{ ok: true, zoneCount }`. Otherwise return `{ ok: false, reason: "invalid_body" }`.

`fetchZoneItems`: `getJson(buildZoneItemsUrl(eventId, zoneId), options)`. The body must be a plain object with `body.eventId === eventId`,
`body.zoneId === zoneId` and `Array.isArray(body.items)`, otherwise `invalid_body`. Then:
```ts
const items: PublicCreation[] = [];
const seen = new Set<string>();
for (const raw of body.items) {
  if (items.length >= ZONE_ITEM_CAP) break; // AC1: never hold more than one zone's cap
  const item = toClientPublicCreation(raw, eventId, zoneId);
  if (item === null || seen.has(item.id)) continue;
  seen.add(item.id);
  items.push(item);
}
return { ok: true, items: Object.freeze(items) };
```

`toClientPublicCreation(raw, eventId, zoneId)`:
1. `raw` must be a plain object (prototype `Object.prototype` or `null`; write a local `isPlainRecord`).
2. Read only the eight keys of `PUBLIC_CREATION_KEYS` by name: `const { id, eventId: e, zoneId: z, appearance, coord, publicWishText, createdAt, expiresAt } = raw;`.
3. Checks:
   - `id` is a non-empty string;
   - `e === eventId` and `z === zoneId`;
   - `appearance` and `coord` are plain objects;
   - `publicWishText` is `null` or a string;
   - `createdAt` and `expiresAt` are strings with a finite `Date.parse`.
4. Private-key guard: if `containsPrivateKey(appearance) || containsPrivateKey(coord)`, return `null`. Here
   `const PRIVATE_KEY_PATTERN = /owner_?token|private_?wish/i;` and
   ```ts
   function containsPrivateKey(value: unknown): boolean {
     if (Array.isArray(value)) return value.some(containsPrivateKey);
     if (typeof value !== "object" || value === null) return false;
     return Object.entries(value).some(([k, v]) => PRIVATE_KEY_PATTERN.test(k) || containsPrivateKey(v));
   }
   ```
   (The body comes from `res.json()`, so it cannot have cycles.)
5. Return a fresh object built field by field, with no spread: `{ id, eventId: e, zoneId: z, appearance, coord, publicWishText, createdAt, expiresAt }`
   (cast to `PublicCreation`; TSDoc notes that coord/appearance are deep-validated in Step 5).

### Step 13 — `src/store/useWorldStore.ts` (modify; data-only)

```ts
import { create } from "zustand";
import type { FestivalEventId } from "@/config/events/types";
import type { PublicCreation } from "@/services/api/creationTypes";

export type ZoneLoadStatus = "idle" | "loading" | "ready" | "error";

/** Shared-world status (spec §3: โซนปัจจุบัน, จำนวนผู้เล่น, ระดับการเติบโตของโลก). Fed from public endpoints only (invariant C). */
export interface WorldState {
  /** Visible zone; null before the world is entered. */
  currentZoneId: number | null;
  /** Spec §3 "จำนวนผู้เล่น". Not set by any card yet (no data source). */
  participantCount: number | null;
  /** Festival whose world is shown; null outside SHARED_WORLD_EXPLORE. */
  eventId: FestivalEventId | null;
  /** Open zones = growth level (GET /api/zones); null until known. */
  zoneCount: number | null;
  zoneStatus: ZoneLoadStatus;
  /** ONLY the visible zone's public items, ≤ ZONE_ITEM_CAP (backlog 5.3 AC1/AC3). Never private fields. */
  zoneItems: readonly PublicCreation[];
}

export const NO_ZONE_ITEMS: readonly PublicCreation[] = Object.freeze([]);

export const INITIAL_WORLD_STATE: Readonly<WorldState> = Object.freeze({
  currentZoneId: null,
  participantCount: null,
  eventId: null,
  zoneCount: null,
  zoneStatus: "idle",
  zoneItems: NO_ZONE_ITEMS,
});

export const useWorldStore = create<WorldState>()(() => ({ ...INITIAL_WORLD_STATE }));
```
The store has no actions. Its only writer is `zonePagination` (Step 14). Tests reset it with `useWorldStore.setState(useWorldStore.getInitialState(), true)`.

`src/store/stores.test.ts`: change **only** the line
`expect(useWorldStore.getState()).toEqual({ currentZoneId: null, participantCount: null });` to
```ts
expect(useWorldStore.getState()).toEqual({
  currentZoneId: null, participantCount: null, eventId: null, zoneCount: null, zoneStatus: "idle", zoneItems: [],
});
```
Leave everything else in that file as it is.

### Step 14 — `src/services/api/zonePagination.ts` (new; client-safe)

Allowed imports: `@/config/events/types`, `@/config/world.config`, `@/core/world/zoneManager`, `@/store/useWorldStore`, `./zoneClient`.

```ts
export type ZoneLoadOutcome = "loaded" | "failed" | "superseded" | "invalid";

export interface WorldStoreLike {
  getState(): WorldState;
  setState(partial: Partial<WorldState>): void;
}

export interface ZonePaginationOptions {
  readonly fetch?: typeof fetch;          // default global fetch (via zoneClient)
  readonly store?: WorldStoreLike;        // default useWorldStore
  readonly initialZonePolicy?: InitialZonePolicy; // default WORLD_INITIAL_ZONE_POLICY
}

export interface ZonePagination {
  /** Enter the shared world of `eventId`: directory, then exactly ONE zone (the initial one). */
  enterWorld(eventId: FestivalEventId): Promise<ZoneLoadOutcome>;
  /** Make `zoneId` the visible zone: drop the old items, load only this zone (spec §6.7 Task 7.1 "await loadZone(zoneId)"). */
  loadZone(zoneId: number): Promise<ZoneLoadOutcome>;
  /** Re-run the last failed step (directory or zone). */
  retry(): Promise<ZoneLoadOutcome>;
  /** Abort in-flight requests and reset the world store to INITIAL_WORLD_STATE. */
  leaveWorld(): void;
}

export function createZonePagination(options?: ZonePaginationOptions): ZonePagination;
/** App singleton on useWorldStore + global fetch (created on first call). */
export function getZonePagination(): ZonePagination;
/** Shorthand for MFW-30: getZonePagination().loadZone(zoneId). */
export function loadZone(zoneId: number): Promise<ZoneLoadOutcome>;
```

Internals (closure): `let generation = 0; let controller: AbortController | null = null;`
```ts
function begin(): { gen: number; signal: AbortSignal } {
  controller?.abort();
  controller = new AbortController();
  generation += 1;
  return { gen: generation, signal: controller.signal };
}
const isCurrent = (gen: number) => gen === generation;
```

`loadZoneInternal(zoneId, refreshDirectory: boolean)`:
1. `const { eventId } = store.getState();` If `eventId === null || !isClientZoneId(zoneId)`, return `"invalid"` and change nothing.
2. `const { gen, signal } = begin();`
3. **Release the old zone first** (invariant E, AC3):
   `store.setState({ currentZoneId: zoneId, zoneStatus: "loading", zoneItems: NO_ZONE_ITEMS });`
4. Run in parallel: `fetchZoneItems(eventId, zoneId, { fetch, signal })` and, if `refreshDirectory`, `fetchZoneDirectory(eventId, { fetch, signal })`.
   The directory is refreshed on each switch so zones opened since entering appear. It is metadata, not zone content.
5. `if (!isCurrent(gen)) return "superseded";` (do not touch the store).
6. If the zone failed, `store.setState({ zoneStatus: "error" })` and return `"failed"`.
7. Otherwise, with `known = store.getState().zoneCount ?? ZONE_ID_MIN`, compute
   `const zoneCount = Math.max(dir?.ok ? dir.zoneCount : known, zone.items.length > 0 ? zoneId : ZONE_ID_MIN);`
   Then `store.setState({ zoneItems: zone.items, zoneStatus: "ready", zoneCount })` and return `"loaded"`.

`enterWorld(eventId)`:
1. If `!(FESTIVAL_EVENT_IDS as readonly string[]).includes(eventId)`, return `"invalid"`.
2. `const { gen, signal } = begin();`
3. `store.setState({ eventId, zoneCount: null, currentZoneId: null, zoneStatus: "loading", zoneItems: NO_ZONE_ITEMS });`
4. `const dir = await fetchZoneDirectory(eventId, { fetch, signal });`
5. `if (!isCurrent(gen)) return "superseded";`
6. If `!dir.ok`: `store.setState({ zoneStatus: "error" })` and return `"failed"`. `currentZoneId` stays `null`, so `retry()` re-enters.
7. `store.setState({ zoneCount: dir.zoneCount });`, then
   `return loadZoneInternal(pickInitialZoneId(dir.zoneCount, policy), false);` (the directory was just fetched).

`loadZone(zoneId)` = `loadZoneInternal(zoneId, true)`.

`retry()`: `const s = store.getState();`. If `s.zoneStatus !== "error" || s.eventId === null`, return `Promise.resolve("invalid")`. Return
`s.currentZoneId === null ? enterWorld(s.eventId) : loadZoneInternal(s.currentZoneId, true)`.

`leaveWorld()`: `controller?.abort(); controller = null; generation += 1; store.setState({ ...INITIAL_WORLD_STATE });`.

No timers, no polling (Open question 4), no `console.*`. The module never reads or sends the DeviceOwnerToken.

### Step 15 — `src/services/api/index.ts` (modify)

Keep MFW-12's exports and add:
```ts
export { CREATIONS_API_PATH, ZONES_API_PATH, ZONE_API_QUERY_PARAMS } from "./apiPaths";
export type { ZoneDirectoryResponse } from "./creationTypes";
```
Do **not** export the zone client, the pagination or any server module from the barrel.

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

export interface ZoneNavigatorProps {
  /** Injected in tests; default getZonePagination(). */
  readonly pagination?: Pick<ZonePagination, "loadZone" | "retry">;
}

export function ZoneNavigator({ pagination }: ZoneNavigatorProps) { … }
```

Behaviour:
- Read `eventId`, `currentZoneId`, `zoneCount`, `zoneStatus` and `zoneItems.length` with separate `useWorldStore` selectors (primitive values, so there are no
  re-render loops).
- `const p = pagination ?? getZonePagination();` (call it inside the render; the singleton is cheap).
- `if (eventId === null) return null;`
- `const view = describeGrowingWorld(zoneCount, currentZoneId);`
- Render:
  ```tsx
  <nav aria-label={ZONE_NAV_COPY.navLabel} data-testid="zone-navigator"
       data-zone-id={currentZoneId ?? undefined} data-zone-count={view?.zoneCount ?? undefined}
       data-zone-status={zoneStatus} data-zone-item-count={zoneItemCount}
       className="mb-4 flex w-full items-center justify-between gap-2 text-sm">
    {view?.upstreamZoneId != null && (
      <button type="button" onClick={() => void p.loadZone(view.upstreamZoneId!)} className="rounded-full border px-3 py-1">
        ‹ {ZONE_NAV_COPY.upstream}
      </button>
    )}
    <p aria-live="polite" className="flex-1 text-center">
      {zoneStatus === "error" ? ZONE_NAV_COPY.error
        : view === null || zoneStatus === "loading" && view === null ? ZONE_NAV_COPY.loading
        : ZONE_NAV_COPY.zoneLabel(view.visibleZoneId, view.zoneCount)}
    </p>
    {zoneStatus === "error" && (
      <button type="button" onClick={() => void p.retry()} className="rounded-full border px-3 py-1">{ZONE_NAV_COPY.retry}</button>
    )}
    {view?.downstreamZoneId != null && (
      <button type="button" onClick={() => void p.loadZone(view.downstreamZoneId!)} className="rounded-full border px-3 py-1">
        {ZONE_NAV_COPY.downstream} ›
      </button>
    )}
  </nav>
  ```
  Simplify the label expression to: error → `error`; `view === null` → `loading`; otherwise `zoneLabel(...)`. While a zone is loading and
  `view` exists, still show the zone label (the buttons stay usable; a new tap supersedes the load).
- Buttons appear **only** when the neighbour exists (D6). In an empty world (1 zone) the navigator has no button.
- No animation, no transition classes. There is nothing for reduced motion to switch off.
- Avoid the non-null assertions if lint forbids them: bind `const up = view?.upstreamZoneId ?? null;` first.

### Step 17 — `src/components/ui/FlowRoot.tsx` (modify)

1. Imports: `import { useEffect } from "react";` (merge it into the existing react import), `import { getZonePagination } from "@/services/api/zonePagination";`,
   `import { ZoneNavigator } from "./ZoneNavigator";`.
2. `const selectedEventId = useUIStore((s) => s.selectedEventId);`
3. Effect:
   ```ts
   useEffect(() => {
     if (flowState !== "SHARED_WORLD_EXPLORE" || selectedEventId === null) return;
     const pagination = getZonePagination();
     void pagination.enterWorld(selectedEventId);
     return () => pagination.leaveWorld();
   }, [flowState, selectedEventId]);
   ```
   The data loads on every tier, FALLBACK_2D included, so the 2D river (MFW-33) can read the same store (invariant B).
4. JSX: directly after the `{profiled && … <SceneViewport …/> …}` block, add `{flowState === "SHARED_WORLD_EXPLORE" && <ZoneNavigator />}`.
   Change nothing else.

### Step 18 — `src/components/canvas3d/index.tsx` (modify; small edits only)

1. Imports: `import { useMemo } from "react";` (merge), `import { publicCreationsToRiverItems } from "@/core/world";`, `import { useWorldStore } from "@/store/useWorldStore";`.
2. `SceneViewport` prop `riverItems` becomes **optional with no default** (`riverItems?: readonly RiverFlowItem[]`). When given, it overrides the store
   (tests, MFW-23 preview). Keep `NO_RIVER_ITEMS` exported.
3. Next to the other hooks, **before** the early `return null`:
   ```ts
   const worldEventId = useWorldStore((s) => s.eventId);
   const worldZoneId = useWorldStore((s) => s.currentZoneId);
   const worldZoneItems = useWorldStore((s) => s.zoneItems);
   const storeRiverItems = useMemo(
     () => (mode === "WORLD_EXPLORE" && worldEventId !== null && worldZoneId !== null
       ? publicCreationsToRiverItems(worldZoneItems, { eventId: worldEventId, zoneId: worldZoneId })
       : NO_RIVER_ITEMS),
     [mode, worldEventId, worldZoneId, worldZoneItems],
   );
   const visibleRiverItems = riverItems ?? storeRiverItems;
   ```
4. Pass `riverItems={visibleRiverItems}` to `ToyNightScene` (in place of the old prop value).
5. On the `<section>`, add `data-zone-id={mode === "WORLD_EXPLORE" ? worldZoneId ?? undefined : undefined}` and
   `data-river-item-count={visibleRiverItems.length}`.
6. Change nothing else: no new geometry, material, texture, `useFrame` or camera flight on zone switch. When the store's items change,
   `RiverFlow`'s `useMemo` re-prepares them, and React unmounts the old `river-item-*` groups. They hold only shared assets from
   `KrathongAssetsProvider`, so nothing per zone needs disposing (D4).

### Step 19 — e2e fixtures `tests/e2e/fixtures/zoneFixtures.ts` (new; pure TS, no imports from `src/` or Playwright)

```ts
/** laneId of the first lane in LOY_KRATHONG_RIVER_LANES on main (copy it from the config; zone-e2e-fixtures.test.ts checks it). */
export const E2E_LANE_ID = /* literal from src/config/events/loyKrathong.river.config.ts */;
export const E2E_EVENT_ID = "loy_krathong";
export const E2E_APPEARANCE = { base: "banana_trunk_01", lotusFold: "style_01", leafColor: "#5E8C3A", flowers: ["marigold"], candleColor: "#FFD166" };
/** Deterministic lowercase uuid: zone and index in the last group. */
export function e2eItemId(zoneId: number, index: number): string; // `00000000-0000-4000-8000-${String(zoneId * 1000 + index).padStart(12, "0")}`
export function makeZoneItem(zoneId: number, index: number): Record<string, unknown>;
// { id, eventId: E2E_EVENT_ID, zoneId, appearance: E2E_APPEARANCE, coord: { mode: "SPLINE_PATH", laneId: E2E_LANE_ID,
//   spawnProgress: (index % 100) / 100, speedFactor: <the same-speed constant from MFW-24/23 config, copied as a literal>, lateralOffset: 0 },
//   publicWishText: null, createdAt: "2026-11-24T12:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z" }
export function makeZoneBody(zoneId: number, count: number): { eventId: string; zoneId: number; limit: number; items: Record<string, unknown>[] };
```
If MFW-24 exports no shared speed constant, use `0.008` (the spec §4.1 example).

## Tests

Everything runs under `pnpm test` with no network and no database. Server tests start with `// @vitest-environment node`. In
`src/services/**` and `src/app/api/**` never write `Vector3`, `.toArray()` or a `three` import, tests included.

### `src/core/world/zoneManager.test.ts` (node)
1. `assignZoneForNewCreation([])` → `1`.
2. `[{1, 79, true}]` → `1`. `[{1, 80, true}]` → `2`. `[{1, 85, true}]` (overfull after a race) → `2`.
3. "free spot rule (owner decision 25)": `[{1, 10, false}]` → `2`. `[{1, 80, true}, {2, 3, true}]` → `2`. `[{1, 80, true}, {2, 3, false}]` → `3`.
4. "first zone below the cap wins": `[{1, 80, true}, {2, 40, true}, {3, 10, true}]` → `2`. The same input in shuffled order → `2`.
5. "gaps count as empty": `[{1, 80, true}, {3, 80, true}]` → `2`.
6. Custom cap: `([{1, 2, true}], 2)` → `2`.
7. Throws `RangeError` for: cap `0`, `1.5`, `NaN`; zoneId `0`, `-1`, `1.5`; itemCount `-1`, `NaN`; `hasFreeSpot` `"yes"` (cast); a duplicate zoneId. The messages
   contain no input value (e.g. for zoneId `987654` the message does not contain `"987654"`).
8. `isZoneFull`: `{80, true}` → true; `{79, true}` → false; `{0, false}` → true.
9. `zoneCountFromHighestZoneId(null)` → `1`; `(3)` → `3`; `(0)` and `(1.5)` throw.
10. `isClientZoneId`: `1` and `2147483647` → true; `0`, `-1`, `1.5`, `"1"`, `NaN`, `Number.MAX_SAFE_INTEGER + 1` → false.
11. `pickInitialZoneId(3, "NEWEST")` → `3`; `(3, "FIRST")` → `1`; `(0, "NEWEST")` throws.
12. `WORLD_INITIAL_ZONE_POLICY` is in `INITIAL_ZONE_POLICIES`.

### `src/core/world/growingWorldScaler.test.ts` (node)
1. `(null, null)` and `(3, null)` → `null`.
2. `(3, 2)` → `{ zoneCount: 3, visibleZoneId: 2, upstreamZoneId: 1, downstreamZoneId: 3 }` (`toEqual`), and the result is frozen.
3. `(3, 1)` → upstream `null`, downstream `2`. `(3, 3)` → downstream `null`. `(1, 1)` → both `null`.
4. `(null, 1)` → `zoneCount 1`. `(2, 5)` (a just-opened zone beyond the count) → `zoneCount 5`, downstream `null`, upstream `4`.
5. Throws for visible `0`, `1.5`, and zoneCount `0`.

### `src/core/world/zoneRiverItems.test.ts` (jsdom default is fine)
Fixture `creation(i, overrides)` → a `PublicCreation` with `eventId "loy_krathong"`, `zoneId 2`, `id` from a uuid helper,
`appearance: serializeKrathongAppearance(DEFAULT_KRATHONG_APPEARANCE)`, coord `{ mode: "SPLINE_PATH", laneId: getLoyKrathongRiverLanes().lanes[0].laneId,
spawnProgress: 0.25, speedFactor: 0.008, lateralOffset: 0 }`, and `createdAt "2026-11-24T12:00:00.000Z"`.
1. One valid item → `[{ id, coord, createdAtMs: Date.parse(createdAt), appearance }]`. The keys are exactly `["appearance", "coord", "createdAtMs", "id"]` (sorted).
   `coord` deep-equals the input but is `not.toBe` it. The result and its entries are frozen.
2. "caps at 80 valid items": 85 valid → length 80 = the first 80 ids in order.
3. "invalid items do not use cap slots": 5 invalid then 80 valid → 80 items, all valid.
4. Each of these is dropped: another zone (`zoneId 3`), another event (`christmas`), an empty id, a duplicate id (the first is kept), coord with an extra key `x`,
   a `PLANAR_ZONE` coord, `lateralOffset 0.7`, `createdAt "garbage"`, an appearance with `base "nope"`.
5. "public wish never copied": an item with `publicWishText "ขอให้มีความสุข"` → `JSON.stringify(result)` does not contain it.
6. `[]` → `[]`.

### `src/services/api/apiPaths.test.ts` (node)
1. `ZONE_API_QUERY_PARAMS` equals `{ event: "event", zone: "zone" }`, and `ZONE_QUERY_PARAMS` (from `./zoneQuery`) `toBe` it.
2. `CREATIONS_API_PATH === "/api/creations"` and `ZONES_API_PATH === "/api/zones"`.

### `src/services/api/zoneClient.test.ts` (jsdom)
Helper: `const fetchMock = vi.fn(async (_i: RequestInfo | URL, _init?: RequestInit) => Response.json(body))`, with a mutable `body`.
1. URLs: `buildZoneItemsUrl("loy_krathong", 2)` → `"/api/creations?event=loy_krathong&zone=2"`. `buildZoneDirectoryUrl("loy_krathong")` → `"/api/zones?event=loy_krathong"`.
2. Request shape: `fetchZoneItems` calls fetch once with that URL, `method "GET"`, `cache "no-store"`, the given signal, and no `Authorization` header.
3. "keeps at most 80 of 85 items": a body with 85 valid items → `items.length === 80`, the first 80 ids.
4. "allowlist (invariant C)": items with the extra top-level keys `owner_token`, `owner_token_hash`, `private_wish_text`, `ownerTokenHash`, `privateWishText`,
   `report_count`, `moderation_status` → kept, but each item's sorted keys equal sorted `PUBLIC_CREATION_KEYS`, and `JSON.stringify(items)` contains none
   of those names.
5. "private keys nested in coord or appearance drop the item": `appearance: { ..., owner_token: "x" }` and `coord: { ..., privateWish: 1 }` → dropped.
6. Mismatch → `invalid_body`: body `eventId "christmas"`, body `zoneId 3` for a zone-2 request, `items` not an array, body `null`.
7. Bad items are dropped: `zoneId` mismatch inside an item, a non-string id, `createdAt "x"`, `publicWishText 5`, `coord` an array, a duplicate id.
8. Failures: a 503 response → `{ ok: false, reason: "http" }`, and its body is not read (spy on `json`). Fetch rejects → `network`. Invalid JSON → `invalid_body`.
   An already-aborted signal plus a fetch that rejects with `DOMException("x", "AbortError")` → `aborted`.
9. Directory: `{ eventId: "loy_krathong", zoneCount: 3 }` → `{ ok: true, zoneCount: 3 }`. `zoneCount 0`, `1.5`, `"3"`, or the wrong eventId → `invalid_body`.

### `src/services/api/zonePagination.test.ts` (jsdom)
Use a fake store: `createStore<WorldState>()(() => ({ ...INITIAL_WORLD_STATE }))` from `zustand/vanilla` (already a dependency), or the real
`useWorldStore` reset in `beforeEach`. Use a fetch fake that routes on `new URL(String(input), "http://localhost")`: `/api/zones` → `{ eventId, zoneCount }`,
`/api/creations` → `makeBody(zone, count)`. It records every requested URL and can hold responses in deferred promises.
1. "enter loads exactly one zone": zoneCount 3, policy NEWEST → requests in order are `["/api/zones?event=loy_krathong", "/api/creations?event=loy_krathong&zone=3"]`.
   The outcome is `"loaded"`. The store is `{ eventId: "loy_krathong", currentZoneId: 3, zoneCount: 3, zoneStatus: "ready" }` with that zone's items.
2. With `initialZonePolicy: "FIRST"` → zone 1 is requested, and no other creations request.
3. "loadZone fetches only that zone": after enter, `loadZone(2)` → exactly one more creations request, for `zone=2` (plus one directory refresh). The store items all have `zoneId 2`.
4. "switch releases the old zone first": hold the zone-2 response in a deferred promise. Right after calling `loadZone(2)` (before resolving),
   `currentZoneId === 2`, `zoneStatus === "loading"` and `zoneItems.length === 0`.
5. "switch aborts and ignores the previous zone": `loadZone(2)` (deferred), then `loadZone(1)`. Zone 1 resolves, then zone 2 resolves late. The first call resolves
   `"superseded"`. The signal passed for zone 2 is `aborted`. The store holds zone-1 items only.
6. "store never holds more than 80": a zone body of 85 → `zoneItems.length === 80`.
7. "store only ever holds the visible zone's items": subscribe to the store. During enter → 2 → 1, every snapshot's `zoneItems` all have `zoneId === currentZoneId`.
8. Zone count grows: the directory says 2, then `loadZone(3)` returns 4 items and the refreshed directory says 3 → `zoneCount 3`. If the refreshed
   directory fails (503) but zone 3 has items → `zoneCount 3`.
9. Errors: directory 503 on enter → `zoneStatus "error"`, `currentZoneId null`, `"failed"`; then `retry()` with a healthy fetch → `"loaded"`. Zone 503 →
   `"error"` with `currentZoneId` kept; `retry()` refetches that zone.
10. `loadZone(0)`, `loadZone(1.5)` and `loadZone` before enter → `"invalid"`, with no request. `enterWorld("nope" as FestivalEventId)` → `"invalid"`.
    `retry()` when not in error → `"invalid"`.
11. `leaveWorld()` during a pending load → the store equals `INITIAL_WORLD_STATE`, and the late response does not change it.
12. "no private data reaches the store": a zone body whose items carry the extra keys from zoneClient case 4 → `JSON.stringify(store.getState())` contains
    none of `owner_token`, `owner_token_hash`, `private_wish_text`.
13. `getZonePagination()` returns the same instance twice. `loadZone` (the export) delegates to it: spy on `getZonePagination().loadZone`.

### `src/services/api/zoneDirectory.test.ts` (node)
Use `createInMemoryCreationRepository({ now: () => t })` and `makeNewCreation` from MFW-12's fixtures.
1. `parseZoneDirectoryQuery`: `event=loy_krathong` ok; `&zone=5` is ignored; missing, `""`, `LOY_KRATHONG`, `nope` and a duplicated `event` → `{ ok: false, field: "event" }`.
2. Empty repository → 200 `{ eventId: "loy_krathong", zoneCount: 1 }`, sorted keys exactly `["eventId", "zoneCount"]`, and `cache-control` contains `no-store`.
3. Inserts in zones 1, 2 and 4 of loy_krathong and in zone 9 of christmas → loy_krathong `zoneCount 4`, christmas `9`.
4. Moderation: hide (`setModeration(id, { moderationStatus: "hidden" })`) the only zone-4 item → `zoneCount 2`. `reportCount: AUTO_HIDE_REPORT_THRESHOLD` has the same effect.
5. 400 for `event=nope` → body exactly `{ error: "invalid_query", field: "event" }`.
6. 503 (body exactly `{ error: "unavailable" }`, and the text contains no hash) when the repository rejects with `new Error("boom " + OWNER_HASH_FIXTURE)`,
   when the getter throws `CreationRepositoryError("backend_misconfigured", "SUPABASE_URL")`, and when it returns `0` (invalid highest).
7. "no private data (invariant C)": seed a private creation (`privateWish: makePrivateWish()`). The response text contains none of `owner_token`,
   `owner_token_hash`, `private_wish_text`, `OWNER_HASH_FIXTURE`, `PRIVATE_CIPHERTEXT_FIXTURE`, `KEY_ID_FIXTURE`.

### `src/services/api/inMemoryCreationRepository.test.ts` (modify: add cases; change none)
1. "highestVisibleZoneId": empty → `null`. After inserts in zones 1 and 3 → `3`. Another event's zone 7 does not count. An expired row does not count (advance `t`).
2. `highestVisibleZoneId("nope" as FestivalEventId)` rejects `invalid_input` / `eventId`.

### `src/services/api/supabaseCreationRepository.test.ts` (modify: add cases; change none)
1. "zone directory request": one GET to `/rest/v1/creations_public_visible` with `select` exactly `"zone_id"` (no `*`), `event_id "eq.loy_krathong"`,
   `order "zone_id.desc"`, `limit "1"`, `cache "no-store"` and the service-key headers.
2. `[]` → `null`. `[{ zone_id: 4 }]` → `4`. `[{ zone_id: 0 }]` and `[{}]` → `invalid_backend_response` / `zone`. `{}` (not an array) → `invalid_backend_response` / `list`.
   A 400 → `backend_request_failed`, and its body is not read.

### `src/app/api/zones/route.test.ts` (node)
1. Like MFW-12's route test case 6: `vi.resetModules()`, stub `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` to `""`, `const { GET } = await import("./route")`, and
   `GET(new Request("http://localhost/api/zones?event=loy_krathong"))` → 200 `{ eventId: "loy_krathong", zoneCount: 1 }`.
2. `route.ts` exports exactly `["GET"]` (`Object.keys(await import("./route"))`).

### `src/components/ui/ZoneNavigator.test.tsx` (jsdom)
Reset `useWorldStore` in `beforeEach`. Inject `pagination = { loadZone: vi.fn(async () => "loaded" as const), retry: vi.fn(async () => "loaded" as const) }`.
1. `eventId null` → renders nothing (`queryByTestId("zone-navigator")` is null).
2. `{ eventId: "loy_krathong", currentZoneId: 1, zoneCount: 1, zoneStatus: "ready" }` → the text `"คุ้งน้ำที่ 1 จาก 1"`, **no** button, and
   `data-zone-count="1"`.
3. Zone 2 of 3 → both buttons. Clicking "คุ้งน้ำก่อนหน้า" calls `loadZone(1)`, and "คุ้งน้ำถัดไป" calls `loadZone(3)`.
4. Zone 3 of 3 → only the upstream button. Zone 1 of 3 → only the downstream button.
5. `currentZoneId null`, status `loading` → the text `"กำลังโหลดคุ้งน้ำ…"` and no buttons.
6. `zoneStatus "error"` → the text `"โหลดคุ้งน้ำไม่สำเร็จ"`, and clicking "ลองอีกครั้ง" calls `retry()`.
7. `data-zone-item-count` equals `zoneItems.length` (set 2 fixture items).
8. "no animation classes": `container.innerHTML` does not match `/animate-|transition/` (invariant F, nothing to reduce).

### `src/components/ui/FlowRoot.test.tsx` (modify: add a mock and two cases; existing cases unchanged)
At the top, next to the existing `vi.mock`:
```ts
const zones = vi.hoisted(() => ({ enterWorld: vi.fn(async () => "loaded"), leaveWorld: vi.fn(), loadZone: vi.fn(async () => "loaded"), retry: vi.fn(async () => "loaded") }));
vi.mock("@/services/api/zonePagination", () => ({ getZonePagination: () => zones, loadZone: zones.loadZone }));
```
In `beforeEach`, clear the four mocks and reset `useWorldStore`.
1. "enters the shared world once on SHARED_WORLD_EXPLORE": click through to SHARED_WORLD_EXPLORE → `enterWorld` called once with `"loy_krathong"`. It is not
   called in any earlier state (assert after each click). Unmount → `leaveWorld` called once.
2. "renders the zone navigator only in SHARED_WORLD_EXPLORE": set the world store to `{ eventId: "loy_krathong", currentZoneId: 1, zoneCount: 1, zoneStatus: "ready" }`.
   `queryByTestId("zone-navigator")` is null in the earlier states and present at SHARED_WORLD_EXPLORE, and `queryByRole("button")` is still null there (1 zone).

### `src/components/canvas3d/index.test.tsx` (modify: add 4 cases; change none)
Add a passthrough mock **only** if the file does not mock that module already:
```ts
const assets = vi.hoisted(() => ({ created: 0, disposed: 0 }));
vi.mock("@/components/models/loyKrathong/krathongAssets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/models/loyKrathong/krathongAssets")>();
  return { ...actual, createKrathongAssets: () => { assets.created += 1; const a = actual.createKrathongAssets();
    return { ...a, dispose: () => { assets.disposed += 1; a.dispose(); } }; } };
});
```
Reset `useWorldStore` and `assets` in `beforeEach`. Build store items with the same helper as `zoneRiverItems.test.ts` (copy it into the test file).
1. "renders the visible zone from the store": HIGH tier, `mode="WORLD_EXPLORE"`, store `{ eventId: "loy_krathong", currentZoneId: 2, zoneItems: [a, b] (zone 2) }`
   → `[name="river-item-<a.id>"]` and `[name="river-item-<b.id>"]` exist, and the section has `data-river-item-count="2"` and `data-zone-id="2"`. In `mode="CUSTOMIZE"`
   with the same store → no `river-item-*` and `data-river-item-count="0"`.
2. "renders at most 80 river items from the store": 85 valid zone-2 items → 80 `[name^="river-item-"]` groups and `data-river-item-count="80"`.
3. "zone switch swaps river items": render with zone 2 `[a, b]`. Then `act(() => useWorldStore.setState({ currentZoneId: 3, zoneItems: [] }))` → no `river-item-*`
   and the count is `"0"`. Then set zone 3 `[c]` → only `river-item-<c.id>`. Do this with `reducedMotion` false and true: in both, `r3f.flightStarts.length` is
   unchanged (a switch starts no camera flight) and `data-selected-target` is unchanged.
4. "zone switch reuses the one krathong asset set": over the switches of case 3, `assets.created === 1` and `assets.disposed === 0`. After `unmount()`,
   `assets.disposed === 1` (invariant E: disposed on unmount, never per zone).

### `tests/unit/world-zone-boundary.test.ts` (node)
Copy the `walk()` helper from `tests/unit/no-raw-xyz-persistence.test.ts`. Extract the import specifiers of a file with
`/\b(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g`.
1. "landing-path files import only the allowlist" (this keeps three out of the landing chunk; MFW-44):
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
   Every specifier must be in the file's list (a subset is fine). `src/config/world.config.ts` and `src/services/api/creationTypes.ts` must have only
   `import type` statements or none at all (assert that no line matches `/^import (?!type\b)/m`).
2. "FlowRoot never imports the world barrel or the 3D mapper": `src/components/ui/FlowRoot.tsx` does not match `/["']@\/core\/world["']|zoneRiverItems/`.
3. "no per-zone three resources": the non-test files `src/core/world/zone*.ts`, `src/core/world/growingWorldScaler.ts`, `src/services/api/zone*.ts`,
   `src/components/ui/ZoneNavigator.tsx` do not match `/new\s+\w*(Geometry|Material|Texture)\b/`.
4. "no console in zone code": the same files do not match `/\bconsole\./`.
5. "no token on the zone client path": `zoneClient.ts`, `zonePagination.ts` and `ZoneNavigator.tsx` do not match `/deviceOwnerToken|getDeviceOwnerVault|ownerToken|Authorization/`.
6. A self-check: the specifier regex extracts `["three"]` from `import { Vector3 } from "three";` (build this sample string from parts:
   `"import { V" + "ector3 } from \"th" + "ree\";"`, so the raw-xyz scanner, which does not scan `tests/unit`, is not confused either way).

### `tests/unit/zone-e2e-fixtures.test.ts`
1. `E2E_LANE_ID === LOY_KRATHONG_RIVER_LANES[0].laneId`.
2. `parsePersistableCoord(makeZoneItem(1, 0).coord).ok` is true, and `parseKrathongAppearance(E2E_APPEARANCE).ok` is true.
3. `publicCreationsToRiverItems(makeZoneBody(3, 85).items as PublicCreation[], { eventId: "loy_krathong", zoneId: 3 }).length === 80`.
4. `makeZoneBody(3, 85).items.map(i => i.id)` are unique and lowercase uuids.

### `tests/e2e/zones-api.spec.ts` (new; production build, no Supabase env)
```ts
test("GET /api/zones returns only the zone count", async ({ request }) => {
  const res = await request.get("/api/zones?event=loy_krathong");
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect(await res.json()).toEqual({ eventId: "loy_krathong", zoneCount: 1 });
  const bad = await request.get("/api/zones?event=nope");
  expect(bad.status()).toBe(400);
  expect(await bad.json()).toEqual({ error: "invalid_query", field: "event" });
});
```

### `tests/e2e/zone-pagination.spec.ts` (new)
Helper `routeZones(page, zoneCount, sizes: Record<number, number>)`. It uses `page.route((url) => url.pathname === "/api/zones", …)` to fulfil
`{ eventId: "loy_krathong", zoneCount }`, and `page.route((url) => url.pathname === "/api/creations", …)` to fulfil `makeZoneBody(zone, sizes[zone] ?? 0)`, where
`zone = Number(new URL(route.request().url()).searchParams.get("zone"))`. It pushes each requested zone (as a string) to `requested: string[]`. Walk the flow with the
existing buttons (Loy Krathong → ถัดไป → ถัดไป → ปล่อยกระทง).
1. **"FALLBACK_2D: only the visible zone is loaded; zones open along the river"**. Use the WebGL-blocking `addInitScript` from `scene-gating.spec.ts`
   (copy it), so no canvas renders and the test costs no GPU time. `routeZones(page, 3, { 2: 2, 3: 85 })`. At SHARED_WORLD_EXPLORE:
   - the navigator (`getByTestId("zone-navigator")`) has `data-zone-id="3"`, `data-zone-count="3"`, `data-zone-status="ready"` and `data-zone-item-count="80"`
     (AC1), and the text `"คุ้งน้ำที่ 3 จาก 3"`;
   - `requested` equals `["3"]` (AC3);
   - there is no "คุ้งน้ำถัดไป" button. Click "คุ้งน้ำก่อนหน้า" → `data-zone-id="2"`, item count `"2"`, `requested` = `["3", "2"]`;
   - click "คุ้งน้ำถัดไป" → zone 3 again, and `requested` = `["3", "2", "3"]`;
   - `page.locator("canvas")` has count 0.
2. **"3D tier: the visible zone's krathongs reach the scene"**. Force HIGH with the `deviceMemory` / `hardwareConcurrency` init script from
   `scene-gating.spec.ts`. `routeZones(page, 1, { 1: 3 })` → at SHARED_WORLD_EXPLORE, the viewport `[aria-label="Toy-like night river preview"]` has
   `data-river-item-count="3"` and `data-zone-id="1"`, there is one `canvas`, and `page.getByRole("button")` has count 0 (one zone: no navigation buttons).
   Assert right after the zone loads (see Risks: continuous rendering on SwiftShader).

Unchanged and must still pass: every MFW-12 / MFW-24 / MFW-27 test, `tests/e2e/flow.spec.ts` (no buttons at SHARED_WORLD_EXPLORE: the in-memory world has
1 zone), `tests/e2e/scene-gating.spec.ts` (the landing page ships no WebGL chunk), `tests/unit/no-raw-xyz-persistence.test.ts`,
`tests/unit/public-private-boundary.test.ts` and `tests/unit/structure.test.ts`.

Invariant coverage:
- **A:** coords are re-parsed before render (zoneRiverItems cases), and nothing new is persisted.
- **B:** the store items are the only input for 3D now and for 2D later (MFW-33), and positions still come from MFW-24's converters.
- **C:** the allowlist + private-key guard on the client, the directory with counts only, and the store JSON check.
- **E:** the cap is enforced at fetch, store and render level; the switch releases items; assets are created once and disposed only on unmount.
- **F:** zone switching has no animation (ZoneNavigator case 8, index case 3 under both motion settings), and the FALLBACK_2D e2e renders no canvas.
- **G:** not applicable (no write path).

## Do NOT

- Do not build `POST /api/creations`, zone counting for writes, the atomic assign + insert, collision re-checks or any call to `findNearestFreeSpot` (MFW-45).
  Do not call `assignZoneForNewCreation` from any route in this card.
- Do not edit `supabase/**` (no migration, no SQL function). Do not edit MFW-12's migration.
- Do not build the Find-My drawer, cross-zone camera flights or the highlight (MFW-30). Provide only `loadZone`. Do not build the release ritual or set the
  visible zone after a release (MFW-23). Do not build the 2D river renderer (MFW-33), inspect popup (MFW-28) or InstancedMesh batching (MFW-34).
- Do not change lanes, the environment, `RiverFlow`, `prepareRiverItems`, bobbing or `currentProgress`. Do not slice items inside `RiverFlow`
  (the cap lives in `publicCreationsToRiverItems`).
- Do not add polling, timers, realtime subscriptions, camera fly-to on zone switch, zone transitions, zone art or a minimap (Open questions 3–5).
- Do not import `@/core/world` (the barrel), `@/core/coordinates`, `three`, `@react-three/*`, `zoneQuery.ts`, `creationValidation.ts` or any repository module
  from landing-path files (Step 18 allowlist). Server code imports `@/core/world/zoneManager` by path.
- Never put a token, hash, device id or anything other than `event` / `zone` in a URL. The zone client sends no auth header. Never store private
  fields or wish text in river items. No `select('*')`, `select=*` or row spreading on the server. Never read a non-2xx Supabase body.
- No `console.*`. No new dependency, and no `package.json` / lockfile change (`zustand/vanilla` ships with zustand).
- Do not touch `.claude/**`, `scripts/**`, `.github/**`, `CLAUDE.md`, `AGENTS.md`, `docs/**` (including `open-questions.md`, `backlog*.json`, `prompts`, `plans`),
  `vitest.config.mts`, `playwright.config.ts`, `eslint.config.mjs`, `tsconfig.json`, `next.config.ts`, `src/services/auth/**`, `src/config/events/**` or `src/core/coordinates/**`.
- Do not change existing test cases, except the one world-store shape line in `stores.test.ts` (Step 13). Only add the cases listed.

## Definition of done

- Run each of these separately and get green: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm e2e`. In this cloud container run e2e as
  `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell pnpm e2e`, with no Supabase env vars in the shell.
- `pnpm build` lists `ƒ /api/zones` and `ƒ /api/creations` (dynamic).
- Every AC above has its listed tests.
- Delete `playwright-report/` and `test-results/` before committing. Never commit `.next/` or `*.tsbuildinfo`. Leave `AGENTS.md` as it is on `main`.
- Branch `feat/MFW-25-growing-river-world-zone-pagination` from the latest `main`, **after MFW-12 and MFW-24 are merged**.
- Conventional commit(s) with the key, e.g. `feat(world): zone manager, zone directory and visible-zone pagination MFW-25`.
- PR title = the commit subject. The English body contains:
  - a link to MFW-25;
  - the AC checklist with the proving test for each;
  - Decisions D1–D10;
  - the PLACEHOLDER constant (`WORLD_INITIAL_ZONE_POLICY`) and the Thai copy;
  - every difference from the ASSUMED INTERFACES;
  - the Open questions;
  - the test plan (the five commands and their results);
  - follow-ups: MFW-45 calls `assignZoneForNewCreation` with `hasFreeSpot` from `findNearestFreeSpot`, counts hidden rows and makes it atomic;
    MFW-23 calls `loadZone(response.zoneId)` after a release; MFW-30 uses `loadZone`; MFW-33 reads `useWorldStore.zoneItems`; MFW-34 instancing.
- Leave the PR open for reviewer + qa + **r3f-perf-reviewer** + **privacy-auditor**. The loop merges after the `ci` check is SUCCESS. This is not an owner-merge card.

## Interfaces this card provides

| Export | Path | Signature | Used by |
|---|---|---|---|
| `assignZoneForNewCreation`, `ZoneFill`, `isZoneFull` | `@/core/world/zoneManager` (import by path on the server) | `(fills: readonly { zoneId; itemCount; hasFreeSpot }[], cap = ZONE_ITEM_CAP) => number` | **MFW-45** POST (zone_id) |
| `zoneCountFromHighestZoneId`, `isClientZoneId`, `pickInitialZoneId` | `@/core/world/zoneManager` | see Step 3 | directory route, pagination |
| `describeGrowingWorld`, `GrowingWorldView` | `@/core/world/growingWorldScaler` | `(zoneCount \| null, visibleZoneId \| null) => { zoneCount; visibleZoneId; upstreamZoneId; downstreamZoneId } \| null` | MFW-33 (2D zone UI), Christmas tiers |
| `publicCreationsToRiverItems`, `ZoneRiverItem` | `@/core/world` | `(creations: readonly PublicCreation[], { eventId, zoneId }) => readonly ZoneRiverItem[]` (≤ 80, validated) | MFW-33 2D river, MFW-30 |
| `GET /api/zones?event=` | `src/app/api/zones/route.ts` | 200 `{ eventId, zoneCount }` · 400 `{ error: "invalid_query", field: "event" }` · 503 `{ error: "unavailable" }` · `no-store` | client |
| `CreationRepository.highestVisibleZoneId` | `@/services/api/creationRepository` | `(eventId) => Promise<number \| null>` | directory; MFW-45 may reuse it |
| `handleZoneDirectory`, `parseZoneDirectoryQuery` | `@/services/api/zoneDirectory` | see Step 10 | route |
| `ZoneDirectoryResponse` | `@/services/api` | `{ eventId; zoneCount }` | client |
| `CREATIONS_API_PATH`, `ZONES_API_PATH`, `ZONE_API_QUERY_PARAMS` | `@/services/api/apiPaths` (+ barrel) | constants | all API clients (MFW-23 / MFW-45 client POST uses `CREATIONS_API_PATH`) |
| `fetchZoneItems`, `fetchZoneDirectory`, `toClientPublicCreation`, `build*Url` | `@/services/api/zoneClient` | see Step 12 | pagination; MFW-30 |
| `createZonePagination`, `getZonePagination`, **`loadZone`**, `ZoneLoadOutcome` | `@/services/api/zonePagination` | `loadZone(zoneId) => Promise<"loaded" \| "failed" \| "superseded" \| "invalid">` | **MFW-30** (spec §6.7 "await loadZone(zoneId)"), MFW-23 (after release) |
| `useWorldStore` fields `eventId`, `currentZoneId`, `zoneCount`, `zoneStatus`, `zoneItems`; `INITIAL_WORLD_STATE`, `NO_ZONE_ITEMS`, `ZoneLoadStatus` | `@/store/useWorldStore` | Step 13 | MFW-28 (inspect wish from `zoneItems`), MFW-30, MFW-33 |
| `ZoneNavigator`, `ZONE_NAV_COPY` | `@/components/ui/ZoneNavigator` | `({ pagination? }) => JSX.Element \| null` | FlowRoot; MFW-30 drawer may sit next to it |
| `INITIAL_ZONE_POLICIES`, `InitialZonePolicy`, `WORLD_INITIAL_ZONE_POLICY` | `@/config/world.config` | `"NEWEST" \| "FIRST"` | owner tuning |
| `SceneViewport` reads the visible zone from the store; `riverItems` prop = override; `data-zone-id`, `data-river-item-count` | `@/components/canvas3d` | Step 18 | MFW-23, e2e of later cards |

## Open questions

Product decisions only. This card ships the default under each question, and the owner can change it later without rework.

1. **Which zone does a visitor see first in the shared world?** Options: (a) the newest (most downstream) zone, the "front" of the growing river
   (planned default, `WORLD_INITIAL_ZONE_POLICY = "NEWEST"`); (b) Zone 1; (c) after a release, the zone of the user's own krathong (MFW-23 can call
   `loadZone(zoneId)` from the POST response; recommended on top of (a) or (b)).
2. **Zone navigation UI and copy.** Default: a small DOM bar under the scene with "‹ คุ้งน้ำก่อนหน้า", "คุ้งน้ำที่ n จาก N" and "คุ้งน้ำถัดไป ›",
   with a button only when that neighbour exists, plus "โหลดคุ้งน้ำไม่สำเร็จ" / "ลองอีกครั้ง" on error. Options: other wording; arrows over the canvas;
   swipe at the river's edge; hide "จาก N".
3. **How does a zone switch look?** Default: an instant swap (the new bend's krathongs replace the old ones in the same scene). Options: a camera pan
   or slide downstream/upstream (an instant cut under reduced motion, invariant F); a fade; a short "คุ้งน้ำที่ n" title card.
4. **Should the world update live?** Default: no polling. The directory refreshes on every zone switch, and the zone's items load once per visit. Options: poll
   the visible zone every N seconds (owner gives N; this affects Supabase cost); realtime later; a manual refresh button.
5. **Should zones look different?** Default: every zone reuses the same river bend (MFW-27 environment, MFW-24 lane). Options: per-zone variations
   (mirrored bends, different props or lamp colours, a zone sign on the bank); an overview "river map" of all zones.
6. **Should the shared zone's krathongs also show during RITUAL_RELEASE** (releasing next to others)? Default: no. Zone data loads only in
   SHARED_WORLD_EXPLORE.

## Decisions

- **D1 — A server zone directory (`GET /api/zones`) instead of client-side probing.** Probing ("next zone exists when this one returns 80") breaks when moderation
  hides items, cannot find the newest zone without loading every zone, and loads zones that are not visible (AC3). One count query on the existing view needs
  no SQL change, so `supabase/**` stays untouched.
- **D2 — `zoneCount` = the highest zone id with a visible creation (at least 1).** Zones are numbered 1..N without holes, because assignment fills gaps first. Counting
  only visible rows keeps the directory on the same moderated view as every other public read (owner decision 3).
- **D3 — The assignment rule is "first zone below the cap with a free spot, else max + 1"; a missing id counts as empty.** This is the 2.4 AC wording plus owner
  decision 25 ("full at 80 OR no free spot"). The function is pure, so MFW-45 can mirror it in SQL if it makes the step atomic, and tests can pin both.
- **D4 — A zone switch clears the store's items first; nothing in 3D is per zone.** All zones share one bend, one lane set and one krathong asset set, so a
  switch only unmounts item groups. Invariant E's "dispose on zone switch" is met by creating nothing per zone, and tests prove it (one asset set, disposed only on unmount).
- **D5 — The cap is enforced on the client too (fetch, store, render).** A misbehaving server or a stale deploy can never push more than 80 krathongs into the
  phone's scene (invariant E). The server cap from MFW-12 stays as it is.
- **D6 — Navigation buttons render only when the neighbour exists.** An empty or one-zone world shows no buttons, which keeps the existing "no buttons at
  SHARED_WORLD_EXPLORE" tests true and the UI minimal.
- **D7 — Client fetch is dependency-free (an allowlist and a private-key guard, but no coord parsing); deep validation happens in the 3D chunk.** The
  coord validator imports `three`, and the landing page must ship no WebGL code (MFW-44). Coords are still re-parsed before anything renders (invariant A),
  and the store never holds private keys (invariant C).
- **D8 — `useWorldStore` stays data-only, and `zonePagination` is its only writer.** That matches the existing world store and makes race handling
  (generation counter + `AbortController`) testable without React. The `stores.test.ts` shape line is updated because the spec §3 store now holds the
  zone state. That is a deliberate contract change, not a weakened test.
- **D9 — Zone ids increase downstream.** This follows the spec's "ต่อเนื่องไปตามลำน้ำ" and the flow direction of MFW-24 (progress 0 = upstream). Zone 1 is the oldest bend upstream.
- **D10 — `apiPaths.ts` is the single source of the API paths and query names.** The client cannot import `zoneQuery.ts`, because that pulls in three and auth.
  `zoneQuery.ts` re-exports the same object, and a test asserts identity.

## Out of scope

POST/create and the server's zone assignment, collision re-check and atomicity (MFW-45). The release flow and showing the user's own zone after release (MFW-23).
Find My, cross-zone flights and the highlight (MFW-30). The 2D renderer (MFW-33). Inspect popup and wish reading (MFW-28). Instancing (MFW-34). Live updates, zone
transitions, per-zone art, a minimap, participant counts (`participantCount` stays `null`). Any `supabase/**` change. Christmas.

## Risks

- **Race at the last slot (MFW-45).** Two concurrent releases can both see 79 items and both write to the same zone (81). The GET cap then hides the
  newest one. MFW-45 must make the read + insert atomic (an advisory lock or a SQL function in a new migration; owner-merge there), and count hidden rows (Step 3 TSDoc).
- **Directory and moderation.** If every item of the highest zone is hidden, the directory reports one zone fewer until a new item lands there. That is harmless:
  new items still go to the first non-full zone.
- **Two extra requests per switch** (zone + directory). Both are small, `no-store` and anonymous. The abuse posture of the public GETs is MFW-12 Open question 4.
- **SwiftShader e2e with live krathongs.** `RiverFlow` renders continuously while items exist. The 3D e2e uses only 3 items and asserts immediately. The
  80-item check runs in FALLBACK_2D. If the FPS meter drops the tier mid-test, report it; do not raise thresholds.
- **Draw calls.** A full zone is 80 × about 20 meshes (MFW-24 risk). This card only enforces the cap. Batching is MFW-34. Flag it to r3f-perf-reviewer as deliberate.
- **ASSUMED INTERFACES.** MFW-12 and MFW-24 (being revised) may land with different names (`listPublicZone`, the `send` helper, `RiverFlowItem`, the `riverItems` prop default,
  `getLoyKrathongRiverLanes`). Adapt to `main` and list every difference in the PR.
- **Reviewer grep noise.** The private-key guard regex (`owner_?token|private_?wish`) and the negative tests contain the private field names. They are guards
  and absence assertions, not data paths.
