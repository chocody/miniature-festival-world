# Open questions — places where spec v3.0 is silent or inconsistent

Found while writing CLAUDE.md (MFW-3). Each must be decided (by the product owner, or by the ticket's
lead with the decision written in the PR) **before** the listed ticket is implemented. Do not guess silently.

| # | Question | Spec reference | Decide in |
|---|---|---|---|
| 1 | How does an owner prove ownership to read `private_wish_text`? §5 says the client sends `owner_token`; backlog 2.1 says only the SHA-256 hash ever leaves the device — but a hash sent as-is is itself a bearer secret. | §5, backlog 2.1 | MFW-12 (2.2), MFW-31 (7.2) |
| 2 | Encryption of `private_wish_text`: algorithm, where the key lives, rotation. | §5 | MFW-12 (2.2) |
| 3 | `moderation_status` / `report_count` live in the private table, but public reads must hide `hidden`/`flagged` items — view, mirrored column, or server filter? Report threshold value? | §5, §6.2 Task 2.3 | MFW-12, MFW-13 |
| 4 | Zone cap: §5 says 80–100 items, §6.5 and backlog 5.3 say ~80. | §5, §6.5 | MFW-25 (5.3) |
| 5 | Performance numbers: FPS threshold for FALLBACK_2D, per-tier budgets, max texture/asset sizes. | §6.1 Task 1.3 | MFW-9 (1.3) — Decided in MFW-9: FALLBACK_2D below 20 FPS sustained 5 s (2 s warm-up) or no WebGL; initial tier from deviceMemory/hardwareConcurrency (HIGH ≥8 GB & ≥8 cores, LOW ≤3 GB or ≤4 cores, else MEDIUM), step down on sustained FPS <45 (HIGH) / <30 (MEDIUM); budgets DPR cap 2/1.5/1, shadows on/off/off, max texture 2048/1024/512 px (owner, 2026-11-23) |
| 6 | Units of `speedFactor` and `createdAt` in `CurrentProgress(t)` (per second vs per ms) — affects determinism across clients. | §4.1 | MFW-8 (1.2) — Decided in MFW-8: speedFactor is progress (fraction of the lane, 0–1) per second; createdAt and now are Unix epoch milliseconds (created_at parsed to ms), so elapsed seconds = (now − createdAt) / 1000; negative or non-finite elapsed counts as 0 (item stays at spawnProgress). Only + − × ÷ % are used, so results are bit-identical across clients. speedFactor is capped at 1 (one lane per second) to keep the math finite. |
| 7 | `PlanarZoneCoord` has no `mode` discriminator (the other two have `SPLINE_PATH` / `CYLINDRICAL_SURFACE`). | §4.3 | MFW-8 (1.2) — Decided in MFW-8: added the discriminator mode: "PLANAR_ZONE"; PlanarZoneCoord = { mode, u, v } with u, v in [0, 1]; the zone is the row's zone_id column, not duplicated inside coord (same as the other two modes). |
| 8 | File names in §3 (`CylindricalCoord.ts`, `PlanarGridCoord.ts`) differ from type names in §4 (`NormalizedCylindricalCoord`, `PlanarZoneCoord`). | §3, §4 | MFW-8 (1.2) — Decided in MFW-8: keep the §3 file names and the §4 type names — NormalizedCylindricalCoord is exported from CylindricalCoord.ts, PlanarZoneCoord from PlanarGridCoord.ts, SplinePathCoord from SplinePathCoord.ts. |
| 9 | No formula for the 2D fallback of `SplinePathCoord` (only "SVG path / river strip"), unlike the cylindrical case. | §4.1 | MFW-8 (1.2), MFW-33 (8.1) — Decided in MFW-8: the 2D river is an orthographic top-down projection of the same 3D lane curve — world (x, z) to canvas (x, y) by a uniform scale plus centering offset fitted to the lanes' bounds, y dropped (src/core/fallback2d/riverTopDown.ts); the inverse uses the same nearest-point search as 3D. MFW-33 builds the renderer (and any semi-top-down styling) on top of it. |
| 10 | Retention period for `expires_at`. | §5 | MFW-12 (2.2) |
| 11 | Animation library: GSAP or `@react-spring/three`. | §2.1 | MFW-15 (3.1) |
| 12 | How "My Creations" lists a device's items: query by token hash, or keep creation ids locally. | §6.7 Task 7.1 | MFW-11 (2.1), MFW-30 (7.1) |
| 13 | Profanity: block or only warn? (PII is clearly blocked.) | §6.2 Task 2.3 | MFW-13 (2.3) |

Also noted in MFW-2: Christmas date 24–25 Dec (roadmap table) vs 20–26 Dec (§1.1).
