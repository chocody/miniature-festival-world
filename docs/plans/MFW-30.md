# MFW-30 [7.1] My Creations drawer & real-time position tracker — implementation spec

> Hand-off spec for one card. It is the source of truth for the implementer and the reviewer. If this file and
> `docs/backlog.json` / `docs/spec/open-questions.md` disagree, those files win, and the PR must say so.
> Branch: `feat/MFW-30-my-creations-drawer-real-time` · Jira: MFW-30 · Epic: MFW-29 (Loop 7 — Find My Krathong & Cross-Zone Tracking)
> Labels: `loy-krathong`, `tracking`. Extra reviewers: **privacy-auditor** (the diff touches `src/services/**` and stores ownership-adjacent data in
> LocalStorage) and **r3f-perf-reviewer** (the diff touches `src/components/canvas3d/**` and `src/core/world/**`). The labels are not `privacy`/`db`
> and the card touches no `supabase/**`, so it is **not** an owner-merge card. A FIX FIRST from either auditor still blocks the merge.

## Summary (Goal)

"ค้นหาของฉัน" finds your moving krathong anywhere on the river (spec §6.7 Task 7.1: "สร้างปุ่ม “ค้นหาของฉัน” ที่แสดงรายการกระทงที่ผู้ใช้เคยสร้างไว้ในอุปกรณ์นี้").
This card adds:
1. A **device list of the user's creations** in LocalStorage, next to the DeviceOwnerToken (owner decision 12). Each successful release (MFW-23) records the
   creation's id, event, zone and timestamps. The list holds no coordinates, no wish text and no token.
2. A **"ค้นหาของฉัน" drawer** in `SHARED_WORLD_EXPLORE` that lists those creations (newest first).
3. A **Find My orchestrator**: selecting an entry runs `await loadZone(zoneId)` (MFW-25) when the krathong is in another zone (or not in the loaded items), then
   marks it as the focused creation in `useWorldStore`.
4. **3D tracking**: the scene computes the krathong's current position from its `SplinePathCoord` (same deterministic formula as the river, invariant B), flies
   the camera there (instant cut under reduced motion) and shows a highlight ring that follows the drifting krathong every frame.
5. The **MFW-25 follow-up fix**: pinning a Find My target no longer reshuffles the tier-visible river subset. At most one unpinned pick changes per pin.

FALLBACK_2D gets the minimal behaviour: the drawer works, the zone loads, and a Thai status line says where the krathong is. The 2D river view that scrolls to it
is MFW-33, which reads the focus fields this card provides.

## Prerequisites

Merged on `main` (`66bbc69`, 2026-11-25). Read real code with `git fetch --depth=50 origin main` and `git show origin/main:<path>`.

| Card | What this card uses (real names on `main`) |
|---|---|
| MFW-7 [1.1] | `useUIStore` (`flowState`, `selectedEventId`), flow state `"SHARED_WORLD_EXPLORE"`, `FESTIVAL_EVENT_IDS` / `FestivalEventId` (`@/config/events/types`) |
| MFW-9 [1.3] | `useDeviceStore` (`profiled`, `qualityTier`, `reducedMotion`, `setQualityTier`) |
| MFW-11 [2.1] | `getBrowserLocalStorage()` (`src/services/auth/deviceOwnerToken.ts`), `DEVICE_OWNER_TOKEN_STORAGE_KEY = "mfw:deviceOwnerToken:v1"` (`@/config/ownership.config`). The test class `MemoryStorage` pattern from `deviceOwnerToken.test.ts` |
| MFW-12 [2.2] | `PublicCreation`, `PUBLIC_CREATION_KEYS` (`@/services/api/creationTypes`), `ZONE_ID_MIN`, `ZONE_ITEM_CAP` (`@/config/world.config`), `UUID_PATTERN` (`@/config/database.config`, used **only in a test**) |
| MFW-17 [3.3] | `createCameraController(api, reducedMotion).flyTo(target)`, `getCameraFlightPose`, `updateHighlightPosition`, `CameraTargetKind = "water" \| "krathong" \| "lamp"` (`@/core/camera`); `HIGHLIGHT_RING_SIZES`, `HIGHLIGHT_RING_*`, `CAMERA_FLIGHT_OFFSET` (`@/config/camera.config`); the internal `CameraFlightController` and `TargetHighlight` in `src/components/canvas3d/index.tsx` |
| MFW-24 [5.2] | `getRiverItemPositionAt(item, lanes, nowMs)` → `{ laneId, progress, world, yawRad } \| null`, `prepareRiverItems`, `PreparedRiverItem`, `getLoyKrathongRiverLanes()` (`@/core/world`); `splineCoordToPoseInto`, `createSplinePoseOut`, `SplinePoseOut`, `RiverLaneSet` (`@/core/coordinates`). `splineCoordToPoseInto` is documented as bit-identical to `splineProgressToWorld(...).position` |
| MFW-25 [5.3] | `useWorldStore` fields `eventId`, `currentZoneId`, `zoneStatus`, `zoneItems`, `focusedCreationId`; `INITIAL_WORLD_STATE`, `NO_ZONE_ITEMS`. `getZonePagination()` / `loadZone(zoneId)` → `Promise<"loaded" \| "failed" \| "superseded" \| "invalid">`, `WorldStoreLike` (`@/services/api/zonePagination`). **`loadZone` and `enterWorld` set `focusedCreationId: null`** at the start of every load. `isClientZoneId` (`@/core/world/zoneManager`, three-free). `selectVisibleRiverItems`, `riverPhaseOf`, `NO_PINNED_RIVER_IDS` (`src/core/world/riverVisibility.ts`). `SceneViewport` already pins `focusedCreationId` (`pinnedRiverIds`) and reads `visibleRiverItems = riverItems ?? storeRiverItems`. `ZoneNavigator`, `ZONE_NAV_COPY`. e2e fixtures `makeZoneItem`, `makeZoneBody`, `E2E_EVENT_ID` (`tests/e2e/fixtures/zoneFixtures.ts`) |
| MFW-28 [6.2] | `SceneViewport` selection state (`selectedTarget`, `flyRequestId`, `selectionMode` reset), `InspectPopup`. The MFW-28 test "river krathong tap opens the inspect popup" asserts that **no `data-*` attribute of the viewport contains a creation id** |

**Must be merged before you start (stop and report `needs-human` if it is not on `main`): MFW-23 [5.1]** (a backlog blocker of 7.1). It is in review now.
Every name below from it is an **ASSUMED INTERFACE (from MFW-23 plan)** (`docs/plans/MFW-23.md`). Before coding, `rg` each name on `main`. If a merged name or shape
differs, use the merged one, change only the adapter line in this card, and list every difference in the PR.

- **ASSUMED INTERFACE (from MFW-23 plan):** `getReleaseCreation(): ReleaseCreation` in `@/services/api/releaseCreation`, with
  `onCreationSaved(listener: (creation: PublicCreation) => void): () => void` (returns an unsubscribe). The listener is called once per successful save with
  the **server's** `PublicCreation` (final coord, server `createdAt`, assigned `zoneId`). A throwing listener is swallowed by the caller.
- **ASSUMED INTERFACE (from MFW-23 plan):** after a save, MFW-23 calls `loadZone(c.zoneId)` only when `useWorldStore.currentZoneId !== c.zoneId`. When the
  user's zone was already visible, the new krathong is **not** in `zoneItems` (MFW-23 draws it with `OwnKrathong` from `useUIStore.ritual.saved`). Step 6
  handles this.
- **ASSUMED INTERFACE (from MFW-23 plan):** `SceneViewport` builds `riverNow = () => Date.now() + (ritual.saved?.serverClockOffsetMs ?? 0)` and passes it to
  `ToyNightScene` as the prop `riverNow`, which hands it to `RiverFlow` and `OwnKrathong` as `now`. `excludeOwnAndCap(visibleRiverItems, …)` removes the own
  creation from the items `RiverFlow` draws while `OwnKrathong` shows it. `CameraFlightController` stays mounted with `cameraTargetRef = activeTargetRef ??
  pierFocusRef`.
- **ASSUMED INTERFACE (from MFW-23 plan):** `FlowRoot` imports `getReleaseCreation`, enters the world from `RITUAL_RELEASE`, and renders
  `{flowState === "SHARED_WORLD_EXPLORE" && <ZoneNavigator />}`. `tests/unit/landing-import-graph.test.ts` walks the static import graph of `src/app/page.tsx`
  and fails on `three`, `@react-three/*` or `@react-spring/*`. e2e fixture `mockCreateCreation(page, { zoneId })` and `E2E_CREATION_ID =
  "0f8b6c1e-3a2d-4c5b-9e7f-1a2b3c4d5e6f"` in `tests/e2e/fixtures/ritualRoutes.ts`; helper `completeWishStep(page)` in `tests/e2e/helpers/wishStep.ts`.

**MFW-34 [8.2]** (instancing) is being built in parallel. It changes `RiverFlow` into a batch but keeps the `river-item-<id>` anchor groups, `pinnedIds`,
`selectVisibleRiverItems` and the public props. It also edits `SceneViewport` (`visibleRiverItems` gets a perf-soak override). This card does **not** touch
`RiverFlow.tsx`, so the only overlap is a few lines in `src/components/canvas3d/index.tsx`. If MFW-34 lands first, rebase and keep its lines.

Facts checked on `main` (`66bbc69`):
- `src/core/coordinates/SplinePathCoord.ts` and `validateCoord.ts` import `three` (via `SplinePathCoord.ts`). The `@/core/world` barrel pulls in `three`.
  **Landing-path files must not import `@/core/coordinates`, `@/core/world` (barrel) or any of those files.** `src/core/world/zoneManager.ts` and
  `growingWorldScaler.ts` are three-free and may be imported **by path**.
- `tests/unit/world-zone-boundary.test.ts` checks `src/services/api/zone*.ts` and `src/core/world/zone*.ts` files. Do not name new files `zone*`.
- `tests/unit/owner-token-boundary.test.ts`: the literal `mfw:deviceOwnerToken` may appear only in `src/config/ownership.config.ts`.
- `tests/unit/public-private-boundary.test.ts`: no `console.` in `src/services/api` / `src/config`; the snake names `owner_token`, `owner_token_hash`,
  `private_wish_text` may appear in non-test files only under `src/services/auth/`, `ownership.config.ts` and `supabaseCreationRepository.ts`. Keep them out of
  every new non-test file anyway.
- `tests/unit/scene-art-constants.test.ts`: no hex colour and **no decimal literal** (`\d+\.\d+`) in `src/components/canvas3d/**` / `src/components/models/**`
  non-test files, comments included. Write card ids as `MFW-30`, never "7.1".
- `src/store/stores.test.ts` asserts the exact `useWorldStore` initial state with `toEqual` (line 39–41). This card updates that expectation.
- `tests/unit/structure.test.ts` lists required files. Spec §3 names `src/components/ui/MyCreationsDrawer.tsx`; add it to that list.
- The R3F test stub in `src/components/canvas3d/index.test.tsx` renders scene elements as DOM elements (array props become attribute strings such as
  `position="1,2,3"`), makes `useFrame` a no-op, and stubs `HTMLUnknownElement.prototype.getWorldPosition` to return `(0, 0, 0)`.
- **LESSON (MFW-28 QA):** never put a dashed `data-*` prop on an R3F/three element. It crashed the canvas. Only the DOM `<section>` gets `data-*`.
- No Next.js API is used by this card (no route, no server component). If you add one anyway, read `node_modules/next/dist/docs/` first.

## Acceptance criteria → checks

AC text is verbatim from `docs/backlog.json`, story 7.1.

1. **"Drawer lists krathongs created on this device (via DeviceOwnerToken)"**
   - Recording: every successful save (MFW-23 `onCreationSaved`, which fires only after a POST that carried this device's DeviceOwnerToken) adds one entry
     to the device list in LocalStorage under `MY_CREATIONS_STORAGE_KEY = "mfw:myCreations:v1"`, next to the token (owner decision 12). Tests:
     `src/services/auth/myCreationsVault.test.ts` → "installMyCreationsRecorder records each saved creation", and `src/components/ui/FlowRoot.test.tsx` →
     "a saved release is recorded in the device's creation list".
   - Stored shape: exactly the keys `id, eventId, zoneId, createdAt, expiresAt`. It has no coord, no wish text, no appearance, no token and no hash, even when
     the source object carries extra fields. Tests: `myCreationsVault.test.ts` → "stores only the five allowlisted keys"; `FlowRoot.test.tsx` (same case) →
     the raw storage string does not contain the device token value, `wish`, `ownerToken` or `coord`; e2e `tests/e2e/find-my.spec.ts` → "the release is
     recorded on this device only".
   - Listing: the drawer shows this device's entries for the current event, newest first, with ordinal, zone and release time. Tests:
     `src/components/ui/MyCreationsDrawer.test.tsx` → "lists entries newest first", "shows the empty state", "re-reads the list when opened", "updates when a
     creation is recorded".
   - Robustness: corrupted or tampered storage, extra keys, bad ids/dates, expired entries, missing LocalStorage, and write failures. Tests in
     `myCreationsVault.test.ts` (cases listed in Tests).
   - The list never needs the token for public data: the drawer, the vault and the Find My service never read the token. Test:
     `tests/unit/find-my-boundary.test.ts` → "never touches the owner token".
2. **"Selecting one: await loadZone(zoneId) if in another zone → compute current position from SplinePathCoord → flyTo + highlight that follows it"**
   - `await loadZone(zoneId)` only when needed: `src/services/api/findMyCreation.test.ts` → "another zone: awaits loadZone once, then focuses", "same zone
     with the item: no load", "same zone without the item: reloads once".
   - Focus hand-off: after the load, `focusedCreationId = id` and `focusRequestId` is incremented. Test: same file → "focus fields after a find".
   - Compute the current position from the coord: `writeFindMyAnchorPosition` writes exactly `getRiverItemPositionAt(item, lanes, now).world`, and the anchor
     moves over time. Test: `src/core/world/findMyFocus.test.ts` → "matches getRiverItemPositionAt bit for bit", "follows the drift".
   - flyTo: a new focus request in `WORLD_EXPLORE` flies the camera once to the anchor's world position (`getCameraFlightPose`). Tests:
     `src/components/canvas3d/index.test.tsx` → "a focus request flies to the krathong's current position", "selecting the same krathong again flies again".
   - Reduced motion: the flight is an instant cut. Test: `index.test.tsx` → "reduced motion: the Find My flight is an instant cut" (`immediate: true`); the
     normal branch asserts `immediate: false`.
   - Highlight that follows: `data-selected-target="riverKrathong"`, the ring uses `HIGHLIGHT_RING_SIZES.riverKrathong`, and the anchor is updated every frame
     from the coord. Tests: `index.test.tsx` → "the highlight targets the focused krathong"; `findMyFocus.test.ts` → "follows the drift".
   - A tier-hidden krathong is pinned into the rendered set, and pinning keeps the other picks stable (MFW-25 follow-up). Tests:
     `src/core/world/riverVisibility.test.ts` → "pinning one hidden item changes exactly one unpinned pick", "two pins change at most two picks", "a pin that
     is already shown changes nothing", "spread stays bounded with a pin"; `index.test.tsx` → "a tier-hidden focus is pinned and followed".
3. **"Works when the krathong is in a different zone from the current view"**
   - Unit: `findMyCreation.test.ts` → "another zone: awaits loadZone once, then focuses", "a zone switch during the load supersedes", "a newer find supersedes
     an older one".
   - E2E (3D, HIGH): release into zone 2, move to zone 3, open "ค้นหาของฉัน", select the entry → the browser requests zone 2, the navigator shows zone 2 and
     the viewport has `data-selected-target="riverKrathong"` and `data-find-my="following"`. Test: `tests/e2e/find-my.spec.ts` → "3D: finds my krathong in
     another zone".
   - E2E (FALLBACK_2D): same flow → zone 2 loads, the status line says "พบกระทงของคุณที่คุ้งน้ำที่ 2", and no canvas exists. Test: `find-my.spec.ts` →
     "FALLBACK_2D: finds my krathong in another zone".

Invariant checks (CLAUDE.md):

| Invariant | Check |
|---|---|
| A | The device list stores no coordinate at all (Decision D1). The 3D position is derived each frame from the stored `SplinePathCoord` and is never written to a store, LocalStorage or a request. `tests/unit/no-raw-xyz-persistence.test.ts` stays green (no `three`/`Vector3`/`.toArray()` in `src/services/**`). `myCreationsVault.test.ts` → "stores only the five allowlisted keys" |
| B | The anchor uses the same `SplinePathCoord`, lane and clock as the river (`splineCoordToPoseInto`, bit-identical to `getRiverItemPositionAt`): `findMyFocus.test.ts`. MFW-33's 2D view reads the same `focusedCreationId` and coord (Interfaces). No converter is added, so no new round-trip test is needed |
| C | The list holds public fields only. The drawer and Find My never read the token, and no `data-*` carries the id: `find-my-boundary.test.ts`, `myCreationsVault.test.ts`, the unchanged MFW-28 case in `index.test.tsx` |
| E | No new effect objects and no per-frame allocation (one shared `SplinePoseOut` scratch). The ring reuses `TargetHighlight` (one geometry per selection, disposed by R3F on unmount). Pinning changes at most one rendered item: `riverVisibility.test.ts` |
| F | The camera flight honours `reducedMotion` (instant cut): `index.test.tsx`. The drawer has no animation: `MyCreationsDrawer.test.tsx` → "has no animation classes". FALLBACK_2D works without a canvas: e2e |
| MFW-44 | Landing files stay three-free: `find-my-boundary.test.ts` (import allowlist) and the MFW-23 `landing-import-graph.test.ts` (extended to assert the walk reaches `MyCreationsDrawer.tsx`) |

## Owner decisions that apply

Quoted from `docs/spec/open-questions.md` and CLAUDE.md. Do not reopen them.

- **Row 12:** "creation ids are kept in LocalStorage next to the token (no server query by owner); private text is still read only with ownership proof
  (row 1) (owner, 2026-11-23)". → The list lives in LocalStorage under the `mfw:` prefix (MFW-11 config). There is no server endpoint that lists by owner. The
  drawer shows no private text (MFW-31 adds the owner's private view).
- **Row 1:** the raw token travels only to the ownership endpoints in a POST body or the Authorization header. → This card sends the token nowhere and reads
  it nowhere.
- **Row 4:** "80 items per zone". **Row 6:** `speedFactor` is progress per **second**, `createdAt`/`now` are epoch ms.
- **Row 10:** "expires_at = 30 days after the festival ends; then public and private rows are deleted". → Expired entries are hidden and pruned from the
  device list (Decision D5).
- **Row 23:** "krathongs keep drifting; only the bobbing stops" (reduced motion). → The highlight keeps following under reduced motion; only the flight
  becomes an instant cut.
- **Row 25:** every krathong drifts at the same speed. → The tier-visible subset is time-invariant (MFW-25 D11), which the stable-pin fix keeps.
- **Launch plan / Row 16:** Loy Krathong only, engine pieces generic. → The vault, the Find My service and the drawer are event-agnostic. The 3D anchor is
  river-specific (Christmas will add a cylindrical anchor later).
- **MFW-27 Open question (pan):** the pan/rotate gesture model is still an owner decision. → This card does not rotate or pan the world (Decision D10).

Row 12 already names MFW-30 in "Decide in" and is decided. No technical row of `open-questions.md` needs a "Decided in MFW-30" note. **Do not edit
`docs/spec/open-questions.md`.**

## Files

| Path | New/modify | Purpose |
|---|---|---|
| `src/config/ownership.config.ts` | modify | Add `MY_CREATIONS_STORAGE_KEY` |
| `src/config/myCreations.config.ts` | new | Entry keys, id pattern, max entries, time format, Thai copy (no imports) |
| `src/config/myCreations.config.test.ts` | new | Config sanity (id pattern = `UUID_PATTERN`, key prefix, copy) |
| `src/config/camera.config.ts` | modify | `HIGHLIGHT_RING_SIZES.riverKrathong` |
| `src/config/camera.config.test.ts` | new | Ring clears the river krathong footprint |
| `src/core/camera/index.ts` | modify | `CameraTargetKind` gains `"riverKrathong"` |
| `src/core/world/riverVisibility.ts` | modify | Stable pinned selection (MFW-25 follow-up) |
| `src/core/world/riverVisibility.test.ts` | modify | Add four cases; existing cases unchanged |
| `src/core/world/findMyFocus.ts` | new | `findFocusedRiverItem`, `writeFindMyAnchorPosition` |
| `src/core/world/findMyFocus.test.ts` | new | Pure tests |
| `src/core/world/index.ts` | modify | `export * from "./findMyFocus";` |
| `src/store/useWorldStore.ts` | modify | Add `focusRequestId: number` |
| `src/store/stores.test.ts` | modify | Update the world-state `toEqual` only |
| `src/services/auth/myCreationsVault.ts` | new | Device creation list (LocalStorage + memory fallback) and the recorder |
| `src/services/auth/myCreationsVault.test.ts` | new | jsdom tests |
| `src/services/auth/myCreationsVault.node.test.ts` | new | Server guard (node environment) |
| `src/services/api/findMyCreation.ts` | new | Find My orchestrator (three-free) |
| `src/services/api/findMyCreation.test.ts` | new | Orchestrator tests |
| `src/components/canvas3d/sceneObjectNames.ts` | modify | Add `findMyAnchor` |
| `src/components/canvas3d/FindMyAnchor.tsx` | new | Anchor group that follows the focused krathong |
| `src/components/canvas3d/index.tsx` | modify | Focus request → selection, anchor, flight, ring, `data-find-my` |
| `src/components/canvas3d/index.test.tsx` | modify | Add `describe("Find My (MFW-30)")` |
| `src/components/ui/MyCreationsDrawer.tsx` | new | "ค้นหาของฉัน" button, list, status line |
| `src/components/ui/MyCreationsDrawer.test.tsx` | new | Drawer tests |
| `src/components/ui/FlowRoot.tsx` | modify | Install the recorder; render the drawer in `SHARED_WORLD_EXPLORE` |
| `src/components/ui/FlowRoot.test.tsx` | modify | Add two cases; adjust "no buttons in the world" assertions (Step 14) |
| `tests/unit/find-my-boundary.test.ts` | new | Import allowlist, no token, no console, no `localStorage` literal |
| `tests/unit/landing-import-graph.test.ts` | modify | One extra `seen.has(...MyCreationsDrawer.tsx)` assertion |
| `tests/unit/structure.test.ts` | modify | Add `src/components/ui/MyCreationsDrawer.tsx` to `FILES` |
| `tests/e2e/fixtures/findMyFixtures.ts` | new | Storage key literal + own zone item builder (no `src/` imports) |
| `tests/unit/find-my-e2e-fixtures.test.ts` | new | The fixtures match the real constants and validators |
| `tests/e2e/find-my.spec.ts` | new | User flows (3D, FALLBACK_2D, not found, 360 px, storage privacy) |
| `tests/e2e/flow.spec.ts`, `tests/e2e/zone-pagination.spec.ts` | modify | "zero buttons in the world" → "only the ค้นหาของฉัน button" (Step 14) |
| `docs/follow-ups.md` | modify | Delete the one MFW-25 row "Pinning a Find My target reshuffles …" (fixed here) |

## Implementation steps (Plan)

Conventions for every file:
- TypeScript strict, English comments, no `any`, no `console.*` in non-test files, no new dependency, no `package.json` / lockfile change.
- Every number lives in a named constant (`0`, `1` and array indices excepted). `Object.freeze` exported constant arrays and objects.
- Error messages and outcomes carry codes only, never input values.
- In `src/components/canvas3d/**` (non-test): no decimal literal and no hex colour, comments included.
- **Landing-path files** (`myCreations.config.ts`, `myCreationsVault.ts`, `findMyCreation.ts`, `MyCreationsDrawer.tsx`, and `FlowRoot.tsx`) import only what
  `tests/unit/find-my-boundary.test.ts` allows (Step 16). They never import `three`, `@react-three/*`, `@react-spring/*`, `@/core/world` (the barrel),
  `@/core/coordinates` or `@/config/database.config`.
- In those four new files, do not even *mention* `getDeviceOwnerVault`, `DEVICE_OWNER_TOKEN_STORAGE_KEY`, `ownerToken`, `Authorization`, `localStorage` or
  `console` in comments: the boundary test greps the raw text.

### Step 1 — `src/config/ownership.config.ts` (modify: append)

```ts
/**
 * LocalStorage key of this device's creation list (owner decision 12: "creation ids are kept in LocalStorage next to the token").
 * Public fields only: id, eventId, zoneId, createdAt, expiresAt. Versioned like the token key.
 */
export const MY_CREATIONS_STORAGE_KEY = "mfw:myCreations:v1";
```
Keep every existing line unchanged.

### Step 2 — `src/config/myCreations.config.ts` (new; **no imports**)

```ts
/** Keys of one stored device-list entry, in this order (MFW-30). Exactly these keys; anything else is rejected on read. */
export const MY_CREATION_ENTRY_KEYS = Object.freeze(["id", "eventId", "zoneId", "createdAt", "expiresAt"] as const);
export type MyCreationEntryKey = (typeof MY_CREATION_ENTRY_KEYS)[number];

/** Lowercase uuid, same as UUID_PATTERN in database.config.ts (checked by myCreations.config.test.ts; not imported to keep server config off the client). */
export const MY_CREATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Most entries kept per device; the oldest are dropped first. PLACEHOLDER (spec silent; MFW-30 Open question 3).
 * Bounds LocalStorage use while POST /api/creations has no per-device cap (docs/follow-ups.md, MFW-45).
 */
export const MY_CREATIONS_MAX_ENTRIES = 50;

/** Release time shown in the list: device-local time, Thai locale. Lead UI choice. */
export const MY_CREATIONS_TIME_LOCALE = "th-TH";
export const MY_CREATIONS_TIME_FORMAT: Readonly<Intl.DateTimeFormatOptions> = Object.freeze({
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** Drawer copy. Spec gives only "ค้นหาของฉัน"; the rest is DRAFT Thai, PLACEHOLDER (MFW-30 Open question 5). */
export const MY_CREATIONS_COPY = Object.freeze({
  openButton: "ค้นหาของฉัน",
  title: "กระทงของฉัน",
  deviceOnly: "รายการนี้เก็บไว้ในเครื่องนี้เท่านั้น",
  empty: "ยังไม่มีกระทงที่ปล่อยจากเครื่องนี้",
  itemLabel: (ordinal: number, zoneId: number, releasedAt: string) =>
    `กระทงที่ ${ordinal} · คุ้งน้ำที่ ${zoneId} · ปล่อยเมื่อ ${releasedAt}`,
  close: "ปิด",
  searching: "กำลังค้นหากระทงของคุณ…",
  found: (zoneId: number) => `พบกระทงของคุณที่คุ้งน้ำที่ ${zoneId}`,
  notFound: "ไม่พบกระทงนี้บนสายน้ำแล้ว",
  failed: "ค้นหาไม่สำเร็จ ลองอีกครั้ง",
});
```

### Step 3 — `src/config/camera.config.ts` and `src/core/camera/index.ts` (modify)

`camera.config.ts`: add one entry to `HIGHLIGHT_RING_SIZES` (keep the three existing entries unchanged):
```ts
  /** Find My ring around a river krathong (MFW-30). Lead design: inner radius clears RIVER_COLLISION_RADIUS (≈0.286), about 5 px wide at zoom 52. Tune on device. */
  riverKrathong: Object.freeze({ innerRadius: 0.34, outerRadius: 0.44, heightOffset: 0.04 }),
```
`src/core/camera/index.ts`: `export type CameraTargetKind = "water" | "krathong" | "lamp" | "riverKrathong";`. Change nothing else. (`TargetHighlight` indexes
`HIGHLIGHT_RING_SIZES[target]`, so TypeScript forces the new entry.)

### Step 4 — `src/core/world/riverVisibility.ts` (modify `selectVisibleRiverItems` only; MFW-25 follow-up)

Today, pins take slots first and the rest are spread over the remaining items. One pin therefore shifts almost every index, which reshuffles the rendered
subset (a hitch on LOW, and a batch rebuild after MFW-34). New rule: compute the **no-pin** selection first, then let each missing pin replace the
**nearest** unpinned pick in phase order. Keep `riverPhaseOf`, `NO_PINNED_RIVER_IDS`, the signature, the early returns and "result in `items` order, frozen".
Replace the TSDoc point 1/2 with the new rule and add: "Pinning k ids changes at most k unpinned picks (MFW-30)."

```ts
export function selectVisibleRiverItems<
  T extends { readonly id: string; readonly coord: SplinePathCoord; readonly createdAtMs: number },
>(items: readonly T[], cap: number, pinnedIds: readonly string[] = NO_PINNED_RIVER_IDS): readonly T[] {
  if (!Number.isSafeInteger(cap) || cap <= 0) return Object.freeze([]) as readonly T[];
  if (items.length <= cap) return items;
  // 1) Base pick: the no-pin even spread over ALL items (phase asc, id asc), indices ⌊i·n/cap⌋. Pins never move it.
  const sorted = items
    .map((it) => ({ id: it.id, phase: riverPhaseOf(it.coord, it.createdAtMs) }))
    .sort((a, b) => a.phase - b.phase || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const n = sorted.length;
  const chosen = new Set<number>(); // indices into `sorted`
  for (let i = 0; i < cap; i++) chosen.add(Math.floor((i * n) / cap));
  // 2) Pins present in `items`, in `items` order, at most `cap`.
  const pinned = new Set(pinnedIds);
  const indexOf = new Map(sorted.map((s, k) => [s.id, k] as const));
  const pins: number[] = [];
  for (const it of items) {
    if (pins.length >= cap) break;
    if (!pinned.has(it.id)) continue;
    const k = indexOf.get(it.id);
    if (k !== undefined && !pins.includes(k)) pins.push(k);
  }
  const pinSet = new Set(pins);
  // 3) Each pin outside the base replaces the nearest unpinned base pick (circular distance in phase order; tie → lower index).
  for (const p of pins) {
    if (chosen.has(p)) continue;
    let best = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const c of chosen) {
      if (pinSet.has(c)) continue;
      const d = Math.abs(c - p);
      const dist = Math.min(d, n - d);
      if (dist < bestDist || (dist === bestDist && c < best)) {
        best = c;
        bestDist = dist;
      }
    }
    chosen.delete(best); // always found: unpinned picks ≥ pins still missing (|pins| ≤ cap)
    chosen.add(p);
  }
  const ids = new Set([...chosen].map((k) => sorted[k].id));
  return Object.freeze(items.filter((it) => ids.has(it.id)));
}
```
Lead probe (80 items, cap 24): every single pin changes exactly one pick, two pins change at most two, 30 pins give the first 24 pinned items in `items` order
(the existing test), and ties still order by id.

### Step 5 — `src/core/world/findMyFocus.ts` (new) and `src/core/world/index.ts`

```ts
import { splineCoordToPoseInto, type SplinePoseOut } from "@/core/coordinates";
import type { PreparedRiverItem } from "./riverFlow";

/** Structural subset of three's Object3D that the anchor writer needs. */
export interface FindMyAnchorTarget {
  readonly position: { set(x: number, y: number, z: number): unknown };
}

/** The focused item of `items`, or null when `focusedId` is null or not present. Not per frame (useMemo). */
export function findFocusedRiverItem<T extends { readonly id: string }>(items: readonly T[], focusedId: string | null): T | null {
  if (focusedId === null) return null;
  return items.find((it) => it.id === focusedId) ?? null;
}

/**
 * Per frame, allocation-free (MFW-30): the focused krathong's lane position at nowMs (no bobbing) into target.position.
 * Bit-identical to getRiverItemPositionAt(item, lanes, nowMs).world (invariant B). Derived, never persisted (invariant A).
 */
export function writeFindMyAnchorPosition(
  target: FindMyAnchorTarget,
  item: PreparedRiverItem,
  nowMs: number,
  scratch: SplinePoseOut,
): void {
  const pose = splineCoordToPoseInto(item.coord, item.lane, item.createdAtMs, nowMs, scratch);
  target.position.set(pose.x, pose.y, pose.z);
}
```
`src/core/world/index.ts`: keep every line, append `export * from "./findMyFocus";`.

### Step 6 — `src/store/useWorldStore.ts` (modify)

Add one field and its initial value. Keep every other line (and the store's no-actions shape):
```ts
  /** Creation the camera follows (set by MFW-30 Find My); always rendered even above the tier cap. */
  focusedCreationId: string | null;
  /** Incremented by MFW-30 Find My on every focus request (selecting the same krathong again flies again). Monotonic per world session. */
  focusRequestId: number;
```
`INITIAL_WORLD_STATE` gains `focusRequestId: 0`. `zonePagination.ts` is **not** changed: `loadZone`/`enterWorld` keep clearing `focusedCreationId` and leave
`focusRequestId` alone; `leaveWorld` resets everything to `INITIAL_WORLD_STATE`.
`src/store/stores.test.ts`: the world expectation becomes
`{ currentZoneId: null, participantCount: null, eventId: null, zoneCount: null, zoneStatus: "idle", zoneItems: [], focusedCreationId: null, focusRequestId: 0 }`.

### Step 7 — `src/services/auth/myCreationsVault.ts` (new; client-only use, three-free)

Allowed imports: `@/config/events/types` (`FESTIVAL_EVENT_IDS`, type `FestivalEventId`), `@/config/ownership.config` (`MY_CREATIONS_STORAGE_KEY` only),
`@/config/myCreations.config`, `@/core/world/zoneManager` (`isClientZoneId`), `./deviceOwnerToken` (**`getBrowserLocalStorage` only**), and
`import type { PublicCreation }` from `@/services/api/creationTypes`. Do **not** add it to `src/services/auth/index.ts` (Decision D2).

Stored JSON (example value of `localStorage["mfw:myCreations:v1"]`, newest first):
```json
[
  {"id":"0f8b6c1e-3a2d-4c5b-9e7f-1a2b3c4d5e6f","eventId":"loy_krathong","zoneId":2,"createdAt":"2026-11-25T13:05:00.000Z","expiresAt":"2026-12-26T16:59:59.999Z"},
  {"id":"00000000-0000-4000-8000-000000001001","eventId":"loy_krathong","zoneId":1,"createdAt":"2026-11-25T12:40:00.000Z","expiresAt":"2026-12-26T16:59:59.999Z"}
]
```

```ts
/** One krathong this device created (owner decision 12). Public fields only: no coord, no wish text, no token or hash. */
export interface MyCreationEntry {
  readonly id: string; // lowercase uuid (MY_CREATION_ID_PATTERN)
  readonly eventId: FestivalEventId;
  readonly zoneId: number; // isClientZoneId
  readonly createdAt: string; // ISO-8601, server time (from the POST response)
  readonly expiresAt: string; // ISO-8601, later than createdAt
}
export type MyCreationSource = Pick<PublicCreation, "id" | "eventId" | "zoneId" | "createdAt" | "expiresAt">;
export type MyCreationRecordResult =
  | { readonly recorded: false }
  | { readonly recorded: true; readonly persisted: boolean }; // persisted false = memory fallback (page lifetime only)

export interface MyCreationsVault {
  /** Unexpired entries of `eventId`, newest first (createdAt desc, then id asc). Never throws, never writes. */
  list(eventId: FestivalEventId, nowMs: number): readonly MyCreationEntry[];
  /** Adds (or keeps) one entry, prunes expired ones, keeps at most MY_CREATIONS_MAX_ENTRIES, notifies subscribers. Never throws. */
  record(source: MyCreationSource, nowMs: number): MyCreationRecordResult;
  /** Called after every successful record. Returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
}
export interface MyCreationsVaultOptions {
  readonly storage: Storage | null; // null = no usable LocalStorage
  readonly maxEntries?: number; // default MY_CREATIONS_MAX_ENTRIES
}

/** Allowlist copy (by field name, no spread) or null. Accepts objects with extra fields (e.g. a full PublicCreation). */
export function toMyCreationEntry(source: unknown): MyCreationEntry | null;
/** Parses the stored string. null / bad JSON / not an array → []. Drops entries whose key set is not exactly MY_CREATION_ENTRY_KEYS or that fail toMyCreationEntry; keeps the first of duplicate ids. */
export function parseMyCreationEntries(raw: string | null): readonly MyCreationEntry[];
export function createMyCreationsVault(options: MyCreationsVaultOptions): MyCreationsVault;
/** Lazily created browser singleton (getBrowserLocalStorage()). Throws on the server, like the token vault. */
export function getMyCreationsVault(): MyCreationsVault;

/** What MFW-23's release orchestrator offers (structural; ASSUMED INTERFACE from the MFW-23 plan). */
export interface CreationSavedSource {
  onCreationSaved(listener: (creation: PublicCreation) => void): () => void;
}
/** Records every saved creation into the vault. Returns the unsubscribe. */
export function installMyCreationsRecorder(
  source: CreationSavedSource,
  vault: MyCreationsVault = getMyCreationsVault(),
  now: () => number = Date.now,
): () => void;
```

Behaviour:
- `toMyCreationEntry(source)`: plain object (prototype `Object.prototype` or `null`); `id` string matching `MY_CREATION_ID_PATTERN`; `eventId` in
  `FESTIVAL_EVENT_IDS`; `isClientZoneId(zoneId)`; `createdAt`/`expiresAt` strings with finite `Date.parse`, and `Date.parse(expiresAt) > Date.parse(createdAt)`.
  Return `Object.freeze({ id, eventId, zoneId, createdAt, expiresAt })` (keys in `MY_CREATION_ENTRY_KEYS` order). Anything else → `null`.
- `parseMyCreationEntries(raw)`: `try { JSON.parse }` → `[]` on throw; not an array → `[]`; for each element: plain object whose
  `Object.keys(el).sort()` equals `[...MY_CREATION_ENTRY_KEYS].sort()`, then `toMyCreationEntry(el)`; skip `null` and repeated ids. Return a frozen array.
- Internal state: `let memory: readonly MyCreationEntry[] | null = null;` (set only when a write failed, like the token vault's `memoryToken`) and a listener `Set`.
- `readAll()`: `memory !== null` → `memory`; `storage === null` → `[]`; else `try { parseMyCreationEntries(storage.getItem(MY_CREATIONS_STORAGE_KEY)) } catch { [] }`.
- `sortNewestFirst(entries)`: `Date.parse(b.createdAt) - Date.parse(a.createdAt)`, then `a.id < b.id ? -1 : 1`.
- `list(eventId, nowMs)`: `readAll().filter((e) => e.eventId === eventId && Date.parse(e.expiresAt) > nowMs)`, sorted newest first, frozen.
- `record(source, nowMs)`:
  1. `entry = toMyCreationEntry(source)`; `null` → `{ recorded: false }` (no write, no notify). Also `{ recorded: false }` when `Date.parse(entry.expiresAt) <= nowMs`.
  2. `next = sortNewestFirst([entry, ...readAll().filter((e) => e.id !== entry.id && Date.parse(e.expiresAt) > nowMs)]).slice(0, maxEntries)` (all events kept).
  3. `storage === null` → `memory = next; persisted = false`. Else `try { storage.setItem(KEY, JSON.stringify(next)); memory = null; persisted = true }
     catch { memory = next; persisted = false }`.
  4. Notify each listener inside `try { … } catch { /* ignore */ }`. Return `{ recorded: true, persisted }`.
  - `maxEntries` must be a safe integer ≥ 1, else `createMyCreationsVault` throws `RangeError("maxEntries")`.
- `getMyCreationsVault()`: `typeof window === "undefined"` → `throw new Error("MyCreationsVault is client-only")`; else
  `singleton ??= createMyCreationsVault({ storage: getBrowserLocalStorage() })`.
- `installMyCreationsRecorder(source, vault, now)`: `return source.onCreationSaved((creation) => { vault.record(creation, now()); });`.
- Never logs. Never reads `DEVICE_OWNER_TOKEN_STORAGE_KEY`, never calls `getDeviceOwnerVault`. The word `localStorage` does not appear in this file (the storage
  comes from `getBrowserLocalStorage()` or the option).

### Step 8 — `src/services/api/findMyCreation.ts` (new; client-safe, three-free)

Allowed imports: `import type { FestivalEventId }` from `@/config/events/types`, `isClientZoneId` from `@/core/world/zoneManager`, `useWorldStore` and
`type WorldState` from `@/store/useWorldStore`, and `getZonePagination`, `type WorldStoreLike`, `type ZoneLoadOutcome` from `./zonePagination`.

```ts
export type FindMyOutcome = "focused" | "not_found" | "failed" | "superseded" | "invalid";
/** What Find My needs from a device-list entry (structurally a MyCreationEntry). */
export interface FindMyTarget {
  readonly id: string;
  readonly eventId: FestivalEventId;
  readonly zoneId: number;
}
export interface FindMyCreationOptions {
  readonly store?: WorldStoreLike; // default useWorldStore
  readonly loadZone?: (zoneId: number) => Promise<ZoneLoadOutcome>; // default (id) => getZonePagination().loadZone(id), looked up at call time
}
export interface FindMyCreation {
  /** Spec §6.7: load the krathong's zone if needed, then make it the focused creation (the scene flies and highlights). */
  find(target: FindMyTarget): Promise<FindMyOutcome>;
}
export function createFindMyCreation(options?: FindMyCreationOptions): FindMyCreation;
/** App singleton (created on first call). */
export function getFindMyCreation(): FindMyCreation;
```

`find(target)`, in this order (`generation` is a closure counter):
1. `const gen = ++generation; const s0 = store.getState();`
2. `s0.eventId === null || s0.eventId !== target.eventId || !isClientZoneId(target.zoneId) || typeof target.id !== "string" || target.id === ""` →
   return `"invalid"` (no load, no store write).
3. `const isShown = (s: WorldState) => s.currentZoneId === target.zoneId && s.zoneStatus === "ready" && s.zoneItems.some((i) => i.id === target.id);`
4. If `!isShown(s0)` (another zone, a zone still loading or failed, **or** the same zone without the item — e.g. MFW-23 did not reload the visible zone after a
   release):
   - `const outcome = await loadZone(target.zoneId);`
   - `gen !== generation` → `"superseded"` (a newer find started).
   - `outcome === "superseded"` → `"superseded"`; `outcome === "invalid"` → `"invalid"`; `outcome === "failed"` → `"failed"`.
   - `const s1 = store.getState();` if `s1.eventId !== target.eventId || s1.currentZoneId !== target.zoneId` → `"superseded"` (the user switched zones).
   - `!isShown(s1)` → `"not_found"` (hidden by moderation, expired, or the preview's in-memory backend restarted). No store write.
5. `store.setState({ focusedCreationId: target.id, focusRequestId: store.getState().focusRequestId + 1 });` return `"focused"`.

This module and `zonePagination.ts` are the only writers of `useWorldStore`. It writes only `focusedCreationId` and `focusRequestId` (Decision D7). No timers,
no retries, no `fetch`, no `console`, no token.

### Step 9 — `src/components/canvas3d/sceneObjectNames.ts` (modify)

Add `findMyAnchor: "scene-find-my-anchor",` to `SCENE_OBJECT_NAMES`. Keep every existing entry, including the ones MFW-23/MFW-28/MFW-34 add.

### Step 10 — `src/components/canvas3d/FindMyAnchor.tsx` (new, `"use client"`)

```tsx
"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import type { Group } from "three";
import { createSplinePoseOut, type RiverLaneSet } from "@/core/coordinates";
import { getRiverItemPositionAt, prepareRiverItems, writeFindMyAnchorPosition } from "@/core/world";
import type { RiverFlowItem } from "./RiverFlow";
import { SCENE_OBJECT_NAMES } from "./sceneObjectNames";

export interface FindMyAnchorProps {
  readonly item: RiverFlowItem;
  readonly lanes: RiverLaneSet;
  /** Same clock as RiverFlow (MFW-23 riverNow). Default Date.now. */
  readonly now?: () => number;
  readonly anchorRef: RefObject<Group | null>;
}

/**
 * Empty group at the focused krathong's current lane position (MFW-30). It is the camera fly-to target and the highlight's follow target.
 * Position comes from the stored SplinePathCoord at render time (invariants A, B), so it works whoever draws the krathong
 * (RiverFlow batch, OwnKrathong) and also for tier-hidden items.
 */
export function FindMyAnchor({ item, lanes, now = Date.now, anchorRef }: FindMyAnchorProps) {
  const invalidate = useThree((state) => state.invalidate);
  const prepared = useMemo(() => prepareRiverItems([item], lanes)[0] ?? null, [item, lanes]);
  // Mount position: the camera flight reads the anchor in the same commit, before the first frame runs.
  const startPosition = useMemo(() => {
    if (prepared === null) return null;
    const p = getRiverItemPositionAt(prepared, lanes, now());
    return p === null ? null : ([p.world.x, p.world.y, p.world.z] as [number, number, number]);
  }, [prepared, lanes, now]);
  const scratch = useRef(createSplinePoseOut());

  useFrame(() => {
    const node = anchorRef.current;
    if (node === null || prepared === null) return;
    writeFindMyAnchorPosition(node, prepared, now(), scratch.current);
    invalidate(); // the krathong keeps drifting, also under reduced motion (owner decision 23)
  });

  if (prepared === null || startPosition === null) return null;
  return <group ref={anchorRef} name={SCENE_OBJECT_NAMES.findMyAnchor} position={startPosition} />;
}
```
Rules: no `data-*` prop on the group (LESSON). The `position` prop is memoised, so a re-render does not snap the anchor back. No decimal literals.

### Step 11 — `src/components/canvas3d/index.tsx` (modify)

Small, additive edits (on top of MFW-23 and, if merged, MFW-34):
1. Imports: `import { FindMyAnchor } from "./FindMyAnchor";` and add `findFocusedRiverItem` to the existing `@/core/world` import.
2. `ToyNightSceneProps` gains `findMyItem: RiverFlowItem | null;` and `findMyAnchorRef: RefObject<Group | null>;`. Inside the world-view group, right after
   `<RiverFlow … />`, render:
   ```tsx
   {findMyItem && (
     <FindMyAnchor item={findMyItem} lanes={getLoyKrathongRiverLanes()} now={riverNow} anchorRef={findMyAnchorRef} />
   )}
   ```
   `riverNow` is the clock prop MFW-23 passes to `RiverFlow`. If the merged `ToyNightScene` has no clock prop, omit `now` (default `Date.now`, which is what
   `RiverFlow` then uses too). The anchor must sit **inside** the world-view group so pan/rotate applies to it exactly as to the krathong.
3. In `SceneViewport`:
   ```ts
   const focusRequestId = useWorldStore((s) => s.focusRequestId);
   const findMyItem = useMemo(
     () => (mode === "WORLD_EXPLORE" ? findFocusedRiverItem(visibleRiverItems, focusedCreationId) : null),
     [mode, visibleRiverItems, focusedCreationId],
   );
   const findMyAnchorRef = useRef<Group | null>(null);
   const [seenFocusRequestId, setSeenFocusRequestId] = useState(0);
   ```
   Use `visibleRiverItems` (the list **before** MFW-23's `excludeOwnAndCap`), so the user's own just-released krathong can be focused too.
4. Directly **after** the existing `if (selectionMode !== mode) { … }` block, add the render-phase focus handling (same pattern as `selectionMode`):
   ```ts
   if (seenFocusRequestId !== focusRequestId) {
     setSeenFocusRequestId(focusRequestId);
     if (findMyItem !== null) {
       setSelectedTarget("riverKrathong");
       setFlyRequestId((requestId) => requestId + 1);
     }
   }
   if (selectedTarget === "riverKrathong" && findMyItem === null) setSelectedTarget(null); // zone switch / leave cleared the focus
   ```
   `useState(0)` (not the current value): if the viewport mounts while a focus request is pending, it flies once. Tapping water, a lamp or the own krathong still
   replaces the selection as today; the pin stays until the next zone load.
5. `activeTargetRef`: add `: selectedTarget === "riverKrathong" ? findMyAnchorRef` before the final `: null`. `CameraFlightController` and `TargetHighlight`
   need no change: the flight effect runs when `flyRequestId` changes and reads `targetRef.current.getWorldPosition`, and the ring follows the anchor every frame.
6. Pass `findMyItem={findMyItem}` and `findMyAnchorRef={findMyAnchorRef}` to `ToyNightScene`.
7. On the DOM `<section>` add `data-find-my={selectedTarget === "riverKrathong" ? "following" : undefined}`. Never put the creation id in any `data-*`.

Do not change `RiverFlow`, `pinnedRiverIds` (it already pins `focusedCreationId`), the camera springs, gestures, pan or MFW-23's ritual code.

### Step 12 — `src/components/ui/MyCreationsDrawer.tsx` (new, `"use client"`; landing path)

Allowed imports: `react`, `@/config/myCreations.config`, `@/services/api/findMyCreation`, `@/services/auth/myCreationsVault`, `@/store/useWorldStore`.

```tsx
export interface MyCreationsDrawerProps {
  readonly vault?: Pick<MyCreationsVault, "list" | "subscribe">; // default getMyCreationsVault() (resolved in effects/handlers only, never during render)
  readonly finder?: Pick<FindMyCreation, "find">; // default getFindMyCreation()
  readonly now?: () => number; // default Date.now
  /** Optional extra control per entry (MFW-31 adds the owner's reader here); FlowRoot passes nothing. */
  readonly renderEntryExtra?: (entry: MyCreationEntry) => ReactNode;
}
export type FindMyStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "searching" }
  | { readonly kind: "found"; readonly zoneId: number }
  | { readonly kind: "not_found" }
  | { readonly kind: "failed" };
/** createdAt → "25 พ.ย. 13:05" style (MY_CREATIONS_TIME_LOCALE / MY_CREATIONS_TIME_FORMAT, device time zone). */
export function formatReleaseTime(createdAt: string): string;
export function MyCreationsDrawer(props: MyCreationsDrawerProps): ReactElement | null; // import type { ReactElement, ReactNode } from "react"
```

Behaviour:
- `const eventId = useWorldStore((s) => s.eventId);` If `eventId === null` → render `null` (same rule as `ZoneNavigator`).
- State: `open` (false), `entries` (`readonly MyCreationEntry[]`, initially empty), `status` (`{ kind: "idle" }`). Ref `requestRef = useRef(0)`.
- `refresh()` (useCallback): `setEntries((vault ?? getMyCreationsVault()).list(eventId, now()))` when `eventId !== null`.
- `useEffect`: when `eventId !== null`, call `refresh()` and return `(vault ?? getMyCreationsVault()).subscribe(refresh)`. Cleanup also does `requestRef.current += 1`
  (late results are ignored after unmount).
- Toggle button (always rendered while `eventId !== null`): `<button type="button" aria-expanded={open} aria-controls={listId} onClick=…>{COPY.openButton}</button>`
  with `listId = useId()`. Opening calls `refresh()` first, so another tab's new entry shows up the next time the list opens.
- When `open`: `<section id={listId} aria-label={COPY.title} data-testid="my-creations-list">` containing `<h2>{COPY.title}</h2>`, `<p>{COPY.deviceOnly}</p>`,
  then either `<p>{COPY.empty}</p>` or `<ul>` with one `<li key={entry.id}>` per entry:
  `<button type="button" onClick={() => void select(entry)}>{COPY.itemLabel(entries.length - index, entry.zoneId, formatReleaseTime(entry.createdAt))}</button>`
  followed by `{renderEntryExtra?.(entry)}`. The ordinal counts from the oldest (= 1). A close button `{COPY.close}` sets `open` false.
- `select(entry)`: `const req = ++requestRef.current; setStatus({ kind: "searching" }); const outcome = await (finder ?? getFindMyCreation()).find(entry);`
  then `if (req !== requestRef.current) return;` and map:
  `"focused"` → `setStatus({ kind: "found", zoneId: entry.zoneId }); setOpen(false);` · `"not_found"` → `{ kind: "not_found" }` ·
  `"failed"` or `"invalid"` → `{ kind: "failed" }` · `"superseded"` → `{ kind: "idle" }`. A throw from `find` → `{ kind: "failed" }` (try/catch, no console).
- Status line, always rendered: `<p role="status" aria-live="polite" data-testid="find-my-status" data-find-my-status={status.kind}>` with the text
  `""` (idle) / `COPY.searching` / `COPY.found(zoneId)` / `COPY.notFound` / `COPY.failed`.
- Wrapper: `<div data-testid="my-creations" data-open={String(open)} data-entry-count={entries.length} className="mb-4 flex w-full flex-col gap-2 text-sm">`.
  Mobile-first: full-width buttons (`w-full text-left`), wrapping text, no fixed widths. **No `transition*`/`animate*` classes** (invariant F, nothing to reduce).
- The drawer never shows wish text, appearance or coordinates, and never calls the token vault.

### Step 13 — `src/components/ui/FlowRoot.tsx` (modify)

1. Imports: `import { installMyCreationsRecorder } from "@/services/auth/myCreationsVault";` and `import { MyCreationsDrawer } from "./MyCreationsDrawer";`
   (`getReleaseCreation` is already imported by MFW-23).
2. One effect, mounted once: `useEffect(() => installMyCreationsRecorder(getReleaseCreation()), []);` (subscribe on mount, unsubscribe on unmount; StrictMode's
   double run is harmless).
3. Render `{flowState === "SHARED_WORLD_EXPLORE" && <MyCreationsDrawer />}` directly after the `ZoneNavigator` line.
Change nothing else in `FlowRoot`.

### Step 14 — existing tests that assert "no buttons in the world"

The drawer button exists in `SHARED_WORLD_EXPLORE` whenever `useWorldStore.eventId` is set. Find every such assertion with
`rg -n 'getByRole\("button"\)\)\.toHaveCount\(0\)|queryByRole\("button"\)\)\.toBeNull' tests/e2e src/components/ui` and change **only those reached in
`SHARED_WORLD_EXPLORE` with a world event set**. Known ones (MFW-23 branch): `tests/e2e/flow.spec.ts` (end of the walk), `tests/e2e/zone-pagination.spec.ts`
("3D smoke"), and in `FlowRoot.test.tsx` the case "shows the zone navigator only at SHARED_WORLD_EXPLORE, without buttons in a 1-zone world". Replace each with:
- e2e: `await expect(page.getByRole("button")).toHaveCount(1); await expect(page.getByRole("button", { name: "ค้นหาของฉัน" })).toBeVisible();`
- unit: `expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([MY_CREATIONS_COPY.openButton]);`
Assertions where the world store has no event (FlowRoot tests mock `zonePagination`, so `eventId` stays `null`) stay as they are. List every changed line in the PR.

### Step 15 — e2e fixtures `tests/e2e/fixtures/findMyFixtures.ts` (new; no imports from `src/`)

```ts
import { makeZoneItem } from "./zoneFixtures";
/** = MY_CREATIONS_STORAGE_KEY (src/config/ownership.config.ts); checked by tests/unit/find-my-e2e-fixtures.test.ts. */
export const E2E_MY_CREATIONS_STORAGE_KEY = "mfw:myCreations:v1";
/** = MY_CREATION_ENTRY_KEYS, sorted. */
export const E2E_MY_CREATION_ENTRY_KEYS_SORTED = ["createdAt", "eventId", "expiresAt", "id", "zoneId"] as const;
/** A zone item with the given id, created now (the user's own krathong as GET /api/creations returns it). */
export function makeOwnZoneItem(zoneId: number, id: string, nowMs: number): Record<string, unknown> {
  return { ...makeZoneItem(zoneId, 0), id, createdAt: new Date(nowMs).toISOString() };
}
```

### Step 16 — `tests/unit/find-my-boundary.test.ts` (new, node)

Reuse the `SPECIFIER` regex and `specifiers()` helper from `tests/unit/world-zone-boundary.test.ts` (copy them; include its self-check case).
```ts
const ALLOWED: Record<string, readonly string[]> = {
  "src/config/myCreations.config.ts": [],
  "src/services/auth/myCreationsVault.ts": [
    "@/config/events/types", "@/config/ownership.config", "@/config/myCreations.config", "@/core/world/zoneManager",
    "./deviceOwnerToken", "@/services/api/creationTypes",
  ],
  "src/services/api/findMyCreation.ts": ["@/config/events/types", "@/core/world/zoneManager", "@/store/useWorldStore", "./zonePagination"],
  "src/components/ui/MyCreationsDrawer.tsx": [
    "react", "@/config/myCreations.config", "@/services/api/findMyCreation", "@/services/auth/myCreationsVault", "@/store/useWorldStore",
  ],
};
```
Cases:
1. "landing-path files import only from the allowlist" (as in `world-zone-boundary.test.ts`).
2. "never touches the owner token": `/getDeviceOwnerVault|createDeviceOwnerVault|DEVICE_OWNER_TOKEN_STORAGE_KEY|getOrCreate|ownerToken|Authorization/` matches none of
   the four files; and `myCreationsVault.ts` imports from `./deviceOwnerToken` only the name `getBrowserLocalStorage` (regex on its import line).
3. "no console, no fetch, no localStorage literal": `/console\./`, `/\bfetch\(/`, `/localStorage/` match none of the four files.
4. "no private names": `/owner_?token|private_?wish|wishText|publicWishText/i` matches none of `myCreations.config.ts`, `findMyCreation.ts`,
   `MyCreationsDrawer.tsx`, nor `myCreationsVault.ts` after removing its one `from "./deviceOwnerToken"` import line (that path itself contains "OwnerToken").
5. "FlowRoot does not pull in the world barrel or three": `specifiers(read("src/components/ui/FlowRoot.tsx"))` contains neither `@/core/world` nor a `three`/`@react-three`
   specifier.
6. "FindMyAnchor puts no data-* prop on the R3F group": `/data-/` does not match `src/components/canvas3d/FindMyAnchor.tsx`.

`tests/unit/landing-import-graph.test.ts` (MFW-23): add `expect(seen.has(path.join(ROOT, "src/components/ui/MyCreationsDrawer.tsx"))).toBe(true);` next to the
existing `seen.has` checks. If the file does not exist on `main`, skip this line and say so in the PR.

## Tests

All tests run without a database and without Supabase env. Use `// @vitest-environment node` only where stated; the default is jsdom.

### `src/core/world/riverVisibility.test.ts` (modify: add cases; keep the existing seven unchanged)
- "pinning one hidden item changes exactly one unpinned pick": `items = many(80)`, `base = ids(select(items, 24))`; for **every** item `h` not in `base`:
  `out = select(items, 24, [h.id])` → `out` has 24 items, contains `h.id`, `base \ out` has exactly 1 id and `out \ base` is exactly `[h.id]`.
- "two pins change at most two picks": for pins `(items[a], items[b])` with `a` in `0..79 step 7`, `b` in `3..79 step 11`: `|base \ out| <= 2`, both pins in `out`.
- "a pin that is already shown changes nothing": for `p` in `base`, `ids(select(items, 24, [p]))` equals `ids(select(items, 24))`.
- "spread stays bounded with a pin": with `[items[1].id]` pinned, the largest circular phase gap of the output is `<= 2 * Math.ceil(80 / 24) / 80 + 1e-9`.

### `src/core/world/findMyFocus.test.ts` (node)
Fixture: `lanes = getLoyKrathongRiverLanes()`, `T0 = 1_700_000_000_000`, an item `{ id: "a", coord: { mode: "SPLINE_PATH", laneId: LOY_KRATHONG_RIVER_LANE_ID,
spawnProgress: 0.25, speedFactor: RIVER_DRIFT_SPEED_FACTOR, lateralOffset: 0.2 }, createdAtMs: T0 }`, `prepared = prepareRiverItems([item], lanes)[0]`, and a
recording target `{ position: { set(x, y, z) { last = [x, y, z]; } } }`.
- "matches getRiverItemPositionAt bit for bit": for `now` in `[T0, T0 + 10_000, T0 + 100_000, T0 + 200_000]` (the last one wraps past the lane end),
  `last` equals `[w.x, w.y, w.z]` of `getRiverItemPositionAt(prepared, lanes, now)!.world` with `toBe` on each component.
- "follows the drift": positions at `T0` and `T0 + 10_000` differ (distance > 0), and a single scratch object is reused (the same `SplinePoseOut` reference is
  returned by `splineCoordToPoseInto`; assert the scratch's `x` equals `last[0]` after each call).
- "findFocusedRiverItem": `null` id → `null`; unknown id → `null`; known id → that same object (`toBe`).

### `src/store/stores.test.ts` (modify the world expectation only, Step 6)

### `src/config/myCreations.config.test.ts` (node)
- `MY_CREATION_ID_PATTERN.source === UUID_PATTERN.source` (import `UUID_PATTERN` from `@/config/database.config` here, in the test only).
- `MY_CREATIONS_STORAGE_KEY` starts with `"mfw:"`, differs from `DEVICE_OWNER_TOKEN_STORAGE_KEY`, and ends with `":v1"`.
- `MY_CREATION_ENTRY_KEYS` equals `["id", "eventId", "zoneId", "createdAt", "expiresAt"]`, and every key is in `PUBLIC_CREATION_KEYS` (public fields only).
- `Number.isSafeInteger(MY_CREATIONS_MAX_ENTRIES) && MY_CREATIONS_MAX_ENTRIES >= 1`.
- `MY_CREATIONS_COPY.openButton === "ค้นหาของฉัน"`; `itemLabel(2, 3, "25 พ.ย. 13:05")` contains `"คุ้งน้ำที่ 3"`; `found(2)` contains `"คุ้งน้ำที่ 2"`.

### `src/config/camera.config.test.ts` (node)
- `HIGHLIGHT_RING_SIZES.riverKrathong.innerRadius > RIVER_COLLISION_RADIUS`, `outerRadius > innerRadius`, `heightOffset > 0`; the three old entries are unchanged
  (`toEqual` their MFW-17 values).

### `src/services/auth/myCreationsVault.test.ts` (jsdom)
Use a `MemoryStorage implements Storage` test class (copy from `deviceOwnerToken.test.ts`). `NOW = Date.parse("2026-11-25T13:30:00.000Z")`. Helper
`creation(i, overrides?)` builds a full `PublicCreation` (uuid `00000000-0000-4000-8000-00000000000<i>`, `eventId: "loy_krathong"`, `zoneId: 2`,
`createdAt` = `NOW - i * 60_000` as ISO, `expiresAt: "2099-01-01T00:00:00.000Z"`, a coord, appearance and `publicWishText: "ขอให้มีความสุข"`).
- "record then list, newest first": record 3 creations → `list("loy_krathong", NOW)` ids in createdAt-desc order; `JSON.parse(storage.getItem(KEY))` has the same
  order.
- "stores only the five allowlisted keys": record `{ ...creation(1), ownerToken: "x".repeat(43), privateWishText: "secret" } as unknown as PublicCreation` →
  every stored object has exactly `MY_CREATION_ENTRY_KEYS`; the raw string contains neither `"secret"`, `"x".repeat(43)`, `"coord"`, `"appearance"` nor `"Wish"`.
- "rejects invalid sources": bad id (`"abc"`, uppercase uuid), `zoneId` `0` / `1.5` / `"2"`, unknown `eventId`, unparsable dates, `expiresAt <= createdAt`, an
  already expired creation → `{ recorded: false }`, storage untouched, no listener call.
- "dedupes by id": record the same creation twice → one entry.
- "drops expired entries": seed storage with one expired and one valid entry → `list` returns only the valid one; after a `record`, the stored JSON no longer contains
  the expired id.
- "keeps at most maxEntries, dropping the oldest": `createMyCreationsVault({ storage, maxEntries: 3 })`, record 4 → the oldest id is gone. `maxEntries: 0` → throws
  `RangeError`.
- "filters by event": an entry with `eventId: "christmas"` is not listed for `"loy_krathong"`.
- "tolerates corrupted storage": `"{"`, `"null"`, `"{}"`, `"[1, null, \"x\"]"`, an entry with an extra key, an entry missing a key → `list` returns `[]` (or only the
  valid entries) and never throws; the next `record` overwrites with a clean list.
- "no LocalStorage: memory fallback": `storage: null` → `record` returns `{ recorded: true, persisted: false }` and `list` returns it.
- "write failure: memory fallback": `setItem` throws → `persisted: false`, and `list` still returns the new entry. `getItem` throwing → `list` returns `[]`.
- "subscribe": a listener runs once per successful record, not on a rejected one; the unsubscribe stops it; a throwing listener does not break `record`.
- "installMyCreationsRecorder records each saved creation": a fake source `{ onCreationSaved(l) { listeners.add(l); return () => listeners.delete(l); } }` →
  emit `creation(1)` → the vault lists it; after the returned unsubscribe, another emit records nothing.
- "getMyCreationsVault uses window.localStorage": record via the singleton → `window.localStorage.getItem(MY_CREATIONS_STORAGE_KEY)` contains the id. Clear
  `window.localStorage` in `afterEach`.

### `src/services/auth/myCreationsVault.node.test.ts` (node)
- `getMyCreationsVault()` throws on the server; `createMyCreationsVault({ storage: null })` still works.

### `src/services/api/findMyCreation.test.ts` (jsdom)
A fake store `{ state, getState: () => state, setState: (p) => { state = { ...state, ...p }; } }` starting from `INITIAL_WORLD_STATE` with
`eventId: "loy_krathong", currentZoneId: 3, zoneStatus: "ready", zoneItems: [itemOf(3, "c")]`. `loadZone` is a `vi.fn` that you control (resolve with an outcome
and set the zone's items like the real pagination: `currentZoneId: z, zoneStatus: "ready", zoneItems: …, focusedCreationId: null`).
- "another zone: awaits loadZone once, then focuses": target `{ id: A, eventId: "loy_krathong", zoneId: 2 }`, `loadZone(2)` loads items incl. `A` → outcome
  `"focused"`, `loadZone` called exactly once with `2`, `focusedCreationId === A`, `focusRequestId === 1`.
- "same zone with the item: no load": target in zone 3 present → `"focused"`, `loadZone` not called.
- "same zone without the item: reloads once": target in zone 3, not in items; `loadZone(3)` adds it → `"focused"`; when the reload still lacks it → `"not_found"`,
  `focusedCreationId` stays `null`, `focusRequestId` unchanged.
- "focus fields after a find": two finds of the same target → `focusRequestId` 1 then 2.
- "load failed / invalid / superseded": `loadZone` resolves `"failed"` → `"failed"`; `"invalid"` → `"invalid"`; `"superseded"` → `"superseded"`; no focus write in any.
- "a newer find supersedes an older one": start find(A in zone 2) with a pending `loadZone`, start find(B in zone 1), resolve both → the first returns
  `"superseded"`, only `B` is focused.
- "a zone switch during the load supersedes": `loadZone(2)` resolves `"loaded"` but the store ends at `currentZoneId: 1` → `"superseded"`, no focus.
- "wrong or missing world": store `eventId: null` or `"christmas"`, or target `zoneId: 0`, or `id: ""` → `"invalid"`, `loadZone` not called.

### `src/components/canvas3d/index.test.tsx` (modify: add `describe("Find My (MFW-30)")`; existing cases unchanged)
Use the file's `storeItem`, `setWorld`, `r3f.flightStarts`, `viewport()` helpers. In this `describe`, `beforeEach`: `vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(Date.parse("2026-11-24T12:00:30.000Z"));`, `afterEach`: `vi.useRealTimers()`. For flight-target checks, temporarily override
`HTMLUnknownElement.prototype.getWorldPosition` inside the test so it reads `this.getAttribute("position")` (split by `,`, numbers; `(0, 0, 0)` when absent), and
restore the default stub after the test. Focus helper: `focus(id, request) = act(() => useWorldStore.setState({ focusedCreationId: id, focusRequestId: request }))`.
- "a focus request flies to the krathong's current position": HIGH, `setWorld(2, [storeItem(2, 1), storeItem(2, 2)])`, render `WORLD_EXPLORE`, `focus(id2, 1)` →
  `data-selected-target="riverKrathong"`, `data-find-my="following"`; `[name="scene-find-my-anchor"]` exists inside the world-view group and its `position` attribute
  equals `getRiverItemPositionAt(item2, getLoyKrathongRiverLanes(), Date.now())!.world` (within `1e-9`, where `item2` is built from the store item like the existing
  pin test); exactly one new flight start, `immediate: false`, and its `to` equals `getCameraFlightPose(thatWorld)` (within `1e-9`).
- "reduced motion: the Find My flight is an instant cut": `useDeviceStore.setState({ reducedMotion: true })` → the new flight start has `immediate: true`.
- "selecting the same krathong again flies again": `focus(id2, 1)` then `focus(id2, 2)` → two new flight starts.
- "the highlight targets the focused krathong": after the focus, a ring mesh is rendered (TargetHighlight) and `data-selected-target` is `riverKrathong`; then a water tap
  makes it `water` and `data-find-my` disappears, while `river-item-<id2>` is still rendered (pinned).
- "a zone switch drops the focus": after the focus, `act(() => useWorldStore.setState({ focusedCreationId: null, zoneItems: [storeItem(3, 1)], currentZoneId: 3 }))` →
  no `scene-find-my-anchor`, no `data-selected-target`, no `data-find-my`.
- "an unknown id does not fly": `focus("00000000-0000-4000-8000-999999999999", 1)` → no new flight start, no anchor.
- "outside WORLD_EXPLORE nothing happens": `mode="CUSTOMIZE"` with a focus → no anchor, no new flight.
- "a tier-hidden focus is pinned and followed": LOW, 80 items, pick an item hidden by `selectVisibleRiverItems(prepared, TIER_BUDGETS.LOW.riverItemCap)` (as in
  the existing pin test), `focus(hidden.id, 1)` → its `river-item-*` group exists, the anchor exists, `riverGroups` count is the LOW cap.
- "no data-* attribute contains the focused id": after a focus, no viewport `data-*` value contains the id.

### `src/components/ui/MyCreationsDrawer.test.tsx` (jsdom)
Fake vault `{ list: vi.fn(() => entries), subscribe: vi.fn((l) => { notify = l; return () => {}; }) }`, fake finder `{ find: vi.fn() }`, `now = () => NOW`. Set
`useWorldStore` `eventId: "loy_krathong"` in `beforeEach` (reset to `INITIAL_WORLD_STATE` after).
- "renders nothing without a world": `eventId: null` → `container` is empty.
- "one closed button": exactly one button, name `"ค้นหาของฉัน"`, `aria-expanded="false"`, no list.
- "shows the empty state": open with `[]` → `MY_CREATIONS_COPY.empty` and `deviceOnly` are shown.
- "lists entries newest first": two entries (zone 2 newer, zone 1 older) → list buttons in order
  `itemLabel(2, 2, formatReleaseTime(newer.createdAt))`, `itemLabel(1, 1, formatReleaseTime(older.createdAt))`.
- "re-reads the list when opened": `list` is called again on each open with `("loy_krathong", NOW)`.
- "updates when a creation is recorded": change `entries`, call `notify()` inside `act` → the new entry appears.
- "selecting an entry finds it": `find` resolves `"focused"` → called with that entry; status goes `searching` → `found` with `found(zoneId)`; the list closes
  (`data-open="false"`).
- "not found / failed / invalid / superseded / throw": statuses `not_found` (`notFound` text), `failed`, `failed`, `idle`, `failed`.
- "a stale result is ignored": first `find` pending, second resolves `"not_found"`, then the first resolves `"focused"` → status stays `not_found`.
- "renderEntryExtra": a render prop output appears inside each `li`.
- "has no animation classes": no element's `className` matches `/\b(transition|animate)/`.
- "never shows wish or coordinate data": entries carry only the five keys, and the text content contains no `spawnProgress`, `coord` or wish text.

### `src/components/ui/FlowRoot.test.tsx` (modify: two new cases + Step 14 adjustments)
- "a saved release is recorded in the device's creation list": walk to `RITUAL_RELEASE`, press "ปล่อยกระทง" (the file's stubbed POST returns the creation id
  `0f8b6c1e-3a2d-4c5b-9e7f-1a2b3c4d5e6f`, zone 1), wait for `SHARED_WORLD_EXPLORE` → `JSON.parse(localStorage.getItem(MY_CREATIONS_STORAGE_KEY))` is one entry with
  that id and `zoneId: 1`, keys exactly `MY_CREATION_ENTRY_KEYS`; the raw string does not contain `localStorage.getItem(DEVICE_OWNER_TOKEN_STORAGE_KEY)`, `"wish"`
  (case-insensitive), `"ownerToken"` or `"coord"`.
- "the drawer appears only in SHARED_WORLD_EXPLORE": before the release no `my-creations`; after it, with `useWorldStore.setState({ eventId: "loy_krathong", currentZoneId: 1,
  zoneCount: 1, zoneStatus: "ready" })`, the "ค้นหาของฉัน" button shows; opening it lists one entry with `"คุ้งน้ำที่ 1"`.

### `tests/unit/find-my-boundary.test.ts` — Step 16. `tests/unit/structure.test.ts` — add the file to `FILES`.

### `tests/unit/find-my-e2e-fixtures.test.ts` (node)
- `E2E_MY_CREATIONS_STORAGE_KEY === MY_CREATIONS_STORAGE_KEY`; `E2E_MY_CREATION_ENTRY_KEYS_SORTED` equals `[...MY_CREATION_ENTRY_KEYS].sort()`.
- `makeOwnZoneItem(2, E2E_CREATION_ID, NOW)` passes `toClientPublicCreation(item, "loy_krathong", 2)` and `publicCreationsToRiverItems([item], { eventId: "loy_krathong",
  zoneId: 2 })` has length 1.

### `tests/e2e/find-my.spec.ts` (new)
Copy `routeZones`, `walkToWorld` and the WebGL-off / HIGH-tier init scripts from `tests/e2e/zone-pagination.spec.ts`, extended so the zone route can add the own item:
`routeZones(page, zoneCount, sizes, own?: { zoneId; id })` adds `makeOwnZoneItem(own.zoneId, own.id, Date.now())` to that zone's body. Register `mockCreateCreation(page,
{ zoneId: 2 })` **after** the zone routes (it handles POST only). Use `E2E_CREATION_ID` from `./fixtures/ritualRoutes`.
- "3D: finds my krathong in another zone": HIGH; `routeZones(page, 3, { 1: 2, 2: 2, 3: 3 }, { zoneId: 2, id: E2E_CREATION_ID })`; walk to the world (the release is
  saved in zone 2, and MFW-23 loads zone 2) → wait for navigator `data-zone-id="2"`; click the button `{ name: /คุ้งน้ำถัดไป/ }` → `data-zone-id="3"`; click "ค้นหาของฉัน" → the list has
  exactly one entry containing "คุ้งน้ำที่ 2"; click it → navigator `data-zone-id="2"` and `data-zone-status="ready"`, the last requested zone is `"2"`, the viewport
  has `data-selected-target="riverKrathong"` and `data-find-my="following"`, the status line shows "พบกระทงของคุณที่คุ้งน้ำที่ 2", one canvas.
- "FALLBACK_2D: finds my krathong in another zone": WebGL off; same routes and steps → navigator zone 2, status "พบกระทงของคุณที่คุ้งน้ำที่ 2", `canvas` count 0.
- "not found when the zone no longer has it": routes without the own item → after the selection, the status shows "ไม่พบกระทงนี้บนสายน้ำแล้ว" and there is no
  `data-find-my` on the viewport (3D) / no canvas (2D; pick FALLBACK_2D to keep the run light).
- "the release is recorded on this device only": after the walk, `page.evaluate` reads `localStorage[E2E_MY_CREATIONS_STORAGE_KEY]` → one entry, keys sorted equal
  `E2E_MY_CREATION_ENTRY_KEYS_SORTED`, `id === E2E_CREATION_ID`; the raw string does not contain the stored device token value nor `"wish"` (case-insensitive).
  Record every request URL with `page.on("request")`; none contains `E2E_CREATION_ID` or the token value, before or after the Find My selection (the list is
  never sent anywhere).
- "360 px: the drawer fits": `test.use({ viewport: { width: 360, height: 640 } })` in its own `describe`; FALLBACK_2D; after the walk, "ค้นหาของฉัน" is in the viewport;
  after opening, the entry button's bounding box width is ≤ 360 and its right edge ≤ 360.

The existing e2e specs keep passing with the Step 14 edits.

## Do NOT

- Do not build the owner's private-wish view, any ownership-proof endpoint or any request that carries the token (MFW-31). The drawer offers only the
  `renderEntryExtra` slot.
- Do not build the 2D river view or 2D scrolling (MFW-33), instancing (MFW-34), the release (MFW-23) or zone transitions/animations (MFW-25 Open question 3).
- **Never query the server by owner**, never send the device list or a list id anywhere, never put an id, token or hash in a URL (owner decisions 1 and 12).
  `GET /api/creations?event=&zone=` (via `loadZone`) is the only request this card causes.
- Never store a coordinate, world/screen position, wish text, appearance, token or hash in the device list, a store fed by a public endpoint, or a `data-*` attribute.
- Never use the tier-visible subset for Find My or for collisions: Find My reads all `zoneItems` (MFW-25 Do NOT).
- Do not change `RiverFlow.tsx`, `prepareRiverItems`, `applyRiverItemTransform`, bobbing, lanes, coordinates, the camera springs (`CAMERA_FLIGHT_*`), gestures, pan,
  `TIER_BUDGETS`, `ZONE_ITEM_CAP`, `zonePagination.ts`, `zoneClient.ts`, the MFW-23 ritual code or any `supabase/**` file.
- Do not add a camera follow-cam, world rotation or a pulsing/glowing highlight (Open questions 1 and 6). No polling, no timers, no cross-tab `storage` listener.
- No `data-*` prop on any R3F/three element. No decimal literal or hex colour in `src/components/canvas3d/**`.
- Do not export the vault from `src/services/auth/index.ts`. Landing-path files must not import `three`, `@react-three/*`, `@react-spring/*`, `@/core/world` (barrel),
  `@/core/coordinates` or `@/config/database.config`.
- No `console.*`, no new dependency, no `package.json` / lockfile change.
- Do not touch `.claude/**`, `scripts/**`, `.github/**`, `CLAUDE.md`, `AGENTS.md`, `docs/spec/**`, `docs/backlog*.json`, `vitest.config.mts`, `playwright.config.ts`,
  `eslint.config.mjs`, `tsconfig.json`, `next.config.ts`. The only `docs/**` edit is deleting the one fixed MFW-25 row in `docs/follow-ups.md`.
- Do not change existing test cases except those named in Steps 6 and 14 and the one-line additions in `structure.test.ts` and `landing-import-graph.test.ts`.

## Definition of done

- Each of these is green, run separately, with no Supabase env in the shell: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`,
  `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell pnpm e2e` (cloud container; locally plain `pnpm e2e`).
- Every AC has its tests (section "Acceptance criteria → checks"), including the reduced-motion branch, FALLBACK_2D without a canvas, and the 360 px check.
- Delete `playwright-report/` and `test-results/` before committing. Never commit `.next/` or `*.tsbuildinfo`. Leave `AGENTS.md` as it is on `main`.
- Branch `feat/MFW-30-my-creations-drawer-real-time` from the latest `main` (after MFW-23 merged). Conventional commit(s) with the key, e.g.
  `feat(tracking): my creations drawer and find-my krathong tracker MFW-30`.
- PR title = the commit subject. English body (format of `docs/prompts/README.md` and CLAUDE.md): the MFW-30 link; the AC checklist with the test that proves
  each; Decisions D1–D14; the PLACEHOLDER values (`MY_CREATIONS_MAX_ENTRIES`, `MY_CREATIONS_COPY`) and the lead-design ring size; the Open questions; every
  ASSUMED INTERFACE difference found on `main`; every Step 14 assertion changed; the test plan with the five command results. Follow-ups to list: MFW-31 adds the
  private-wish reader via `renderEntryExtra`; MFW-33 reads `focusedCreationId` / `focusRequestId` to scroll the 2D river; the follow-up row removed from
  `docs/follow-ups.md`.
- Leave the PR open for reviewer + qa + **privacy-auditor** + **r3f-perf-reviewer**. It merges after the `ci` check is SUCCESS (not an owner-merge card).

## Interfaces this card provides

| Export | Path | Signature | Used by |
|---|---|---|---|
| `MY_CREATIONS_STORAGE_KEY` | `@/config/ownership.config` | `"mfw:myCreations:v1"` | MFW-31, e2e |
| `MY_CREATION_ENTRY_KEYS`, `MY_CREATION_ID_PATTERN`, `MY_CREATIONS_MAX_ENTRIES`, `MY_CREATIONS_COPY`, `MY_CREATIONS_TIME_*` | `@/config/myCreations.config` | Step 2 | drawer, MFW-31 |
| `MyCreationEntry`, `MyCreationsVault`, `createMyCreationsVault`, `getMyCreationsVault`, `toMyCreationEntry`, `parseMyCreationEntries`, `installMyCreationsRecorder`, `CreationSavedSource` | `@/services/auth/myCreationsVault` (by path) | Step 7 | **MFW-31** (the owner's own creations list), Christmas find-my-ornament |
| `createFindMyCreation`, `getFindMyCreation`, `FindMyCreation`, `FindMyTarget`, `FindMyOutcome` | `@/services/api/findMyCreation` | `find(target) => Promise<"focused" \| "not_found" \| "failed" \| "superseded" \| "invalid">` | MFW-33 (2D Find My), Christmas |
| `useWorldStore.focusRequestId` (+ existing `focusedCreationId`) | `@/store/useWorldStore` | `number`, incremented per focus request | **MFW-33**: on a new `focusRequestId` with `focusedCreationId` in `zoneItems`, scroll the 2D river to that coord (riverTopDown) and highlight it |
| `findFocusedRiverItem`, `writeFindMyAnchorPosition`, `FindMyAnchorTarget` | `@/core/world` | Step 5 | MFW-33 (same lookup), later anchors |
| `selectVisibleRiverItems` (stable pins) | `@/core/world` | unchanged signature; k pins change ≤ k picks | MFW-34, MFW-33 |
| `CameraTargetKind` `"riverKrathong"`, `HIGHLIGHT_RING_SIZES.riverKrathong` | `@/core/camera`, `@/config/camera.config` | Step 3 | scene |
| `FindMyAnchor`, `SCENE_OBJECT_NAMES.findMyAnchor` | `@/components/canvas3d/FindMyAnchor`, `./sceneObjectNames` | Step 10 | scene, MFW-34 perf probe |
| `SceneViewport` `data-find-my="following"`, `data-selected-target="riverKrathong"` | `@/components/canvas3d` | DOM | e2e |
| `MyCreationsDrawer` (`vault?`, `finder?`, `now?`, `renderEntryExtra?`), `formatReleaseTime`, `FindMyStatus` | `@/components/ui/MyCreationsDrawer` | Step 12 | FlowRoot, **MFW-31** |

## Open questions

Product decisions only. Each ships with the default stated; changing it later needs no rework.

1. **Does the camera keep following the krathong after the fly-to?** Default: the camera flies once to the krathong's current position; the ring then follows it
   every frame; selecting the entry again flies again. The krathong drifts at `RIVER_DRIFT_SPEED_FACTOR` (one lane per 125 s), so it leaves the view after a while.
   Options: a follow-cam until the user touches the scene (instant updates under reduced motion), or re-fly automatically when it leaves the view.
2. **When is the "ค้นหาของฉัน" button shown?** Default: always in `SHARED_WORLD_EXPLORE`, with "ยังไม่มีกระทงที่ปล่อยจากเครื่องนี้" when the device has none.
   Options: hide it until the device has a creation; also show it on the landing page (it would then enter the world first).
3. **How many creations does a device keep?** Default PLACEHOLDER `MY_CREATIONS_MAX_ENTRIES = 50`, oldest dropped first; expired ones disappear (decision 10).
   Options: another number, no cap, or a "remove from my list" control.
4. **What does an entry show?** Default: ordinal, zone and release time only ("กระทงที่ 2 · คุ้งน้ำที่ 3 · ปล่อยเมื่อ 25 พ.ย. 13:05"). No appearance, no wish
   text. Options: a small appearance summary/thumbnail, the public wish snippet (the private wish needs ownership proof, MFW-31).
5. **Thai copy.** All drawer strings except "ค้นหาของฉัน" are DRAFT (`MY_CREATIONS_COPY`). Please review the wording.
6. **Highlight look.** Default: the existing yellow ring (`HIGHLIGHT_RING_COLOR`), sized around the river krathong. Options: a pulse or glow (off under reduced motion).
7. **A krathong that is no longer on the river** (hidden by moderation, expired, or a reset preview backend). Default: "ไม่พบกระทงนี้บนสายน้ำแล้ว" for all
   cases, so moderation status is not revealed. Options: say it was hidden after reports (MFW-13 Open question on restore), or drop such entries from the list.

## Decisions

- **D1 — The device stores id, event, zone and timestamps at save time; it re-reads the coord from the public zone.** The zone is needed to know which zone to
  load and cannot be found otherwise without a server query by owner (decision 12 forbids that). The coord is **not** stored: after `loadZone`, the public
  `GET /api/creations` item is the server's truth, it honours moderation (hidden items are not found), it is exactly what the scene renders (the ring lines up),
  and invariant A is trivially safe for the device list. Re-reading needs no token (public data).
- **D2 — The list lives in `src/services/auth/myCreationsVault.ts`, next to the token vault, under `mfw:myCreations:v1` in `ownership.config.ts`.** Spec §3 puts the
  "Local Vault" in `services/auth`, and owner decision 12 says "next to the token". It mirrors the token vault (memory fallback, server guard), but it never reads
  the token. It is imported by path, not through the auth barrel, so the server's auth import surface stays unchanged.
- **D3 — Recording uses MFW-23's `onCreationSaved` hook, installed by a `FlowRoot` effect.** It needs no change to MFW-23 code, it records the server's final
  values, and it fires only after a POST that carried this device's token. That is the "via DeviceOwnerToken" link of AC1.
- **D4 — The stored list is parsed strictly** (exact key set, uuid, known event, zone ≥ 1, valid ISO dates, duplicates dropped). LocalStorage is user-editable,
  and the strict key set guarantees that no private field can ever be read back from it. Corruption degrades to an empty list and never throws.
- **D5 — Expired entries are hidden and pruned.** The server deletes rows 30 days after the festival (decision 10), so showing them would always fail.
- **D6 — The Find My orchestrator is three-free and lives on the landing path.** The drawer and FALLBACK_2D must not download WebGL code (MFW-44). It reloads the
  zone when the item is missing even in the same zone, because MFW-23 does not reload a visible zone after a release. A generation counter and the zone check
  make late results harmless.
- **D7 — `focusRequestId` is a counter in `useWorldStore`.** Selecting the same krathong again must fly again, but `focusedCreationId` alone would not change.
  `findMyCreation` writes only the two focus fields. `zonePagination` stays the writer of the zone fields and keeps clearing the focus on every load (focus never
  survives a zone switch).
- **D8 — The 3D target is a dedicated `FindMyAnchor` computed from the coord, not RiverFlow's `river-item-<id>` group.** A RiverFlow anchor gets its transform only
  in the first frame (the flight would read the origin), it is absent for the user's own krathong (drawn by `OwnKrathong`), and its internals change with MFW-34.
  The anchor uses the same lane, coord and clock (`riverNow`), so it is bit-identical to the river pose (invariant B). It has no bobbing, so the ring stays steady.
- **D9 — Reuse `CameraFlightController` and `TargetHighlight` with a new target kind `riverKrathong`.** There is one camera owner, the same spring, the same
  reduced-motion cut (MFW-17) and no new effect objects. The ring size is lead design (art) derived from the river krathong footprint.
- **D10 — "หมุนหามุมที่มองเห็นชัด" = the fixed `CAMERA_FLIGHT_OFFSET` view.** The isometric offset already shows the krathong clearly. Rotating or panning the world
  is tied to the open MFW-27 pan decision, so this card does not do it.
- **D11 — Stable pins: base spread first, then each pin replaces its nearest unpinned pick.** This keeps the MFW-25 properties (deterministic, time-invariant, even
  spread, pins always shown) and changes at most one rendered item per pin. That fixes the LOW hitch and avoids a full batch rebuild after MFW-34.
- **D12 — FALLBACK_2D gets the drawer, the zone load and a status line.** The 2D river view does not exist yet (MFW-33). The focus fields are its interface.
- **D13 — `data-find-my="following"` instead of the creation id.** MFW-28 asserts that no viewport `data-*` holds an id, and ids are not needed for e2e.
- **D14 — The drawer is an expandable inline panel without animation.** There is nothing to reduce under reduced motion. It works at 360 px. There is no focus trap,
  because it is not modal.

## Out of scope

The owner's private wish view and ownership proof (MFW-31). The 2D river renderer and 2D scrolling to the krathong (MFW-33). Instancing and the perf probe
(MFW-34). Release, own-krathong rendering and the server clock (MFW-23). Follow-cam, world rotation, pan fix, highlight effects. Cross-tab sync, server-side lists,
recovery after LocalStorage loss (decision 12 accepts the loss). Christmas find-my-ornament (cylindrical anchor).

## Risks

- **MFW-23 names differ on `main`.** Every use is marked ASSUMED INTERFACE. Adapt the call sites only and list the differences in the PR. If `onCreationSaved` is
  missing, stop (`needs-human`), because recording must hook the save path.
- **Merge overlap with MFW-34 in `index.tsx`.** The edits here are additive (an import, a few hooks, one JSX child, one attribute). Rebase onto whichever lands first.
- **Earlier releases are not listed.** Only creations saved after this card merges are recorded. The private test starts after that, so this is acceptable.
- **LocalStorage loss** (private mode, cleared site data) removes the list and the token together. The memory fallback lasts only for the page. Decision 12
  accepts this (no server query by owner).
- **Preview/CI in-memory backend.** It resets between deployments and cold starts, so entries can become "ไม่พบ…". That is expected in previews.
- **Camera does not follow.** The krathong drifts out of view after some time (Open question 1). The ring keeps following, and a second tap re-flies.
- **Render-phase state updates in `SceneViewport`.** This is the same pattern as `selectionMode`, guarded by `seenFocusRequestId`, so it cannot loop. The unit
  tests cover focus, re-focus, a drop and an unknown id.
- **Clock skew after a reload.** Without a fresh release, `riverNow` has no server offset. The anchor and the river still share the same clock, so the ring
  always matches the drawn krathong. Only the absolute position can differ slightly between devices (MFW-24 follow-up).
- **Reviewer grep noise.** Guard regexes and negative tests contain the private names. They are guards, not data paths.
