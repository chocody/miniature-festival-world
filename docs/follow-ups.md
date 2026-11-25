# Follow-ups — fix later / re-test with a stronger model

Owner instruction (2026-11-24): merge every card once its gate is green; known issues are recorded here (and on the
Jira card) and fixed later; items marked **re-test** should be re-verified later with a higher-capability model or on a
real device. Newest first. Remove an item when its fix is merged.

| Card | Severity | Item | Kind |
|---|---|---|---|
| MFW-53 | Low | DRAFT defaults awaiting owner review: Loy Krathong window = one Bangkok day (24 Nov 2026 / 13 Nov 2027); New Year / CNY / Valentine's / Songkran windows follow §1.1 (wider than the §1 table); "nearest festival" = closest in time either way; an in-window unbuilt festival is not active (calm screen shows it); calm-screen copy and Gregorian-year date format; the event is fixed at page load (a session that outlives the window gets "event closed" on release). | owner decision |
| MFW-53 | Low | Retention is per event id (`FESTIVAL_ENDS_AT`), so a Loy Krathong 2027 creation would be refused (expired 2026 end); CLAUDE.md still says stubs show "Coming Soon" (owner to update); the calm screen has no e2e (override is a constant). | fix later · owner |
| MFW-34 | — | On-device soak (docs/perf/MFW-34.md §4): run on the private-test phones and fill the device table; decide the MEDIUM/LOW river caps (MFW-25 OQ 7) from the numbers. | owner · re-test on device |
| MFW-45 | — | Owner: set `PRIVATE_WISH_KEY` (base64 of 32 random bytes) and `PRIVATE_WISH_KEY_ID` on Vercel (server-only); apply migrations MFW-12 → MFW-13 → MFW-45 on staging and verify the anon key is denied everywhere. | owner |
| MFW-45 | Medium (before Christmas) | No abuse protection on `POST /api/creations` (rate limit / per-device cap). | fix later · owner decision |
| MFW-45 | Low | Body size cap applies after a chunked body is read (also `/api/reports`); production detection relies on `VERCEL_ENV` only; a token in the query string is ignored rather than rejected. | fix later |
| MFW-28 | Low | Report fetch uses `credentials: "same-origin"` (no cookies exist today; `"omit"` would make it structural); possible one-time shader hitch on the first tap on LOW; tap radius / latency with 80 krathongs to check on a phone. | fix later · re-test on device |
| MFW-25 | Medium (gate) | Tier caps still ~480 / 960 / 1,600 draw calls (LOW / MEDIUM / HIGH); a full 80-item zone on HIGH stepped SwiftShader down to FALLBACK_2D. MFW-34 instancing before Christmas; re-tune `riverItemCap` on a device. | fix later · re-test on device |
| MFW-25 | Low | Two try/catch tests in `zoneManager.test.ts` can pass vacuously; blank line lost in `database.config.ts`. | fix later |
| MFW-13 | Medium (before Christmas) | Report abuse: any 3 anonymous `POST /api/reports` hide any public wish (ids are public; ~240 requests empty a zone; no restore path). Options: dedupe per device/IP, rate limit, distinct-reporter minimum, review/restore flow. | fix later · owner decision |
| MFW-13 | Medium | Phone recall after the date/time fix: 2-digit tail groupings pass (`081 234 56 78`, `081 23 45 678`, `tel. 02 123 45 67`, `โทร 08 12 34 56 78`, `+66 (0) 81 234 5678`). Suggested: allow 2-digit tails when the run has no `.` separator. | fix later · re-test |
| MFW-13 | Low | Spaced-email rule false positives: `see you @ 7.30 pm`, `I love you @ 2.5 million` → `email`. Suggested: alphabetic TLD only. `line ID is somchai99` not caught. | fix later |
| MFW-13 | Medium | PII guard still misses: `j o h n @ g m a i l . c o m`, `somchai99 on insta`, LINE id < 3 chars, spelled-out digits (EN/TH). (Fixed in the review round: spaced `@`, `line somchai99`, `ig is x`, en-dash phones, quadratic backtracking, Thai dates/times read as phones.) | fix later · re-test |
| MFW-13 | Low | English profanity spaced out (`f u c k`) or stretched (`fuuuck`) passes; word lists and Thai copy are owner-review placeholders; `ไลน์ group` and `my ig is cool2` are blocked (accepted). | fix later · owner review |
| MFW-13 | Low | `POST /api/reports` reads a chunked body fully before the size check (minor DoS). | fix later |
| MFW-12/13 | — | Migrations never applied (open question 17): apply on staging, verify with the anon key that tables, view and RPCs are denied, and run MFW-13's check (expect true, true, true, false). | owner · re-test |
| MFW-12 | — | Confirm Vercel env var names `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (production returns 503 until migrated if they match). | owner |
| MFW-24 | Low | Client clock skew can briefly shrink spacing on a skewed device (MFW-8 clamp); use server time in MFW-23/45. | fix later |
| MFW-24 | Low | Capacity margin thin (82 vs cap 80 in a greedy fill); zone also full when `findNearestFreeSpot` returns null. | re-test |
| MFW-20 | Low | Tabs lack arrow-key/roving-tabindex; view buttons show before the lazy scene mounts; bar ~40 % of a 360×640 screen. | fix later · re-test on device |
| MFW-27 | Low | Canvas re-creation on a mid-session tier drop resets the camera but keeps the selection ring; lamp tap target tiny (~4 px); only the pier tip in view. | fix later · re-test on device |
| MFW-19 | Low | Dev-mode StrictMode may skip freeing shared krathong assets; no real-R3F-frame test of `UprightAnchor`. | fix later |
| MFW-11 | — | Where/how often the loss warning shows; behaviour when LocalStorage is unavailable (`persisted: false`). | owner decision |
| all 3D | — | On-device checks: FPS/draw calls on LOW, memory across zone switches, antialias flip on LOW, moon shadow coverage. | re-test on device |
