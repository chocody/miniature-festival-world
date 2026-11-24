# MFW-13 [2.3] PII guard, profanity filter & report endpoint — implementation spec

> Hand-off spec for one card. It is the source of truth for the implementer and the reviewer. If this file and
> `docs/backlog.json` / `docs/spec/open-questions.md` disagree, those files win, and the PR must say so.
> Branch: `feat/MFW-13-pii-guard-profanity-filter-report` · Jira: MFW-13 · Epic: MFW-10 (Loop 2)
> Labels: `privacy`, `moderation`. Extra reviewer: **privacy-auditor** (the diff touches `src/services/**`,
> `src/app/api/**`, `supabase/**`, wish text and moderation). Because this is a privacy card that also adds a migration,
> the PR stays open and the **owner merges it**.

## Summary

This card adds the moderation guard that every public wish must pass, plus the report endpoint for public wishes.
The guard is a set of pure, dependency-free functions in `src/services/moderation/`. The same code runs in the browser
(the WishModal of MFW-21 uses it to warn early) and on the server (the create route of MFW-45 uses it to block). It detects
Thai and international phone numbers, e-mail addresses, LINE IDs, social handles and profile links, and Thai and English
profanity. All rules and word lists live in `src/config/moderation.config.ts`. The card also adds a **server backstop**: the
MFW-12 repository refuses to store a public wish that fails the guard, so no write path can skip it (invariant G).
For reports, the card adds `POST /api/reports` with body `{ "creationId": "<uuid>" }`. It increments `report_count`
atomically through a new repository method and a new SQL function in a **new** migration. At 3 reports it sets
`moderation_status = 'flagged'`, and the MFW-12 view then hides the item (owner decision 3). Reporting never needs the owner token.

## Prerequisites

| Card | State | What this card uses |
|---|---|---|
| MFW-11 [2.1] owner token | merged on `main` (2ade761) | nothing directly. `OwnerTokenHash` / `isOwnerTokenHash` from `@/services/auth` are only used indirectly by MFW-12 code |
| MFW-7 [1.1] events | merged | `FESTIVAL_EVENT_IDS` (only through MFW-12 code) |
| **MFW-12 [2.2] public/private API & DB** | **NOT merged yet** (plan `docs/plans/MFW-12.md`, implementation in progress) | see below |

The backlog says this card is **blocked by 2.2**. Cut the branch from `main` only after MFW-12 is merged. If it is not merged,
stop and report that. Do not copy MFW-12 code into this branch.

**ASSUMED INTERFACE (from MFW-12 plan)**. Check every item against `main` before you start. If a name or signature differs,
use the real one and say so in the PR. If something is missing entirely, stop and report.
- `src/config/moderation.config.ts` exports `MODERATION_STATUSES = ["approved","flagged","hidden"]`, `type ModerationStatus`,
  `DEFAULT_MODERATION_STATUS = "approved"` and `AUTO_HIDE_REPORT_THRESHOLD = 3`. **This card extends this file. It must not create a second one.**
- `src/config/database.config.ts` exports `UUID_PATTERN` (lowercase uuid regex), `INSERT_CREATION_RPC_PATH`, `SUPABASE_REST_PATH`, …
- `src/services/api/creationRepository.ts` exports `interface CreationRepository { backend; listPublicZone(q); insertCreation(i) }`,
  `class CreationRepositoryError(code: "invalid_input" | "backend_misconfigured" | "backend_request_failed" | "invalid_backend_response", detail?)`.
- `src/services/api/creationValidation.ts` exports `validateNewCreation(input, nowMs)`. Its step 5 checks that `publicWishText` is
  `null` or a non-blank string, and failures throw `CreationRepositoryError("invalid_input", "<field>")`.
- `src/services/api/inMemoryCreationRepository.ts` exports `createInMemoryCreationRepository({ now?, newId? })`, which returns
  `InMemoryCreationRepository` (`backend: "memory"`, plus `setModeration(id, { moderationStatus?, reportCount? }): boolean`). Inside it there are
  two closure maps: `publicRows: Map<string, StoredPublicRow>` (with `publicWishText`, `expiresAtMs`) and
  `privateRows: Map<string, StoredPrivateRow>` (with `reportCount`, `moderationStatus`).
- `src/services/api/supabaseCreationRepository.ts` exports `createSupabaseCreationRepository(options)`. It has a closure helper
  `send(target: URL, method, body?)` that never reads a non-2xx body, and a `restBase` URL.
- `src/services/api/creationRepositoryFactory.ts` exports `getCreationRepository(): CreationRepository`, which throws when misconfigured.
- `src/services/api/json.ts` exports `isPlainObject(value): value is Record<string, unknown>`.
- `src/services/api/__fixtures__/creations.ts` exports `makeNewCreation(overrides?)`, `makePrivateWish()`, `OWNER_HASH_FIXTURE`,
  `PRIVATE_CIPHERTEXT_FIXTURE`, `KEY_ID_FIXTURE`, `FAR_FUTURE`. The default `publicWishText` is `"ขอให้ทุกคนมีความสุข"`.
- `src/services/api/index.ts` is the client-safe barrel (types + `PUBLIC_CREATION_KEYS`).
- `supabase/migrations/20261124000000_mfw12_creations_public_private.sql` creates `public.creations_public`,
  `public.creations_private_ownership` (`report_count integer not null default 0`, `moderation_status public.moderation_status`),
  the view `public.creations_public_visible` (`moderation_status = 'approved' and report_count < 3 and expires_at > now()`)
  and grants `select, insert, update, delete` on both tables to `service_role` only.
- `tests/unit/public-private-boundary.test.ts` (MFW-12) forbids `console.` in `src/services/api`, `src/app/api` and `src/config`. It also
  forbids the string literal `"*"` in `src/services/api` / `src/app/api`, and forbids the snake_case private column names outside the
  ownership path. Your new code must keep that test green.

Facts the lead checked in this repo (2026-11-24, `main` = 2ade761):
- `src/services/moderation/index.ts` is `export {};` with the doc comment `/** PII Detector (เบอร์โทร, อีเมล, Line ID) & Profanity Filter */`.
- `tsconfig.json` has `"target": "ES2017"`. TypeScript 5.9 accepts lookbehind `(?<!…)` and lookahead in regex literals at this
  target, but it **rejects named capture groups** (`(?<name>…)`, TS1503). Do not use named groups or the `s` flag. Next 16's supported
  browsers start at Safari 16.4, which is the first Safari with lookbehind (`node_modules/next/dist/docs/03-architecture/supported-browsers.md`).
- `next.config.ts` has `cacheComponents: true`. A `POST` route handler is always dynamic. Do not export `dynamic` / `revalidate` /
  `runtime` (see `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`).
- `tests/unit/no-raw-xyz-persistence.test.ts` scans every file (tests included) under `src/services`, `src/app/api` and `supabase`
  for a `three` import, `Vector3` and `.toArray()`. None of these strings may appear anywhere in this card.
- The lead prototyped the detector code of Steps 2–5 in a scratch copy (Node 22, `tsc --strict --target ES2017`). Every positive
  and negative case listed under Tests gave the expected result. Adversarial inputs of 100 000 characters finished in about 100 ms.
- The lead did **not** run the SQL of Step 8 against any database (this session was not allowed to connect to one). It uses only
  constructs that MFW-12's verified migration also uses. See Risks.

## Acceptance criteria → checks

AC text is verbatim from `docs/backlog.json` story 2.3.

1. **"Detects phone numbers, emails, LINE IDs, social handles and banned words before save (rules in moderation.config.ts);
   Thai + English test cases"**
   - Every rule, keyword list, domain list, phone format and word list is a named constant in `src/config/moderation.config.ts`.
     The detector code in `src/services/moderation/` contains no rule literals except Unicode code-point constants.
     Test: `tests/unit/moderation-boundary.test.ts` → "detector modules import rules only from moderation.config".
   - `detectPii(text)` returns the reasons `phone` / `email` / `line_id` / `social_handle`. `containsProfanity(text)` detects Thai
     and English banned words. Tests: `src/services/moderation/piiDetector.test.ts` and
     `src/services/moderation/profanityFilter.test.ts`, which have the positive tables (Thai and English per category) and the
     negative tables (normal Thai and English wishes, years such as `2569`, dates, prices, lottery numbers, times).
   - "before save": the server repository rejects a failing public wish before anything is stored (Step 10).
     Tests: `src/services/api/creationValidation.test.ts` → "rejects a public wish with PII / profanity";
     `src/services/api/inMemoryCreationRepository.test.ts` → "insert with a PII public wish stores nothing".
2. **"User is warned and blocked from publishing PII publicly"**
   - Warned: `MODERATION_COPY` holds the Thai copy, and `describeModerationReasons(reasons)` returns
     `{ title, messages, hint }` for the UI. `MODERATION_COPY.publicHint` is the standing "do not put personal data" note that the
     spec asks for ("แจ้งเตือนผู้ใช้ไม่ให้ใส่ข้อมูลส่วนบุคคล"). Test: `src/services/moderation/wishGuard.test.ts`.
     The modal that renders this copy is MFW-21 (4.3, "PII warning and blocking via the 2.3 guard before publishing"), not this card.
   - Blocked: `checkPublicWish(text)` returns `{ ok: false, reasons }`. The server backstop in `validateNewCreation` throws
     `invalid_input` / `publicWishText`, so neither the in-memory nor the Supabase repository can store the wish (invariant G: the
     server enforces it, and the client check alone is not enough). `ModerationBlockedBody` / `toModerationBlockedBody` is the error
     contract that MFW-45's POST returns, and `parseModerationBlockedBody` is how MFW-21 reads it. Tests: `wishGuard.test.ts`,
     `creationValidation.test.ts`, `inMemoryCreationRepository.test.ts`, `supabaseCreationRepository.test.ts` → "insert with a PII public
     wish makes no request".
   - The private wish is **not** moderated (owner decision 13: "the private wish may keep it"). Test: `creationValidation.test.ts` →
     "a private creation is not moderated".
3. **"Report button endpoint increments report_count and flags/hides per threshold"**
   - `POST /api/reports` with `{ "creationId": "<uuid>" }` calls `CreationRepository.reportCreation(id)`. Each accepted report of a
     visible public-text creation adds 1 to `report_count`. When the count reaches `AUTO_HIDE_REPORT_THRESHOLD` (3),
     `moderation_status` becomes `AUTO_HIDE_MODERATION_STATUS` (`"flagged"`), and `listPublicZone` / `GET /api/creations` no longer return the item.
     Tests: `inMemoryCreationRepository.test.ts` → "report: counts, flags at 3, then hidden"; `src/app/api/reports/route.test.ts` →
     "three reports hide the item from GET /api/creations"; `src/services/api/reportHandler.test.ts` (request validation);
     `supabaseCreationRepository.test.ts` → "report request" cases; `tests/unit/report-migration.test.ts` (SQL: atomic
     increment, threshold 3, `'flagged'`, server-only grants); `tests/e2e/reports-api.spec.ts` (production build, no Supabase env).
   - Reporting does not need, and does not accept, any owner token. Test: `reportHandler.test.ts` → "rejects extra keys (ownerToken)".

## Owner decisions that apply

These are quoted from `docs/spec/open-questions.md`. Do not reopen them.

- **Row 13 (decided for MFW-13):** "profanity is blocked from public_wish_text (Thai and English lists in moderation.config.ts);
  the private wish may keep it (owner, 2026-11-23)". → `checkPublicWish` blocks profanity. Nothing moderates the private wish.
- **Row 3:** "public reads go through a view / server query that joins the private moderation status and excludes hidden and
  flagged items; an item is auto-hidden when report_count reaches 3". → The report path uses MFW-12's
  `AUTO_HIDE_REPORT_THRESHOLD = 3` and sets `'flagged'` at the threshold. The MFW-12 view already hides both `flagged` and `report_count >= 3`.
- **Row 1:** the raw owner token goes only to the ownership endpoints (create / prove ownership). → The report endpoint is not an
  ownership endpoint, so it never takes the token, its hash or any private field.
- **Row 17:** no Supabase project or staging exists yet. → The new migration is a repo file that the owner applies. CI and the dev never apply it.
- **Row 16 / launch plan:** build engine pieces generically. → The guard and the report path are event-agnostic and will be reused for Christmas.

Both rows that name MFW-13 (3 and 13) are already decided. There is no technical row to append to. **Do not edit `docs/spec/open-questions.md`.**

## Files

| Path | New/modify | Purpose |
|---|---|---|
| `src/config/moderation.config.ts` | modify (created by MFW-12) | Add reasons, PII rule data, profanity lists, Thai copy, `AUTO_HIDE_MODERATION_STATUS`, `REPORT_REQUEST_MAX_BYTES` |
| `src/config/database.config.ts` | modify | Add `REPORT_CREATION_RPC_PATH` |
| `src/services/moderation/normalize.ts` | new | `normalizeForModeration`, `escapeRegExp`, `alternation` |
| `src/services/moderation/piiDetector.ts` | new | `detectPii`, `isPhoneDigitRun` |
| `src/services/moderation/profanityFilter.ts` | new | `containsProfanity` |
| `src/services/moderation/types.ts` | new | `WishGuardResult`, `ModerationWarning`, `ModerationBlockedBody` |
| `src/services/moderation/wishGuard.ts` | new | `checkPublicWish`, `isModerationReason`, `describeModerationReasons`, `toModerationBlockedBody`, `parseModerationBlockedBody` |
| `src/services/moderation/index.ts` | modify | Client-safe barrel |
| `src/services/api/creationRepository.ts` | modify | Add `ReportOutcome` and `reportCreation` to the interface |
| `src/services/api/creationValidation.ts` | modify | Server backstop: a public wish must pass `checkPublicWish` |
| `src/services/api/inMemoryCreationRepository.ts` | modify | `reportCreation`, `getModerationState` |
| `src/services/api/supabaseCreationRepository.ts` | modify | `reportCreation` through RPC `mfw_report_creation` |
| `src/services/api/reportTypes.ts` | new | `REPORT_ENDPOINT_PATH`, `ReportRequestBody`, `ReportAcceptedBody`, `ReportErrorBody` |
| `src/services/api/reportHandler.ts` | new | `parseReportRequest`, `handleReportCreation(request, getRepository)` |
| `src/services/api/index.ts` | modify | Also export the report types and the path |
| `src/app/api/reports/route.ts` | new | `POST` only, delegates to `handleReportCreation` |
| `supabase/migrations/20261124010000_mfw13_report_creation.sql` | new | `public.mfw_report_creation(uuid) returns boolean` (service_role only) |
| `src/config/moderation.config.test.ts` | new | Config sanity |
| `src/services/moderation/normalize.test.ts` | new | Normalization |
| `src/services/moderation/piiDetector.test.ts` | new | PII positives/negatives (jsdom env = proves the client can run it) |
| `src/services/moderation/profanityFilter.test.ts` | new | Profanity positives/negatives |
| `src/services/moderation/wishGuard.test.ts` | new | Guard, copy, blocked body (node env = proves the server can run it) |
| `src/services/api/reportHandler.test.ts` | new | Request validation and responses |
| `src/app/api/reports/route.test.ts` | new | Real `POST`, and the report → hide flow through GET |
| `src/services/api/creationValidation.test.ts` | modify (add cases only) | Backstop cases |
| `src/services/api/inMemoryCreationRepository.test.ts` | modify (add cases only) | Report and backstop cases |
| `src/services/api/supabaseCreationRepository.test.ts` | modify (add cases only) | Report RPC cases |
| `tests/unit/report-migration.test.ts` | new | Static SQL checks |
| `tests/unit/moderation-boundary.test.ts` | new | Purity of the detector, route exports, client import boundary |
| `tests/e2e/reports-api.spec.ts` | new | Production-build API check without Supabase env |

## Implementation steps

Conventions for every new or changed file: TypeScript strict, English comments, no `any`, named constants only (no inline
numbers except `0`, `1` and the ones written in the code below), `Object.freeze` on exported constant arrays/objects, **no
`console.*`**, and no named capture groups. Error messages and response bodies never contain the wish text, a matched substring,
an id from the request, a token, a hash or an env value. Use code, field names and status numbers only.

### Step 1 — `src/config/moderation.config.ts` (modify: append below MFW-12's content, keep MFW-12's exports unchanged)

Append exactly this block (keep the Thai literals byte-identical; do **not** apply NFKC/NFC to them).

```ts
// ---------------------------------------------------------------------------------------------------------------
// MFW-13 (backlog 2.3): PII guard and profanity filter rules. "กฎการกรอง PII และคำต้องห้าม" (spec §3).
// All text is matched after normalizeForModeration (lowercase, full-width → ASCII, Thai digits → ASCII digits,
// invisible characters removed), so every Latin literal below must be lowercase.
// ---------------------------------------------------------------------------------------------------------------

/** Why a public wish is blocked. The order is the order reasons are reported in. */
export const MODERATION_REASONS = Object.freeze(["phone", "email", "line_id", "social_handle", "profanity"] as const);
export type ModerationReason = (typeof MODERATION_REASONS)[number];
export type PiiReason = Exclude<ModerationReason, "profanity">;

/** Status set when report_count reaches AUTO_HIDE_REPORT_THRESHOLD (auto-hidden, awaiting review). Lead decision, MFW-13 (D11). */
export const AUTO_HIDE_MODERATION_STATUS: ModerationStatus = "flagged";

/** Max bytes of a POST /api/reports body. A valid body is 53 bytes. Lead decision, MFW-13 (D9). */
export const REPORT_REQUEST_MAX_BYTES = 1_024;

/** Min characters of an id/handle after a LINE/social keyword or "@". Lead heuristic, MFW-13 (D5). */
export const HANDLE_MIN_LENGTH = 3;
/** Regex character class of a LINE ID / social handle (LINE: a-z 0-9 . - _; IG/TikTok/X: a-z 0-9 . _). */
export const HANDLE_TOKEN_CLASS = "[a-z0-9._-]";

/** "line" (Latin keyword, matched only when not preceded by a Latin letter). */
export const LINE_KEYWORDS_LATIN = Object.freeze(["line"]);
export const LINE_KEYWORDS_THAI = Object.freeze(["ไลน์", "ไลน"]);
export const ID_KEYWORDS_LATIN = Object.freeze(["id"]);
export const ID_KEYWORDS_THAI = Object.freeze(["ไอดี"]);

/** Social network names that, followed by ":" or "=", introduce a handle (Latin) or, followed by a handle, introduce one (Thai). */
export const SOCIAL_KEYWORDS_LATIN = Object.freeze([
  "instagram", "insta", "ig", "facebook", "fb", "tiktok", "twitter", "youtube", "threads",
]);
export const SOCIAL_KEYWORDS_THAI = Object.freeze([
  "อินสตาแกรม", "อินสตา", "ไอจี", "เฟสบุ๊ค", "เฟสบุ๊ก", "เฟซบุ๊ก", "เฟซบุ๊ค", "เฟส", "เฟซ", "ติ๊กต็อก", "ติ๊กต๊อก", "ทวิตเตอร์", "ยูทูบ",
]);
/** Profile-link hosts: "<domain>/<anything>" (any subdomain, with or without https://) is a social handle. */
export const SOCIAL_PROFILE_DOMAINS = Object.freeze([
  "facebook.com", "fb.com", "fb.me", "instagram.com", "instagr.am", "tiktok.com", "twitter.com", "x.com",
  "threads.net", "youtube.com", "youtu.be", "line.me", "lin.ee",
]);

/** Obfuscated e-mail: "name [at] gmail [dot] com", "name แอท gmail ดอท com", "name at gmail dot com". */
export const EMAIL_AT_WORDS_THAI = Object.freeze(["แอท"]);
export const EMAIL_DOT_WORDS_THAI = Object.freeze(["ดอท"]);
export const EMAIL_OBFUSCATED_TLDS = Object.freeze(["com", "net", "org", "co", "me", "io", "ac", "go", "in"]);

/**
 * Thai numbering plan (NBTC): mobile = 0 + [6|8|9] + 8 digits (10); fixed line = 0 + [2-5|7] + 7 digits (9);
 * international form = 66 + the national number without its leading 0. Matched against the digits of a digit run.
 */
export const THAI_PHONE_PATTERNS: readonly RegExp[] = Object.freeze([
  /^0[689][0-9]{8}$/,
  /^0[2-57][0-9]{7}$/,
  /^66[689][0-9]{8}$/,
  /^66[2-57][0-9]{7}$/,
]);
/** Longest digit string THAI_PHONE_PATTERNS can match (66 + 9). */
export const PHONE_MAX_DIGITS = 11;
/** Up to this many of [space - . ( )] may separate digit groups of one phone number ("081 - 234 - 5678"). */
export const PHONE_SEPARATOR_MAX_CHARS = 3;

/**
 * Thai banned words, matched as substrings of the "compact" text (whitespace and - _ . * ~ ' " ` removed),
 * because Thai has no spaces between words. PLACEHOLDER starter list (owner to review — Open question 2).
 */
export const PROFANITY_TH = Object.freeze([
  "เหี้ย", "ควย", "เย็ด", "ฉิบหาย", "ชิบหาย", "จัญไร", "ระยำ", "ส้นตีน", "อีดอก", "ไอ้สัตว์", "อีสัตว์", "สัส", "แตด", "หน้าหี", "เงี่ยน",
]);
/** Innocent words that contain a banned substring; removed before matching (เกลี้ยงเหี้ยน, แควยาว/แควใหญ่, สัสดี). */
export const PROFANITY_TH_ALLOWLIST = Object.freeze(["เหี้ยน", "แควย", "สัสดี"]);

/** word = whole Latin word; prefix = word starts with term; contains = anywhere inside a Latin word. */
export type ProfanityMatch = "word" | "prefix" | "contains";
export interface LatinProfanityTerm {
  readonly term: string; // lowercase a-z only
  readonly match: ProfanityMatch;
}
/** English banned words. PLACEHOLDER starter list (owner to review — Open question 2). */
export const PROFANITY_EN: readonly LatinProfanityTerm[] = Object.freeze([
  { term: "fuck", match: "contains" },
  { term: "shit", match: "prefix" },
  { term: "bitch", match: "prefix" },
  { term: "cunt", match: "prefix" },
  { term: "asshole", match: "prefix" },
  { term: "bastard", match: "prefix" },
  { term: "whore", match: "prefix" },
  { term: "slut", match: "prefix" },
  { term: "wanker", match: "prefix" },
  { term: "dick", match: "word" },
  { term: "dickhead", match: "word" },
  { term: "pussy", match: "word" },
  { term: "twat", match: "word" },
]);
/** Leetspeak folding applied ONLY for the English profanity pass ("sh1t" → "shit"). */
export const PROFANITY_LEET_MAP: Readonly<Record<string, string>> = Object.freeze({
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s", "!": "i",
});

/** Thai UI copy for the WishModal (MFW-21). DRAFT copy by the lead (owner may edit — Open question 2). */
export interface ModerationCopy {
  /** Standing note next to the "publish anonymously" choice (spec §6.2: แจ้งเตือนผู้ใช้ไม่ให้ใส่ข้อมูลส่วนบุคคล). */
  readonly publicHint: string;
  readonly blockedTitle: string;
  readonly fixHint: string;
  readonly reasons: Readonly<Record<ModerationReason, string>>;
}
export const MODERATION_COPY: ModerationCopy = Object.freeze({
  publicHint:
    "คำอธิษฐานแบบสาธารณะจะแสดงให้ทุกคนเห็น กรุณาอย่าใส่ข้อมูลส่วนบุคคล เช่น เบอร์โทรศัพท์ อีเมล ไลน์ไอดี หรือชื่อบัญชีโซเชียล",
  blockedTitle: "ยังเผยแพร่ข้อความนี้แบบสาธารณะไม่ได้",
  fixHint: "กรุณาลบข้อมูลส่วนนี้ออกก่อนเผยแพร่",
  reasons: Object.freeze({
    phone: "มีเบอร์โทรศัพท์อยู่ในข้อความ",
    email: "มีอีเมลอยู่ในข้อความ",
    line_id: "มีไลน์ไอดีอยู่ในข้อความ",
    social_handle: "มีชื่อบัญชีหรือลิงก์โซเชียลอยู่ในข้อความ",
    profanity: "มีคำไม่เหมาะสมอยู่ในข้อความ",
  }),
});
```

If MFW-12's file declared `ModerationStatus` under a different name, use that name for `AUTO_HIDE_MODERATION_STATUS`.

Constant table (new in this card):

| Constant | Value | File | Source |
|---|---|---|---|
| `MODERATION_REASONS` | `phone, email, line_id, social_handle, profanity` | `moderation.config.ts` | AC 1 categories |
| `AUTO_HIDE_MODERATION_STATUS` | `"flagged"` | same | lead (D11), within owner decision 3 |
| `REPORT_REQUEST_MAX_BYTES` | `1_024` | same | lead (D9), a technical bound |
| `HANDLE_MIN_LENGTH` | `3` | same | lead heuristic (D5) |
| `HANDLE_TOKEN_CLASS` | `"[a-z0-9._-]"` | same | LINE / IG / TikTok id rules |
| keyword / domain / TLD lists | above | same | lead (D5); owner may extend |
| `THAI_PHONE_PATTERNS`, `PHONE_MAX_DIGITS = 11`, `PHONE_SEPARATOR_MAX_CHARS = 3` | above | same | Thai numbering plan, lead (D4) |
| `PROFANITY_TH`, `PROFANITY_TH_ALLOWLIST`, `PROFANITY_EN` | above | same | **PLACEHOLDER (spec silent on the words)**, Open question 2 |
| `PROFANITY_LEET_MAP` | above | same | lead (D6) |
| `MODERATION_COPY` | above | same | **DRAFT Thai copy**, Open question 2 |
| `REPORT_CREATION_RPC_PATH` | `"rpc/mfw_report_creation"` | `database.config.ts` | lead |
| `REPORT_ENDPOINT_PATH` | `"/api/reports"` | `src/services/api/reportTypes.ts` | lead (D9) |

### Step 2 — `src/services/moderation/normalize.ts` (new)

```ts
/** Soft hyphen, zero-width space/joiners, LRM/RLM, word joiner and invisible operators, BOM. */
const INVISIBLE_CHARS = /[­​-‏⁠-⁤﻿]/g;
const FULLWIDTH_FIRST = 0xff01; // "！"
const FULLWIDTH_LAST = 0xff5e; // "～"
const FULLWIDTH_TO_ASCII_OFFSET = 0xfee0;
const IDEOGRAPHIC_SPACE = 0x3000;
const THAI_DIGIT_ZERO = 0x0e50; // "๐"
const THAI_DIGIT_NINE = 0x0e59; // "๙"
const ASCII_DIGIT_ZERO = 0x30;

/**
 * Canonical form used by every moderation rule: invisible characters removed, full-width ASCII → ASCII,
 * ideographic space → " ", Thai digits → ASCII digits, then lowercase. Deliberately NOT NFKC: NFKC splits
 * Thai SARA AM (ำ) into two code points, which would break Thai word matching (D2). Pure; length may shrink.
 */
export function normalizeForModeration(text: string): string {
  let out = "";
  for (const ch of text.replace(INVISIBLE_CHARS, "")) {
    const code = ch.codePointAt(0) as number;
    if (code >= FULLWIDTH_FIRST && code <= FULLWIDTH_LAST) out += String.fromCodePoint(code - FULLWIDTH_TO_ASCII_OFFSET);
    else if (code === IDEOGRAPHIC_SPACE) out += " ";
    else if (code >= THAI_DIGIT_ZERO && code <= THAI_DIGIT_NINE) {
      out += String.fromCodePoint(code - THAI_DIGIT_ZERO + ASCII_DIGIT_ZERO);
    } else out += ch;
  }
  return out.toLowerCase();
}

/** Escapes a literal for use inside a RegExp source. */
export function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** "a|b|c" of escaped literals, longest first (ties: code-unit order), so a longer keyword wins over its prefix. */
export function alternation(literals: readonly string[]): string {
  return [...literals]
    .sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0))
    .map(escapeRegExp)
    .join("|");
}
```

### Step 3 — `src/services/moderation/piiDetector.ts` (new)

The detector works on the normalized text. It applies the rules **in the order below**. Each match is replaced by spaces of the same
length ("masked"), so a later rule cannot match it again. This keeps the reasons clean: `"line: 0812345678"` → `phone` only, and
`"x@gmail.com"` → `email` only. Rules are compiled once at module load. The compiled global regexes are **not exported**, because
`.test()` on a global regex is stateful. Only `String.prototype.replace` uses them, and it resets `lastIndex` itself.

```ts
import {
  EMAIL_AT_WORDS_THAI, EMAIL_DOT_WORDS_THAI, EMAIL_OBFUSCATED_TLDS, HANDLE_MIN_LENGTH, HANDLE_TOKEN_CLASS,
  ID_KEYWORDS_LATIN, ID_KEYWORDS_THAI, LINE_KEYWORDS_LATIN, LINE_KEYWORDS_THAI, MODERATION_REASONS,
  PHONE_MAX_DIGITS, PHONE_SEPARATOR_MAX_CHARS, SOCIAL_KEYWORDS_LATIN, SOCIAL_KEYWORDS_THAI, SOCIAL_PROFILE_DOMAINS,
  THAI_PHONE_PATTERNS, type PiiReason,
} from "@/config/moderation.config";
import { alternation, normalizeForModeration } from "./normalize";

type PatternRule = { readonly kind: "pattern"; readonly reason: PiiReason; readonly pattern: RegExp };
type PhoneRule = { readonly kind: "phone" };
type PiiRule = PatternRule | PhoneRule;

/** Optional "@" + a handle of at least HANDLE_MIN_LENGTH token characters. */
const TOKEN = `@?${HANDLE_TOKEN_CLASS}{${HANDLE_MIN_LENGTH},}`;
/** Latin keywords must not be glued to other Latin letters ("deadline", "online" are not "line"). */
const LATIN_START = "(?<![a-z])";
const LATIN_END = "(?![a-z])";
const LINE_KW = `(?:${LATIN_START}(?:${alternation(LINE_KEYWORDS_LATIN)})|${alternation(LINE_KEYWORDS_THAI)})`;
const LINE_KW_THAI = `(?:${alternation(LINE_KEYWORDS_THAI)})`;
/** "id" right after "line" may be glued to it ("lineid"), but not followed by a letter ("line idea"). */
const ID_AFTER_LINE = `(?:(?:${alternation(ID_KEYWORDS_LATIN)})${LATIN_END}|${alternation(ID_KEYWORDS_THAI)})`;
const ID_KW = `(?:${LATIN_START}(?:${alternation(ID_KEYWORDS_LATIN)})|${alternation(ID_KEYWORDS_THAI)})`;
const LINE_AFTER_ID = `(?:(?:${alternation(LINE_KEYWORDS_LATIN)})${LATIN_END}|${alternation(LINE_KEYWORDS_THAI)})`;

const rule = (reason: PiiReason, source: string): PatternRule => ({ kind: "pattern", reason, pattern: new RegExp(source, "g") });

const PII_RULES: readonly PiiRule[] = Object.freeze([
  // 1. e-mail. The lookbehind makes each local part start once, which keeps the scan linear.
  rule("email", "(?<![a-z0-9._%+-])[a-z0-9._%+-]+@[a-z0-9-]+(?:\\.[a-z0-9-]+)+"),
  // 2. obfuscated e-mail: name [at]/(at)/at/แอท domain ./[dot]/(dot)/dot/ดอท tld
  rule(
    "email",
    `(?<![a-z0-9._%+-])[a-z0-9._%+-]+\\s*(?:\\[at\\]|\\(at\\)|${LATIN_START}at${LATIN_END}|${alternation(EMAIL_AT_WORDS_THAI)})` +
      `\\s*[a-z0-9-]+\\s*(?:\\.|\\[dot\\]|\\(dot\\)|${LATIN_START}dot${LATIN_END}|${alternation(EMAIL_DOT_WORDS_THAI)})` +
      `\\s*(?:${alternation(EMAIL_OBFUSCATED_TLDS)})${LATIN_END}`,
  ),
  // 3. profile links: facebook.com/…, https://www.instagram.com/…, tiktok.com/@…, line.me/ti/p/…
  rule("social_handle", `(?<![a-z0-9.-])(?:[a-z0-9-]+\\.)*(?:${alternation(SOCIAL_PROFILE_DOMAINS)})\\/\\S+`),
  // 4. phone numbers (function rule, see isPhoneDigitRun)
  { kind: "phone" },
  // 5. LINE: "line: x", "line id: x", "lineid = x", "ไลน์: x"
  rule("line_id", `${LINE_KW}\\s*${ID_AFTER_LINE}?\\s*[:=]\\s*${TOKEN}`),
  // 6. LINE: "line id x", "ไลน์ไอดี x"
  rule("line_id", `${LINE_KW}\\s*${ID_AFTER_LINE}\\s*${TOKEN}`),
  // 7. LINE: "id line x", "ไอดีไลน์: x"
  rule("line_id", `${ID_KW}\\s*${LINE_AFTER_ID}\\s*[:=]?\\s*${TOKEN}`),
  // 8. LINE: Thai keyword directly followed by a Latin id ("ไลน์ somchai99", "แอดไลน์ @abc123")
  rule("line_id", `${LINE_KW_THAI}\\s*${TOKEN}`),
  // 9. social keyword (Latin) + ":" or "=" + handle ("ig: x", "fb = x")
  rule("social_handle", `${LATIN_START}(?:${alternation(SOCIAL_KEYWORDS_LATIN)})${LATIN_END}\\s*[:=]\\s*${TOKEN}`),
  // 10. social keyword (Thai) + optional ":"/"=" + Latin handle ("ไอจี somchai99", "เฟส: x")
  rule("social_handle", `(?:${alternation(SOCIAL_KEYWORDS_THAI)})\\s*[:=]?\\s*${TOKEN}`),
  // 11. "@handle" with at least one letter ("@somchai_j"; not "@100", not "@ทุกคน")
  rule("social_handle", `@(?=${HANDLE_TOKEN_CLASS}*[a-z])${HANDLE_TOKEN_CLASS}{${HANDLE_MIN_LENGTH},}`),
]);

/** A digit run: digits separated by at most PHONE_SEPARATOR_MAX_CHARS of [whitespace - . ( )]. Commas and "/" end a run. */
const PHONE_RUN = new RegExp(`[0-9](?:[\\s\\-.()]{0,${PHONE_SEPARATOR_MAX_CHARS}}[0-9])*`, "g");
const NON_DIGITS = /[^0-9]+/;

/**
 * True when some contiguous sequence of the run's digit groups, concatenated, matches a THAI_PHONE_PATTERNS entry.
 * "2569 081 234 5678" → groups [2569, 081, 234, 5678] → "0812345678" matches. "24/11/2569" is three runs, none matches.
 */
export function isPhoneDigitRun(run: string): boolean {
  const groups = run.split(NON_DIGITS).filter((g) => g !== "");
  for (let i = 0; i < groups.length; i += 1) {
    let digits = "";
    for (let j = i; j < groups.length; j += 1) {
      digits += groups[j];
      if (digits.length > PHONE_MAX_DIGITS) break;
      if (THAI_PHONE_PATTERNS.some((p) => p.test(digits))) return true;
    }
  }
  return false;
}

const blankOut = (match: string): string => " ".repeat(match.length);

/** PII categories found in `text` (unique, in MODERATION_REASONS order). Pure; never throws for a string input. */
export function detectPii(text: string): readonly PiiReason[] {
  let working = normalizeForModeration(text);
  const found = new Set<PiiReason>();
  for (const r of PII_RULES) {
    if (r.kind === "phone") {
      working = working.replace(PHONE_RUN, (run) => {
        if (!isPhoneDigitRun(run)) return run;
        found.add("phone");
        return blankOut(run);
      });
    } else {
      working = working.replace(r.pattern, (match) => {
        found.add(r.reason);
        return blankOut(match);
      });
    }
  }
  return MODERATION_REASONS.filter((reason): reason is PiiReason => reason !== "profanity" && found.has(reason));
}
```
`THAI_PHONE_PATTERNS` entries are anchored and **non-global**, so `.test` on them is safe.

### Step 4 — `src/services/moderation/profanityFilter.ts` (new)

```ts
import { PROFANITY_EN, PROFANITY_LEET_MAP, PROFANITY_TH, PROFANITY_TH_ALLOWLIST } from "@/config/moderation.config";
import { normalizeForModeration } from "./normalize";

/** Removed before Thai substring matching, so "เ ห ี้ ย" and "เ-หี้-ย" still match. */
const THAI_COMPACT_STRIP = /[\s\-_.*~'"`]+/g;
/** Replaces an allowlisted word; it is not part of any Thai term, so it breaks matches across the removed word. */
const ALLOWLIST_PLACEHOLDER = "|";
const LEET = new Map<string, string>(Object.entries(PROFANITY_LEET_MAP));
const LATIN_WORD = /[a-z]+/g;

/** True when `text` contains a Thai or English banned word (moderation.config.ts lists). Pure. */
export function containsProfanity(text: string): boolean {
  const normalized = normalizeForModeration(text);

  let compact = normalized.replace(THAI_COMPACT_STRIP, "");
  for (const allowed of PROFANITY_TH_ALLOWLIST) compact = compact.split(allowed).join(ALLOWLIST_PLACEHOLDER);
  if (PROFANITY_TH.some((term) => compact.includes(term))) return true;

  const latin = Array.from(normalized, (c) => LEET.get(c) ?? c).join("");
  for (const word of latin.match(LATIN_WORD) ?? []) {
    for (const { term, match } of PROFANITY_EN) {
      const hit = match === "word" ? word === term : match === "prefix" ? word.startsWith(term) : word.includes(term);
      if (hit) return true;
    }
  }
  return false;
}
```
Use a `Map` for the leet table, not `PROFANITY_LEET_MAP[c]`. That avoids prototype keys, and a regex built from the
map keys would turn `\0`/`\1` into octal escapes (a bug the lead hit in the prototype).

### Step 5 — `src/services/moderation/types.ts` and `src/services/moderation/wishGuard.ts` (new)

`types.ts`:
```ts
import type { ModerationReason } from "@/config/moderation.config";

/** Result of checkPublicWish. `reasons` is non-empty, unique, in MODERATION_REASONS order. */
export type WishGuardResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reasons: readonly ModerationReason[] };

/** What the WishModal (MFW-21) shows when a public wish is blocked. */
export interface ModerationWarning {
  readonly title: string;
  readonly messages: readonly string[]; // one per reason, same order
  readonly hint: string;
}

/** Error body for a public wish rejected by the server (MFW-45 POST /api/creations). Never contains the text. */
export interface ModerationBlockedBody {
  readonly error: "moderation_blocked";
  readonly reasons: readonly ModerationReason[];
}
```

`wishGuard.ts`:
```ts
import { MODERATION_COPY, MODERATION_REASONS, type ModerationReason } from "@/config/moderation.config";
import { detectPii } from "./piiDetector";
import { containsProfanity } from "./profanityFilter";
import type { ModerationBlockedBody, ModerationWarning, WishGuardResult } from "./types";

const OK: WishGuardResult = Object.freeze({ ok: true });

/** The 2.3 guard for public_wish_text (PII + profanity, owner decision 13). Throws TypeError for a non-string. */
export function checkPublicWish(text: string): WishGuardResult {
  if (typeof text !== "string") throw new TypeError("wish text must be a string");
  const pii = detectPii(text);
  const profane = containsProfanity(text);
  const reasons = MODERATION_REASONS.filter((r) => (r === "profanity" ? profane : pii.includes(r)));
  return reasons.length === 0 ? OK : Object.freeze({ ok: false as const, reasons: Object.freeze(reasons) });
}

export function isModerationReason(value: unknown): value is ModerationReason {
  return typeof value === "string" && (MODERATION_REASONS as readonly string[]).includes(value);
}

/** Keeps only known reasons, unique, in MODERATION_REASONS order. */
function canonicalReasons(reasons: readonly unknown[]): ModerationReason[] {
  return MODERATION_REASONS.filter((r) => reasons.includes(r));
}

/** Thai warning for the given reasons (unknown entries ignored). */
export function describeModerationReasons(reasons: readonly ModerationReason[]): ModerationWarning {
  return Object.freeze({
    title: MODERATION_COPY.blockedTitle,
    messages: Object.freeze(canonicalReasons(reasons).map((r) => MODERATION_COPY.reasons[r])),
    hint: MODERATION_COPY.fixHint,
  });
}

export function toModerationBlockedBody(reasons: readonly ModerationReason[]): ModerationBlockedBody {
  return { error: "moderation_blocked", reasons: canonicalReasons(reasons) };
}

/** Client-side parse of an untrusted server error body. null unless it is exactly a valid ModerationBlockedBody shape. */
export function parseModerationBlockedBody(value: unknown): ModerationBlockedBody | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { error, reasons } = value as { error?: unknown; reasons?: unknown };
  if (error !== "moderation_blocked" || !Array.isArray(reasons) || reasons.length === 0) return null;
  if (!reasons.every(isModerationReason)) return null;
  return { error: "moderation_blocked", reasons: canonicalReasons(reasons) };
}
```
Do not import `@/services/api/json` here. `src/services/moderation` must stay dependency-free (boundary test).

### Step 6 — `src/services/moderation/index.ts` (modify)

Replace `export {};` with the following, and keep the existing doc comment line:
```ts
/** PII Detector (เบอร์โทร, อีเมล, Line ID) & Profanity Filter */
// Pure and isomorphic: used by the WishModal (client, MFW-21) and by the server write path (MFW-45, validateNewCreation).
export { normalizeForModeration } from "./normalize";
export { detectPii, isPhoneDigitRun } from "./piiDetector";
export { containsProfanity } from "./profanityFilter";
export {
  checkPublicWish,
  describeModerationReasons,
  isModerationReason,
  parseModerationBlockedBody,
  toModerationBlockedBody,
} from "./wishGuard";
export type { ModerationBlockedBody, ModerationWarning, WishGuardResult } from "./types";
export type { ModerationReason, PiiReason } from "@/config/moderation.config";
```

### Step 7 — repository interface: `src/services/api/creationRepository.ts` (modify)

Add these to the file. Do not change the existing members.
```ts
/** counted = report_count was incremented; ignored = unknown, private-only, expired or already hidden/flagged creation. */
export type ReportOutcome = "counted" | "ignored";

export interface CreationRepository {
  // ...existing members (backend, listPublicZone, insertCreation)...
  /**
   * Report a public wish (backlog 2.3). Atomically: if the creation exists, has public_wish_text, is not expired, is
   * 'approved' and report_count < AUTO_HIDE_REPORT_THRESHOLD, then report_count += 1, and when it reaches the threshold
   * moderation_status = AUTO_HIDE_MODERATION_STATUS. Rejects invalid_input "creationId" for a non-uuid. Never needs a token.
   */
  reportCreation(creationId: string): Promise<ReportOutcome>;
}
```
Extend the doc comment of `invalid_backend_response` with the new detail `"report"`.

Adding a member to the interface breaks every object literal typed `CreationRepository` in existing tests (for example the
failing repository in `src/app/api/creations/route.test.ts`). Add `reportCreation: async () => "ignored"` (typed
`ReportOutcome`) to each such literal. Do not make any other change to those tests.

### Step 8 — `supabase/migrations/20261124010000_mfw13_report_creation.sql` (new)

Write it **exactly** as below. Do not edit the MFW-12 migration. Do not run this file against any database.
```sql
-- MFW-13 (backlog 2.3): report a public wish. Requires 20261124000000_mfw12_creations_public_private.sql.
-- Applied by the owner to the Supabase project (open question 17). Never applied by CI.
-- Open question 3 (owner): an item is auto-hidden when report_count reaches 3. The MFW-12 view already hides
-- rows with report_count >= 3 or a status other than approved; this function also marks them flagged.
-- One UPDATE statement: concurrent reports re-check the WHERE clause on the locked row, so the count stops at 3.

create function public.mfw_report_creation(p_creation_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.creations_private_ownership as o
     set report_count = o.report_count + 1,
         moderation_status = case
           when o.report_count + 1 >= 3 then 'flagged'::public.moderation_status
           else o.moderation_status
         end
    from public.creations_public as p
   where o.creation_id = p_creation_id
     and p.id = o.creation_id
     and p.public_wish_text is not null
     and p.expires_at > now()
     and o.moderation_status = 'approved'
     and o.report_count < 3;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.mfw_report_creation(uuid) from public, anon, authenticated;
grant execute on function public.mfw_report_creation(uuid) to service_role;

notify pgrst, 'reload schema';
```
It needs no new table grants: MFW-12 already grants `select` on `creations_public` and `update` on
`creations_private_ownership` to `service_role`.

### Step 9 — `src/config/database.config.ts` (modify)

Append:
```ts
/** Atomic report increment (relative to SUPABASE_REST_PATH). MFW-13. */
export const REPORT_CREATION_RPC_PATH = "rpc/mfw_report_creation";
```

### Step 10 — server backstop: `src/services/api/creationValidation.ts` (modify)

Add `import { checkPublicWish } from "@/services/moderation";`. In `validateNewCreation`, extend check **5 (`publicWishText`)** so
that it reads: it must be `null`, or a `string` whose `.trim()` is not `""` **and** for which `checkPublicWish(publicWishText).ok === true`.
Any failure throws `new CreationRepositoryError("invalid_input", "publicWishText")`. The error carries no reasons, so the
repository never echoes text. MFW-45 runs `checkPublicWish` itself first, so that it can answer with the reasons (D8). Do **not** check
`privateWish` (it is ciphertext, and owner decision 13 lets the private wish keep profanity). Keep the check order and every other check unchanged.

### Step 11 — `src/services/api/inMemoryCreationRepository.ts` (modify)

Add to the `InMemoryCreationRepository` interface and its implementation:
```ts
export interface CreationModerationState {
  readonly reportCount: number;
  readonly moderationStatus: ModerationStatus;
}

export interface InMemoryCreationRepository extends CreationRepository {
  // ...existing...
  /** Test/inspection helper (server only): a copy of the private moderation fields, or null for an unknown id. */
  getModerationState(id: string): CreationModerationState | null;
}
```
Implementation (inside the existing closure; imports: `UUID_PATTERN`, `DEFAULT_MODERATION_STATUS`, `AUTO_HIDE_REPORT_THRESHOLD`, `AUTO_HIDE_MODERATION_STATUS`,
`CreationRepositoryError`, `ReportOutcome`):
```ts
async reportCreation(creationId: string): Promise<ReportOutcome> {
  if (typeof creationId !== "string" || !UUID_PATTERN.test(creationId)) {
    throw new CreationRepositoryError("invalid_input", "creationId");
  }
  const nowMs = now();
  const pub = publicRows.get(creationId);
  const priv = privateRows.get(creationId);
  if (pub === undefined || priv === undefined) return "ignored";
  if (pub.publicWishText === null || pub.expiresAtMs <= nowMs) return "ignored";
  if (priv.moderationStatus !== DEFAULT_MODERATION_STATUS || priv.reportCount >= AUTO_HIDE_REPORT_THRESHOLD) return "ignored";
  const reportCount = priv.reportCount + 1;
  const moderationStatus = reportCount >= AUTO_HIDE_REPORT_THRESHOLD ? AUTO_HIDE_MODERATION_STATUS : priv.moderationStatus;
  privateRows.set(creationId, { ...priv, reportCount, moderationStatus }); // internal row copy, never returned
  return "counted";
},
getModerationState(id: string): CreationModerationState | null {
  const priv = privateRows.get(id);
  return priv === undefined ? null : { reportCount: priv.reportCount, moderationStatus: priv.moderationStatus };
},
```
(`DEFAULT_MODERATION_STATUS` is `"approved"`. Use the constant, the same way the view condition uses `'approved'`.) If MFW-12's
`StoredPrivateRow` fields are `readonly`, the `set(…{ ...priv })` form above already works. That spread is of an internal
row into another internal row, never into a response. `insertCreation` gets the backstop automatically through `validateNewCreation`.

### Step 12 — `src/services/api/supabaseCreationRepository.ts` (modify)

```ts
/** Body of POST /rest/v1/rpc/mfw_report_creation; key equals the SQL parameter name. */
export interface ReportCreationRpcBody {
  readonly p_creation_id: string;
}
```
Add inside the returned object (same closure as `send` / `restBase`):
```ts
async reportCreation(creationId: string): Promise<ReportOutcome> {
  if (typeof creationId !== "string" || !UUID_PATTERN.test(creationId)) {
    throw new CreationRepositoryError("invalid_input", "creationId"); // before any request
  }
  const body: ReportCreationRpcBody = { p_creation_id: creationId };
  const data = await send(new URL(REPORT_CREATION_RPC_PATH, restBase), "POST", JSON.stringify(body));
  if (data === true) return "counted";
  if (data === false) return "ignored";
  throw new CreationRepositoryError("invalid_backend_response", "report");
},
```
PostgREST returns a scalar `boolean` function result as the JSON `true` / `false`. Reuse `send`, which never reads a non-2xx body.

### Step 13 — `src/services/api/reportTypes.ts` (new, client-safe)

```ts
/** POST endpoint of the Report button (InspectPopup, MFW-28). */
export const REPORT_ENDPOINT_PATH = "/api/reports";

/** Request body: exactly this one key. Content-Type must be application/json. */
export interface ReportRequestBody {
  readonly creationId: string; // lowercase uuid, as returned by GET /api/creations
}

/** 202 body for every well-formed report, counted or not (no existence / moderation oracle, D10). */
export interface ReportAcceptedBody {
  readonly status: "received";
}

export type ReportErrorBody =
  | { readonly error: "unsupported_media_type" } // 415
  | { readonly error: "payload_too_large" } // 413
  | { readonly error: "invalid_body" } // 400
  | { readonly error: "unavailable" }; // 503
```
Example request: `POST /api/reports` with `Content-Type: application/json` and body
`{"creationId":"950118ce-7d93-4cb6-bd84-44d91c5de9e3"}`. Response: `202` with `{"status":"received"}` and `Cache-Control: no-store`.

### Step 14 — `src/services/api/reportHandler.ts` (new, server)

```ts
import { REPORT_REQUEST_MAX_BYTES } from "@/config/moderation.config";
import { UUID_PATTERN } from "@/config/database.config";
import type { CreationRepository } from "./creationRepository";
import { isPlainObject } from "./json";
import type { ReportAcceptedBody, ReportErrorBody, ReportRequestBody } from "./reportTypes";

const HTTP_ACCEPTED = 202;
const HTTP_BAD_REQUEST = 400;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;
const HTTP_SERVICE_UNAVAILABLE = 503;
const NO_STORE = { "Cache-Control": "no-store" } as const;
/** application/json, optionally followed by parameters ("; charset=utf-8"). */
const JSON_CONTENT_TYPE = /^application\/json\s*(?:;|$)/i;
const REPORT_BODY_KEYS = Object.freeze(["creationId"] as const);

const respond = (status: number, body: ReportAcceptedBody | ReportErrorBody): Response =>
  Response.json(body, { status, headers: NO_STORE });

/** Exactly { creationId: <lowercase uuid> }; anything else (any extra key, wrong types) → null. */
export function parseReportRequest(value: unknown): ReportRequestBody | null {
  if (!isPlainObject(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== REPORT_BODY_KEYS.length || keys[0] !== REPORT_BODY_KEYS[0]) return null;
  const { creationId } = value;
  if (typeof creationId !== "string" || !UUID_PATTERN.test(creationId)) return null;
  return { creationId };
}

/** POST /api/reports logic. `getRepository` may throw (misconfigured env) → 503. Never logs. */
export async function handleReportCreation(request: Request, getRepository: () => CreationRepository): Promise<Response> {
  if (!JSON_CONTENT_TYPE.test(request.headers.get("content-type") ?? "")) {
    return respond(HTTP_UNSUPPORTED_MEDIA_TYPE, { error: "unsupported_media_type" });
  }
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > REPORT_REQUEST_MAX_BYTES) {
    return respond(HTTP_PAYLOAD_TOO_LARGE, { error: "payload_too_large" });
  }
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return respond(HTTP_BAD_REQUEST, { error: "invalid_body" });
  }
  if (new TextEncoder().encode(raw).byteLength > REPORT_REQUEST_MAX_BYTES) {
    return respond(HTTP_PAYLOAD_TOO_LARGE, { error: "payload_too_large" });
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return respond(HTTP_BAD_REQUEST, { error: "invalid_body" });
  }
  const parsed = parseReportRequest(parsedJson);
  if (parsed === null) return respond(HTTP_BAD_REQUEST, { error: "invalid_body" });
  try {
    await getRepository().reportCreation(parsed.creationId);
  } catch {
    return respond(HTTP_SERVICE_UNAVAILABLE, { error: "unavailable" });
  }
  return respond(HTTP_ACCEPTED, { status: "received" });
}
```
The outcome (`counted` / `ignored`) is deliberately not exposed (D10). Never put `creationId` into an error message or a log.

### Step 15 — `src/app/api/reports/route.ts` (new)

```ts
import { getCreationRepository } from "@/services/api/creationRepositoryFactory";
import { handleReportCreation } from "@/services/api/reportHandler";

/** POST /api/reports — body { creationId } (backlog 2.3 "Report button endpoint"). */
export async function POST(request: Request): Promise<Response> {
  return handleReportCreation(request, getCreationRepository);
}
```
Export **only** `POST`. Next answers `GET` and the other methods with 405 automatically.

### Step 16 — `src/services/api/index.ts` (modify)

Add to the client-safe barrel:
```ts
export {
  REPORT_ENDPOINT_PATH,
  type ReportAcceptedBody,
  type ReportErrorBody,
  type ReportRequestBody,
} from "./reportTypes";
```
Do not export `reportHandler` from the barrel.

## Tests

Everything runs under `pnpm test`, with no network and no database. Server tests start with `// @vitest-environment node`.
Never write `Vector3`, `.toArray()` or a `three` import in these files.

### `src/config/moderation.config.test.ts` (node)
1. `AUTO_HIDE_REPORT_THRESHOLD === 3`. `AUTO_HIDE_MODERATION_STATUS` is in `MODERATION_STATUSES` and is not `DEFAULT_MODERATION_STATUS`.
2. `Object.keys(MODERATION_COPY.reasons).sort()` equals `[...MODERATION_REASONS].sort()`, and every copy string is non-empty.
3. "Latin literals are lowercase": every entry of `LINE_KEYWORDS_LATIN`, `ID_KEYWORDS_LATIN`, `SOCIAL_KEYWORDS_LATIN`,
   `SOCIAL_PROFILE_DOMAINS`, `EMAIL_OBFUSCATED_TLDS` and every `PROFANITY_EN[].term` equals `normalizeForModeration(x)`, and
   `PROFANITY_EN` terms match `/^[a-z]+$/`.
4. "Thai literals are already normalized": every `PROFANITY_TH`, `PROFANITY_TH_ALLOWLIST`, `LINE_KEYWORDS_THAI`, `SOCIAL_KEYWORDS_THAI`
   entry equals `normalizeForModeration(x)`, and the profanity entries are non-empty and contain no whitespace.
5. "allowlist entries each contain a banned term and are not banned themselves": for each allow entry `a`,
   `PROFANITY_TH.some(t => a.includes(t))` is true and `PROFANITY_TH.includes(a)` is false.
6. Every `THAI_PHONE_PATTERNS` source starts with `^` and ends with `$`, and has no `g`/`y` flag. `PHONE_MAX_DIGITS === 11`.
7. The exported arrays/objects are frozen (`Object.isFrozen`).

### `src/services/moderation/normalize.test.ts` (default jsdom env)
- `"０８１２３４５６７８"` → `"0812345678"`. `"๐๘๑๒๓๔๕๖๗๘"` → `"0812345678"`. `"ＳＯＭ＠ＭＡＩＬ．ＣＯＭ"` → `"som@mail.com"`.
- `"so​m­chai﻿"` → `"somchai"`. `"a　b"` → `"a b"`. `"ABC"` → `"abc"`.
- Thai text is unchanged: `"ระยำ"` → `"ระยำ"` (length 4: SARA AM is not split). `"ขอให้มีความสุข"` is unchanged.
- `escapeRegExp("a.b*c")` → `"a\\.b\\*c"`. `alternation(["เฟส", "เฟสบุ๊ค", "ig"])` → `"เฟสบุ๊ค|เฟส|ig"`.

### `src/services/moderation/piiDetector.test.ts` (default jsdom env, which proves the browser bundle can run it)
Use `it.each` tables. For positives, assert `expect(detectPii(input)).toContain(reason)`. For negatives, assert `toEqual([])`.

Positives:
- `phone`: `"โทร 081-234-5678"`, `"0812345678"`, `"081 234 5678"`, `"๐๘๑๒๓๔๕๖๗๘"`, `"+66 81 234 5678"`, `"+66812345678"`,
  `"02-123-4567"`, `"(02) 123 4567"`, `"0 8 1 2 3 4 5 6 7 8"`, `"call me 089.123.4567"`, `"０８１２３４５６７８"`,
  `"ปี 2569 โทร 0812345678"`, `"2569 081 234 5678"`, `"081 - 234 - 5678"`, `"053-123456"`, `"Tel. 0-2123-4567"`.
- `email`: `"somchai@gmail.com"`, `"SOMCHAI.J@Hotmail.co.th"`, `"somchai [at] gmail [dot] com"`, `"somchai แอท gmail ดอท com"`,
  `"somchai at gmail dot com"`, `"ｓｏｍｃｈａｉ＠ｇｍａｉｌ．ｃｏｍ"`, `"ติดต่อsomchai@gmail.comนะ"`, `"so​mchai@gmail.com"`.
- `line_id`: `"line: somchai99"`, `"Line ID somchai_99"`, `"LINE id: @shop123"`, `"lineid: somchai"`, `"id line abc.def"`,
  `"ไลน์ somchai99"`, `"ไลน์: abc123"`, `"ไอดีไลน์: somchai"`, `"ไลน์ไอดี somchai"`, `"แอดไลน์ @abc123"`.
- `social_handle`: `"ig: somchai.j"`, `"IG @somchai"`, `"@somchai_j"`, `"ติดตามที่ @abc123 นะ"`, `"fb: somchai"`,
  `"facebook.com/somchai.j"`, `"https://www.instagram.com/somchai/"`, `"tiktok.com/@somchai"`, `"line.me/ti/p/~somchai"`,
  `"ไอจี somchai99"`, `"เฟส: somchai.j"`, `"เฟสบุ๊ค somchai.j"`, `"john@gmail"`.

Exact-result cases:
- `detectPii("line: 0812345678")` → `["phone"]` (masking: the number is not also reported as a LINE id).
- `detectPii("ไลน์ 0812345678")` → `["phone"]`.
- `detectPii("โทร 0812345678 หรือ line: abc123 อีเมล a@b.co ig: somchai")` → `["phone", "email", "line_id", "social_handle"]`.

Negatives (normal wishes, which must return `[]`):
`"ขอให้ทุกคนมีความสุข"`, `"ขอให้ครอบครัวแข็งแรง ปี 2569 ปังๆ"`, `"ขอให้น้องหายป่วย ๒๕๖๙"`, `"ปี 2568 2569 2570"`,
`"สุขสันต์วันลอยกระทง 24/11/2569"`, `"ครบรอบ 10 ปี 25 พ.ย."`, `"ขอให้ถูกหวยเลข 123456"`, `"ขอให้ธุรกิจเติบโต 100,000,000 บาท"`,
`"ราคา 1 500 000 บาท"`, `"ไปเที่ยว 19.00-21.00 น."`, `"เวลา 05.30 07.45"`, `"ขอให้ได้เกรด 4.00"`, `"ซื้อ 2 ชิ้น @100 บาท"`,
`"สวัสดีครับ @ทุกคน"`, `"ขอบคุณเพื่อนในไลน์กลุ่มทุกคน"`, `"ขอให้ได้งานที่ Google"`, `"Happy Loy Krathong 2026!"`,
`"Year 2026, 2027 and 2028"`, `"May all my wishes come true"`, `"a line of lanterns on the river"`, `"deadline: tomorrow"`,
`"online: hello world"`, `"See you at 7.30 pm"`, `"the time is 10:30"`, `"email me later"`, `"love you @ 100%"`,
`"IG is fun"`, `"my fb friends"`.

`isPhoneDigitRun`: `"081 234 5678"` → true; `"2569 081 234 5678"` → true; `"66 81 234 5678"` → true; `"2569"` → false;
`"123456"` → false; `"0812345"` → false; `"08123456789012"` (no separators, 14 digits) → false.

Robustness: `detectPii("a".repeat(50_000) + "@" + "b".repeat(50_000))` returns (it contains `social_handle`), and so does
`detectPii("0 ".repeat(30_000) + "line ".repeat(20_000))` within the default test timeout. `detectPii("")` → `[]`.

### `src/services/moderation/profanityFilter.test.ts` (default jsdom env)
Positives (`true`): `"ไอ้เหี้ย"`, `"ควย"`, `"ขอให้มันฉิบหาย"`, `"ระยำ"`, `"ไอ้สัส"`, `"เ ห ี้ ย"` (spaced out), `"fuck you"`, `"FUCK"`,
`"ＦＵＣＫ"`, `"motherfucker"`, `"sh1t happens"`, `"Bitch!"`.
Negatives (`false`): `"ขอให้ทุกคนมีความสุข"`, `"ล่องเรือในแควยาวไกล"`, `"ทำความสะอาดเกลี้ยงเหี้ยน"`, `"สัดส่วนที่ดี"`,
`"ขอให้แม่งานสบายดี"`, `"ขอให้ปีเสือกระโดดไกล"`, `"Good luck in class"`, `"I love Dickens novels"`, `"Scunthorpe United"`,
`"shiitake soup"`, `"Happy Loy Krathong 2026!"`, `""`.

### `src/services/moderation/wishGuard.test.ts` (node env, which proves the server can run it)
1. `checkPublicWish("ขอให้ทุกคนมีความสุข")` → `{ ok: true }`. Same for `"May all my wishes come true"`.
2. `checkPublicWish("โทร 0812345678")` → `{ ok: false, reasons: ["phone"] }`. `checkPublicWish("ไอ้เหี้ย ig: somchai")` →
   `{ ok: false, reasons: ["social_handle", "profanity"] }` (order = `MODERATION_REASONS`).
3. One Thai and one English case per reason gives `ok: false` with that reason (reuse two inputs per category from the tables above).
4. `checkPublicWish(5 as unknown as string)` throws `TypeError`, and the message does not contain `"5"`.
5. `describeModerationReasons(["profanity", "phone", "phone"])` → `{ title: MODERATION_COPY.blockedTitle,
   messages: [MODERATION_COPY.reasons.phone, MODERATION_COPY.reasons.profanity], hint: MODERATION_COPY.fixHint }`.
6. `toModerationBlockedBody(["email"])` → `{ error: "moderation_blocked", reasons: ["email"] }`. With `const text = "somchai@gmail.com"`,
   `JSON.stringify(toModerationBlockedBody(guard.reasons))` does not contain `"somchai"` (the text is never echoed).
7. `parseModerationBlockedBody`: the valid body → the same; `{ error: "moderation_blocked", reasons: [] }` → null;
   `reasons: ["phone", "other"]` → null; `null`, `[]`, `"x"`, `{ error: "x", reasons: ["phone"] }` → null.

### `src/services/api/creationValidation.test.ts` (modify: add cases only)
- "rejects a public wish with PII / profanity": `publicWishText` `"โทร 081-234-5678"`, `"line: somchai99"`, `"somchai@gmail.com"`,
  `"ไอ้เหี้ย"`, `"fuck"` → each throws `CreationRepositoryError` with code `invalid_input` and detail `publicWishText`, and `err.message`
  does not contain the input (for example `"0812"` / `"somchai"`).
- "a private creation is not moderated": `makeNewCreation({ publicWishText: null, privateWish: makePrivateWish() })` passes. (The private
  plaintext never reaches the repository. Only ciphertext does.)
- `"ขอให้ปี 2569 ทุกคนสุขภาพแข็งแรง"` passes.

### `src/services/api/inMemoryCreationRepository.test.ts` (modify: add cases only)
Use the controllable clock as in MFW-12.
1. "insert with a PII public wish stores nothing": `insertCreation(makeNewCreation({ publicWishText: "0812345678" }))` rejects with
   `invalid_input` / `publicWishText`, and the next `listPublicZone` has the same length as before.
2. "report: counts, flags at 3, then hidden": insert a public creation `c`. Then `reportCreation(c.id)` → `"counted"` and the state is
   `{ reportCount: 1, moderationStatus: "approved" }`, still listed. A second report → `"counted"`, count 2, still listed. A third →
   `"counted"`, `{ reportCount: 3, moderationStatus: "flagged" }`, and **not** listed. A fourth → `"ignored"`, count stays 3.
3. "report ignores private-only creations": `publicWishText: null, privateWish: makePrivateWish()` → `"ignored"`, count 0.
4. "report ignores unknown, hidden and expired": a valid uuid that was never inserted → `"ignored"`. After
   `setModeration(id, { moderationStatus: "hidden" })` → `"ignored"`. Insert with `expiresAt = new Date(t + 1000)`, then `t += 1000` → `"ignored"`.
5. "report rejects a non-uuid": `"nope"`, `""` and the uppercase form of a real id reject with `invalid_input` / `creationId`.
6. `getModerationState("00000000-0000-4000-8000-000000000000")` → `null`. Mutating the returned object does not change the next call's result.

### `src/services/api/supabaseCreationRepository.test.ts` (modify: add cases only)
Same `fetchMock` helper as MFW-12.
1. "report request": the mock returns `new Response("true", { status: 200 })`. `reportCreation(id)` → `"counted"`. There is exactly one call. Its
   `pathname` is `/rest/v1/rpc/mfw_report_creation`, `init.method` is `"POST"`, and `JSON.parse(init.body)` equals `{ p_creation_id: id }` (sorted keys
   exactly `["p_creation_id"]`). The headers have `apikey`, `authorization: Bearer test-service-key` and `content-type: application/json`.
2. `"false"` → `"ignored"`. `"{}"`, `"null"`, `"1"` → reject with `invalid_backend_response` / `report`.
3. "report non-2xx: no body is read": a 500 `Response` whose body contains `OWNER_HASH_FIXTURE`. Spy on `res.json` / `res.text` → it rejects
   `backend_request_failed` / `status 500`, neither spy was called, and the message contains neither the hash nor the key.
4. "invalid report id makes no request": `"nope"` → `invalid_input`, and `fetchMock` was not called.
5. "insert with a PII public wish makes no request": `insertCreation(makeNewCreation({ publicWishText: "ig: somchai" }))` → `invalid_input`,
   and `fetchMock` was not called.

### `src/services/api/reportHandler.test.ts` (node)
Helper: `const post = (body: string, headers: Record<string, string> = { "content-type": "application/json" }) =>
handleReportCreation(new Request("http://localhost/api/reports", { method: "POST", headers, body }), () => repo);`
where `repo = createInMemoryCreationRepository({ now: () => t })` is seeded with one public creation `c`.
1. Valid `{"creationId": c.id}` → 202, body `{ status: "received" }`, and `cache-control` contains `no-store`. `repo.getModerationState(c.id)?.reportCount === 1`.
2. "same response for unknown ids": a never-inserted valid uuid → 202 `{ status: "received" }` (identical body), and nothing changes.
3. `content-type: application/json; charset=utf-8` is accepted. `text/plain`, a missing content-type and `application/x-www-form-urlencoded` → 415
   `{ error: "unsupported_media_type" }`, and the count is unchanged.
4. 400 `{ error: "invalid_body" }` for: `"not json"`, `"[]"`, `"null"`, `"{}"`, `{"creationId": 5}`, `{"creationId": "nope"}`, an uppercase uuid,
   and **"rejects extra keys (ownerToken)"**: `{"creationId": c.id, "ownerToken": "A".repeat(43)}` → 400, with the count unchanged.
5. 413 `{ error: "payload_too_large" }` for a body of `REPORT_REQUEST_MAX_BYTES + 1` bytes (for example `{"creationId":"<id>","pad":"xxx…"}`),
   and for a `content-length` header above the cap.
6. "repository failure → 503 without details": a repository whose `reportCreation` rejects with `new Error("boom " + OWNER_HASH_FIXTURE)` → 503,
   the body is exactly `{ error: "unavailable" }`, and the text does not contain the hash. A getter that throws
   `CreationRepositoryError("backend_misconfigured", "SUPABASE_URL")` → 503.
7. "no private fields in any response": for each response above, the text contains none of `owner_token`, `ownerToken`, `owner_token_hash`,
   `private_wish_text`, `privateWish`, `report_count`, `reportCount`, `moderation_status`, `moderationStatus`.

### `src/app/api/reports/route.test.ts` (node)
1. "real POST without Supabase env": `vi.resetModules()`, `vi.stubEnv("SUPABASE_URL", "")`, `vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")`,
   `const { POST } = await import("./route")`, then a POST with a valid random uuid → 202 `{ status: "received" }`. `vi.unstubAllEnvs()` in `afterEach`.
2. **"three reports hide the item from GET /api/creations" (AC 3)**: with one in-memory repo `repo`, seed a public creation `c` (zone 1),
   then call `handleReportCreation` three times with `() => repo`. After each call, `handleListCreations(new Request(
   "http://localhost/api/creations?event=loy_krathong&zone=1"), () => repo)`. After reports 1 and 2 the item is in `items`. After report 3
   it is not. `repo.getModerationState(c.id)` is `{ reportCount: 3, moderationStatus: "flagged" }`.

### `tests/unit/report-migration.test.ts` (node)
Read `supabase/migrations/20261124010000_mfw13_report_creation.sql` as `raw`. Let `sql = raw.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").toLowerCase()`.
1. "runs after the MFW-12 migration": the sorted file names of `supabase/migrations/` contain a file matching `/_mfw12_/`, and this file sorts after it.
2. It contains `create function public.mfw_report_creation(p_creation_id uuid) returns boolean`, `security invoker` and `set search_path = ''`, and does
   not contain `security definer`.
3. "threshold equals AUTO_HIDE_REPORT_THRESHOLD": it contains `o.report_count < ${AUTO_HIDE_REPORT_THRESHOLD}` and
   `o.report_count + 1 >= ${AUTO_HIDE_REPORT_THRESHOLD}`.
4. "flags at the threshold": it contains `'${AUTO_HIDE_MODERATION_STATUS}'::public.moderation_status` and `o.moderation_status = '${DEFAULT_MODERATION_STATUS}'`.
5. "only visible public wishes are counted": it contains `p.public_wish_text is not null` and `p.expires_at > now()`.
6. "server-only": it contains `revoke all on function public.mfw_report_creation(uuid) from public, anon, authenticated` and
   `grant execute on function public.mfw_report_creation(uuid) to service_role`. `/\bgrant\b[^;]*\b(anon|authenticated)\b/` does not match, and every
   `/\bgrant\b[^;]*\bto (\w+)/g` capture is `service_role`.
7. "no schema changes here": `/create table|alter table|drop |create policy|create view|select \*|returning \*/` does not match `sql`.
8. `raw` contains `notify pgrst, 'reload schema'`.

### `tests/unit/moderation-boundary.test.ts` (node)
Copy the `walk()` helper from `tests/unit/owner-token-boundary.test.ts` (non-test `.ts/.tsx/.js/.mjs` files). Paths are repo-relative with `/`.
1. "detector modules import rules only from moderation.config": for every non-test file under `src/services/moderation`, every
   `/from\s+["']([^"']+)["']/g` capture is `"@/config/moderation.config"` or starts with `"./"`.
2. "detector is pure": those files do not match `/\bconsole\.|\bfetch\(|process\.env|localStorage|Date\.now|Math\.random/`.
3. "report route exports only POST": `src/app/api/reports/route.ts` has exactly one `export`, and it matches `/export async function POST\(/`.
4. "report route and handler never touch tokens": `src/app/api/reports/route.ts` and `src/services/api/reportHandler.ts` do not match
   `/ownerToken|owner_token|privateWish|private_wish|\bconsole\./`.
5. "client code cannot import the report handler": no file under `src/components`, `src/store` or `src/core`, and no file under `src/app` outside
   `src/app/api`, matches `/services\/api\/reportHandler\b/`. `src/services/api/index.ts` does not match `/["']\.\/reportHandler["']/`.
6. A self-check that patterns 1, 2 and 4 detect sample strings.

### `tests/e2e/reports-api.spec.ts` (new; production build without Supabase env)
```ts
import { expect, test } from "@playwright/test";

const SOME_ID = "00000000-0000-4000-8000-000000000000";

test("POST /api/reports accepts a well-formed report", async ({ request }) => {
  const res = await request.post("/api/reports", { data: { creationId: SOME_ID } });
  expect(res.status()).toBe(202);
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect(await res.json()).toEqual({ status: "received" });
});

test("POST /api/reports rejects bad bodies and media types", async ({ request }) => {
  const bad = await request.post("/api/reports", { data: { creationId: "nope" } });
  expect(bad.status()).toBe(400);
  expect(await bad.json()).toEqual({ error: "invalid_body" });
  const plain = await request.post("/api/reports", { headers: { "content-type": "text/plain" }, data: "x" });
  expect(plain.status()).toBe(415);
  const get = await request.get("/api/reports");
  expect(get.status()).toBe(405);
});
```

Invariant tests from CLAUDE.md:
- G: Thai and English positive and negative cases (detector tables). Server enforcement is covered by `creationValidation`, in-memory and
  Supabase insert cases. The client alone is never trusted.
- C: report responses never contain private names (`reportHandler.test.ts` case 7). Extra keys such as `ownerToken` are rejected. The blocked body never echoes text.
- D: the new function is `security invoker`, revoked from clients and granted to `service_role` only (`report-migration.test.ts`). No table, policy or grant changes.
- A: there are no coordinates in this card, and the existing scanner covers `src/services`, `src/app/api` and `supabase`.
- E / F / FALLBACK_2D: not applicable, because this card has no rendering, animation or effects.

## Do NOT

- Do not build the WishModal, its toggle, its warning UI or any React component (MFW-21). Do not build the InspectPopup or Report button
  UI, or a client `fetch` helper for reports (MFW-28). Do not build `POST /api/creations`, encryption or zone assignment (MFW-45). Do not build
  ownership proof (MFW-31), a moderator console, un-flag tooling or a deletion job.
- Do not add per-device / per-IP report deduplication, rate limiting, CAPTCHAs, report reasons or a reports table. These are product decisions
  (Open question 1), and the default ships without them.
- Do not moderate the private wish. Do not change the auto-hide threshold (3, owner decision 3) or hide-on-read logic in the MFW-12 view.
- **Do not edit the MFW-12 migration.** Do not apply any migration, run the Supabase CLI or connect to any database.
- Never accept, require, log or return the owner token, its hash or any private field on the report path. Never put the creation id or anything
  else in a query string for reports (the id goes in the JSON body only).
- Never log or echo the wish text, a matched substring or the request body. There is no `console.*` anywhere in this card. Error bodies are fixed shapes.
- Do not use NFKC/NFC normalization, named capture groups, the `s` regex flag, or `.test()` on a global regex.
- No new dependencies (no profanity/PII libraries, no `zod`, no `server-only`). No `package.json` / lockfile changes.
- Do not touch `.claude/**`, `scripts/**`, `.github/**`, `CLAUDE.md`, `AGENTS.md`, `docs/spec/**` (including `open-questions.md`),
  `docs/backlog*.json`, `docs/prompts/**`, `docs/plans/**`, `vitest.config.mts`, `playwright.config.ts`, `eslint.config.mjs`, `tsconfig.json`,
  `next.config.ts`, `src/core/**`, `src/store/**`, `src/components/**`, `src/services/auth/**`, `src/config/ownership.config.ts`,
  `supabase/migrations/20261124000000_*`, or MFW-12's GET route/handler. The only change allowed in existing test files is to add cases and the
  `reportCreation` stub from Step 7. If an existing MFW-12 test's public wish text trips the new guard, stop and report it (none is expected).

## Definition of done

- Run each of these separately and get green: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm e2e`. In this cloud container
  run e2e as `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell pnpm e2e`. Make sure no Supabase env vars are set in your shell while doing so.
- `pnpm build` output lists `ƒ /api/reports` (dynamic) next to `ƒ /api/creations`.
- Delete `playwright-report/` and `test-results/` before committing. Never commit `.next/` or `*.tsbuildinfo`. If `next dev` rewrote `AGENTS.md`, leave it alone.
- Branch `feat/MFW-13-pii-guard-profanity-filter-report` from the latest `main`, **after MFW-12 is merged**.
- Conventional commit(s) with the key, for example `feat(moderation): PII guard, profanity filter and report endpoint MFW-13`.
- PR title = the commit subject. The English body contains: a link to MFW-13; each AC as a checklist item with the file/test that proves it; Decisions
  (copy D1–D14); the Open questions (the word lists and copy are placeholders for owner review); the test plan (five commands and their results);
  the owner's apply step for the new migration (apply it on the staging project after the MFW-12 migration, OQ 17); and follow-ups
  (WishModal in MFW-21, server reasons in MFW-45, Report button in MFW-28, a moderation/un-flag process, report anti-abuse).
- Leave the PR open. Labels `privacy` / `moderation` and the new migration → the owner merges after reviewer + qa + privacy-auditor pass.

## Interfaces this card provides

| Export | Path | Signature | Used by |
|---|---|---|---|
| `checkPublicWish` | `@/services/moderation` | `(text: string) => WishGuardResult` | MFW-21 (live warning), MFW-45 (server reasons) |
| `WishGuardResult` | same | `{ ok: true } \| { ok: false; reasons: readonly ModerationReason[] }` | MFW-21, MFW-45 |
| `detectPii`, `containsProfanity`, `normalizeForModeration`, `isPhoneDigitRun` | same | `(text) => readonly PiiReason[]`, `(text) => boolean`, `(text) => string`, `(run) => boolean` | future festivals and tests |
| `describeModerationReasons` | same | `(reasons) => { title; messages; hint }` (Thai) | MFW-21 |
| `ModerationBlockedBody`, `toModerationBlockedBody`, `parseModerationBlockedBody` | same | `{ error: "moderation_blocked"; reasons }` | MFW-45 (422 body), MFW-21 (parse) |
| `isModerationReason`, `ModerationReason`, `PiiReason` | same / `@/config/moderation.config` | type guard + unions | MFW-21, MFW-45 |
| `MODERATION_REASONS`, `MODERATION_COPY` (incl. `publicHint`), rule lists | `@/config/moderation.config` | Step 1 | MFW-21 (copy), owner edits |
| `AUTO_HIDE_MODERATION_STATUS`, `REPORT_REQUEST_MAX_BYTES` | same | `"flagged"`, `1024` | moderation follow-ups |
| `CreationRepository.reportCreation`, `ReportOutcome` | `@/services/api/creationRepository` | `(id: string) => Promise<"counted" \| "ignored">` | report route; later moderation tooling |
| `InMemoryCreationRepository.getModerationState` | `@/services/api/inMemoryCreationRepository` | `(id) => { reportCount; moderationStatus } \| null` | tests of MFW-28 / MFW-45 |
| Server backstop | `validateNewCreation` (`@/services/api/creationValidation`) | a public wish failing the guard → `invalid_input` / `publicWishText` | MFW-45 (maps it to 422 after its own `checkPublicWish`) |
| `handleReportCreation`, `parseReportRequest` | `@/services/api/reportHandler` (server only) | `(req, getRepo) => Promise<Response>` | route |
| `POST /api/reports` | `src/app/api/reports/route.ts` | body `{ creationId }` (JSON) → 202 `{status:"received"}` · 400 `{error:"invalid_body"}` · 413 · 415 · 503; `Cache-Control: no-store` | MFW-28 Report button |
| `REPORT_ENDPOINT_PATH`, `ReportRequestBody`, `ReportAcceptedBody`, `ReportErrorBody` | `@/services/api` (client-safe barrel) | Step 13 | MFW-28 |
| `REPORT_CREATION_RPC_PATH` | `@/config/database.config` | `"rpc/mfw_report_creation"` | Supabase repository |
| DB: `public.mfw_report_creation(uuid) returns boolean` | `supabase/migrations/20261124010000_mfw13_report_creation.sql` | service_role only | Supabase repository |

## Open questions

These are product decisions only. This card ships the default listed under each one, and the owner can change it later without rework.

1. **Report anti-abuse: how many reports may one person make?** The spec is silent. Without limits, any three POSTs hide any public wish.
   Default: no server-side deduplication and no stored reporter identity. Every well-formed report of a visible public wish counts,
   and the count stops at 3. The Report button (MFW-28) can disable itself locally after one tap. Options: (a) the default, for the private
   test; (b) one report per device: the client sends a separate random reporter id, the server stores its hash in a new reports table
   (spoofable by clearing storage); (c) per-IP deduplication with a salted IP hash plus a retention rule (personal data, so privacy posture);
   (d) Vercel firewall / rate-limit rules before the Christmas launch; (e) auto-hide only after reports from N distinct reporters.
2. **Contents of the banned-word lists and the warning copy.** The spec gives no words. This card ships PLACEHOLDER starter lists (15 Thai, 13
   English, plus a 3-entry Thai allowlist) and DRAFT Thai copy. Should rude pronouns such as "กู"/"มึง" be blocked (they also match innocent
   words such as "กู้")? Should "@word" always count as a social handle ("@home")? The owner (or a moderator) should review the lists in
   `moderation.config.ts`. Each change is a one-line edit with a test row.
3. **Other personal data in public wishes:** Thai national ID (13 digits), bank account numbers, any web link, home addresses, full names. The AC
   lists only phone, email, LINE ID and social handles, so the default blocks only those (plus social profile links). Options: add
   any of these categories as new `ModerationReason`s.
4. **Who reviews flagged items, and how is one restored?** At 3 reports the item becomes `flagged` and is hidden. Default: no console. The owner
   edits the row in Supabase (set `moderation_status = 'approved'` **and** reset `report_count`, otherwise the view keeps hiding it). Options:
   a small owner-only admin page later, or auto-delete flagged items.
5. **Should the private wish get a warning too?** Decision 13 allows profanity in the private wish, and nothing blocks PII there (it is encrypted
   and only the owner can read it). Default: no warning. Option: a soft, non-blocking hint in the WishModal (MFW-21).
6. (Still open from MFW-12, OQ 2) **Maximum wish length.** The guard has no length limit and stays fast on 100 000 characters. The cap belongs to MFW-45 / MFW-21.

## Decisions

- **D1 — One pure, dependency-free detector in `src/services/moderation/`, shared by client and server.** The WishModal warns while the user types,
  and the server applies the same rules, so the two can never disagree. No third-party profanity/PII library: none handles Thai phone formats or
  Thai substring words, and a new dependency needs owner approval.
- **D2 — Explicit normalization instead of NFKC.** Full-width ASCII, Thai digits and invisible characters are folded by hand, then the text is lowercased.
  NFKC would split SARA AM (ำ) and break Thai words such as "ระยำ". The prototype confirmed this.
- **D3 — Rules run in a fixed order, and each match is masked with spaces.** Reasons stay unambiguous ("line: 0812345678" → `phone`). The order is
  e-mail → links → phone → LINE → social keywords → @handle. Reasons are returned in `MODERATION_REASONS` order.
- **D4 — Phone detection from the Thai numbering plan, with no digit-count heuristic.** Digit runs may contain up to 3 separators of `space - . ( )`. A run is a phone
  when some sequence of its digit groups is a Thai mobile (10 digits, 06/08/09), a fixed line (9 digits, 02–05/07) or the +66 form. Years ("2569"),
  dates with "/", prices with ",", times and 6-digit lottery numbers do not match.
- **D5 — LINE IDs and social handles need an anchor:** a keyword plus a separator (Latin), a Thai keyword, an `@` handle with a letter, or a profile URL,
  with a handle of at least 3 characters. Bare English words after "line"/"ig" ("a line of lanterns", "IG is fun") stay allowed.
- **D6 — Profanity matching.** Thai is matched as substrings of a compact form (no whitespace/punctuation), because Thai has no word spaces. A small
  allowlist removes innocent hosts (เกลี้ยงเหี้ยน, แควยาว, สัสดี). English is matched per Latin word with `word`/`prefix`/`contains` modes, which avoids
  "class"/"Dickens"/"Scunthorpe" problems, after a small leetspeak fold.
- **D7 — The guard returns reasons only, never offsets or matched text.** Nothing that could hold PII is copied into errors, logs or responses.
  The UI already has the user's own text.
- **D8 — Server backstop in `validateNewCreation`.** Every repository write refuses a failing public wish, so a future write path cannot skip the
  guard (invariant G). MFW-45 still calls `checkPublicWish` first, because it must answer with the reasons ("rejected with the reasons", backlog 2.4).
- **D9 — `POST /api/reports` with a JSON body `{ creationId }`.** There is no dynamic route segment and no query string. Requiring
  `Content-Type: application/json` forces a CORS preflight, so other sites cannot silently fire reports from a visitor's browser.
  Unknown keys are rejected (as in 2.4), so a token can never be sent here. The body is capped at 1 KB (a valid body is 53 bytes).
- **D10 — The same 202 `{ status: "received" }` for counted and ignored reports.** This avoids revealing whether an id exists, is hidden or is private-only.
  Only malformed requests get 4xx.
- **D11 — Only visible public-text creations are counted, and at the threshold the status becomes `'flagged'`.** The spec's report is "สำหรับข้อความสาธารณะ".
  `flagged` means "auto-hidden, awaiting review". `hidden` stays free for a deliberate moderator decision. Both are hidden by the MFW-12 view (owner decision 3).
- **D12 — The atomic increment is a new SQL function in a new migration** (`security invoker`, `search_path = ''`, execute for `service_role` only).
  It is one `UPDATE`, so concurrent reports cannot push the count past 3. The MFW-12 migration is never edited.
- **D13 — Regex lookbehind is allowed.** Next 16 supports Safari 16.4+ and TS accepts it at ES2017. Named groups are not allowed (TS1503).
- **D14 — Copy and lists live in `moderation.config.ts`** (spec §3: "กฎการกรอง PII และคำต้องห้าม"), so the owner can edit them without touching code.

## Out of scope

The WishModal and its warning rendering (MFW-21). The Report button / InspectPopup and the client report fetch (MFW-28). The create route and its
422 mapping (MFW-45). Ownership proof (MFW-31). Moderator console, un-flag tooling, report reasons, reporter deduplication and rate limiting (Open
questions 1 and 4). Extra PII categories (Open question 3). Applying migrations or setting up staging (OQ 17). Christmas work.

## Risks

- **The SQL was not run against a database in planning.** It uses only constructs proven in MFW-12's PG16 probe (`plpgsql`, `security invoker`,
  `search_path = ''`, schema-qualified enum cast, `update … from`). The owner should apply it on staging right after the MFW-12 migration and call
  `select public.mfw_report_creation('<id>')` four times on a test row (expect true, true, true, false; status `flagged`). They should also check that the anon key gets
  `permission denied` on the RPC.
- **Report abuse.** With the default, three requests hide any public wish (Open question 1). This is acceptable for a private test with known testers,
  but not for the Christmas public launch.
- **Detection limits.** These forms are not detected: spelled-out digits ("ศูนย์แปดหนึ่ง…"), digits split by Thai words or commas, spaced Latin letters
  ("f u c k"), repeated letters ("fuuuck"), Thai tone-mark variants and new slang. Some false positives are possible: a 9-digit lottery-style number starting
  "02"–"05"/"07", "line: <word>", "@word", or a Thai social keyword followed by any Latin word ("ไลน์ group"). The tables document the accepted behaviour, and the
  lists are config.
- **The lists ship in the client bundle.** Anyone can read them and work around them. The server check is still authoritative.
- **Thai substring matching can still over-block** words that are not yet in the allowlist. Every reported false positive becomes a new allowlist entry plus a test row.
- **Restoring a flagged item needs two column changes** (status and count). If only the status is reset, the item stays hidden (Open question 4).
- **Interface change.** Adding `reportCreation` to `CreationRepository` breaks typed test doubles and any implementation that MFW-45/MFW-25 might have written
  meanwhile. This card fixes the existing ones (Step 7).
