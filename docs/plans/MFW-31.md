# MFW-31 [7.2] Anonymous wish reader & owner private view — implementation spec

> Hand-off spec for one card. It is the source of truth for the implementer and the reviewer. If this file and
> `docs/backlog.json` / `docs/spec/open-questions.md` disagree, those files win, and the PR must say so.
> Branch: `feat/MFW-31-anonymous-wish-reader-owner-private` · Jira: MFW-31 · Epic: MFW-29 (Loop 7)
> Labels: `loy-krathong`, `privacy`. Extra reviewers: **privacy-auditor** (the diff touches `src/services/**`, `src/app/api/**`,
> `supabase/**`, the owner token and the private wish) and **r3f-perf-reviewer** (one prop is added in `src/components/canvas3d/index.tsx`).
> The card adds a migration and is a privacy card, so the PR stays open and the **owner merges it**.

## Summary

Other people's krathongs already show only their public, moderated wish with no name or profile (MFW-28's `InspectPopup`). This card
proves that with tests and adds the owner path. The device sends its raw DeviceOwnerToken and a creation id in the JSON body of a new
`POST /api/private-wish`. The server hashes the token with SHA-256 and reads the creation's stored owner hash through a new
service_role-only SQL function. It compares the two hashes in constant time and only on a match decrypts the AES-256-GCM private wish.
Every well-formed request that does not end in a decrypted wish gets the same `200 { "wishText": null }`, so the endpoint cannot tell
whether an id exists or who owns it. On the client, a `PrivateWishReveal` block in the popup of a krathong the device lists as its own
("อ่านคำอธิษฐานส่วนตัว") shows the text only in component state. The device list itself is MFW-30's (owner decision 12). This card provides
the hook it plugs into. Decryption also gets a small keyring (current key + retired keys), so a key rotation (owner decision 2) does not
lock owners out. MFW-45 left that keyring to this card.

## Prerequisites

The backlog blocks this card on 2.2, 2.4 and 6.2. All three are merged on `main` = `66bbc69` (checked with `git show origin/main:…`).
Cut the branch from the latest `main`. This card uses **no** interface from MFW-23, MFW-30, MFW-33 or MFW-34. If any of them merged before
you start, rebase onto it and keep its behaviour. Expect a small conflict in `src/components/canvas3d/index.tsx` at the
`<InspectPopup …/>` line (Step 17).

| Card | State | What this card uses (real code on `main`) |
|---|---|---|
| MFW-11 [2.1] owner token | merged | `@/services/auth`: `type DeviceOwnerToken`, `isDeviceOwnerToken(v)`, `hashOwnerToken(token): Promise<OwnerTokenHash>` (rejects `TypeError` on a malformed token), `isOwnerTokenHash(v)`, `type OwnerTokenHash`, `getDeviceOwnerVault(): DeviceOwnerVault` with `read(): DeviceOwnerToken \| null` (never writes) and `getOrCreate()`. `@/config/ownership.config`: `OWNER_TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/`, `DEVICE_OWNER_TOKEN_PATTERN`. |
| MFW-12 [2.2] API & DB | merged | `CreationRepository`, `CreationRepositoryError(code, detail?)`, `CreationBackend` (`creationRepository.ts`); `EncryptedPrivateWish { ciphertext: PrivateWishCiphertext; keyId }`, `PrivateWishCiphertext`, `PUBLIC_CREATION_KEYS` (`creationTypes.ts`); `createInMemoryCreationRepository({ now?, newId? })` (two maps `publicRows` / `privateRows`); `createSupabaseCreationRepository` (closure helpers `send(target, method, body?)`, `restBase`); `getCreationRepository()`; `isPlainObject` (`json.ts`); `UUID_PATTERN`, `SUPABASE_REST_PATH` (`database.config.ts`); `PRIVATE_WISH_CIPHERTEXT_PATTERN`, `PRIVATE_WISH_KEY_ID_PATTERN` (`privateWish.config.ts`); SQL tables `creations_public`, `creations_private_ownership` (columns `owner_token_hash`, `private_wish_text`, `private_wish_key_id`, `report_count`, `moderation_status`); fixtures `makeNewCreation`, `makePrivateWish`, `OWNER_HASH_FIXTURE`, `FAR_FUTURE` (`src/services/api/__fixtures__/creations.ts`). |
| MFW-13 [2.3] moderation & report | merged | Pattern only: `reportHandler.ts` (415 / 413 / 400 / 503, `Cache-Control: no-store`, no echo), `tests/unit/report-migration.test.ts` (static SQL checks). |
| MFW-45 [2.4] create API | merged | `privateWishCipher.ts`: `PrivateWishCipher { keyId; encrypt(plaintext, ownerTokenHash) }`, `createPrivateWishCipher({ keyId, key, fillRandom? })`, `importPrivateWishKey(raw)`, `decryptPrivateWish(wish, ownerTokenHash, lookup): Promise<string \| null>` (never throws), `PrivateWishKeyLookup = (keyId) => CryptoKey \| undefined`, `readPrivateWishKeyEnv(env)` (rejects the id `ephemeral`), `createPrivateWishCipherFromEnv(env, backend)` (ephemeral per-process key only for `memory` + no env), `getPrivateWishCipher(backend)` (process singleton), `PrivateWishKeyError("missing" \| "invalid")`. `base64ToBytes(text, pattern)` (`base64url.ts`). `isProductionDeployment(env)` (`creationRepositoryFactory.ts`). `POST /api/creations` (the e2e and the route test create private wishes through it). Config: `PRIVATE_WISH_EPHEMERAL_KEY_ID = "ephemeral"`, `PRIVATE_WISH_KEY_BASE64_PATTERN`, `AES_256_KEY_BYTES = 32`. Fixtures (`__fixtures__/createCreation.ts`): `OWNER_TOKEN_FIXTURE`, `CREATE_NOW_MS`, `makeTestCipher()` → `{ cipher, lookup }`, `TEST_KEY_ID`, `TEST_KEY_BYTES()`, `makeCreateBody`, `makeCreateRequest`, `recordingRepository`, `barrierOnZoneCounts`. e2e fixtures `tests/e2e/fixtures/createCreationFixtures.ts`: `e2eCreateBody`, `e2eOwnerToken`. |
| MFW-28 [6.2] gimmicks & InspectPopup | merged (66bbc69) | `src/components/ui/InspectPopup.tsx` (`InspectPopupProps { creation; onClose; reportSession? }`), `inspectedCreation.ts` (`InspectedCreation { id; appearance; publicWishText }`, `pickInspectedCreation`, `findInspectedCreation`), `INSPECT_POPUP_COPY` (`src/config/inspect.config.ts`), the popup render in `src/components/canvas3d/index.tsx` (`{inspected && <InspectPopup key={inspected.id} … />}`), `tests/unit/inspect-boundary.test.ts` (the popup files must not import `@/services/auth`). |
| MFW-30 [7.1] My Creations | **not merged, no plan yet** | Nothing. This card provides `registerOwnedCreationPredicate` for MFW-30's LocalStorage creation-id list (Step 5) and `PrivateWishReveal` for its drawer. See Step 18 for what to do if MFW-30 lands first. |

Facts the lead checked (2026-11-25, scratch copy of `main` 66bbc69, no database):
- `next build` + `next start` (Turbopack, Next 16.4.6): a probe route in another folder (`/api/probe31`) saw the krathong that `POST /api/creations`
  had just written to the in-memory repository. `privateWishCipher.ts` was evaluated **once** for both routes, so the ephemeral key is shared.
  An e2e "create privately via `/api/creations`, then reveal via `/api/private-wish`" therefore works against the production build with no env.
- `tests/unit/public-private-boundary.test.ts`: in **non-test files under `src/app/api`** the strings `ownerTokenHash`, `privateWish` and `ownerToken` are forbidden
  (comments and import paths included). The snake_case private column names are allowed only in `src/services/auth/**`, `src/config/ownership.config.ts`
  and `src/services/api/supabaseCreationRepository.ts`. There is no `console.` in `src/services/api`, `src/app/api` or `src/config`. That is why the handler module
  is called `ownerWishReveal.ts` and the route file imports nothing with "privateWish" in its path.
- `tests/unit/inspect-boundary.test.ts`: `InspectPopup.tsx`, `inspectedCreation.ts`, `krathongAppearanceSummary.ts`, `reportClient.ts` and `inspect.config.ts` may not import
  `@/services/auth`, `deviceOwnerToken` or `getDeviceOwnerVault`. The owner UI therefore lives in new files and reaches the popup through a slot prop.
- `tests/unit/create-creation-boundary.test.ts`: the literals `"PRIVATE_WISH_KEY"` / `"PRIVATE_WISH_KEY_ID"` may appear only in `src/config/privateWish.config.ts`.
  The cipher must use Web Crypto `"AES-GCM"` and no `node:crypto`.
- Every creation has exactly one wish (`toWishColumns`: one of `publicWishText` / private is non-null; empty text is rejected). So in a public payload,
  `publicWishText === null` means "this krathong has a private wish".
- After a release, MFW-23's plan clears the private text from `useBuilderStore`, and its own krathong is not in the inspect lookup while `ritual.saved` is set.
  So an owner reads their private wish back through this card's endpoint, from the popup of a later visit or from MFW-30's drawer.
- Next 16 route handlers: read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` before writing `route.ts`. `next.config.ts` has `cacheComponents: true`; a `POST`
  handler is always dynamic. Do not export `dynamic` / `revalidate` / `runtime`. A missing `GET` answers 405 by itself.
- The lead did **not** run the new SQL against any database (not allowed in planning). See Risks.

## Acceptance criteria → checks

The AC text is verbatim from `docs/backlog.json` story 7.2.

1. **"Other users' krathongs show only public text, no name or profile"**
   - The popup data is an allowlist of exactly `id`, `appearance` and `publicWishText`. Neither `PUBLIC_CREATION_KEYS` nor `InspectedCreation` has an identity
     field (`name`, `nickname`, `profile`, `author`, `owner*`, `device*`). Test: `tests/unit/owner-wish-boundary.test.ts` → "AC1: no identity fields".
   - A krathong that is not the device's own shows no owner block and never calls the reveal client, whether it has a private wish
     (`publicWishText === null`) or a public one. Tests: `src/components/ui/OwnerWishSection.test.tsx` → "not owned → nothing";
     `src/components/ui/InspectPopup.test.tsx` → "AC1: no owner section by default";
     `src/components/canvas3d/index.test.tsx` → "AC1: someone else's private krathong shows no reveal".
   - The existing MFW-28 tests stay green unchanged: anonymous card, no id in the DOM, HTML shown as text.
2. **"Own krathong (verified by presenting the DeviceOwnerToken, compared server-side with its stored SHA-256 hash) can reveal its private wish"**
   - Server: the raw token arrives only in the POST JSON body and is hashed with `hashOwnerToken`. The stored hash is read with
     `CreationRepository.readOwnership(id)` and compared with `ownerTokenHashesMatch` (constant time). Only on a match does
     `PrivateWishReader.decrypt` run, and the result is `200 { wishText }`. Tests: `src/services/api/ownerWishReveal.test.ts` → "AC2" cases;
     `src/services/auth/ownerProof.test.ts`; `src/app/api/private-wish/route.test.ts` (real routes, no env); e2e `tests/e2e/owner-wish-api.spec.ts`.
   - Client: `createOwnerWishRevealer().reveal(id)` posts `{ creationId, ownerToken }`, where the token comes from `getDeviceOwnerVault().read()`.
     `PrivateWishReveal` shows the text after the tap. Tests: `src/services/api/ownerWishClient.test.ts`, `src/components/ui/PrivateWishReveal.test.tsx`,
     `src/components/canvas3d/index.test.tsx` → "AC2: own private krathong offers the reveal".
   - Rotation (owner decision 2): a wish encrypted under a retired key still decrypts when that key is listed in `PRIVATE_WISH_RETIRED_KEYS`. Test:
     `src/services/api/privateWishCipher.test.ts` → "reader decrypts retired keys".
3. **"Test: private text is never returned without a matching owner token"**
   - The handler matrix in `ownerWishReveal.test.ts` → "AC3" cases covers: another valid token, an unknown id, an expired creation, a public-wish
     creation, a ciphertext whose key id is unknown, a tampered ciphertext, and `ephemeral` outside the memory backend. Each gets the byte-identical
     body `{"wishText":null}` with status 200, and the secret never appears. A missing, malformed or URL-borne token → 400 and the
     repository is never called. No response text contains the token, the hash, the ciphertext or the key id.
   - The same check runs end to end: `route.test.ts` (real `POST /api/creations` → real `POST /api/private-wish`) and e2e `owner-wish-api.spec.ts`.
     `GET /api/creations` text never contains the private wish.
   - DB layer: `mfw_creation_ownership` is executable by `service_role` only. The Supabase request carries only `p_creation_id` (never a token or a hash).
     Tests: `tests/unit/ownership-read-migration.test.ts`, `src/services/api/supabaseCreationRepository.test.ts` → "readOwnership" cases.

Invariant checks (CLAUDE.md): **A** no coordinate is read, written or returned by any new code (the SQL function returns no `coord`). **B** n/a.
**C** the raw token travels only in a POST body, is never logged, stored or returned, and the revealed text lives only in component state (tests in
`PrivateWishReveal.test.tsx` → "keeps the text out of stores"). **D** new function service_role only, no table/policy change, plus the AC3 test.
**E** no 3D objects added. **F** no animation added (boundary test: no `@react-spring` import, no `animate-` / `transition` classes). **G** nothing new becomes public.

## Owner decisions that apply

Quoted from `docs/spec/open-questions.md`. Do not reopen them. No row names MFW-31 as still undecided (row 1 was decided in MFW-12), so
**do not edit `open-questions.md`**.

- **Row 1:** "the device keeps the raw DeviceOwnerToken in LocalStorage; the server stores only SHA-256(token). To prove ownership the device sends the raw
  token over HTTPS to the ownership-proof endpoint (POST body or Authorization header, never a URL or query string), which hashes it and compares with the
  stored hash in constant time; the raw token is never stored or logged server-side". → Steps 4, 13, 15: JSON body only; a query string is rejected; constant-time
  compare in `ownerProof.ts`.
- **Row 2:** "AES-256-GCM in the server API route; key in a server-only env var (Vercel, never NEXT_PUBLIC); a key id is stored with each encrypted row so the key
  can be rotated". → Decrypt with MFW-45's `decryptPrivateWish`. The keyring is the current key plus `PRIVATE_WISH_RETIRED_KEYS` (Step 6).
- **Row 3:** public reads hide hidden/flagged items. → Unchanged. The owner read is not a public read and ignores moderation status (Open question 3).
- **Row 10:** "expires_at = 30 days after the festival ends; then public and private rows are deleted". → An expired creation is never revealed (SQL and in-memory filter).
- **Row 12:** "creation ids are kept in LocalStorage next to the token (no server query by owner); private text is still read only with ownership proof (row 1)".
  → There is no "list my creations" endpoint. The UI offers the reveal only for ids the device lists (MFW-30 registers them, Step 5), and the server decides.
- **Row 13:** "the private wish may keep it [profanity]". → The revealed text is shown as stored, with no moderation on the owner path.
- **Row 17:** no Supabase project or staging yet. → The migration is a repo file the owner applies. CI never needs a database.

## Files

| Path | New/modify | Purpose |
|---|---|---|
| `src/config/ownership.config.ts` | modify (append) | `OWNER_TOKEN_HASH_HEX_LENGTH`, `OWNER_TOKEN_HASH_COMPARE_PLACEHOLDER` |
| `src/services/auth/ownerProof.ts` (+ `.test.ts`) | new | `ownerTokenHashesMatch` (constant time) |
| `src/services/auth/ownedCreationHint.ts` (+ `.test.ts`) | new | Device-local "is this mine?" hint registry for MFW-30 |
| `src/config/privateWish.config.ts` | modify (append) | Retired-keys env name, separators, max count |
| `src/services/api/privateWishCipher.ts` | modify | `PrivateWishCipher.decrypt`, `readRetiredPrivateWishKeysEnv`, `PrivateWishReader`, `createPrivateWishReaderFromEnv`, `getPrivateWishReader` |
| `src/config/privateWish.config.test.ts`, `src/services/api/privateWishCipher.test.ts` | modify (add cases only) | New constants, decrypt, keyring |
| `src/config/database.config.ts` | modify (append) | `CREATION_OWNERSHIP_RPC_PATH` |
| `supabase/migrations/20261125000000_mfw31_creation_ownership_read.sql` | new | `mfw_creation_ownership(uuid)`, service_role only |
| `tests/unit/ownership-read-migration.test.ts` | new | Static SQL checks |
| `src/services/api/creationTypes.ts` | modify (append) | `CreationOwnershipRecord` |
| `src/services/api/creationRepository.ts` | modify | Add `readOwnership` to the interface; `"ownership"` detail |
| `src/services/api/inMemoryCreationRepository.ts` (+ test) | modify | Implement `readOwnership` |
| `src/services/api/supabaseCreationRepository.ts` (+ test) | modify | Implement `readOwnership` via RPC |
| `src/services/api/__fixtures__/createCreation.ts`, `src/app/api/creations/route.test.ts` and every other object literal typed `CreationRepository` | modify (stubs only) | Add `readOwnership` to test doubles |
| `src/services/api/requestBody.ts` (+ `.test.ts`) | new | `readRequestTextWithLimit` (streaming byte cap) |
| `src/config/ownerWish.config.ts` | new | Body cap, client timeout, Thai copy |
| `src/services/api/ownerWishRevealTypes.ts` | new (client-safe) | Path, body keys, request/response/error types |
| `src/services/api/ownerWishReveal.ts` (+ `.test.ts`) | new (server) | `parseOwnerWishRevealRequest`, `handleOwnerWishReveal`, `getDefaultOwnerWishRevealDeps` |
| `src/services/api/__fixtures__/ownerWish.ts` | new (test data) | Second token, secret text, request builder, seeded repository |
| `src/app/api/private-wish/route.ts` (+ `route.test.ts`) | new | `POST` only, delegates |
| `src/services/api/ownerWishClient.ts` (+ `.test.ts`) | new (client) | `createOwnerWishRevealer`, `getOwnerWishRevealer`, `parseOwnerWishRevealResponse` |
| `src/services/api/index.ts` | modify | Export the client-safe reveal types and path |
| `src/components/ui/PrivateWishReveal.tsx` (+ `.test.tsx`) | new | Reveal button / text / hide |
| `src/components/ui/OwnerWishSection.tsx` (+ `.test.tsx`) | new | `shouldOfferOwnerWishReveal`, `OwnerWishSection` |
| `src/components/ui/InspectPopup.tsx` (+ test) | modify | Optional `ownerSection` slot |
| `src/components/canvas3d/index.tsx` (+ test) | modify (one import, one prop) | Pass `<OwnerWishSection creation={inspected} />` |
| `tests/unit/owner-wish-boundary.test.ts` | new | Route exports, server/client import boundary, client transport flags, AC1 identity fields, no animation |
| `tests/e2e/owner-wish-api.spec.ts` | new | Production build, no env: create privately → reveal / refuse |

## Implementation steps

Conventions for every new or changed file: TypeScript strict, English comments, no `any`, named constants only (no inline numbers except `0`,
`1` and the HTTP status constants written below), `Object.freeze` on exported constant arrays/objects, **no `console.*`**, no named capture groups.
Error messages and response bodies never contain a token, hash, ciphertext, key, env value, wish text or request value. They carry only codes.
**Never write the snake_case private column names in any non-test `src` file except `supabaseCreationRepository.ts`** (and `src/services/auth/**`,
`ownership.config.ts`), not even in comments. **Never write `ownerToken`, `ownerTokenHash` or `privateWish` anywhere in a non-test file under `src/app/api`.**
Import core/server modules by path. No `Vector3`, `.toArray()` or `three` import in `src/services/**`, `src/app/api/**` or `supabase/**`.

### Step 1 — `src/config/ownership.config.ts` (append; keep everything else)

```ts
/** Length of OWNER_TOKEN_HASH_PATTERN (SHA-256 as hex). The constant-time compare always walks exactly this many characters. */
export const OWNER_TOKEN_HASH_HEX_LENGTH = 64;
/**
 * Compared against when a creation has no stored hash (unknown id), so a miss costs the same loop as a mismatch.
 * Never stored and never accepted: ownerTokenHashesMatch returns false whenever the stored side is absent.
 */
export const OWNER_TOKEN_HASH_COMPARE_PLACEHOLDER = "0".repeat(OWNER_TOKEN_HASH_HEX_LENGTH);
```

### Step 2 — `src/services/auth/ownerProof.ts` (new; server use, isomorphic code)

Pure JS on purpose: the `@/services/auth` barrel is bundled into the client, so `node:crypto.timingSafeEqual` cannot be imported here (D3).
```ts
import { OWNER_TOKEN_HASH_COMPARE_PLACEHOLDER, OWNER_TOKEN_HASH_HEX_LENGTH } from "@/config/ownership.config";
import { isOwnerTokenHash, type OwnerTokenHash } from "./ownerTokenHash";

/**
 * Owner proof (open question 1): true only when `stored` is a well-formed hash equal to `presented`.
 * Constant time in the hash contents: always XORs all OWNER_TOKEN_HASH_HEX_LENGTH characters, no early exit, no `===` on the hashes.
 * A missing stored hash is compared against a placeholder and then rejected, so unknown ids and wrong tokens take the same path.
 */
export function ownerTokenHashesMatch(presented: OwnerTokenHash, stored: OwnerTokenHash | null): boolean {
  const presentedOk = isOwnerTokenHash(presented);
  const storedOk = stored !== null && isOwnerTokenHash(stored);
  const left: string = presentedOk ? presented : OWNER_TOKEN_HASH_COMPARE_PLACEHOLDER;
  const right: string = storedOk ? stored : OWNER_TOKEN_HASH_COMPARE_PLACEHOLDER;
  let diff = 0;
  for (let i = 0; i < OWNER_TOKEN_HASH_HEX_LENGTH; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return presentedOk && storedOk && diff === 0;
}
```
Do not export it from the `@/services/auth` barrel. Import it by path (`@/services/auth/ownerProof`) from server code.

### Step 3 — `src/services/auth/ownedCreationHint.ts` (new; client)

```ts
/**
 * Device-local hint "this creation was made on this device" (owner decision 12: MFW-30 keeps the ids in LocalStorage).
 * Only decides whether the UI OFFERS the private-wish reveal; the server alone decides ownership (owner proof, open question 1).
 * Creation ids are public, so this module holds no secret. Not reactive: read at render time.
 */
export type OwnedCreationPredicate = (creationId: string) => boolean;

const NOTHING_OWNED: OwnedCreationPredicate = () => false;
let current: OwnedCreationPredicate = NOTHING_OWNED;

/** MFW-30 registers its device creation-id list here. Returns an unregister function (no-op if another predicate replaced it). */
export function registerOwnedCreationPredicate(predicate: OwnedCreationPredicate): () => void {
  current = predicate;
  return () => {
    if (current === predicate) current = NOTHING_OWNED;
  };
}

/** false for "" and non-strings; a throwing or non-boolean predicate counts as false. */
export function isOwnedCreation(creationId: string): boolean {
  if (typeof creationId !== "string" || creationId === "") return false;
  try {
    return current(creationId) === true;
  } catch {
    return false;
  }
}
```
Do not add it to the auth barrel either (import by path).

### Step 4 — `src/config/privateWish.config.ts` (append; keep MFW-12/MFW-45 exports unchanged)

```ts
/**
 * Server-only env var (never NEXT_PUBLIC) listing RETIRED keys that may still decrypt (owner decision 2: rotation).
 * Format: "<keyId>:<base64 key>[,<keyId>:<base64 key>…]" — each id matches PRIVATE_WISH_KEY_ID_PATTERN, is not the ephemeral id and differs from the
 * current PRIVATE_WISH_KEY_ID; each key is standard base64 of 32 bytes. Empty / unset = no retired keys. Retired keys never encrypt.
 */
export const PRIVATE_WISH_RETIRED_KEYS_ENV = "PRIVATE_WISH_RETIRED_KEYS";
export const PRIVATE_WISH_RETIRED_KEYS_SEPARATOR = ",";
export const PRIVATE_WISH_RETIRED_KEY_ID_SEPARATOR = ":";
/** Technical bound on the retired list (each entry is one key import per process). Lead decision MFW-31. */
export const PRIVATE_WISH_RETIRED_KEYS_MAX = 8;
```

### Step 5 — `src/services/api/privateWishCipher.ts` (modify)

5a. Extend the interface and `createPrivateWishCipher`. All existing behaviour stays the same:
```ts
export interface PrivateWishCipher {
  readonly keyId: string;
  encrypt(plaintext: string, ownerTokenHash: OwnerTokenHash): Promise<EncryptedPrivateWish>;
  /** Decrypts with THIS cipher's key only (wish.keyId must equal keyId); null on any failure, never throws. */
  decrypt(wish: EncryptedPrivateWish, ownerTokenHash: OwnerTokenHash): Promise<string | null>;
}
```
In the object returned by `createPrivateWishCipher`, add
`decrypt: (wish, ownerTokenHash) => decryptPrivateWish(wish, ownerTokenHash, (id) => (id === keyId ? key : undefined))`.
`decryptPrivateWish` is a hoisted function declaration, so it may be referenced there. This is how the reader reaches the ephemeral key without the
`CryptoKey` ever leaving the module (D6).

5b. Append (new imports: `PRIVATE_WISH_RETIRED_KEYS_ENV`, `PRIVATE_WISH_RETIRED_KEYS_SEPARATOR`, `PRIVATE_WISH_RETIRED_KEY_ID_SEPARATOR`,
`PRIVATE_WISH_RETIRED_KEYS_MAX` from the config):
```ts
export interface RetiredPrivateWishKey {
  readonly keyId: string;
  readonly rawKey: Uint8Array<ArrayBuffer>;
}
export type RetiredPrivateWishKeysResult =
  | { readonly ok: true; readonly keys: readonly RetiredPrivateWishKey[] }
  | { readonly ok: false };

/** Parses PRIVATE_WISH_RETIRED_KEYS. Unset/blank → ok with []. Any malformed entry, duplicate id, the ephemeral id or > MAX entries → { ok: false }. */
export function readRetiredPrivateWishKeysEnv(env: BackendEnv): RetiredPrivateWishKeysResult {
  const raw = env[PRIVATE_WISH_RETIRED_KEYS_ENV]?.trim() ?? "";
  if (raw === "") return { ok: true, keys: [] };
  const entries = raw.split(PRIVATE_WISH_RETIRED_KEYS_SEPARATOR);
  if (entries.length > PRIVATE_WISH_RETIRED_KEYS_MAX) return { ok: false };
  const seen = new Set<string>();
  const keys: RetiredPrivateWishKey[] = [];
  for (const entry of entries) {
    const parts = entry.trim().split(PRIVATE_WISH_RETIRED_KEY_ID_SEPARATOR);
    if (parts.length !== 2) return { ok: false };
    const keyId = parts[0] ?? "";
    const rawKey = base64ToBytes(parts[1] ?? "", PRIVATE_WISH_KEY_BASE64_PATTERN);
    if (!PRIVATE_WISH_KEY_ID_PATTERN.test(keyId) || keyId === PRIVATE_WISH_EPHEMERAL_KEY_ID || seen.has(keyId)) return { ok: false };
    if (rawKey === null || rawKey.byteLength !== AES_256_KEY_BYTES) return { ok: false };
    seen.add(keyId);
    keys.push({ keyId, rawKey });
  }
  return { ok: true, keys };
}

export interface PrivateWishReader {
  /** null on ANY failure (unknown key id, wrong owner hash, tampering, the ephemeral id outside the memory backend); never throws. */
  decrypt(wish: EncryptedPrivateWish, ownerTokenHash: OwnerTokenHash): Promise<string | null>;
}

/**
 * Keyring for the owner read path (MFW-31).
 * - Current env key set and valid → current key + retired keys; the ephemeral id is never looked up.
 * - Retired list invalid, current key half-set/invalid, retired keys without a current key, or a retired id equal to the current id → PrivateWishKeyError("invalid").
 * - No key env at all: memory backend → decrypts only with the process's ephemeral write cipher (getWriteCipher("memory")); supabase → PrivateWishKeyError("missing").
 */
export async function createPrivateWishReaderFromEnv(
  env: BackendEnv,
  backend: CreationBackend,
  getWriteCipher: (backend: CreationBackend) => Promise<PrivateWishCipher>,
): Promise<PrivateWishReader> {
  const current = readPrivateWishKeyEnv(env);
  const retired = readRetiredPrivateWishKeysEnv(env);
  if (!retired.ok) throw new PrivateWishKeyError("invalid");
  if (current.ok) {
    const keys = new Map<string, CryptoKey>();
    keys.set(current.keyId, await importPrivateWishKey(current.rawKey));
    for (const r of retired.keys) {
      if (keys.has(r.keyId)) throw new PrivateWishKeyError("invalid");
      keys.set(r.keyId, await importPrivateWishKey(r.rawKey));
    }
    const lookup: PrivateWishKeyLookup = (keyId) => (keyId === PRIVATE_WISH_EPHEMERAL_KEY_ID ? undefined : keys.get(keyId));
    return { decrypt: (wish, ownerTokenHash) => decryptPrivateWish(wish, ownerTokenHash, lookup) };
  }
  if (current.reason === "invalid" || retired.keys.length > 0) throw new PrivateWishKeyError("invalid");
  if (backend !== "memory") throw new PrivateWishKeyError("missing");
  const cipher = await getWriteCipher("memory");
  if (cipher.keyId !== PRIVATE_WISH_EPHEMERAL_KEY_ID) throw new PrivateWishKeyError("invalid"); // defensive
  return {
    decrypt: (wish, ownerTokenHash) =>
      wish.keyId === PRIVATE_WISH_EPHEMERAL_KEY_ID ? cipher.decrypt(wish, ownerTokenHash) : Promise.resolve(null),
  };
}

let cachedReader: Promise<PrivateWishReader> | null = null;

/** Process singleton for the owner read route; reads process.env only here. A failure is not cached. */
export function getPrivateWishReader(backend: CreationBackend): Promise<PrivateWishReader> {
  if (cachedReader === null) {
    const pending = createPrivateWishReaderFromEnv(process.env, backend, getPrivateWishCipher);
    cachedReader = pending;
    pending.catch(() => {
      if (cachedReader === pending) cachedReader = null;
    });
  }
  return cachedReader;
}
```
Keep `"AES-GCM"` as the only algorithm. Do not import `node:crypto`.

### Step 6 — `src/config/database.config.ts` (append)

```ts
/** MFW-31 owner read (relative to SUPABASE_REST_PATH). Name equals the SQL function of 20261125000000_mfw31_creation_ownership_read.sql. */
export const CREATION_OWNERSHIP_RPC_PATH = "rpc/mfw_creation_ownership";
```

### Step 7 — `supabase/migrations/20261125000000_mfw31_creation_ownership_read.sql` (new)

Write it **exactly** as below. Do not edit any earlier migration. Do not apply it, run the Supabase CLI or connect to any database.
```sql
-- MFW-31 (backlog 7.2): server-side read of one creation's ownership row for the owner proof.
-- Requires 20261124000000_mfw12_creations_public_private.sql. Applied by the owner (open question 17). Never applied by CI.
-- Only the Next.js server calls it, with the service-role key. It returns the stored SHA-256 owner hash and the encrypted
-- private wish of one non-expired creation (open question 10). The server compares the hash in constant time (open question 1)
-- and decrypts only after a match. Nothing here is granted to anon / authenticated; no table, policy or table grant changes.

create function public.mfw_creation_ownership(p_creation_id uuid)
returns table (owner_token_hash text, private_wish_text text, private_wish_key_id text)
language sql
stable
security invoker
set search_path = ''
as $$
  select o.owner_token_hash, o.private_wish_text, o.private_wish_key_id
  from public.creations_private_ownership as o
  join public.creations_public as p on p.id = o.creation_id
  where o.creation_id = p_creation_id
    and p.expires_at > now();
$$;

revoke all on function public.mfw_creation_ownership(uuid) from public, anon, authenticated;
grant execute on function public.mfw_creation_ownership(uuid) to service_role;

notify pgrst, 'reload schema';
```

### Step 8 — repository types and interface

`src/services/api/creationTypes.ts` (append):
```ts
/** Ownership row of one non-expired creation, for the owner proof (MFW-31). Server-only: never sent in any response, never logged. */
export interface CreationOwnershipRecord {
  readonly ownerTokenHash: OwnerTokenHash;
  readonly privateWish: EncryptedPrivateWish | null; // null when the creation's wish is public
}
```
`src/services/api/creationRepository.ts`:
- Add `| "ownership"` to the list in the `invalid_backend_response` comment.
- Add to `CreationRepository` (import the type):
```ts
  /**
   * Server-only owner read (MFW-31): the stored owner hash and encrypted private wish of a NON-EXPIRED creation, or null (unknown or expired).
   * Ignores moderation status (not a public read). Never takes or sends a token or a hash. Rejects invalid_input "creationId" for a non-uuid before any I/O.
   */
  readOwnership(creationId: string): Promise<CreationOwnershipRecord | null>;
```
Then run `pnpm typecheck`. For **every** object literal typed `CreationRepository` that now fails, add a stub and change nothing else. Known on `main`:
`recordingRepository` and `barrierOnZoneCounts` in `src/services/api/__fixtures__/createCreation.ts` (`readOwnership: (id) => inner.readOwnership(id)`) and the
`failing` double in `src/app/api/creations/route.test.ts` (`readOwnership: () => Promise.reject(new Error("unused"))`). Doubles built with `...repo` need nothing.

### Step 9 — `src/services/api/inMemoryCreationRepository.ts` (modify)

Add to the returned object (imports: `CreationOwnershipRecord`; `UUID_PATTERN` is already imported):
```ts
    async readOwnership(creationId: string): Promise<CreationOwnershipRecord | null> {
      if (typeof creationId !== "string" || !UUID_PATTERN.test(creationId)) {
        throw new CreationRepositoryError("invalid_input", "creationId");
      }
      const pub = publicRows.get(creationId);
      const priv = privateRows.get(creationId);
      if (pub === undefined || priv === undefined || pub.expiresAtMs <= now()) return null;
      return {
        ownerTokenHash: priv.ownerTokenHash,
        privateWish: priv.privateWish === null ? null : { ciphertext: priv.privateWish.ciphertext, keyId: priv.privateWish.keyId },
      };
    },
```

### Step 10 — `src/services/api/supabaseCreationRepository.ts` (modify)

Imports: `CREATION_OWNERSHIP_RPC_PATH` (database.config), `PRIVATE_WISH_CIPHERTEXT_PATTERN`, `PRIVATE_WISH_KEY_ID_PATTERN` (privateWish.config),
`isOwnerTokenHash` (`@/services/auth`), `CreationOwnershipRecord`, `PrivateWishCiphertext` (creationTypes).
```ts
/** Body of POST /rest/v1/rpc/mfw_creation_ownership; key equals the SQL parameter name. Carries no token and no hash. */
export interface CreationOwnershipRpcBody {
  readonly p_creation_id: string;
}

/** One mfw_creation_ownership row → record, or null if malformed (named keys only, no spreading). */
function ownershipRowToRecord(row: unknown): CreationOwnershipRecord | null {
  if (!isPlainObject(row)) return null;
  const { owner_token_hash, private_wish_text, private_wish_key_id } = row;
  if (!isOwnerTokenHash(owner_token_hash)) return null;
  if (private_wish_text === null && private_wish_key_id === null) return { ownerTokenHash: owner_token_hash, privateWish: null };
  if (typeof private_wish_text !== "string" || !PRIVATE_WISH_CIPHERTEXT_PATTERN.test(private_wish_text)) return null;
  if (typeof private_wish_key_id !== "string" || !PRIVATE_WISH_KEY_ID_PATTERN.test(private_wish_key_id)) return null;
  return {
    ownerTokenHash: owner_token_hash,
    privateWish: { ciphertext: private_wish_text as PrivateWishCiphertext, keyId: private_wish_key_id },
  };
}
```
Method on the returned object:
```ts
    async readOwnership(creationId: string): Promise<CreationOwnershipRecord | null> {
      if (typeof creationId !== "string" || !UUID_PATTERN.test(creationId)) {
        throw new CreationRepositoryError("invalid_input", "creationId"); // before any request
      }
      const body: CreationOwnershipRpcBody = { p_creation_id: creationId };
      const data = await send(new URL(CREATION_OWNERSHIP_RPC_PATH, restBase), "POST", JSON.stringify(body));
      if (!Array.isArray(data) || data.length > 1) throw new CreationRepositoryError("invalid_backend_response", "ownership");
      if (data.length === 0) return null;
      const record = ownershipRowToRecord(data[0]);
      if (record === null) throw new CreationRepositoryError("invalid_backend_response", "ownership"); // fail closed → 503
      return record;
    },
```
`send` already refuses to read non-2xx bodies and never puts the key in an error.

### Step 11 — `src/services/api/requestBody.ts` (new; server)

This fixes the MFW-45/MFW-13 follow-up ("the body size cap applies after a chunked body is read") for this route only. Do not refactor the other handlers.
```ts
export type RequestTextResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: "too_large" | "unreadable" };

/**
 * Reads the body as UTF-8 and stops as soon as more than `maxBytes` arrived (the stream is cancelled; nothing more is buffered).
 * No body → ok with "". Invalid UTF-8 or a stream error → unreadable. Never throws.
 */
export async function readRequestTextWithLimit(request: Request, maxBytes: number): Promise<RequestTextResult> {
  const stream = request.body;
  if (stream === null) return { ok: true, text: "" };
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}
```

### Step 12 — `src/config/ownerWish.config.ts` (new; client-safe)

```ts
/**
 * Max bytes of a POST /api/private-wish body. A valid body ({ creationId: uuid, ownerToken: 43 chars }) is about 100 bytes.
 * Technical DoS bound, lead decision MFW-31.
 */
export const OWNER_WISH_REVEAL_REQUEST_MAX_BYTES = 512;
/** A reveal request slower than this counts as failed (the owner can retry). Same value as REPORT_REQUEST_TIMEOUT_MS; lead decision MFW-31. */
export const OWNER_WISH_REVEAL_TIMEOUT_MS = 10_000;
/** PrivateWishReveal copy. DRAFT Thai copy, PLACEHOLDER (spec silent; Open question 4). */
export const OWNER_WISH_COPY = Object.freeze({
  heading: "คำอธิษฐานส่วนตัวของฉัน",
  deviceOnlyNote: "เปิดอ่านได้เฉพาะบนอุปกรณ์ที่ปล่อยกระทงนี้",
  reveal: "อ่านคำอธิษฐานส่วนตัว",
  revealing: "กำลังเปิด…",
  hide: "ซ่อนข้อความ",
  none: "ไม่พบคำอธิษฐานส่วนตัวของกระทงนี้บนอุปกรณ์นี้",
  failed: "เปิดอ่านไม่สำเร็จ",
  retry: "ลองอีกครั้ง",
});
```

| Constant | Value | File | Source |
|---|---|---|---|
| `OWNER_TOKEN_HASH_HEX_LENGTH` | `64` | `ownership.config.ts` | SHA-256 hex length (= `OWNER_TOKEN_HASH_PATTERN`) |
| `OWNER_TOKEN_HASH_COMPARE_PLACEHOLDER` | 64 × `"0"` | `ownership.config.ts` | lead (D3) |
| `PRIVATE_WISH_RETIRED_KEYS_ENV` | `"PRIVATE_WISH_RETIRED_KEYS"` | `privateWish.config.ts` | lead (D5) |
| `PRIVATE_WISH_RETIRED_KEYS_SEPARATOR` / `_KEY_ID_SEPARATOR` | `","` / `":"` | `privateWish.config.ts` | lead (D5); neither occurs in a key id or in base64 |
| `PRIVATE_WISH_RETIRED_KEYS_MAX` | `8` | `privateWish.config.ts` | lead (D5), technical bound |
| `CREATION_OWNERSHIP_RPC_PATH` | `"rpc/mfw_creation_ownership"` | `database.config.ts` | lead (D4) |
| `OWNER_WISH_REVEAL_REQUEST_MAX_BYTES` | `512` | `ownerWish.config.ts` | lead (D7), technical bound |
| `OWNER_WISH_REVEAL_TIMEOUT_MS` | `10_000` | `ownerWish.config.ts` | lead (D8), same as MFW-28's report timeout |
| `OWNER_WISH_COPY` | Thai strings above | `ownerWish.config.ts` | **PLACEHOLDER (spec silent)**, Open question 4 |
| reused: `PRIVATE_WISH_EPHEMERAL_KEY_ID`, `PRIVATE_WISH_KEY_ID_PATTERN`, `PRIVATE_WISH_KEY_BASE64_PATTERN`, `AES_256_KEY_BYTES`, `UUID_PATTERN`, `OWNER_TOKEN_HASH_PATTERN` | — | existing | MFW-11 / 12 / 45 |

### Step 13 — `src/services/api/ownerWishRevealTypes.ts` (new; client-safe, no imports)

```ts
/** POST endpoint of the owner proof + private wish read (backlog 7.2). The token goes only in the JSON body (open question 1). */
export const OWNER_WISH_REVEAL_PATH = "/api/private-wish";
/** Request body: exactly these keys (any order). Content-Type must be application/json; the URL must have no query string. */
export const OWNER_WISH_REVEAL_BODY_KEYS = Object.freeze(["creationId", "ownerToken"] as const);

export interface OwnerWishRevealRequestBody {
  readonly creationId: string; // lowercase uuid, as returned by GET /api/creations
  readonly ownerToken: string; // the raw DeviceOwnerToken; body only, never a URL
}

/**
 * 200 body for EVERY well-formed request: the decrypted private wish only when the token proves ownership and the creation has one,
 * else null — byte-identical for unknown, expired, not-yours, public-wish and undecryptable creations (no existence / ownership oracle).
 */
export interface OwnerWishRevealResponseBody {
  readonly wishText: string | null;
}

export type OwnerWishRevealErrorBody =
  | { readonly error: "unsupported_media_type" } // 415
  | { readonly error: "payload_too_large" } // 413
  | { readonly error: "unexpected_query" } // 400: any query string (a token must never be in a URL)
  | { readonly error: "invalid_body" } // 400
  | { readonly error: "unavailable" }; // 503: backend / key configuration, never row-dependent
```
`src/services/api/index.ts` (append):
```ts
export {
  OWNER_WISH_REVEAL_BODY_KEYS,
  OWNER_WISH_REVEAL_PATH,
  type OwnerWishRevealErrorBody,
  type OwnerWishRevealRequestBody,
  type OwnerWishRevealResponseBody,
} from "./ownerWishRevealTypes";
```
Do **not** export `ownerWishReveal.ts`, `ownerWishClient.ts`, `requestBody.ts` or `privateWishCipher.ts` from the barrel. The client module imports the device
vault, so it is imported by path only where it is used.

### Step 14 — `src/services/api/ownerWishReveal.ts` (new; server)

```ts
import { UUID_PATTERN } from "@/config/database.config";
import { OWNER_WISH_REVEAL_REQUEST_MAX_BYTES } from "@/config/ownerWish.config";
import { hashOwnerToken, isDeviceOwnerToken, type DeviceOwnerToken } from "@/services/auth";
import { ownerTokenHashesMatch } from "@/services/auth/ownerProof";
import type { CreationBackend, CreationRepository } from "./creationRepository";
import { getCreationRepository, isProductionDeployment } from "./creationRepositoryFactory";
import { isPlainObject } from "./json";
import { OWNER_WISH_REVEAL_BODY_KEYS, type OwnerWishRevealErrorBody, type OwnerWishRevealResponseBody } from "./ownerWishRevealTypes";
import { getPrivateWishReader, type PrivateWishReader } from "./privateWishCipher";
import { readRequestTextWithLimit } from "./requestBody";

export interface OwnerWishRevealDeps {
  readonly getRepository: () => CreationRepository; // may throw (misconfigured) → 503
  readonly getWishReader: (backend: CreationBackend) => Promise<PrivateWishReader>; // may reject (key env) → 503
  readonly isProduction: boolean;
}

export interface ParsedOwnerWishRevealRequest {
  readonly creationId: string;
  readonly ownerToken: DeviceOwnerToken;
}

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;
const HTTP_SERVICE_UNAVAILABLE = 503;
const NO_STORE = { "Cache-Control": "no-store" } as const;
const JSON_CONTENT_TYPE = /^application\/json\s*(?:;|$)/i;
const NOT_REVEALED: OwnerWishRevealResponseBody = Object.freeze({ wishText: null });

function respond(status: number, body: OwnerWishRevealResponseBody | OwnerWishRevealErrorBody): Response {
  return Response.json(body, { status, headers: NO_STORE });
}
const invalidBody = (): Response => respond(HTTP_BAD_REQUEST, { error: "invalid_body" });
const unavailable = (): Response => respond(HTTP_SERVICE_UNAVAILABLE, { error: "unavailable" });

/** Exactly { creationId: lowercase uuid, ownerToken: DeviceOwnerToken } in any key order; anything else → null. Never echoes. */
export function parseOwnerWishRevealRequest(value: unknown): ParsedOwnerWishRevealRequest | null {
  if (!isPlainObject(value)) return null;
  const allowed: readonly string[] = OWNER_WISH_REVEAL_BODY_KEYS;
  const keys = Object.keys(value);
  if (keys.length !== allowed.length || !keys.every((key) => allowed.includes(key))) return null;
  const { creationId, ownerToken } = value;
  if (typeof creationId !== "string" || !UUID_PATTERN.test(creationId)) return null;
  if (!isDeviceOwnerToken(ownerToken)) return null;
  return { creationId, ownerToken };
}

/** POST /api/private-wish logic (backlog 7.2). Never logs; never puts a request value into a response. */
export async function handleOwnerWishReveal(request: Request, deps: OwnerWishRevealDeps): Promise<Response> {
  if (!JSON_CONTENT_TYPE.test(request.headers.get("content-type") ?? "")) {
    return respond(HTTP_UNSUPPORTED_MEDIA_TYPE, { error: "unsupported_media_type" });
  }
  if (new URL(request.url).search !== "") return respond(HTTP_BAD_REQUEST, { error: "unexpected_query" });
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > OWNER_WISH_REVEAL_REQUEST_MAX_BYTES) {
    return respond(HTTP_PAYLOAD_TOO_LARGE, { error: "payload_too_large" });
  }
  const body = await readRequestTextWithLimit(request, OWNER_WISH_REVEAL_REQUEST_MAX_BYTES);
  if (!body.ok) {
    return body.reason === "too_large" ? respond(HTTP_PAYLOAD_TOO_LARGE, { error: "payload_too_large" }) : invalidBody();
  }
  let json: unknown;
  try {
    json = JSON.parse(body.text);
  } catch {
    return invalidBody();
  }
  const parsed = parseOwnerWishRevealRequest(json);
  if (parsed === null) return invalidBody();

  let repository: CreationRepository;
  try {
    repository = deps.getRepository();
  } catch {
    return unavailable();
  }
  if (repository.backend === "memory" && deps.isProduction) return unavailable();

  try {
    // Keyring first: a key misconfiguration is a 503 for every request, never only for rows that match (no oracle).
    const reader = await deps.getWishReader(repository.backend);
    const presentedHash = await hashOwnerToken(parsed.ownerToken); // the raw token is not used after this line
    const record = await repository.readOwnership(parsed.creationId);
    const isOwner = ownerTokenHashesMatch(presentedHash, record === null ? null : record.ownerTokenHash);
    if (!isOwner || record === null || record.privateWish === null) return respond(HTTP_OK, NOT_REVEALED);
    const wishText = await reader.decrypt(record.privateWish, presentedHash);
    return respond(HTTP_OK, wishText === null || wishText === "" ? NOT_REVEALED : { wishText });
  } catch {
    return unavailable();
  }
}

/** Route wiring; reads process.env only when called. */
export function getDefaultOwnerWishRevealDeps(): OwnerWishRevealDeps {
  return {
    getRepository: getCreationRepository,
    getWishReader: getPrivateWishReader,
    isProduction: isProductionDeployment(process.env),
  };
}
```
Order rationale (D2): cheap static checks come first. The keyring loads before any row is read. The hash compare runs whether or not a row exists.
Decryption runs only after a match.

### Step 15 — `src/app/api/private-wish/route.ts` (new)

```ts
import { getDefaultOwnerWishRevealDeps, handleOwnerWishReveal } from "@/services/api/ownerWishReveal";

/** POST /api/private-wish — owner proof, then the owner's own private wish (backlog 7.2). Body: OwnerWishRevealRequestBody (JSON). */
export async function POST(request: Request): Promise<Response> {
  return handleOwnerWishReveal(request, getDefaultOwnerWishRevealDeps());
}
```
Export only `POST`. No `process.env`, no default export, no `dynamic` / `runtime`. Re-read the file: it must not contain `ownerToken`, `ownerTokenHash` or `privateWish`.
`pnpm build` must list `ƒ /api/private-wish`.

### Step 16 — `src/services/api/ownerWishClient.ts` (new; client)

```ts
import { OWNER_WISH_REVEAL_TIMEOUT_MS } from "@/config/ownerWish.config";
import { getDeviceOwnerVault, type DeviceOwnerToken } from "@/services/auth";
import { isPlainObject } from "./json";
import { OWNER_WISH_REVEAL_PATH, type OwnerWishRevealRequestBody } from "./ownerWishRevealTypes";

export type OwnerWishRevealOutcome =
  | { readonly kind: "revealed"; readonly wishText: string }
  | { readonly kind: "none" } // the server answered null, or this device has no token
  | { readonly kind: "failed" }; // network, timeout, non-200, malformed answer, unexpected error

export type OwnerWishFetch = (input: string, init: RequestInit) => Promise<Response>;

export interface OwnerWishRevealer {
  /** Never throws, never logs, never caches the text. */
  reveal(creationId: string): Promise<OwnerWishRevealOutcome>;
}

export interface OwnerWishRevealerDeps {
  readonly fetch?: OwnerWishFetch; // default: global fetch looked up at call time
  readonly readOwnerToken?: () => DeviceOwnerToken | null; // default () => getDeviceOwnerVault().read() — never creates a token
  readonly timeoutMs?: number; // default OWNER_WISH_REVEAL_TIMEOUT_MS
}

const HTTP_OK = 200;
const NONE: OwnerWishRevealOutcome = Object.freeze({ kind: "none" });
const FAILED: OwnerWishRevealOutcome = Object.freeze({ kind: "failed" });

/** Exactly { wishText: non-empty string | null }; anything else → failed. */
export function parseOwnerWishRevealResponse(value: unknown): OwnerWishRevealOutcome {
  if (!isPlainObject(value)) return FAILED;
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "wishText") return FAILED;
  const wishText = value.wishText;
  if (wishText === null) return NONE;
  if (typeof wishText === "string" && wishText !== "") return { kind: "revealed", wishText };
  return FAILED;
}

export function createOwnerWishRevealer(deps: OwnerWishRevealerDeps = {}): OwnerWishRevealer {
  const fetchImpl: OwnerWishFetch = deps.fetch ?? ((input, init) => fetch(input, init));
  const readOwnerToken = deps.readOwnerToken ?? (() => getDeviceOwnerVault().read());
  const timeoutMs = deps.timeoutMs ?? OWNER_WISH_REVEAL_TIMEOUT_MS;
  return {
    async reveal(creationId) {
      if (typeof creationId !== "string" || creationId === "") return FAILED;
      let token: DeviceOwnerToken | null;
      try {
        token = readOwnerToken();
      } catch {
        return FAILED; // e.g. called on the server
      }
      if (token === null) return NONE; // no token on this device: it owns nothing; no request
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const body: OwnerWishRevealRequestBody = { creationId, ownerToken: token };
        const response = await fetchImpl(OWNER_WISH_REVEAL_PATH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
          credentials: "omit",
          redirect: "error", // a redirect would re-send the body (and the token) elsewhere
          referrerPolicy: "no-referrer",
          signal: controller.signal,
        });
        if (response.status !== HTTP_OK) {
          await response.body?.cancel().catch(() => undefined);
          return FAILED;
        }
        return parseOwnerWishRevealResponse(await response.json());
      } catch {
        return FAILED;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

let shared: OwnerWishRevealer | null = null;
/** Lazy singleton used by PrivateWishReveal. */
export function getOwnerWishRevealer(): OwnerWishRevealer {
  shared ??= createOwnerWishRevealer();
  return shared;
}
```

### Step 17 — UI

17a. `src/components/ui/PrivateWishReveal.tsx` (new, `"use client"`):
```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { OWNER_WISH_COPY } from "@/config/ownerWish.config";
import { getOwnerWishRevealer, type OwnerWishRevealer } from "@/services/api/ownerWishClient";

export interface PrivateWishRevealProps {
  readonly creationId: string;
  /** Default getOwnerWishRevealer(). Injectable for tests. */
  readonly revealer?: OwnerWishRevealer;
}

type RevealUiState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "revealed"; readonly wishText: string }
  | { readonly kind: "none" }
  | { readonly kind: "failed" };

const BUTTON_CLASS = "min-h-11 min-w-11 rounded-full border border-current px-3";

/** The owner's own private wish, fetched only on tap and kept only in this component's state (never a store, never storage). */
export function PrivateWishReveal({ creationId, revealer }: PrivateWishRevealProps) {
  const [state, setState] = useState<RevealUiState>({ kind: "idle" });
  const requestSeq = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestSeq.current += 1; // drop a late answer after unmount
    };
  }, []);
  const copy = OWNER_WISH_COPY;

  const reveal = () => {
    if (state.kind === "loading") return;
    requestSeq.current += 1;
    const seq = requestSeq.current;
    setState({ kind: "loading" });
    void (revealer ?? getOwnerWishRevealer()).reveal(creationId).then((outcome) => {
      if (!mounted.current || seq !== requestSeq.current) return;
      setState(outcome.kind === "revealed" ? { kind: "revealed", wishText: outcome.wishText } : { kind: outcome.kind });
    });
  };
  const hide = () => {
    requestSeq.current += 1;
    setState({ kind: "idle" });
  };
  const status = state.kind === "none" ? copy.none : state.kind === "failed" ? copy.failed : "";

  return (
    <div className="mt-2" data-owner-wish-state={state.kind}>
      <h3 className="font-semibold">{copy.heading}</h3>
      <p className="text-xs opacity-75">{copy.deviceOnlyNote}</p>
      {state.kind === "revealed" && (
        <>
          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words">{state.wishText}</p>
          <button type="button" className={BUTTON_CLASS} onClick={hide}>{copy.hide}</button>
        </>
      )}
      {state.kind === "idle" && <button type="button" className={BUTTON_CLASS} onClick={reveal}>{copy.reveal}</button>}
      {state.kind === "loading" && <button type="button" className={BUTTON_CLASS} disabled>{copy.revealing}</button>}
      {state.kind === "failed" && <button type="button" className={BUTTON_CLASS} onClick={reveal}>{copy.retry}</button>}
      <p aria-live="polite">{status}</p>
    </div>
  );
}
```
Rules: text only as a React text child (no `dangerouslySetInnerHTML`). No `localStorage` / `sessionStorage`, no store write, no `console`. No `animate-*` /
`transition*` classes and no `@react-spring` import (invariant F: nothing animates, so there is no reduced-motion branch). The `data-owner-wish-state` attribute
holds only the state name, never the id or the text. This is a DOM element. Never put a dashed `data-*` prop on an R3F/three element (MFW-28 QA crash).

17b. `src/components/ui/OwnerWishSection.tsx` (new, `"use client"`):
```tsx
"use client";

import { isOwnedCreation } from "@/services/auth/ownedCreationHint";
import type { OwnerWishRevealer } from "@/services/api/ownerWishClient";
import type { InspectedCreation } from "./inspectedCreation";
import { PrivateWishReveal } from "./PrivateWishReveal";

/** Offer the reveal only for a krathong with a private wish (no public text) that this device lists as its own. */
export function shouldOfferOwnerWishReveal(
  creation: Pick<InspectedCreation, "id" | "publicWishText">,
  isOwned: (creationId: string) => boolean = isOwnedCreation,
): boolean {
  return creation.publicWishText === null && isOwned(creation.id);
}

export interface OwnerWishSectionProps {
  readonly creation: InspectedCreation;
  readonly isOwned?: (creationId: string) => boolean; // default isOwnedCreation
  readonly revealer?: OwnerWishRevealer;
}

export function OwnerWishSection({ creation, isOwned, revealer }: OwnerWishSectionProps) {
  if (!shouldOfferOwnerWishReveal(creation, isOwned)) return null;
  return <PrivateWishReveal key={creation.id} creationId={creation.id} revealer={revealer} />;
}
```

17c. `src/components/ui/InspectPopup.tsx` (modify, minimal). Add `import type { ReactNode } from "react";` (merge into the existing react import).
Add the prop `/** Owner-only block (MFW-31); the popup itself never touches the token. */ readonly ownerSection?: ReactNode;` to `InspectPopupProps`.
Destructure it and render `{ownerSection}` directly after the wish `<p>` (the one showing `creation.publicWishText ?? copy.noPublicWish`) and before the report
block. Change nothing else. The file must still import nothing from `@/services/auth`.

17d. `src/components/canvas3d/index.tsx` (modify, minimal). Add `import { OwnerWishSection } from "@/components/ui/OwnerWishSection";` next to the
`InspectPopup` import and change the popup render to:
```tsx
{inspected && (
  <InspectPopup
    key={inspected.id}
    creation={inspected}
    onClose={() => setInspectedId(null)}
    ownerSection={<OwnerWishSection creation={inspected} />}
  />
)}
```
Nothing else changes in this file (no new hooks, no `useFrame`, no 3D objects, no new numbers). If MFW-23/MFW-34 already changed the surrounding code, keep their version
and only add the import and the `ownerSection` prop.

### Step 18 — MFW-30 hook (conditional)

- **MFW-30 is not merged when you start (expected):** do nothing more. The default predicate owns nothing, so the reveal stays hidden in the popup until
  MFW-30 calls `registerOwnedCreationPredicate((id) => <its stored id list>.includes(id))` once on the client. List this in the PR under "Follow-ups for MFW-30".
  The endpoint, the client and `PrivateWishReveal` are complete and tested without it.
- **MFW-30 is merged when you start:** read its "Interfaces this card provides" section in `docs/plans/MFW-30.md` on `main`. If it exports a synchronous
  reader of the device's creation ids, add one client module `src/components/ui/registerDeviceOwnedCreations.ts` that calls
  `registerOwnedCreationPredicate((id) => reader().includes(id))` (adapt to its real signature) and import it for its side effect from
  `OwnerWishSection.tsx`. Add a test that an id in MFW-30's list makes `isOwnedCreation` true. If its drawer renders per-creation entries, do **not** edit
  the drawer. Note in the PR that MFW-30 can render `<PrivateWishReveal creationId={id} />` there. If its interface does not fit, do nothing and note it.

## Tests

None of these needs a database, a real key or Supabase env. Server tests start with `// @vitest-environment node`. Use `vi.spyOn(console, …)` to prove that
nothing logs. A "secret" in a test is `SECRET_WISH_FIXTURE`, and every response text is searched for it, for `OWNER_TOKEN_FIXTURE`, for the owner hash, for
the ciphertext and for the key id.

**Fixtures — `src/services/api/__fixtures__/ownerWish.ts` (new):**
- `OTHER_OWNER_TOKEN_FIXTURE = ("OtHeRdEvIcEtOkEn" + "y".repeat(26) + "A") as DeviceOwnerToken` (a test asserts `isDeviceOwnerToken` is true for it).
- `SECRET_WISH_FIXTURE = "ความลับของฉันไม่บอกใคร"`.
- `makeOwnerWishRequest(body: unknown, init?: { contentType?: string; rawBody?: string; contentLength?: string; query?: string }): Request` →
  `new Request("http://localhost/api/private-wish" + (init.query ?? ""), { method: "POST", headers, body: init.rawBody ?? JSON.stringify(body) })`.
- `seedOwnerWishRepository(nowMs = CREATE_NOW_MS)`: returns `{ repo, setNow, ownerHash, privateId, publicId, reader, cipher, lookup }`. It builds
  `createInMemoryCreationRepository({ now: () => t })` and `makeTestCipher()`, with `ownerHash = await hashOwnerToken(OWNER_TOKEN_FIXTURE)`. It inserts
  `makeNewCreation({ publicWishText: null, ownerTokenHash: ownerHash, privateWish: await cipher.encrypt(SECRET_WISH_FIXTURE, ownerHash), expiresAt: new Date(t + DAY_MS) })`
  (`privateId`) and `makeNewCreation({ publicWishText: "ขอให้ทุกคนมีความสุข", ownerTokenHash: ownerHash, privateWish: null, expiresAt: new Date(t + DAY_MS) })`
  (`publicId`). `reader = { decrypt: (w, h) => decryptPrivateWish(w, h, lookup) }`. Define `DAY_MS` in the fixture file.

**`src/services/auth/ownerProof.test.ts`** (new): equal hashes → true. Hashes differing only in the last char → false. Differing only in the first char → false.
`stored = null` → false. Stored malformed (63 chars; uppercase hex; 64 non-hex chars) → false. Presented malformed → false even when `stored` is the same string.
Presented = stored = the placeholder (64 zeros, a valid hex form) → true (it is a real equality, and the placeholder is never stored). Placeholder presented with
`stored = null` → false.

**`src/services/auth/ownedCreationHint.test.ts`** (new; `afterEach` unregisters): the default is false. After `registerOwnedCreationPredicate((id) => id === "a")`,
`"a"` → true and `"b"` → false. The unregister function restores false. Unregistering after a second register keeps the second. A throwing predicate → false.
A predicate returning `"yes"` (cast) → false. `""` → false and the predicate is not called.

**`src/config/privateWish.config.test.ts`** (add): env name `"PRIVATE_WISH_RETIRED_KEYS"`, does not start with `NEXT_PUBLIC_`. The separators are not matched
by `PRIVATE_WISH_KEY_ID_PATTERN` and do not occur in standard base64. `PRIVATE_WISH_RETIRED_KEYS_MAX` is a positive integer.

**`src/services/api/privateWishCipher.test.ts`** (add; build env objects inline, generate keys with `Buffer.alloc(32, n).toString("base64")`):
- "cipher.decrypt": round trip. Another owner hash → null. A wish relabelled with another key id → null.
- "readRetiredPrivateWishKeysEnv": unset or `"  "` → `{ ok: true, keys: [] }`. `"old1:<k1>,old2:<k2>"` → two keys of 32 bytes in order. Each of these → `{ ok: false }`:
  no colon; two colons; empty id; `"Old1:<k1>"` (uppercase); `"ephemeral:<k1>"`; a duplicate id; a 31-byte key; `"AAAA"` as the key; `PRIVATE_WISH_RETIRED_KEYS_MAX + 1` entries.
- "reader with the current key": encrypts with `createPrivateWishCipher({ keyId: "k2026b", key })` → `createPrivateWishReaderFromEnv({ PRIVATE_WISH_KEY: kB, PRIVATE_WISH_KEY_ID: "k2026b" }, "supabase", unusedCipher)` decrypts it.
  `unusedCipher` is a `vi.fn` that must not be called.
- "reader decrypts retired keys": a wish under `k2026a` + env current `k2026b` + `PRIVATE_WISH_RETIRED_KEYS: "k2026a:<kA>"` → decrypts. The same without the retired entry → null.
- "ephemeral id outside memory": `createPrivateWishCipher({ keyId: "ephemeral", key: <same bytes as current> })` encrypts. The env reader (current `k2026b`, same bytes) → null.
- "memory without env uses the write cipher": `getWriteCipher = async () => createPrivateWishCipherFromEnv({}, "memory")` (keep the instance). The reader decrypts what that
  instance encrypted, and returns null for a wish whose key id is not `ephemeral`.
- Failures (all reject `PrivateWishKeyError`, and the message contains no env value): supabase + no env → `"missing"`. Half-set current → `"invalid"`. Invalid retired list → `"invalid"`.
  Retired list without a current key (memory and supabase) → `"invalid"`. A retired id equal to the current id → `"invalid"`.
- "getPrivateWishReader caches success, not failure": same `vi.resetModules()` + `vi.stubEnv` pattern as the existing `getPrivateWishCipher` test.

**`tests/unit/ownership-read-migration.test.ts`** (new; normalise as in `report-migration.test.ts`: strip `--` comments, collapse whitespace, lowercase):
- It sorts after the `_mfw45_` migration, and the file name is `20261125000000_mfw31_creation_ownership_read.sql`.
- It contains `create function public.mfw_creation_ownership(p_creation_id uuid) returns table (owner_token_hash text, private_wish_text text, private_wish_key_id text)`,
  `security invoker`, `set search_path = ''` and `stable`, and not `security definer`.
- It filters `p.expires_at > now()` and `o.creation_id = p_creation_id`, and joins `public.creations_public`.
- It has `revoke all on function public.mfw_creation_ownership(uuid) from public, anon, authenticated` and
  `grant execute on function public.mfw_creation_ownership(uuid) to service_role`. There is no other `grant`. Nothing matches `to anon` / `to authenticated` with
  `grant`.
- It does not contain `create table`, `alter table`, `create policy`, `drop `, `*`, `report_count`, `moderation_status` or `coord`. It ends with `notify pgrst, 'reload schema'`.
- The RPC path constant equals `"rpc/" + "mfw_creation_ownership"`.

**`src/services/api/inMemoryCreationRepository.test.ts`** (add "readOwnership"): a private creation → `{ ownerTokenHash, privateWish }` equal to the inserted values.
A public creation → `privateWish: null`. An unknown uuid → null. Once the injected clock passes `expiresAt` → null. Status `hidden` via `setModeration` → still returned
(D4 / Open question 3). An uppercase or non-uuid id → rejects `CreationRepositoryError` `invalid_input` / `creationId`. Mutating the returned `privateWish`
object (cast) does not change a second read.

**`src/services/api/supabaseCreationRepository.test.ts`** (add "readOwnership", with the file's existing `fetchMock` style):
- The request goes to `…/rest/v1/rpc/mfw_creation_ownership` with `POST`. The body text equals `JSON.stringify({ p_creation_id: id })` exactly, with no hash and no token.
  The headers are the usual service-role headers.
- `[]` → null. `[{ owner_token_hash: OWNER_HASH_FIXTURE, private_wish_text: PRIVATE_CIPHERTEXT_FIXTURE, private_wish_key_id: KEY_ID_FIXTURE }]` → the record.
  `[{ owner_token_hash: OWNER_HASH_FIXTURE, private_wish_text: null, private_wish_key_id: null }]` → `privateWish: null`.
- Each of these → rejects `invalid_backend_response` / `ownership`: two rows, a non-array, a malformed hash, a ciphertext without a key id, a key id without a ciphertext,
  a ciphertext not matching the pattern, a missing key.
- A non-2xx → `backend_request_failed`, and the body is not read (as the existing tests do). A non-uuid id → rejects before `fetch` is called.

**`src/services/api/requestBody.test.ts`** (new): a small body → its text. No body (`new Request(url, { method: "POST" })`) → `""`. Exactly `maxBytes` → ok;
`maxBytes + 1` → `too_large`. A stream that yields many chunks past the cap stops reading (count the pulls of a custom `ReadableStream`: no pull after the cap).
Invalid UTF-8 bytes (`new Uint8Array([0xff])`) → `unreadable`. A stream that errors → `unreadable`. Thai text round-trips.

**`src/services/api/ownerWishReveal.test.ts`** (new). Setup: `seedOwnerWishRepository()`,
`deps = { getRepository: () => repo, getWishReader: vi.fn(async () => reader), isProduction: false }`, and
`post = (body, init?) => handleOwnerWishReveal(makeOwnerWishRequest(body, init), deps)`.
- **AC2** "the owner reads their private wish": `{ creationId: privateId, ownerToken: OWNER_TOKEN_FIXTURE }` → 200, `Cache-Control` contains `no-store`, body
  `{ wishText: SECRET_WISH_FIXTURE }`, and the keys are exactly `["wishText"]`. Keys in reverse order → same result.
- **AC2** "hash compared server-side": a `readOwnership` spy receives exactly `[privateId]` (no token, no hash). `JSON.stringify` of all spy args contains neither
  `OWNER_TOKEN_FIXTURE` nor `ownerHash`.
- **AC3** "uniform not-revealed" — each case returns status 200 and a body text **equal** to `'{"wishText":null}'`, and does not contain `SECRET_WISH_FIXTURE`:
  (a) `OTHER_OWNER_TOKEN_FIXTURE` on `privateId`; (b) an unknown uuid with the owner token; (c) the owner token on `publicId`; (d) `privateId` after `setNow` passes
  the expiry; (e) a creation whose `privateWish.keyId` is `"unknown-key"` (insert it with a wish encrypted by a second cipher); (f) a creation with a tampered
  ciphertext (flip one base64url char of the body part, keep the pattern); (g) a `supabase`-labelled repo (`{ ...repo, backend: "supabase" }`) whose row has key id
  `ephemeral`, read through a reader from `createPrivateWishReaderFromEnv({ PRIVATE_WISH_KEY: …, PRIVATE_WISH_KEY_ID: "k2026b" }, "supabase", …)`.
  For (a) and (b), `reader.decrypt` (spy) is **not** called.
- **AC3** "malformed requests never reach the repository" (`readOwnership` and `getWishReader` spies not called): no `ownerToken` → 400 `invalid_body`.
  `ownerToken: "not-a-valid-token"` → 400, and the text does not contain `not-a-valid`. The owner **hash** sent as `ownerToken` → 400. An extra key (`ownerTokenHash`,
  `zoneId`, `__proto__` via raw body `{"__proto__":{},"creationId":…,"ownerToken":…}`) → 400. An uppercase uuid → 400. `creationId: 1` → 400. An array body → 400.
  Invalid JSON → 400. `query: "?ownerToken=" + OWNER_TOKEN_FIXTURE` → 400 `unexpected_query` even with a valid body. `query: "?x=1"` → 400 `unexpected_query`.
  `text/plain` → 415. `content-length: 513` → 413. A real body of 513 bytes without the header (raw body padded) → 413. The response text never contains
  `OWNER_TOKEN_FIXTURE`.
- "503 without details": `getRepository` throws `CreationRepositoryError("backend_misconfigured", "SUPABASE_URL")` → 503 `{ error: "unavailable" }`.
  `isProduction: true` with the memory repo → 503, and neither `readOwnership` nor `getWishReader` is called. `getWishReader` rejects
  `PrivateWishKeyError("missing")` → 503, and `readOwnership` is **not** called (keyring before row). `readOwnership` rejects with an error whose message contains
  `ownerHash` → 503, and the text does not contain it. The same 503 body comes for the owner token and for another token (no row-dependent 503).
- "no logging": spies on `console.log/info/warn/error/debug` are never called across all cases above.

**`src/app/api/private-wish/route.test.ts`** (new; `// @vitest-environment node`; copy the `beforeEach` of `src/app/api/creations/route.post.test.ts`: `vi.resetModules()`,
stub `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PRIVATE_WISH_KEY`, `PRIVATE_WISH_KEY_ID`, `PRIVATE_WISH_RETIRED_KEYS`, `VERCEL_ENV` to `""`, and fake `Date` at
`CREATE_NOW_MS`). In each test, import **both** routes after the reset (`await import("@/app/api/creations/route")`, `await import("./route")`), so they share
one module registry:
- "the owner reads back a private wish through the real routes": create with
  `makeCreateBody({ wishVisibility: "private", wishText: SECRET_WISH_FIXTURE })` → 201. Reveal with `{ creationId, ownerToken: OWNER_TOKEN_FIXTURE }` → 200
  `{ wishText: SECRET_WISH_FIXTURE }` (ephemeral key, memory backend).
- "another device gets null": the same creation with `OTHER_OWNER_TOKEN_FIXTURE` → `'{"wishText":null}'`.
- "GET never carries it": `GET /api/creations?event=loy_krathong&zone=<zoneId>` text does not contain `SECRET_WISH_FIXTURE`.
- "refuses memory in production": `VERCEL_ENV=production` → 503.
- "exports only POST": `Object.keys(await import("./route"))` equals `["POST"]`.

**`src/services/api/ownerWishClient.test.ts`** (new; jsdom): inject `fetch: vi.fn(async () => Response.json({ wishText: "x" }))` and
`readOwnerToken: () => OWNER_TOKEN_FIXTURE`.
- The request goes to exactly `OWNER_WISH_REVEAL_PATH`, and the URL contains no `?` and no token. init: `method "POST"`, `Content-Type: application/json`,
  `credentials "omit"`, `redirect "error"`, `cache "no-store"`, `referrerPolicy "no-referrer"`, and a `signal`. The body parses to exactly
  `{ creationId, ownerToken: OWNER_TOKEN_FIXTURE }`.
- `{ wishText: "x" }` → `{ kind: "revealed", wishText: "x" }`. `{ wishText: null }` → none. `{ wishText: "" }`, `{ wishText: 1 }`, `{ wishText: "x", extra: 1 }`, `[]` → failed.
  Status 503 / 400 → failed. `fetch` rejects → failed. With fake timers, a fetch that never resolves until aborted → failed after `OWNER_WISH_REVEAL_TIMEOUT_MS`.
- `readOwnerToken` → null → none, and `fetch` is not called. `readOwnerToken` throws → failed, and `fetch` is not called. `creationId ""` → failed, and `fetch` is not called.
- Default `readOwnerToken` uses `read()`, not `getOrCreate()`: with `localStorage` cleared, `createOwnerWishRevealer({ fetch }).reveal(id)` → none, `fetch` is not called,
  and `localStorage.getItem(DEVICE_OWNER_TOKEN_STORAGE_KEY)` is still null (the reveal never creates a token).
- `console` spies are never called. Two reveals send two requests (no caching).

**`src/components/ui/PrivateWishReveal.test.tsx`** (new; fake revealer with a deferred promise):
- Idle shows the heading, the note and the button `OWNER_WISH_COPY.reveal`. A click → the revealer is called once with the id, and a disabled `revealing` button appears.
  A second click while loading does not call again.
- Resolve `revealed` → the text is shown. With `"<b>x</b><img src=x onerror=alert(1)>"` it is text: `container.querySelector("b, img")` is null.
  Tap `hide` → the text is gone from `container.textContent` and the reveal button is back.
- Resolve `none` → `copy.none` in the live region, and no retry button. Resolve `failed` → `copy.failed` + a `retry` button. Retry calls the revealer again.
- "keeps the text out of stores": after reveal, `JSON.stringify` of `useBuilderStore.getState()`, `useWorldStore.getState()`, `useUIStore.getState()` and
  `useDeviceStore.getState()` does not contain the text, and `localStorage` / `sessionStorage` do not either.
- Unmount while loading, then resolve → no error and no `act` warning (spy `console.error`).
- `data-owner-wish-state` takes the values `idle` → `loading` → `revealed`, and the attribute never contains the id or the text.

**`src/components/ui/OwnerWishSection.test.tsx`** (new): `shouldOfferOwnerWishReveal` truth table: (owned, `publicWishText` null) → true.
(owned, `"wish"`) → false. (not owned, null) → false. (not owned, `"wish"`) → false. "not owned → nothing": `render(<OwnerWishSection creation={…null wish} isOwned={() => false} revealer={fake} />)`
renders an empty container, and `fake.reveal` is not called. Owned + private → the reveal button. With the default `isOwned`, after
`registerOwnedCreationPredicate((id) => id === ID)` → the button appears; unregister in `afterEach`.

**`src/components/ui/InspectPopup.test.tsx`** (add): "AC1: no owner section by default": a `publicWishText: null` creation without `ownerSection` → no button
other than `close`, and the dialog text has no `OWNER_WISH_COPY.heading`. "renders the owner section inside the dialog": `ownerSection={<p>owner-slot</p>}` → that text
is inside `getByRole("dialog")` and comes after `INSPECT_POPUP_COPY.noPublicWish` in document order.

**`src/components/canvas3d/index.test.tsx`** (add, next to the MFW-28 inspect tests; reuse the file's `item()` / hit helpers as they are on `main`, and pass an item
with `publicWishText: null`; `afterEach` unregisters the predicate):
- "AC1: someone else's private krathong shows no reveal": tap → the dialog shows `INSPECT_POPUP_COPY.noPublicWish`, and there is no button named `OWNER_WISH_COPY.reveal`.
- "AC2: own private krathong offers the reveal": `registerOwnedCreationPredicate((id) => id === ITEM_ID)` → tap → the dialog contains the reveal button. No `fetch`
  happens before the tap on it (spy `globalThis.fetch`).
- "own public krathong shows no reveal": same predicate, `publicWishText: WISH` → no reveal button.

**`tests/unit/owner-wish-boundary.test.ts`** (new; `// @vitest-environment node`; reuse the walk helpers style of `create-creation-boundary.test.ts`):
- `src/app/api/private-wish/route.ts` exports only `POST`, with no `export default`, `export {`, `process.env`, `dynamic`, `runtime` or `revalidate`.
- Client code (`src/components`, `src/store`, `src/core`, non-api `src/app`) does not import `services/api/(ownerWishReveal|requestBody|privateWishCipher)` or
  `services/auth/ownerProof`. The barrel `src/services/api/index.ts` does not re-export `./ownerWishReveal`, `./ownerWishClient` or `./requestBody`.
- `src/services/api/ownerWishClient.ts` contains `redirect: "error"`, `credentials: "omit"` and `method: "POST"`, and contains none of `searchParams`,
  `URLSearchParams`, `OWNER_WISH_REVEAL_PATH +`, `${OWNER_WISH_REVEAL_PATH}`, `localStorage`, `sessionStorage`, `getOrCreate` or `console.` (plain substring checks;
  do not scan for a bare `?`, the file legitimately uses `?.` and `??`).
- `src/services/auth/ownerProof.ts` contains `^`, and none of `===` between hash identifiers (regex `/(presented|stored|left|right)\s*===\s*(presented|stored|left|right)/`),
  `localeCompare` or `node:crypto`.
- `PrivateWishReveal.tsx`, `OwnerWishSection.tsx`, `ownerWish.config.ts`, `ownedCreationHint.ts` and `ownerWishClient.ts` import no `three`, `@react-three/*`, `@react-spring/*`,
  `@/components/canvas3d*` or `@/components/models/*`. They contain no `dangerouslySetInnerHTML`, no `animate-` and no `transition`.
- `"PRIVATE_WISH_RETIRED_KEYS"` occurs in non-test `src` only in `src/config/privateWish.config.ts`, and `NEXT_PUBLIC_PRIVATE_WISH` nowhere.
- **AC1: no identity fields**: neither `PUBLIC_CREATION_KEYS` nor `Object.keys(pickInspectedCreation({ id, appearance, publicWishText: "w" }))` contains a key matching
  `/name|nick|profile|author|owner|device|token|hash/i`, and the latter equals `["id", "appearance", "publicWishText"]`.
- Positive controls for each regex (as the other boundary tests do).

**e2e — `tests/e2e/owner-wish-api.spec.ts`** (new; `request` fixture only; reuse `e2eCreateBody` / `e2eOwnerToken` and the `closedNote` idea from
`create-creation-api.spec.ts`: if create returns 409, annotate and return):
1. "the owner reads a private wish, others get null": token A, create with `wishVisibility: "private", wishText: "ความลับ e2e " + Date.now()` → 201.
   `POST /api/private-wish` `{ creationId, ownerToken: A }` → 200 `{ wishText }` equal to the wish, and `cache-control` contains `no-store`. Token B → text equal to
   `'{"wishText":null}'`. Unknown uuid `00000000-0000-4000-8000-000000000000` with A → the same text. `GET /api/creations?event=loy_krathong&zone=<zoneId>` text
   does not contain the wish.
2. "a public krathong reveals nothing": create public with token A → reveal with A → `{ wishText: null }`.
3. "refuses unsafe or malformed requests": `?ownerToken=<A>` → 400 `{ error: "unexpected_query" }`. `text/plain` → 415. `{ creationId: "nope", ownerToken: A }` → 400, and the
   text does not contain A. `GET /api/private-wish` → 405.
Run with `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell pnpm e2e` in this container. No UI e2e: no existing e2e can tap a 3D river krathong (MFW-28's
only taps water), and the UI path is covered by the component tests above (D12).

## Do NOT

- Do not build MFW-30's LocalStorage creation-id list, the "ค้นหาของฉัน" drawer, fly-to or highlight. Do not edit MFW-30 files if they exist (Step 18 only adds a registration
  module). Do not build the 2D fallback (MFW-33), instancing (MFW-34) or release changes (MFW-23).
- Do not add an endpoint that lists creations by token or hash (owner decision 12). Do not add an "is this mine?" endpoint. Do not return any field other than
  `wishText`. Do not use different status codes or bodies for not-found / not-owner / public / expired / undecryptable.
- Never put the token, its hash or the creation id + token in a URL, query string, header, cookie, `data-*` attribute, store, LocalStorage key, log or error message.
  The client never calls `getOrCreate()` for a reveal. Never cache the revealed text (no store, no module variable, no storage).
- Never compare hashes with `===`, `localeCompare` or `Buffer.compare`. Never compare in SQL. Never import `node:crypto` in `src/services/auth/**` or `privateWishCipher.ts`.
- Never accept the `ephemeral` key id outside the memory backend. Never fall back to the ephemeral key when a key env is set or half-set. Never use a retired key to encrypt.
- Do not edit earlier migrations (`20261124000000_*`, `20261124010000_*`, `20261124020000_*`). Do not apply any migration, run the Supabase CLI or connect to any database.
  No `select *`, `returning *`, `"*"` literals or row spreading into a response.
- Do not change `InspectPopup`'s existing behaviour, copy or report flow, and do not import `@/services/auth` into the files listed in `tests/unit/inspect-boundary.test.ts`.
- Do not add 3D objects, hooks, `useFrame` work or numbers to `src/components/canvas3d/index.tsx` beyond Step 17d. Never put a dashed `data-*` prop on an R3F/three element.
- No new dependencies (no `@supabase/supabase-js`, `server-only`, `zod`, crypto libraries); no `package.json` / lockfile change.
- Do not touch `.claude/**`, `scripts/**`, `.github/**`, `CLAUDE.md`, `AGENTS.md`, `docs/**` (including `open-questions.md`, `follow-ups.md`, `backlog*.json`, plans,
  prompts), `vitest.config.mts`, `playwright.config.ts`, `eslint.config.mjs`, `tsconfig.json`, `next.config.ts`, `src/core/**`, `src/store/**`,
  `src/services/moderation/**`, `src/services/auth/deviceOwnerToken.ts`, `src/services/auth/ownerTokenHash.ts`, `src/services/auth/index.ts`, `createCreation.ts`,
  `reportHandler.ts`, `listCreations.ts`, or existing tests beyond the additions and stubs listed above.

## Definition of done

- Run each separately and get green: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm e2e`. In this cloud container run e2e as
  `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell pnpm e2e`. No Supabase, `PRIVATE_WISH_*` or `VERCEL_ENV` variables in your shell.
- `pnpm build` lists `ƒ /api/private-wish`.
- Delete `playwright-report/` and `test-results/` before committing. Never commit `.next/` or `*.tsbuildinfo`. If `next dev` rewrote `AGENTS.md`, leave it.
- Branch `feat/MFW-31-anonymous-wish-reader-owner-private` from the latest `main`.
- Conventional commit(s) with the key, e.g. `feat(privacy): owner proof and private wish reveal MFW-31`. PR title = the commit subject.
- English PR body: link to MFW-31; each AC as a checklist item with the file/test proving it; Decisions D1–D12; Open questions 1–5 with the shipped defaults;
  test plan (five commands and their results); any difference from this spec. **Owner setup steps:** (1) apply
  `20261125000000_mfw31_creation_ownership_read.sql` on staging after the MFW-12, MFW-13 and MFW-45 migrations (OQ 17), and check that with the anon key
  `rpc/mfw_creation_ownership` is denied. With the service-role key it returns `[]` for an unknown id. (2) When rotating `PRIVATE_WISH_KEY`, move the old
  `id:key` into the server-only `PRIVATE_WISH_RETIRED_KEYS`. **Follow-ups:** MFW-30 registers its list with `registerOwnedCreationPredicate` (unless Step 18 did it).
  The other handlers could adopt `readRequestTextWithLimit`. Rate limiting (Open question 1).
- Leave the PR open. Label `privacy` plus a migration → the owner merges after reviewer + qa + privacy-auditor + r3f-perf-reviewer pass.

## Interfaces this card provides

| Export | Path | Signature | Used by |
|---|---|---|---|
| `POST /api/private-wish` | `src/app/api/private-wish/route.ts` | body `OwnerWishRevealRequestBody` (JSON, no query string) → 200 `{ wishText: string \| null }` (uniform) · 400 `{ error: "invalid_body" \| "unexpected_query" }` · 413 · 415 · 503 `{ error: "unavailable" }`; `Cache-Control: no-store` | MFW-30 drawer (through `PrivateWishReveal`), MFW-33 2D view, Christmas |
| `OWNER_WISH_REVEAL_PATH`, `OWNER_WISH_REVEAL_BODY_KEYS`, `OwnerWishRevealRequestBody`, `OwnerWishRevealResponseBody`, `OwnerWishRevealErrorBody` | `@/services/api` (client-safe barrel) / `@/services/api/ownerWishRevealTypes` | Step 13 | clients |
| `createOwnerWishRevealer(deps?)`, `getOwnerWishRevealer()`, `OwnerWishRevealer.reveal(id): Promise<OwnerWishRevealOutcome>`, `parseOwnerWishRevealResponse`, `OwnerWishRevealOutcome` | `@/services/api/ownerWishClient` (client; import by path) | Step 16 | MFW-30, MFW-33 |
| `PrivateWishReveal({ creationId, revealer? })` | `@/components/ui/PrivateWishReveal` | Step 17a; DOM only, no three | **MFW-30** (drawer entry), MFW-33 (2D inspect) |
| `OwnerWishSection({ creation, isOwned?, revealer? })`, `shouldOfferOwnerWishReveal(creation, isOwned?)` | `@/components/ui/OwnerWishSection` | Step 17b | MFW-33 (2D popup) |
| `InspectPopupProps.ownerSection?: ReactNode` | `@/components/ui/InspectPopup` | Step 17c | MFW-33 |
| `registerOwnedCreationPredicate(p): () => void`, `isOwnedCreation(id): boolean`, `OwnedCreationPredicate` | `@/services/auth/ownedCreationHint` (client; import by path) | Step 3 | **MFW-30** must call `registerOwnedCreationPredicate` with its LocalStorage id list |
| `ownerTokenHashesMatch(presented, stored \| null): boolean` | `@/services/auth/ownerProof` (server; by path) | Step 2 | any future ownership endpoint (edit/delete) |
| `CreationRepository.readOwnership(id): Promise<CreationOwnershipRecord \| null>`, `CreationOwnershipRecord` | `@/services/api/creationRepository`, `@/services/api/creationTypes` | Step 8 | future owner endpoints |
| `PrivateWishCipher.decrypt`, `PrivateWishReader`, `createPrivateWishReaderFromEnv`, `getPrivateWishReader`, `readRetiredPrivateWishKeysEnv`, `RetiredPrivateWishKey(s)Result` | `@/services/api/privateWishCipher` (server) | Step 5 | owner endpoints |
| `readRequestTextWithLimit(request, maxBytes)` | `@/services/api/requestBody` (server) | Step 11 | other handlers (follow-up) |
| `handleOwnerWishReveal`, `OwnerWishRevealDeps`, `getDefaultOwnerWishRevealDeps`, `parseOwnerWishRevealRequest` | `@/services/api/ownerWishReveal` (server) | Step 14 | route; tests |
| Config: `OWNER_WISH_REVEAL_REQUEST_MAX_BYTES`, `OWNER_WISH_REVEAL_TIMEOUT_MS`, `OWNER_WISH_COPY`, `PRIVATE_WISH_RETIRED_KEYS_*`, `CREATION_OWNERSHIP_RPC_PATH`, `OWNER_TOKEN_HASH_HEX_LENGTH`, `OWNER_TOKEN_HASH_COMPARE_PLACEHOLDER` | `src/config/*` | Steps 1, 4, 6, 12 | — |
| DB: `public.mfw_creation_ownership(uuid)` | `supabase/migrations/20261125000000_mfw31_creation_ownership_read.sql` | Step 7; service_role only | Supabase repository |
| Fixtures: `OTHER_OWNER_TOKEN_FIXTURE`, `SECRET_WISH_FIXTURE`, `makeOwnerWishRequest`, `seedOwnerWishRepository` | `@/services/api/__fixtures__/ownerWish` | Tests section | later owner-endpoint tests |

## Open questions

These are product decisions only. The card ships the default listed under each one, and each can change later without rework.

1. **Rate limiting / abuse of `POST /api/private-wish`.** Guessing is infeasible (256-bit tokens, uniform answers), so the only risk is load. Default: no rate
   limit for the private test, the same as MFW-45 / MFW-13 (`docs/follow-ups.md`). Options: (a) default; (b) Vercel firewall rate-limit rules before
   Christmas; (c) a per-IP cap in the route (needs an owner number).
2. **Where can an owner reveal?** Default: only in the popup of a krathong that has no public wish **and** that this device lists as its own (MFW-30's
   list), plus MFW-30's drawer through `PrivateWishReveal`. Until MFW-30 registers its list, the popup never shows the reveal. Options: (a) default; (b) offer
   "ถ้าเป็นกระทงของคุณ…" on every private krathong. That needs no list, but it sends the device token for other people's krathongs (a privacy-posture
   change) and shows a "not found" answer to everyone else.
3. **Can an owner still read the private wish of their own creation after moderation hid or flagged it?** Default: yes. The owner read ignores moderation
   status, since only the owner sees it, and private wishes cannot be reported today because reports need a public wish. Option: return null for hidden/flagged
   creations too (one extra filter in SQL and in memory).
4. **Thai copy** of `OWNER_WISH_COPY` (heading, note, button, "not found" and failure texts) is a DRAFT for owner review. In particular, "none" deliberately does
   not say "this is not your krathong" (D2).
5. **Reveal persistence.** Default: the wish is fetched on every tap of "อ่านคำอธิษฐานส่วนตัว", shown until "ซ่อนข้อความ" or the popup closes, and never cached on the
   device. Options: auto-reveal when the owner opens their popup; cache for the session.

## Decisions

- **D1 — `POST /api/private-wish`, token in the JSON body only, exact two keys, any query string rejected (400 `unexpected_query`).** This is the same transport as
  `POST /api/creations` (row 1 allows body or `Authorization`; one channel keeps tests and audit simple). Rejecting a query string makes "never in a URL"
  visible instead of silently ignored, which was the MFW-45 follow-up. The JSON content type forces a CORS preflight. No cookies exist.
- **D2 — Uniform answers.** Every well-formed request that does not end in a decrypted wish gets 200 `{"wishText":null}`, byte-identical. That covers unknown, expired,
  not-yours, public-wish, unknown-key and tampered cases. A 503 comes only from conditions that do not depend on the row: repository config, production-memory,
  keyring env. The keyring loads **before** the row read, and a hash compare runs even without a row (against the placeholder). So neither status nor body is an
  existence or ownership oracle. Decryption runs only after a match. Its timing tells only the token holder that they own it, which they already know. Ids are
  public anyway (`GET /api/creations`).
- **D3 — Constant-time compare in pure TS (`ownerProof.ts`): an XOR over exactly 64 chars, no early exit, both sides validated.** `node:crypto.timingSafeEqual` cannot
  live in the isomorphic `@/services/auth` barrel, and a SQL `=` is not constant time. Row 1 asks for a constant-time compare on the server.
- **D4 — A new service_role-only SQL function `mfw_creation_ownership(uuid)` returns the hash + ciphertext + key id of one non-expired creation.** It ignores moderation
  status, since this is not a public read (Open question 3). The hash is compared in the app, not in SQL. The function lives in a new migration, and earlier ones are untouched.
- **D5 — The keyring is the current key plus `PRIVATE_WISH_RETIRED_KEYS` (`id:base64,…`, at most 8).** MFW-45 delegated it here. Row 2 promises rotation, and without old keys
  an owner's wish would silently become unreadable. Any malformed entry fails closed (503 for every request). The `ephemeral` id is never looked up outside the
  memory backend.
- **D6 — `PrivateWishCipher.decrypt` (own key only)** gives the memory backend's reader the per-process ephemeral key without exporting a `CryptoKey`. The lead
  verified that both routes share one module instance in `next start`.
- **D7 — `readRequestTextWithLimit` streams the body and stops past 512 bytes.** This fixes the "cap after a chunked body is read" follow-up for this route. Invalid
  UTF-8 → 400. The other handlers are not refactored (follow-up).
- **D8 — Client: `vault.read()` (never creates a token), `credentials: "omit"`, `redirect: "error"`, `referrerPolicy: "no-referrer"`, 10 s timeout, no caching.** A
  redirect would re-send the token-carrying body. `"omit"` is MFW-28's follow-up. No token → "none" without a request.
- **D9 — UI through a slot.** `InspectPopup` gains `ownerSection` and stays auth-free (MFW-28 boundary). `OwnerWishSection` decides with the device-local
  `ownedCreationHint` registry, which MFW-30 fills (owner decision 12). The reveal is offered only for owned krathongs with `publicWishText === null`, because every
  creation has exactly one wish. The text lives only in component state.
- **D10 — Production + memory backend → 503**, as MFW-45 D7. A misconfigured production fails visibly instead of answering "nothing found".
- **D11 — Handler logic in `src/services/api/ownerWishReveal.ts`; `route.ts` only delegates.** The module and endpoint names avoid the words
  `tests/unit/public-private-boundary.test.ts` forbids in `src/app/api`.
- **D12 — API-level e2e plus component tests, no 3D-tap e2e.** No existing e2e can tap a river krathong reliably (MFW-28 taps only water). The privacy
  property lives on the server and is proven against the production build.

## Out of scope

The LocalStorage creation-id list, drawer, fly-to and highlight (MFW-30); the 2D fallback renderer and its popup (MFW-33); instancing (MFW-34); release changes
(MFW-23); editing or deleting a creation; any "my creations" server query (owner decision 12 forbids it); re-encrypting old rows after rotation; rate limiting (Open
question 1); refactoring other handlers to the streaming body cap; applying the migration and setting up staging (OQ 17).

## Risks

- **The SQL was not run against a database in planning.** It reuses the constructs of the MFW-45 functions (`returns table`, `language sql stable security invoker`,
  `set search_path = ''`, qualified columns). The owner should apply it on staging and check: anon key → `permission denied`; service-role key → `[]` for an unknown id
  and one row for a real one.
- **PostgREST shape assumed:** a `returns table` function returns a JSON array of objects (`[]` / `[row]`). Covered by fetch-mock tests only.
- **Vercel previews:** route handlers may run in separate function instances. Then `/api/private-wish` may not see an in-memory krathong written by `/api/creations`,
  and answers null. `next start` (CI e2e) shares one instance (lead probe). Production uses Supabase, so this does not apply there.
- **Rotation discipline:** if the owner rotates `PRIVATE_WISH_KEY` without moving the old key into `PRIVATE_WISH_RETIRED_KEYS`, old private wishes become unreadable (uniform
  null; nothing leaks). Listed in the owner setup steps.
- **HTTPS is the platform's job:** the client uses a relative URL on the page's origin. Vercel serves HTTPS with HSTS on `*.vercel.app`. A custom domain must keep the
  HTTPS redirect and HSTS on, or a first plain-HTTP POST could carry the token.
- **The UI reveal is unreachable until MFW-30 registers its list** (default predicate owns nothing). The endpoint and the components are complete. The PR says so.
- **Merge conflicts** in `src/components/canvas3d/index.tsx` with MFW-23 / MFW-30 / MFW-34 (all touch it). This card's change there is one import and one prop.
- **Interface growth:** `readOwnership` breaks typed test doubles. Typecheck finds them, and only stubs are added. MFW-23/30/34 branches may add more doubles. Rebase, then stub them.
- **Reviewer grep noise:** the snake_case names in `supabaseCreationRepository.ts` and the migration, and `ownerToken` in request types, client and tests, belong to the
  ownership path and are expected.
