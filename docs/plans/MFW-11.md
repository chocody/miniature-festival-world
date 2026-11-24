# MFW-11 [2.1] Client-side anonymous ownership token (DeviceOwnerToken) — implementation spec

Labels: `privacy`, `auth` · Epic MFW-10 (Loop 2) · Branch `feat/MFW-11-client-side-anonymous-ownership-token`
Reviewers on top of lead/dev/reviewer/qa: **privacy-auditor** (diff touches `src/services/**`, label `privacy`).
This card is labelled `privacy`: the PR stays open and the **owner merges it**.

## Summary

This card gives each device an anonymous identity without accounts. It adds a 256-bit random DeviceOwnerToken,
generated in the browser with `crypto.getRandomValues` and kept in LocalStorage. It also adds the SHA-256 hash
function that the server will use to store and compare the token (MFW-12 / story 2.4 / MFW-31 call it; this card
writes no server code). The UI gets a short static notice that clearing browser data or changing device loses
access to your own creations. No API route, database, creation-id list or "My Creations" UI is built here. The
first app code that calls the vault is the release/save flow in story 5.1 (MFW-23).

## Prerequisites

| Card | State | What this card uses |
|---|---|---|
| MFW-7 [1.1] Flow state machine & event selector | merged on `main` | `FlowRoot` (`src/components/ui/FlowRoot.tsx`), `useUIStore().flowState`, flow state `"WRITE_WISH"` from `src/core/flow/flowStateMachine.ts` |
| MFW-2/3/4 (scaffold, CLAUDE.md, CI) | merged | `src/services/auth/index.ts` (currently `export {};`), vitest jsdom env (`vitest.config.mts`), `tests/unit/structure.test.ts` |

No unmerged prerequisite, so there is no ASSUMED INTERFACE.

Facts checked in this repo (2026-11-24):
- Node 22.23 and the vitest jsdom env both provide `globalThis.crypto.getRandomValues`, `crypto.subtle.digest`,
  `TextEncoder`, `btoa` and `window.localStorage` (a probe test confirmed this; SHA-256("abc") =
  `ba7816bf…15ad`).
- The `server-only` package is **not** installed. Do not add it (see Decisions D5).
- The scaffold has an empty barrel `src/services/auth/index.ts` ("Anonymous Ownership Token Generator & Local Vault").

## Acceptance criteria → checks

AC (verbatim from `docs/backlog.json`, story 2.1):

1. **"Cryptographically secure random token stored in LocalStorage; the server stores only its SHA-256 hash (the raw
   token goes only over HTTPS to the ownership endpoints and is never stored or logged — open question 1)"**
   - Generation uses only `crypto.getRandomValues` with `DEVICE_OWNER_TOKEN_BYTES` (32) bytes and never
     `Math.random`. Test: `src/services/auth/deviceOwnerToken.test.ts` → "generate: uses crypto.getRandomValues
     with 32 bytes", "generate: never calls Math.random", "generate: throws when no secure random source".
   - The token is persisted under `DEVICE_OWNER_TOKEN_STORAGE_KEY` and read back after a "reload" (new vault on the
     same storage). Test: `deviceOwnerToken.test.ts` → the "vault persistence" cases, including real jsdom
     `window.localStorage`.
   - `hashOwnerToken` gives lowercase-hex SHA-256 of the token's UTF-8 bytes, which is what the server stores.
     Test: `src/services/auth/ownerTokenHash.test.ts` (node env) → known vector + cross-check against `node:crypto`.
   - "Never logged": `src/services/auth/**` non-test files contain no `console.` calls. Error messages never contain
     the input value. Tests: `tests/unit/owner-token-boundary.test.ts` → "no console calls in src/services/auth";
     `ownerTokenHash.test.ts` → "error message does not echo the input".
   - The server never creates or holds a device token: nothing under `src/app/api/**` imports `deviceOwnerToken`,
     and `getDeviceOwnerVault()` throws when `window` is undefined. Tests: `owner-token-boundary.test.ts` →
     "src/app/api does not import the device vault"; `src/services/auth/deviceOwnerToken.node.test.ts` →
     "getDeviceOwnerVault throws on the server".
   - "Server stores only hash" and "raw token only over HTTPS in POST body / Authorization header" cannot be
     exercised yet because no server route exists. This card provides `hashOwnerToken` + `isOwnerTokenHash` for
     MFW-12 / 2.4 / MFW-31, documents the transport rule in TSDoc, and lists it under Do NOT. The server side is
     verified in those cards.
2. **"UI warns that clearing browser data or changing device loses access to own creations"**
   - `OwnershipNotice` renders the spec's Thai sentence (loop-2 Task 2.1) in an element with `role="note"`.
     Test: `src/components/ui/OwnershipNotice.test.tsx`.
   - `FlowRoot` shows the notice in the `WRITE_WISH` step and in no other step. Tests:
     `src/components/ui/FlowRoot.test.tsx` → "shows the ownership notice only in WRITE_WISH";
     `tests/e2e/flow.spec.ts` → the notice is visible at WRITE_WISH and gone at RITUAL_RELEASE.
3. **"Unit tests for generation, persistence, hashing"**
   - Generation, persistence: `src/services/auth/deviceOwnerToken.test.ts` (+ `.node.test.ts`).
   - Hashing: `src/services/auth/ownerTokenHash.test.ts`. All cases are listed under Tests.

## Owner decisions that apply

Quoted from `docs/spec/open-questions.md`. Do not reopen them.

- **Row 1:** "the device keeps the raw DeviceOwnerToken in LocalStorage; the server stores only SHA-256(token). To
  prove ownership the device sends the raw token over HTTPS to the ownership-proof endpoint (POST body or
  Authorization header, never a URL or query string), which hashes it and compares with the stored hash in constant
  time; the raw token is never stored or logged server-side (owner, 2026-11-23)".
  → The client never hashes and never sends a hash. `hashOwnerToken` is for server code only (TSDoc says so).
- **Row 12:** "creation ids are kept in LocalStorage next to the token (no server query by owner); private text is
  still read only with ownership proof (row 1) (owner, 2026-11-23)". → That list is built in **MFW-30**, not
  here. This card only reserves the `mfw:` key prefix (see D3).
- **Launch plan (owner, 2026-11-23):** build engine pieces generically. → The vault and hash know nothing about
  Loy Krathong, so Christmas reuses them unchanged.

None of the rows names MFW-11 as a technical "Decide in" that is still open (row 12 is already decided), so
`docs/spec/open-questions.md` is **not** edited.

## Files

| Path | New/modify | Purpose |
|---|---|---|
| `src/config/ownership.config.ts` | new | Token byte length, storage key, token/hash format patterns |
| `src/services/auth/deviceOwnerToken.ts` | new | Client-only: generate, validate, LocalStorage vault |
| `src/services/auth/ownerTokenHash.ts` | new | SHA-256 hashing of a token (Web Crypto) + hash format check, for server use |
| `src/services/auth/index.ts` | modify | Barrel re-exports (replace `export {};`) |
| `src/components/ui/OwnershipNotice.tsx` | new | Static warning notice (Thai copy from spec) |
| `src/components/ui/FlowRoot.tsx` | modify | Render `<OwnershipNotice />` in the `WRITE_WISH` step |
| `src/services/auth/deviceOwnerToken.test.ts` | new | Generation + persistence tests (jsdom) |
| `src/services/auth/deviceOwnerToken.node.test.ts` | new | Server-side guard test (node env) |
| `src/services/auth/ownerTokenHash.test.ts` | new | Hashing tests (node env) |
| `src/components/ui/OwnershipNotice.test.tsx` | new | Notice render test |
| `src/components/ui/FlowRoot.test.tsx` | modify | Add one test case (do not change existing cases) |
| `tests/unit/owner-token-boundary.test.ts` | new | Static checks: key literal location, no console, no vault import in API |
| `tests/e2e/flow.spec.ts` | modify | Add notice assertions to the existing walk-through test |

## Implementation steps

### Step 1 — `src/config/ownership.config.ts` (new)

```ts
/**
 * DeviceOwnerToken settings (spec §6.2 Task 2.1, open question 1).
 * Token = DEVICE_OWNER_TOKEN_BYTES random bytes, base64url without padding.
 */

/** 32 bytes = 256 bits of entropy from crypto.getRandomValues. */
export const DEVICE_OWNER_TOKEN_BYTES = 32;

/** base64url (no padding) length of DEVICE_OWNER_TOKEN_BYTES bytes: ceil(32 * 8 / 6) = 43. */
export const DEVICE_OWNER_TOKEN_LENGTH = 43;

/**
 * Canonical base64url of exactly 32 bytes: 42 free chars + a last char whose 2 low bits are 0.
 * Hex (the hash format) can never match, because the token is 43 chars long, not 64.
 */
export const DEVICE_OWNER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;

/** LocalStorage key of the raw token. Versioned so a future format change can migrate. */
export const DEVICE_OWNER_TOKEN_STORAGE_KEY = "mfw:deviceOwnerToken:v1";

/** SHA-256 digest as lowercase hex (what the server stores as owner_token_hash). */
export const OWNER_TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/;
```

Constants and values (all technical, chosen in this card; see Decisions):

| Constant | Value | File |
|---|---|---|
| `DEVICE_OWNER_TOKEN_BYTES` | `32` | `src/config/ownership.config.ts` |
| `DEVICE_OWNER_TOKEN_LENGTH` | `43` (derived; a test asserts `Math.ceil(BYTES * 8 / 6) === LENGTH`) | same |
| `DEVICE_OWNER_TOKEN_PATTERN` | regex above | same |
| `DEVICE_OWNER_TOKEN_STORAGE_KEY` | `"mfw:deviceOwnerToken:v1"` | same |
| `OWNER_TOKEN_HASH_PATTERN` | `/^[0-9a-f]{64}$/` | same |

The storage key string literal must appear **only** in this file. Everything else imports the constant
(a static test enforces this).

### Step 2 — `src/services/auth/deviceOwnerToken.ts` (new)

Client-only module. Do **not** add `"use client"` (it is not a component). Do not touch `window` at import time.

```ts
import {
  DEVICE_OWNER_TOKEN_BYTES,
  DEVICE_OWNER_TOKEN_PATTERN,
  DEVICE_OWNER_TOKEN_STORAGE_KEY,
} from "@/config/ownership.config";

/** Raw anonymous owner secret. Lives only in this device's LocalStorage; never in a URL, log or public payload. */
export type DeviceOwnerToken = string & { readonly __brand: "DeviceOwnerToken" };

/** Fills `bytes` with random values. Injected in tests; the default is crypto.getRandomValues. */
export type FillRandom = (bytes: Uint8Array) => void;

export interface DeviceOwnerTokenResult {
  token: DeviceOwnerToken;
  /** false when LocalStorage is unavailable or the write failed: the token lives only until the page unloads. */
  persisted: boolean;
}

export interface DeviceOwnerVault {
  /** Stored valid token, else the in-memory fallback token, else null. Never writes. */
  read(): DeviceOwnerToken | null;
  /** Returns the existing token or creates, persists and returns a new one. */
  getOrCreate(): DeviceOwnerTokenResult;
}

export interface DeviceOwnerVaultOptions {
  /** null = no usable LocalStorage (SSR, disabled storage, privacy mode). */
  storage: Storage | null;
  /** Token generator; defaults to generateDeviceOwnerToken. */
  generate?: () => DeviceOwnerToken;
}

export function isDeviceOwnerToken(value: unknown): value is DeviceOwnerToken;
export function generateDeviceOwnerToken(fillRandom?: FillRandom): DeviceOwnerToken;
export function getBrowserLocalStorage(): Storage | null;
export function createDeviceOwnerVault(options: DeviceOwnerVaultOptions): DeviceOwnerVault;
export function getDeviceOwnerVault(): DeviceOwnerVault;
```

Behaviour:

**`isDeviceOwnerToken(value)`**: `typeof value === "string" && DEVICE_OWNER_TOKEN_PATTERN.test(value)`.

**`generateDeviceOwnerToken(fillRandom = defaultFillRandom)`**:
1. `const bytes = new Uint8Array(DEVICE_OWNER_TOKEN_BYTES);`
2. `fillRandom(bytes);`
3. Return `toBase64Url(bytes) as DeviceOwnerToken`.

`defaultFillRandom` (module-private):
```ts
const defaultFillRandom: FillRandom = (bytes) => {
  const c = globalThis.crypto;
  if (!c || typeof c.getRandomValues !== "function") {
    throw new Error("Secure random source (crypto.getRandomValues) is unavailable");
  }
  c.getRandomValues(bytes); // call as a method: Web Crypto needs `this === crypto`
};
```
Never fall back to `Math.random`.

`toBase64Url` (module-private):
```ts
function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
```

**`getBrowserLocalStorage()`**:
```ts
export function getBrowserLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null; // the getter itself throws SecurityError when storage is blocked
  } catch {
    return null;
  }
}
```

**`createDeviceOwnerVault({ storage, generate = () => generateDeviceOwnerToken() })`**. A closure holds
`let memoryToken: DeviceOwnerToken | null = null;`, which is set **only** when persisting failed.

Private helper `readStored(): DeviceOwnerToken | null`. It returns `null` if `storage` is null. Otherwise it does
`try { const raw = storage.getItem(DEVICE_OWNER_TOKEN_STORAGE_KEY); return isDeviceOwnerToken(raw) ? raw : null; } catch { return null; }`.

`read()`: `return readStored() ?? memoryToken;`

`getOrCreate()`, in this order:
1. `const stored = readStored(); if (stored) { memoryToken = null; return { token: stored, persisted: true }; }`
2. `const token = memoryToken ?? generate();` (keep the same token across calls when an earlier write failed)
3. If `storage === null`: `memoryToken = token; return { token, persisted: false };`
4. `try { storage.setItem(DEVICE_OWNER_TOKEN_STORAGE_KEY, token); } catch { memoryToken = token; return { token, persisted: false }; }`
   (covers QuotaExceededError / SecurityError).
5. Read back with `readStored()`:
   - `=== token` → `memoryToken = null; return { token, persisted: true };`
   - another valid token (another tab won a race) → `memoryToken = null; return { token: readBack, persisted: true };`
   - `null` (storage did not keep it) → `memoryToken = token; return { token, persisted: false };`

An invalid stored value (wrong format or corrupt) counts as absent and is overwritten in step 4. This is safe
because the server will check the same `isDeviceOwnerToken` format (story 2.4), so a malformed value can never
have owned a creation.

The vault never removes the key and has no `clear()`: deleting the token is the exact loss the warning describes.

**`getDeviceOwnerVault()`**: a lazily created module singleton for app code.
```ts
let browserVault: DeviceOwnerVault | null = null;
export function getDeviceOwnerVault(): DeviceOwnerVault {
  if (typeof window === "undefined") {
    throw new Error("DeviceOwnerToken is client-only; the server must never create or hold one");
  }
  browserVault ??= createDeviceOwnerVault({ storage: getBrowserLocalStorage() });
  return browserVault;
}
```

TSDoc on the module (English) must state the transport rule: "Send the raw token only over HTTPS to the ownership
endpoints, in a POST JSON body or the Authorization header, never in a URL/query string. Never log it, never
put it in a store fed by a public endpoint, never hash it on the client."

No `console.*` anywhere in this file. No error message may contain a token or stored value.

### Step 3 — `src/services/auth/ownerTokenHash.ts` (new)

Uses Web Crypto (`globalThis.crypto.subtle`), which works in the Node 22 route-handler runtime, the Edge runtime,
browsers and vitest. No `node:crypto` import (see D5).

```ts
import { OWNER_TOKEN_HASH_PATTERN } from "@/config/ownership.config";
import { isDeviceOwnerToken, type DeviceOwnerToken } from "./deviceOwnerToken";

/** SHA-256(DeviceOwnerToken) as 64 lowercase hex chars — the only form the server stores (owner_token_hash). */
export type OwnerTokenHash = string & { readonly __brand: "OwnerTokenHash" };

/**
 * SERVER USE ONLY (open question 1): the client sends the raw token; the ownership endpoint hashes it.
 * Rejects (TypeError) when `token` is not a well-formed DeviceOwnerToken. The message never echoes the input.
 */
export async function hashOwnerToken(token: DeviceOwnerToken): Promise<OwnerTokenHash>;

export function isOwnerTokenHash(value: unknown): value is OwnerTokenHash;
```

`hashOwnerToken` algorithm:
1. `if (!isDeviceOwnerToken(token)) throw new TypeError("Invalid DeviceOwnerToken format");` (fixed message, no
   input). Since the function is `async`, this becomes a rejected promise.
2. `const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));`
3. `return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("") as OwnerTokenHash;`

`isOwnerTokenHash`: `typeof value === "string" && OWNER_TOKEN_HASH_PATTERN.test(value)`.

The constant-time comparison belongs to MFW-31 / the ownership-proof endpoint, not this card. Leave it out.

### Step 4 — `src/services/auth/index.ts` (modify)

Replace `export {};` with the following and keep the existing first-line doc comment:
```ts
/** Anonymous Ownership Token Generator & Local Vault */
export {
  createDeviceOwnerVault,
  generateDeviceOwnerToken,
  getBrowserLocalStorage,
  getDeviceOwnerVault,
  isDeviceOwnerToken,
  type DeviceOwnerToken,
  type DeviceOwnerTokenResult,
  type DeviceOwnerVault,
  type DeviceOwnerVaultOptions,
  type FillRandom,
} from "./deviceOwnerToken";
export { hashOwnerToken, isOwnerTokenHash, type OwnerTokenHash } from "./ownerTokenHash";
```

### Step 5 — `src/components/ui/OwnershipNotice.tsx` (new)

Static, with no hooks, no state and no animation (invariant F does not apply: there is nothing to animate). No
`"use client"` directive is needed. It is rendered inside the client `FlowRoot`.

```tsx
/** Spec §6.2 Task 2.1 warning, verbatim. */
export const OWNERSHIP_LOSS_WARNING =
  "การล้างข้อมูลเบราว์เซอร์หรือเปลี่ยนอุปกรณ์จะทำให้ไม่สามารถค้นคืนรายการผลงานของตัวเองได้";

/** Tells the user that their ownership lives only in this browser (DeviceOwnerToken in LocalStorage). */
export function OwnershipNotice() {
  return (
    <p
      role="note"
      data-testid="ownership-notice"
      className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
    >
      {OWNERSHIP_LOSS_WARNING}
    </p>
  );
}
```
Copy the Thai string exactly from `docs/spec/06-loops/loop-2.md` Task 2.1 (inside the curly quotes, quotes excluded).
Do not add an English translation or extra sentences (that is an Open question).

### Step 6 — `src/components/ui/FlowRoot.tsx` (modify)

- `import { OwnershipNotice } from "./OwnershipNotice";`
- In the returned JSX, directly **before** the `{flowState === "LANDING_EVENT_SELECT" ? … : …}` expression, add
  `{flowState === "WRITE_WISH" && <OwnershipNotice />}`.
- Change nothing else: no new buttons (existing tests count buttons), no store changes. Do not call the vault
  here: the token is created lazily by the first save (story 5.1), see D6.

## Tests

All run under `pnpm test`. None needs a network or database.

### `src/services/auth/deviceOwnerToken.test.ts` (jsdom, default env)

Helper in the file: `class MemoryStorage implements Storage` backed by a `Map<string, string>`
(`length`, `clear`, `getItem` → `null` when missing, `key`, `removeItem`, `setItem` → `String(value)`), plus
subclasses or `vi.spyOn` overrides for throwing cases. `afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); })`.

Generation:
1. "config: LENGTH matches BYTES": `Math.ceil(DEVICE_OWNER_TOKEN_BYTES * 8 / 6) === DEVICE_OWNER_TOKEN_LENGTH` and
   `DEVICE_OWNER_TOKEN_BYTES >= 16`.
2. "generate: format": `generateDeviceOwnerToken()` has length 43 and `isDeviceOwnerToken` → true.
3. "generate: uses crypto.getRandomValues with 32 bytes":
   `const spy = vi.spyOn(globalThis.crypto, "getRandomValues");` After one call, `spy` was called once and its first
   argument is a `Uint8Array` with `length === 32`.
4. "generate: never calls Math.random": `vi.spyOn(Math, "random")` → not called after 10 generations.
5. "generate: unique": 1000 tokens → `new Set(tokens).size === 1000`.
6. "generate: deterministic encoding": `generateDeviceOwnerToken((b) => b.fill(0))` === `"A".repeat(43)`;
   `generateDeviceOwnerToken((b) => b.fill(0xff))` === `"_".repeat(42) + "8"`;
   `generateDeviceOwnerToken((b) => b.forEach((_, i) => (b[i] = i)))` === `"AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"`.
7. "generate: throws when no secure random source":
   `vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(() => { throw new Error("x"); })` → throws.
   Also `vi.stubGlobal("crypto", undefined)` → `generateDeviceOwnerToken()` throws `/getRandomValues/`.
   Call `vi.unstubAllGlobals()` in `afterEach`.
8. "isDeviceOwnerToken rejects": `""`, `"A".repeat(42)`, `"A".repeat(44)`, `"A".repeat(42) + "B"` (non-canonical
   last char), a 43-char string containing `+`, `/` or `=`, a 64-char lowercase hex string, `null`, `undefined`,
   `123`, `{}` → all false.

Persistence (`createDeviceOwnerVault` with `MemoryStorage` unless noted):
9. "read() on empty storage returns null and writes nothing" → `storage.length === 0`.
10. "getOrCreate persists under the storage key": the result is `{ persisted: true }`,
    `storage.getItem(DEVICE_OWNER_TOKEN_STORAGE_KEY) === result.token`, and `isDeviceOwnerToken(result.token)`.
11. "getOrCreate is stable": second call returns the same token; a `generate` `vi.fn` was called once.
12. "survives a reload": `createDeviceOwnerVault({ storage })` twice on the same storage → second vault's
    `read()` and `getOrCreate().token` equal the first token; second vault's `generate` not called.
13. "uses real window.localStorage": `createDeviceOwnerVault({ storage: window.localStorage }).getOrCreate()` →
    `window.localStorage.getItem(DEVICE_OWNER_TOKEN_STORAGE_KEY)` equals the token.
14. "invalid stored value is replaced": pre-set the key to `"garbage"` → `read()` is `null`; `getOrCreate()` returns
    a valid token, `persisted: true`, and the storage now holds it.
15. "no storage → in-memory only": `createDeviceOwnerVault({ storage: null })` → `{ persisted: false }`; a second
    `getOrCreate()` returns the same token; `read()` returns it too.
16. "setItem throws (QuotaExceededError) → not persisted, same token kept": a storage whose `setItem` throws
    `new DOMException("full", "QuotaExceededError")` → `persisted: false`; the next call returns the same token and
    `generate` was called once.
17. "getItem throws (SecurityError) → handled": `getItem` throws → `getOrCreate()` does not throw.
18. "another tab won the race": a storage whose `getItem` returns `null` on its first call and then a fixed valid
    token `OTHER` (`"A".repeat(43)`) → `getOrCreate()` returns `{ token: OTHER, persisted: true }`.
19. "storage drops the write": `setItem` is a no-op (getItem always `null`) → `persisted: false`.
20. "getBrowserLocalStorage returns window.localStorage" in jsdom.
21. "getBrowserLocalStorage returns null when access throws":
    `vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new DOMException("denied", "SecurityError"); })`
    → `null`.
22. "getDeviceOwnerVault returns the same instance on repeated calls" (`toBe`).

### `src/services/auth/deviceOwnerToken.node.test.ts` (first line `// @vitest-environment node`)

1. "getDeviceOwnerVault throws on the server" → `expect(() => getDeviceOwnerVault()).toThrow(/client-only/)`.
2. "getBrowserLocalStorage returns null on the server".

### `src/services/auth/ownerTokenHash.test.ts` (first line `// @vitest-environment node`)

1. "known vector": `hashOwnerToken("A".repeat(43) as DeviceOwnerToken)` →
   `"0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a"`.
2. "second vector": `"AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"` →
   `"ea866a757e4c38babfa8127cbe9a409d3e1f93a00ff1488ff735fcf917afffd0"`.
3. "matches node:crypto for 20 generated tokens":
   `createHash("sha256").update(token, "utf8").digest("hex")` (import from `node:crypto` **in the test only**).
4. "format": the result passes `isOwnerTokenHash` and `!== token`.
5. "deterministic and distinct": same token → same hash twice; two different tokens → different hashes.
6. "rejects malformed input": `await expect(hashOwnerToken("not-a-token" as DeviceOwnerToken)).rejects.toThrow(TypeError)`;
   also for `"A".repeat(64)` and a valid hash string.
7. "error message does not echo the input": catch the rejection for input `"leak-check-SECRET-VALUE"` →
   `String(err.message)` does not contain `"SECRET"`.
8. "isOwnerTokenHash": accepts 64 lowercase hex; rejects uppercase hex, 63/65 chars, a valid token, non-strings.

### `src/components/ui/OwnershipNotice.test.tsx`

1. "renders the spec warning as a note": `render(<OwnershipNotice />)` →
   `screen.getByRole("note")` has text content exactly `OWNERSHIP_LOSS_WARNING`.
2. "copy is the spec sentence": `OWNERSHIP_LOSS_WARNING` equals the literal
   `"การล้างข้อมูลเบราว์เซอร์หรือเปลี่ยนอุปกรณ์จะทำให้ไม่สามารถค้นคืนรายการผลงานของตัวเองได้"` (duplicated literal on
   purpose so an accidental edit fails).
3. "contains no button or link" (`queryByRole("button")` and `queryByRole("link")` are null).

### `src/components/ui/FlowRoot.test.tsx` (add one case; keep the rest unchanged)

"shows the ownership notice only in WRITE_WISH": render `<FlowRoot />`. At LANDING → `queryByRole("note")` null.
Click Loy Krathong → CUSTOMIZE_OBJECT → null. Click "ถัดไป" → WRITE_WISH →
`getByRole("note")` has text `OWNERSHIP_LOSS_WARNING`. Click "ถัดไป" → RITUAL_RELEASE → null. Click "ปล่อยกระทง" →
SHARED_WORLD_EXPLORE → null. Also assert `window.localStorage.getItem(DEVICE_OWNER_TOKEN_STORAGE_KEY)` is `null` at
the end: the flow does not create a token yet (D6).

### `tests/unit/owner-token-boundary.test.ts` (first line `// @vitest-environment node`)

Copy the `walk()` helper pattern from `tests/unit/no-raw-xyz-persistence.test.ts`. Scan `src/` files with extensions
`.ts .tsx .js .mjs`, excluding `*.test.ts(x)`.
1. "storage key literal lives only in ownership.config.ts": files containing `mfw:deviceOwnerToken` →
   exactly `["src/config/ownership.config.ts"]`.
2. "no console calls in src/services/auth": no non-test file under `src/services/auth/` matches `/\bconsole\./`.
3. "src/app/api does not import the device vault": no file under `src/app/api/` (the folder may not exist yet; the
   walk then returns `[]`) matches `/deviceOwnerToken|getDeviceOwnerVault|createDeviceOwnerVault/`.
4. Self-check that the patterns detect a sample string (like the existing "scanner patterns detect" case).

### `tests/e2e/flow.spec.ts` (modify the existing "flow walks from landing to SHARED_WORLD_EXPLORE" test)

Right after `await expect(root).toHaveAttribute("data-flow-state", "WRITE_WISH");` add
`await expect(page.getByRole("note")).toHaveText(OWNERSHIP_WARNING);`. Right after the RITUAL_RELEASE state assertion,
add `await expect(page.getByRole("note")).toHaveCount(0);`. Define at the top of the file:
`const OWNERSHIP_WARNING = "การล้างข้อมูลเบราว์เซอร์หรือเปลี่ยนอุปกรณ์จะทำให้ไม่สามารถค้นคืนรายการผลงานของตัวเองได้";`
(a literal: do not import TSX from `src/` into Playwright).

Invariant tests from CLAUDE.md:
- C: no public payload exists in this card. The token never enters a store, and the boundary tests above cover
  logging and server creation.
- F: the notice is static, so there is no reduced-motion branch.
- FALLBACK_2D: the notice is DOM, not canvas, so it shows on every tier.

## Do NOT

- Do not build API routes, Supabase migrations, the `fetch`/submit client, constant-time comparison, encryption or
  moderation (MFW-12, story 2.4, MFW-13, MFW-31).
- Do not store creation ids or build "My Creations" (MFW-30, open question 12).
- Do not call `getDeviceOwnerVault()` from `FlowRoot` or any component in this card (D6).
- Never put the token (or its hash) in a URL, query string, cookie, `console.*` call, error message, Zustand store,
  `data-*` attribute or rendered DOM. Never hash on the client to "send the hash instead" (rejected by open question 1).
- Never use `Math.random`, `Date.now()` or `crypto.randomUUID()` as the token source. Use only `getRandomValues`.
- Do not add a `clear()`/reset API for the token, and do not remove the key anywhere.
- No new dependencies (`server-only`, `nanoid`, `uuid`, …). No `package.json` / lockfile changes.
- Do not touch `.claude/**`, `scripts/**`, `.github/**`, `CLAUDE.md`, `AGENTS.md`, `docs/spec/**` (including
  `open-questions.md`), `docs/backlog*.json`, `docs/prompts/**`, `vitest.config.mts`, `playwright.config.ts`,
  `eslint.config.mjs`, `tsconfig.json`, `next.config.ts`, the stores, `src/core/**`.
- Do not change existing test cases. Only add the cases listed.

## Definition of done

- Run each of these separately and get green: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm e2e`. In this
  cloud container run e2e as `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell pnpm e2e`.
- Delete `playwright-report/` and `test-results/` before committing; never commit `.next/` or `*.tsbuildinfo`.
- Branch `feat/MFW-11-client-side-anonymous-ownership-token` from the latest `main`.
- Conventional commit(s) with the key: e.g. `feat(auth): device owner token vault and loss warning MFW-11`.
- PR title = the commit subject. The English body has: link to MFW-11; each AC as a checklist item with the test that
  proves it; Decisions (copy D1–D7); test plan (five commands + results); follow-ups (server hashing/compare in
  MFW-12 / 2.4 / MFW-31, creation-id list in MFW-30, first vault caller in 5.1 / MFW-23).
- Leave the PR open. Label `privacy` → the owner merges after reviewer + qa + privacy-auditor pass.

## Interfaces this card provides

| Export | Path | Signature | Used by |
|---|---|---|---|
| `DeviceOwnerToken` | `@/services/auth` | `string & { readonly __brand: "DeviceOwnerToken" }` | 2.4, 5.1, MFW-30, MFW-31 |
| `isDeviceOwnerToken` | `@/services/auth` | `(value: unknown) => value is DeviceOwnerToken` | 2.4 server body validation, MFW-31 |
| `generateDeviceOwnerToken` | `@/services/auth` | `(fillRandom?: FillRandom) => DeviceOwnerToken` | internal / tests |
| `createDeviceOwnerVault` | `@/services/auth` | `(o: { storage: Storage \| null; generate?: () => DeviceOwnerToken }) => DeviceOwnerVault` | tests in later cards |
| `getDeviceOwnerVault` | `@/services/auth` | `() => DeviceOwnerVault` (throws on the server) | 5.1 save flow, MFW-30, MFW-31 client |
| `DeviceOwnerVault` | `@/services/auth` | `{ read(): DeviceOwnerToken \| null; getOrCreate(): { token; persisted: boolean } }` | same |
| `getBrowserLocalStorage` | `@/services/auth` | `() => Storage \| null` | MFW-30 (creation-id list next to the token) |
| `hashOwnerToken` | `@/services/auth` | `(token: DeviceOwnerToken) => Promise<OwnerTokenHash>` (rejects on bad format) | MFW-12, 2.4, MFW-31 (server only) |
| `isOwnerTokenHash` / `OwnerTokenHash` | `@/services/auth` | `(v: unknown) => v is OwnerTokenHash` | MFW-12 repository, MFW-31 |
| `DEVICE_OWNER_TOKEN_*`, `OWNER_TOKEN_HASH_PATTERN` | `@/config/ownership.config` | constants above | 2.4, MFW-30 (use the `mfw:` key prefix) |
| `OwnershipNotice`, `OWNERSHIP_LOSS_WARNING` | `@/components/ui/OwnershipNotice` | `() => JSX.Element`, `string` | 4.3 WishModal (may move the notice into the modal), MFW-30 drawer |

## Open questions

Product decisions only. This card ships the minimal default listed under each question, and the owner may
change it later without rework.

1. **Where, when and how often is the loss warning shown?** Options: (a) a static note in the WRITE_WISH step on
   every visit (planned default; this is the step where a creation becomes "yours"); (b) also in the My
   Creations drawer (MFW-30); (c) shown once per device and dismissible (needs a stored "seen" flag); (d) a
   blocking acknowledgement before the first release. English copy as well as Thai? (Default: Thai only, verbatim
   spec sentence.)
2. **What happens when LocalStorage is unavailable or the write fails (`persisted: false`)?** The krathong
   could still be released, but ownership would be lost on reload. Options: (a) allow release with only the
   standard warning (planned default: the vault exposes `persisted`, and nothing acts on it in this card); (b) show
   an extra warning (copy needed); (c) block release until storage works. The 5.1 save flow will need the answer.

## Decisions

- **D1 — 32 random bytes (256 bits) from `crypto.getRandomValues`.** This is far above the 128-bit minimum for an
  unguessable bearer secret and costs nothing.
- **D2 — base64url without padding (43 chars), strict canonical regex.** It is URL-safe if ever copied, and it
  cannot be confused with the 64-char hex hash. So the server's format check rejects a client that sends a hash
  instead of the token (the trap behind open question 1).
- **D3 — Storage key `"mfw:deviceOwnerToken:v1"`, raw string value.** The `mfw:` prefix namespaces the app (MFW-30
  adds its creation-id key next to it). `v1` allows a format migration. A raw string is simpler than JSON and is
  validated on read.
- **D4 — Hash = lowercase hex SHA-256 of the token's UTF-8 bytes, with no pepper or salt.** The owner decided
  `SHA-256(token)`. Hex fits the §5 `owner_token_hash String` column. 256-bit random input needs no salt.
- **D5 — Web Crypto (`crypto.subtle.digest`) instead of `node:crypto`, and no `server-only` package.** It is
  isomorphic (Node route handlers, Edge, vitest). Importing it from a client bundle cannot break the build, and it
  adds no dependency. Server-only use is documented in TSDoc instead.
- **D6 — Lazy creation: nothing in the app calls the vault in this card.** The token is created the first time a
  creation is saved (5.1), so devices that never release get no token. The UI warning does not need the token.
- **D7 — Invalid stored value is treated as absent and overwritten; failed writes fall back to an in-memory token
  for the page session (`persisted: false`); no in-memory cache when storage works.** A malformed value can never
  have owned a creation, because the server checks the same format. Always re-reading storage keeps tabs consistent.

## Out of scope

Server routes, DB, hashing on any real request path, constant-time compare, creation-id list, My Creations UI,
WishModal, ownership-proof transport helpers, token export/backup UI, Christmas work.

## Risks

- **Two tabs creating the first token at the same moment** can still both write. The read-back after
  `setItem` (step 5) reduces the race window but does not close it. Accepted for now because nothing creates a
  token concurrently yet. A later card can add `navigator.locks` if needed.
- **Safari ITP may evict LocalStorage after 7 days without interaction.** That is the same loss the warning
  describes, and it is worth mentioning to the owner along with Open question 1.
- **Reviewer grep noise:** the constants are named `DEVICE_OWNER_TOKEN_*`, so a case-insensitive grep for
  `owner_token` (invariant C) will match `src/config/ownership.config.ts`. They are constants, not data.
- **`role="note"` in e2e:** if a later card adds another note, the e2e `getByRole("note")` must be scoped by
  `data-testid="ownership-notice"`.
