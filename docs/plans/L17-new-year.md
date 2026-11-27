# L17 — New Year 2027: Wish Stars & Countdown (plan v1, 2026-11-27)

Owner request 2026-11-27: New Year 2027, 28 Dec 2026 – 5 Jan 2027 (Asia/Bangkok). Core chosen by the owner: "ดาวบนท้องฟ้า + countdown". Every default below is DRAFT; the owner reviews from results. Epic MFW-125.

## Code facts

**What the code tells us**
- **No migration is needed for the New Year event id.** The MFW-12 check already allows `event_id = 'new_year'`, the `PLANAR_ZONE` coord mode, and `parsePersistableCoord` validates u and v.
- **The data-scope column touches every SQL function.** Each one filters only by `event_id` (+ `zone_id`), or by creation id:
  - `mfw_zone_item_counts`, `mfw_zone_occupants`, `mfw_insert_creation_guarded_v2` (lock + occupant set + 80 cap)
  - `mfw_creation_ownership`, `mfw_creation_wish_state`, `mfw_open_creation_wish`, `mfw_close_creation_wish`, `mfw_report_creation`
  - So a scope needs a new migration with scoped versions, plus wiring in the repository.
- **The repository is built once from env** (`createCreationRepositoryFromEnv`). The deployment's scope can be bound there, so callers do not change.
- **The guarded insert is a compare-and-insert on the whole occupant set.** Any concurrent write to the same zone forces a retry. A burst into one band or zone (Christmas opening, New Year midnight) will produce retries and then 503s.
- **The server clock offset is estimated only from the POST 201** (`estimateServerClockOffsetMs`). The countdown needs its own sample before anyone creates anything.
- **The firework pool is small and slow:** caps HIGH 3 / MEDIUM 2 / LOW 1, rise 750 ms + burst 2000 ms, and `FIREWORK_MIN_LAUNCH_INTERVAL_MS` = 333 ms (WCAG). The midnight show has to be paced from these numbers.
- **Feature flags block staging.** A disabled event fails closed even under the MFW-88 env override. So New Year needs a "non-production only" flag value, or staging cannot open it without opening production on 28 Dec.

## Design

Story JSON: `docs/backlog.json` (L17 = MFW-125; stories 17.1 … 17.27 = MFW-126 … MFW-152).


### B.1 The constellation and zone model (core of 17.4 and 17.5)

**The sky is a vertical backdrop plane** behind the "2027" sculpture, facing the default camera. Zone n is one constellation row on it, a rectangle W × H (DRAFT 6.2 × 5.6 world units).

**The newest zone sits lowest,** with its bottom edge just above the sculpture top. Older zones rise as the sky grows:
- `rectOf(n, N)`: bottom y = `SKY_BASE_Y + (N − n) × rowPitch`, x centred on the sculpture, z = `SKY_Z`.
- This is the tree rule with the direction flipped. The stored `{mode:"PLANAR_ZONE", u, v}` never changes. N is derived at render time as `max(zoneCount, zone of any item shown)` and is never stored.
- Test: world(c, N+1) − world(c, N) = (0, rowPitch, 0) exactly.
- Why this way: people on the plaza always flick into the sky right above them, and the plaza stays in the default NEWEST framing. If new zones stacked upward, the newest zone would leave the sculpture out of view.

**u and v inside a zone.** u runs left to right and v bottom to top, each in 0–1. A generic `PlanarZoneRect {origin, uAxis, vAxis}` and its converters (17.5) live in `src/core/coordinates/PlanarGridCoord.ts`, so Songkran and Valentine's can reuse them.

**Star slots (≤ 80 per zone, frozen).**
- A constant table of exact (u, v) points in `src/config/events/newYear.sky.config.ts`.
- DRAFT 64 slots: 8 rows × 8 columns, staggered, nominal spacing 0.78 units, deterministic jitter ≤ 0.08 units, so it reads as a starfield rather than a grid. Minimum pair distance ≥ 0.62 units.
- The server snaps to the table. `nearestFreeSlot` and `snapToSlot` mirror the tree versions. Hidden rows keep their slot, as in MFW-45. `SKY_MAX_ZONES` is DRAFT 300; past it the server returns a calm 409.
- A slot-table fingerprint is pinned now and frozen on 27 Dec.

**Tap targets ≥ 44 px.**
- A DRAFT New Year framing with a phone frame width of 5.0 units gives a zoom of `min(143, 360/5.0, …)` ≈ 72 px per unit at 360×640, and 78 at 390×844. 0.62 units is then ≈ 45–48 px.
- The 17.4 projection test checks every slot pair and a hit radius ≥ 22 px at 390×844 and 360×640. It is the gate, so the capacity may drop below 64 if needed.
- Picking needs no per-star raycast: one invisible plane proxy per mounted zone, then `worldToPlanarCoord`, then the nearest occupied slot within the hit radius (a star tap), or the nearest free slot (move the ghost while sending).

**Streaming and pan.**
- The 16.13 `"linear"` topology is reused unchanged: window [b−2, b+2] ∩ [1, N], at most 5 zones and 400 stars mounted, and zones leaving the window are disposed (invariant E).
- The camera is the 16.17 rig in a "sky" mode: no orbit, horizontal pan clamped to the zone width, vertical travel from the newest zone (plaza in view) up to zone 1, and a hysteresis band driving `setCurrentStretch`.
- A phone shows about 1.3 zones; a desktop shows about 2.

**Growth.** When the zone count rises, the older zones rise by one rowPitch, using the 16.23 camera rule. Sending goes only to the open (newest) zone, or to a virtual zone N+1 when it is full, as in Christmas R2/R3.

### B.2 Countdown design (17.21 to 17.23)

**Target.** `countdownTargetAt: "2027-01-01T00:00:00+07:00"` in `newYear.config.ts`, which is 2026-12-31T17:00:00Z. Thailand has no DST. Everyone counts to Thai midnight whatever their device time zone; the copy says เวลาประเทศไทย (DRAFT). Tests run under TZ=Asia/Bangkok and TZ=America/New_York and must agree.

**Clock.**
- New `GET /api/time` returns only `{now}` with ms precision and `no-store`, with no DB access.
- The client samples it 3 times at start and keeps the lowest-RTT result through the existing `estimateServerClockOffsetMs` (`src/core/ritual/serverClock.ts`). It re-syncs on `visibilitychange`. If the requests fail, the offset is 0 (device clock), and the countdown still renders.

**Phases** (pure function `src/core/events/countdown.ts`):

| Phase | When (DRAFT lengths) | What shows |
|---|---|---|
| before | 28 Dec 00:00 to 23:59:00 on 31 Dec | Small HUD chip "อีก d วัน hh:mm:ss สู่ปี 2027" |
| final_minute | last 60 s | Big centred numerals |
| show | 00:00:00 to 00:01:00 | Firework show |
| greeting | until 00:10 | "สวัสดีปีใหม่ 2027" banner |
| after | after 00:10 | No countdown; the sculpture stays lit |

- Before 28 Dec the event is not active, so the calm screen shows. Remaining seconds use ceil, so 00:00:00 shows exactly at midnight.
- The ticker is DOM only, on a 1 Hz timeout aligned to the second boundary and paused while the tab is hidden. There is no 3D redraw for the countdown.
- Screen readers get a polite update once a minute, not every second.

**Midnight show within the pool caps** (`fireworkShowSchedule(tier, phaseMs)`, pure and deterministic from the synced clock):
- The launch interval per tier is ≥ (750 + 2000 ms) / pool cap: about 917 ms on HIGH, 1375 on MEDIUM, 2750 on LOW. All of these are above the 333 ms WCAG floor.
- Pads are used round-robin and the palette cycles.
- A test checks every tier over the whole show: concurrent bursts never exceed `EFFECT_POOL_CAPS[tier].firework`, and there are never more than 3 launches per second.
- Late joiners and returning tabs join at the current phase. A tier step-down mid-show switches the cadence. Launchpad taps pause during the show, so taps never compete for the pool. The sculpture lights at 00:00 and stays lit.
- Reduced motion: no firework motion or flashes, only a static lit sky, the sculpture glow and the banner.

**Rehearsal.** A server-only `MFW_COUNTDOWN_TARGET_OVERRIDE`, ignored when VERCEL_ENV is production and never `NEXT_PUBLIC`, is passed from `page.tsx` as a prop. It lets staging and e2e rehearse midnight. E2E uses Playwright's clock API plus a mocked `/api/time`.

### B.3 Cards

| id | size | id | size | id | size |
|---|---|---|---|---|---|
| 17.1 | S | 17.10 | M | 17.19 | M |
| 17.2 | S | 17.11 | S | 17.20 | S |
| 17.3 | S | 17.12 | M | 17.21 | M |
| 17.4 | M | 17.13 | M | 17.22 | S |
| 17.5 | S | 17.14 | S | 17.23 | M |
| 17.6 | S | 17.15 | S | 17.24 | M |
| 17.7 | M | 17.16 | M | 17.25 | S (optional) |
| 17.8 | S | 17.17 | M | 17.26 | S (owner) |
| 17.9 | S | 17.18 | S | 17.27 | S |

That is about 18.5 loop-days without 17.25 and owner time.

Story JSON: `docs/backlog.json` (L17 = MFW-125; stories 17.1 … 17.27 = MFW-126 … MFW-152).


### B.4 Dependencies on L16 (what L17 reuses)

| L16 card | What L17 reuses | L17 cards |
|---|---|---|
| 16.2 | env override | 17.2, 17.21 pattern |
| 16.3 | Playwright project pattern | 17.3 |
| 16.5 | per-event copy | 17.9, 16.35 copy |
| 16.6 | appearance union / registry | 17.6 |
| 16.7 | lattice pattern | 17.4 mirrors it |
| 16.11 + 16.34 | placement and slot insert | 17.7 |
| 16.12 | release adapters | 17.8 |
| 16.13 | linear streaming | 17.12 |
| 16.14, 16.16, 16.19 | shell, look, village | 17.10, 17.11 |
| 16.15 | design-source registry | 17.14 |
| 16.17 | rig | 17.12 |
| 16.20 | picker | 17.15 |
| 16.21, 16.22, 16.23 | send mode, flight, growth | 17.16, 17.17, 17.18 |
| 16.24, 16.25 | navigator, Find My | 17.19 |
| 16.26, 16.27 | bubble, visit | 17.20 |
| 16.28 | frame-less SceneEffects | 17.24 |
| 16.9, 16.10, 16.32, 16.33 | rate limit, report dedupe, scope | used as is |
| 16.4 | staging | 17.26 |
| 16.30, 16.36 | launch switch, release branch | 17.27 |

### B.5 Critical path and dates (today Fri 27 Nov)

**Lane C: L17 pre-work during L16.** Only on a lane L16 is not using; L16 cards always win.
- 30 Nov – 2 Dec: 17.5; 17.1 after 16.1; 17.2 after 16.2 merges; 17.6 after 16.6.
- 3 – 6 Dec: 17.4, 17.21; 17.9 after 16.5; 17.3 after 16.3.
- 7 – 12 Dec: 17.7 after 16.11 and 16.34; 17.8 after 16.12; 17.14 after 16.15; 17.22.

**14 – 22 Dec: two lanes.**
- Lane A (critical): 17.10 (14) → 17.12 (15) → 17.13 (16) → 17.16 (17) → 17.17 (18) → 17.19 (19) → 17.20 (20).
- Lane B: Christmas staging fixes first (15–18), then 17.11, 17.15, 17.24, 17.23, 17.18, and 17.25 if time allows.

**Path:** 16.14 / 16.16 → 17.10 → 17.12 (also needs 16.17) → 17.13 → 17.16 (also needs 16.21) → 17.17 (also needs 16.22) → 17.26 → 17.27. A side path 16.19 → 16.28 → 17.24 → 17.23 needs 16.28 merged by about 16 Dec.

**Milestones:**
- Code-complete Tue 22 Dec; Wed 23 Dec buffer.
- Owner staging test 24–26 Dec (17.26), including the midnight rehearsal.
- Sun 27 Dec: 17.27 (flag true, freeze, wipe New Year test rows, release fast-forward). The calm screen shows all day.
- Mon 28 Dec 00:00 +07: New Year is live. Thu 31 Dec 24:00: the show. The owner keeps rollback ready.
- Event ends 6 Jan 00:00. Christmas rows expire 26 Jan; New Year rows expire 5 Feb.

**L16 dates added by the new cards:**
- 16.31: today; the owner runs it today.
- 16.32: 28–29 Nov (owner applies, then merges). 16.33: 30 Nov – 1 Dec.
- 16.4: owner, 2–3 Dec, after 16.33 deploys.
- 16.9 by 8 Dec; 16.34 by 10 Dec; 16.10 and 16.35 by 11 Dec.
- 16.28 by 16 Dec; 16.36 by 18 Dec; 16.30 on 19 Dec.

### B.6 Open owner decisions (recommended default)

- **N1 Sky layout:** newest constellation just above the sculpture, older ones rise. Alternative: new rows stack upward.
- **N2 Density:** 64 stars per zone, zone 6.2 × 5.6 units, phone frame width 5.0, DRAFT. The 17.4 test may lower it; the owner reviews the 17.13 screenshots.
- **N3 Designs:** three placeholder stars with `{design}` only, no colour picker; owner models later via 16.15.
- **N4 Gesture:** upward swipe while sending (camera held on the open zone) plus a "ส่งดาว" button; tapping the sky moves the ghost.
- **N5 Where you can send:** only into the open (newest) zone.
- **N6 Night only:** no DAY preset; the day/night switch is hidden.
- **N7 Countdown placement:** chip 28–31 Dec; big numerals for the last 60 s; banner for 10 min after midnight; Thai time for everyone.
- **N8 Show:** 60 s; cadence per tier from the pool caps; pad taps paused; join in progress; no replay button.
- **N9 Sound:** none.
- **N10 Reduced motion at midnight:** static lit sky, sculpture glow and banner; no firework motion or flashes.
- **N11 Launchpads:** 4 pads, colours cycle; the §1.1.3 colour/pattern chooser comes after launch.
- **N12 Sculpture:** procedural clay "2027"; glows on tap before midnight, stays lit from midnight.
- **N13 Constellation lines:** optional (17.25).
- **N14 Slip plan, decided 23 Dec:** if 17.16 or 17.17 is not green, launch a "New Year lite" with plaza, countdown, show and launchpads, and existing stars view-only (sending disabled, no DB writes).
- **N15 New Year wipe:** only `new_year` test rows on 27 Dec; never touch live Christmas rows.
- **N16 Rate-limit numbers (16.9 DRAFT):** device 3/min + 30/day; IP 20/min + 200/day (Thai mobile carriers put many users behind one IP); reports 10/min + 50/day per IP. Re-check after the 16.29 / 17.26 probes.
- **L16-side:**
  - 16.34 slot-keyed insert: yes; it is mandatory for New Year.
  - 16.36 release branch: yes.
  - D15 / open question 20 is now decided (owner alone).
  - R5 is decided (DB-backed limit).

---

### N17 — New Year stars from the owner's star model

- Add decision **N17: New Year stars from `star_01`.** Default: 17.14 reuses the owner's `star_01` GLB, recoloured gold, as `star_classic_01` through the 16.15 pipeline, instead of a procedural mesh. Sparkle and comet stay procedural unless the owner supplies Hunyuan3D models by about 10 Dec.
- If accepted, 17.14 is blockedBy 16.15 (already listed) and its AC reads "pipeline or procedural per design, through the design-source registry".
- Its licence then follows NOTICE §8.

Applied in 17.14 (MFW-139).

## Risks and order of work

**Risks and mitigations**
1. **Capacity is the biggest risk.** L16 is about 26 loop-days with the new cards and L17 about 18.5, in 26 calendar days, through one serialized merge queue and a slow SwiftShader CI.
   - Mitigation: `loop-epic --parallel 3` before 13 Dec with strict L16 priority, and only pure or config L17 cards on lane C. Keep 16.37 and 17.25 optional, and use the N14 lite plan.
   - If a third lane is not possible, L17 code-complete slips to about 25 Dec. Decide on the lite scope then.
2. **The shared DB: staging holds the production service-role key.** A scope bug or a bad script can read or damage live data.
   - Mitigations: default `test`; the `p_data_scope` parameter has no default; a boundary test bans the old RPC paths; staging-only private-wish and abuse keys, so staging cannot decrypt live wishes; branch-scoped env; Vercel Authentication; staging is fast-forward-only from main.
   - Post-launch option: a dedicated Postgres role with RLS on `data_scope = 'test'` for staging.
3. **Wipes on the production DB.** Each script is one transaction with raise-on-mismatch assertions, static-tested and owner-run with a project-ref check. From 20 Dec live Christmas data matters, so the 27 Dec script asserts the live Christmas count is unchanged. Supabase Free has no point-in-time recovery, so export a CSV backup before each wipe.
4. **Deploys while an event is live.** Every L17 merge to main would otherwise deploy to production during Christmas. Mitigations: the release branch (16.36); generic-touching L17 changes (17.2 flags, 17.7 registry, 17.8 adapter, 17.21 page prop and `/api/time`) land before 19 Dec; the christmas e2e project stays in CI.
5. **Burst writes at the Christmas opening and the New Year midnight.**
   - Causes: occupant-set retries ending in 503; per-IP limits under carrier NAT; Supabase and Vercel Hobby usage limits.
   - Mitigations: 16.34 slot-keyed insert; generous IP layer; calm 429 and 503 copy with retry; the staging burst probes (16.29, 17.26). The owner should check the Hobby and Supabase usage dashboards before 20 and 31 Dec.
   - Note that Vercel Hobby is for non-commercial use, which the owner should confirm.
6. **Owner bandwidth.** The owner alone tests, reviews art and copy, applies migrations and does owner-merges for 16.31, 16.32, 16.33, 16.9, 16.10, 16.34, 16.30 and 17.27. The owner test window 24–26 Dec falls during live Christmas. Mitigations: a daily owner-merge slot; reviews after the fact; automated pre-passes before each owner checklist.
7. **Loy and Christmas regressions from generic changes** (flag type, registries, frame-less SceneEffects, rig sky mode). Each card's AC keeps the other suites unchanged.
8. **CI time with three Playwright servers.** One shard per project; measure in 16.3 and 17.3.
9. **Time correctness.** `/api/time` offset, ceil rounding, TZ-independent tests, and the staging rehearsal override (never active in production).
10. **The calm screen on 27 Dec, or if New Year slips.** The calm screen picks the nearest window and ignores flags, so it would still show the New Year dates. N14 avoids a dead event.
11. **Freezes.** The tree lattice is frozen 19 Dec and the sky slot table 27 Dec. After that, any change needs a new version, never moved slots.
12. **Photosensitivity and accessibility.** At most 3 launches per second is tested; reduced motion has no flashes; the button alternative to the flick is required.

**Recommended order of work**
1. **Now:** 16.31 (the owner runs the wipe today), then 16.32 (owner applies), then 16.33. These go on the first free lane next to the in-progress 16.2, 16.6, 16.7, 16.8 and 16.13.
2. **1–3 Dec:** 16.4 staging, owner-assisted. L16 wave 1. Lane C: 17.5, 17.1, 17.2, 17.6.
3. **3–11 Dec:** L16 waves 2–3 plus the database lane 16.9 → 16.34 → 16.10, then 16.35. Lane C: 17.4, 17.21, 17.9, 17.3, then 17.7, 17.8, 17.14, 17.22.
4. **10–13 Dec:** L16 wave 4. 16.28 is now required. Christmas code-complete 13 Dec.
5. **14–22 Dec:** L17 lanes A and B. 15–18 Dec Christmas staging fixes come first. 18 Dec 16.36; 19 Dec 16.30 and the release switch; 20 Dec Christmas live.
6. **23 Dec** buffer and the N14 decision; **24–26 Dec** 17.26; **27 Dec** 17.27; **28 Dec** New Year live.
