# Plan v2: L16, Christmas: Decorate a Growing Tree (public launch Sun 20 Dec 2026, 00:00 +07)

I changed no files. The v1 code survey in §0 of `/tmp/claude-0/-home-user-miniature-festival-world/4c9eb296-8ce6-5271-aa8f-4ab2fb7a8ffe/scratchpad/L16-plan-v1.md` still holds. I re-read the code this model depends on:
- the guarded insert and occupancy SQL (MFW-45 and MFW-62)
- `creationPlacement.ts`, `zoneManager.ts`, `zonePagination.ts`, `riverStretches.ts`, `zoneDirectory.ts`, `findMyCreation.ts`, `myCreationsVault.ts`
- `CylindricalCoord.ts`, `validateCoord.ts`
- `camera.config.ts`, `viewportFraming.ts`, `world.config.ts`

## 1. The growing-tree model (owner D2 = option B: one tree that keeps growing taller)

**Zones map to bands.** Zone *n* is band *n* of the one tree.
- Zone 1 is the crown band under the star. Each new zone is a new band added at the bottom, and the tree rises (D3).
- `ZONE_ID_MIN = 1` stays.
- `WORLD_INITIAL_ZONE_POLICY = "NEWEST"` already means the bottom band, which is the default framing.
- The existing rule "first zone below the cap with a free spot, else max+1" (`assignZoneForNewCreation`) is used unchanged. Older bands are always full, so in practice it picks the newest band.
- There is no "tree 2" and no wrap-around. The river's open question 37 ("after the last zone comes zone 1") does not apply to the tree.

**tierId is the global tier index counted from the top.** Tier 0 is the top tier under the star, and it grows downward.
- `bandOfTier(t)` and `tiersOfBand(n)` are pure functions of config.
- A tier's shape (radii, height, slot lattice) depends only on its tierId.
- Only its world Y depends on the total band count N: `baseY(t, N) = groundY + trunkH + depthFromBottom(t, N)`.
- When the tree grows from N to N+1 bands, every stored ornament moves by exactly `(0, bandHeight(N+1), 0)`. Its tier, angle and height never change. This is the spec §4.2 promise: "ของเดิมจะยังผูกกับ tierId เดิมโดยไม่เสียตำแหน่ง".
- The alternative, a tierId per band, would make a coord meaningless without `zone_id`. That is weaker for invariant B and for validating on the server.

**Persisted data does not change.** Only `{mode:"CYLINDRICAL_SURFACE", tierId, angleDeg, heightRatio}` is stored (invariant A). Every stored coord is an exact lattice point, because the server snaps to it. N is derived at render time as `max(zoneCount, band of any item being shown)` and is never stored.

**Band shape keeps a Christmas-tree silhouette.**
- **Crown band (zone 1):** a cone of 5 tiers. The radius widens from about 0.15 to `R_MAX` ≈ 1.95. The star sits on top (emissive, no halo).
- **Skirt bands (zone ≥ 2):** 3 identical tiers each. Each tier is a frustum that flares out like a pine branch layer (bottom radius 1.95, top radius 1.35, height about 1.4), so a tall tree reads as a stacked pine and not a column.
- The radius is capped so the tree always fits the phone framing. The camera only ever shows about 2½ bands, so the silhouette that matters is the band window plus the crown when you travel to the top.
- All skirt tiers share one geometry, so they render as one `InstancedMesh`. Draw calls stay the same whatever N is.

**Slot lattice (DRAFT for D4).**
- Each tier has 1–2 rows at fixed heightRatio values, with angles staggered from row to row.
- Crown slots per tier: 4, 7, 16, 22, 26 = **75**.
- Skirt: 26 per tier (rows of 14 + 12) × 3 = **78**.
- A unit test checks `bandCapacity(n) ≤ ZONE_ITEM_CAP` for every n. The SQL 80 cap stays as the backstop, and the lattice is the real limit. A band is full when no lattice slot is free (`isZoneFull` already supports `hasFreeSpot = false` below the cap).
- `TREE_MAX_BANDS` (technical, DRAFT 250, about 19,500 ornaments) bounds the tierIds the server accepts.

**Tap targets at the default framing.** Christmas gets its own DRAFT framing: view frame 4.6 × 6 and camera elevation about 20°, with the orthographic camera as today.
- At **390×844** the zoom is `min(143, 390/4.6, 844/6)` = **84.8 px per world unit**, and 44 px = 0.52 units.
- Skirt neighbours with both angles within ±45° of the view direction are at least about 57 px apart horizontally.
- Rows inside a tier are at least about 60 px apart.
- The tightest pair is the lower row of one tier against the top row of the tier below: about 0.60 units, or **≈ 51 px**.
- At 360×640 the zoom is 78.3, and that same pair is ≈ 47 px. 360 is the tight case; the test decides the final tier height.
- Hit proxies for existing ornaments have radius ≥ `MIN_TOUCH_TARGET_PX/2`. Overlaps go to the nearest centre.
- About 2.4 bands are visible, so the load radius `ZONE_STREAM_LOAD_RADIUS = 2` (5 bands) covers the view at `PINCH_ZOOM_MIN`.

**Placement on the server (no SQL change, no migration).**
1. Counts come from `mfw_zone_item_counts` (all non-expired rows, hidden ones included).
2. Bands are walked from 1. A band at or above its capacity is skipped without being read. For the first band below capacity, the server reads `mfw_zone_occupants` and computes free slots = lattice − snapped occupants.
3. The slot is `nearestFreeSlot` to the client's candidate. If the candidate's tier is in another band, its angle is projected onto that band. The distance is measured in tree space (arc length at the row radius plus depth from the top), so it does not depend on N.
4. If no band has a free slot, the ornament goes to band max+1.
5. `expectedOccupantIds` = all occupant ids of the chosen band. The per-(event, zone) advisory lock serialises inserts, and the 80 cap check stays.

**Hidden and flagged ornaments.**
- They keep their slot and count towards the cap. This is the MFW-45 rule, so un-hiding can never overflow a band.
- The public never sees them, so they leave invisible gaps that are never refilled.
- A client may put its ghost on a hidden-occupied slot. The server then moves the ornament to the nearest truly free slot (`movedByServer`, and the ornament bumps).
- `zoneCount` is the highest *visible* band. If a newest band is entirely hidden, the tree is one band shorter for viewers. This is harmless and documented.
- All Christmas rows share one `expires_at` (festival end + retention), so there are no gaps from expiry.

**Races.**
- Two people take the same slot: the loser re-reads and gets the nearest other free slot.
- The last slot of a band is taken: the loser goes to band N+1, and their client grows the tree and follows the ornament.
- `CREATE_CREATION_MAX_ATTEMPTS = 3` stays. A burst can return a 503, which is tested and measured on staging.
- A directory refresh that raises N while someone is exploring makes the tree rise. The camera keeps its depth relative to the tree (16.23).

**Streaming and camera.**
- The pagination gets a `"linear"` topology. The band index equals the zone id, with no wrap. The window is [b−2, b+2] ∩ [1, N]. Bands outside it are dropped and disposed (invariant E). The river keeps `"ring"`.
- The rig orbits the trunk with yaw and travels vertically along it. The band under the camera, with hysteresis, drives `setCurrentStretch`.
- Only bands in view plus a margin are mounted, at most `TREE_RENDERED_BAND_MAX` = 5. That is ≤ 80 rendered items per zone and ≤ 400 in total, the same precedent as MFW-58 rendering several stretches.
- Find My travels to the band, then orbits to the ornament.

**Hanging.**
- The open band is the lowest loaded band with a visible free slot. If there is none, a virtual empty band N+1 appears in hang mode.
- While hanging, vertical travel is clamped to the open band and orbiting is free.
- The ghost is the free slot nearest the view centre (D6). A tap resolves with `worldToCylindricalCoord` + `nearestFreeSlot` in the 3D layer only.

The core is generic (`growingTree.ts` + a per-event config), so Chinese New Year's mandarin tree (§1.1.4) can reuse it.

## 2. Epic L16: cards

Labels on every card: `loop-16`, `christmas` unless noted. Sizes: S ≈ ½ loop-day, M ≈ 1. Nothing is L any more. ∥ means the card can run in parallel with the others in its wave.

### Wave 0 (27–30 Nov, all ∥). Priority order inside the wave: 16.7, 16.2→16.3, 16.13, 16.6, 16.8, 16.5, 16.1, then 16.9 and 16.10 (must merge by 11 Dec)

**16.1 Record the owner's 2026-11-27 decisions** — S — christmas — blockedBy: —
- Goal: the docs say that Christmas is being built as one growing tree.
- AC1: `docs/spec/open-questions.md` gets these rows:
  - D1 and D2=B ("zone n = band n of one tree; tierId = global tier index from the top")
  - D11 before launch
  - D3–D14 marked DRAFT where accepted as drafts
  - R1–R9 (§4) as open, each with its default
  - Row 15's "2D fallback" marked superseded by row 46
  - A note that row 37 (wrap) does not apply to the tree
  - The MFW-71 Christmas follow-up closed
- AC2: the CLAUDE.md text "Christmas stays a stub" and the launch note in `docs/spec/01-roadmap.md` are updated, and `tests/unit/spec-lint.test.ts` passes.

**16.2 Server-only override of the active event on non-production deployments** — S — christmas, infra, privacy — blockedBy: —
- Goal (D1): staging and e2e can open Christmas, and production cannot.
- AC1: `src/services/api/activeEvent.ts` reads a server-only env var (e.g. `MFW_ACTIVE_EVENT_OVERRIDE`) per request.
  - It is ignored when `VERCEL_ENV === "production"`.
  - It is never `NEXT_PUBLIC`, a query string, a cookie or a header.
  - Unknown or disabled ids fail closed.
  - Precedence: env (non-production) > `ACTIVE_EVENT_OVERRIDE` constant > date.
  - `EVENT_FEATURE_FLAGS.christmas = true`.
- AC2: `tests/unit/active-event-boundary.test.ts` is rewritten for the new rule: production ignores the env, the name is not `NEXT_PUBLIC_`, and the client bundle never reads it. `activeEvent.test.ts` covers precedence.

**16.3 Playwright `christmas` project** — S — christmas, infra — blockedBy: 16.2
- AC1: `playwright.config.ts` runs a second `next start` on its own port with the override, `testMatch: christmas-*.spec.ts`.
  - New `tests/e2e/helpers/christmas.ts` and `fixtures/christmasFixtures.ts`, including a 12-band directory fixture. Their literals are pinned by a unit test.
  - A smoke e2e sees `data-active-event="christmas"`.
  - The Loy suite is unchanged and `playwright-config.test.ts` is updated.
- AC2: `docs/ci.md` puts the Christmas project in its own shard and records the measured CI time.

**16.4 Staging environment and runbook (owner-assisted)** — S (owner time) — infra, db — ∥
- AC1: `docs/runbooks/staging.md` covers:
  - The second Supabase project, with migrations applied in the order MFW-12 → 13 → 45 → 31 → 62 → the 16.10 migration.
  - Branch-scoped server-only env, so PR previews still have no DB.
  - `PRIVATE_WISH_KEY`/`_ID`, the 16.10 HMAC key and the 16.2 override.
  - Vercel deployment protection.
  - An anon-key denial checklist.
- AC2: the owner confirms staging opens Christmas and that POST /api/creations writes to the DB. The result goes in `docs/follow-ups.md`.
- Fallback until done: a preview with the in-memory backend, for visual checks only.

**16.5 Per-event UI copy** — M — christmas, ui — ∥
- AC1: one per-event copy table (`src/config/events/eventCopy.config.ts`) replaces the direct imports in:
  - FlowRoot, CustomizerPanel, RitualReleasePanel, WishModal, InspectPopup
  - MyCreationsDrawer (with a per-event icon), OwnerWishSection, SceneTapHint
  - ZoneNavigator, including new vertical labels (DRAFT "ขึ้นไปชั้นบน" / "ลงไปชั้นล่าง")

  Loy strings stay byte-identical and the existing tests pass.
- AC2: Christmas copy is DRAFT Thai (D13). A unit test checks that no Christmas string contains กระทง, สายน้ำ, คุ้งน้ำ or ลอย.

**16.6 Ornament appearance and server allowlist** — S — christmas, privacy — ∥
- AC1:
  - `src/config/ornamentDesigns.config.ts` defines `ball_01`, `star_01`, `bow_01` and a default.
  - `parseOrnamentAppearance` accepts the exact key set `{design}` (D7) and returns a fresh copy.
  - It is registered for `christmas` in `APPEARANCE_PARSERS`, and `EventAppearance` becomes a union.
- AC2: `useBuilderStore.chooseDesign(eventId, id)` keeps a default per event, and Loy is unchanged. Tests cover parser positive and negative cases, a krathong appearance for Christmas → 400, and the reverse.

**16.7 Growing-tree model: bands, tiers, slot lattice (three-free, shared by server and client)** — M — christmas, 3d, perf, dev-opus — blockedBy: —
- Goal: the one deterministic model from §1.
- AC1: `src/core/world/growingTree.ts` + `src/config/events/christmas.tree.config.ts` (crown and skirt templates, DRAFT D4/R1):
  - `bandOfTier`, `tiersOfBand`, `tierCountForBands(N)`, `tierShape(t)` (independent of N)
  - `treeTierGeometry(t, N): CylindricalTierGeometry`
  - `slotsOfBand(n)`, `bandCapacity(n)`, `snapToSlot`
  - `nearestFreeSlot(candidate, occupied, band)` in tree space
  - `TREE_MAX_BANDS`
  - `latticeFingerprint()`, pinned by a test

  Tests:
  - capacity ≤ 80 for n = 1..`TREE_MAX_BANDS`
  - slot coord → world(N) → coord round-trip for N ∈ {1, 2, 7} through `cylindricalCoordToWorld` (invariant B)
  - world(c, N+1) − world(c, N) = (0, bandHeight(N+1), 0) exactly
  - tier shape does not depend on N
- AC2: `src/config/events/christmas.camera.config.ts` holds the DRAFT framing (frame 4.6 × 6, elevation ≈ 20°, R7). A pure projection test checks that at the default framing on 390×844 and 360×640:
  - every neighbouring slot pair (same row, adjacent rows, adjacent tiers) with both angles within ±45° of the view direction is ≥ `MIN_TOUCH_TARGET_PX` apart on screen
  - the hit radius is ≥ `MIN_TOUCH_TARGET_PX/2`

  No three import, checked by the structure or import test.

**16.8 Cylindrical inverse and surface normal** — S — christmas, 3d, dev-opus — ∥
- AC1: `CylindricalCoord.ts` gains `worldToCylindricalCoord(hit, tier)` (angle wrap, h clamped to [0, 1], null off the surface) and `cylindricalSurfaceNormal(coord, tier)` (frustum normal, unit length). No three import.
- AC2: forward ∘ inverse round-trip within a stated tolerance (1e-9) over random tiers. The normal is perpendicular to both surface tangents. There are tests at the edges (0/360°, h = 0/1, R_top = 0).

**16.9 Rate limit on POST /api/creations and /api/reports** — S/M — privacy, infra (+ db, migration only for the fallback) — ∥, must merge by 11 Dec (D11)
- AC1: the mechanism follows R5.
  - Default: Vercel Firewall rate-limit rules, configured by the owner and documented in the runbook, with a staging check that the limit returns 429.
  - Fallback when the plan has no rate limiting: a new migration with a fixed-window table, RLS enabled, restrictive deny policies for anon/authenticated, service-role-only functions, and a migration test (invariant D).
- AC2: `createCreationClient` and `reportClient` map 429 to a calm DRAFT Thai message, the ritual stays retryable, and there are unit and e2e (mocked) tests.

**16.10 Report dedupe per reporter** — M — privacy, db, migration — ∥, owner-merge, must merge by 11 Dec (D11)
- AC1: a new migration. Old migrations are never edited.
  - Table `creation_reports (creation_id fk → creations_public on delete cascade, reporter_hash, created_at, primary key (creation_id, reporter_hash))` with RLS enabled, restrictive deny policies for anon/authenticated, and `revoke all`.
  - `mfw_report_creation_v2(p_creation_id, p_reporter_hash)` inserts with `on conflict do nothing` and applies the MFW-13 increment and hide-at-3 only when a row was actually inserted. The old function stays.
  - `reporter_hash` = HMAC-SHA-256 of the client IP with a server-only key (R5). The raw IP is never stored, logged or returned.
- AC2: a migration test in the `report-migration.test.ts` pattern and handler tests: the same reporter three times → count 1; three distinct reporters → hidden. The privacy-auditor runs and the runbook's apply order is updated.

**16.13 Linear band streaming in the zone pagination** — M — christmas, perf — ∥ (no blocker)
- AC1: `createZonePagination({topology: "linear"})`; the default `"ring"` keeps Loy unchanged.
  - The band index equals the zone id, with an identity anchor that never moves.
  - The stream window is [b−`ZONE_STREAM_LOAD_RADIUS`, b+R] ∩ [1, zoneCount], with no wrap.
  - `jumpBy(±1)` stops at 1 and at zoneCount.
  - `loadZone(z)` sets the current band to z.
  - A directory refresh that raises zoneCount never changes the current band.
- AC2: unit tests cover the window, dropping far bands (invariant E), clamping and refresh. Every existing pagination, endless-river and find-my test passes unchanged.

### Wave 1 (1–3 Dec)

**16.11 Tree placement on the server write path** — M — christmas, privacy — blockedBy: 16.6, 16.7 (∥ 16.12, 16.14, 16.15)
- AC1: `createTreePlacementStrategy` is registered for `christmas` and implements the §1 algorithm.
  - `acceptsCoord` takes only CYLINDRICAL with `tierId < tierCountForBands(TREE_MAX_BANDS)`.
  - Fills go through `assignZoneForNewCreation`, with hidden rows counted.
  - The ornament gets the nearest free slot, and `expectedOccupantIds` = the band's occupants. No SQL change.
  - `FESTIVAL_ENDS_AT.christmas = "2026-12-27T00:00:00+07:00"`.
- AC2: route and strategy tests:
  - an exact free slot → 201 with the same coord
  - a slot taken by a visible or a hidden row → nearest free slot in the band
  - a full band → band N+1 at the same angle
  - an off-lattice candidate is snapped
  - a spline coord or a tierId past the max → 400
  - a last-slot race in the in-memory repo → one wins and the other lands in band N+1
  - a Christmas wish with PII → 422 (G)
  - no `owner_token*` or `private_wish_text` in the response (C)

  The privacy-auditor runs.

**16.12 Generalise the release pipeline and ritual for "hang"** — M — christmas, privacy — blockedBy: 16.6, 16.7 (∥)
- AC1:
  - `ritualStateMachine.ts` gets union types: landing `RiverSpot | TreeSlot`, `SavedRelease.coord: PersistableCoord`, hint `TAP_ON_TREE`.
  - `releaseCreation.ts` takes a per-event adapter registry (guard, default candidate, landing, coord builder, `didServerMove`, appearance serialiser). The Loy adapter is today's code.
  - The 201 check in `createCreationClient.ts` uses `parsePersistableCoord` plus the event's mode and keeps the private-key scan.
  - Every Loy ritual unit and e2e test passes unchanged.
- AC2: tests for the Christmas adapter:
  - the body has the ornament appearance and only the 4 CYLINDRICAL keys (A)
  - `didServerMove` is true when the slot or the band changed
  - a moderation block → REVISE_WISH
  - the private text is cleared after the save

**16.14 Christmas scene shell and tree renderer** — M — christmas, 3d, perf, dev-opus — blockedBy: 16.3, 16.7 (∥)
- AC1: `FlowRoot` lazy-loads `src/components/canvas3d/christmas/ChristmasSceneViewport.tsx` for Christmas. An e2e network check shows the river chunk is not fetched.
  - The scene reuses `getSceneRenderSettings`, `CANVAS_GL_OPTIONS`, `SceneLighting` and the input separator.
  - The placeholder clay tree comes from `growingTree`: trunk, crown tiers, one `InstancedMesh` for all skirt tiers, and the star.
  - Height comes from zoneCount. Only bands in view plus a margin are mounted. The ground is a plain snow disc.
- AC2: a disposal test on unmount, and a Christmas environment budget in `performance.config.ts`, with a test that draw calls do not depend on N.
  - Screenshots at 390×844 and 1440×900 for N = 1, 3 and 12 (fixture).
  - This is the owner's art checkpoint for R1.

**16.15 Placeholder ornament models and the GLB-swap contract** — M — christmas, 3d, art, perf, dev-opus — blockedBy: 16.6 (∥)
- AC1: `src/core/customization/ornamentMeshData.ts` builds procedural vertex-coloured ball, star and bow in the krathong-body contract, with three LODs, the hook at +Y and the outward axis at +Z. Triangle guards per LOD. Thumbnails are generated as in MFW-78.
- AC2: a design-source registry (`procedural | glb`). The GLB parser makes anchors optional, and a fixture GLB loads through the same path. `docs/design/models.md` §11 documents the contract for the owner.

### Wave 2 (3–7 Dec)

**16.16 Winter look: palette, DAY and NIGHT, snowy plaza ground** — S/M — christmas, 3d, art — blockedBy: 16.14 (∥)
- AC1: `christmas.look.config.ts` has DAY and NIGHT presets, a round snowy plaza with a ring path (D8) and the snow material. No new shader program on LOW (`E2E_MAX_SHADER_PROGRAMS`).
- AC2: screenshots for DAY and NIGHT × HIGH and LOW, on phone and desktop.

**16.17 Orbit and vertical-travel camera rig** — M — christmas, 3d, interaction, dev-opus — blockedBy: 16.13, 16.14 (∥)
- AC1: a pure `src/core/camera/treeRig.ts`:
  - Horizontal drag = yaw about the trunk, with wrap. Vertical drag = focus travelling along the trunk, clamped from the newest band (with the plaza in view) up to the star. Pinch and wheel zoom are clamped.
  - Coasting with rubber-band edges. Reduced motion: instant, no coast.
  - `WorldRotateButton` steps the yaw.
  - The band under the focus, with hysteresis, drives `pagination.setCurrentStretch(band)`.
  - The focus is kept as depth from the star, so the tree rising does not move what you look at.
  - `isCameraLocked` becomes per event.
- AC2: unit tests for bounds, wrap, hysteresis and reduced motion. E2E on the 12-band fixture: a horizontal drag orbits; a vertical drag changes the current band; the network log shows only bands b±2 fetched.

**16.18 Ornaments on the tree (instanced, per streamed band)** — M — christmas, 3d, perf, dev-opus — blockedBy: 16.13, 16.14, 16.15 (∥)
- AC1: `streamedZoneItems` become instanced batches per design across the mounted bands.
  - Position and orientation are derived every render from the coord + N (`treeTierGeometry` + surface normal), with world scale locked.
  - LOD per quality tier from a new `ORNAMENT_TIERS` (D9); no shadows on LOW.
  - A band that leaves the window disposes its batches.
  - Budget test: ≤ 80 per band, ≤ `TREE_RENDERED_BAND_MAX` × 80 in total.
- AC2: a perf e2e on LOW in SwiftShader on the 12-band fixture, at the newest band and again after travelling to band 3, stays above `DROP_TO_LOW_FPS_THRESHOLD`. Screenshots of a full band, DAY and NIGHT.

**16.19 Winter village around the plaza** — M — christmas, 3d, art, perf, dev-opus — blockedBy: 16.16
- AC1: a ring layout in `christmas.village.config.ts` / `src/components/models/christmas/`.
  - It reuses the house shell (with a snow roof), the foliage parts as snowy pine clumps, the lamps and the silhouette villagers.
  - Everything is instanced. Villagers on LOW may be 0.
- AC2: a budget test per quality tier and screenshots for DAY and NIGHT, phone and desktop (art checkpoint).

**16.20 Customizer: choose an ornament design** — S/M — christmas, ui, 3d — blockedBy: 16.5, 16.6, 16.14, 16.15 (∥)
- AC1: CustomizerPanel lists the event's designs from the registry. The hero ornament shows in the customize view, and rotate and zoom work.
- AC2: picking the star gives `{design:"star_01"}`. Touch targets are ≥ 44 px at 360×640, 390×844 and 1440×900. Screenshots for DAY and NIGHT.

### Wave 3 (8–10 Dec)

**16.21 Hang mode: open band, ghost and tap-to-slot** — M — christmas, 3d, interaction, dev-opus — blockedBy: 16.8, 16.12, 16.17, 16.18
- AC1:
  - The open band is the lowest loaded band with a visible free slot. If there is none, a virtual empty band N+1 is shown and the tree rises (R3; instant under reduced motion).
  - The camera flies to the open band. Vertical travel is clamped to it and orbiting is free (R2).
  - The ghost is the free slot nearest the view centre (hovered on desktop) and faces out along the surface normal.
  - A tap on the tree resolves through `worldToCylindricalCoord` → `nearestFreeSlot` in the open band and hangs there. "แขวน" hangs at the ghost (D6).
  - Hit points never leave the 3D layer (A).
- AC2: e2e hangs once via the button and once via a tap.
  - The captured POST coord has exactly `mode/tierId/angleDeg/heightRatio`, with tierId in the open band.
  - The flow reaches SHARED_WORLD_EXPLORE.
  - Screenshots of the ghost, DAY and NIGHT.

**16.22 Hang flight, sparkle, settle and server moves** — M — christmas, 3d, interaction, perf — blockedBy: 16.21 (16.11 for staging only)
- AC1: the ornament flies to its slot, a pooled sparkle plays (a new `EFFECT_KINDS` entry with per-tier caps), and it swings briefly to settle. Reduced motion: instant, no swing, no sparkle motion.
- AC2:
  - A move inside the band makes the ornament bump to its final slot.
  - A move to band N+1 raises zoneCount: the tree rises and the camera follows the ornament.
  - E2E with mocked 201s covers both cases, and a test proves no `new` effect object is made per tap.

**16.23 Growth when the band count rises** — S — christmas, 3d — blockedBy: 16.17, 16.18 (∥ 16.21)
- AC1: when zoneCount rises (a directory refresh or your own save), the tree rises by `bandHeight(N+1)` with a spring (instant under reduced motion). Stored coords stay the same.
  - A viewer framing the newest band is moved to the new newest band.
  - Anyone else keeps their depth relative to the tree.
- AC2: unit tests on the offset and the camera rule. An e2e where the fixture directory goes from 3 to 4 bands, with screenshots before and after.

**16.24 Vertical band navigator and height gauge** — S — christmas, ui, interaction — blockedBy: 16.5, 16.13, 16.17 (∥)
- AC1: ZoneNavigator gets a vertical variant for the linear topology.
  - ▲ moves toward the star, ▼ toward the newest band. Each is disabled at its end, with no wrap (R4).
  - Moves go through the travel driver, and the navigator is hidden when there is one band.
  - A slim DOM gauge shows where you are on the tree and marks this device's ornaments by band (vault zoneId only, no coord).
- AC2: e2e tests, touch targets ≥ 44 px, and screenshots on phone and desktop.

**16.26 Wish bubble and own popup for ornaments** — M — christmas, ui, privacy — blockedBy: 16.18 (∥)
- AC1: another person's ornament shows the fading public bubble, anchored at its derived position. Your own ornament opens the popup with `designThumbnailUrl(eventId, appearance)`, the owner switch and the private reveal.
- AC2: tests prove the bubble and the public store hold no private text or token (C). E2E plus screenshots for DAY and NIGHT.

### Wave 4 (10–12 Dec)

**16.25 Find My on the tall tree** — M — christmas, ui, interaction — blockedBy: 16.17, 16.18
- AC1: Find My (per-event icon and copy) calls `loadZone(band)`.
  - The camera travels vertically to the band, using `max(zoneCount, band)`, and orbits the shorter way to the ornament's angle.
  - The ornament gets the MFW-67 bounce and 1.2× mark, with no rings. Reduced motion: an instant cut.
  - The day/night toggle and rotate still work.
- AC2: e2e on the 12-band fixture: from the default framing (band 12), an ornament in band 2 ends up in view and tappable. Screenshots on phone and desktop.

**16.27 Visit the tree without hanging ("ดูต้นไม้")** — S — christmas, ui — blockedBy: 16.25
- AC1: a secondary action in the customize bar sends a new flow event to SHARED_WORLD_EXPLORE without creating anything, with a state-machine test (D10). Loy is unchanged.
- AC2: e2e: reload → ดูต้นไม้ → Find My → the ornament is in view.

**16.28 (optional, may ship after 20 Dec) Village taps and falling snow** — M — christmas, 3d, interaction, perf — blockedBy: 16.19
- AC1: house, pine, lamp and empty-ground taps reuse the MFW-60/85 reactions on the plaza anchors, and `SceneEffects` gets an optional `frame`.
- AC2: falling snow reuses the `AmbientLife` motes (D14): static under reduced motion, none on LOW. E2E taps.

### Launch

**16.29 Private test on staging and device pass** — S (owner + loop) — christmas, infra, perf — blockedBy: 16.4, 16.9, 16.10, 16.22, 16.23, 16.24, 16.25, 16.26, 16.27
- AC1: a checklist is run on iOS Safari and Android across all three quality tiers:
  - FPS at the newest band and after travelling up 5 bands
  - tap accuracy on a full band
  - a two-device race for the last slot of a band
  - a 429 from the rate limit
  - one device reporting three times hides nothing

  Results go in `docs/follow-ups.md`, and fixes become new cards. Testers and devices: D15.

**16.30 Launch switch, data wipe and lattice freeze** — S — christmas, infra, db, privacy — blockedBy: 16.29 (owner-merge)
- AC1: the `ACTIVE_EVENT_OVERRIDE` constant becomes `null`. Fake-clock tests: 19 Dec 23:59 +07 → the calm screen with the Christmas dates; 20 Dec 00:00 → christmas; 27 Dec 00:00 → none.
- AC2:
  - `supabase/scripts/wipe_private_test.sql` is a one-off the owner runs, not a migration, on the production DB. It is verified with count = 0.
  - The production migrations, including 16.10, are confirmed applied.
  - The `latticeFingerprint` test is marked "frozen 19 Dec 2026". After launch, any change needs a new lattice version, never moved slots.
  - The privacy-auditor runs.

## 3. Critical path and dates

| Wave | Cards (∥ inside a wave) | Dates |
|---|---|---|
| 0 | 16.7, 16.2→16.3, 16.13, 16.6, 16.8, 16.5, 16.1, 16.4 (owner), 16.9, 16.10 | Fri 27 – Mon 30 Nov |
| 1 | 16.11 ∥ 16.12 ∥ 16.14 ∥ 16.15 | Tue 1 – Thu 3 Dec |
| 2 | 16.16 ∥ 16.17 ∥ 16.18 ∥ 16.20, then 16.19 | Thu 3 – Mon 7 Dec |
| 3 | 16.21 → 16.22; ∥ 16.23, 16.24, 16.26 | Tue 8 – Thu 10 Dec |
| 4 | 16.25 → 16.27 (16.28 optional) | Thu 10 – Sat 12 Dec |

**Critical path:** 16.7 (M) → 16.14 (M) → 16.17 (M, also needs 16.13) → 16.21 (M, also needs 16.8, 16.12, 16.18) → 16.22 (M) → 16.25 (M) → 16.27 (S) → 16.29 (owner) → 16.30 (S).
- That is about 6.5 loop-days on the path. Total effort is about 22 loop-days without 16.28, so it needs 2–3 parallel lanes (`loop-epic --parallel 2`).
- **Code-complete:** Sun 13 Dec. Mon 14 Dec is buffer. 16.9 and 16.10 must be merged by 11 Dec so staging tests them.
- **Staging test:** Tue 15 – Fri 18 Dec, fixes only.
- **Sat 19 Dec:** wipe, lattice freeze, constant set to `null`, deploy. The calm screen shows until **Sun 20 Dec 00:00 +07**.
- **Owner checkpoints, same day as each card lands:**
  - 16.14 (silhouette and numbers, R1)
  - 16.15 (ornaments)
  - 16.16 and 16.19 (village)
  - 16.21 (ghost)
- Owner-merge cards on or near the path (16.12, 16.11, 16.10, 16.30) need a daily owner-merge slot.

## 4. What changed vs v1

1. **D2 = B.** One tree, and zone n = band n. There is no "tree 2". The ‹ › tree switch becomes ▲▼ plus a height gauge (new 16.24).
2. **tierId is defined** as the global tier index from the top. A tier's shape is fixed by its tierId, and only Y depends on the band count. The N-shift test is exact.
3. **Band shape.** A crown cone, then flared skirt bands at a capped radius. Capacities are 75 and 78 (≤ 80), replacing "5 tiers summing to exactly 80".
4. **New cards for the vertical model:**
   - linear band streaming in the pagination (16.13)
   - vertical travel in the rig (16.17)
   - the growth camera rule (16.23)
   - the open-band / virtual-band rule for hanging (16.21)
5. **Server placement is band-aware.** Hidden rows count, a last-slot race goes to the next band, tierIds have a sanity cap, and still no SQL change.
6. **L cards split:**
   - v1 16.9 → 16.14 + 16.16
   - v1 16.15 → 16.21 + 16.22
   - v1 16.6 → 16.7 + 16.8
   - v1 16.2 → 16.2 + 16.3
   - v1 16.20 → 16.9 + 16.10, now launch gates (D11) with the dedupe migration specified
7. **The tap-target check is now an AC** (16.7: a projection test at 390×844 and 360×640 with Christmas framing constants). In v1 it was only a risk.
8. **The perf e2e uses a tall-tree fixture** (12 bands, at the newest band and after travelling). Find My is now vertical travel plus orbit.
9. **Lattice freeze at launch** (16.30). D1 is confirmed, so 16.2 is no longer conditional.
10. Code-complete moves from about 14 Dec to 13 Dec, with 14 Dec as buffer.

## 5. Remaining owner decisions (recommended default for each)

- **R1 — Band shape and numbers.** Default: crown 5 tiers / 75 slots, skirts 3 tiers × 26 = 78, R_MAX ≈ 1.95, skirt tier height ≈ 1.4. Approve from the 16.14 screenshots at N = 1, 3 and 12.
- **R2 — Where you can hang.** Default: only on the open (newest) band. Vertical travel is clamped there while hanging, and you can still orbit to the back.
- **R3 — When the newest band looks full.** Default: an empty new band appears below in hang mode and the tree rises ("ชั้นใหม่รอคุณอยู่").
- **R4 — Band navigation.** Default: no wrap. ▲ goes toward the star, ▼ toward the newest band, each disabled at its end.
- **R5 — Abuse protection details.**
  - Mechanism: Vercel Firewall rate limit if the plan has it, else a DB table. The owner checks by 1 Dec.
  - DRAFT numbers: 5 POST /api/creations per minute and 20 per day per IP; 10 reports per minute per IP.
  - Dedupe key: HMAC(IP) with a server-only key; raw IPs are never stored.
- **R6 — First view.** Default: the newest band with the plaza (D5). No intro flight down from the star; that could come after launch.
- **R7 — Christmas camera.** Default: frame 4.6 × 6, elevation ≈ 20° (DRAFT), approved with R1.
- **R8 — Whole-tree overview zoom-out.** Default: after launch. The height gauge covers "where am I" for 20 Dec.
- **R9 — Height sanity cap.** Default: `TREE_MAX_BANDS` = 250 (about 19,500 ornaments). Past it, a calm 409.
- **D15 — Testers and devices for 16.29 (open question 20).** Needed by 14 Dec.

## 6. Top risks and mitigations

1. **Owner art review rounds** (tall silhouette, ornaments, village). Fixed checkpoints the day each card lands. The numbers are config and the projection test is the gate, so tuning is cheap.
2. **Complexity of vertical travel, orbit and streaming.** Pure, three-free modules (16.7, 16.13, 16.17) with unit tests, copying the MFW-58 patterns. Fallback if 16.17's vertical drag slips: ▲▼ jumps only (16.24), which still meets invariants E and B.
3. **The tree rising under the viewer** (positions depend on N). 16.23 has a tested camera rule. Find My uses `max(zoneCount, band)`, and the N-shift test is exact.
4. **Changing the lattice after launch would move or double-book slots.** The fingerprint test is frozen on 19 Dec. Any change needs a new lattice version, which is not planned.
5. **Phone tap accuracy.** The 16.7 projection test, nearest-slot picking, pinch zoom, and the 16.29 device pass.
6. **Report abuse and invisible gaps.** 16.10 dedupe and 16.9 rate limit before launch. Gaps from hidden ornaments are accepted and documented.
7. **A last-slot burst ending in a 503** after 3 attempts. The 16.11 race test, a staging race in 16.29, and the client keeps the ritual retryable.
8. **SwiftShader CI time** for a tall tree plus the village. The Christmas project gets its own shard (16.3) and the post-release wait follows the existing pattern.
9. **Loy regressions** from generalising the ritual, release, client check and pagination. Each of 16.12 and 16.13 requires the Loy suite to pass unchanged, and `"ring"` stays the default.
10. **Owner dependencies:** staging (16.4), firewall availability (R5) and owner-merge latency. Fallback: a preview with the in-memory backend for visual checks. Decide R5 by 1 Dec, and give owner-merges a daily slot.

### Critical Files for Implementation
- /home/user/miniature-festival-world/src/services/api/creationPlacement.ts
- /home/user/miniature-festival-world/src/services/api/zonePagination.ts (with /home/user/miniature-festival-world/src/core/world/riverStretches.ts)
- /home/user/miniature-festival-world/src/core/coordinates/CylindricalCoord.ts
- /home/user/miniature-festival-world/src/services/api/releaseCreation.ts (with /home/user/miniature-festival-world/src/core/ritual/ritualStateMachine.ts)
- /home/user/miniature-festival-world/src/components/ui/FlowRoot.tsx
- Also:
  - /home/user/miniature-festival-world/src/core/world/zoneManager.ts
  - /home/user/miniature-festival-world/src/config/world.config.ts
  - /home/user/miniature-festival-world/src/config/camera.config.ts
  - /home/user/miniature-festival-world/src/core/camera/viewportFraming.ts
  - /home/user/miniature-festival-world/src/services/api/activeEvent.ts
  - /home/user/miniature-festival-world/tests/unit/active-event-boundary.test.ts
  - /home/user/miniature-festival-world/src/services/api/createCreationClient.ts
  - /home/user/miniature-festival-world/src/services/api/reportHandler.ts
  - /home/user/miniature-festival-world/supabase/migrations/20261124020000_mfw45_guarded_creation_insert.sql (reference, unchanged)
  - /home/user/miniature-festival-world/supabase/migrations/20261126000000_mfw62_wish_visibility_switch.sql (reference, unchanged)
  - /home/user/miniature-festival-world/supabase/migrations/20261124010000_mfw13_report_creation.sql (reference; 16.10 adds a new migration beside it)
  - /home/user/miniature-festival-world/src/config/performance.config.ts
  - /home/user/miniature-festival-world/playwright.config.ts

---

# v3 — owner decisions of 2026-11-27 (second round) and the owner's Christmas models

Second round: same Supabase project with a `data_scope` column (test / live), wipe everything now, Vercel Hobby (DB-backed rate limit), the owner alone tests, art and Thai copy reviewed by the owner after merge. Models: the owner's eight Hunyuan3D models (six hangable designs ball, star, bow, bell, stocking, gift; a snowman and a gift pile as props).

## Code facts behind the changes

**What the code tells us**
- **No migration is needed for the New Year event id.** The MFW-12 check already allows `event_id = 'new_year'`, the `PLANAR_ZONE` coord mode, and `parsePersistableCoord` validates u and v.
- **The data-scope column touches every SQL function.** Each one filters only by `event_id` (+ `zone_id`), or by creation id:
  - `mfw_zone_item_counts`, `mfw_zone_occupants`, `mfw_insert_creation_guarded_v2` (lock + occupant set + 80 cap)
  - `mfw_creation_ownership`, `mfw_creation_wish_state`, `mfw_open_creation_wish`, `mfw_close_creation_wish`, `mfw_report_creation`
  - So a scope needs a new migration with scoped versions, plus wiring in the repository.
- **The repository is built once from env** (`createCreationRepositoryFromEnv`). The deployment's scope can be bound there, so callers do not change.
- **The guarded insert is a compare-and-insert on the whole occupant set.** Any concurrent write to the same zone forces a retry. A burst into one band or zone (Christmas opening, New Year midnight) will produce retries and then 503s.
- **The server clock offset is estimated only from the POST 201** (`estimateServerClockOffsetMs`). The countdown needs its own sample before anyone creates anything.
- **The firework pool is small and slow:** caps HIGH 3 / MEDIUM 2 / LOW 1, rise 750 ms + burst 2000 ms, and `FIREWORK_MIN_LAUNCH_INTERVAL_MS` = 333 ms (WCAG). The midnight show has to be paced from these numbers.
- **Feature flags block staging.** A disabled event fails closed even under the MFW-88 env override. So New Year needs a "non-production only" flag value, or staging cannot open it without opening production on 28 Dec.

## L16 changes

**Unchanged, in progress (not re-planned):**
- 16.2 / MFW-88: `MFW_ACTIVE_EVENT_OVERRIDE`. Staging sets it on the staging branch only.
- 16.6 / MFW-92, 16.7 / MFW-93, 16.8 / MFW-94, 16.13 / MFW-99.

**Rule for the whole epic** (add to the epic description; it also changes the wording of 16.5, 16.14, 16.15, 16.16, 16.19, 16.20 and 16.21): "The owner reviews art and Thai copy afterwards, from PR screenshots and staging. No card waits for that review, and feedback becomes new owner-review cards." The AC still require the screenshots.

**Card changes at a glance**

| Card | Change |
|---|---|
| 16.1 | Amended |
| 16.4 | Replaced: same Supabase + scope + staging + runbook |
| 16.9 | Replaced: DB-backed rate limit; the client part moves to 16.35 |
| 16.10 | Amended: scope and shared HMAC key |
| 16.28 | No longer optional (L17 needs it); the snow moves to 16.37 |
| 16.29 | Replaced: owner-only pass |
| 16.30 | Replaced |
| 16.31–16.37 | New |

### Replacement and new story JSON

Story JSON: `docs/backlog.json` (L16; new keys MFW-117 … MFW-124).


**Why 16.30 wipes what it wipes.** Test rows are already invisible to production, because production reads only the live scope. So the launch wipe is privacy hygiene for the test private wishes, not a correctness need. The Loy private test ran on production and so wrote live rows, which is why every loy_krathong row must go. "Christmas live = 0" is a cheap assertion that production never accepted a Christmas write before launch.

**Why the column defaults to `test`.** A writer that names no scope can never put anything on the live site. Old production code that is still deployed between applying 16.32 and deploying 16.33 writes test rows, and that is correct, because it is the Loy private test.

---

## The owner's models

### What the models mean for the plan

**The asset byte budget needs its own entry.** The krathong pack already uses 1 494 068 of its 1 572 864 public bytes (`KRATHONG_DESIGN_ASSET_BUDGET`). Christmas models get a separate `CHRISTMAS_MODEL_ASSET_BUDGET`: each public file ≤ 256 KiB, the Christmas public total ≤ 1.5 MiB, and the decimated sources ≤ 640 KiB.

**Tree triangles set the LOD targets.** Up to `TREE_RENDERED_BAND_MAX` = 5 bands × 80 means 400 ornaments may be mounted.
- The river precedent for a full HIGH zone is 168 960 triangles (80 × 1 056 × 2 for the shadow pass).
- DRAFT `ORNAMENT_MAX_TRIANGLES_BY_LOD` = full (customizer hero) 4 000, medium (tree on HIGH/MEDIUM) 400, low (tree on LOW) 100.
- Ornaments cast no shadows on any tier (DRAFT).
- With those numbers the mounted window is 400 × 400 = 160 000 triangles on HIGH, under the river precedent.
- On LOW, cap the mounted bands at 3: 240 × 100 = 24 000 triangles, close to today's LOW river load of 24 × 868.

**Ornament size must fit the 16.7 lattice.** The tightest slot pair is about 0.60 world units. Each design's scaled bounding radius must stay ≤ half the minimum slot spacing, so neighbours never overlap. This becomes a test in 16.15. 16.7 is in progress, so this is only a note for it.

**The loading fallback can be tiny.** The 16.15 procedural placeholder ornaments are no longer needed. Following the MFW-65 rule ("the procedural model renders until the design loads"), the fallback is one shared low-poly sphere tinted with the design's main colour. The design-source registry (`procedural | glb`) stays, so L17 can still add procedural stars.

**The pipeline must be generalised, not copied.**
- `scripts/krathong-models-lib.mjs` has krathong-only steps: the flame cut and the `krathongFlames` extras.
- A pack option, or a thin `scripts/christmas-models.mjs` on the same library, should drive: weld → simplify per LOD → region colours → NORMAL + COLOR_0.
- Ornaments add an optional hook anchor, e.g. `meshes[0].extras.ornamentHook`. This keeps the 16.15 promise that "the parser makes anchors optional".
- Orientation: hook at +Y and the outward face at +Z. The star and bow are flat in z, so their face must point outward.

**Card size.** Six designs plus two props is too much for one card. I split it the way MFW-65 and MFW-76 were split:
- 16.15: the pipeline plus the first three designs.
- New 16.38: the other three designs plus both props. This card is mostly data.

**Prop placement needs a call from you.** You mapped the props to "16.14/16.19 place them". If 16.14 places the gift pile, 16.14 waits on 16.15/16.38. Both are wave 1, so that pushes the critical path back by about a day.
- Recommended: 16.14 only reserves the trunk-base anchor and its budget line, and 16.19 (wave 2, already after 16.15) places both props.
- Literal alternative: add "16.38" to 16.14's blockedBy and accept the slip.

**Licence (NOTICE.md).**
- Add a new §8 "Christmas 3D models", plus an owner checklist item: "confirm the Hunyuan3D service terms allow public use before 20 Dec".
- Spell out exactly which terms the owner used (web service or open weights). The open-weights Hunyuan3D community licences are known to carry territory and user-count limits. I have not checked the current text, so the owner should verify it.
- The krathong source files are named `hy3d-model*.glb`. That suggests the krathong pack (NOTICE §1, "tool … not recorded") also came from Hunyuan3D. The owner should confirm that too, and §1 can then be updated.

### Replacement and amended stories

Story JSON: `docs/backlog.json` (L16; new keys MFW-117 … MFW-124).


**Unchanged.**
- 16.6 (MFW-92) is in progress with six ids in its fix round. Its catalogue AC now reads "ball_01, star_01, bow_01, bell_01, stocking_01, gift_01; default ball_01 (DRAFT)".
- 16.26 needs no edit: `designThumbnailUrl(eventId, appearance)` picks up all six from 16.15 and 16.38.

### Effect on dates and risks

**Schedule.**
- 16.15 stays wave 1, parallel with 16.14.
- 16.38 is S/M in waves 1–2 and must land before 16.19 and 16.20, by about 5 Dec.
- 16.14 does not move under the recommended prop mapping.
- About +0.75 loop-day in total (16.38).

**New risks.**
1. Colour by region rules needs tuning rounds; the owner reviews after merge.
2. 100-triangle low LODs of the stocking and bow may read poorly at tree distance. The 16.18 screenshots decide; the fallback is a 150–200 triangle low LOD with LOW mounted bands kept at 3.
3. The Hunyuan3D terms are an owner launch gate before 20 Dec. If they do not allow public use, the fallback is procedural ornaments behind the same registry, which needs a new card.

Prop placement decision (loop, following the planner's recommendation): 16.14 only reserves the trunk-base anchor and its budget line; 16.19 places both props.

## Risks of running L16 and L17 together

See [L17-new-year.md](L17-new-year.md) §Risks and order of work.

