# Follow-ups — fix later / re-test with a stronger model

Owner instruction (2026-11-24): merge every card once its gate is green; known issues are recorded here (and on the
Jira card) and fixed later; items marked **re-test** should be re-verified later with a higher-capability model or on a
real device. Newest first. Remove an item when its fix is merged.

| Card | Severity | Item | Kind |
|---|---|---|---|
| MFW-13 | Medium (before Christmas) | Report abuse: any 3 anonymous `POST /api/reports` hide any public wish (ids are public; ~240 requests empty a zone; no restore path). Options: dedupe per device/IP, rate limit, distinct-reporter minimum, review/restore flow. | fix later · owner decision |
| MFW-13 | Medium | PII guard misses: `john @ gmail.com` (spaces), `j o h n @ g m a i l . c o m`, `line somchai99` (no colon), `my ig is somchai99`, `somchai99 on insta`, LINE id < 3 chars, spelled-out digits (EN/TH). | fix later · re-test |
| MFW-13 | Low | English profanity spaced out (`f u c k`) or stretched (`fuuuck`) passes; word lists and Thai copy are owner-review placeholders. | fix later · owner review |
| MFW-13 | Low | `POST /api/reports` reads a chunked body fully before the size check (minor DoS). | fix later |
| MFW-12/13 | — | Migrations never applied (open question 17): apply on staging, verify with the anon key that tables, view and RPCs are denied, and run MFW-13's check (expect true, true, true, false). | owner · re-test |
| MFW-12 | — | Confirm Vercel env var names `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (production returns 503 until migrated if they match). | owner |
| MFW-24 | Medium (gate) | RiverFlow renders ~20 meshes per krathong; an 80-item zone ≈ 1,600 draw calls. MFW-25 adds per-tier caps; MFW-34 instancing is the real fix before Christmas. | fix later · re-test on device |
| MFW-24 | Low | Client clock skew can briefly shrink spacing on a skewed device (MFW-8 clamp); use server time in MFW-23/45. | fix later |
| MFW-24 | Low | Capacity margin thin (82 vs cap 80 in a greedy fill); zone also full when `findNearestFreeSpot` returns null. | re-test |
| MFW-20 | Low | Tabs lack arrow-key/roving-tabindex; view buttons show before the lazy scene mounts; bar ~40 % of a 360×640 screen. | fix later · re-test on device |
| MFW-27 | Low | Canvas re-creation on a mid-session tier drop resets the camera but keeps the selection ring; lamp tap target tiny (~4 px); only the pier tip in view. | fix later · re-test on device |
| MFW-19 | Low | Dev-mode StrictMode may skip freeing shared krathong assets; no real-R3F-frame test of `UprightAnchor`. | fix later |
| MFW-11 | — | Where/how often the loss warning shows; behaviour when LocalStorage is unavailable (`persisted: false`). | owner decision |
| all 3D | — | On-device checks: FPS/draw calls on LOW, memory across zone switches, antialias flip on LOW, moon shadow coverage. | re-test on device |
