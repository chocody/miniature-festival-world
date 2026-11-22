# Open questions — places where spec v3.0 is silent or inconsistent

Found while writing CLAUDE.md (MFW-3). Each must be decided (by the product owner, or by the ticket's
lead with the decision written in the PR) **before** the listed ticket is implemented. Do not guess silently.

| # | Question | Spec reference | Decide in |
|---|---|---|---|
| 1 | How does an owner prove ownership to read `private_wish_text`? §5 says the client sends `owner_token`; backlog 2.1 says only the SHA-256 hash ever leaves the device — but a hash sent as-is is itself a bearer secret. | §5, backlog 2.1 | MFW-12 (2.2), MFW-31 (7.2) |
| 2 | Encryption of `private_wish_text`: algorithm, where the key lives, rotation. | §5 | MFW-12 (2.2) |
| 3 | `moderation_status` / `report_count` live in the private table, but public reads must hide `hidden`/`flagged` items — view, mirrored column, or server filter? Report threshold value? | §5, §6.2 Task 2.3 | MFW-12, MFW-13 |
| 4 | Zone cap: §5 says 80–100 items, §6.5 and backlog 5.3 say ~80. | §5, §6.5 | MFW-25 (5.3) |
| 5 | Performance numbers: FPS threshold for FALLBACK_2D, per-tier budgets, max texture/asset sizes. | §6.1 Task 1.3 | MFW-9 (1.3) |
| 6 | Units of `speedFactor` and `createdAt` in `CurrentProgress(t)` (per second vs per ms) — affects determinism across clients. | §4.1 | MFW-8 (1.2) |
| 7 | `PlanarZoneCoord` has no `mode` discriminator (the other two have `SPLINE_PATH` / `CYLINDRICAL_SURFACE`). | §4.3 | MFW-8 (1.2) |
| 8 | File names in §3 (`CylindricalCoord.ts`, `PlanarGridCoord.ts`) differ from type names in §4 (`NormalizedCylindricalCoord`, `PlanarZoneCoord`). | §3, §4 | MFW-8 (1.2) |
| 9 | No formula for the 2D fallback of `SplinePathCoord` (only "SVG path / river strip"), unlike the cylindrical case. | §4.1 | MFW-8 (1.2), MFW-33 (8.1) |
| 10 | Retention period for `expires_at`. | §5 | MFW-12 (2.2) |
| 11 | Animation library: GSAP or `@react-spring/three`. | §2.1 | MFW-15 (3.1) |
| 12 | How "My Creations" lists a device's items: query by token hash, or keep creation ids locally. | §6.7 Task 7.1 | MFW-11 (2.1), MFW-30 (7.1) |
| 13 | Profanity: block or only warn? (PII is clearly blocked.) | §6.2 Task 2.3 | MFW-13 (2.3) |

Also noted in MFW-2: Christmas date 24–25 Dec (roadmap table) vs 20–26 Dec (§1.1).
