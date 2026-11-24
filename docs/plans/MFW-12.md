# MFW-12 [2.2] Public/private separated API & database — implementation spec

> Hand-off spec for one card. It is the source of truth for the implementer and the reviewer. If this file and
> `docs/backlog.json` / `docs/spec/open-questions.md` disagree, those files win, and the PR must say so.
> Branch: `feat/MFW-12-public-private-separated-api-database` · Jira: MFW-12 · Epic: MFW-10 (Loop 2)
> Labels: `privacy`, `api`, `db`. Extra reviewer: **privacy-auditor** (the diff touches `src/services/**`,
> `src/app/api/**` and `supabase/**`). Because this is a privacy/db card, the PR stays open and the **owner merges it**.

## Summary

This card creates the storage contract for creations. It adds a Supabase SQL migration with two tables:
`creations_public`, which holds what everyone may see, and `creations_private_ownership`, which holds the owner
token hash, the encrypted private wish, the report count and the moderation status. Both tables have RLS turned on,
and no client role (`anon` / `authenticated`) has any access. A view that only the server can read, called
`creations_public_visible`, joins the moderation status and hides flagged, hidden, auto-hidden (3 reports) and expired items.
On the app side there is one `CreationRepository` interface with two implementations: an in-memory one, used when
the Supabase env vars are absent (CI, previews, local), and a dependency-free PostgREST `fetch` one, used when both
env vars are set. The interface has `listPublicZone` and an atomic `insertCreation`, and the
POST route that calls `insertCreation` is a different card (2.4 / MFW-45). The card also adds
`GET /api/creations?event=…&zone=…`, which returns at most 80 public items per zone through an explicit field
allowlist. Tests prove that `owner_token`, `owner_token_hash` and `private_wish_text` never appear in the response.
The migration is committed to the repo but **never applied** by CI or by the dev. There is no Supabase project or staging yet (open question 17).

## Prerequisites

| Card | State | What this card uses |
|---|---|---|
| MFW-8 [1.2] coordinates | merged on `main` | `parsePersistableCoord(input: unknown): CoordParseResult` from `src/core/coordinates/validateCoord.ts`; `PersistableCoord` type from `src/core/coordinates/types.ts` |
| MFW-7 [1.1] events | merged | `FESTIVAL_EVENT_IDS`, `FestivalEventId` from `src/config/events/types.ts` |
| MFW-2/3/4 scaffold, CI | merged | `src/services/api/index.ts` (currently `export {};`), vitest config (jsdom default, `// @vitest-environment node` per file), Playwright on :3100 |
| **MFW-11 [2.1] owner token** | **NOT merged yet** (plan `docs/plans/MFW-11.md`; implementation in progress) | see below |

**ASSUMED INTERFACE (from MFW-11 plan)**. Check these against `main` before you start:
- `@/services/auth` exports `type OwnerTokenHash = string & { readonly __brand: "OwnerTokenHash" }` and
  `isOwnerTokenHash(value: unknown): value is OwnerTokenHash`.
- `@/config/ownership.config` exports `OWNER_TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/`.

The backlog says this card is blocked by 2.1. Cut the branch from `main` only after MFW-11 is merged. If it is not merged,
stop and report that. Do not copy MFW-11 code into this branch.

Facts the lead checked in this repo (2026-11-24):
- `@supabase/supabase-js` is **not** installed, and neither is `server-only`. Do not add either one (Decision D4).
- `next.config.ts` has `cacheComponents: true`. In this mode a `GET` route handler that reads `request.url`
  becomes dynamic (`ƒ`). `export const dynamic` / `revalidate` are **removed** in this mode, so do not export them. A
  probe build in scratch with `src/app/api/creations/route.ts` built `ƒ /api/creations`, answered 200 with
  `cache-control: no-store`, and answered POST with an automatic 405.
- `src/core/coordinates/validateCoord.ts` imports `./SplinePathCoord`, which imports `three`. Importing
  `parsePersistableCoord` therefore pulls `three` into the server bundle. That works on Node, so accept it (see Risks).
  **Import by file path** (`@/core/coordinates/validateCoord`, `@/core/coordinates/types`), not through the barrel.
- `tests/unit/no-raw-xyz-persistence.test.ts` scans **every** file (tests too) under `src/services`, `src/app/api` and
  `supabase` for a `three` import, `Vector3` and `.toArray()`. None of those strings may appear anywhere in this card.
- The SQL migration in Step 2 was applied to a local PostgreSQL 16 set up with Supabase-like roles (`anon`,
  `authenticated`, `service_role BYPASSRLS`, and Supabase's default "grant all to anon/authenticated/service_role"
  privileges). Results: `anon`/`authenticated` get `permission denied` on both tables, on the view and on the
  function. `service_role` inserts through the function. A failing private insert rolls back the public row. A
  creation with both wishes, an `x` key in coord, a plaintext private wish, a bad hash or zone 0 are all rejected. The view drops
  rows with `report_count = 3` and rows that are `flagged`. Deleting a public row cascades to the private row.
  **The PostgreSQL error `DETAIL` echoes the whole failing row, including `owner_token_hash` and the ciphertext.** So the app must
  never read, log or forward a database error body (Decision D13).

## Acceptance criteria → checks

AC text is verbatim from `docs/backlog.json` story 2.2.

1. **"Supabase tables creations_public (id, event_id, zone_id, appearance JSONB, coord JSONB, public_wish_text,
   created_at, expires_at) and creations_private_ownership (creation_id FK, owner_token_hash, private_wish_text
   encrypted, report_count, moderation_status enum)"**
   - The migration `supabase/migrations/20261124000000_mfw12_creations_public_private.sql` creates both tables
     with exactly those columns. It adds `private_wish_key_id` (owner decision 2: key id per row) and the enum
     `public.moderation_status ('approved','flagged','hidden')`. Test: `tests/unit/creations-migration.test.ts` →
     "creates creations_public with the AC columns", "creates creations_private_ownership with the AC columns and an FK
     to creations_public", "moderation_status enum matches MODERATION_STATUSES".
   - "encrypted": a check constraint only accepts the AES-GCM envelope format (`PRIVATE_WISH_CIPHERTEXT_PATTERN`) or
     null, and a key id must be present exactly when a ciphertext is. The app validates the same pattern before a write. Tests:
     `creations-migration.test.ts` → "ciphertext / key id / owner hash patterns equal the TS config";
     `src/services/api/creationValidation.test.ts` → "rejects a plaintext private wish".
2. **"RLS on both; creations_private_ownership is not exposed to the anon Data API"**
   - Every `create table` has a matching `enable row level security`. Each table has a restrictive deny-all policy for
     `anon, authenticated`. There is `revoke all … from public, anon, authenticated` on both tables, the view and the
     function. No `grant` names `anon` or `authenticated`, and every policy is restrictive. Test:
     `tests/unit/creations-migration.test.ts` (cases listed under Tests).
   - The app reaches Supabase only from server code with the service-role key, and that key's env name appears in exactly one file.
     Client code cannot import the repositories. Test: `tests/unit/public-private-boundary.test.ts`.
3. **"GET /api/creations?event=loy_krathong&zone=1 returns only public fields; test asserts owner_token /
   owner_token_hash / private_wish_text never appear"**
   - `src/app/api/creations/route.test.ts` seeds an in-memory repository with public and private creations
     whose hash, ciphertext and key id are known. The serialized response must not contain `owner_token`, `ownerToken`,
     `owner_token_hash`, `ownerTokenHash`, `private_wish_text`, `privateWishText`, `privateWish`, `report_count`,
     `moderation_status`, or the seeded hash, ciphertext or key-id values. Each item's keys must equal exactly
     `PUBLIC_CREATION_KEYS`.
   - The Supabase repository asks only for the explicit column list, maps rows field by field, and drops private columns even
     if the backend returns them. Test: `src/services/api/supabaseCreationRepository.test.ts`.
   - In the production build without Supabase env, the real route returns a public-only payload. Test: `tests/e2e/creations-api.spec.ts`.
4. **"Zone pagination: ≤ 80 items per zone (owner decision, open question 4)"**
   - `ZONE_ITEM_CAP = 80` lives in `src/config/world.config.ts`. The in-memory repository, the Supabase query
     (`limit=80`, plus a re-cap after mapping) and the route handler (slice) all enforce it. Tests:
     `inMemoryCreationRepository.test.ts` → "returns the oldest 80 of 85"; `supabaseCreationRepository.test.ts` →
     "sends limit=80" and "re-caps 85 returned rows to 80"; `route.test.ts` → "responds with at most 80 items and
     limit 80"; e2e → `items.length <= 80`.

## Owner decisions that apply

These are quoted from `docs/spec/open-questions.md`. Do not reopen them.

- **Row 1:** "the device keeps the raw DeviceOwnerToken in LocalStorage; the server stores only SHA-256(token)… the
  raw token is never stored or logged server-side". → The repository only accepts an `OwnerTokenHash`, and the DB checks
  the 64-hex format. No raw token reaches this card's code. The ownership proof is MFW-31.
- **Row 2:** "AES-256-GCM in the server API route; key in a server-only env var (Vercel, never NEXT_PUBLIC); a key id
  is stored with each encrypted row so the key can be rotated". → This card adds the `private_wish_key_id` column and fixes the
  ciphertext envelope format. The encryption code and its key env var belong to **MFW-45 (2.4)**, which is the write route.
- **Row 3:** "public reads go through a view / server query that joins the private moderation status and excludes
  hidden and flagged items; an item is auto-hidden when report_count reaches 3". → This card adds the view
  `creations_public_visible` and `AUTO_HIDE_REPORT_THRESHOLD = 3`. The report endpoint is **MFW-13 (2.3)**.
- **Row 4:** "80 items per zone". → `ZONE_ITEM_CAP = 80`.
- **Row 10:** "expires_at = 30 days after the festival ends; then public and private rows are deleted". → This card adds
  the `expires_at` column, `RETENTION_DAYS_AFTER_FESTIVAL_END = 30`, `computeCreationExpiresAt()`, hiding of
  expired rows, and `on delete cascade`. **The deletion job is not in scope** (it is a follow-up).
- **Row 17:** "a second Supabase project (Free tier) wired to a protected staging deployment… (not set up yet)". → The migration
  is a plain SQL file that the owner applies. Nothing in CI needs a database.
- **Row 18:** "wipe all private-test data before the Christmas launch". → The schema needs no versioning for test rows.
- **Row 16 / launch plan:** build engine pieces generically. → The tables, the repository and the route are event-agnostic and
  work for every `FestivalEventId` and every coord mode.

Every row that names MFW-12 (1, 2, 3, 10) is already decided. **Do not edit `docs/spec/open-questions.md`.**

## Files

| Path | New/modify | Purpose |
|---|---|---|
| `supabase/migrations/20261124000000_mfw12_creations_public_private.sql` | new | Enum, both tables, RLS, revokes, view, atomic insert function |
| `src/config/world.config.ts` | new | `ZONE_ITEM_CAP`, `ZONE_ID_MIN` |
| `src/config/moderation.config.ts` | new | `MODERATION_STATUSES`, `DEFAULT_MODERATION_STATUS`, `AUTO_HIDE_REPORT_THRESHOLD` (MFW-13 extends this file) |
| `src/config/retention.config.ts` | new | `RETENTION_DAYS_AFTER_FESTIVAL_END`, `MS_PER_DAY`, `FESTIVAL_ENDS_AT` |
| `src/config/privateWish.config.ts` | new | Ciphertext envelope format and key-id format (storage contract for MFW-45) |
| `src/config/database.config.ts` | new | Env var names, PostgREST names/paths, column allowlist, timeout, int4 max, UUID format |
| `src/services/api/json.ts` | new | `isPlainObject`, `isJsonObject`, JSON types |
| `src/services/api/creationTypes.ts` | new | `PublicCreation`, `NewCreation`, `EncryptedPrivateWish`, `ZoneQuery`, response types, `PUBLIC_CREATION_KEYS` |
| `src/services/api/creationRepository.ts` | new | `CreationRepository` interface, `CreationRepositoryError` |
| `src/services/api/creationValidation.ts` | new | `isFestivalEventId`, `isZoneId`, `toIsoTimestamp`, `validateNewCreation` |
| `src/services/api/publicCreation.ts` | new | `publicRowToCreation` (DB row → public object), `pickPublicCreation` (explicit allowlist) |
| `src/services/api/inMemoryCreationRepository.ts` | new | In-memory implementation (two private maps, same filters as the view) |
| `src/services/api/supabaseCreationRepository.ts` | new | PostgREST `fetch` implementation (view GET + RPC POST) |
| `src/services/api/creationRepositoryFactory.ts` | new | Env → repository; process singleton `getCreationRepository()` |
| `src/services/api/zoneQuery.ts` | new | `parseZoneQuery(URLSearchParams)` |
| `src/services/api/listCreations.ts` | new | `handleListCreations(request, getRepository)` (GET logic, testable) |
| `src/services/api/retention.ts` | new | `computeCreationExpiresAt(eventId)` |
| `src/services/api/__fixtures__/creations.ts` | new | Shared test fixtures (known hash, ciphertext, key id, `makeNewCreation`) |
| `src/services/api/index.ts` | modify | Client-safe barrel (types + `PUBLIC_CREATION_KEYS` only) |
| `src/app/api/creations/route.ts` | new | `GET` only, delegates to `handleListCreations` |
| `src/services/api/*.test.ts` | new | `json`, `creationValidation`, `publicCreation`, `inMemoryCreationRepository`, `supabaseCreationRepository`, `creationRepositoryFactory`, `zoneQuery`, `retention` |
| `src/config/privateWish.config.test.ts` | new | Envelope length derivations |
| `src/app/api/creations/route.test.ts` | new | AC 3 / AC 4 through the handler and the real `GET` |
| `tests/unit/creations-migration.test.ts` | new | Static checks on the SQL (AC 1 / AC 2) |
| `tests/unit/public-private-boundary.test.ts` | new | Static checks: no console, no `*` select, env name location, client import boundary, private names location |
| `tests/e2e/creations-api.spec.ts` | new | Production-build API check without Supabase env |

## Implementation steps

Conventions for every new file: TypeScript strict, English comments, no `any`, named constants only (no inline numbers
except `0`, `1` and those written in the formulas below), `Object.freeze` on exported constant arrays/objects like the
existing configs do. Use **no `console.*`** in any new non-test file. Error messages contain only codes, field names or
HTTP status numbers, never input values, row contents or keys.

### Step 1 — config files (all new)

`src/config/world.config.ts`
```ts
/** Max creations returned (and rendered) per zone; more participants open new zones (owner, 2026-11-23, open question 4). */
export const ZONE_ITEM_CAP = 80;
/** Zones are numbered from 1 (spec "zone=1", backlog 5.3 "Zone 2, 3, …"). Lead decision, MFW-12. */
export const ZONE_ID_MIN = 1;
```

`src/config/moderation.config.ts` (MFW-13 later adds its PII/profanity rules to this same file)
```ts
/** spec §5 moderation_status enum; order equals the SQL enum public.moderation_status. */
export const MODERATION_STATUSES = Object.freeze(["approved", "flagged", "hidden"] as const);
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];
/** New rows are visible; the server-side guard (2.3, run by the 2.4 route) happens before the insert. Lead decision, MFW-12 (D12). */
export const DEFAULT_MODERATION_STATUS: ModerationStatus = "approved";
/** An item is auto-hidden when report_count reaches this value (owner, 2026-11-23, open question 3). Mirrored in the SQL view. */
export const AUTO_HIDE_REPORT_THRESHOLD = 3;
```

`src/config/retention.config.ts`
```ts
import type { FestivalEventId } from "./events/types";

/** expires_at = festival end + this many days; then public and private rows are deleted (owner, 2026-11-23, open question 10). */
export const RETENTION_DAYS_AFTER_FESTIVAL_END = 30;
export const MS_PER_DAY = 86_400_000;
/**
 * Instant each festival ends (exclusive), ISO-8601 with offset. Loy Krathong 2026 = 24 Nov (docs/spec/01-roadmap.md);
 * "end" = end of that day in Thailand (UTC+7). PLACEHOLDER interpretation (spec silent): see Open question 1.
 * Events without an entry have no retention date yet → computeCreationExpiresAt returns null (2.4 must refuse to create).
 */
export const FESTIVAL_ENDS_AT: Readonly<Partial<Record<FestivalEventId, string>>> = Object.freeze({
  loy_krathong: "2026-11-25T00:00:00+07:00",
});
```

`src/config/privateWish.config.ts`
```ts
/**
 * Storage contract of creations_private_ownership.private_wish_text (owner decision 2: AES-256-GCM, key id per row).
 * Envelope: "v1.<base64url(IV)>.<base64url(ciphertext || GCM tag)>", base64url without padding.
 * MFW-45 (2.4) produces it; this card only stores and validates it.
 */
export const PRIVATE_WISH_ENVELOPE_VERSION = "v1";
export const AES_GCM_IV_BYTES = 12;
export const AES_GCM_TAG_BYTES = 16;
/** 12-byte IV → 16 chars; ciphertext+tag ≥ 16 bytes → ≥ 22 chars. Same regex text is in the SQL check constraint. */
export const PRIVATE_WISH_CIPHERTEXT_PATTERN = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/;
/** Key id stored next to each ciphertext (lowercase, 1–32 chars). Same regex text is in the SQL check constraint. */
export const PRIVATE_WISH_KEY_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;
```

`src/config/database.config.ts`
```ts
/** Server-only env var names (never NEXT_PUBLIC). Both set → Supabase backend; both absent → in-memory; one → misconfigured. */
export const SUPABASE_URL_ENV = "SUPABASE_URL";
export const SUPABASE_SERVICE_ROLE_KEY_ENV = "SUPABASE_SERVICE_ROLE_KEY";
/** Hostnames allowed over plain http (local Supabase only); everything else must be https. */
export const LOCAL_SUPABASE_HOSTNAMES = Object.freeze(["localhost", "127.0.0.1"] as const);
/** PostgREST base path, relative to the project URL. */
export const SUPABASE_REST_PATH = "/rest/v1/";
/** Server-only view that hides flagged / hidden / auto-hidden / expired items (open question 3). */
export const CREATIONS_PUBLIC_VISIBLE_VIEW = "creations_public_visible";
/** Atomic two-table insert function (relative to SUPABASE_REST_PATH). */
export const INSERT_CREATION_RPC_PATH = "rpc/mfw_insert_creation";
/** Stable zone order: oldest first, id as tie-breaker. */
export const PUBLIC_ZONE_ORDER = "created_at.asc,id.asc";
/** Explicit column allowlist for every public read (invariant C). Never "*". */
export const PUBLIC_CREATION_COLUMNS = Object.freeze([
  "id", "event_id", "zone_id", "appearance", "coord", "public_wish_text", "created_at", "expires_at",
] as const);
/** Fail fast so callers get 503 instead of hanging. Lead decision, MFW-12. */
export const SUPABASE_REQUEST_TIMEOUT_MS = 5_000;
/** Postgres `integer` upper bound (zone_id column type). */
export const PG_INT4_MAX = 2_147_483_647;
/** Postgres uuid text form (lowercase). */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
```

Constant table:

| Constant | Value | File | Source |
|---|---|---|---|
| `ZONE_ITEM_CAP` | `80` | `world.config.ts` | owner, OQ 4 |
| `ZONE_ID_MIN` | `1` | `world.config.ts` | lead (spec examples) |
| `MODERATION_STATUSES` | `approved, flagged, hidden` | `moderation.config.ts` | spec §5 |
| `DEFAULT_MODERATION_STATUS` | `"approved"` | `moderation.config.ts` | lead (D12) |
| `AUTO_HIDE_REPORT_THRESHOLD` | `3` | `moderation.config.ts` | owner, OQ 3 |
| `RETENTION_DAYS_AFTER_FESTIVAL_END` | `30` | `retention.config.ts` | owner, OQ 10 |
| `MS_PER_DAY` | `86_400_000` | `retention.config.ts` | unit |
| `FESTIVAL_ENDS_AT.loy_krathong` | `"2026-11-25T00:00:00+07:00"` | `retention.config.ts` | **PLACEHOLDER (spec silent on the end instant)**, Open question 1 |
| `AES_GCM_IV_BYTES` / `AES_GCM_TAG_BYTES` | `12` / `16` | `privateWish.config.ts` | AES-GCM standard sizes |
| `PRIVATE_WISH_CIPHERTEXT_PATTERN` / `PRIVATE_WISH_KEY_ID_PATTERN` | regexes above | `privateWish.config.ts` | lead (D7) |
| `SUPABASE_REQUEST_TIMEOUT_MS` | `5_000` | `database.config.ts` | lead (D16) |
| `PG_INT4_MAX` | `2_147_483_647` | `database.config.ts` | Postgres |

### Step 2 — `supabase/migrations/20261124000000_mfw12_creations_public_private.sql` (new)

Write this file **exactly** as below. The lead verified it on PostgreSQL 16 with Supabase-like roles. Do not run it against any
remote database. Keep the regex literals byte-identical to the TS patterns, because a test compares them.

```sql
-- MFW-12 (backlog 2.2): public/private separated creations storage.
-- Applied by the owner to the Supabase project (open question 17). Never applied by CI.
-- Clients (anon / authenticated) have no access at all: every read and write goes through the Next.js
-- server with the service-role key (invariants C and D).

create type public.moderation_status as enum ('approved', 'flagged', 'hidden');

create table public.creations_public (
  id uuid primary key default gen_random_uuid(),
  event_id text not null
    constraint creations_public_event_id_known check (event_id in (
      'loy_krathong', 'christmas', 'new_year', 'chinese_new_year',
      'valentines', 'songkran', 'mid_autumn', 'halloween'
    )),
  zone_id integer not null
    constraint creations_public_zone_id_min check (zone_id >= 1),
  appearance jsonb not null
    constraint creations_public_appearance_object check (jsonb_typeof(appearance) = 'object'),
  coord jsonb not null
    constraint creations_public_coord_parametric check (
      jsonb_typeof(coord) = 'object'
      and coord ->> 'mode' in ('SPLINE_PATH', 'CYLINDRICAL_SURFACE', 'PLANAR_ZONE')
      and not (coord ?| array['x', 'y', 'z', 'position'])
    ),
  public_wish_text text
    constraint creations_public_wish_not_blank check (public_wish_text is null or btrim(public_wish_text) <> ''),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint creations_public_expires_after_created check (expires_at > created_at)
);

create index creations_public_event_zone_created_idx
  on public.creations_public (event_id, zone_id, created_at, id);

create table public.creations_private_ownership (
  creation_id uuid primary key
    references public.creations_public (id) on delete cascade,
  owner_token_hash text not null
    constraint creations_private_owner_hash_format check (owner_token_hash ~ '^[0-9a-f]{64}$'),
  private_wish_text text
    constraint creations_private_wish_ciphertext_format check (
      private_wish_text is null or private_wish_text ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$'
    ),
  private_wish_key_id text
    constraint creations_private_wish_key_id_format check (
      private_wish_key_id is null or private_wish_key_id ~ '^[a-z0-9][a-z0-9_-]{0,31}$'
    ),
  report_count integer not null default 0
    constraint creations_private_report_count_min check (report_count >= 0),
  moderation_status public.moderation_status not null default 'approved',
  constraint creations_private_wish_key_pair check ((private_wish_text is null) = (private_wish_key_id is null))
);

-- Invariant D: RLS on every table; clients get no rows and no privileges.
alter table public.creations_public enable row level security;
alter table public.creations_private_ownership enable row level security;

create policy creations_public_deny_clients on public.creations_public
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy creations_private_ownership_deny_clients on public.creations_private_ownership
  as restrictive for all to anon, authenticated using (false) with check (false);

revoke all on table public.creations_public from public, anon, authenticated;
revoke all on table public.creations_private_ownership from public, anon, authenticated;
grant select, insert, update, delete on table public.creations_public to service_role;
grant select, insert, update, delete on table public.creations_private_ownership to service_role;

-- Open question 3: public reads exclude hidden / flagged items and items at the auto-hide threshold (3 reports);
-- open question 10: expired rows are never served (the deletion job is a follow-up).
create view public.creations_public_visible
  with (security_invoker = true)
as
select p.id, p.event_id, p.zone_id, p.appearance, p.coord, p.public_wish_text, p.created_at, p.expires_at
from public.creations_public as p
join public.creations_private_ownership as o on o.creation_id = p.id
where o.moderation_status = 'approved'
  and o.report_count < 3
  and p.expires_at > now();

revoke all on table public.creations_public_visible from public, anon, authenticated;
grant select on table public.creations_public_visible to service_role;

-- Atomic write of one creation: public row + private ownership row in one transaction.
-- Returns only the public row. Called by the server write path (MFW-45) through PostgREST RPC.
create function public.mfw_insert_creation(
  p_event_id text,
  p_zone_id integer,
  p_appearance jsonb,
  p_coord jsonb,
  p_public_wish_text text,
  p_expires_at timestamptz,
  p_owner_token_hash text,
  p_private_wish_text text,
  p_private_wish_key_id text
)
returns public.creations_public
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.creations_public;
begin
  if p_public_wish_text is not null and p_private_wish_text is not null then
    raise exception 'a creation has a public or a private wish, not both' using errcode = '22023';
  end if;

  insert into public.creations_public (event_id, zone_id, appearance, coord, public_wish_text, expires_at)
  values (p_event_id, p_zone_id, p_appearance, p_coord, p_public_wish_text, p_expires_at)
  returning id, event_id, zone_id, appearance, coord, public_wish_text, created_at, expires_at
  into v_row;

  insert into public.creations_private_ownership (creation_id, owner_token_hash, private_wish_text, private_wish_key_id)
  values (v_row.id, p_owner_token_hash, p_private_wish_text, p_private_wish_key_id);

  return v_row;
end;
$$;

revoke all on function public.mfw_insert_creation(text, integer, jsonb, jsonb, text, timestamptz, text, text, text)
  from public, anon, authenticated;
grant execute on function public.mfw_insert_creation(text, integer, jsonb, jsonb, text, timestamptz, text, text, text)
  to service_role;

notify pgrst, 'reload schema';
```

### Step 3 — `src/services/api/json.ts` (new)

```ts
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

/** Plain object: prototype is Object.prototype or null (same rule as validateCoord). */
export function isPlainObject(value: unknown): value is Record<string, unknown>;
/** Plain object whose values are JSON values all the way down (finite numbers only, no cycles, no class instances). */
export function isJsonObject(value: unknown): value is JsonObject;
```
`isPlainObject` works like the private helper in `validateCoord.ts`. Copy that logic; do not import the private function.
`isJsonObject(v)` is `isPlainObject(v) && isJsonValueInner(v, new Set())`, where
```ts
function isJsonValueInner(value: unknown, stack: Set<object>): boolean {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false; // undefined, function, symbol, bigint
  if (stack.has(value)) return false; // cycle
  stack.add(value);
  try {
    if (Array.isArray(value)) return value.every((item) => isJsonValueInner(item, stack));
    if (!isPlainObject(value)) return false; // Date, Map, class instances
    return Object.values(value).every((item) => isJsonValueInner(item, stack));
  } finally {
    stack.delete(value);
  }
}
```

### Step 4 — `src/services/api/creationTypes.ts` (new)

```ts
import type { FestivalEventId } from "@/config/events/types";
import type { PersistableCoord } from "@/core/coordinates/types";
import type { OwnerTokenHash } from "@/services/auth"; // ASSUMED INTERFACE (from MFW-11 plan); type-only import
import type { JsonObject } from "./json";

/** creations_public.appearance (spec §5): a JSON object. Its per-event schema is validated by the write path (2.4). */
export type AppearanceJson = JsonObject;

/** The ONLY creation shape that may leave the server on a public path (invariant C). */
export interface PublicCreation {
  readonly id: string; // uuid
  readonly eventId: FestivalEventId;
  readonly zoneId: number; // integer >= ZONE_ID_MIN
  readonly appearance: AppearanceJson;
  readonly coord: PersistableCoord; // invariant A
  readonly publicWishText: string | null;
  readonly createdAt: string; // ISO-8601 UTC ("2026-11-24T12:00:00.000Z")
  readonly expiresAt: string; // ISO-8601 UTC
}

/** Exact key set of PublicCreation, in this order. Tests compare response items against it. */
export const PUBLIC_CREATION_KEYS = Object.freeze([
  "id", "eventId", "zoneId", "appearance", "coord", "publicWishText", "createdAt", "expiresAt",
] as const);

/** AES-256-GCM envelope matching PRIVATE_WISH_CIPHERTEXT_PATTERN (produced by MFW-45). */
export type PrivateWishCiphertext = string & { readonly __brand: "PrivateWishCiphertext" };

export interface EncryptedPrivateWish {
  readonly ciphertext: PrivateWishCiphertext;
  readonly keyId: string; // matches PRIVATE_WISH_KEY_ID_PATTERN
}

/** Server write path input (MFW-45). Server-only; never built from a public response. */
export interface NewCreation {
  readonly eventId: FestivalEventId;
  readonly zoneId: number;
  readonly appearance: AppearanceJson;
  readonly coord: PersistableCoord;
  readonly publicWishText: string | null; // already passed the 2.3 guard
  readonly expiresAt: Date; // from computeCreationExpiresAt
  readonly ownerTokenHash: OwnerTokenHash; // SHA-256 of the raw token; the raw token never reaches the repository
  readonly privateWish: EncryptedPrivateWish | null; // at most one of publicWishText / privateWish is non-null
}

export interface ZoneQuery {
  readonly eventId: FestivalEventId;
  readonly zoneId: number;
}

/** Body of GET /api/creations (200). */
export interface PublicZoneResponse {
  readonly eventId: FestivalEventId;
  readonly zoneId: number;
  readonly limit: number; // ZONE_ITEM_CAP
  readonly items: readonly PublicCreation[];
}

export type ZoneQueryField = "event" | "zone";

/** Body of GET /api/creations errors. Never contains internal details. */
export type ApiErrorBody =
  | { readonly error: "invalid_query"; readonly field: ZoneQueryField }
  | { readonly error: "unavailable" };
```

Example 200 body (one item):
```json
{
  "eventId": "loy_krathong",
  "zoneId": 1,
  "limit": 80,
  "items": [
    {
      "id": "950118ce-7d93-4cb6-bd84-44d91c5de9e3",
      "eventId": "loy_krathong",
      "zoneId": 1,
      "appearance": { "base": "banana_trunk_01", "lotusFold": "style_02", "flowers": ["marigold", "orchid"], "candleColor": "#FFD166" },
      "coord": { "mode": "SPLINE_PATH", "laneId": 0, "spawnProgress": 0.25, "speedFactor": 0.008, "lateralOffset": 0 },
      "publicWishText": "ขอให้ทุกคนมีความสุข",
      "createdAt": "2026-11-24T12:00:00.000Z",
      "expiresAt": "2026-12-24T17:00:00.000Z"
    }
  ]
}
```

### Step 5 — `src/services/api/creationRepository.ts` (new)

```ts
import type { NewCreation, PublicCreation, ZoneQuery } from "./creationTypes";

export type CreationBackend = "memory" | "supabase";

export type CreationRepositoryErrorCode =
  | "invalid_input" // a NewCreation / ZoneQuery field failed validation (detail = field name)
  | "backend_misconfigured" // env / options wrong (detail = env var name or option name, never its value)
  | "backend_request_failed" // network error or non-2xx (detail = "network" | "status <n>")
  | "invalid_backend_response"; // 2xx but unusable body (detail = "json" | "list" | "insert" | "id")

export class CreationRepositoryError extends Error {
  readonly code: CreationRepositoryErrorCode;
  readonly detail: string | undefined;
  constructor(code: CreationRepositoryErrorCode, detail?: string) {
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.name = "CreationRepositoryError";
    this.code = code;
    this.detail = detail;
  }
}

/**
 * Storage of creations, split into public and private parts (spec §5). Implementations: in-memory (no env) and
 * Supabase (env set). Later cards ADD methods here (MFW-13 report, MFW-31 ownership proof, MFW-45 zone occupancy).
 */
export interface CreationRepository {
  readonly backend: CreationBackend;
  /**
   * Visible creations of one zone: moderation_status 'approved', report_count < AUTO_HIDE_REPORT_THRESHOLD,
   * expires_at > now; ordered by createdAt then id ascending; at most ZONE_ITEM_CAP. Returns PublicCreation only.
   */
  listPublicZone(query: ZoneQuery): Promise<readonly PublicCreation[]>;
  /**
   * Server write path only (MFW-45). Validates with validateNewCreation, then writes the public row and the private
   * ownership row atomically. Returns only the public part. Rejects with CreationRepositoryError.
   */
  insertCreation(input: NewCreation): Promise<PublicCreation>;
}
```

### Step 6 — `src/services/api/creationValidation.ts` (new)

```ts
import { FESTIVAL_EVENT_IDS, type FestivalEventId } from "@/config/events/types";
import { PG_INT4_MAX } from "@/config/database.config";
import { PRIVATE_WISH_CIPHERTEXT_PATTERN, PRIVATE_WISH_KEY_ID_PATTERN } from "@/config/privateWish.config";
import { ZONE_ID_MIN } from "@/config/world.config";
import { parsePersistableCoord } from "@/core/coordinates/validateCoord";
import { isOwnerTokenHash } from "@/services/auth"; // ASSUMED INTERFACE (from MFW-11 plan)
import { CreationRepositoryError } from "./creationRepository";
import type { NewCreation, PrivateWishCiphertext } from "./creationTypes";
import { isJsonObject, isPlainObject } from "./json";

export function isFestivalEventId(value: unknown): value is FestivalEventId;
export function isZoneId(value: unknown): value is number;
export function toIsoTimestamp(value: unknown): string | null;
export function validateNewCreation(input: NewCreation, nowMs: number): NewCreation;
```
- `isFestivalEventId`: `typeof value === "string" && (FESTIVAL_EVENT_IDS as readonly string[]).includes(value)`.
- `isZoneId`: `typeof value === "number" && Number.isInteger(value) && value >= ZONE_ID_MIN && value <= PG_INT4_MAX`.
- `toIsoTimestamp`: if `typeof value !== "string"`, return `null`. Otherwise `const ms = Date.parse(value)` and return
  `Number.isFinite(ms) ? new Date(ms).toISOString() : null`. (Postgres sends `"2026-11-24T18:19:33.562709+00:00"`. JS
  truncates the fraction to milliseconds, which gives `"2026-11-24T18:19:33.562Z"`.)
- `validateNewCreation(input, nowMs)` checks in this order. The first failure throws
  `new CreationRepositoryError("invalid_input", "<field>")`, where `<field>` is the `NewCreation` key named here:
  1. `eventId`: `isFestivalEventId`.
  2. `zoneId`: `isZoneId`.
  3. `appearance`: `isJsonObject`.
  4. `coord`: `parsePersistableCoord(input.coord)` must be `ok`. Keep the returned copy.
  5. `publicWishText`: must be `null`, or a `string` whose `.trim()` is not `""`.
  6. `expiresAt`: must be `instanceof Date`, `Number.isFinite(getTime())` and `getTime() > nowMs`.
  7. `ownerTokenHash`: `isOwnerTokenHash`.
  8. `privateWish`: must be `null`, or `isPlainObject` with `typeof ciphertext === "string"` and
     `PRIVATE_WISH_CIPHERTEXT_PATTERN.test(ciphertext)`, and with `typeof keyId === "string"` and
     `PRIVATE_WISH_KEY_ID_PATTERN.test(keyId)`.
  9. Both wishes: if `publicWishText !== null && privateWish !== null`, throw `"privateWish"`.

  If every check passes, return a **fresh** object built field by field (no spread):
  `{ eventId, zoneId, appearance: structuredClone(input.appearance), coord: parsed.coord, publicWishText,
  expiresAt: new Date(input.expiresAt.getTime()), ownerTokenHash, privateWish: privateWish === null ? null :
  { ciphertext: privateWish.ciphertext as PrivateWishCiphertext, keyId: privateWish.keyId } }`.
  Use `structuredClone(input.appearance) as AppearanceJson`. Import the `AppearanceJson` type if TypeScript needs it.

The repository does **not** moderate text. The 2.3 guard runs in the 2.4 route before `insertCreation` (invariant G).

### Step 7 — `src/services/api/publicCreation.ts` (new)

```ts
import { UUID_PATTERN } from "@/config/database.config";
import { parsePersistableCoord } from "@/core/coordinates/validateCoord";
import type { PublicCreation } from "./creationTypes";
import { isFestivalEventId, isZoneId, toIsoTimestamp } from "./creationValidation";
import { isJsonObject, isPlainObject } from "./json";

/** Maps one creations_public / creations_public_visible row (snake_case) to a PublicCreation, or null if invalid. */
export function publicRowToCreation(row: unknown): PublicCreation | null;
/** Explicit allowlist copy: returns an object with exactly PUBLIC_CREATION_KEYS, whatever extra keys `source` has at runtime. */
export function pickPublicCreation(source: PublicCreation): PublicCreation;
```
`publicRowToCreation`:
```ts
if (!isPlainObject(row)) return null;
const { id, event_id, zone_id, appearance, coord, public_wish_text, created_at, expires_at } = row; // named keys only, no rest/spread
if (typeof id !== "string" || !UUID_PATTERN.test(id)) return null;
if (!isFestivalEventId(event_id) || !isZoneId(zone_id) || !isJsonObject(appearance)) return null;
const parsed = parsePersistableCoord(coord);
if (!parsed.ok) return null;
if (public_wish_text !== null && typeof public_wish_text !== "string") return null;
const createdAt = toIsoTimestamp(created_at);
const expiresAt = toIsoTimestamp(expires_at);
if (createdAt === null || expiresAt === null) return null;
return { id, eventId: event_id, zoneId: zone_id, appearance, coord: parsed.coord, publicWishText: public_wish_text, createdAt, expiresAt };
```
`pickPublicCreation` returns `{ id: source.id, eventId: source.eventId, zoneId: source.zoneId, appearance:
source.appearance, coord: source.coord, publicWishText: source.publicWishText, createdAt: source.createdAt,
expiresAt: source.expiresAt }`.

### Step 8 — `src/services/api/inMemoryCreationRepository.ts` (new)

```ts
import type { ModerationStatus } from "@/config/moderation.config";
import type { CreationRepository } from "./creationRepository";

export interface InMemoryCreationRepositoryOptions {
  /** Epoch ms clock; default Date.now. */
  readonly now?: () => number;
  /** Id generator; default () => globalThis.crypto.randomUUID(). */
  readonly newId?: () => string;
}

export interface CreationModerationPatch {
  readonly moderationStatus?: ModerationStatus;
  readonly reportCount?: number; // integer >= 0
}

export interface InMemoryCreationRepository extends CreationRepository {
  readonly backend: "memory";
  /** Mirrors a private-table update (used by tests now, by MFW-13's in-memory report path later). false = unknown id. */
  setModeration(id: string, patch: CreationModerationPatch): boolean;
}

export function createInMemoryCreationRepository(options?: InMemoryCreationRepositoryOptions): InMemoryCreationRepository;
```
Internals live in a closure and are never exported. There are **two separate maps**, like the two tables:
```ts
interface StoredPublicRow { id: string; eventId: FestivalEventId; zoneId: number; appearance: AppearanceJson;
  coord: PersistableCoord; publicWishText: string | null; createdAtMs: number; expiresAtMs: number }
interface StoredPrivateRow { creationId: string; ownerTokenHash: OwnerTokenHash; privateWish: EncryptedPrivateWish | null;
  reportCount: number; moderationStatus: ModerationStatus }
const publicRows = new Map<string, StoredPublicRow>();
const privateRows = new Map<string, StoredPrivateRow>();
```
- `toPublic(row)` returns `{ id, eventId, zoneId, appearance: structuredClone(row.appearance), coord: structuredClone(row.coord),
  publicWishText, createdAt: new Date(row.createdAtMs).toISOString(), expiresAt: new Date(row.expiresAtMs).toISOString() }`.
- `insertCreation(input)` is `async`:
  1. `const nowMs = now(); const v = validateNewCreation(input, nowMs);` Validation throws before anything is stored.
  2. `const id = newId();` If `!UUID_PATTERN.test(id) || publicRows.has(id)`, throw `CreationRepositoryError("invalid_backend_response", "id")`.
  3. Store the public row (`createdAtMs: nowMs`, `expiresAtMs: v.expiresAt.getTime()`) and the private row
     (`reportCount: 0`, `moderationStatus: DEFAULT_MODERATION_STATUS`).
  4. Return `toPublic(publicRow)`.
- `listPublicZone(query)` is `async`. If `!isFestivalEventId(query.eventId) || !isZoneId(query.zoneId)`, throw
  `invalid_input` with detail `"eventId"` / `"zoneId"`. Otherwise `const nowMs = now();` and:
  ```ts
  return [...publicRows.values()]
    .filter((r) => r.eventId === query.eventId && r.zoneId === query.zoneId && r.expiresAtMs > nowMs)
    .filter((r) => {
      const p = privateRows.get(r.id);
      return p !== undefined && p.moderationStatus === "approved" && p.reportCount < AUTO_HIDE_REPORT_THRESHOLD;
    })
    .sort((a, b) => a.createdAtMs - b.createdAtMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, ZONE_ITEM_CAP)
    .map(toPublic);
  ```
- `setModeration(id, patch)`: if `patch.moderationStatus !== undefined && !MODERATION_STATUSES.includes(…)`, throw
  `invalid_input` with detail `"moderationStatus"`. If `patch.reportCount !== undefined && !(Number.isInteger(…) && … >= 0)`, throw `invalid_input`
  with detail `"reportCount"`. If there is no private row for `id`, return `false`. Otherwise update the given fields and return `true`.

### Step 9 — `src/services/api/supabaseCreationRepository.ts` (new)

This is the only non-test app file that contains the snake_case private column names (as RPC parameter names).

```ts
import type { CreationRepository } from "./creationRepository";

export interface SupabaseCreationRepositoryOptions {
  readonly url: string; // project URL, https (http only for LOCAL_SUPABASE_HOSTNAMES)
  readonly serviceRoleKey: string; // server-only secret; never logged, never in an error message
  readonly fetch?: typeof fetch; // injected in tests
  readonly timeoutMs?: number; // default SUPABASE_REQUEST_TIMEOUT_MS
  readonly now?: () => number; // default Date.now (only for validateNewCreation's expiresAt check)
}

/** Body of POST /rest/v1/rpc/mfw_insert_creation; keys equal the SQL parameter names. */
export interface InsertCreationRpcBody {
  readonly p_event_id: string;
  readonly p_zone_id: number;
  readonly p_appearance: AppearanceJson;
  readonly p_coord: PersistableCoord;
  readonly p_public_wish_text: string | null;
  readonly p_expires_at: string; // ISO-8601
  readonly p_owner_token_hash: string;
  readonly p_private_wish_text: string | null; // ciphertext envelope, never plaintext
  readonly p_private_wish_key_id: string | null;
}

export function createSupabaseCreationRepository(options: SupabaseCreationRepositoryOptions): CreationRepository;
```
Construction runs synchronously and throws `CreationRepositoryError("backend_misconfigured", …)`:
1. `let base: URL; try { base = new URL(options.url); } catch { throw …("backend_misconfigured", "url"); }`
2. Allowed: `base.protocol === "https:"`, or `base.protocol === "http:"` with `base.hostname` in `LOCAL_SUPABASE_HOSTNAMES`.
   Anything else throws detail `"url"`.
3. `const key = options.serviceRoleKey.trim();` An empty key throws detail `"serviceRoleKey"`.
4. `const restBase = new URL(SUPABASE_REST_PATH, base);` (for example `https://abc.supabase.co/rest/v1/`).
5. `const fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));`

Headers are built fresh for each request:
```ts
function buildHeaders(withJsonBody: boolean): Record<string, string> {
  const headers: Record<string, string> = { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" };
  if (withJsonBody) headers["Content-Type"] = "application/json";
  return headers;
}
```
Request helper. **Never read the body of a non-2xx response** (Decision D13):
```ts
async function send(target: URL, method: "GET" | "POST", body?: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(target, {
      method,
      headers: buildHeaders(body !== undefined),
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new CreationRepositoryError("backend_request_failed", "network");
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new CreationRepositoryError("backend_request_failed", `status ${res.status}`);
  }
  try {
    return await res.json();
  } catch {
    throw new CreationRepositoryError("invalid_backend_response", "json");
  }
}
```
`listPublicZone(query)`:
1. Guard the query like the in-memory repository does (`invalid_input`).
2. ```ts
   const target = new URL(CREATIONS_PUBLIC_VISIBLE_VIEW, restBase);
   target.searchParams.set("select", PUBLIC_CREATION_COLUMNS.join(","));
   target.searchParams.set("event_id", `eq.${query.eventId}`);
   target.searchParams.set("zone_id", `eq.${query.zoneId}`);
   target.searchParams.set("order", PUBLIC_ZONE_ORDER);
   target.searchParams.set("limit", String(ZONE_ITEM_CAP));
   const data = await send(target, "GET");
   if (!Array.isArray(data)) throw new CreationRepositoryError("invalid_backend_response", "list");
   ```
3. Loop over `data`. For each row, `const c = publicRowToCreation(row)`. Keep it only if
   `c !== null && c.eventId === query.eventId && c.zoneId === query.zoneId`, and stop once `ZONE_ITEM_CAP` are kept.
   Invalid rows are dropped silently, which fails closed. Do not log.

`insertCreation(input)`:
1. `const v = validateNewCreation(input, now());`. This throws before any fetch.
2. Build an `InsertCreationRpcBody` field by field: `p_expires_at: v.expiresAt.toISOString()`,
   `p_private_wish_text: v.privateWish === null ? null : v.privateWish.ciphertext`,
   `p_private_wish_key_id: v.privateWish === null ? null : v.privateWish.keyId`, and so on.
3. `const data = await send(new URL(INSERT_CREATION_RPC_PATH, restBase), "POST", JSON.stringify(body));`
4. `const row = Array.isArray(data) ? (data.length === 1 ? data[0] : undefined) : data;`
   then `const created = publicRowToCreation(row);`. If it is `null`, throw `("invalid_backend_response", "insert")`. Return `created`.

### Step 10 — `src/services/api/creationRepositoryFactory.ts` (new)

```ts
export type BackendEnv = Readonly<Record<string, string | undefined>>;

/** Both env vars set → Supabase; both absent/blank → in-memory; exactly one → CreationRepositoryError("backend_misconfigured", <env name>). */
export function createCreationRepositoryFromEnv(env: BackendEnv): CreationRepository {
  const url = env[SUPABASE_URL_ENV]?.trim() ?? "";
  const key = env[SUPABASE_SERVICE_ROLE_KEY_ENV]?.trim() ?? "";
  if (url === "" && key === "") return createInMemoryCreationRepository();
  if (url === "") throw new CreationRepositoryError("backend_misconfigured", SUPABASE_URL_ENV);
  if (key === "") throw new CreationRepositoryError("backend_misconfigured", SUPABASE_SERVICE_ROLE_KEY_ENV);
  return createSupabaseCreationRepository({ url, serviceRoleKey: key });
}

let cached: CreationRepository | null = null;
/** Process-wide repository for route handlers. Reads process.env on first successful call; a throw is not cached. */
export function getCreationRepository(): CreationRepository {
  cached ??= createCreationRepositoryFromEnv(process.env);
  return cached;
}
```
Read `process.env` only inside the function, never at module top level. That keeps the build working with no env and keeps the route dynamic.

### Step 11 — `src/services/api/zoneQuery.ts` (new)

```ts
export type ZoneQueryParseResult =
  | { readonly ok: true; readonly query: ZoneQuery }
  | { readonly ok: false; readonly field: ZoneQueryField };

/** Query parameter names of GET /api/creations. */
export const ZONE_QUERY_PARAMS = Object.freeze({ event: "event", zone: "zone" } as const);

/** Canonical non-negative decimal integer, no sign, no leading zeros (range is checked by isZoneId). */
const ZONE_PARAM_PATTERN = /^(0|[1-9][0-9]*)$/;

export function parseZoneQuery(params: URLSearchParams): ZoneQueryParseResult;
```
1. `const events = params.getAll(ZONE_QUERY_PARAMS.event);`. If `events.length !== 1 || !isFestivalEventId(events[0])`,
   return `{ ok: false, field: "event" }`. The match is exact and case-sensitive. Feature flags are **not** consulted (D10).
2. `const zones = params.getAll(ZONE_QUERY_PARAMS.zone);`. If `zones.length !== 1 || !ZONE_PARAM_PATTERN.test(zones[0])`,
   return field `"zone"`. Then `const zoneId = Number(zones[0]);`. If `!isZoneId(zoneId)`, return field `"zone"`.
3. Ignore any other parameters. Return `{ ok: true, query: { eventId: events[0], zoneId } }`.

### Step 12 — `src/services/api/listCreations.ts` (new)

```ts
/** GET /api/creations logic. `getRepository` may throw (misconfigured env) → 503. Never logs. */
export async function handleListCreations(request: Request, getRepository: () => CreationRepository): Promise<Response>;
```
```ts
const NO_STORE = { "Cache-Control": "no-store" } as const;
const respond = (status: number, body: PublicZoneResponse | ApiErrorBody) =>
  Response.json(body, { status, headers: NO_STORE });

const parsed = parseZoneQuery(new URL(request.url).searchParams);
if (!parsed.ok) return respond(400, { error: "invalid_query", field: parsed.field });
let items: readonly PublicCreation[];
try {
  items = await getRepository().listPublicZone(parsed.query);
} catch {
  return respond(503, { error: "unavailable" });
}
return respond(200, {
  eventId: parsed.query.eventId,
  zoneId: parsed.query.zoneId,
  limit: ZONE_ITEM_CAP,
  items: items.slice(0, ZONE_ITEM_CAP).map(pickPublicCreation),
});
```
Name the status numbers as module constants (`HTTP_OK = 200`, `HTTP_BAD_REQUEST = 400`, `HTTP_SERVICE_UNAVAILABLE = 503`)
in this file. They are protocol constants, not product numbers.

### Step 13 — `src/app/api/creations/route.ts` (new)

Before writing it, read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` (the "With Cache
Components" part) and `…/03-api-reference/03-file-conventions/route.md`.
```ts
import { getCreationRepository } from "@/services/api/creationRepositoryFactory";
import { handleListCreations } from "@/services/api/listCreations";

/** GET /api/creations?event=<FestivalEventId>&zone=<integer ≥ 1> — public zone list (backlog 2.2). */
export async function GET(request: Request): Promise<Response> {
  return handleListCreations(request, getCreationRepository);
}
```
Export **only** `GET`. Do not export `dynamic`, `revalidate` or `runtime`: Cache Components removes the first two, and
Edge is deprecated. Do not export helpers from a `route.ts`. MFW-45 will add `POST` to this file.

### Step 14 — `src/services/api/retention.ts` (new)

```ts
/** expires_at for a creation of `eventId` (owner decision 10): festival end + 30 days. null = no end date configured. */
export function computeCreationExpiresAt(eventId: FestivalEventId): Date | null {
  const endsAt = FESTIVAL_ENDS_AT[eventId];
  if (endsAt === undefined) return null;
  const endMs = Date.parse(endsAt);
  if (!Number.isFinite(endMs)) return null;
  return new Date(endMs + RETENTION_DAYS_AFTER_FESTIVAL_END * MS_PER_DAY);
}
```
Nothing in this card calls it. MFW-45 does.

### Step 15 — `src/services/api/__fixtures__/creations.ts` (new, test-only data; not imported by app code)

```ts
export const OWNER_HASH_FIXTURE = "0123456789abcdef".repeat(4) as OwnerTokenHash; // 64 lowercase hex
export const PRIVATE_CIPHERTEXT_FIXTURE = "v1.AAAAAAAAAAAAAAAA.SECRETxPRIVATExWISHxCIPHERTEXT" as PrivateWishCiphertext;
export const KEY_ID_FIXTURE = "test-key-1";
export const FAR_FUTURE = new Date("2099-01-01T00:00:00.000Z");
export const APPEARANCE_FIXTURE = { base: "banana_trunk_01", lotusFold: "style_02", flowers: ["marigold", "orchid"], candleColor: "#FFD166" };
export const SPLINE_COORD_FIXTURE = { mode: "SPLINE_PATH", laneId: 0, spawnProgress: 0.25, speedFactor: 0.008, lateralOffset: 0 } as const;
export function makeNewCreation(overrides: Partial<NewCreation> = {}): NewCreation; // defaults: loy_krathong, zone 1, fixtures above, publicWishText "ขอให้ทุกคนมีความสุข", privateWish null; then overrides
export function makePrivateWish(): EncryptedPrivateWish; // { ciphertext: PRIVATE_CIPHERTEXT_FIXTURE, keyId: KEY_ID_FIXTURE }
export function makePublicRow(overrides: Record<string, unknown> = {}): Record<string, unknown>; // valid snake_case view row (lowercase uuid, ISO timestamps)
```
`makeNewCreation` must build its result field by field, with each field being `overrides.x !== undefined ? overrides.x : default`,
because `publicWishText: null` must be allowed as an override. Use the `"key" in overrides` check for the two nullable fields.

### Step 16 — `src/services/api/index.ts` (modify)

Replace `export {};` with the following and keep the doc comment:
```ts
/** Fetch/Submit Creations, Zone Pagination */
// Client-safe exports only. Server modules (repositories, factory, handler, validation) are imported by path from server code.
export {
  PUBLIC_CREATION_KEYS,
  type ApiErrorBody,
  type AppearanceJson,
  type PublicCreation,
  type PublicZoneResponse,
  type ZoneQueryField,
} from "./creationTypes";
```

## Tests

Everything runs under `pnpm test`, with no network and no database. Server tests start with `// @vitest-environment node`.
Never write `Vector3`, `.toArray()` or a `three` import in these files (the existing scanner checks tests too).

### `src/services/api/json.test.ts` (node)
1. `isJsonObject` is true for `{}`, the appearance fixture, and nested arrays/objects with `null`.
2. It is false for `null`, `[]`, `"x"`, `{ a: undefined }`, `{ a: NaN }`, `{ a: Infinity }`, `{ a: new Date() }`, `{ a: () => 1 }`,
   `{ a: 1n }`, `new Map()`, an instance of a class, and a self-cycle `const o: Record<string, unknown> = {}; o.self = o;`.
3. `isPlainObject(Object.create(null))` is true.

### `src/services/api/creationValidation.test.ts` (node)
1. A valid public creation (`makeNewCreation()`) returns an equal value (`toEqual`) that is a different object
   (`not.toBe`), and its `appearance` is a different object too.
2. A valid private creation (`publicWishText: null, privateWish: makePrivateWish()`) passes.
3. A table of failures with the expected `detail` (assert `code === "invalid_input"` too):
   eventId `"nope"` → `eventId`; zoneId `0`, `1.5`, `-1`, `2147483648` → `zoneId`; appearance `[]` / `null` → `appearance`;
   coord `{ mode: "PLANAR_ZONE", u: 0.5, v: 0.5, x: 1 }` and `{ x: 1, y: 2, z: 3 }` → `coord`; publicWishText `"   "` → `publicWishText`;
   expiresAt `new Date(NaN)` and `new Date(nowMs)` (not strictly after) → `expiresAt`; ownerTokenHash `"abc"`, uppercase hex, and a valid
   43-char DeviceOwnerToken shape `"A".repeat(43)` → `ownerTokenHash`; "rejects a plaintext private wish":
   privateWish `{ ciphertext: "my secret wish", keyId: "k1" }` → `privateWish`; bad keyId `"Key 1"` → `privateWish`;
   both wishes set → `privateWish`.
4. "error message does not echo values": for the bad-hash case with `ownerTokenHash: "SECRETVALUE…"`, `err.message` does not contain `"SECRET"`.
5. `isZoneId(2147483647)` is true and `isZoneId(2147483648)` is false. `toIsoTimestamp("2026-11-24T18:19:33.562709+00:00")` is
   `"2026-11-24T18:19:33.562Z"` and `toIsoTimestamp("x")` is `null`.

### `src/services/api/publicCreation.test.ts` (node)
1. A valid row maps to an object whose sorted keys equal sorted `PUBLIC_CREATION_KEYS`, with `createdAt` normalized to `…Z`.
2. "drops private columns": `makePublicRow({ owner_token_hash: OWNER_HASH_FIXTURE, private_wish_text: PRIVATE_CIPHERTEXT_FIXTURE,
   private_wish_key_id: KEY_ID_FIXTURE, report_count: 0, moderation_status: "approved", owner_token: "x" })` keeps exactly the allowlisted keys,
   and `JSON.stringify(result)` contains none of those values.
3. It returns null for: a non-object; `id: "not-a-uuid"`; `event_id: "nope"`; `zone_id: 0`; `appearance: []`; coord with an `x` key;
   `public_wish_text: 5`; `created_at: "garbage"`.
4. `pickPublicCreation({ ...valid, ownerTokenHash: "x", privateWish: {} } as unknown as PublicCreation)` keeps exactly `PUBLIC_CREATION_KEYS`.

### `src/services/api/inMemoryCreationRepository.test.ts` (node)
Use a controllable clock (`let t = Date.parse("2026-11-24T12:00:00.000Z")`, `now: () => t`) and add `t += 1000` between inserts.
1. `backend === "memory"`. `insertCreation` returns a PublicCreation with exactly `PUBLIC_CREATION_KEYS`, a lowercase uuid
   `id` and `createdAt === new Date(t).toISOString()`.
2. A private creation's returned object and its JSON contain neither the ciphertext, the key id nor the hash.
3. Lists filter by event and zone: inserts in (loy_krathong, 1), (loy_krathong, 2) and (christmas, 1) → each list contains only its own items.
4. Order: three inserts with increasing `t` come back oldest first. Two inserts with equal `t` and ids `newId` = `…b`, `…a` come back `a` before `b`.
5. "returns the oldest 80 of 85": 85 inserts in zone 1 → length 80 = the first 80 ids.
6. Moderation: `setModeration(id, { moderationStatus: "flagged" })` hides the item, and so does `"hidden"`. `reportCount: 2` keeps it visible, while
   `reportCount: AUTO_HIDE_REPORT_THRESHOLD` hides it. `setModeration("00000000-0000-4000-8000-000000000000", {})` returns `false`.
   `setModeration(id, { reportCount: -1 })` throws `invalid_input`.
7. Expiry: insert with `expiresAt = new Date(t + 1000)`. The item is visible at `t`. After `t += 1000` it is not visible (`expires_at > now` is strict).
8. An invalid insert throws `CreationRepositoryError` with code `invalid_input` **and stores nothing** (the next list has the same length as before).
9. Isolation: mutating `result.appearance` from a list does not change the next list's result.

### `src/services/api/supabaseCreationRepository.test.ts` (node)
Helper: `const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(rows), { status: 200 }))`.
Options: `{ url: "https://example.supabase.co", serviceRoleKey: "test-service-key", fetch: fetchMock }`.
1. "list request": `listPublicZone({ eventId: "loy_krathong", zoneId: 1 })` → one call. `new URL(String(input))` has `pathname`
   `/rest/v1/creations_public_visible`, `select` exactly `"id,event_id,zone_id,appearance,coord,public_wish_text,created_at,expires_at"`
   (and no `*`), `event_id` `"eq.loy_krathong"`, `zone_id` `"eq.1"`, `order` `"created_at.asc,id.asc"` and `limit` `"80"` ("sends
   limit=80"). `init.method` is `"GET"` and `init.cache` is `"no-store"`. `new Headers(init.headers)` has `apikey` = `test-service-key` and
   `authorization` = `Bearer test-service-key`.
2. "strips private columns": the backend returns rows with extra `owner_token_hash` / `private_wish_text` → each item has exactly
   `PUBLIC_CREATION_KEYS`, and the JSON has no fixture values.
3. "drops invalid rows": `[valid, coord-with-x, bad-id, other-zone]` → 1 item.
4. "re-caps 85 returned rows to 80".
5. "non-2xx: no body is read": a 400 `Response` whose body contains `OWNER_HASH_FIXTURE`. Spy on `res.json` and `res.text` → rejects with
   `code "backend_request_failed"` and `detail "status 400"`, neither spy was called, and the message contains neither the hash nor `test-service-key`.
6. "network error": the fetch rejects → `backend_request_failed` / `network`.
7. "non-array list body" → `invalid_backend_response`.
8. "insert request" for a public creation: POST to `/rest/v1/rpc/mfw_insert_creation`, `content-type: application/json`. The sorted body keys
   equal the 9 `p_*` names, `p_private_wish_text`/`p_private_wish_key_id` are `null`, `p_owner_token_hash === OWNER_HASH_FIXTURE`,
   and `p_expires_at` is ISO. The response row (object form) maps to a PublicCreation. The array-of-one form works too.
9. "insert private": `p_public_wish_text === null` and `p_private_wish_text === PRIVATE_CIPHERTEXT_FIXTURE`.
10. "invalid insert makes no request": coord with `x` → rejects `invalid_input`, and `fetchMock` is not called.
11. "insert: unusable response" (`{}`) → `invalid_backend_response`.
12. Construction: `http://example.com`, `"not a url"`, `ftp://x` and an empty/blank key all throw `backend_misconfigured`.
    `http://127.0.0.1:54321` and `http://localhost:54321` are accepted. No error message contains the key.

### `src/services/api/creationRepositoryFactory.test.ts` (node)
1. `{}` → `backend "memory"`; `{ SUPABASE_URL: " ", SUPABASE_SERVICE_ROLE_KEY: "" }` → memory.
2. Both set → `backend "supabase"`.
3. Only the URL → throws `backend_misconfigured` with detail `"SUPABASE_SERVICE_ROLE_KEY"`. Only the key → detail `"SUPABASE_URL"`. The message never contains the value.
4. `getCreationRepository` with `vi.resetModules()`, `vi.stubEnv("SUPABASE_URL", "")`, `vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")` and
   a dynamic `import("./creationRepositoryFactory")` → memory, and the same instance (`toBe`) on the second call.
   Call `vi.unstubAllEnvs()` in `afterEach`.

### `src/services/api/zoneQuery.test.ts` (node)
Valid: `event=loy_krathong&zone=1` → `{ eventId: "loy_krathong", zoneId: 1 }`; `zone=2147483647` is ok; `christmas` is ok (D10); an extra
`&foo=1` is ignored. Invalid `event`: missing, `""`, `LOY_KRATHONG`, `nope`, duplicated `event`. Invalid `zone`
(when event is valid): missing, `0`, `-1`, `01`, `1.5`, `1e2`, ` 1`, `abc`, `2147483648`, duplicated `zone`. If both are bad, the result is `field: "event"`.

### `src/services/api/retention.test.ts` (node)
1. `computeCreationExpiresAt("loy_krathong")?.toISOString()` is `"2026-12-24T17:00:00.000Z"` (= 2026-12-25 00:00 +07:00).
2. `computeCreationExpiresAt("christmas")` is `null`.
3. `RETENTION_DAYS_AFTER_FESTIVAL_END === 30`.

### `src/config/privateWish.config.test.ts` (node)
1. `Math.ceil(AES_GCM_IV_BYTES * 8 / 6) === 16` and `Math.ceil(AES_GCM_TAG_BYTES * 8 / 6) === 22` (these match the pattern's `{16}` / `{22,}`).
2. The pattern accepts `PRIVATE_CIPHERTEXT_FIXTURE`. It rejects `"my secret wish"`, `"v2.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA"`, a 15-char IV,
   a 21-char body and a padded `=`.
3. The key-id pattern accepts `"k1"` and `"test-key-1"`. It rejects `""`, `"Key"`, `"-k"` and a 33-char id.

### `src/app/api/creations/route.test.ts` (node)
Setup: `createInMemoryCreationRepository({ now: () => t })`. Seed one public creation, then one private creation
(`publicWishText: null, privateWish: makePrivateWish()`), both with `OWNER_HASH_FIXTURE`.
`const call = (qs: string) => handleListCreations(new Request(`http://localhost/api/creations?${qs}`), () => repo);`
1. **"returns only public fields (AC 3)"**: `event=loy_krathong&zone=1` → status 200, and `cache-control` contains `no-store`. With `const text = await res.text()`,
   for each of `["owner_token", "ownerToken", "owner_token_hash", "ownerTokenHash", "private_wish_text", "privateWishText",
   "privateWish", "private_wish_key_id", "report_count", "reportCount", "moderation_status", "moderationStatus",
   OWNER_HASH_FIXTURE, PRIVATE_CIPHERTEXT_FIXTURE, KEY_ID_FIXTURE]` → `expect(text).not.toContain(s)`. With `body = JSON.parse(text)`,
   `body.items` has length 2 and every item's sorted `Object.keys` equals sorted `PUBLIC_CREATION_KEYS`. The private item's
   `publicWishText` is `null`. A recursive key walk over the whole body finds none of the private key names above.
2. **"responds with at most 80 items and limit 80 (AC 4)"**: seed 81 visible items in zone 3 → `items.length === 80` and `body.limit === 80`.
3. "hidden items are not served": `repo.setModeration(id, { moderationStatus: "hidden" })` → not in the items.
4. "bad query → 400": `event=nope&zone=1` → `{ error: "invalid_query", field: "event" }`; `event=loy_krathong&zone=0` → field `zone`.
5. "repository failure → 503 without details": a repository whose `listPublicZone` rejects with
   `new Error("boom " + OWNER_HASH_FIXTURE)` → 503, body exactly `{ error: "unavailable" }`, and the text does not contain the hash.
   A getter that throws `CreationRepositoryError("backend_misconfigured", "SUPABASE_URL")` → 503 `{ error: "unavailable" }`.
6. "real GET without Supabase env": `vi.resetModules()`, stub both env vars to `""`, then `const { GET } = await import("./route")` and
   `await GET(new Request("http://localhost/api/creations?event=loy_krathong&zone=1"))` → 200, `items` is an array, and none of the private names appear.

### `tests/unit/creations-migration.test.ts` (node)
Read `supabase/migrations/20261124000000_mfw12_creations_public_private.sql` as `raw`. Let `sql = raw.replace(/--[^\n]*/g, "")
.replace(/\s+/g, " ").toLowerCase()`.
1. The file exists. "creates creations_public with the AC columns": the `create table public.creations_public (` statement contains `id uuid`,
   `event_id text`, `zone_id integer`, `appearance jsonb`, `coord jsonb`, `public_wish_text text`, `created_at timestamptz`, `expires_at timestamptz`.
2. "creates creations_private_ownership with the AC columns and an FK to creations_public": it contains `creation_id uuid primary key references
   public.creations_public (id) on delete cascade`, `owner_token_hash text not null`, `private_wish_text text`, `private_wish_key_id text`,
   `report_count integer not null default 0` and `moderation_status public.moderation_status not null default 'approved'`
   (`DEFAULT_MODERATION_STATUS`).
3. "moderation_status enum matches MODERATION_STATUSES": `create type public.moderation_status as enum (${MODERATION_STATUSES.map(s => `'${s}'`).join(", ")})`.
4. "every table has RLS": for every match of `/create table (public\.\w+)/g`, `sql` contains `alter table ${name} enable row level security`
   (2 tables).
5. "clients are denied on both tables": for each table, the text contains `on ${name} as restrictive for all to anon, authenticated using (false) with check (false)`
   and `revoke all on table ${name} from public, anon, authenticated`.
6. "no permissive policy": the count of `create policy` equals the count of `as restrictive`.
7. "no grant to clients": `/\bgrant\b[^;]*\bto\b[^;]*\b(anon|authenticated)\b/` does not match, and every `grant … to` targets `service_role`
   (`/\bgrant\b[^;]*\bto (\w+)/g` captures only `service_role`).
8. "view is server-only and filtered": `create view public.creations_public_visible with (security_invoker = true)` is present, the view statement
   (regex `/create view public\.creations_public_visible[\s\S]*?;/`) contains `o.moderation_status = 'approved'`,
   `o.report_count < ${AUTO_HIDE_REPORT_THRESHOLD}` and `p.expires_at > now()`, and `revoke all on table public.creations_public_visible from public, anon, authenticated`
   is present.
9. "view selects exactly the public allowlist": take the text between `as select ` and ` from public.creations_public` in the view
   statement, split on `,`, trim and strip `p.` → equals `[...PUBLIC_CREATION_COLUMNS]`.
10. "insert function is server-only": the text contains `security invoker`, `set search_path = ''`, `revoke all on function public.mfw_insert_creation(` … `from public, anon,
    authenticated` and `grant execute on function public.mfw_insert_creation(` … `to service_role`.
11. "no select * / returning *": `/select \*|returning \*|\.\*/` does not match `sql`.
12. "event ids match FESTIVAL_EVENT_IDS": every `'${id}'` is in `sql`, and the count of quoted ids inside the `event_id in (…)` list equals `FESTIVAL_EVENT_IDS.length`.
13. "ciphertext / key id / owner hash patterns equal the TS config": `raw` contains `'${PRIVATE_WISH_CIPHERTEXT_PATTERN.source}'`,
    `'${PRIVATE_WISH_KEY_ID_PATTERN.source}'` and `'${OWNER_TOKEN_HASH_PATTERN.source}'`.
14. "coord check forbids raw xyz": it contains `not (coord ?| array['x', 'y', 'z', 'position'])` and the three coord modes from `COORD_MODES`.
15. "zone min matches ZONE_ID_MIN": it contains `check (zone_id >= ${ZONE_ID_MIN})`.

### `tests/unit/public-private-boundary.test.ts` (node)
Copy the `walk()` helper from `tests/unit/no-raw-xyz-persistence.test.ts`. "Non-test" means it does not end in `.test.ts`/`.test.tsx`. Paths are repo-relative with `/`.
1. "no console in server data code": non-test files under `src/services/api`, `src/app/api` and `src/config` do not match `/\bconsole\./`.
2. "no star selects": non-test files under `src/services/api` and `src/app/api` do not match `/select\s*\(\s*["']\*["']\s*\)|select=\*|["']\*["']/`.
3. "service-role env name lives only in database.config.ts": the non-test `src/**` files containing `SUPABASE_SERVICE_ROLE_KEY` are exactly
   `["src/config/database.config.ts"]`. No `src/**` file contains `NEXT_PUBLIC_SUPABASE_SERVICE`.
4. "client code cannot import server data modules": no file under `src/components`, `src/store` or `src/core`, and no file under `src/app` outside
   `src/app/api`, matches `/services\/api\/(creationRepository|creationRepositoryFactory|supabaseCreationRepository|inMemoryCreationRepository|listCreations|creationValidation|publicCreation)\b/`.
   `src/services/api/index.ts` does not match `/from\s+["']\.\/(creationRepository|creationRepositoryFactory|supabaseCreationRepository|inMemoryCreationRepository|listCreations|creationValidation|publicCreation)["']/`.
5. "private column names stay on the ownership path": the non-test `src/**` files matching `/owner_token_hash|private_wish_text|private_wish_key_id|\bowner_token\b/`
   are a subset of `src/services/auth/**`, `src/config/ownership.config.ts` and `src/services/api/supabaseCreationRepository.ts`.
   The non-test files under `src/app/api` match neither those names nor `/ownerTokenHash|privateWish|ownerToken/`.
6. A self-check that patterns 2 and 5 detect sample strings (`select('*')`, `owner_token_hash`).

### `tests/e2e/creations-api.spec.ts` (new; runs against the production build without Supabase env)
```ts
import { expect, test } from "@playwright/test";

const PRIVATE_NAMES = ["owner_token", "ownerToken", "private_wish_text", "privateWishText", "privateWish"];

test("GET /api/creations returns only public fields, capped at 80", async ({ request }) => {
  const res = await request.get("/api/creations?event=loy_krathong&zone=1");
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("no-store");
  const text = await res.text();
  for (const name of PRIVATE_NAMES) expect(text).not.toContain(name);
  const body = JSON.parse(text);
  expect(body).toMatchObject({ eventId: "loy_krathong", zoneId: 1, limit: 80 });
  expect(Array.isArray(body.items)).toBe(true);
  expect(body.items.length).toBeLessThanOrEqual(80);
});

test("GET /api/creations rejects an unknown event and a bad zone", async ({ request }) => {
  const badEvent = await request.get("/api/creations?event=nope&zone=1");
  expect(badEvent.status()).toBe(400);
  expect(await badEvent.json()).toEqual({ error: "invalid_query", field: "event" });
  const badZone = await request.get("/api/creations?event=loy_krathong&zone=0");
  expect(badZone.status()).toBe(400);
  expect(await badZone.json()).toEqual({ error: "invalid_query", field: "zone" });
});
```

Invariant tests from CLAUDE.md:
- A: the DB check rejects `x/y/z/position` keys, and the repository validates coord with `parsePersistableCoord` on write and on read (tests above).
- C: route.test.ts case 1, publicCreation case 2, supabase cases 2 and 5, and the e2e test.
- D: creations-migration cases 4–10. Private text is never readable here, because no read path for it exists (that is MFW-31).
- E: the 80 cap (AC 4 tests). F, reduced motion and FALLBACK_2D do not apply, because this card has no UI or animation.
- G: not exercised here, because the guard runs in the 2.4 route before `insertCreation`. The repository has no public write route.

## Do NOT

- Do not build `POST /api/creations`, request-body parsing, zone assignment, AES-GCM encryption/decryption or its key
  env var (all MFW-45). Do not build the report endpoint, the PII/profanity filter or any `report_count` increment (MFW-13). Do not build ownership
  proof, constant-time compare or private-wish reading (MFW-31). Do not build a client fetch helper, zone loading, `useWorldStore` changes or
  ZoneManager (MFW-25). Do not build a deletion/retention job or cron.
- Do not apply the migration to any database, add `supabase/config.toml` or seed files, or run the Supabase CLI.
- Never use `select('*')`, `select=*`, `returning *`, or spread/`Object.assign` a DB row into a response. Map field by field.
- Never read, log or forward a Supabase/Postgres error body (it echoes `owner_token_hash` and ciphertext). Never put the service-role key, an
  env value, a hash, a ciphertext or wish text into an error message or a response. No `console.*`.
- Never put the raw owner token, its hash or any private field in a URL or query string. The GET takes only `event` and `zone`.
- Never write `SUPABASE_SERVICE_ROLE_KEY=<value>` anywhere (the pre-commit guard blocks it). Never prefix a server env var with `NEXT_PUBLIC_`.
- Do not grant anything to `anon` or `authenticated`, and do not add permissive policies. Do not move the private table to another schema.
- Do not import `@/core/coordinates` (the barrel) from server code. Import `validateCoord` / `types` by path. Never write `Vector3`,
  `.toArray()` or a `three` import in `src/services/**`, `src/app/api/**` or `supabase/**`, tests included.
- Do not export anything except `GET` from `route.ts`. Do not export `dynamic`/`revalidate`/`runtime`.
- No new dependencies (`@supabase/supabase-js`, `server-only`, `zod`, `pg`, …). No `package.json` / lockfile changes.
- Do not touch `.claude/**`, `scripts/**`, `.github/**`, `CLAUDE.md`, `AGENTS.md`, `docs/spec/**` (including `open-questions.md`),
  `docs/backlog*.json`, `docs/prompts/**`, `docs/plans/**`, `vitest.config.mts`, `playwright.config.ts`, `eslint.config.mjs`, `tsconfig.json`,
  `next.config.ts`, `src/core/**`, `src/store/**`, `src/components/**`, `src/config/events/**`, `src/services/auth/**`,
  `src/config/ownership.config.ts` or the existing tests.

## Definition of done

- Run each of these separately and get green: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm e2e`. In this cloud container
  run e2e as `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell pnpm e2e`. Make sure no Supabase env vars are set in your shell while doing so.
- `pnpm build` output lists `ƒ /api/creations` (dynamic).
- Delete `playwright-report/` and `test-results/` before committing. Never commit `.next/` or `*.tsbuildinfo`. If `next dev` rewrote `AGENTS.md`, leave it alone.
- Branch `feat/MFW-12-public-private-separated-api-database` from the latest `main`, **after MFW-11 is merged**.
- Conventional commit(s) with the key, e.g. `feat(api): public/private creations schema and zone list API MFW-12`.
- PR title = the commit subject. The English body contains: a link to MFW-12; each AC as a checklist item with the file/test that proves it; Decisions
  (copy D1–D17); the test plan (five commands and their results); the owner's apply steps for the migration (apply on the staging project first, OQ 17;
  then set `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` server-only); and follow-ups (deletion job for OQ 10, POST in MFW-45, report
  in MFW-13, ownership proof in MFW-31, zone loading in MFW-25).
- Leave the PR open. Labels `privacy`/`db` → the owner merges after reviewer + qa + privacy-auditor pass.

## Interfaces this card provides

| Export | Path | Signature | Used by |
|---|---|---|---|
| `CreationRepository` | `@/services/api/creationRepository` | `{ backend; listPublicZone(q: ZoneQuery): Promise<readonly PublicCreation[]>; insertCreation(i: NewCreation): Promise<PublicCreation> }` | MFW-45 (insert), MFW-13 / MFW-31 / MFW-25 (extend) |
| `CreationRepositoryError`, `CreationRepositoryErrorCode` | same | `class (code, detail?)` | MFW-45 (map `invalid_input` → 400, others → 503) |
| `getCreationRepository` | `@/services/api/creationRepositoryFactory` | `() => CreationRepository` (throws when misconfigured) | MFW-45 POST, MFW-13, MFW-31 routes |
| `createCreationRepositoryFromEnv` | same | `(env: BackendEnv) => CreationRepository` | tests |
| `createInMemoryCreationRepository` | `@/services/api/inMemoryCreationRepository` | `(o?: { now?; newId? }) => InMemoryCreationRepository` (+ `setModeration`) | tests of MFW-45/13/31 |
| `createSupabaseCreationRepository` | `@/services/api/supabaseCreationRepository` | `(o: { url; serviceRoleKey; fetch?; timeoutMs?; now? }) => CreationRepository` | factory |
| `validateNewCreation`, `isFestivalEventId`, `isZoneId`, `toIsoTimestamp` | `@/services/api/creationValidation` | see Step 6 | MFW-45 body validation |
| `publicRowToCreation`, `pickPublicCreation` | `@/services/api/publicCreation` | see Step 7 | MFW-45 response (must use `pickPublicCreation`) |
| `handleListCreations` | `@/services/api/listCreations` | `(req: Request, getRepo: () => CreationRepository) => Promise<Response>` | route |
| `parseZoneQuery`, `ZONE_QUERY_PARAMS` | `@/services/api/zoneQuery` | `(p: URLSearchParams) => ZoneQueryParseResult` | MFW-25 (client builds the same params) |
| `computeCreationExpiresAt` | `@/services/api/retention` | `(eventId: FestivalEventId) => Date \| null` | MFW-45 |
| `isJsonObject`, `isPlainObject`, `JsonObject`, `JsonValue` | `@/services/api/json` | type guards | MFW-45 |
| `PublicCreation`, `PublicZoneResponse`, `ApiErrorBody`, `AppearanceJson`, `ZoneQueryField`, `PUBLIC_CREATION_KEYS` | `@/services/api` (client-safe barrel) | Step 4 | MFW-25 client, MFW-28 inspect, MFW-30 find-mine, MFW-33 2D |
| `NewCreation`, `EncryptedPrivateWish`, `PrivateWishCiphertext`, `ZoneQuery` | `@/services/api/creationTypes` | Step 4 | MFW-45 |
| `GET /api/creations?event=&zone=` | `src/app/api/creations/route.ts` | 200 `PublicZoneResponse` · 400 `{error:"invalid_query",field}` · 503 `{error:"unavailable"}` · `Cache-Control: no-store` | MFW-25, MFW-30 |
| `ZONE_ITEM_CAP`, `ZONE_ID_MIN` | `@/config/world.config` | `80`, `1` | MFW-25, MFW-45 |
| `MODERATION_STATUSES`, `ModerationStatus`, `DEFAULT_MODERATION_STATUS`, `AUTO_HIDE_REPORT_THRESHOLD` | `@/config/moderation.config` | Step 1 | MFW-13 (extends the file) |
| `RETENTION_DAYS_AFTER_FESTIVAL_END`, `FESTIVAL_ENDS_AT`, `MS_PER_DAY` | `@/config/retention.config` | Step 1 | MFW-45, the deletion follow-up, the Christmas card (add its end date) |
| `PRIVATE_WISH_CIPHERTEXT_PATTERN`, `PRIVATE_WISH_KEY_ID_PATTERN`, `AES_GCM_IV_BYTES`, `AES_GCM_TAG_BYTES`, `PRIVATE_WISH_ENVELOPE_VERSION` | `@/config/privateWish.config` | Step 1 | MFW-45 (encrypt), MFW-31 (decrypt) |
| DB: tables, enum, view `creations_public_visible`, function `mfw_insert_creation(…)` | `supabase/migrations/20261124000000_…sql` | Step 2 | MFW-13 (update private row), MFW-31 (read private row), MFW-45 (RPC) |

## Open questions

These are product decisions only. This card ships the default listed under each one, and the owner can change it later without rework.

1. **When exactly does a festival "end" for retention (owner decision 10)?** The spec gives only the date "24 พ.ย. 2026". Default: the end of
   24 Nov in Thailand, `2026-11-25T00:00:00+07:00`, so Loy Krathong rows expire at `2026-12-25T00:00+07:00`. Options: (a) the default;
   (b) the end of the private-test window, if the test runs past 24 Nov; (c) a UTC day end. This is a one-line change in `FESTIVAL_ENDS_AT`. (OQ 18 also wipes the test data
   before 20 Dec, so for 2026 the value matters mostly for Christmas, whose end date is added by its own card.)
2. **Maximum length of the public and private wish text?** The spec gives no number. This card adds no DB length limit. 2.4 (server) and 4.3
   (WishModal) need the number. Options: a character cap per field (value from the owner), or the same cap for both.
3. **Should the world of an ended or "Coming Soon" event stay readable?** OQ 19 shows Loy Krathong as "ended" during the Christmas launch.
   Default: the GET accepts any known event id and ignores feature flags, so stub events return an empty list. Options: (a) the default;
   (b) refuse disabled events with 404; (c) read-only for ended events, closed for "Coming Soon" ones.
4. **Abuse posture of the public GET (rate limiting / bot protection)?** This card has none: the endpoint is anonymous and cheap
   (one indexed query, ≤ 80 rows). Options: (a) none for the private test (default); (b) Vercel firewall/rate-limit rules before Christmas;
   (c) an app-level limiter (needs a store).

## Decisions

- **D1 — All database access goes through the Next.js server with the service-role key. Clients get nothing.** Both tables have RLS, a
  restrictive deny-all policy for `anon, authenticated`, and `revoke all`. The view and the function are also revoked from clients. This is
  the strictest reading of invariant D and owner decision 3. If `anon` could read the view, it could skip the 80 cap and the
  `event`/`zone` checks.
- **D2 — Public reads use the view `creations_public_visible` (`security_invoker`, inner join).** A public row with no ownership row is
  invisible (fail closed). The view filters `approved`, `report_count < 3` and `expires_at > now()`. The in-memory repository applies
  the same filters.
- **D3 — Writes use one SQL function `mfw_insert_creation` (security invoker, `search_path = ''`, execute only for service_role).**
  The public and private rows are written in one transaction, which plain PostgREST cannot do across two tables. It was verified on PG16:
  a failed private insert rolls back the public row.
- **D4 — Supabase is reached with plain `fetch` to PostgREST, with no new dependency.** Only two calls are needed (view GET, RPC POST),
  `@supabase/supabase-js` is not installed, and adding it needs owner approval. The fetch can be injected, which makes the tests trivial.
- **D5 — Backend selection: both env vars → Supabase; both absent → in-memory; exactly one → misconfigured → 503.** CI, previews and
  local runs build and serve with no env. A half-configured deployment fails closed instead of silently using memory.
- **D6 — Env names `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (server-only).** These are the Vercel Supabase integration defaults,
  and the repo's pre-commit guard already knows the second one. The owner should confirm them when staging is set up (Risks).
- **D7 — Private wish storage = `private_wish_text` holding `v1.<iv>.<ciphertext+tag>` plus a `private_wish_key_id` column. A DB check
  rejects anything else.** Owner decision 2 requires a key id per row. The format check makes it hard to store plaintext by mistake. The
  encryption itself belongs to MFW-45, which is the write route.
- **D8 — Column details.** `event_id` is `text` with a check against the 8 roadmap ids (kept in sync with `FESTIVAL_EVENT_IDS` by a test).
  `zone_id` is `integer >= 1`. `appearance` is a JSON object. `coord` must have a known `mode` and no `x/y/z/position` keys (invariant A in
  the DB). A blank public wish is rejected. `expires_at > created_at`. The index is `(event_id, zone_id, created_at, id)` for the zone
  query. `on delete cascade` from public to private implements "public and private rows are deleted" (decision 10).
- **D9 — The public payload is camelCase `PublicCreation`, built by explicit picking.** Rows that fail validation (bad coord, bad id, …)
  are dropped silently on read, which fails closed and keeps invariant A on the read path.
- **D10 — Query rules.** `event` must be a known `FestivalEventId` (feature flags are not consulted; see Open question 3). `zone` must be a canonical
  decimal integer from 1 to int4 max. Duplicate parameters are invalid and unknown ones are ignored. Errors are 400 `invalid_query` with the field,
  or 503 `unavailable`, never with internal detail. `Cache-Control: no-store`, because items change and move.
- **D11 — One zone is one page: the first 80 visible items, ordered `created_at, id` ascending, with no cursor.** The write path (2.4) keeps
  each zone at or under the cap and opens new zones, so "pagination" means choosing the zone. The cap is enforced three times (query, re-cap, handler).
- **D12 — New rows default to `moderation_status = 'approved'`.** Owner decision 3 hides only flagged and hidden items, and the PII/profanity guard
  (decision 13, invariant G) runs on the server before the insert. So a released creation appears in the shared world straight away.
- **D13 — Never read a non-2xx Supabase body.** The probe showed that Postgres `DETAIL` echoes the failing row, including `owner_token_hash`
  and the ciphertext. Errors carry only the HTTP status.
- **D14 — Constants are split by domain:** the zone cap goes in `world.config.ts` (shared with MFW-25), the threshold in `moderation.config.ts`
  (MFW-13 extends it), retention in `retention.config.ts`, the ciphertext format in `privateWish.config.ts`, and the DB/env names in
  `database.config.ts`. The SQL repeats the values 3, 1, the patterns and the event ids, and tests keep the two copies equal.
- **D15 — Repository modules are kept out of the client-safe barrel.** Boundary tests stop client code from importing them, and the
  `server-only` package is not added (MFW-11 D5). The service key cannot reach a client bundle in any case, because it is not `NEXT_PUBLIC_`.
- **D16 — Supabase request timeout is 5 s.** It fails fast to 503. Tune it once staging exists.
- **D17 — GET logic lives in `src/services/api/listCreations.ts`, and `route.ts` only delegates.** A `route.ts` may export only HTTP handlers.
  This also lets tests inject a repository without touching env.

## Out of scope

POST/create route, zone assignment, AES-GCM encryption and its key (MFW-45). Report endpoint, PII/profanity detection and changes to
`report_count`/`moderation_status` (MFW-13). Ownership proof and private-wish reading (MFW-31). Client fetch, zone loading and world store
(MFW-25). Find-mine (MFW-30). **The retention deletion job** (decision 10: delete public and private rows after `expires_at`). This is a
follow-up card for the owner, for example `pg_cron` on staging or a Vercel cron route. Until it exists, expired rows are only hidden by the view. Applying
the migration, setting up the staging Supabase project (OQ 17) and wiping test data (OQ 18). Christmas work.

## Risks

- **The migration is only checked statically in CI.** The lead ran it on PostgreSQL 16 with Supabase-like roles (see Prerequisites), but not on
  a real Supabase project. The owner should apply it to the staging project first and confirm with the Data API using the anon key that both tables, the
  view and the RPC are denied.
- **Env names and key type are unverified.** Vercel production already has Supabase env vars, but this card has not confirmed their names. With
  the new `sb_secret_…` keys, PostgREST accepts `apikey` plus an identical `Authorization: Bearer`, which is what supabase-js sends. Verify this on staging.
  If the names differ, the factory sees "both absent" and uses memory, which is safe but has no persistence.
- **Production has Supabase env but no tables yet.** If production has both env vars, `GET /api/creations` there returns 503 until
  the migration is applied. That is intended (fail closed), and production stays untouched until Christmas (OQ 17).
- **The in-memory store is per server instance.** Previews lose data on cold starts, and if MFW-45 writes to it, memory grows without bound.
  That is acceptable only because memory is used solely when no database is configured.
- **Duplicated literals.** The SQL hard-codes 3 (threshold), 1 (zone min), the regexes and the event ids. Changing them needs a new migration, and the tests
  keep them in sync with TS.
- **`three` in the server bundle.** It comes in through `validateCoord → SplinePathCoord`. It works, but the function is larger. A later refactor could move the coord
  range constants out of `SplinePathCoord.ts`.
- **Reviewer grep noise.** The invariant A grep matches `'position'` and `'x'` in the SQL coord check and `x: 1` in negative tests. The invariant C grep
  matches the snake_case names in `supabaseCreationRepository.ts`, the migration and the tests. All of these are the ownership write path or tests that assert absence.
