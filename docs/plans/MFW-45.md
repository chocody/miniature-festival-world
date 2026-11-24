# MFW-45 [2.4] Create-creation API (server write path) — implementation spec

> Hand-off spec for one card. It is the source of truth for the implementer and the reviewer. If this file and
> `docs/backlog.json` / `docs/spec/open-questions.md` disagree, those files win, and the PR must say so.
> Branch: `feat/MFW-45-create-creation-api-server-write-path` · Jira: MFW-45 · Epic: MFW-10 (Loop 2)
> Labels: `privacy`, `api`. Extra reviewer: **privacy-auditor** (the diff touches `src/services/**`, `src/app/api/**`,
> `supabase/**`, the owner token, wish text, encryption and moderation). The card adds a migration and is a privacy card,
> so the PR stays open and the **owner merges it**.

## Summary

This card adds `POST /api/creations`, the one server endpoint through which every creation is written. The client sends
`eventId`, `appearance`, `coord`, `wishText`, `wishVisibility` and its raw `ownerToken` in a JSON body. Unknown fields
are rejected. The server validates the coord (invariant A) and the per-event appearance (MFW-19). It runs the 2.3 guard on a
public wish and rejects it with the reasons (invariant G). It hashes the token with SHA-256 and never stores, logs or returns
the raw token. A private wish is encrypted with AES-256-GCM, with a key id stored next to it. The server also chooses
`created_at` (server time), `expires_at` (festival end + 30 days) and `zone_id` (the first zone below 80 with a free spot,
else a new zone). Finally it re-checks the client's river spot against the krathongs already in that zone and moves it to
the nearest free spot (owner decision 25). Zone choice and collision re-check must be race-safe, so the card adds a
**new** migration with an advisory-locked, compare-and-insert SQL function. The response contains only public fields.
Without Supabase env (CI, previews) the route runs on the in-memory repository, but **never in production**.

## Prerequisites

The backlog blocks this card on 2.2, 2.3, 1.2 and 4.1. The no-overlap and zone AC also need 5.2 and 5.3, and the wish rules are
shared with 4.3. Cut the branch from the latest `main` only after **MFW-25 (5.3) and MFW-21 (4.3) are merged** (MFW-13 already is).
If one is missing, stop and report it. Do not copy their code into this branch.

| Card | State (2026-11-24, `main` = adda547) | What this card uses |
|---|---|---|
| MFW-8 [1.2] coordinates | merged | `parsePersistableCoord` (`@/core/coordinates/validateCoord`), `PersistableCoord` (`@/core/coordinates/types`), `SplinePathCoord` (`@/core/coordinates/SplinePathCoord`) |
| MFW-11 [2.1] owner token | merged | `isDeviceOwnerToken`, `type DeviceOwnerToken`, `hashOwnerToken(token): Promise<OwnerTokenHash>`, `isOwnerTokenHash`, `type OwnerTokenHash` from `@/services/auth` |
| MFW-19 [4.1] krathong | merged | `parseEventAppearance(eventId, input): { ok: true; appearance } \| { ok: false; reason }` from `@/core/customization/appearanceRegistry`; `DEFAULT_KRATHONG_APPEARANCE`, `serializeKrathongAppearance` from `@/core/customization/krathongAppearance` (tests only) |
| MFW-12 [2.2] API & DB | merged | `CreationRepository`, `CreationRepositoryError`, `CreationBackend` (`creationRepository.ts`); `NewCreation`, `PublicCreation`, `EncryptedPrivateWish`, `PrivateWishCiphertext`, `AppearanceJson`, `ZoneQuery`, `PUBLIC_CREATION_KEYS` (`creationTypes.ts`); `validateNewCreation`, `isFestivalEventId`, `isZoneId`, `toIsoTimestamp` (`creationValidation.ts`); `pickPublicCreation`, `publicRowToCreation` (`publicCreation.ts`); `createInMemoryCreationRepository` (with `setModeration`); `createSupabaseCreationRepository` (closure helpers `send(target, method, body?)`, `restBase`, `now`); `getCreationRepository`, `createCreationRepositoryFromEnv`, `BackendEnv` (`creationRepositoryFactory.ts`); `computeCreationExpiresAt(eventId): Date \| null` (`retention.ts`); `isJsonObject`, `isPlainObject`, `JsonObject` (`json.ts`); fixtures in `src/services/api/__fixtures__/creations.ts`; config `ZONE_ITEM_CAP = 80`, `ZONE_ID_MIN = 1`, `UUID_PATTERN`, `PRIVATE_WISH_CIPHERTEXT_PATTERN`, `PRIVATE_WISH_KEY_ID_PATTERN`, `PRIVATE_WISH_ENVELOPE_VERSION = "v1"`, `AES_GCM_IV_BYTES = 12`, `AES_GCM_TAG_BYTES = 16`; SQL function `public.mfw_insert_creation` |
| MFW-24 [5.2] river flow | merged (a6ce8f3) | `findNearestFreeSpot(candidate, existing, lanes, nowMs): RiverSpot \| null`, `isSpotFree`, `riverCoordFromSpot(spot, createdAtMs): SplinePathCoord`, `riverSpotOf`, `riverSpotDistance`, `type RiverSpot` from `@/core/world/riverCollision`; `getLoyKrathongRiverLanes(): RiverLaneSet` from `@/core/world/riverLanes`; `type RiverLaneSet`, `type RiverPlacementSource` from `@/core/coordinates/riverLaneSet`; `RIVER_DRIFT_SPEED_FACTOR = 0.008`, `RIVER_MIN_CENTER_SPACING` (= 2 × `RIVER_COLLISION_RADIUS` × 1.1) from `@/config/riverFlow.config`; `LOY_KRATHONG_RIVER_LANE_ID = 1` from `@/config/events/loyKrathong.river.config` |
| MFW-7 / feature flags | merged | `isEventEnabled(id)` from `@/config/featureFlags.config`; `FESTIVAL_EVENT_IDS`, `FestivalEventId` |
| MFW-13 [2.3] PII guard & report | merged (adda547) | see list A (real code) |
| **MFW-25 [5.3] zones** | **NOT merged** (plan `docs/plans/MFW-25.md`) | see list B |
| **MFW-21 [4.3] WishModal** | **NOT merged** (plan `docs/plans/MFW-21.md`, branch `docs/card-specs-wave4`; implemented next) | see list C |

**A. MFW-13 on `main` (checked with `git show origin/main:…`).**
- `@/services/moderation` (pure, client-safe barrel) exports `checkPublicWish(text: string): WishGuardResult`
  (`{ ok: true } | { ok: false; reasons: readonly ModerationReason[] }`), `toModerationBlockedBody(reasons): ModerationBlockedBody`
  (`{ error: "moderation_blocked"; reasons }`), `parseModerationBlockedBody`, and the types `ModerationBlockedBody`, `WishGuardResult`,
  `ModerationReason`.
- `validateNewCreation` has the backstop: a public wish that is blank or fails `checkPublicWish` throws `invalid_input` / `publicWishText`.
- `CreationRepository` has `reportCreation(creationId): Promise<ReportOutcome>` (`ReportOutcome = "counted" | "ignored"`, exported from
  `creationRepository.ts`); `InMemoryCreationRepository` has `getModerationState(id)`. The failing double in
  `src/app/api/creations/route.test.ts` already has `reportCreation: async (): Promise<ReportOutcome> => "ignored"`.
- Test inputs reused from MFW-13's tables: `"โทร 0812345678"` → `phone`, `"somchai@gmail.com"` → `email`, `"fuck you"` → `profanity`.

**C. ASSUMED INTERFACE (from MFW-21 plan): the shared wish contract. Reuse it; do not define a second visibility type or length limit.**
- `@/config/wish.config` exports `WISH_VISIBILITIES = ["private", "public"]`, `type WishVisibility`, `WISH_DRAFT_ISSUES`
  (`text_empty`, `text_too_long`, `visibility_missing`, `moderation_blocked`), `type WishDraftIssue`, and `WISH_TEXT_MAX_LENGTH = 280`
  (UTF-16 code units after trimming; **PLACEHOLDER**, MFW-21 Open question 1).
- `@/services/api/wishPayload` (pure, isomorphic; imports only `wish.config` and `@/services/moderation`) exports
  `isWishVisibility(value): value is WishVisibility`, `normalizeWishText(text)` (trim),
  `evaluateWishDraft({ text, visibility }): { ok: true; wish: ComposedWish } | { ok: false; issues; moderationReasons }` (throws `TypeError`
  for a non-string text or an unknown visibility; trims; enforces `WISH_TEXT_MAX_LENGTH`; runs `checkPublicWish` only when public and non-empty;
  issues come in `WISH_DRAFT_ISSUES` order), `toWishColumns(wish): { publicWishText; privateWishPlaintext }` (exactly one non-null),
  `toWishRequestFields(wish): { wishText; wishVisibility }`, `moderationReasonsFromServerBody(body)`, and the types `ComposedWish`,
  `WishColumns`, `WishRequestFields`, `WishDraftEvaluation`.
- MFW-21's barrel (`src/services/api/index.ts`) already exports `type WishVisibility` and the wishPayload functions. This card must **not**
  export a second `WishVisibility` or `WISH_VISIBILITIES` from the barrel.

**B. ASSUMED INTERFACE (from MFW-25 plan).**
- `@/core/world/zoneManager` (import **by path**; pure, imports only `@/config/world.config`) exports
  `interface ZoneFill { readonly zoneId: number; readonly itemCount: number; readonly hasFreeSpot: boolean }` and
  `assignZoneForNewCreation(fills: readonly ZoneFill[], cap = ZONE_ITEM_CAP): number`
  ("first zone in `[ZONE_ID_MIN, max]` that is not full (`itemCount >= cap || !hasFreeSpot`); missing ids count as empty; else `max + 1`;
  `ZONE_ID_MIN` for no fills; throws `RangeError` on invalid fills").
- `CreationRepository` gained `highestVisibleZoneId(eventId): Promise<number | null>`.
- `@/services/api/apiPaths` exports `CREATIONS_API_PATH = "/api/creations"`.

Facts the lead checked (2026-11-24, scratch copy of `main` 604d6fa, real code, vitest):
- With the product lane (length 24.172, spacing 0.6292), an occupant released at progress 0.4 / lateral 0 sits at progress 0.48 ten seconds later.
  `findNearestFreeSpot({ laneId: 1, progress: 0.48, lateralOffset: 0 }, [occupant], lanes, t + 10 s)` returns progress 0.48, lateral 0.26217,
  exactly `RIVER_MIN_CENTER_SPACING` away. A search against 79 occupants takes under 1 ms. `riverCoordFromSpot` always writes `speedFactor 0.008`.
  A candidate at lateral 0.5 is clamped to 0.38083; progress 1 wraps to 0.
- Web Crypto AES-GCM in Node 22: `crypto.subtle.encrypt` returns ciphertext‖tag (16 bytes for an empty text). The envelope
  `v1.<b64url(iv)>.<b64url(ct‖tag)>` matches `PRIVATE_WISH_CIPHERTEXT_PATTERN` for `""`, `"a"` and a Thai text; decrypt round-trips; a wrong
  additional-data value fails with `OperationError`. `tsc --strict --target ES2017` accepts `Uint8Array<ArrayBuffer>` key/iv buffers.
- `openssl rand -base64 32` style keys are 44 characters ending in `=`.
- `tests/unit/public-private-boundary.test.ts` (MFW-12): the snake_case private column names may appear only in `src/services/auth/**`,
  `src/config/ownership.config.ts` and `src/services/api/supabaseCreationRepository.ts`; non-test files under `src/app/api` must not contain
  `ownerTokenHash`, `privateWish` or `ownerToken`; no `console.` and no `"*"` string literal in `src/services/api` / `src/app/api`.
  `tests/unit/no-raw-xyz-persistence.test.ts` scans `src/services`, `src/app/api` and `supabase` (tests too) for a `three` import, `Vector3`
  and `.toArray()`. Both scanners apply to every file of this card, comments included.
- `next.config.ts` has `cacheComponents: true`; a `POST` handler is always dynamic. Do not export `dynamic` / `revalidate` / `runtime`
  (read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` before editing `route.ts`).
- The lead did **not** run the new SQL against any database (not allowed in planning). See Risks.

## Acceptance criteria → checks

AC text is verbatim from `docs/backlog.json` story 2.4.

1. **"POST /api/creations takes eventId, appearance, coord, wishText, wishVisibility (private | public) and ownerToken in the JSON body;
   coord must pass parsePersistableCoord and appearance the event's appearance validator; unknown fields are rejected"**
   - `parseCreateCreationRequest` accepts exactly the six keys (`CREATE_CREATION_BODY_KEYS`). Any other top-level key (including `zoneId`,
     `expiresAt`, `createdAt`, `ownerTokenHash`, `__proto__`) → 400 `{ error: "invalid_body", field: "body" }`. Nested unknown keys fail the
     coord / appearance validators → field `coord` / `appearance`. Tests: `src/services/api/createCreationRequest.test.ts`,
     `src/services/api/createCreation.test.ts` → "AC1" cases.
   - coord: `parsePersistableCoord` must be ok, and the event's placement strategy must accept it (Loy Krathong: `SPLINE_PATH` on a known lane).
     appearance: `parseEventAppearance(eventId, appearance)` must be ok; the canonical copy is stored. Tests: same files.
   - Transport: JSON content type only (415), body ≤ `CREATE_CREATION_REQUEST_MAX_BYTES` (413). Test: `createCreation.test.ts`; e2e
     `tests/e2e/create-creation-api.spec.ts`.
2. **"The server stores only SHA-256(ownerToken) in creations_private_ownership; the raw token is never stored, logged or returned"**
   - The repository input carries `ownerTokenHash === sha256Hex(token)` (computed in the test with `node:crypto`) and no raw token anywhere
     (`JSON.stringify` of every captured input). The response text contains neither the token nor the hash. No `console.*` call happens.
     Tests: `createCreation.test.ts` → "AC2" cases; `supabaseCreationRepository.test.ts` → "guarded insert request" (`p_owner_token_hash`
     is the hash; the body has no raw token); `tests/unit/create-creation-boundary.test.ts`.
3. **"A private wish is stored only as AES-256-GCM ciphertext with a key id (public_wish_text stays null); a public wish must pass the 2.3
   guard on the server (rejected with the reasons otherwise) and private_wish_text stays null"**
   - Private: captured input has `publicWishText: null`, `privateWish.keyId` = the configured key id, a ciphertext matching
     `PRIVATE_WISH_CIPHERTEXT_PATTERN` that decrypts (with the key and the owner hash as additional data) to the trimmed wish and does not
     contain it. Cipher correctness against `node:crypto` `aes-256-gcm`: `src/services/api/privateWishCipher.test.ts`.
   - Public: MFW-21's `evaluateWishDraft` (which runs MFW-13's `checkPublicWish`) runs on the server before any repository call. A
     `moderation_blocked` result → 422 `toModerationBlockedBody(evaluation.moderationReasons)`, nothing is stored, the cipher is never called.
     `toWishColumns` puts the text in exactly one column. On success the captured input has `privateWish: null`. The server also enforces
     `WISH_TEXT_MAX_LENGTH` (400 field `wishText`). Tests: `createCreation.test.ts` → "AC3" cases.
4. **"The server assigns zone_id (first zone of the event below the 80-item cap, else a new zone) and expires_at (festival end + 30 days, from
   config); the client cannot set them"**
   - `expiresAt` = `computeCreationExpiresAt(eventId)`; `createdAt` = server `now`. Zone: `createRiverPlacementStrategy` feeds
     `assignZoneForNewCreation` (MFW-25) with counts that include hidden/flagged rows. The SQL function re-checks the cap (`>= 80`) under a lock.
     Tests: `src/services/api/creationPlacement.test.ts`, `createCreation.test.ts` → "AC4" cases (empty → 1; 80 in zone 1 → 2; gap filled;
     hidden rows still count), `tests/unit/create-creation-migration.test.ts`. "Cannot set them": AC1 unknown-key cases.
5. **"The response contains only public fields; a test asserts owner_token, owner_token_hash and private_wish_text never appear; the route works
   with an in-memory repository when Supabase env is absent"**
   - 201 body `{ creation }` built with `pickPublicCreation`; its keys equal `PUBLIC_CREATION_KEYS`; a recursive key walk and a text search find
     none of the private names or the seeded token / hash / ciphertext / key id. Tests: `createCreation.test.ts` → "AC5" cases;
     `src/app/api/creations/route.post.test.ts` (real `POST` with both Supabase env vars stubbed to `""` → 201 from memory; GET then lists it);
     e2e `tests/e2e/create-creation-api.spec.ts`.
   - Never in production: `VERCEL_ENV=production` + memory backend → 503, nothing stored. Tests: `createCreation.test.ts`, `route.post.test.ts`.
6. **"No overlap (open question 25): the server re-checks the coord against the krathongs already in the zone and moves it to the nearest free spot
   (collision radius from config) when two releases race; the response returns the final coord"**
   - The candidate spot is the client's `spawnProgress` / `lateralOffset` at **server** time; `findNearestFreeSpot` (MFW-24, radius and spacing from
     `riverFlow.config.ts`) picks the final spot; `riverCoordFromSpot` writes the coord with `speedFactor = RIVER_DRIFT_SPEED_FACTOR`.
     Tests: `creationPlacement.test.ts` → "moves an overlapping spot", "forces the drift speed"; `createCreation.test.ts` → "AC6" cases.
   - Race: the insert is compare-and-insert on the zone's occupant id set, under a per-zone advisory lock; a changed zone returns no row and the
     handler re-reads and retries (at most `CREATE_CREATION_MAX_ATTEMPTS`). Tests: `inMemoryCreationRepository.test.ts` → "guarded insert" cases;
     `createCreation.test.ts` → "two racing releases end up apart"; `supabaseCreationRepository.test.ts` → "zone_changed on []";
     `create-creation-migration.test.ts` → lock and compare checks.
   - The response's `creation.coord` is the final stored coord. Test: `createCreation.test.ts`.

## Owner decisions that apply

Quoted from `docs/spec/open-questions.md`. Do not reopen them. No row names MFW-45 as undecided, so **do not edit `open-questions.md`**.

- **Row 1:** "the device keeps the raw DeviceOwnerToken in LocalStorage; the server stores only SHA-256(token)… sends the raw token over HTTPS to
  the ownership-proof endpoint (POST body or Authorization header, never a URL or query string)… the raw token is never stored or logged
  server-side". CLAUDE.md invariant C names "create" as an ownership endpoint. → The token travels only in the POST JSON body, is checked with
  `isDeviceOwnerToken`, hashed with `hashOwnerToken`, and dropped.
- **Row 2:** "AES-256-GCM in the server API route; key in a server-only env var (Vercel, never NEXT_PUBLIC); a key id is stored with each encrypted
  row so the key can be rotated". → `privateWishCipher.ts`, env `PRIVATE_WISH_KEY` + `PRIVATE_WISH_KEY_ID`, envelope from MFW-12.
- **Row 3:** public reads hide hidden/flagged; auto-hide at 3 reports. → New rows start `approved` (MFW-12 default) because the guard runs first.
- **Row 4:** "80 items per zone". → `ZONE_ITEM_CAP`, enforced in TS and again in SQL.
- **Row 6:** speedFactor is progress per second; `createdAt` / `now` are epoch ms. → The server's `createdAtMs` is both the stored `created_at`
  and the collision time.
- **Row 10:** "expires_at = 30 days after the festival ends". → `computeCreationExpiresAt` (MFW-12). No deletion job here.
- **Row 13:** "profanity is blocked from public_wish_text…; the private wish may keep it". → Only the public wish is moderated
  (`evaluateWishDraft` already follows this).
- **Row 16 / launch plan:** engine pieces are generic. → The handler is event-agnostic; per-event parts are the appearance registry (MFW-19) and a
  placement-strategy registry (this card; only Loy Krathong registered).
- **Row 17:** no Supabase project or staging yet. → The migration is a repo file the owner applies; CI never needs a database.
- **Rows 21 and 25:** one wide lane; "no overlap … every krathong drifts at the same speed … the server re-checks the spot against the zone and moves
  it to the nearest free spot if two releases race". → Speed forced to `RIVER_DRIFT_SPEED_FACTOR`; re-check with `findNearestFreeSpot`.

## Files

| Path | New/modify | Purpose |
|---|---|---|
| `supabase/migrations/20261124020000_mfw45_guarded_creation_insert.sql` | new | `mfw_zone_item_counts`, `mfw_zone_occupants`, `mfw_insert_creation_guarded` (service_role only) |
| `src/config/creationWrite.config.ts` | new | `CREATE_CREATION_REQUEST_MAX_BYTES`, `CREATE_CREATION_MAX_ATTEMPTS` |
| `src/config/creationWrite.config.test.ts` | new | The body cap fits a maximum-length wish (also JSON-escaped) |
| `src/config/privateWish.config.ts` | modify (append) | Key env names, key size/format, tag bits, additional-data label, ephemeral key id |
| `src/config/database.config.ts` | modify (append) | Three RPC paths, deployment env name/value |
| `src/services/api/json.ts` | modify (append) | `cloneJsonObject` |
| `src/services/api/base64url.ts` | new | `bytesToBase64Url`, `base64UrlToBytes`, `base64ToBytes` |
| `src/services/api/privateWishCipher.ts` | new | AES-256-GCM encrypt/decrypt, env key loading, process cipher |
| `src/services/api/creationTypes.ts` | modify (append) | `ZoneItemCount`, `ZoneOccupant`, `GuardedNewCreation`, `GuardedInsertResult` |
| `src/services/api/creationRepository.ts` | modify | Add `zoneItemCounts`, `listZoneOccupants`, `insertCreationGuarded` |
| `src/services/api/creationValidation.ts` | modify (append) | `validateGuardedNewCreation` |
| `src/services/api/inMemoryCreationRepository.ts` | modify | Implement the three methods |
| `src/services/api/supabaseCreationRepository.ts` | modify | Implement the three methods via RPC |
| `src/services/api/creationRepositoryFactory.ts` | modify (append) | `isProductionDeployment(env)` |
| `src/services/api/createCreationTypes.ts` | new (client-safe) | Request/response/error body types, `CREATE_CREATION_BODY_KEYS` (visibility type reused from MFW-21) |
| `src/services/api/createCreationRequest.ts` | new | `parseCreateCreationRequest` |
| `src/services/api/creationPlacement.ts` | new | `CreationPlacementStrategy`, `createRiverPlacementStrategy`, `getCreationPlacementStrategy` |
| `src/services/api/createCreation.ts` | new | `handleCreateCreation(request, deps)`, `getDefaultCreateCreationDeps()` |
| `src/services/api/index.ts` | modify | Export the client-safe create types |
| `src/app/api/creations/route.ts` | modify | Add `POST` |
| `src/services/api/__fixtures__/createCreation.ts` | new (test data) | Token, key, bodies, request builder, recording / barrier repositories |
| `src/services/api/base64url.test.ts`, `privateWishCipher.test.ts`, `createCreationRequest.test.ts`, `creationPlacement.test.ts`, `createCreation.test.ts` | new | Unit tests |
| `src/services/api/json.test.ts`, `creationValidation.test.ts`, `inMemoryCreationRepository.test.ts`, `supabaseCreationRepository.test.ts`, `creationRepositoryFactory.test.ts` | modify (add cases only) | New-method cases |
| `src/config/privateWish.config.test.ts` | modify (add cases only) | New constants |
| `src/app/api/creations/route.test.ts` and every other test with an object literal typed `CreationRepository` | modify (stubs only) | Add the three new methods to test doubles |
| `src/app/api/creations/route.post.test.ts` | new | Real `POST` without Supabase env |
| `tests/unit/create-creation-migration.test.ts` | new | Static SQL checks |
| `tests/unit/create-creation-boundary.test.ts` | new | Route exports, env-name location, client import boundary, cipher algorithm |
| `tests/e2e/fixtures/createCreationFixtures.ts` | new | Import-free e2e body builder |
| `tests/unit/create-creation-e2e-fixtures.test.ts` | new | Proves the e2e body passes the real validators |
| `tests/e2e/create-creation-api.spec.ts` | new | Production build, no Supabase env |

## Implementation steps

Conventions for every new or changed file: TypeScript strict, English comments, no `any`, named constants only (no inline numbers except `0`,
`1` and those written below), `Object.freeze` on exported constant arrays/objects, **no `console.*`**, no named capture groups. Error messages and
response bodies never contain a token, hash, ciphertext, key, env value, wish text or any request value — only codes, field names and status
numbers. **Never write the snake_case private column names (`owner_token…`, `private_wish…`) in any non-test `src` file except
`supabaseCreationRepository.ts`, not even in comments.** Never write `Vector3`, `.toArray()` or a `three` import in `src/services/**`,
`src/app/api/**` or `supabase/**`. Import core modules **by path** (`@/core/world/riverCollision`, not `@/core/world`).

### Step 1 — config

`src/config/creationWrite.config.ts` (new):
```ts
/**
 * Max bytes of a POST /api/creations body (UTF-8). A valid body without a wish is about 450 bytes; a wish of
 * WISH_TEXT_MAX_LENGTH (MFW-21) adds at most 6 bytes per UTF-16 unit when JSON-escaped. Technical DoS bound, lead decision
 * MFW-45. It is NOT the product wish-length limit (that is WISH_TEXT_MAX_LENGTH in wish.config.ts); creationWrite.config.test.ts
 * fails if a raised wish limit no longer fits.
 */
export const CREATE_CREATION_REQUEST_MAX_BYTES = 4_096;
/** Compare-and-insert attempts when a concurrent release changed the zone (owner decision 25). Lead decision MFW-45. */
export const CREATE_CREATION_MAX_ATTEMPTS = 3;
```

`src/config/privateWish.config.ts` (append; keep MFW-12's exports unchanged):
```ts
/** Server-only env var names (never NEXT_PUBLIC). Key = standard base64 of 32 random bytes ("openssl rand -base64 32"). */
export const PRIVATE_WISH_KEY_ENV = "PRIVATE_WISH_KEY";
/** Key id stored next to every ciphertext (owner decision 2); must match PRIVATE_WISH_KEY_ID_PATTERN. */
export const PRIVATE_WISH_KEY_ID_ENV = "PRIVATE_WISH_KEY_ID";
/** AES-256 key length. */
export const AES_256_KEY_BYTES = 32;
/** GCM tag length in bits (= AES_GCM_TAG_BYTES × 8). */
export const AES_GCM_TAG_LENGTH_BITS = 128;
/** Standard base64 (with padding) of exactly 32 bytes. */
export const PRIVATE_WISH_KEY_BASE64_PATTERN = /^[A-Za-z0-9+/]{43}=$/;
/** Additional authenticated data = "<label>|<version>|<keyId>|<owner hash>": binds a ciphertext to its key id and owner. */
export const PRIVATE_WISH_AAD_LABEL = "mfw:private-wish";
export const PRIVATE_WISH_AAD_SEPARATOR = "|";
/**
 * Key id of the per-process random key used ONLY with the in-memory backend when no key env is set (CI, previews).
 * In-memory rows die with the process, and so does this key. Reserved: the env key id may not use it.
 */
export const PRIVATE_WISH_EPHEMERAL_KEY_ID = "ephemeral";
```

`src/config/database.config.ts` (append):
```ts
/** MFW-45 RPCs (relative to SUPABASE_REST_PATH). Names equal the SQL functions of 20261124020000_mfw45_guarded_creation_insert.sql. */
export const ZONE_ITEM_COUNTS_RPC_PATH = "rpc/mfw_zone_item_counts";
export const ZONE_OCCUPANTS_RPC_PATH = "rpc/mfw_zone_occupants";
export const INSERT_CREATION_GUARDED_RPC_PATH = "rpc/mfw_insert_creation_guarded";
/** Vercel sets VERCEL_ENV to "production" | "preview" | "development". Writes never use the in-memory backend in production. */
export const DEPLOYMENT_ENV = "VERCEL_ENV";
export const PRODUCTION_DEPLOYMENT = "production";
```

Constant table:

| Constant | Value | File | Source |
|---|---|---|---|
| `CREATE_CREATION_REQUEST_MAX_BYTES` | `4_096` | `creationWrite.config.ts` | lead (D9), technical bound ≥ a max-length wish |
| reused: `WISH_TEXT_MAX_LENGTH` | `280` (PLACEHOLDER, MFW-21 OQ 1) | `src/config/wish.config.ts` (MFW-21) | not redefined here |
| `CREATE_CREATION_MAX_ATTEMPTS` | `3` | `creationWrite.config.ts` | lead (D6) |
| `AES_256_KEY_BYTES` / `AES_GCM_TAG_LENGTH_BITS` | `32` / `128` | `privateWish.config.ts` | AES-256-GCM standard (owner decision 2) |
| `PRIVATE_WISH_KEY_ENV` / `PRIVATE_WISH_KEY_ID_ENV` | `"PRIVATE_WISH_KEY"` / `"PRIVATE_WISH_KEY_ID"` | `privateWish.config.ts` | lead (D3) |
| `PRIVATE_WISH_KEY_BASE64_PATTERN` | regex above | `privateWish.config.ts` | lead (D3) |
| `PRIVATE_WISH_AAD_LABEL` / `_SEPARATOR` | `"mfw:private-wish"` / `"\|"` | `privateWish.config.ts` | lead (D4) |
| `PRIVATE_WISH_EPHEMERAL_KEY_ID` | `"ephemeral"` | `privateWish.config.ts` | lead (D5) |
| `ZONE_ITEM_COUNTS_RPC_PATH`, `ZONE_OCCUPANTS_RPC_PATH`, `INSERT_CREATION_GUARDED_RPC_PATH` | see above | `database.config.ts` | lead |
| `DEPLOYMENT_ENV` / `PRODUCTION_DEPLOYMENT` | `"VERCEL_ENV"` / `"production"` | `database.config.ts` | Vercel convention (D7) |
| reused: `ZONE_ITEM_CAP` 80, `ZONE_ID_MIN` 1, `RIVER_DRIFT_SPEED_FACTOR` 0.008, `RIVER_MIN_CENTER_SPACING`, `RETENTION_DAYS_AFTER_FESTIVAL_END` 30 | — | existing | owner decisions 4, 25, 10 |

### Step 2 — `supabase/migrations/20261124020000_mfw45_guarded_creation_insert.sql` (new)

Write it **exactly** as below. Do not edit the MFW-12 or MFW-13 migrations. Do not run it against any database.
```sql
-- MFW-45 (backlog 2.4): race-safe server write path for creations.
-- Requires 20261124000000_mfw12_creations_public_private.sql. Applied by the owner (open question 17). Never applied by CI.
-- Clients (anon / authenticated) get no access: only the Next.js server calls these functions with the service-role key.
-- Occupancy of a zone = every stored, non-expired row of it, whatever its moderation status, so un-hiding an item can
-- never push a zone over the cap (owner decision 4: 80 per zone) or onto another krathong (owner decision 25).

create function public.mfw_zone_item_counts(p_event_id text)
returns table (zone_id integer, item_count integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.zone_id, count(p.id)::integer
  from public.creations_public as p
  where p.event_id = p_event_id
    and p.expires_at > now()
  group by p.zone_id
  order by p.zone_id;
$$;

create function public.mfw_zone_occupants(p_event_id text, p_zone_id integer)
returns table (id uuid, coord jsonb, created_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.coord, p.created_at
  from public.creations_public as p
  where p.event_id = p_event_id
    and p.zone_id = p_zone_id
    and p.expires_at > now()
  order by p.created_at, p.id;
$$;

-- Compare-and-insert: the server chose zone and spot from p_expected_occupant_ids (read with mfw_zone_occupants).
-- Under a per-zone advisory lock, the row is written only if the zone still holds exactly those rows and fewer than 80.
-- Otherwise no row is returned and the server re-reads and retries (owner decision 25: two releases racing).
create function public.mfw_insert_creation_guarded(
  p_event_id text,
  p_zone_id integer,
  p_appearance jsonb,
  p_coord jsonb,
  p_public_wish_text text,
  p_created_at timestamptz,
  p_expires_at timestamptz,
  p_owner_token_hash text,
  p_private_wish_text text,
  p_private_wish_key_id text,
  p_expected_occupant_ids uuid[]
)
returns setof public.creations_public
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current uuid[];
  v_expected uuid[];
  v_row public.creations_public;
begin
  if p_public_wish_text is not null and p_private_wish_text is not null then
    raise exception 'a creation has a public or a private wish, not both' using errcode = '22023';
  end if;

  -- One writer per (event, zone) at a time; released at commit.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mfw_creation_zone:' || p_event_id || ':' || p_zone_id::text, 0)
  );

  select coalesce(array_agg(p.id order by p.id), array[]::uuid[])
    into v_current
    from public.creations_public as p
   where p.event_id = p_event_id
     and p.zone_id = p_zone_id
     and p.expires_at > now();

  select coalesce(array_agg(e.occupant_id order by e.occupant_id), array[]::uuid[])
    into v_expected
    from unnest(p_expected_occupant_ids) as e(occupant_id);

  if v_current is distinct from v_expected then
    return;
  end if;

  -- Owner decision 4: at most 80 creations per zone.
  if pg_catalog.cardinality(v_current) >= 80 then
    return;
  end if;

  insert into public.creations_public (event_id, zone_id, appearance, coord, public_wish_text, created_at, expires_at)
  values (p_event_id, p_zone_id, p_appearance, p_coord, p_public_wish_text, p_created_at, p_expires_at)
  returning id, event_id, zone_id, appearance, coord, public_wish_text, created_at, expires_at
  into v_row;

  insert into public.creations_private_ownership (creation_id, owner_token_hash, private_wish_text, private_wish_key_id)
  values (v_row.id, p_owner_token_hash, p_private_wish_text, p_private_wish_key_id);

  return next v_row;
end;
$$;

revoke all on function public.mfw_zone_item_counts(text) from public, anon, authenticated;
grant execute on function public.mfw_zone_item_counts(text) to service_role;
revoke all on function public.mfw_zone_occupants(text, integer) from public, anon, authenticated;
grant execute on function public.mfw_zone_occupants(text, integer) to service_role;
revoke all on function public.mfw_insert_creation_guarded(text, integer, jsonb, jsonb, text, timestamptz, timestamptz, text, text, text, uuid[])
  from public, anon, authenticated;
grant execute on function public.mfw_insert_creation_guarded(text, integer, jsonb, jsonb, text, timestamptz, timestamptz, text, text, text, uuid[])
  to service_role;

notify pgrst, 'reload schema';
```
No new table grants are needed: MFW-12 grants `select, insert` on both tables to `service_role`. The existing index
`(event_id, zone_id, created_at, id)` serves all three functions.

### Step 3 — `src/services/api/json.ts` (append)

```ts
/** Deep copy of a JSON object, or null if `value` is not one (isJsonObject). Used to store a validated appearance. */
export function cloneJsonObject(value: unknown): JsonObject | null {
  if (!isJsonObject(value)) return null;
  return structuredClone(value) as JsonObject;
}
```
Reason: `KrathongAppearance` is an interface and is not assignable to `JsonObject`'s index signature; this converts it with a runtime guard.

### Step 4 — `src/services/api/base64url.ts` (new; no imports)

```ts
/** base64url without padding (RFC 4648 §5). */
export function bytesToBase64Url(bytes: Uint8Array): string;
/** Strict inverse: only [A-Za-z0-9_-], no padding, length % 4 !== 1, and canonical (re-encoding gives the input). Else null. */
export function base64UrlToBytes(text: string): Uint8Array<ArrayBuffer> | null;
/** Standard base64 WITH padding; null unless `text` matches `pattern` and decodes. Used for the key env value. */
export function base64ToBytes(text: string, pattern: RegExp): Uint8Array<ArrayBuffer> | null;
```
- `bytesToBase64Url`: `let binary = ""; for (const b of bytes) binary += String.fromCharCode(b); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");`
- `base64UrlToBytes`: return null unless `/^[A-Za-z0-9_-]*$/.test(text)` and `text.length % 4 !== 1`. Pad with `"="` to a multiple of 4, map `-`→`+`, `_`→`/`,
  `atob` inside `try` (catch → null), copy into `new Uint8Array(binary.length)`. Return null if `bytesToBase64Url(out) !== text`.
- `base64ToBytes`: null unless `pattern.test(text)`; then `atob` in `try`, copy into a `Uint8Array`.

### Step 5 — `src/services/api/privateWishCipher.ts` (new, server only)

```ts
import {
  AES_256_KEY_BYTES, AES_GCM_IV_BYTES, AES_GCM_TAG_BYTES, AES_GCM_TAG_LENGTH_BITS, PRIVATE_WISH_AAD_LABEL,
  PRIVATE_WISH_AAD_SEPARATOR, PRIVATE_WISH_CIPHERTEXT_PATTERN, PRIVATE_WISH_ENVELOPE_VERSION, PRIVATE_WISH_EPHEMERAL_KEY_ID,
  PRIVATE_WISH_KEY_BASE64_PATTERN, PRIVATE_WISH_KEY_ENV, PRIVATE_WISH_KEY_ID_ENV, PRIVATE_WISH_KEY_ID_PATTERN,
} from "@/config/privateWish.config";
import { isOwnerTokenHash, type OwnerTokenHash } from "@/services/auth";
import { base64ToBytes, base64UrlToBytes, bytesToBase64Url } from "./base64url";
import type { CreationBackend } from "./creationRepository";
import type { BackendEnv } from "./creationRepositoryFactory"; // type-only
import type { EncryptedPrivateWish, PrivateWishCiphertext } from "./creationTypes";

export type FillRandomBytes = (bytes: Uint8Array<ArrayBuffer>) => void;

export interface PrivateWishCipher {
  readonly keyId: string;
  /** AES-256-GCM with a fresh random 12-byte IV; additional data binds key id and owner hash. Rejects TypeError on bad input. */
  encrypt(plaintext: string, ownerTokenHash: OwnerTokenHash): Promise<EncryptedPrivateWish>;
}

export type PrivateWishKeyLookup = (keyId: string) => CryptoKey | undefined;

export type PrivateWishKeyEnvResult =
  | { readonly ok: true; readonly keyId: string; readonly rawKey: Uint8Array<ArrayBuffer> }
  | { readonly ok: false; readonly reason: "absent" | "invalid" };

export class PrivateWishKeyError extends Error {
  readonly reason: "missing" | "invalid";
  constructor(reason: "missing" | "invalid") {
    super(`private wish key ${reason}`);
    this.name = "PrivateWishKeyError";
    this.reason = reason;
  }
}

export function privateWishAdditionalData(keyId: string, ownerTokenHash: OwnerTokenHash): Uint8Array<ArrayBuffer>;
export function importPrivateWishKey(rawKey: Uint8Array<ArrayBuffer>): Promise<CryptoKey>;
export function createPrivateWishCipher(options: { keyId: string; key: CryptoKey; fillRandom?: FillRandomBytes }): PrivateWishCipher;
export function decryptPrivateWish(wish: EncryptedPrivateWish, ownerTokenHash: OwnerTokenHash, lookup: PrivateWishKeyLookup): Promise<string | null>;
export function readPrivateWishKeyEnv(env: BackendEnv): PrivateWishKeyEnvResult;
export function createPrivateWishCipherFromEnv(env: BackendEnv, backend: CreationBackend, fillRandom?: FillRandomBytes): Promise<PrivateWishCipher>;
export function getPrivateWishCipher(backend: CreationBackend): Promise<PrivateWishCipher>;
```
Behaviour:
- `defaultFillRandom = (bytes) => { globalThis.crypto.getRandomValues(bytes); }` (call as a method on `crypto`).
- `privateWishAdditionalData(keyId, hash)` = `new TextEncoder().encode([PRIVATE_WISH_AAD_LABEL, PRIVATE_WISH_ENVELOPE_VERSION, keyId, hash].join(PRIVATE_WISH_AAD_SEPARATOR))`.
- `importPrivateWishKey(raw)`: if `raw.byteLength !== AES_256_KEY_BYTES` reject `RangeError("private wish key must be 32 bytes")`. Else
  `globalThis.crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])` (not extractable).
- `createPrivateWishCipher({ keyId, key, fillRandom = defaultFillRandom })`: if `!PRIVATE_WISH_KEY_ID_PATTERN.test(keyId)` throw `RangeError("invalid key id")`.
  `encrypt(plaintext, hash)`:
  1. `typeof plaintext !== "string"` → reject `TypeError("plaintext must be a string")`; `!isOwnerTokenHash(hash)` → reject `TypeError("invalid owner hash")`.
  2. `const iv = new Uint8Array(AES_GCM_IV_BYTES); fillRandom(iv);`
  3. `const sealed = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: privateWishAdditionalData(keyId, hash), tagLength: AES_GCM_TAG_LENGTH_BITS }, key, new TextEncoder().encode(plaintext)));`
  4. `const envelope = [PRIVATE_WISH_ENVELOPE_VERSION, bytesToBase64Url(iv), bytesToBase64Url(sealed)].join(".");`
  5. If `!PRIVATE_WISH_CIPHERTEXT_PATTERN.test(envelope)` throw `Error("envelope format")` (defensive). Return `{ ciphertext: envelope as PrivateWishCiphertext, keyId }`.
- `decryptPrivateWish(wish, hash, lookup)` (used by tests now, by MFW-31 later). Return `null` on **any** failure, never throw:
  pattern mismatch; `split(".")` not 3 parts; `lookup(wish.keyId)` undefined; IV not 12 bytes; body shorter than `AES_GCM_TAG_BYTES`;
  `subtle.decrypt` rejects; `new TextDecoder("utf-8", { fatal: true }).decode(...)` throws.
- `readPrivateWishKeyEnv(env)`: `key = env[PRIVATE_WISH_KEY_ENV]?.trim() ?? ""`, `id = env[PRIVATE_WISH_KEY_ID_ENV]?.trim() ?? ""`.
  Both `""` → `{ ok: false, reason: "absent" }`. Exactly one `""` → `"invalid"`. `id` must match `PRIVATE_WISH_KEY_ID_PATTERN` and
  `!== PRIVATE_WISH_EPHEMERAL_KEY_ID`, else `"invalid"`. `rawKey = base64ToBytes(key, PRIVATE_WISH_KEY_BASE64_PATTERN)`; null or
  `byteLength !== AES_256_KEY_BYTES` → `"invalid"`. Else `{ ok: true, keyId: id, rawKey }`.
- `createPrivateWishCipherFromEnv(env, backend, fillRandom)` (async):
  1. `r = readPrivateWishKeyEnv(env)`. `r.ok` → `createPrivateWishCipher({ keyId: r.keyId, key: await importPrivateWishKey(r.rawKey), fillRandom })`.
  2. `r.reason === "absent" && backend === "memory"` → `raw = new Uint8Array(AES_256_KEY_BYTES); (fillRandom ?? defaultFillRandom)(raw);` →
     cipher with `keyId: PRIVATE_WISH_EPHEMERAL_KEY_ID`.
  3. `r.reason === "absent"` (supabase) → throw `new PrivateWishKeyError("missing")`. `"invalid"` (any backend) → throw `new PrivateWishKeyError("invalid")`.
- `getPrivateWishCipher(backend)`: process singleton; read `process.env` only inside the function, never at module top level.
  ```ts
  let cached: Promise<PrivateWishCipher> | null = null;
  export function getPrivateWishCipher(backend: CreationBackend): Promise<PrivateWishCipher> {
    if (cached === null) {
      const pending = createPrivateWishCipherFromEnv(process.env, backend);
      cached = pending;
      pending.catch(() => { if (cached === pending) cached = null; }); // a failure is not cached
    }
    return cached;
  }
  ```
  The backend is fixed per process (factory singleton), so one cache is enough.

### Step 6 — repository types and interface

`src/services/api/creationTypes.ts` (append):
```ts
/** Rows of one zone, counted for zone assignment. Includes hidden/flagged rows; excludes expired ones. Server-only. */
export interface ZoneItemCount {
  readonly zoneId: number;    // isZoneId
  readonly itemCount: number; // safe integer >= 1
}

/** One stored krathong of a zone, for the collision re-check. Server-only: never sent in any response. */
export interface ZoneOccupant {
  readonly id: string;          // lowercase uuid
  readonly coord: PersistableCoord;
  readonly createdAtMs: number; // epoch ms (open question 6)
}

/** Write input of the compare-and-insert path (MFW-45). The raw owner token never reaches it. */
export interface GuardedNewCreation extends NewCreation {
  /** Server time; stored as created_at and used for the collision check. expiresAt must be later. */
  readonly createdAt: Date;
  /** Ids of the zone's occupants the server placed against (unique uuids, fewer than ZONE_ITEM_CAP). */
  readonly expectedOccupantIds: readonly string[];
}

export type GuardedInsertResult =
  | { readonly status: "inserted"; readonly creation: PublicCreation }
  | { readonly status: "zone_changed" }; // the zone changed or is full: re-read and retry
```

`src/services/api/creationRepository.ts`: add these members to `CreationRepository` (keep all existing members, including MFW-13's and MFW-25's)
and extend the `invalid_input` / `invalid_backend_response` detail comments with `"createdAt"`, `"expectedOccupantIds"`, `"zone"`, `"occupant"`:
```ts
  /** Per-zone row counts of `eventId`: every non-expired row, any moderation status; ascending zoneId; zones with rows only. */
  zoneItemCounts(eventId: FestivalEventId): Promise<readonly ZoneItemCount[]>;
  /** Every non-expired row of one zone (any moderation status), ordered createdAt then id. Server-only data. */
  listZoneOccupants(query: ZoneQuery): Promise<readonly ZoneOccupant[]>;
  /**
   * Atomic compare-and-insert (owner decisions 4 and 25): writes the public and private rows only if the zone's current
   * non-expired occupant ids equal `expectedOccupantIds` (as a set) and number fewer than ZONE_ITEM_CAP; otherwise
   * { status: "zone_changed" } and nothing is written. Validates with validateGuardedNewCreation first.
   */
  insertCreationGuarded(input: GuardedNewCreation): Promise<GuardedInsertResult>;
```
Add a TSDoc line to `insertCreation`: "Unguarded (no zone/collision check): seeding and tests only. The create route uses insertCreationGuarded."

**Test doubles.** Adding members breaks every object literal typed `CreationRepository` in existing tests (for example the failing repository in
`src/app/api/creations/route.test.ts`, and doubles added by MFW-13 / MFW-25). Add to each one:
`zoneItemCounts: async () => [], listZoneOccupants: async () => [], insertCreationGuarded: async () => ({ status: "zone_changed" as const })`.
Make no other change to those tests.

### Step 7 — `src/services/api/creationValidation.ts` (append)

```ts
export function validateGuardedNewCreation(input: GuardedNewCreation): GuardedNewCreation;
```
1. `const createdAt: unknown = input.createdAt;` If not `instanceof Date` or not finite → throw `new CreationRepositoryError("invalid_input", "createdAt")`.
2. `const base = validateNewCreation(input, createdAt.getTime());` (so `expiresAt > createdAt`, the DB check; and MFW-13's guard backstop).
3. `const ids: unknown = input.expectedOccupantIds;` Throw `invalid_input` / `"expectedOccupantIds"` unless: `Array.isArray(ids)`,
   `ids.length < ZONE_ITEM_CAP`, every entry `typeof === "string" && UUID_PATTERN.test(entry)`, and `new Set(ids).size === ids.length`.
4. Return a fresh object built field by field from `base` (all eight `NewCreation` keys), plus `createdAt: new Date(createdAt.getTime())` and
   `expectedOccupantIds: Object.freeze(ids.slice() as string[])`.

### Step 8 — `src/services/api/inMemoryCreationRepository.ts` (modify)

Inside the existing closure (keep every existing method):
- Private helper `occupantRows(eventId, zoneId, nowMs): StoredPublicRow[]` = public rows with that event and zone and `expiresAtMs > nowMs`,
  sorted `createdAtMs` then `id` (same comparator as `listPublicZone`). No moderation filter (D2).
- `async zoneItemCounts(eventId)`: `isFestivalEventId` else `invalid_input` `"eventId"`. Count rows of the event with `expiresAtMs > now()` per
  `zoneId`; return `Object.freeze` array of `{ zoneId, itemCount }` sorted by `zoneId`.
- `async listZoneOccupants(query)`: guard event/zone like `listPublicZone`; return `occupantRows(...)` mapped to
  `{ id, coord: structuredClone(row.coord), createdAtMs: row.createdAtMs }`.
- `async insertCreationGuarded(input)`:
  ```ts
  const v = validateGuardedNewCreation(input); // throws before anything is read or stored
  const nowMs = now();
  const current = occupantRows(v.eventId, v.zoneId, nowMs).map((r) => r.id).sort();
  const expected = v.expectedOccupantIds.slice().sort();
  const same = current.length === expected.length && current.every((id, i) => id === expected[i]);
  if (!same || current.length >= ZONE_ITEM_CAP) return { status: "zone_changed" };
  // then exactly as insertCreation steps 2–4, but createdAtMs = v.createdAt.getTime()
  ```
  There is no `await` between the comparison and the two `Map.set` calls, so the check and the insert are atomic in one JS process.

### Step 9 — `src/services/api/supabaseCreationRepository.ts` (modify)

Add the RPC body types and three methods inside the existing closure (reuse `send`, which never reads a non-2xx body):
```ts
export interface ZoneItemCountsRpcBody { readonly p_event_id: string }
export interface ZoneOccupantsRpcBody { readonly p_event_id: string; readonly p_zone_id: number }
/** Keys equal the SQL parameter names of mfw_insert_creation_guarded. */
export interface InsertCreationGuardedRpcBody extends InsertCreationRpcBody {
  readonly p_created_at: string; // ISO-8601, ms precision
  readonly p_expected_occupant_ids: readonly string[];
}
```
- `zoneItemCounts(eventId)`: guard → `send(new URL(ZONE_ITEM_COUNTS_RPC_PATH, restBase), "POST", JSON.stringify(body))`. Not an array →
  `invalid_backend_response` `"zone"`. Each row must be `isPlainObject`, `isZoneId(row.zone_id)`, `Number.isSafeInteger(row.item_count) && row.item_count >= 1`,
  zone ids unique; **any** bad row → throw `invalid_backend_response` `"zone"` (fail closed: a dropped count could overfill a zone). Map
  field by field to `{ zoneId, itemCount }`.
- `listZoneOccupants(query)`: guard → POST `ZONE_OCCUPANTS_RPC_PATH` with `{ p_event_id, p_zone_id }`. Not an array → `"occupant"`. Each row:
  `UUID_PATTERN.test(row.id)`, `parsePersistableCoord(row.coord).ok`, `toIsoTimestamp(row.created_at) !== null`; map to
  `{ id, coord: parsed.coord, createdAtMs: Date.parse(iso) }`. Any bad row or duplicate id → throw `invalid_backend_response` `"occupant"`.
- `insertCreationGuarded(input)`: `const v = validateGuardedNewCreation(input);` (throws before any fetch). Build the body field by field: the nine
  MFW-12 keys exactly as `insertCreation` does, plus `p_created_at: v.createdAt.toISOString()` and
  `p_expected_occupant_ids: [...v.expectedOccupantIds]`. `send` POST to `INSERT_CREATION_GUARDED_RPC_PATH`. Then:
  not an array → `invalid_backend_response` `"insert"`; `length === 0` → `{ status: "zone_changed" }`; `length !== 1` → `"insert"`;
  `publicRowToCreation(data[0])` null → `"insert"`; else `{ status: "inserted", creation }`.

### Step 10 — `src/services/api/creationRepositoryFactory.ts` (append)

```ts
/** True on a Vercel production deployment. The create route never writes to the in-memory backend there (D7). */
export function isProductionDeployment(env: BackendEnv): boolean {
  return env[DEPLOYMENT_ENV]?.trim() === PRODUCTION_DEPLOYMENT;
}
```
Do not change `createCreationRepositoryFromEnv` / `getCreationRepository` (GET keeps MFW-12 behaviour).

### Step 11 — `src/services/api/createCreationTypes.ts` (new, client-safe: type imports + frozen constants only)

```ts
import type { FestivalEventId } from "@/config/events/types";
import type { WishVisibility } from "@/config/wish.config"; // ASSUMED INTERFACE (from MFW-21 plan); never redefine it
import type { PersistableCoord } from "@/core/coordinates/types";
import type { ModerationBlockedBody } from "@/services/moderation";
import type { PublicCreation } from "./creationTypes";
import type { JsonObject } from "./json";

/** Exactly these keys; anything else is rejected (backlog 2.4). */
export const CREATE_CREATION_BODY_KEYS = Object.freeze(
  ["eventId", "appearance", "coord", "wishText", "wishVisibility", "ownerToken"] as const,
);
export type CreateCreationField = "body" | (typeof CREATE_CREATION_BODY_KEYS)[number];

/** POST /api/creations body (Content-Type: application/json). ownerToken = raw DeviceOwnerToken, body only, never a URL. */
export interface CreateCreationRequestBody {
  readonly eventId: FestivalEventId;
  readonly appearance: JsonObject;   // the event's appearance (Loy Krathong: serializeKrathongAppearance)
  readonly coord: PersistableCoord;  // desired spot; the server may move it (owner decision 25)
  readonly wishText: string;         // non-blank after trim, at most WISH_TEXT_MAX_LENGTH (MFW-21 toWishRequestFields builds both wish keys)
  readonly wishVisibility: WishVisibility;
  readonly ownerToken: string;
}

/** 201 body. `creation.coord`, `zoneId`, `createdAt`, `expiresAt` are the server's final values. */
export interface CreateCreationResponseBody {
  readonly creation: PublicCreation;
}

export type CreateCreationErrorBody =
  | { readonly error: "unsupported_media_type" }                                // 415
  | { readonly error: "payload_too_large" }                                     // 413
  | { readonly error: "invalid_body"; readonly field: CreateCreationField }     // 400
  | { readonly error: "event_closed" }                                          // 409
  | ModerationBlockedBody                                                       // 422
  | { readonly error: "unavailable" };                                          // 503
```

Example request:
```json
{
  "eventId": "loy_krathong",
  "appearance": { "base": "banana_trunk_01", "lotusFold": "style_01", "leafColor": "#5E8C3A",
    "flowers": ["marigold", "marigold", "marigold", "marigold", "marigold", "marigold", "marigold", "marigold"], "candleColor": "#FFD166" },
  "coord": { "mode": "SPLINE_PATH", "laneId": 1, "spawnProgress": 0.48, "speedFactor": 0.008, "lateralOffset": 0 },
  "wishText": "ขอให้ทุกคนมีความสุข",
  "wishVisibility": "public",
  "ownerToken": "<43-char base64url DeviceOwnerToken>"
}
```
Example 201 (the spot was taken, so the server moved it sideways):
```json
{ "creation": { "id": "950118ce-7d93-4cb6-bd84-44d91c5de9e3", "eventId": "loy_krathong", "zoneId": 1,
  "appearance": { "base": "banana_trunk_01", "lotusFold": "style_01", "leafColor": "#5E8C3A", "flowers": ["marigold", "…"], "candleColor": "#FFD166" },
  "coord": { "mode": "SPLINE_PATH", "laneId": 1, "spawnProgress": 0.48, "speedFactor": 0.008, "lateralOffset": 0.2621666666666667 },
  "publicWishText": "ขอให้ทุกคนมีความสุข", "createdAt": "2026-11-24T12:00:10.000Z", "expiresAt": "2026-12-24T17:00:00.000Z" } }
```

### Step 12 — `src/services/api/createCreationRequest.ts` (new, server)

```ts
export interface ParsedCreateCreationRequest {
  readonly eventId: FestivalEventId;
  readonly appearance: unknown;        // validated later by parseEventAppearance
  readonly coord: PersistableCoord;    // parsePersistableCoord's fresh copy
  readonly wishText: string;           // as sent (type-checked only); evaluateWishDraft trims and checks it in the handler
  readonly wishVisibility: WishVisibility; // isWishVisibility (MFW-21)
  readonly ownerToken: DeviceOwnerToken;
}
export type CreateCreationParseResult =
  | { readonly ok: true; readonly request: ParsedCreateCreationRequest }
  | { readonly ok: false; readonly field: CreateCreationField };

export function parseCreateCreationRequest(value: unknown): CreateCreationParseResult;
```
Checks in this order; the first failure returns `{ ok: false, field }`:
1. `!isPlainObject(value)` → `"body"`.
2. Any own key not in `CREATE_CREATION_BODY_KEYS` → `"body"` (never echo the key name).
3. `eventId`: `isFestivalEventId` → else `"eventId"`.
4. `appearance`: `Object.prototype.hasOwnProperty.call(value, "appearance")` → else `"appearance"`.
5. `coord`: `parsePersistableCoord(value.coord)` ok → else `"coord"`.
6. `wishText`: `typeof === "string"` → else `"wishText"`. Emptiness and length are checked by `evaluateWishDraft` in the handler
   (one rule set with the WishModal), not here.
7. `wishVisibility`: `isWishVisibility` (MFW-21) → else `"wishVisibility"`.
8. `ownerToken`: `isDeviceOwnerToken` → else `"ownerToken"`.
Return the object built field by field (no spread). Missing keys fail at their own step.

### Step 13 — `src/services/api/creationPlacement.ts` (new, server)

```ts
import { ZONE_ID_MIN, ZONE_ITEM_CAP } from "@/config/world.config";
import type { FestivalEventId } from "@/config/events/types";
import type { RiverLaneSet, RiverPlacementSource } from "@/core/coordinates/riverLaneSet";
import type { PersistableCoord } from "@/core/coordinates/types";
import { findNearestFreeSpot, riverCoordFromSpot, type RiverSpot } from "@/core/world/riverCollision";
import { getLoyKrathongRiverLanes } from "@/core/world/riverLanes";
import { assignZoneForNewCreation, type ZoneFill } from "@/core/world/zoneManager"; // ASSUMED INTERFACE (MFW-25)
import type { ZoneItemCount, ZoneOccupant } from "./creationTypes";

export interface PlacementSource {
  zoneItemCounts(): Promise<readonly ZoneItemCount[]>;
  listZoneOccupants(zoneId: number): Promise<readonly ZoneOccupant[]>;
}
export interface PlacementResult {
  readonly zoneId: number;
  readonly coord: PersistableCoord;              // final coord to store and return
  readonly expectedOccupantIds: readonly string[];
}
export interface CreationPlacementStrategy {
  /** Static check before any I/O: is this coord placeable for the event? */
  acceptsCoord(coord: PersistableCoord): boolean;
  /** Chooses zone and final coord at server time createdAtMs. Rejects on backend errors or internal inconsistency. */
  place(coord: PersistableCoord, createdAtMs: number, source: PlacementSource): Promise<PlacementResult>;
}
export interface RiverCollisionFns {
  readonly findNearestFreeSpot: typeof findNearestFreeSpot;
  readonly riverCoordFromSpot: typeof riverCoordFromSpot;
}

export function createRiverPlacementStrategy(lanes: RiverLaneSet, collision?: RiverCollisionFns, cap?: number): CreationPlacementStrategy;
export function getCreationPlacementStrategy(eventId: FestivalEventId): CreationPlacementStrategy | null;
```
`createRiverPlacementStrategy(lanes, collision = { findNearestFreeSpot, riverCoordFromSpot }, cap = ZONE_ITEM_CAP)`:
- `acceptsCoord(coord)` = `coord.mode === "SPLINE_PATH" && lanes.get(coord.laneId) !== undefined`.
- `place(coord, createdAtMs, source)`:
  ```ts
  if (!this-strategy.acceptsCoord(coord) || coord.mode !== "SPLINE_PATH") throw new RangeError("coord is not on a river lane");
  const candidate: RiverSpot = { laneId: coord.laneId, progress: coord.spawnProgress, lateralOffset: coord.lateralOffset };
  const counts = new Map<number, number>();
  for (const c of await source.zoneItemCounts()) counts.set(c.zoneId, c.itemCount);
  let maxZone = ZONE_ID_MIN - 1;
  for (const z of counts.keys()) if (z > maxZone) maxZone = z;
  const fills: ZoneFill[] = [];
  let chosen: { zoneId: number; spot: RiverSpot; ids: readonly string[] } | null = null;
  for (let zoneId = ZONE_ID_MIN; zoneId <= maxZone && chosen === null; zoneId += 1) {
    const count = counts.get(zoneId) ?? 0;
    if (count >= cap) { fills.push({ zoneId, itemCount: count, hasFreeSpot: false }); continue; } // full: not read
    const occupants = count === 0 ? [] : await source.listZoneOccupants(zoneId);                // gap: empty, not read
    if (occupants.length >= cap) { fills.push({ zoneId, itemCount: occupants.length, hasFreeSpot: false }); continue; }
    const spot = collision.findNearestFreeSpot(candidate, toRiverSources(occupants), lanes, createdAtMs);
    fills.push({ zoneId, itemCount: occupants.length, hasFreeSpot: spot !== null });
    if (spot !== null) chosen = { zoneId, spot, ids: occupants.map((o) => o.id) };
  }
  if (chosen === null) {
    const spot = collision.findNearestFreeSpot(candidate, [], lanes, createdAtMs);
    if (spot === null) throw new Error("no free spot in an empty zone");
    chosen = { zoneId: maxZone + 1, spot, ids: [] };
  }
  const zoneId = assignZoneForNewCreation(fills, cap); // MFW-25 is the rule; this loop only evaluates it lazily
  if (zoneId !== chosen.zoneId) throw new Error("zone assignment mismatch");
  return { zoneId, coord: collision.riverCoordFromSpot(chosen.spot, createdAtMs), expectedOccupantIds: chosen.ids };
  ```
  (Write `acceptsCoord` as a local function so `place` can call it; do not use `this`.)
  `toRiverSources(occupants)`: keep only `o.coord.mode === "SPLINE_PATH"`, map to `{ coord: o.coord, createdAtMs: o.createdAtMs }`
  (`RiverPlacementSource[]`). Non-river occupants keep their id in `ids` but do not collide.
- The candidate is the client's `spawnProgress` / `lateralOffset` read **at server time** `createdAtMs` (D8). `riverCoordFromSpot` writes
  `speedFactor = RIVER_DRIFT_SPEED_FACTOR` whatever the client sent (owner decision 25).

`getCreationPlacementStrategy(eventId)`: a registry like MFW-19's appearance registry:
```ts
const PLACEMENT_FACTORIES: ReadonlyMap<FestivalEventId, () => CreationPlacementStrategy> = new Map([
  ["loy_krathong", () => createRiverPlacementStrategy(getLoyKrathongRiverLanes())],
]);
const built = new Map<FestivalEventId, CreationPlacementStrategy>();
// return built.get(eventId) ?? (factory ? cache and return factory() : null)
```

### Step 14 — `src/services/api/createCreation.ts` (new, server)

```ts
export interface CreateCreationDeps {
  readonly getRepository: () => CreationRepository;                       // may throw (misconfigured) → 503
  readonly getCipher: (backend: CreationBackend) => Promise<PrivateWishCipher>;
  readonly isProduction: boolean;
  readonly now?: () => number;                                            // default Date.now
  readonly getPlacementStrategy?: (eventId: FestivalEventId) => CreationPlacementStrategy | null; // default getCreationPlacementStrategy
}

/** POST /api/creations logic (backlog 2.4). Never logs. */
export async function handleCreateCreation(request: Request, deps: CreateCreationDeps): Promise<Response>;

/** Route wiring; reads process.env only when called. */
export function getDefaultCreateCreationDeps(): CreateCreationDeps {
  return {
    getRepository: getCreationRepository,
    getCipher: getPrivateWishCipher,
    isProduction: isProductionDeployment(process.env),
    now: () => Date.now(),
    getPlacementStrategy: getCreationPlacementStrategy,
  };
}
```
Module constants: `HTTP_CREATED = 201`, `HTTP_BAD_REQUEST = 400`, `HTTP_CONFLICT = 409`, `HTTP_PAYLOAD_TOO_LARGE = 413`,
`HTTP_UNSUPPORTED_MEDIA_TYPE = 415`, `HTTP_UNPROCESSABLE = 422`, `HTTP_SERVICE_UNAVAILABLE = 503`,
`NO_STORE = { "Cache-Control": "no-store" }`, `JSON_CONTENT_TYPE = /^application\/json\s*(?:;|$)/i`,
`respond = (status, body: CreateCreationResponseBody | CreateCreationErrorBody) => Response.json(body, { status, headers: NO_STORE })`.

`handleCreateCreation`, exactly in this order:
1. Content type not JSON → 415 `{ error: "unsupported_media_type" }`.
2. `content-length` header present and `Number(value) > CREATE_CREATION_REQUEST_MAX_BYTES` → 413. `raw = await request.text()` (catch → 400
   field `"body"`). `new TextEncoder().encode(raw).byteLength > MAX` → 413. `JSON.parse` in `try` (catch → 400 `"body"`).
3. `parseCreateCreationRequest(json)`; failure → 400 `{ error: "invalid_body", field }`.
4. Event open: `const strategy = placementFor(eventId); const expiresAt = computeCreationExpiresAt(eventId);` If
   `!isEventEnabled(eventId) || strategy === null || expiresAt === null || expiresAt.getTime() <= now()` → 409 `{ error: "event_closed" }`.
5. `!strategy.acceptsCoord(coord)` → 400 field `"coord"`.
6. `const parsedAppearance = parseEventAppearance(eventId, request.appearance)`; not ok → 400 `"appearance"`.
   `const appearance = cloneJsonObject(parsedAppearance.appearance)`; null → 400 `"appearance"`.
7. Wish (MFW-21 contract, the same rules as the WishModal):
   ```ts
   const evaluation = evaluateWishDraft({ text: request.wishText, visibility: request.wishVisibility });
   if (!evaluation.ok) {
     if (evaluation.issues.includes("text_empty") || evaluation.issues.includes("text_too_long")) return invalidBody("wishText");
     if (evaluation.issues.includes("moderation_blocked")) {
       return respond(HTTP_UNPROCESSABLE, toModerationBlockedBody(evaluation.moderationReasons));
     }
     return invalidBody("wishVisibility"); // visibility_missing cannot happen after parsing; fail closed
   }
   const { publicWishText, privateWishPlaintext } = toWishColumns(evaluation.wish); // exactly one is non-null
   ```
   A too-long public wish with PII gets 400 `wishText` (length first). The private wish is not moderated (owner decision 13). Do not call
   `checkPublicWish` directly; `evaluateWishDraft` does, and MFW-13's backstop in `validateNewCreation` repeats it.
8. `let repository; try { repository = deps.getRepository(); } catch { → 503 }`. If `repository.backend === "memory" && deps.isProduction` → 503.
9. Everything below runs in one `try { … } catch { return 503 { error: "unavailable" } }`:
   ```ts
   const ownerTokenHash = await hashOwnerToken(request.ownerToken); // the raw token is not used after this line
   const privateWish = privateWishPlaintext === null
     ? null
     : await (await deps.getCipher(repository.backend)).encrypt(privateWishPlaintext, ownerTokenHash);
   const source: PlacementSource = {
     zoneItemCounts: () => repository.zoneItemCounts(eventId),
     listZoneOccupants: (zoneId) => repository.listZoneOccupants({ eventId, zoneId }),
   };
   for (let attempt = 1; attempt <= CREATE_CREATION_MAX_ATTEMPTS; attempt += 1) {
     const createdAtMs = now(); // fresh server time per attempt (MFW-24 review: never the client clock)
     const placement = await strategy.place(coord, createdAtMs, source);
     const result = await repository.insertCreationGuarded({
       eventId, zoneId: placement.zoneId, appearance, coord: placement.coord, publicWishText, expiresAt,
       ownerTokenHash, privateWish, createdAt: new Date(createdAtMs), expectedOccupantIds: placement.expectedOccupantIds,
     });
     if (result.status === "inserted") return respond(HTTP_CREATED, { creation: pickPublicCreation(result.creation) });
   }
   ```
10. After the loop (all attempts saw `zone_changed`) → 503 `{ error: "unavailable" }`.

Never put `request`, the raw body, the token, the hash, the wish or an error object into a response, an error message or a log.

### Step 15 — `src/app/api/creations/route.ts` (modify)

Keep `GET` unchanged and add:
```ts
import { getDefaultCreateCreationDeps, handleCreateCreation } from "@/services/api/createCreation";

/** POST /api/creations — the server write path (backlog 2.4). Body: CreateCreationRequestBody (JSON). */
export async function POST(request: Request): Promise<Response> {
  return handleCreateCreation(request, getDefaultCreateCreationDeps());
}
```
Export only `GET` and `POST`. `route.ts` must not contain `process.env`, `ownerToken`, `privateWish` or any private name (boundary tests).

### Step 16 — `src/services/api/index.ts` (modify)

Add to the client-safe barrel (keep MFW-12, MFW-13, MFW-21 and MFW-25 exports; `WishVisibility` already comes from `./wishPayload`):
```ts
export {
  CREATE_CREATION_BODY_KEYS,
  type CreateCreationErrorBody,
  type CreateCreationField,
  type CreateCreationRequestBody,
  type CreateCreationResponseBody,
} from "./createCreationTypes";
```
Never export `createCreation`, `createCreationRequest`, `creationPlacement` or `privateWishCipher` from the barrel.

### Step 17 — test fixtures `src/services/api/__fixtures__/createCreation.ts` (new; test-only, not imported by app code)

```ts
/** Valid DeviceOwnerToken shape with a searchable marker (43 chars, last char from the canonical set). */
export const OWNER_TOKEN_FIXTURE = ("SeCrEtOwNeRtOkEn" + "x".repeat(26) + "w") as DeviceOwnerToken;
export const CREATE_NOW_MS = Date.parse("2026-11-24T12:00:00.000Z"); // before the Loy Krathong expiry 2026-12-24T17:00Z
export const TEST_KEY_ID = "test-key-1";
export const TEST_KEY_BYTES = (): Uint8Array<ArrayBuffer> => new Uint8Array(AES_256_KEY_BYTES).fill(7);
export async function makeTestCipher(fillRandom?: FillRandomBytes): Promise<{ cipher: PrivateWishCipher; lookup: PrivateWishKeyLookup }>;
export function defaultAppearanceJson(): Record<string, unknown>; // structuredClone(serializeKrathongAppearance(DEFAULT_KRATHONG_APPEARANCE))
export function riverCoord(spawnProgress: number, lateralOffset = 0): Record<string, unknown>;
//   { mode: "SPLINE_PATH", laneId: LOY_KRATHONG_RIVER_LANE_ID, spawnProgress, speedFactor: RIVER_DRIFT_SPEED_FACTOR, lateralOffset }
export function makeCreateBody(overrides?: Record<string, unknown>, omit?: readonly string[]): Record<string, unknown>;
//   defaults: eventId "loy_krathong", defaultAppearanceJson(), riverCoord(0.4), wishText "ขอให้ทุกคนมีความสุข",
//   wishVisibility "public", ownerToken OWNER_TOKEN_FIXTURE; then overrides; then delete omitted keys
export function makeCreateRequest(body: unknown, init?: { contentType?: string; rawBody?: string; contentLength?: string }): Request;
//   POST http://localhost/api/creations, content-type default "application/json", body rawBody ?? JSON.stringify(body)
export function recordingRepository(inner: CreationRepository): { repo: CreationRepository; inserts: GuardedNewCreation[] };
//   explicit delegation of EVERY interface member (no spread); insertCreationGuarded pushes structuredClone(input) then delegates
export function barrierOnZoneCounts(inner: CreationRepository, parties: number): CreationRepository;
//   the first `parties` zoneItemCounts calls wait until `parties` calls have arrived, then all resolve; later calls pass through
```
Keep the file free of snake_case private names and of `"*"` literals (it is a non-test file for the scanners).

## Tests

Everything runs under `pnpm test` with no network, no database and no real key. Server tests start with `// @vitest-environment node`.
Every test that goes through the handler injects `now: () => t` with `t = CREATE_NOW_MS` (never the wall clock). Tests that call the real route
use `vi.useFakeTimers({ toFake: ["Date"], now: CREATE_NOW_MS })` and `vi.useRealTimers()` in `afterEach`. Common setup for handler tests:
`repo = createInMemoryCreationRepository({ now: () => t })`, `{ repo: rec, inserts } = recordingRepository(repo)`,
`deps = { getRepository: () => rec, getCipher: async () => cipher, isProduction: false, now: () => t }`.
`sha256Hex(s)` in tests = `createHash("sha256").update(s).digest("hex")` from `node:crypto`. `PRIVATE_NAMES` = the list in MFW-12's
`route.test.ts` (`owner_token`, `ownerToken`, `owner_token_hash`, `ownerTokenHash`, `private_wish_text`, `privateWishText`, `privateWish`,
`private_wish_key_id`, `report_count`, `reportCount`, `moderation_status`, `moderationStatus`).

### `src/services/api/base64url.test.ts` (node)
1. Round trip for byte lengths 0–40 (bytes `i * 37 % 256`); output matches `/^[A-Za-z0-9_-]*$/`, no `=`.
2. `base64UrlToBytes` → null for `"A"` (length % 4 === 1), `"AB="`, `"A+B/"`, `"AB"` (non-canonical: `"AQ"` is canonical for one byte `0x01`... use
   `bytesToBase64Url(new Uint8Array([1]))` and assert that changing its last char to the next alphabet char returns null), `"a b"`.
3. `base64ToBytes(Buffer.alloc(32, 7).toString("base64"), PRIVATE_WISH_KEY_BASE64_PATTERN)` has 32 bytes, all 7; `"AAAA"` → null; the
   base64url form of the same key → null.

### `src/services/api/privateWishCipher.test.ts` (node)
1. "real AES-256-GCM": fixed IV via `fillRandom = (b) => b.fill(9)`; envelope = `v1.` + base64url(iv) + `.` + base64url(ct‖tag) where `ct`/`tag`
   come from `node:crypto` `createCipheriv("aes-256-gcm", key, iv)` with `setAAD(privateWishAdditionalData(keyId, hash))` → `toBe` equal.
2. Round trip for `"ขอให้สอบติด"`, `"May all my wishes come true"`, `"🏮✨"`, `"a"` and `""` via `decryptPrivateWish(..., lookup)`.
3. Envelope matches `PRIVATE_WISH_CIPHERTEXT_PATTERN`; `keyId === TEST_KEY_ID`; the envelope contains neither the plaintext nor
   `bytesToBase64Url(new TextEncoder().encode(plaintext))`.
4. Two encryptions of the same text with the default random IV differ.
5. Decrypt returns `null` for: a flipped char in the body; a different owner hash (AAD); `lookup` → undefined; another key; an envelope
   `"v2.…"`; `keyId` changed to another valid id with the same key (AAD binds the key id).
6. `importPrivateWishKey` rejects `RangeError` for 16, 31 and 33 bytes. `createPrivateWishCipher` throws for key id `"Key 1"`.
7. `encrypt(5 as unknown as string, hash)` and `encrypt("x", "abc" as OwnerTokenHash)` reject `TypeError`; messages contain neither `"5"` nor `"abc"`.
8. `readPrivateWishKeyEnv`: `{}` → absent; key only / id only → invalid; id `"Key 1"` → invalid; id `"ephemeral"` → invalid; key `"AAAA"` → invalid;
   key = base64 of 31 bytes → invalid; valid key + id `"k2026a"` → ok with 32 bytes. No result field contains the key value.
9. `createPrivateWishCipherFromEnv`: `({}, "memory")` → `keyId "ephemeral"` and encrypt/decrypt works with its own key only through the cipher;
   `({}, "supabase")` → rejects `PrivateWishKeyError` with `reason "missing"`; invalid env + `"memory"` → rejects `reason "invalid"` (no silent
   fallback); valid env + `"supabase"` → `keyId "k2026a"`. Error messages never contain the env values.
10. `getPrivateWishCipher`: `vi.resetModules()`, stub both key env vars to `""`, dynamic import → `"memory"` gives the same promise twice; after
    stubbing an invalid key and re-importing, `"supabase"` rejects, and a second call retries (not cached). `vi.unstubAllEnvs()` in `afterEach`.

### `src/services/api/createCreationRequest.test.ts` (node)
1. `makeCreateBody()` → ok; `wishText` `"  ขอให้ทุกคนมีความสุข  "` is kept as sent (the handler trims through `evaluateWishDraft`); `wishText ""`
   and `"   "` also parse ok (emptiness is the handler's 400); private body → `wishVisibility "private"`; result keys equal
   `CREATE_CREATION_BODY_KEYS` (sorted).
2. Field table (`{ ok: false, field }`): `null`, `[]`, `"x"` → body; extra `x`, `zoneId: 1`, `expiresAt`, `createdAt`, `ownerTokenHash` → body;
   raw JSON `{"__proto__":{},...valid keys}` parsed with `JSON.parse` → body; missing each of the six keys → that key; `eventId "nope"`,
   `"LOY_KRATHONG"` → eventId; coord with `x: 1`, `{ x:1, y:2, z:3 }`, `spawnProgress 1.5`, `mode "CURVE"` → coord; `wishText 5`, `null`, `["x"]` → wishText;
   `wishVisibility "friends"`, `"PUBLIC"` → wishVisibility; `ownerToken "abc"`, `sha256Hex("x")`, `"A".repeat(44)`, `5` → ownerToken.
3. Order: a body with an extra key AND a bad eventId → `body`.

### `src/services/api/creationPlacement.test.ts` (node; real `getLoyKrathongRiverLanes()`)
A fake `PlacementSource` built from tables records calls. `occupantAt(id, progress, lateral, createdAtMs)` = `{ id, coord: riverCoordFromSpot({ laneId: 1, progress, lateralOffset: lateral }, createdAtMs), createdAtMs }`.
1. `acceptsCoord`: lane `LOY_KRATHONG_RIVER_LANE_ID` → true; laneId 0 and 2 → false; `PLANAR_ZONE` and `CYLINDRICAL_SURFACE` coords → false.
2. "empty event → zone 1, client spot kept": counts `[]`, desired `riverCoord(0.4)` with `speedFactor 0.5` → `zoneId 1`, `coord.spawnProgress 0.4`,
   `lateralOffset 0`, `speedFactor === RIVER_DRIFT_SPEED_FACTOR` ("forces the drift speed"), `expectedOccupantIds []`; `listZoneOccupants` never called.
3. "lateral clamp": desired lateral 0.5 → result lateral = `riverSpotLateralLimit(lane)` (≈ 0.38083).
4. "moves an overlapping spot": zone 1 has `occupantAt(A, 0.4, 0, t0)`; `place` at `t1 = t0 + 10_000` with desired spawnProgress 0.48, lateral 0 →
   coord ≠ desired; `isSpotFree(spotOfResult, [occupant], lanes, t1)` true; `riverSpotDistance(spotOfResult, riverSpotOf(occupant, lanes, t1), lane)
   >= RIVER_MIN_CENTER_SPACING`; result equals `riverCoordFromSpot(findNearestFreeSpot(candidate, [occupant], lanes, t1), t1)`; ids `[A]`.
   (`spotOfResult` = `riverSpotOf({ coord: result.coord, createdAtMs: t1 }, lanes, t1)`.)
5. "full zone is skipped without reading": counts `[{ zoneId: 1, itemCount: 80 }]` → zone 2, ids `[]`, `listZoneOccupants` not called.
6. "gap is filled": counts zone 1 → 80, zone 3 → 5 → zone 2, no occupant reads.
7. "no free spot → next zone": inject `collision.findNearestFreeSpot` that returns `null` whenever `existing.length > 0` and delegates otherwise;
   counts zone 1 → 10 → zone 2.
8. "occupant list at the cap counts as full": counts say 79, occupants list has 80 → zone 2.
9. "non-river occupants keep their id": an occupant with a `PLANAR_ZONE` coord is in `expectedOccupantIds` and does not block the candidate.
10. "deterministic": same inputs twice → `toEqual`; occupants shuffled → same coord.
11. `getCreationPlacementStrategy("christmas")` → null; `("loy_krathong")` returns the same instance twice.
12. `place` with a non-accepted coord rejects `RangeError`; a `zoneItemCounts` rejection propagates.

### `src/services/api/createCreation.test.ts` (node) — per AC
**AC1**
1. Valid public body → 201, `cache-control` contains `no-store`, `Object.keys(body.creation).sort()` equals sorted `PUBLIC_CREATION_KEYS`,
   `eventId "loy_krathong"`, `zoneId 1`, `appearance` equals `defaultAppearanceJson()`, `createdAt === new Date(t).toISOString()`.
2. Every AC1 field-table case from `createCreationRequest.test.ts` (one per field, plus `zoneId`, `expiresAt`, `createdAt` extras) → 400 with the
   expected `field`; `inserts.length === 0`.
3. Coord not on the lane (`laneId 0`) → 400 `coord`. Appearance with an extra key `glow`, `candleColor "#000000"`, or `[]` → 400 `appearance`.
4. `content-type: text/plain` → 415; declared `content-length: 20000` → 413; an actual body of `CREATE_CREATION_REQUEST_MAX_BYTES + 1` bytes
   (wish padded) with no declared length → 413; `rawBody "{"` → 400 `body`.
4b. Wish text (MFW-21 rules on the server): `wishText ""` / `"   "` → 400 `wishText`; `"ก".repeat(WISH_TEXT_MAX_LENGTH + 1)` → 400 `wishText`
   for both visibilities; `"ก".repeat(WISH_TEXT_MAX_LENGTH)` → 201; `"  " + "ก".repeat(WISH_TEXT_MAX_LENGTH) + "  "` → 201 (measured after trim);
   a too-long public text containing `"โทร 0812345678"` → 400 `wishText` (length first).
5. Event closed → 409 `{ error: "event_closed" }`, nothing inserted: `eventId "christmas"`; Loy Krathong with `t = computeCreationExpiresAt("loy_krathong")!.getTime()`;
   `getPlacementStrategy: () => null`.
6. Bad `ownerToken: "not-a-valid-token-value"` → 400 `{ error: "invalid_body", field: "ownerToken" }`, response text does not contain `"not-a-valid"`.

**AC2**
7. `inserts[0].ownerTokenHash === sha256Hex(OWNER_TOKEN_FIXTURE)`; `JSON.stringify(inserts)` does not contain `OWNER_TOKEN_FIXTURE` or `"SeCrEt"`;
   no captured input has a key named `ownerToken`.
8. Response text (201) contains neither `"SeCrEt"` nor the hash.
9. "never logged": `vi.spyOn(console, m)` for `log`, `info`, `warn`, `error`, `debug` → none called across a 201, a 400, a 422 and a 503 request.

**AC3**
10. Private: `wishVisibility "private"`, `wishText "  ขอให้สอบติด  "` → 201; `inserts[0].publicWishText === null`; `privateWish.keyId === TEST_KEY_ID`;
    `PRIVATE_WISH_CIPHERTEXT_PATTERN.test(ciphertext)`; ciphertext does not contain `"ขอให้สอบติด"`;
    `await decryptPrivateWish(privateWish, sha256Hex(token) as OwnerTokenHash, lookup) === "ขอให้สอบติด"`; response `publicWishText === null`; response
    text contains neither the wish, the ciphertext nor `TEST_KEY_ID`.
11. Private wish with PII/profanity (`"โทร 0812345678"`, `"fuck you"`) → 201 (owner decision 13: not moderated).
12. Public wish blocked: for `"โทร 0812345678"`, `"somchai@gmail.com"`, `"fuck you"` → 422 and body `toEqual(toModerationBlockedBody(checkPublicWish(text).reasons))`
    (contains `"phone"` / `"email"` / `"profanity"`); `moderationReasonsFromServerBody(body)` (MFW-21) returns the same reasons; text does not
    contain the wish; `inserts.length === 0`; `getCipher` spy not called.
12b. Same columns as the client: for a public and a private request, the captured `publicWishText` / decrypted private text equal
    `toWishColumns(evaluateWishDraft({ text, visibility }).wish)` (`publicWishText` / `privateWishPlaintext`).
13. Public: `inserts[0].privateWish === null`, `publicWishText` is the trimmed text; `getCipher` not called.
14. `getCipher` rejects (`PrivateWishKeyError("missing")`) on a private wish → 503 `{ error: "unavailable" }`, nothing inserted. A public wish still → 201.

**AC4**
15. `expiresAt === "2026-12-24T17:00:00.000Z"` (= `computeCreationExpiresAt("loy_krathong")`).
16. Seed 80 creations in zone 1 with `repo.insertCreation(makeNewCreation({ zoneId: 1 }))` → POST → `zoneId 2`.
17. Same seed, then `repo.setModeration(firstId, { moderationStatus: "hidden" })` → POST still → `zoneId 2` (hidden rows count, D2).
18. Seed 80 in zone 1 and 1 in zone 3 → `zoneId 2`.

**AC5**
19. A recursive key walk over the 201 body finds none of `PRIVATE_NAMES`; the text contains none of them, nor the token marker, hash, ciphertext or key id.
20. `isProduction: true` with the memory repository → 503, `inserts.length === 0`, `getCipher` not called. With a fake `backend: "supabase"` repository
    and `isProduction: true` → 201 (the guard is only about memory).
21. `getRepository` throws `CreationRepositoryError("backend_misconfigured", "SUPABASE_URL")` → 503 `{ error: "unavailable" }`. A repository whose
    `insertCreationGuarded` rejects `new Error("boom " + hash)` → 503, body exactly `{ error: "unavailable" }`, text without the hash.

**AC6**
22. "moves the krathong off an occupied spot": POST at `t0` with `riverCoord(0.4)`; `t = t0 + 10_000`; POST with `riverCoord(0.48)` → second
    `creation.coord` ≠ requested; spots of both at `t` are ≥ `RIVER_MIN_CENTER_SPACING` apart; `creation.coord.speedFactor === RIVER_DRIFT_SPEED_FACTOR`.
23. Client `speedFactor 0.02` → stored and returned `0.008`.
24. "two racing releases end up apart": `barrierOnZoneCounts(rec, 2)`; `Promise.all` of two POSTs with the same `riverCoord(0.4)` → both 201, both zone 1,
    different ids, spots ≥ spacing apart; `inserts.length === 3` (one `zone_changed` attempt).
25. "gives up after CREATE_CREATION_MAX_ATTEMPTS": a repository double whose `insertCreationGuarded` always returns `zone_changed` → 503 and exactly
    `CREATE_CREATION_MAX_ATTEMPTS` calls.
26. "server time per attempt": `now` returns `t`, then `t + 5`, … → the inserted `createdAt` equals the `now` value of the successful attempt.

### `src/app/api/creations/route.post.test.ts` (node)
`vi.resetModules()`; `vi.stubEnv` `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PRIVATE_WISH_KEY`, `PRIVATE_WISH_KEY_ID`, `VERCEL_ENV` all `""`; fake Date
at `CREATE_NOW_MS`; `const { GET, POST } = await import("./route")`.
1. "works on the in-memory repository without Supabase env": POST a public body → 201; then `GET ?event=loy_krathong&zone=<zoneId>` lists the id.
2. Private body → 201 (ephemeral key) with `publicWishText null`; the text contains none of `PRIVATE_NAMES` and not `"ephemeral"`.
3. `VERCEL_ENV=production` (fresh module import) → POST 503 `{ error: "unavailable" }`.
4. `Object.keys(await import("./route")).sort()` equals `["GET", "POST"]`.

### `src/config/creationWrite.config.test.ts` (node)
1. `CREATE_CREATION_MAX_ATTEMPTS` is a positive integer.
2. "the body cap fits a maximum-length wish": `JSON.stringify(makeCreateBody({ wishText: "ก".repeat(WISH_TEXT_MAX_LENGTH) }))` encoded as UTF-8 is
   `<= CREATE_CREATION_REQUEST_MAX_BYTES`, and so is the same JSON with every non-ASCII character written as a `\uXXXX` escape (the worst case a
   client serializer may send). If the owner raises `WISH_TEXT_MAX_LENGTH` and this fails, raise the cap in the same PR.

### Modified test files (add cases only)
- `json.test.ts`: `cloneJsonObject` returns a deep copy (`not.toBe`, nested arrays copied) and `null` for `[]`, `{ a: NaN }`, a class instance.
- `creationValidation.test.ts`: `validateGuardedNewCreation` passes for a valid input (fresh copy, frozen ids); fails `createdAt` for `new Date(NaN)` and a string;
  `expiresAt` when equal to `createdAt`; `expectedOccupantIds` for a non-array, an uppercase uuid, duplicates and 80 entries; 79 unique ids pass.
- `inMemoryCreationRepository.test.ts`: "zone counts include hidden rows and skip expired ones"; "occupants are ordered and include flagged rows"; "guarded insert:
  stale expected ids → zone_changed and nothing stored"; "guarded insert at the cap → zone_changed"; "expected ids in any order are accepted"; "createdAt is the
  input's"; invalid input stores nothing.
- `supabaseCreationRepository.test.ts`: counts request (POST `/rest/v1/rpc/mfw_zone_item_counts`, body `{ p_event_id }`), bad row → `invalid_backend_response`
  `"zone"`; occupants request and bad coord row → `"occupant"`; "guarded insert request": sorted body keys = the 11 `p_*` names, `p_created_at` ISO,
  `p_expected_occupant_ids` array, `p_owner_token_hash === OWNER_HASH_FIXTURE`, body text contains no raw-token marker; `[]` → `zone_changed`; `[row]` → inserted;
  `[row, row]` → `"insert"`; invalid input → no fetch; a 409 response body containing the hash is never read (spy `json`/`text`).
- `creationRepositoryFactory.test.ts`: `isProductionDeployment({ VERCEL_ENV: "production" })` true; `"preview"`, `" "`, `{}` false.
- `src/config/privateWish.config.test.ts`: `AES_GCM_TAG_LENGTH_BITS === AES_GCM_TAG_BYTES * 8`; the ephemeral id matches `PRIVATE_WISH_KEY_ID_PATTERN`;
  the key pattern accepts `Buffer.alloc(32).toString("base64")` and rejects a 43-char unpadded string.

### `tests/unit/create-creation-migration.test.ts` (node)
Read `supabase/migrations/20261124020000_mfw45_guarded_creation_insert.sql` as `raw`; `sql` = comments stripped, whitespace collapsed, lowercase.
1. File exists; contains no `create table`, `alter table`, `create policy`, `drop `, `create or replace`.
2. For each of `mfw_zone_item_counts`, `mfw_zone_occupants`, `mfw_insert_creation_guarded`: `create function public.<name>(` present; its statement (up to the
   closing `$$;`) contains `security invoker` and `set search_path = ''`; `revoke all on function public.<name>(` … `from public, anon, authenticated` and
   `grant execute on function public.<name>(` … `to service_role` present.
3. No grant to clients: `/\bgrant\b[^;]*\bto\b[^;]*\b(anon|authenticated)\b/` does not match; every `grant … to (\w+)` captures `service_role`.
4. Guarded function: contains `pg_catalog.pg_advisory_xact_lock(`, `is distinct from`, `cardinality(v_current) >= ${ZONE_ITEM_CAP}`, inserts into both tables,
   the `created_at` column in the public insert list, and `returning ${PUBLIC_CREATION_COLUMNS.join(", ")}`.
5. Occupancy predicate `p.expires_at > now()` appears 3 times; no `moderation_status` / `report_count` filter in this file (D2).
6. `/select \*|returning \*|\.\*|count\(\*\)/` does not match.
7. RPC names: each of `ZONE_ITEM_COUNTS_RPC_PATH`, `ZONE_OCCUPANTS_RPC_PATH`, `INSERT_CREATION_GUARDED_RPC_PATH` with `"rpc/"` removed is a function in the file.

### `tests/unit/create-creation-boundary.test.ts` (node)
1. `src/app/api/creations/route.ts`: exported names (`/^export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/gm`) are exactly `GET`, `POST`; no
   `export default`, no `export {`, no `process.env`.
2. No file under `src/components`, `src/store`, `src/core`, or `src/app` outside `src/app/api` matches
   `/services\/api\/(createCreation|createCreationRequest|creationPlacement|privateWishCipher)\b/`; `src/services/api/index.ts` does not re-export them.
3. The string literals `"PRIVATE_WISH_KEY"` / `"PRIVATE_WISH_KEY_ID"` (`/["']PRIVATE_WISH_KEY(_ID)?["']/`) appear only in `src/config/privateWish.config.ts`
   (non-test `src` files); nothing in `src` contains `NEXT_PUBLIC_PRIVATE_WISH`; `"VERCEL_ENV"` only in `src/config/database.config.ts`.
4. `privateWishCipher.ts` contains `"AES-GCM"`, contains none of `AES-CBC`, `AES-CTR`, `node:crypto`, `createCipheriv`.
4b. "wish columns only from an evaluated wish" (MFW-21 privacy audit): in `src/services/api/createCreation.ts`, `evaluateWishDraft(` appears, every
   `toWishColumns(` call is exactly `toWishColumns(evaluation.wish)` (`/toWishColumns\((?!evaluation\.wish\))/` does not match), the first
   `evaluateWishDraft(` comes before the first `toWishColumns(`, and `toWishRequestFields` is not used (it is the client's body builder).
5. Self-check that patterns 2 and 3 match sample strings.

### `tests/e2e/fixtures/createCreationFixtures.ts` (new; **no imports**) and `tests/unit/create-creation-e2e-fixtures.test.ts`
Fixture: `E2E_RIVER_LANE_ID = 1`, `E2E_DRIFT_SPEED_FACTOR = 0.008`, `e2eOwnerToken()` (32 bytes from `globalThis.crypto.getRandomValues`, base64url),
`e2eCreateBody(overrides?)` with the literal default appearance of the example request above. Unit test: `parseCreateCreationRequest(e2eCreateBody())` ok;
`parseEventAppearance("loy_krathong", body.appearance)` ok; `getCreationPlacementStrategy("loy_krathong")!.acceptsCoord(coord)`; `E2E_RIVER_LANE_ID ===
LOY_KRATHONG_RIVER_LANE_ID`; `E2E_DRIFT_SPEED_FACTOR === RIVER_DRIFT_SPEED_FACTOR`; `isDeviceOwnerToken(e2eOwnerToken())`.

### `tests/e2e/create-creation-api.spec.ts` (new; production build, no Supabase env)
1. "refuses malformed requests without echoing them": `text/plain` body → 415; `e2eCreateBody({ zoneId: 3 })` → 400 `{ error: "invalid_body", field: "body" }`;
   `ownerToken: "not-a-valid-token-value"` → 400 field `ownerToken` and the text lacks `"not-a-valid"`; `cache-control` contains `no-store`.
2. "stores a public krathong and returns only public fields": `request.post("/api/creations", { data: e2eCreateBody({ ownerToken: token }) })`.
   If the status is 409, assert the body is `{ error: "event_closed" }`, add a `test.info().annotations` note ("writes closed by flag or expiry; covered by unit
   tests") and return. Otherwise expect 201; the creation's keys are the 8 public keys; the text contains none of `owner_token`, `ownerToken`,
   `private_wish_text`, `privateWishText`, `privateWish` nor the token; `coord.speedFactor === E2E_DRIFT_SPEED_FACTOR`; then
   `GET /api/creations?event=loy_krathong&zone=<zoneId>` lists the id.
3. "keeps a private wish private": same 409 branch; else 201 with `publicWishText null` and the text lacks the wish.

Invariant tests (CLAUDE.md): A — coord parsed on the request and on every DB read, `x/y/z` rejected (request table), only `riverCoordFromSpot` builds the stored coord;
C — AC2/AC5 cases, route.post, e2e; D — migration test (service_role only, no tables/policies changed) and "private text never returned" (AC3 case 10); E — the
80 cap in TS and SQL; F — no UI or animation in this card (nothing to test); G — AC3 case 12 (server enforces with Thai and English inputs).

## Do NOT

- Do not define a second wish visibility type, visibility list, length limit or trim rule, and do not edit `src/config/wish.config.ts` or
  `src/services/api/wishPayload.ts` (MFW-21 owns them). Do not call `checkPublicWish` directly in the handler; use `evaluateWishDraft`.

- Do not build the client submit / fetch helper, the release flow or the bump animation (MFW-23), the WishModal (MFW-21), the ownership-proof or
  private-wish read endpoint and key rotation keyring (MFW-31), report changes (MFW-13), zone UI or pagination (MFW-25), a deletion job, rate limiting,
  idempotency keys or CAPTCHAs.
- Do not edit `supabase/migrations/20261124000000_*` (MFW-12) or MFW-13's migration. Do not apply any migration, run the Supabase CLI or connect to any database.
- Never accept the owner token, its hash, `zoneId`, `expiresAt` or `createdAt` from the client except the raw token in the JSON body. Never put the
  token in a URL, query string, header other than none, log, error message, response or captured state outside the handler.
- Never use `insertCreation` (unguarded) from the route. Never use the in-memory backend in production. Never let a client `speedFactor` reach storage.
- Never read or forward a Supabase/Postgres error body. No `console.*`. No `select('*')`, `select=*`, `returning *`, `count(*)` or row spreading into a response.
- Never prefix a server env var with `NEXT_PUBLIC_`; never write a real key value anywhere (docs, tests, fixtures use generated bytes).
- Do not import `@/core/world` or `@/core/coordinates` barrels from server code; import files by path. No `Vector3`, `.toArray()` or `three` import in
  `src/services/**`, `src/app/api/**`, `supabase/**`, tests included.
- Do not export anything but `GET` and `POST` from `route.ts`; no `dynamic` / `revalidate` / `runtime`.
- No new dependencies (no `@supabase/supabase-js`, `server-only`, `zod`, crypto libraries); no `package.json` / lockfile change.
- Do not touch `.claude/**`, `scripts/**`, `.github/**`, `CLAUDE.md`, `AGENTS.md`, `docs/spec/**` (including `open-questions.md`), `docs/backlog*.json`,
  `docs/prompts/**`, `docs/plans/**`, `vitest.config.mts`, `playwright.config.ts`, `eslint.config.mjs`, `tsconfig.json`, `next.config.ts`, `src/core/**`,
  `src/store/**`, `src/components/**`, `src/services/auth/**`, `src/services/moderation/**`, `src/config/ownership.config.ts`, `src/config/events/**`,
  `src/config/riverFlow.config.ts`, `src/config/world.config.ts`, `src/config/featureFlags.config.ts`, MFW-12's GET handler/`zoneQuery.ts`, or existing tests
  beyond the additions and stubs listed above.

## Definition of done

- Run each separately and get green: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm e2e`. In this cloud container run e2e as
  `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell pnpm e2e`. No Supabase, private-wish-key or `VERCEL_ENV` variables in your shell.
- `pnpm build` lists `ƒ /api/creations`.
- Delete `playwright-report/` and `test-results/` before committing. Never commit `.next/` or `*.tsbuildinfo`. If `next dev` rewrote `AGENTS.md`, leave it.
- Branch `feat/MFW-45-create-creation-api-server-write-path` from the latest `main`, **after MFW-25 and MFW-21 are merged** (MFW-13 is on `main`).
- Conventional commit(s) with the key, e.g. `feat(api): create-creation write path with encryption, moderation and zone placement MFW-45`.
- PR title = the commit subject. English body: link to MFW-45; each AC as a checklist item with the file/test proving it; Decisions D1–D12; Open questions;
  test plan (five commands and results); every ASSUMED INTERFACE difference found; **owner setup steps**: (1) apply the new migration on staging after the
  MFW-12 and MFW-13 migrations (OQ 17) and check with the anon key that the three RPCs are denied; (2) set server-only `PRIVATE_WISH_KEY` (from
  `openssl rand -base64 32`) and `PRIVATE_WISH_KEY_ID` (e.g. a date-based id matching `^[a-z0-9][a-z0-9_-]{0,31}$`, not `ephemeral`) wherever Supabase env is set;
  without them private wishes get 503 there; (3) keep old keys when rotating (MFW-31 needs them to decrypt). Follow-ups: client submit (MFW-23), private read
  (MFW-31), rate limiting / idempotency, deletion job.
- Leave the PR open. Labels `privacy` / `api` plus a migration → the owner merges after reviewer + qa + privacy-auditor pass.

## Interfaces this card provides

| Export | Path | Signature | Used by |
|---|---|---|---|
| `POST /api/creations` | `src/app/api/creations/route.ts` | body `CreateCreationRequestBody` (JSON) → 201 `{ creation: PublicCreation }` · 400 `{ error: "invalid_body", field }` · 409 `{ error: "event_closed" }` · 413 · 415 · 422 `ModerationBlockedBody` · 503 `{ error: "unavailable" }`; `Cache-Control: no-store` | MFW-23 (submit, then `loadZone(creation.zoneId)`; render with the returned coord/createdAt), MFW-30 (store `creation.id`), MFW-21 (parses 422 with `parseModerationBlockedBody`) |
| `CreateCreationRequestBody`, `CreateCreationResponseBody`, `CreateCreationErrorBody`, `CreateCreationField`, `CREATE_CREATION_BODY_KEYS` (visibility and wish rules: MFW-21's `wish.config.ts` / `wishPayload.ts`) | `@/services/api` (client-safe barrel) | Step 11 | MFW-21, MFW-23 |
| `handleCreateCreation`, `CreateCreationDeps`, `getDefaultCreateCreationDeps` | `@/services/api/createCreation` (server) | Step 14 | route; tests |
| `parseCreateCreationRequest` | `@/services/api/createCreationRequest` | Step 12 | handler |
| `CreationPlacementStrategy`, `PlacementSource`, `PlacementResult`, `createRiverPlacementStrategy`, `getCreationPlacementStrategy` | `@/services/api/creationPlacement` | Step 13 | Christmas card (register a cylindrical strategy) |
| `CreationRepository.zoneItemCounts`, `.listZoneOccupants`, `.insertCreationGuarded` | `@/services/api/creationRepository` | Step 6 | handler; future write paths |
| `ZoneItemCount`, `ZoneOccupant`, `GuardedNewCreation`, `GuardedInsertResult` | `@/services/api/creationTypes` | Step 6 | repositories |
| `validateGuardedNewCreation` | `@/services/api/creationValidation` | Step 7 | repositories |
| `PrivateWishCipher`, `createPrivateWishCipher`, `importPrivateWishKey`, `decryptPrivateWish`, `privateWishAdditionalData`, `readPrivateWishKeyEnv`, `createPrivateWishCipherFromEnv`, `getPrivateWishCipher`, `PrivateWishKeyError`, `PrivateWishKeyLookup` | `@/services/api/privateWishCipher` (server) | Step 5; AAD = `"mfw:private-wish\|v1\|<keyId>\|<owner hash>"` | **MFW-31** (decrypt with the owner hash after proof) |
| `bytesToBase64Url`, `base64UrlToBytes`, `base64ToBytes` | `@/services/api/base64url` | Step 4 | MFW-31 |
| `cloneJsonObject` | `@/services/api/json` | `(v: unknown) => JsonObject \| null` | write paths |
| `isProductionDeployment` | `@/services/api/creationRepositoryFactory` | `(env) => boolean` | other write routes |
| `CREATE_CREATION_REQUEST_MAX_BYTES`, `CREATE_CREATION_MAX_ATTEMPTS` | `@/config/creationWrite.config` | `4_096`, `3` | — |
| `PRIVATE_WISH_KEY_ENV`, `PRIVATE_WISH_KEY_ID_ENV`, `AES_256_KEY_BYTES`, `AES_GCM_TAG_LENGTH_BITS`, `PRIVATE_WISH_KEY_BASE64_PATTERN`, `PRIVATE_WISH_AAD_LABEL`, `PRIVATE_WISH_AAD_SEPARATOR`, `PRIVATE_WISH_EPHEMERAL_KEY_ID` | `@/config/privateWish.config` | Step 1 | MFW-31 |
| DB: `mfw_zone_item_counts(text)`, `mfw_zone_occupants(text, integer)`, `mfw_insert_creation_guarded(…, uuid[])` | `supabase/migrations/20261124020000_mfw45_guarded_creation_insert.sql` | Step 2; service_role only | Supabase repository |
| Test fixtures (`OWNER_TOKEN_FIXTURE`, `makeCreateBody`, `makeCreateRequest`, `makeTestCipher`, `recordingRepository`, `barrierOnZoneCounts`, `CREATE_NOW_MS`) | `@/services/api/__fixtures__/createCreation` | Step 17 | MFW-23 / MFW-31 tests |

## Open questions

Product decisions only. This card ships the default listed under each one; each can change later without rework.

1. **Abuse posture of the create endpoint.** Anyone with a valid-looking token (the client makes its own) can create unlimited creations and open zones. Default:
   no rate limit or per-device cap for the private test. Options: (a) default; (b) Vercel firewall / rate-limit rules before Christmas; (c) a per-token-hash
   creation cap (needs an owner number); (d) bot protection on release.
2. **When do writes close for an event?** Default: open while the feature flag is on **and** before `expires_at` (festival end + 30 days); 409 `event_closed`
   otherwise. So Loy Krathong keeps accepting releases after 24 Nov until the owner turns its flag off (OQ 19). Options: (a) default; (b) close at
   `FESTIVAL_ENDS_AT`; (c) a separate write window per event in config.
3. **Do hidden / flagged krathongs keep their river spot and count toward the 80?** Default: yes (they stay "occupied" until deleted), so restoring one can
   never overfill a zone or overlap. Visible effect: a zone with hidden items shows fewer than 80 while new releases go to the next zone. Option: free the
   spot and the slot when an item is hidden (then un-hiding needs its own re-check).

Not reopened here: the wish length (`WISH_TEXT_MAX_LENGTH = 280` is a PLACEHOLDER owned by MFW-21 Open question 1; this server enforces whatever value
that config holds) and "a wish is required" (MFW-21's `text_empty` rule, which this server applies too).

## Decisions

- **D1 — Compare-and-insert under a per-zone advisory lock (new migration).** The collision geometry needs the three.js lane, so it cannot run in SQL. The
  server reads, computes in TS, then calls one SQL function that locks `(event, zone)`, re-reads the occupant id set and inserts only if it is unchanged and
  under 80; else it returns no row and the server retries. This makes both the 80 cap and no-overlap race-safe with two PostgREST calls, no long transaction.
- **D2 — Occupancy counts every stored, non-expired row, any moderation status** (MFW-25 recommendation; Open question 5 for the product side).
- **D3 — Key from `PRIVATE_WISH_KEY` (base64 of 32 bytes) + `PRIVATE_WISH_KEY_ID`, Web Crypto AES-256-GCM, 12-byte random IV, 128-bit tag, MFW-12 envelope.**
  Web Crypto works in Node and tests without `node:crypto`; the key is imported non-extractable; a malformed or half-set env fails closed (503), never falls back.
- **D4 — Additional authenticated data binds label, version, key id and owner hash.** A ciphertext cannot be moved to another row/owner or relabelled with
  another key id. MFW-31 has the hash after ownership proof, so it can decrypt.
- **D5 — Ephemeral per-process key only for the in-memory backend when no key env is set.** In-memory rows die with the process and so does the key, so CI and
  previews exercise the real encryption path without a secret. Supabase without a key → 503 for private wishes.
- **D6 — At most 3 compare-and-insert attempts, fresh server time each.** Contention on one zone is rare in a private test; more attempts only add latency.
- **D7 — In production (`VERCEL_ENV=production`) the create route refuses the in-memory backend (503).** If env names are wrong, writes fail visibly instead of
  vanishing. GET keeps MFW-12's behaviour.
- **D8 — The client's coord is a desired spot; the server re-reads it at server time.** `spawnProgress`/`lateralOffset` are taken as the spot at the server's
  `createdAt`, the stored `created_at` is that same instant (ms), and `speedFactor` is forced. Client clock skew cannot cause overlap.
- **D9 — Request rules:** JSON content type (forces a CORS preflight, as in MFW-13), 4 KiB body cap (a technical bound that a test keeps above a
  maximum-length, JSON-escaped wish), exact six keys, unknown keys → `field: "body"` without echoing the key, errors carry only a field name. 409 for closed events, 422 for moderation (MFW-13 contract), 503 for everything internal.
- **D10 — Validation order** (shape → event open → coord on a lane → appearance → wish length → moderation → backend) so cheap static checks run before any I/O, and the
  cipher/hash run only for requests that will be written.
- **D11 — Per-event placement registry** (`getCreationPlacementStrategy`), like MFW-19's appearance registry. Only Loy Krathong is registered (row 16); an
  unregistered event is closed (409).
- **D12 — Handler logic lives in `src/services/api/createCreation.ts`; `route.ts` only delegates** (route files may export only handlers; the private-name scanner
  forbids those names in `src/app/api`).
- **D13 — The wish rules are MFW-21's shared contract, not a second copy** (covers the MFW-21 privacy-audit notes: `toWishColumns` /
  `toWishRequestFields` trust any `ComposedWish`-shaped object, so the route type-checks the body, calls `evaluateWishDraft`, and only passes
  `evaluation.wish` to `toWishColumns`; MFW-21 has no server-side length cap, so this route enforces `WISH_TEXT_MAX_LENGTH` for both
  visibilities; MFW-13's `validateNewCreation` stays the backstop). The server parses only types (`typeof wishText === "string"`,
  `isWishVisibility`), then calls `evaluateWishDraft` (trim, non-empty, `WISH_TEXT_MAX_LENGTH`, public guard) and `toWishColumns` (exactly one
  column). The WishModal and the server can therefore never disagree. Empty or too-long text → 400 `wishText` before moderation, `moderation_blocked` → 422.

## Out of scope

Client submit and the release ritual (MFW-23), WishModal (MFW-21), private-wish reading, ownership proof and a key-rotation keyring (MFW-31), Find My (MFW-30),
report endpoint (MFW-13), zone directory and pagination (MFW-25), rate limiting / idempotency (Open question 1, Risks), the retention deletion job, applying the
migration and setting up staging (OQ 17), Christmas placement (cylindrical) — the registry is ready for it.

## Risks

- **The SQL was not run against a database in planning.** It uses constructs from MFW-12's verified migration plus `pg_advisory_xact_lock`,
  `hashtextextended` (PG 11+), `array_agg … order by`, `is distinct from` on arrays and a `setof` plpgsql function. The owner should apply it on staging and
  check: two parallel calls with the same `p_expected_occupant_ids` → one row, one empty array; a stale id list → `[]`; anon key → `permission denied`.
- **PostgREST details assumed:** a JSON array maps to the `uuid[]` parameter; a `setof` function returns `[]` / `[row]`; a `returns table` function returns an
  array of objects. Covered by fetch-mock tests only.
- **Fail closed on corrupt occupant rows:** one unparsable row in a zone makes every create into that zone 503. Rows are written only through validated paths.
- **No idempotency:** a client retry after a lost 201 creates a second krathong. Follow-up (needs a contract change: an optional client request id).
- **Read cost:** each create reads the counts plus the occupants of the first non-full zone (usually one zone, ≤ 79 rows). Fine for the private test.
- **Ephemeral key in previews** means private wishes there are unreadable after a cold start, like the in-memory rows themselves. Never used with Supabase.
- **Interface growth:** three new `CreationRepository` members break typed test doubles in MFW-12/13/25 tests (stubs listed in Step 6). MFW-25/21 may land with
  different names; adapt and list differences in the PR.
- **The e2e success test is conditional:** after Loy Krathong writes close (flag off or expiry 2026-12-25) it asserts 409 instead of 201. The success path is
  fully covered by unit tests with an injected clock.
- **`three` in the server bundle** via `riverCollision` / `riverLanes` (already accepted by MFW-12 for `validateCoord`).
- **Reviewer grep noise:** the snake_case names in `supabaseCreationRepository.ts` and the migration, `ownerToken` in request types and tests, and `x: 1` /
  `{ x, y, z }` in negative tests are the ownership write path or absence assertions.
