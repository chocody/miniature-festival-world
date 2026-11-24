# MFW-21 [4.3] Wish / let-go composer modal (WishModal) — implementation spec

> Hand-off spec for one card. It is the source of truth for the implementer and the reviewer. If this file and
> `docs/backlog.json` / `docs/spec/open-questions.md` disagree, those files win, and the PR must say so.
> Branch: `feat/MFW-21-wish-let-go-composer-modal` · Jira: MFW-21 · Epic: MFW-18 (Loop 4)
> Labels: `loy-krathong`, `ui`, `privacy`. Extra reviewer on top of lead/dev/reviewer/qa: **privacy-auditor** (the diff
> touches wish text, `src/services/**` and moderation). This card is labelled `privacy`, so the PR stays open and the
> **owner merges it**. `r3f-perf-reviewer` is not needed: no 3D, canvas, effects or world code changes.

## Summary

This card replaces the `WRITE_WISH` placeholder step with the **WishModal**. In it the user writes a wish or something
to let go ("เขียนคำอธิษฐานหรือสิ่งที่อยากปล่อยวาง") and makes an **explicit** choice between "เก็บข้อความเป็นส่วนตัว" (keep
private) and "เผยแพร่แบบไม่ระบุตัวตน (Anonymous)" (publish anonymously). When the user picks public, the modal runs the 2.3 guard
(`checkPublicWish` from MFW-13) on every change. It shows the Thai PII/profanity warning and **blocks** submitting until the text
is clean or the user switches to private. A pure, isomorphic contract module (`src/services/api/wishPayload.ts`) turns the draft
into a `ComposedWish` and maps it to exactly one column (`toWishColumns`: public text → public column only, private text →
private column only). It also gives the create API (MFW-45) and the release flow (MFW-23) the same rules. **Nothing is sent to
a server in this card.** The composed wish goes into `useBuilderStore` (memory only), and story 5.1 (MFW-23) saves the creation. The
MFW-11 ownership notice moves into the modal.

## Prerequisites

| Card | State (2026-11-24, `main` = a6ce8f3) | What this card uses |
|---|---|---|
| MFW-7 [1.1] flow | merged | `FlowRoot` (`src/components/ui/FlowRoot.tsx`), `useUIStore().dispatch`, state `"WRITE_WISH"`, event `{ type: "SUBMIT_WISH" }` |
| MFW-11 [2.1] owner token | merged (2ade761) | `OwnershipNotice` (`src/components/ui/OwnershipNotice.tsx`, `role="note"`, `data-testid="ownership-notice"`), `OWNERSHIP_LOSS_WARNING` |
| MFW-12 [2.2] API & DB | merged (d8934b3) | client-safe barrel `src/services/api/index.ts`; boundary test `tests/unit/public-private-boundary.test.ts` (see the traps in **Do NOT**) |
| MFW-20 [4.2] customizer | merged (c466788) | `useBuilderStore` with `appearance` + `chooseKrathong`; Tailwind/touch-target conventions of `CustomizerPanel.tsx`; `MIN_TOUCH_TARGET_PX = 44` |
| MFW-9 [1.3] device store | merged | `useDeviceStore` → `reducedMotion`, `qualityTier`, `profiled` |
| **MFW-13 [2.3] PII guard** | **NOT merged** (under review; plan `docs/plans/MFW-13.md`) | see ASSUMED INTERFACE below |

Backlog 4.3 is **blocked by 2.3 and 4.2**. Cut the branch from `main` only after MFW-13 is merged. If it is not merged, stop and
say so. Do not copy MFW-13 code into this branch.

**ASSUMED INTERFACE (from MFW-13 plan).** The lead checked it against MFW-13's in-progress implementation on 2026-11-24. Check
each item on `main` before you start. If a name or signature differs, use the real one and say so in the PR. If something is
missing, stop and report.
- `@/services/moderation` exports `checkPublicWish(text: string): WishGuardResult`, where
  `WishGuardResult = { readonly ok: true } | { readonly ok: false; readonly reasons: readonly ModerationReason[] }`. Reasons are unique,
  in `MODERATION_REASONS` order, and the function throws `TypeError` for a non-string.
- `@/services/moderation` exports `describeModerationReasons(reasons): ModerationWarning`, where
  `ModerationWarning = { readonly title: string; readonly messages: readonly string[]; readonly hint: string }` (Thai copy).
- `@/services/moderation` exports `parseModerationBlockedBody(value: unknown): ModerationBlockedBody | null`, where
  `ModerationBlockedBody = { readonly error: "moderation_blocked"; readonly reasons: readonly ModerationReason[] }`. It returns null
  unless the value is exactly that shape with ≥ 1 known reason, and it puts the reasons in canonical order.
- `@/services/moderation` re-exports `type ModerationReason` (`"phone" | "email" | "line_id" | "social_handle" | "profanity"`).
- `@/config/moderation.config` exports `MODERATION_COPY` with `publicHint`, `blockedTitle`, `fixHint` and `reasons: Record<ModerationReason, string>`.
  Values as of MFW-13's implementation:
  `publicHint` = "คำอธิษฐานแบบสาธารณะจะแสดงให้ทุกคนเห็น กรุณาอย่าใส่ข้อมูลส่วนบุคคล เช่น เบอร์โทรศัพท์ อีเมล ไลน์ไอดี หรือชื่อบัญชีโซเชียล",
  `blockedTitle` = "ยังเผยแพร่ข้อความนี้แบบสาธารณะไม่ได้", `fixHint` = "กรุณาลบข้อมูลส่วนนี้ออกก่อนเผยแพร่",
  `reasons.phone` = "มีเบอร์โทรศัพท์อยู่ในข้อความ", `reasons.email` = "มีอีเมลอยู่ในข้อความ", `reasons.line_id` = "มีไลน์ไอดีอยู่ในข้อความ",
  `reasons.social_handle` = "มีชื่อบัญชีหรือลิงก์โซเชียลอยู่ในข้อความ", `reasons.profanity` = "มีคำไม่เหมาะสมอยู่ในข้อความ".
  **Tests must read these from `MODERATION_COPY`, never hard-code them** (except the Playwright file, which may not import `src/`).
- `tests/unit/moderation-boundary.test.ts` (MFW-13) allows files in `src/services/moderation/` to import only `@/config/moderation.config`
  and `./…`. That is why this card puts nothing in that folder.

Facts the lead checked in this repo (2026-11-24):
- The lead ran the guard from MFW-13's implementation on the exact test strings used below:
  `"โทรหาฉัน 081-234-5678"`, `"Call me 0812345678"` → `["phone"]`; `"ติดต่อ a.b@example.com"` → `["email"]`;
  `"ไลน์ myid123"` → `["line_id"]`; `"ig: lantern_girl"` → `["social_handle"]`; `"fuck this"`, `"ขอให้ครอบครัวแข็งแรง ไอ้สัตว์"` → `["profanity"]`;
  `"ขอให้รวย โทร 0812345678 อีเมล me@example.com"` → `["phone","email"]`. These pass: `"ขอให้ปี 2569 ทุกคนมีความสุข"`,
  `"Happy Loy Krathong everyone"`, `"May all lanterns light the way in 2026"`, `"ขอให้สอบผ่าน"`, `"ขอให้ทุกคนมีความสุข"`.
- The lead also built a **full prototype of this spec** in a scratch copy of `main` with MFW-13's moderation files: the config, the payload module,
  the store, WishModal, the FlowRoot change, the updated FlowRoot tests, the e2e helper and the updated e2e specs.
  `tsc`, `eslint`, the whole vitest suite (only `stores.test.ts` failed, which Step 6 updates) and **all 18 Playwright tests** passed
  (production build, SwiftShader, 360 px). The code blocks below are that prototype.
- **Next.js renders a route announcer `<div role="alert" id="__next-route-announcer__">` in production.** In Playwright,
  `getByRole("alert")` therefore matches 2 elements. In e2e, find the warning by `data-testid="wish-moderation-warning"`. (jsdom unit tests do not render the
  announcer, so `getByRole("alert")` is fine there.)
- `getInteractionMode("WRITE_WISH")` is `null`, so no 3D scene is mounted in this step on any tier. The modal is plain DOM and is the same on
  `HIGH | MEDIUM | LOW | FALLBACK_2D`.
- `tests/unit/public-private-boundary.test.ts` fails if the snake_case column names `private_wish_text`, `owner_token_hash`, `owner_token` or
  `private_wish_key_id` appear in **any non-test file under `src/`** outside the ownership path, **including comments**.
- `src/store/stores.test.ts` asserts the exact key list of `useBuilderStore`, so it must be updated (Step 6).
- Five existing e2e specs walk through `WRITE_WISH` by clicking "ถัดไป". After this card the step needs text plus a choice. Step 10
  updates them through one helper.
- No `@testing-library/user-event` is installed. Use `fireEvent` (as the existing tests do).
- No Next.js API is used. Only a `"use client"` component inside the existing client tree (`FlowRoot` is already `"use client"`).

## Acceptance criteria → checks

AC text is verbatim from `docs/backlog.json` story 4.3.

1. **"Explicit choice: keep private vs publish anonymously"**
   - The modal shows a radio group (`<fieldset>`) with exactly two options, labelled with the spec words "เก็บข้อความเป็นส่วนตัว" and
     "เผยแพร่แบบไม่ระบุตัวตน (Anonymous)". **Neither option is preselected.** Submit ("ถัดไป") is disabled until text is present
     **and** an option is picked. The status line says what is missing.
     Tests: `src/components/ui/WishModal.test.tsx` → "renders the dialog with no choice preselected", "explicit choice is required";
     `src/services/api/wishPayload.test.ts` → "visibility_missing when no choice"; `src/config/wish.config.test.ts` → "option labels are the
     spec words"; `tests/e2e/wish-modal.spec.ts` → "360 px: explicit choice, PII blocked publicly, private allowed, no request, nothing stored".
   - The flow cannot leave `WRITE_WISH` without a valid composed wish. Test: `src/components/ui/FlowRoot.test.tsx` → "WRITE_WISH renders the
     wish modal; SUBMIT_WISH needs a valid wish".
2. **"PII warning and blocking via the 2.3 guard before publishing"**
   - When "public" is chosen, `evaluateWishDraft` runs `checkPublicWish` on the trimmed text. A failure shows a `role="alert"` warning built
     with `describeModerationReasons` (title, one line per reason, hint), sets `aria-invalid` on the textarea and disables submit. A
     programmatic form submit also stores nothing. The standing hint `MODERATION_COPY.publicHint` is shown while "public" is chosen.
     Thai and English cases. Tests: `WishModal.test.tsx` → "Thai phone number blocks publishing", "English email and profanity block
     publishing", "fixing the text unblocks publishing", "public hint is shown only for public"; `wishPayload.test.ts` → the public positive /
     negative tables; e2e (as above).
   - Server feedback: `useBuilderStore.rejectWishFromServer(body)` accepts MFW-45's `moderation_blocked` error body (read with
     `parseModerationBlockedBody`). The modal then shows those reasons and blocks the same text until the user edits it.
     Tests: `src/store/useBuilderStore.test.ts` → "rejectWishFromServer"; `WishModal.test.tsx` → "server reasons block until the user edits".
   - The private wish is **not** moderated (owner decision 13: "the private wish may keep it"). Test: `wishPayload.test.ts` → "private is
     not moderated"; `WishModal.test.tsx` → "switching to private allows the same text".
   - The client check is UX only. The server stays authoritative (invariant G: MFW-13's backstop in `validateNewCreation`, and MFW-45 runs the guard).
3. **"Private text goes only to private_wish_text; public text only to public_wish_text"**
   - A `ComposedWish` holds **one** text and **one** visibility, so the client cannot produce both. `toWishColumns(wish)` returns
     `{ publicWishText, privateWishPlaintext }` with exactly one non-null field: the text in the field that matches the visibility. MFW-45
     maps `publicWishText` → `public_wish_text` and encrypts `privateWishPlaintext` → `private_wish_text`. `toWishRequestFields(wish)`
     produces exactly the 2.4 body fields `{ wishText, wishVisibility }`.
     Tests: `wishPayload.test.ts` → "toWishColumns: public text only in the public column", "toWishColumns: private text only in the
     private column", "toWishRequestFields has exactly the 2.4 keys".
   - The text never leaves the device in this card: no `fetch`, nothing written to LocalStorage/sessionStorage, and no token is created.
     Tests: `WishModal.test.tsx` → "makes no request and stores nothing in the browser"; `tests/unit/wish-boundary.test.ts`; e2e (as above);
     `FlowRoot.test.tsx` → "shows the ownership notice only in WRITE_WISH" (still asserts that no owner token was created).

Invariant checks this card must also pass:
- **F (reduced motion + tiers):** the modal has no movement animation. Its only transitions (`transition-colors`) are dropped when
  `useDeviceStore.reducedMotion` is true. It renders the same on FALLBACK_2D, and no canvas is mounted in `WRITE_WISH`. Tests:
  `WishModal.test.tsx` → "reduced motion removes transitions"; `FlowRoot.test.tsx` → "FALLBACK_2D: the wish modal works and no scene mounts";
  e2e → "reduced motion: no transition classes in the modal", "FALLBACK_2D at 360 px: the modal works without a canvas".
- **C:** no private field or text goes to any public path. This card touches no public path at all (no request, see AC 3).
- **360 px:** no horizontal overflow, and option rows and submit are ≥ 44 px tall. Test: e2e at a 360 × 640 viewport.

## Owner decisions that apply

Quoted from `docs/spec/open-questions.md`. Do not reopen them.
- **Row 13:** "profanity is blocked from public_wish_text (Thai and English lists in moderation.config.ts); the private wish may keep it
  (owner, 2026-11-23)". → The guard runs only when "public" is chosen.
- **Row 1:** "the device keeps the raw DeviceOwnerToken in LocalStorage … sends the raw token over HTTPS to the ownership-proof endpoint
  (POST body or Authorization header, never a URL or query string)". → This card neither reads nor creates the token. It goes in the POST
  body built by MFW-23 for MFW-45.
- **Row 2:** "AES-256-GCM in the server API route; key in a server-only env var". → Encryption of the private text is MFW-45. This card
  only names the field `privateWishPlaintext` so it is obvious that it must be encrypted before storage.
- **Row 16 / launch plan:** build engine pieces generically. → The wish contract and the modal have no Loy Krathong specifics and can be
  reused for Christmas.

No row of `open-questions.md` names MFW-21 in "Decide in", so there is nothing to append. **Do not edit `docs/spec/open-questions.md`.**

## Files

| Path | New/modify | Purpose |
|---|---|---|
| `src/config/wish.config.ts` | new | `WISH_VISIBILITIES`, `WishVisibility`, `WISH_DRAFT_ISSUES`, `WishDraftIssue`, `WISH_TEXT_MAX_LENGTH`, `WISH_TEXTAREA_ROWS`, `WISH_COPY` |
| `src/config/wish.config.test.ts` | new | Config sanity, spec labels |
| `src/services/api/wishPayload.ts` | new (client-safe, isomorphic) | `evaluateWishDraft`, `toWishColumns`, `toWishRequestFields`, `isWishVisibility`, `normalizeWishText`, `moderationReasonsFromServerBody` + types |
| `src/services/api/wishPayload.test.ts` | new (node env) | Contract tests, Thai/English guard tables, AC 3 |
| `src/services/api/index.ts` | modify | Also export the wish payload names (client-safe barrel) |
| `src/store/useBuilderStore.ts` | modify | Add `wish`, `wishServerReasons`, `submitWish`, `rejectWishFromServer` |
| `src/store/useBuilderStore.test.ts` | modify (add cases only) | Wish store cases |
| `src/store/stores.test.ts` | modify (builder shape assertion only) | New exact key list |
| `src/components/ui/WishModal.tsx` | new | The modal |
| `src/components/ui/WishModal.test.tsx` | new | Component tests (AC 1–3, reduced motion, no I/O) |
| `src/components/ui/FlowRoot.tsx` | modify | Render `WishModal` in `WRITE_WISH`; drop the placeholder and the separate `OwnershipNotice` there |
| `src/components/ui/FlowRoot.test.tsx` | modify | Complete the wish step through the modal; two new cases |
| `tests/unit/wish-boundary.test.ts` | new (node env) | Static checks: no network/storage/console/token/3D in the wish files |
| `tests/e2e/helpers/wishStep.ts` | new | `completeWishStep(page)` + duplicated copy literals |
| `tests/e2e/wish-modal.spec.ts` | new | 360 px flow, public pass, FALLBACK_2D, reduced motion |
| `tests/e2e/flow.spec.ts` | modify (1 line) | Use `completeWishStep` |
| `tests/e2e/scene-gating.spec.ts` | modify (2 lines + import) | Use `completeWishStep` |
| `tests/e2e/river-environment.spec.ts` | modify (1 line + import) | Use `completeWishStep` |

Unchanged on purpose: `OwnershipNotice.tsx` and its test, `FlowStepPlaceholder.tsx` (still used for `RITUAL_RELEASE` / `SHARED_WORLD_EXPLORE`),
`src/core/flow/**`, `useUIStore.ts`, `tests/e2e/customizer.spec.ts` (it stops at `WRITE_WISH`).

## Implementation steps

Conventions for every new or changed file: TypeScript strict, English comments, no `any`, `Object.freeze` on exported constant
arrays/objects, **no `console.*`**, no inline numbers except `0`/`1` (use the named constants), and Tailwind classes in the style of
`CustomizerPanel.tsx`. Error messages never contain the wish text. In the four files of Step 8's boundary test (`wish.config.ts`,
`wishPayload.ts`, `useBuilderStore.ts`, `WishModal.tsx`), **never write the words `localStorage`, `sessionStorage`, `fetch(` or
`console.`, not even in comments**. In any non-test `src/` file, **never write `private_wish_text`** (or the other private column names),
not even in comments: write "the private column" instead.

### Step 1 — `src/config/wish.config.ts` (new)

```ts
// MFW-21 (backlog 4.3): wish composer contract, limit and Thai copy.

/** "เก็บข้อความเป็นส่วนตัว" vs "เผยแพร่แบบไม่ระบุตัวตน (Anonymous)" (spec §6.4 Task 4.3). Same values as backlog 2.4 `wishVisibility`. */
export const WISH_VISIBILITIES = Object.freeze(["private", "public"] as const);
export type WishVisibility = (typeof WISH_VISIBILITIES)[number];

/** Why a draft cannot be submitted yet. Order = display order (text field first, then the choice). */
export const WISH_DRAFT_ISSUES = Object.freeze([
  "text_empty",
  "text_too_long",
  "visibility_missing",
  "moderation_blocked",
] as const);
export type WishDraftIssue = (typeof WISH_DRAFT_ISSUES)[number];

/**
 * Max wish length in UTF-16 code units (String.length — the same unit as the textarea maxLength), measured after trimming.
 * One limit for both visibilities. PLACEHOLDER (spec silent) — Open question 1.
 */
export const WISH_TEXT_MAX_LENGTH = 280;
/** Visible textarea rows. Lead decision (layout only). */
export const WISH_TEXTAREA_ROWS = 4;

export interface WishVisibilityOptionCopy {
  readonly label: string;
  readonly description: string;
}

/** Thai UI copy. Labels of the two options are the spec words; everything else is DRAFT copy (Open question 4). */
export const WISH_COPY = Object.freeze({
  title: "เขียนคำอธิษฐาน",
  textLabel: "คำอธิษฐานหรือสิ่งที่อยากปล่อยวาง",
  textPlaceholder: "เขียนสิ่งที่อยากขอ หรือสิ่งที่อยากปล่อยไปกับสายน้ำ",
  visibilityLegend: "จะให้ข้อความนี้เป็นแบบไหน",
  options: Object.freeze({
    private: Object.freeze({
      label: "เก็บข้อความเป็นส่วนตัว",
      description: "ไม่แสดงให้คนอื่นเห็น อ่านได้เฉพาะคุณจากอุปกรณ์นี้",
    }),
    public: Object.freeze({
      label: "เผยแพร่แบบไม่ระบุตัวตน (Anonymous)",
      description: "ทุกคนอ่านได้ โดยไม่แสดงชื่อหรือโปรไฟล์ของคุณ",
    }),
  }) satisfies Readonly<Record<WishVisibility, WishVisibilityOptionCopy>>,
  /** Status line for the first non-moderation issue (the moderation warning has its own copy in MODERATION_COPY). */
  issues: Object.freeze({
    text_empty: "เขียนคำอธิษฐานก่อน",
    text_too_long: "ข้อความยาวเกินกำหนด",
    visibility_missing: "เลือกก่อนว่าจะเก็บเป็นส่วนตัวหรือเผยแพร่แบบไม่ระบุตัวตน",
  }) satisfies Readonly<Record<Exclude<WishDraftIssue, "moderation_blocked">, string>>,
  /** Same label as the other flow steps; e2e and FlowRoot tests click it by this name. */
  submit: "ถัดไป",
});
```

Constant table (all new, all in `src/config/wish.config.ts`):

| Constant | Value | Source |
|---|---|---|
| `WISH_VISIBILITIES` | `["private", "public"]` | backlog 2.4 AC1 ("wishVisibility (private \| public)") |
| `WISH_DRAFT_ISSUES` | `text_empty, text_too_long, visibility_missing, moderation_blocked` | lead (D4) |
| `WISH_TEXT_MAX_LENGTH` | `280` | **PLACEHOLDER (spec silent)**, Open question 1 |
| `WISH_TEXTAREA_ROWS` | `4` | lead, layout only |
| `WISH_COPY.options.*.label` | spec words | spec §6.4 Task 4.3 |
| `WISH_COPY` (all other strings) | above | **DRAFT Thai copy**, Open question 4 |

### Step 2 — `src/services/api/wishPayload.ts` (new, client-safe and server-safe)

Pure module: no React, no store, no I/O, no `Date`, no randomness. It imports only `@/config/wish.config` and `@/services/moderation`.

```ts
import {
  WISH_DRAFT_ISSUES,
  WISH_TEXT_MAX_LENGTH,
  WISH_VISIBILITIES,
  type WishDraftIssue,
  type WishVisibility,
} from "@/config/wish.config";
import { checkPublicWish, parseModerationBlockedBody, type ModerationReason } from "@/services/moderation";

export type { WishDraftIssue, WishVisibility } from "@/config/wish.config";

/** What the user is typing in the WishModal. `visibility` stays null until the user picks one (explicit choice). */
export interface WishDraft {
  readonly text: string;
  readonly visibility: WishVisibility | null;
}

/** A wish that passed evaluateWishDraft: trimmed, non-empty, within the limit and, when public, through the 2.3 guard. */
export interface ComposedWish {
  readonly text: string;
  readonly visibility: WishVisibility;
}

export type WishDraftEvaluation =
  | { readonly ok: true; readonly wish: ComposedWish }
  | {
      readonly ok: false;
      readonly issues: readonly WishDraftIssue[]; // non-empty, unique, WISH_DRAFT_ISSUES order
      readonly moderationReasons: readonly ModerationReason[]; // non-empty only with "moderation_blocked"
    };

/** The two wish columns of a creation. Exactly one is non-null. The server encrypts privateWishPlaintext before storage. */
export interface WishColumns {
  readonly publicWishText: string | null;
  readonly privateWishPlaintext: string | null;
}

/** Wish fields of the POST /api/creations JSON body (backlog 2.4 AC1). */
export interface WishRequestFields {
  readonly wishText: string;
  readonly wishVisibility: WishVisibility;
}

const NO_REASONS: readonly ModerationReason[] = Object.freeze([]);

export function isWishVisibility(value: unknown): value is WishVisibility {
  return typeof value === "string" && (WISH_VISIBILITIES as readonly string[]).includes(value);
}

/** Removes leading and trailing whitespace; inner text and line breaks stay as typed. */
export function normalizeWishText(text: string): string {
  return text.trim();
}

/**
 * Pure draft check shared by the WishModal (client) and the create route (server, MFW-45).
 * Throws TypeError for a malformed draft (non-string text, unknown visibility); the caller validates types first.
 */
export function evaluateWishDraft(draft: WishDraft): WishDraftEvaluation {
  if (typeof draft.text !== "string") throw new TypeError("wish text must be a string");
  if (draft.visibility !== null && !isWishVisibility(draft.visibility)) throw new TypeError("unknown wish visibility");
  const text = normalizeWishText(draft.text);
  const found = new Set<WishDraftIssue>();
  let moderationReasons = NO_REASONS;
  if (text.length === 0) found.add("text_empty");
  else if (text.length > WISH_TEXT_MAX_LENGTH) found.add("text_too_long");
  if (draft.visibility === null) found.add("visibility_missing");
  // Owner decision 13: only the public text is moderated.
  if (draft.visibility === "public" && text.length > 0) {
    const guard = checkPublicWish(text);
    if (!guard.ok) {
      found.add("moderation_blocked");
      moderationReasons = guard.reasons;
    }
  }
  if (found.size === 0 && draft.visibility !== null) {
    return Object.freeze({ ok: true as const, wish: Object.freeze({ text, visibility: draft.visibility }) });
  }
  return Object.freeze({
    ok: false as const,
    issues: Object.freeze(WISH_DRAFT_ISSUES.filter((issue) => found.has(issue))),
    moderationReasons,
  });
}

/** Backlog 4.3 AC3: public text goes only to the public column, private text only to the private column. */
export function toWishColumns(wish: ComposedWish): WishColumns {
  switch (wish.visibility) {
    case "public":
      return Object.freeze({ publicWishText: wish.text, privateWishPlaintext: null });
    case "private":
      return Object.freeze({ publicWishText: null, privateWishPlaintext: wish.text });
    default: {
      const unreachable: never = wish.visibility;
      void unreachable;
      throw new TypeError("unknown wish visibility");
    }
  }
}

/** The wish part of the POST /api/creations body (MFW-23 builds the body, MFW-45 parses it). */
export function toWishRequestFields(wish: ComposedWish): WishRequestFields {
  return Object.freeze({ wishText: wish.text, wishVisibility: wish.visibility });
}

/** Reasons from an untrusted create-API error body, or null when it is not a moderation_blocked body. */
export function moderationReasonsFromServerBody(body: unknown): readonly ModerationReason[] | null {
  return parseModerationBlockedBody(body)?.reasons ?? null;
}
```

Notes:
- The guard still runs on a too-long public text, so both issues are reported at once (`["text_too_long", "moderation_blocked"]`).
- An empty public text does **not** run the guard. Its only issue is `text_empty`, and `moderationReasons` is `[]`.
- Suggested server use for MFW-45. **MFW-45's own plan decides**; this card must not build it:
  `isWishVisibility(body.wishVisibility)` and `typeof body.wishText === "string"` first (else 400), then `evaluateWishDraft(...)`.
  A `moderation_blocked` result becomes 422 `toModerationBlockedBody(evaluation.moderationReasons)`, and other issues become 400. Then
  `toWishColumns(evaluation.wish)`: `publicWishText` goes into `NewCreation.publicWishText`, and `privateWishPlaintext` is encrypted into `NewCreation.privateWish`.

### Step 3 — `src/services/api/index.ts` (modify)

Append (keep the existing exports; if MFW-13 added report exports, keep them too):
```ts
export {
  evaluateWishDraft,
  isWishVisibility,
  moderationReasonsFromServerBody,
  normalizeWishText,
  toWishColumns,
  toWishRequestFields,
  type ComposedWish,
  type WishColumns,
  type WishDraft,
  type WishDraftEvaluation,
  type WishDraftIssue,
  type WishRequestFields,
  type WishVisibility,
} from "./wishPayload";
```
`wishPayload` is not one of the server modules that `public-private-boundary.test.ts` forbids in the barrel. Client code may import it.

### Step 4 — `src/store/useBuilderStore.ts` (modify)

Keep `chooseKrathong` and its doc comment exactly as they are. Add the wish state and two actions. Final file:

```ts
import { create } from "zustand";
import {
  applyKrathongChoice,
  DEFAULT_KRATHONG_APPEARANCE,
  krathongAppearanceEquals,
  type EventAppearance,
  type KrathongChoice,
  type KrathongChoiceResult,
} from "@/core/customization";
import type { ModerationReason } from "@/services/moderation";
import {
  evaluateWishDraft,
  moderationReasonsFromServerBody,
  type ComposedWish,
  type WishDraft,
  type WishDraftEvaluation,
} from "@/services/api/wishPayload";

export interface BuilderActions {
  /** (unchanged MFW-20 doc comment) */
  chooseKrathong: (choice: KrathongChoice) => KrathongChoiceResult;
  /**
   * Evaluates the draft (2.3 guard when public). Only when ok: stores the composed wish and clears server reasons.
   * Otherwise the store is untouched (same state reference).
   */
  submitWish: (draft: WishDraft) => WishDraftEvaluation;
  /**
   * Reads an untrusted create-API error body (MFW-45). A moderation_blocked body stores its reasons (the wish is kept,
   * so the modal reopens with the text) and returns true; anything else changes nothing and returns false.
   */
  rejectWishFromServer: (body: unknown) => boolean;
}

/** The creation currently being customized (spec §3: useBuilderStore). */
export interface BuilderState extends BuilderActions {
  appearance: EventAppearance | null;
  /** The composed wish of this creation. In memory only (never persisted); MFW-23 sends it when saving. */
  wish: ComposedWish | null;
  /** Reasons the server gave for refusing the public wish; null when none. */
  wishServerReasons: readonly ModerationReason[] | null;
}

export const useBuilderStore = create<BuilderState>()((set, get) => ({
  appearance: null,
  wish: null,
  wishServerReasons: null,
  chooseKrathong: (choice) => {
    const current = get().appearance ?? DEFAULT_KRATHONG_APPEARANCE;
    const result = applyKrathongChoice(current, choice);
    if (result.ok && !krathongAppearanceEquals(result.appearance, current)) set({ appearance: result.appearance });
    return result;
  },
  submitWish: (draft) => {
    const result = evaluateWishDraft(draft);
    if (result.ok) set({ wish: result.wish, wishServerReasons: null });
    return result;
  },
  rejectWishFromServer: (body) => {
    const reasons = moderationReasonsFromServerBody(body);
    if (reasons === null) return false;
    set({ wishServerReasons: reasons });
    return true;
  },
}));
```
Do not add zustand `persist` middleware or any other storage. The store must not import `@/services/auth`.

### Step 5 — `src/components/ui/WishModal.tsx` (new)

Layout decision (D7): an in-flow dialog panel (`role="dialog"`, labelled by its heading, no `aria-modal`, no focus trap, no
backdrop). `WRITE_WISH` has no other content and no 3D scene, and on iOS a fixed bottom sheet fights the on-screen keyboard. No
close button (the flow is forward-only, MFW-7). No `autoFocus` (on a small phone the keyboard would hide the choice).

```tsx
"use client";

import { useId, useState, type FormEvent } from "react";
import { MODERATION_COPY } from "@/config/moderation.config";
import {
  WISH_COPY,
  WISH_TEXT_MAX_LENGTH,
  WISH_TEXTAREA_ROWS,
  WISH_VISIBILITIES,
  type WishVisibility,
} from "@/config/wish.config";
import { evaluateWishDraft } from "@/services/api/wishPayload";
import { describeModerationReasons, type ModerationReason } from "@/services/moderation";
import { useBuilderStore } from "@/store/useBuilderStore";
import { useDeviceStore } from "@/store/useDeviceStore";
import { OwnershipNotice } from "./OwnershipNotice";

export interface WishModalProps {
  /** Called after the composed wish is in useBuilderStore; FlowRoot dispatches SUBMIT_WISH. */
  onSubmitted: () => void;
}

/** Wish / let-go composer (backlog 4.3): text, explicit private vs anonymous-public choice, live 2.3 guard warning. */
export function WishModal({ onSubmitted }: WishModalProps) {
  const ids = useId();
  const storedWish = useBuilderStore((s) => s.wish);
  const storedServerReasons = useBuilderStore((s) => s.wishServerReasons);
  const submitWish = useBuilderStore((s) => s.submitWish);
  const reducedMotion = useDeviceStore((s) => s.reducedMotion);
  // Initial values only: re-opening the step shows the stored wish; later store changes do not overwrite typing.
  const [text, setText] = useState(storedWish?.text ?? "");
  const [visibility, setVisibility] = useState<WishVisibility | null>(storedWish?.visibility ?? null);
  const [serverReasons, setServerReasons] = useState<readonly ModerationReason[] | null>(storedServerReasons);

  const evaluation = evaluateWishDraft({ text, visibility });
  const reasons = serverReasons ?? (evaluation.ok ? [] : evaluation.moderationReasons);
  const warning = reasons.length > 0 ? describeModerationReasons(reasons) : null;
  const firstIssue = evaluation.ok ? undefined : evaluation.issues.find((i) => i !== "moderation_blocked");
  const status = firstIssue === undefined ? null : WISH_COPY.issues[firstIssue];
  const canSubmit = evaluation.ok && serverReasons === null;
  // Invariant F: colour transitions only, and none under reduced motion.
  const transition = reducedMotion ? "" : " transition-colors";

  const titleId = `${ids}-title`;
  const textId = `${ids}-text`;
  const countId = `${ids}-count`;
  const warningId = `${ids}-warning`;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    if (submitWish({ text, visibility }).ok) onSubmitted();
  };

  return (
    <section
      role="dialog"
      aria-labelledby={titleId}
      data-testid="wish-modal"
      data-reduced-motion={reducedMotion ? "true" : "false"}
      className="flex w-full flex-col gap-4 rounded-3xl border border-black/10 bg-white p-4 shadow-lg dark:border-white/15 dark:bg-zinc-900"
    >
      <h2 id={titleId} className="text-xl font-semibold">
        {WISH_COPY.title}
      </h2>
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={textId} className="text-sm font-medium">
            {WISH_COPY.textLabel}
          </label>
          <textarea
            id={textId}
            value={text}
            rows={WISH_TEXTAREA_ROWS}
            maxLength={WISH_TEXT_MAX_LENGTH}
            placeholder={WISH_COPY.textPlaceholder}
            aria-describedby={warning ? `${countId} ${warningId}` : countId}
            aria-invalid={warning ? true : undefined}
            onChange={(e) => {
              setText(e.target.value);
              setServerReasons(null);
            }}
            className="w-full resize-none rounded-2xl border border-black/15 bg-white p-3 text-base dark:border-white/20 dark:bg-zinc-800"
          />
          <p id={countId} className="self-end text-xs text-zinc-600 dark:text-zinc-300">
            {`${text.length}/${WISH_TEXT_MAX_LENGTH}`}
          </p>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">{WISH_COPY.visibilityLegend}</legend>
          {WISH_VISIBILITIES.map((v) => {
            const option = WISH_COPY.options[v];
            const inputId = `${ids}-vis-${v}`;
            return (
              <label
                key={v}
                htmlFor={inputId}
                data-visibility={v}
                className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border p-3${transition} ${
                  visibility === v
                    ? "border-amber-500 bg-amber-50 dark:bg-amber-400/10"
                    : "border-black/10 dark:border-white/15"
                }`}
              >
                <input
                  id={inputId}
                  type="radio"
                  name={`${ids}-visibility`}
                  value={v}
                  checked={visibility === v}
                  aria-labelledby={`${inputId}-label`}
                  aria-describedby={`${inputId}-desc`}
                  onChange={() => {
                    setVisibility(v);
                    setServerReasons(null);
                  }}
                  className="mt-0.5 h-5 w-5 shrink-0"
                />
                <span className="flex flex-col">
                  <span id={`${inputId}-label`} className="font-semibold">
                    {option.label}
                  </span>
                  <span id={`${inputId}-desc`} className="text-sm text-zinc-600 dark:text-zinc-300">
                    {option.description}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
        {visibility === "public" && (
          <p data-testid="wish-public-hint" className="text-sm text-zinc-700 dark:text-zinc-200">
            {MODERATION_COPY.publicHint}
          </p>
        )}
        {warning && (
          <div
            role="alert"
            id={warningId}
            data-testid="wish-moderation-warning"
            className="rounded-2xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100"
          >
            <p className="font-semibold">{warning.title}</p>
            <ul className="list-disc pl-5">
              {warning.messages.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            <p>{warning.hint}</p>
          </div>
        )}
        {status && (
          <p data-testid="wish-status" aria-live="polite" className="text-sm text-zinc-600 dark:text-zinc-300">
            {status}
          </p>
        )}
        <OwnershipNotice />
        <button
          type="submit"
          disabled={!canSubmit}
          className={`min-h-11 min-w-11 self-end rounded-full bg-zinc-900 px-5 text-white${transition} hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300`}
        >
          {WISH_COPY.submit}
        </button>
      </form>
    </section>
  );
}
```

Behaviour summary (the tests check each line):
- Initial: text `""`, no radio checked, submit disabled, status = `WISH_COPY.issues.text_empty`.
- The radio accessible names are the labels only (descriptions go through `aria-describedby`).
- Status shows the **first** non-moderation issue in `WISH_DRAFT_ISSUES` order, or nothing.
- Public chosen → `wish-public-hint` shows `MODERATION_COPY.publicHint`. Guard failure → `role="alert"` warning, textarea `aria-invalid="true"`, submit disabled.
- Private chosen → no hint, no warning, and PII/profanity text is accepted (decision 13).
- Server reasons (from the store at mount) are shown and block submit until the text or the choice changes.
- Submit → `submitWish` (re-evaluates) → `onSubmitted()` only when ok. The `if (!canSubmit) return;` guard also covers a programmatic submit.
- The counter shows `text.length` (untrimmed, the unit `maxLength` counts). The limit check uses the trimmed text.
- The `OwnershipNotice` (MFW-11) is inside the dialog. It is the only `role="note"` in the step.

### Step 6 — `src/store/stores.test.ts` (modify the builder assertions only)

Replace
```ts
expect(builder.appearance).toBeNull();
expect(Object.keys(builder).sort()).toEqual(["appearance", "chooseKrathong"]);
expect(typeof builder.chooseKrathong).toBe("function");
```
with
```ts
expect(builder.appearance).toBeNull();
expect(builder.wish).toBeNull();
expect(builder.wishServerReasons).toBeNull();
expect(Object.keys(builder).sort()).toEqual([
  "appearance",
  "chooseKrathong",
  "rejectWishFromServer",
  "submitWish",
  "wish",
  "wishServerReasons",
]);
for (const action of ["chooseKrathong", "submitWish", "rejectWishFromServer"] as const) {
  expect(typeof builder[action]).toBe("function");
}
```
Leave the rest of the file alone. If MFW-25 has merged in the meantime and changed the `useWorldStore` line, keep its version.

### Step 7 — `src/components/ui/FlowRoot.tsx` (modify)

1. Replace `import { OwnershipNotice } from "./OwnershipNotice";` with `import { WishModal } from "./WishModal";`.
2. Remove the line `  WRITE_WISH: { type: "SUBMIT_WISH" },` from `NEXT_EVENT`. SUBMIT_WISH is now dispatched only by the modal.
3. Remove `{flowState === "WRITE_WISH" && <OwnershipNotice />}`. The notice now renders inside the modal.
4. In the step switch, add a `WRITE_WISH` branch before the placeholder:
   ```tsx
   ) : flowState === "CUSTOMIZE_OBJECT" ? (
     <CustomizerPanel … unchanged … />
   ) : flowState === "WRITE_WISH" ? (
     <WishModal onSubmitted={() => dispatch({ type: "SUBMIT_WISH" })} />
   ) : (
     <FlowStepPlaceholder … unchanged … />
   )}
   ```
Change nothing else (scene gating, data attributes, the other steps). If MFW-25 has merged first, keep its `useEffect` and `ZoneNavigator` lines.

### Step 8 — `tests/unit/wish-boundary.test.ts` (new)

```ts
// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

const WISH_FILES = [
  "src/config/wish.config.ts",
  "src/services/api/wishPayload.ts",
  "src/store/useBuilderStore.ts",
  "src/components/ui/WishModal.tsx",
];
/** The wish never leaves the device in this card (MFW-23 / MFW-45 send it). */
const IO = /\bfetch\(|localStorage|sessionStorage|indexedDB|document\.cookie|sendBeacon|XMLHttpRequest|\bconsole\./;
/** No owner token here (decision 1: only the save flow sends it). */
const AUTH_IMPORT = /from\s+["']@\/services\/auth/;
/** Same pattern as CustomizerPanel.boundary.test.ts: keep the landing bundle free of 3D code. */
const THREE_D =
  /from\s+["'](three|@react-three\/[^"']+|@react-spring\/[^"']+|@\/components\/canvas3d[^"']*|@\/components\/models\/[^"']+)["']/;

describe("wish boundary (invariants C, G)", () => {
  it("scanner patterns detect samples", () => {
    expect(IO.test("window.localStorage.setItem(k, v)")).toBe(true);
    expect(IO.test("await fetch(url)")).toBe(true);
    expect(IO.test("const total = 1")).toBe(false);
    expect(AUTH_IMPORT.test('import { getDeviceOwnerVault } from "@/services/auth"')).toBe(true);
    expect(THREE_D.test('import { animated } from "@react-spring/three"')).toBe(true);
  });

  it.each(WISH_FILES)("%s does no I/O, logs nothing and imports no token or 3D code", (file) => {
    const src = read(file);
    expect(IO.test(src)).toBe(false);
    expect(AUTH_IMPORT.test(src)).toBe(false);
    expect(THREE_D.test(src)).toBe(false);
  });

  it("wishPayload stays pure (no React, no store, no clock)", () => {
    const src = read("src/services/api/wishPayload.ts");
    expect(src).not.toMatch(/from\s+["'](react|zustand|@\/store\/[^"']+)["']|Date\.now|Math\.random/);
  });

  it("FlowRoot renders the ownership notice only through the modal", () => {
    expect(read("src/components/ui/FlowRoot.tsx")).not.toMatch(/OwnershipNotice/);
    expect(read("src/components/ui/WishModal.tsx")).toMatch(/<OwnershipNotice \/>/);
  });
});
```

### Step 9 — `tests/e2e/helpers/wishStep.ts` (new)

```ts
import { expect, type Page } from "@playwright/test";

/** Duplicated literals of WISH_COPY in src/config/wish.config.ts (do not import src/ into Playwright). */
export const WISH_DIALOG_TITLE = "เขียนคำอธิษฐาน";
export const WISH_TEXT_LABEL = "คำอธิษฐานหรือสิ่งที่อยากปล่อยวาง";
export const WISH_PRIVATE_LABEL = "เก็บข้อความเป็นส่วนตัว";
export const WISH_PUBLIC_LABEL = "เผยแพร่แบบไม่ระบุตัวตน (Anonymous)";
export const WISH_SUBMIT_LABEL = "ถัดไป";
export const CLEAN_WISH = "ขอให้ทุกคนมีความสุข";

/** Fills the WishModal with a clean private wish and submits it (WRITE_WISH → RITUAL_RELEASE). */
export async function completeWishStep(page: Page, text: string = CLEAN_WISH): Promise<void> {
  await page.getByRole("textbox", { name: WISH_TEXT_LABEL }).fill(text);
  await page.getByRole("radio", { name: WISH_PRIVATE_LABEL }).check();
  const submit = page.getByRole("button", { name: WISH_SUBMIT_LABEL });
  await expect(submit).toBeEnabled();
  await submit.click();
}
```
Playwright's default `testMatch` only picks up `*.spec.ts` / `*.test.ts`, so this file is not run as a test.

### Step 10 — update the existing e2e specs (minimal edits)

Add `import { completeWishStep } from "./helpers/wishStep";` under the `@playwright/test` import in each file, then:
- `tests/e2e/flow.spec.ts`: directly after `await expect(page.getByRole("note")).toHaveText(OWNERSHIP_WARNING);`, replace
  `await page.getByRole("button", { name: "ถัดไป" }).click();` with `await completeWishStep(page);`. Keep every other line, including the note
  assertions. The notice is still the only note.
- `tests/e2e/scene-gating.spec.ts`: in the 3D test, the "ถัดไป" click right after `await expectNoScene(page);` in `WRITE_WISH` → `await completeWishStep(page);`.
  In the FALLBACK_2D test, of the two consecutive "ถัดไป" clicks, keep the first (customizer) and replace the **second** with `await completeWishStep(page);`.
- `tests/e2e/river-environment.spec.ts`: the "ถัดไป" click right after the `WRITE_WISH` assertion → `await completeWishStep(page);`.
- `tests/e2e/customizer.spec.ts`: no change (it stops at `WRITE_WISH`).

## Tests

All tests run without a database or network. Reset stores in `beforeEach` with
`useBuilderStore.setState(useBuilderStore.getInitialState(), true)` (and the same for `useDeviceStore` / `useUIStore` where used), and call
`window.localStorage.clear()` in jsdom files that assert on storage.

### `src/config/wish.config.test.ts` (first line `// @vitest-environment node`)
1. `WISH_VISIBILITIES` equals `["private", "public"]` and `Object.isFrozen` is true. Same for `WISH_DRAFT_ISSUES` (exact list from Step 1).
2. "option labels are the spec words": `WISH_COPY.options.private.label === "เก็บข้อความเป็นส่วนตัว"` and
   `WISH_COPY.options.public.label === "เผยแพร่แบบไม่ระบุตัวตน (Anonymous)"`. `Object.keys(WISH_COPY.options)` equals `WISH_VISIBILITIES`.
3. `Object.keys(WISH_COPY.issues).sort()` equals `WISH_DRAFT_ISSUES.filter((i) => i !== "moderation_blocked").sort()`, and every value is a non-empty string.
4. `Number.isInteger(WISH_TEXT_MAX_LENGTH) && WISH_TEXT_MAX_LENGTH > 0`, and the same for `WISH_TEXTAREA_ROWS`. `WISH_COPY.submit === "ถัดไป"`.

### `src/services/api/wishPayload.test.ts` (first line `// @vitest-environment node`, which proves the server can run it)
1. `isWishVisibility`: true for `"private"` and `"public"`. False for `"Public"`, `"anonymous"`, `""`, `null`, `undefined`, `1`, `{}`.
2. `normalizeWishText("  ขอให้มีความสุข \n")` → `"ขอให้มีความสุข"`. `normalizeWishText("a\nb")` → `"a\nb"`.
3. "visibility_missing when no choice": `{ text: "ขอให้ทุกคนมีความสุข", visibility: null }` → `{ ok: false, issues: ["visibility_missing"], moderationReasons: [] }`.
4. `{ text: "", visibility: null }` → issues `["text_empty", "visibility_missing"]`. `{ text: "   \n ", visibility: "private" }` → `["text_empty"]`.
   `{ text: "", visibility: "public" }` → `["text_empty"]` with `moderationReasons` `[]` (the guard is not run).
5. Valid: `{ text: "  ขอให้ทุกคนมีความสุข  ", visibility: "public" }` → `{ ok: true, wish: { text: "ขอให้ทุกคนมีความสุข", visibility: "public" } }`. The same for `"private"`.
   The result and `result.wish` are frozen.
6. Length: `"ก".repeat(WISH_TEXT_MAX_LENGTH)` private → ok. `"ก".repeat(WISH_TEXT_MAX_LENGTH + 1)` private → `["text_too_long"]`.
   `` ` ${"ก".repeat(WISH_TEXT_MAX_LENGTH)} ` `` private → ok (trimmed first). `"โทร 0812345678 " + "ก".repeat(WISH_TEXT_MAX_LENGTH)` public →
   `["text_too_long", "moderation_blocked"]` with reasons `["phone"]`.
7. Public positive table (`it.each`). Each gives `ok: false`, `issues: ["moderation_blocked"]` and exactly these reasons:
   | text | reasons |
   |---|---|
   | `"โทรหาฉัน 081-234-5678"` | `["phone"]` |
   | `"Call me 0812345678"` | `["phone"]` |
   | `"ติดต่อ a.b@example.com"` | `["email"]` |
   | `"ไลน์ myid123"` | `["line_id"]` |
   | `"ig: lantern_girl"` | `["social_handle"]` |
   | `"fuck this"` | `["profanity"]` |
   | `"ขอให้ครอบครัวแข็งแรง ไอ้สัตว์"` | `["profanity"]` |
   | `"ขอให้รวย โทร 0812345678 อีเมล me@example.com"` | `["phone", "email"]` |
8. Public negative table: `"ขอให้ปี 2569 ทุกคนมีความสุข"`, `"Happy Loy Krathong everyone"`, `"May all lanterns light the way in 2026"`,
   `"ขอให้สอบผ่าน"`, `"ขอให้ทุกคนมีความสุข"` → `ok: true`.
9. "private is not moderated": every text of table 7 with `visibility: "private"` → `ok: true` and `wish.text` equals the trimmed input.
10. Malformed: `evaluateWishDraft({ text: 42 as never, visibility: "private" })` and
    `evaluateWishDraft({ text: "x", visibility: "everyone" as never })` throw `TypeError`. The error message does not contain the text.
11. "toWishColumns: public text only in the public column": `toWishColumns({ text: "ขอให้ทุกคนมีความสุข", visibility: "public" })` →
    `{ publicWishText: "ขอให้ทุกคนมีความสุข", privateWishPlaintext: null }`. Its `Object.keys` equals `["publicWishText", "privateWishPlaintext"]`.
12. "toWishColumns: private text only in the private column": `{ text: "อยากปล่อยวางเรื่องเก่า", visibility: "private" }` →
    `{ publicWishText: null, privateWishPlaintext: "อยากปล่อยวางเรื่องเก่า" }`. For both visibilities exactly one value is non-null, and
    `JSON.stringify(result.publicWishText)` does not contain the private text. `toWishColumns({ text: "x", visibility: "both" as never })` throws `TypeError`.
13. "toWishRequestFields has exactly the 2.4 keys": `toWishRequestFields({ text: "t", visibility: "private" })` →
    `{ wishText: "t", wishVisibility: "private" }`, with keys exactly `["wishText", "wishVisibility"]`.
14. `moderationReasonsFromServerBody({ error: "moderation_blocked", reasons: ["email", "phone"] })` → `["phone", "email"]` (canonical
    order). These give `null`: `null`, `"moderation_blocked"`, `{ error: "x", reasons: ["phone"] }`,
    `{ error: "moderation_blocked", reasons: [] }`, `{ error: "moderation_blocked", reasons: ["unknown"] }`, `{ error: "unavailable" }`.

If MFW-13's final word lists changed before merge so that a row of table 7/8 no longer matches, replace that row with a case from
MFW-13's own `piiDetector.test.ts` / `profanityFilter.test.ts` tables and say so in the PR. **Never edit MFW-13's lists.**

### `src/store/useBuilderStore.test.ts` (modify: add a `describe("wish", …)` block; keep the existing cases)
In `beforeEach`, also call `window.localStorage.clear()`.
1. Initial `wish` and `wishServerReasons` are `null`.
2. `submitWish({ text: "  ขอให้ทุกคนมีความสุข ", visibility: "private" })` → result `ok: true`, and the store `wish` is
   `{ text: "ขอให้ทุกคนมีความสุข", visibility: "private" }`.
3. An invalid draft (`{ text: "โทรหาฉัน 081-234-5678", visibility: "public" }`) → result `ok: false` with `moderationReasons` `["phone"]`. The state reference is
   unchanged (`useBuilderStore.getState()` is the same object as before).
4. "rejectWishFromServer": after a valid public submit, `rejectWishFromServer({ error: "moderation_blocked", reasons: ["email"] })` → `true`,
   `wishServerReasons` equals `["email"]`, and `wish` is unchanged. For `rejectWishFromServer({ error: "unavailable" })` and
   `rejectWishFromServer(null)` → `false`, and the state reference is unchanged.
5. A following valid `submitWish` clears `wishServerReasons` to `null`.
6. `submitWish` does not change `appearance`, and `chooseKrathong` does not change `wish`. Other stores keep their references (as in the
   existing "leaves other stores alone" case).
7. After cases 2–5, `window.localStorage.length === 0`.

### `src/components/ui/WishModal.test.tsx` (jsdom)
Setup: `afterEach(() => { cleanup(); vi.unstubAllGlobals(); })`. In `beforeEach`, reset the builder and device stores and clear localStorage.
Helpers: `const dialog = () => screen.getByRole("dialog", { name: WISH_COPY.title })`,
`const textbox = () => screen.getByRole("textbox", { name: WISH_COPY.textLabel })`,
`const radio = (v: WishVisibility) => screen.getByRole("radio", { name: WISH_COPY.options[v].label })`,
`const submit = () => screen.getByRole("button", { name: WISH_COPY.submit })`,
`const type = (value: string) => fireEvent.change(textbox(), { target: { value } })`.
1. "renders the dialog with no choice preselected": the dialog exists; both radios are `not.toBeChecked()`; `submit()` is disabled;
   `getByTestId("wish-status")` has the text `WISH_COPY.issues.text_empty`; `within(dialog()).getByRole("note")` has the text `OWNERSHIP_LOSS_WARNING`;
   the textarea has `maxLength` `WISH_TEXT_MAX_LENGTH`.
2. "explicit choice is required": `type("ขอให้ทุกคนมีความสุข")` → submit still disabled, status = `WISH_COPY.issues.visibility_missing`.
   `fireEvent.click(radio("private"))` → enabled, no status. `fireEvent.click(submit())` → `onSubmitted` called once, and the store `wish` is
   `{ text: "ขอให้ทุกคนมีความสุข", visibility: "private" }`.
3. "public hint is shown only for public": no `wish-public-hint` at first. Click public → the hint has the text `MODERATION_COPY.publicHint`. Click private → it is gone.
4. "Thai phone number blocks publishing": `type("โทรหาฉัน 081-234-5678")` and click public. Then `getByRole("alert")` contains
   `MODERATION_COPY.blockedTitle`, `MODERATION_COPY.reasons.phone` and `MODERATION_COPY.fixHint`; the textarea has `aria-invalid="true"`; submit is disabled.
   `fireEvent.submit(dialog().querySelector("form")!)` → `onSubmitted` not called and the store `wish` is still `null`.
5. "English email and profanity block publishing": public plus `type("email me at someone@example.com")` → the alert contains `MODERATION_COPY.reasons.email`.
   `type("fuck this")` → the alert contains `MODERATION_COPY.reasons.profanity` and no longer contains `reasons.email`.
6. "fixing the text unblocks publishing": continuing from a blocked public text, `type("ขอให้ทุกคนมีความสุข")` → `queryByRole("alert")` is null and
   submit is enabled. Submit → the store `wish.visibility === "public"`.
7. "switching to private allows the same text": with public and the phone text blocked, click private → no alert, no public hint, submit enabled.
   Submit → the store `wish` is `{ text: "โทรหาฉัน 081-234-5678", visibility: "private" }` (it stays on the private path, decision 13).
8. "server reasons block until the user edits": before rendering, `useBuilderStore.setState({ wish: { text: "ขอให้ทุกคนมีความสุข", visibility: "public" } })`
   and `useBuilderStore.getState().rejectWishFromServer({ error: "moderation_blocked", reasons: ["email"] })`. Render → the textarea value is the
   text, the public radio is checked, the alert contains `MODERATION_COPY.reasons.email`, and submit is disabled. `type("ขอให้ทุกคนมีความสุขมาก")` →
   no alert, submit enabled.
9. Too long: `fireEvent.change` with `"ก".repeat(WISH_TEXT_MAX_LENGTH + 1)` (fireEvent bypasses `maxLength`) and private → status =
   `WISH_COPY.issues.text_too_long`, submit disabled, and the counter shows `` `${WISH_TEXT_MAX_LENGTH + 1}/${WISH_TEXT_MAX_LENGTH}` ``.
10. "reduced motion removes transitions": `act(() => useDeviceStore.getState().setReducedMotion(true))` before render → dialog
    `data-reduced-motion="true"` and `dialog().querySelectorAll('[class*="transition"]').length === 0`. With the default (`false`) →
    `data-reduced-motion="false"` and the count is `> 0` (the option rows and submit).
11. "makes no request and stores nothing in the browser": `const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);` then complete a
    private wish and a public wish (re-render) → `fetchSpy` not called; `window.localStorage.length === 0` and `window.sessionStorage.length === 0`.
12. "re-opening shows the composed wish": submit a private wish, `cleanup()`, render again → the textarea value equals the text and the private radio is checked.

### `src/components/ui/FlowRoot.test.tsx` (modify)
Add `import { WISH_COPY } from "@/config/wish.config";` and this helper below the mocks:
```ts
const completeWish = (text = "ขอให้ทุกคนมีความสุข") => {
  fireEvent.change(screen.getByRole("textbox", { name: WISH_COPY.textLabel }), { target: { value: text } });
  fireEvent.click(screen.getByRole("radio", { name: WISH_COPY.options.private.label }));
  fireEvent.click(screen.getByRole("button", { name: WISH_COPY.submit }));
};
```
Replace the "ถัดไป" click made **in `WRITE_WISH`** with `completeWish()` in exactly three tests: "clicks through all 5 states" (the click after
`expect(stateOf(container)).toBe("WRITE_WISH")`), "shows the ownership notice only in WRITE_WISH" (the click after the note assertion; keep
the final `DEVICE_OWNER_TOKEN_STORAGE_KEY` null assertion), and "mounts the lazy scene only in canvas modes on a profiled 3D tier" (the
click after the `scene-viewport` null assertion). The lead's prototype passed all existing cases with these edits. Add:
1. "WRITE_WISH renders the wish modal; SUBMIT_WISH needs a valid wish": go to `WRITE_WISH`. The dialog (`name: WISH_COPY.title`) exists and "ถัดไป" is
   disabled. `fireEvent.click` on it → still `WRITE_WISH`. `completeWish()` → `RITUAL_RELEASE`, the dialog is gone, and `useBuilderStore.getState().wish` is
   `{ text: "ขอให้ทุกคนมีความสุข", visibility: "private" }`.
2. "FALLBACK_2D: the wish modal works and no scene mounts": `act(() => useDeviceStore.getState().setQualityTier("FALLBACK_2D"))`. Go to
   `WRITE_WISH` → the dialog exists and `queryByTestId("scene-viewport")` is null. `completeWish()` → `RITUAL_RELEASE`, and still no scene-viewport.

### `tests/unit/wish-boundary.test.ts` — Step 8.

### `tests/e2e/wish-modal.spec.ts` (new)
`test.use({ viewport: { width: 360, height: 640 }, hasTouch: true })`. Import the literals from `./helpers/wishStep`. Duplicate
`MIN_TOUCH_TARGET_PX = 44` with the same comment style as `customizer.spec.ts`, plus `PHONE_REASON = "มีเบอร์โทรศัพท์อยู่ในข้อความ"` and
`PII_WISH = "โทรหาฉัน 081-234-5678"`. Helper `toWishStep(page)`: `goto("/")`, click "Loy Krathong", click "ถัดไป", expect `data-flow-state="WRITE_WISH"`.
**Find the warning by `page.getByTestId("wish-moderation-warning")`, never by `getByRole("alert")`** (Next's route announcer is also an alert).
1. "360 px: explicit choice, PII blocked publicly, private allowed, no request, nothing stored":
   collect `page.on("request")` URLs whose pathname starts with `/api/` **after** `toWishStep` returns. Dialog `WISH_DIALOG_TITLE` visible;
   `document.documentElement.scrollWidth <= clientWidth`; submit disabled. Fill `PII_WISH` → still disabled. Check public → the warning contains
   `PHONE_REASON` and submit is disabled. Each `[data-visibility]` row and the submit button: `box.x + box.width <= 360.5` and
   `Math.round(box.height) >= MIN_TOUCH_TARGET_PX`. Check private → the warning count is 0. Click submit → `RITUAL_RELEASE`. Then
   `page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))` does not contain `"081"`, and the
   collected API URL list is `[]`.
2. "public anonymous wish passes with the hint": `toWishStep`, fill `CLEAN_WISH`, check public → `getByTestId("wish-public-hint")` visible and the
   warning count is 0. Submit → `RITUAL_RELEASE`.
3. "FALLBACK_2D at 360 px: the modal works without a canvas": the same `addInitScript` WebGL stub as `customizer.spec.ts`, then expect
   `data-quality-tier="FALLBACK_2D"`, `toWishStep`, dialog visible, `page.locator("canvas")` count 0, `completeWishStep(page)` → `RITUAL_RELEASE`.
4. "reduced motion: no transition classes in the modal": `await page.emulateMedia({ reducedMotion: "reduce" })` **before** `goto`, then expect
   the root `data-reduced-motion="true"` and `toWishStep`. Expect `getByTestId("wish-modal")` `data-reduced-motion="true"` and
   `locator('[class*="transition"]')` inside it with count 0. `completeWishStep(page)` → `RITUAL_RELEASE`.
In every test, collect `pageerror` and expect it to be empty at the end.

## Do NOT

- **Do not send anything to a server**: no `fetch`, no POST /api/creations client, no create route (MFW-45), no save/release logic, no
  coordinates (MFW-23). Do not read, create or send the owner token (`@/services/auth` stays untouched and unimported here; MFW-23 does it).
- Do not encrypt anything, and do not add an ownership-proof read of the private wish (MFW-31), an InspectPopup / Report button (MFW-28) or a "My Creations" list (MFW-30).
- Do not add flow transitions (no "back to customize", no "back to wish" after a server rejection). `src/core/flow/**` is unchanged.
  Returning the user to `WRITE_WISH` after a 422 is MFW-23's job (it calls `rejectWishFromServer`).
- Do not moderate or warn on the private wish (decision 13; MFW-13 Open question 5 default). Do not change MFW-13's lists, copy or
  detector, and do not add files under `src/services/moderation/`.
- Do not persist the wish (no zustand `persist`, no LocalStorage/sessionStorage/IndexedDB/cookies), and never log it.
- Never write `private_wish_text` / `owner_token_hash` / `owner_token` in a non-test `src/` file, comments included (boundary test).
- Do not add a dependency (no `@testing-library/user-event`, no dialog/focus-trap library, no form library). No `package.json` / lockfile changes.
- Do not use `getByRole("alert")` in Playwright (Next route announcer). Do not import `src/` into Playwright files.
- Do not add an entrance/exit animation, `@react-spring` or keyframes. Do not edit `globals.css`.
- Do not touch `.claude/**`, `scripts/**`, `.github/**`, `CLAUDE.md`, `AGENTS.md`, `docs/**` (including `open-questions.md`, `backlog*.json`,
  `prompts/**`, `plans/**`), `vitest.config.mts`, `playwright.config.ts`, `eslint.config.mjs`, `tsconfig.json`, `next.config.ts`,
  `src/core/**`, `src/components/canvas3d/**`, `src/components/models/**`, `src/services/auth/**`, `src/services/moderation/**`,
  `src/config/moderation.config.ts`, `src/components/ui/OwnershipNotice.tsx` (+ test), `CustomizerPanel.tsx` (+ tests),
  `FlowStepPlaceholder.tsx`, `tests/e2e/customizer.spec.ts`, or any `supabase/**` file. Existing test files may only change as listed above.

## Definition of done

- Run each of these separately and get green: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm e2e`. In this cloud
  container run e2e as `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell pnpm e2e` (set `E2E_PORT` to a free port if 3100 is in use
  by another worktree). No Supabase env vars in your shell.
- `pnpm build` output lists the same routes as before this card (no new route).
- Delete `playwright-report/` and `test-results/` before committing. Never commit `.next/` or `*.tsbuildinfo`. If `next dev` rewrote `AGENTS.md`, leave it alone.
- Branch `feat/MFW-21-wish-let-go-composer-modal` from the latest `main`, **after MFW-13 is merged**.
- Conventional commit(s) with the key, for example `feat(ui): wish composer modal with private/anonymous choice and PII guard MFW-21`.
- PR title = the commit subject. The English body has: a link to MFW-21; each AC as a checklist item with the file/test that proves it;
  Decisions (copy D1–D11); the Open questions (the max length and the copy are placeholders); the test plan (five commands and their results); and
  follow-ups (MFW-23 sends `toWishRequestFields(wish)` with the owner token in the POST body and calls `rejectWishFromServer` on a 422;
  MFW-45 should reuse `evaluateWishDraft` / `toWishColumns` / `isWishVisibility` and the same `WISH_TEXT_MAX_LENGTH`).
- Leave the PR open. Label `privacy` → the owner merges after reviewer + qa + privacy-auditor pass.

## Interfaces this card provides

| Export | Path | Signature | Used by |
|---|---|---|---|
| `WISH_VISIBILITIES`, `WishVisibility` | `@/config/wish.config` (types also from `@/services/api`) | `readonly ["private","public"]`, `"private" \| "public"` | MFW-45 (body validation), MFW-23, MFW-30/31 |
| `WISH_TEXT_MAX_LENGTH` | `@/config/wish.config` | `number` (280, PLACEHOLDER; UTF-16 units after trim) | MFW-45 server cap (must use the same constant) |
| `WISH_DRAFT_ISSUES`, `WishDraftIssue`, `WISH_COPY`, `WISH_TEXTAREA_ROWS` | `@/config/wish.config` | Step 1 | UI, owner copy edits |
| `WishDraft`, `ComposedWish`, `WishDraftEvaluation` | `@/services/api/wishPayload` (and the `@/services/api` barrel) | Step 2 | MFW-23, MFW-45 |
| `evaluateWishDraft` | same | `(draft: WishDraft) => WishDraftEvaluation` (throws `TypeError` on malformed input) | WishModal, store, MFW-45 server |
| `toWishColumns`, `WishColumns` | same | `(wish: ComposedWish) => { publicWishText: string \| null; privateWishPlaintext: string \| null }` | MFW-45 (column routing, AC 4.3-3) |
| `toWishRequestFields`, `WishRequestFields` | same | `(wish) => { wishText; wishVisibility }` | MFW-23 (POST body) |
| `isWishVisibility`, `normalizeWishText` | same | `(v: unknown) => v is WishVisibility`, `(t: string) => string` | MFW-45 |
| `moderationReasonsFromServerBody` | same | `(body: unknown) => readonly ModerationReason[] \| null` | store, MFW-23 |
| `useBuilderStore` → `wish`, `wishServerReasons`, `submitWish`, `rejectWishFromServer` | `@/store/useBuilderStore` | `ComposedWish \| null`, `readonly ModerationReason[] \| null`, `(draft) => WishDraftEvaluation`, `(body: unknown) => boolean` | MFW-23 (reads `wish` when saving; on 422 calls `rejectWishFromServer` and returns the flow to `WRITE_WISH`) |
| `WishModal`, `WishModalProps` | `@/components/ui/WishModal` | `({ onSubmitted }: { onSubmitted: () => void }) => JSX.Element` | FlowRoot |
| DOM hooks | WishModal | `role="dialog"` named `WISH_COPY.title`; `data-testid` `wish-modal`, `wish-public-hint`, `wish-moderation-warning`, `wish-status`; `[data-visibility]` rows | e2e of later cards |
| `completeWishStep`, wish copy literals | `tests/e2e/helpers/wishStep.ts` | `(page: Page, text?: string) => Promise<void>` | every later e2e that walks the flow |

## Open questions

Product decisions only. This card ships the default listed under each one, and the owner can change it later without rework.

1. **Maximum wish length** (still open from MFW-12 OQ 2 / MFW-13 OQ 6). The spec gives no number. Default: `WISH_TEXT_MAX_LENGTH = 280`
   UTF-16 code units after trimming, the same for private and public (PLACEHOLDER). Options: a different number, or separate caps per
   visibility. MFW-45 must enforce the same constant on the server.
2. **Is a wish required to release a krathong?** Default: yes. Text must be non-blank after trimming. Option: allow an empty wish (both
   columns null, which MFW-12's schema already allows). That needs a "skip" affordance and a change in `evaluateWishDraft`.
3. **Should one option be preselected?** Default: none. The user must pick, which is the strict reading of "Explicit choice". Options:
   preselect "เก็บข้อความเป็นส่วนตัว" (privacy by default, one tap less), or remember the last choice on this device (needs storage).
4. **Thai copy.** The two option labels are the spec words. The title, field label, placeholder, option descriptions ("ไม่แสดงให้คนอื่นเห็น
   อ่านได้เฉพาะคุณจากอุปกรณ์นี้" / "ทุกคนอ่านได้ โดยไม่แสดงชื่อหรือโปรไฟล์ของคุณ") and status lines are DRAFT copy by the lead. The warning copy is
   MFW-13's DRAFT `MODERATION_COPY`. Should there be English copy too? (Default: Thai only.)
5. **Blocked public wish: offer a one-tap "เก็บเป็นส่วนตัวแทน" (keep it private instead) button in the warning?** Default: no extra button. The user
   switches the radio. Option: add the button (copy needed).
6. (Carried over from MFW-13 OQ 5) **Warn on PII in a private wish?** Default: no warning, and PII is allowed in the private text (it is encrypted and
   readable only by the owner). Option: a soft, non-blocking hint.

## Decisions

- **D1 — The contract lives in `src/services/api/wishPayload.ts`, and the constants and copy live in `src/config/wish.config.ts`.** The module is pure and isomorphic, so
  the modal (client) and MFW-45 (server) share the same rules and cannot disagree. It does not go in `src/core/` (core never imports
  `services/`) or in `src/services/moderation/` (MFW-13's boundary test allows only `moderation.config` imports there).
- **D2 — No request in this card. The composed wish goes into `useBuilderStore`.** Backlog 5.1 AC3 ("Creation is saved") makes MFW-23 the
  first sender. The spec places "ข้อมูลชิ้นงานที่กำลังแต่ง" in `useBuilderStore`. The wish is memory-only, so reloading loses it, together with
  the rest of the unsaved creation.
- **D3 — The guard runs on every change, with no debounce, and only for "public".** `checkPublicWish` handles 100 000 characters in about 100 ms (MFW-13),
  and the text is capped at 280. Private text is not moderated (decision 13).
- **D4 — Fixed issue order (`text_empty`, `text_too_long`, `visibility_missing`, `moderation_blocked`).** The modal shows one status line, for the
  first issue in that order, so the hint follows the form from top to bottom. The moderation warning has its own block.
- **D5 — The text is trimmed before checking and storing. Length is in UTF-16 code units (`String.length`).** That is the unit the textarea `maxLength`
  counts, so the browser limit and the check agree. Inner line breaks are kept.
- **D6 — Native radio inputs in a `<fieldset>`, with nothing preselected, and submit disabled until the draft is valid.** Native radios give keyboard
  and screen-reader support for free. A programmatic submit is guarded too.
- **D7 — An in-flow dialog panel instead of a fixed overlay.** `WRITE_WISH` has no other content and no scene, and a fixed sheet fights the iOS keyboard.
  It uses `role="dialog"` without `aria-modal` because there is no focus trap. There is no close button (the flow is forward-only) and no `autoFocus`.
- **D8 — No movement animation. Colour transitions are dropped when `useDeviceStore.reducedMotion` is true.** The spec asks for no modal animation,
  so there is nothing to tune. The store (not only the CSS media query) drives it, as invariant F requires.
- **D9 — The `OwnershipNotice` moves into the modal.** The warning sits where the creation becomes "yours" (MFW-11 OQ 1 default). It stays the only
  `role="note"`, so MFW-11's test semantics (note only in `WRITE_WISH`) hold.
- **D10 — Server feedback goes through `rejectWishFromServer(body)` (`parseModerationBlockedBody`).** The server's reasons are shown and block the same
  text until it is edited. The store keeps the wish, so the user does not retype.
- **D11 — The submit label is "ถัดไป", and the e2e flow goes through one helper.** It matches the other steps. `completeWishStep` keeps the four existing specs
  readable and gives later cards one place to update.

## Out of scope

Saving or releasing the creation and sending the owner token (MFW-23). The create route, server-side wish validation, encryption, zone
assignment and the 422 mapping (MFW-45). Reading one's own private wish (MFW-31). The InspectPopup and Report button (MFW-28). My Creations (MFW-30).
Back navigation in the flow. A wish character counter beyond the simple `n/max`. English copy. Christmas work.

## Risks

- **MFW-45 is planned in parallel.** If its plan defines its own `WishVisibility` / length cap / wish-field parser, the two can drift. The reviewer of
  whichever PR merges second must switch it to this card's `WISH_VISIBILITIES`, `WISH_TEXT_MAX_LENGTH`, `evaluateWishDraft` and `toWishColumns`
  (or the other way round), so there is one source of truth.
- **The client check is bypassable** (the lists ship in the bundle, and the request can be forged). The server (MFW-13 backstop + MFW-45) is authoritative. This
  card is UX only.
- **The server-rejection path is not reachable yet.** The flow is forward-only, so nothing returns the user to `WRITE_WISH` after a 422 until MFW-23 adds that.
  The store action and the modal display are unit-tested now.
- **Merge conflicts:** `src/services/api/index.ts` (MFW-13 adds report exports), `FlowRoot.tsx` and `stores.test.ts` (MFW-25 edits nearby lines).
  They are small. Keep both sides.
- **The `maxLength` unit:** emoji count as 2 UTF-16 units, so a wish full of emoji reaches the cap sooner. This is accepted. The same unit is used on the server.
- **Moderation test strings depend on MFW-13's final lists.** The lead verified them on 2026-11-24 against MFW-13's implementation. See the Tests note for the fallback.
- **Landing bundle:** `FlowRoot` imports `WishModal` statically, so MFW-13's rule lists (a few KB) load on the landing page. This is accepted: they are public anyway
  (MFW-13 risk). If bundle size becomes an issue, `WishModal` can be lazy-loaded like `SceneViewport`.
