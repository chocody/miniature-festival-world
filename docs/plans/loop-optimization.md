# Loop Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ลดเวลาและ token ต่อการ์ดของ loop engineering โดยด่านตรวจคุณภาพอยู่ครบทุกด่าน

**Architecture:** ลดสิ่งที่ agent ต้องอ่าน (brief และ spec ที่สั้นลง, reviewer อ่าน diff เป็นหลัก), ลดงานซ้ำ
(e2e เต็มชุดครั้งเดียว, เอกสารแยกไฟล์ต่อการ์ดเพื่อไม่ให้ชนกันตอน merge), และย้ายบทเรียนที่พลาดซ้ำเข้าไปใน
นิยาม agent กับเทสต์ที่ตรวจอัตโนมัติ ทุกการเปลี่ยนแปลงวัดผลเทียบ baseline ก่อนใช้ถาวร

**Tech Stack:** `.claude/skills/*`, `.claude/agents/*`, `scripts/*.mjs` (Node 22), vitest (`tests/unit`), GitHub Actions

**Spec:** เอกสารนี้ + baseline ด้านล่าง (วัดจาก session `4c9eb296…` วันที่ 2026-11-22 ถึง 2026-11-26)

## Baseline (วัดจริงจากบันทึกของ session)

ตัวเลข token คือ `subagent_tokens` ที่ harness รายงานต่อ agent หนึ่งตัว ไม่รวม token ของ session หลัก (ผู้คุมลูป)
ซึ่งยังไม่ได้วัด

| บทบาท | จำนวนครั้ง | token รวม | ค่ากลางต่อครั้ง | เวลาค่ากลาง |
|---|---|---|---|---|
| lead | 39 | 10.1M (34%) | 263k | 17 นาที |
| dev | 39 | 9.5M (32%) | 223k | (ต่อเนื่องหลายช่วง) |
| reviewer | 54 | 5.0M (17%) | 101k | 2 นาที |
| qa | 35 | 2.5M (9%) | 63k | 3 นาที |
| r3f-perf-reviewer | 32 | 1.4M (5%) | 42k | 1 นาที |
| privacy-auditor | 14 | 0.7M (2%) | 51k | 1 นาที |
| **รวม** | 216 | **29.3M** | ~750k ต่อการ์ด | |

ข้อเท็จจริงอื่นที่วัดได้:
- spec ของ lead ยาว 54–104 KB ต่อการ์ด (25 ใบล่าสุด) และ agent ทุกตัวหลังจากนั้นถูกสั่งให้อ่าน
- brief ยาว 12–15 KB โดย ~6 KB เป็น invariants A–G ที่คัดลอกจาก `CLAUDE.md` ซึ่ง agent อ่านอยู่แล้ว
- รอบ 7 การ์ดล่าสุด (MFW-50, 51, 60, 67, 68, 69, 70): เวลาทำงานจริง 1:17–3:00 ชม. ต่อใบ, ต้องแก้ 4 จาก 7 ใบ,
  CI ผ่านรอบแรก 5 จาก 7 ใบ
- **ช่องโหว่ที่พบระหว่างวัด:** skill กำหนดให้ qa ตรวจทุกการ์ด แต่รอบนี้ qa รันแค่ 3 จาก 7 ใบ
  (MFW-67, 68, 69, 50 ไม่มี qa) ไม่มีอะไรบังคับข้อนี้นอกจากผู้คุมลูปทำตาม skill เอง
- e2e เต็มชุด (5–8 นาที) รัน 3 ครั้งต่อการ์ด: dev, ผู้คุมลูป, CI
- `docs/follow-ups.md`, `docs/design/loy-krathong-look.md` (เลขหัวข้อ) ชนกันเกือบทุกครั้งที่ merge ใบที่สองเป็นต้นไป

## เป้าหมาย (วัดจาก 5 การ์ดแรกหลังเปลี่ยน)

| ตัวชี้วัด | Baseline | เป้า |
|---|---|---|
| token ของ subagent ต่อการ์ด M | ~750k | ≤ 450k |
| เวลาทำงานจริงต่อการ์ด M (lead เริ่ม → merge) | ~2:00 ชม. | ≤ 1:15 ชม. |
| ใบที่ต้องมีรอบแก้ | 4 จาก 7 | ไม่แย่ลง (≤ 3 จาก 5) |
| CI ผ่านรอบแรก | 5 จาก 7 | ไม่แย่ลง (≥ 4 จาก 5) |
| การ์ดที่ผ่าน reviewer + qa + auditor ครบตาม skill | 3 จาก 7 | 5 จาก 5 |

## Global Constraints

- ด่านที่ห้ามตัด: reviewer ทุกการ์ด, qa ทุกการ์ด, auditor ตามตารางใน `CLAUDE.md`, CI `ci` SUCCESS บน head SHA ก่อน merge
- สูงสุดหนึ่งรอบแก้ และ CI สูงสุด 2 ครั้ง เหมือนเดิม
- ห้ามทำให้เทสต์หรือ config อ่อนลง (`vitest.config.mts`, `playwright.config.ts`, `ci.yml`, `eslint.config.mjs`, `tsconfig.json`)
- Jira ผ่าน `node scripts/jira.mjs` เท่านั้น, GitHub ผ่าน `node scripts/gh-rest.mjs` เท่านั้น
- `tests/unit/loop-skills.test.ts` ต้องผ่านตลอด (marker และ safety rule ของ skill ต้องอยู่ครบ)
- โค้ด, คอมเมนต์, commit, PR เป็นภาษาอังกฤษ
- ทุก task เป็น PR ของตัวเองบน branch `feat/MFW-1-loop-<slug>` และทำบน main ที่ไม่มีการ์ดค้างแก้ไฟล์เดียวกัน

## Review Focus

1. brief ที่สั้นลงทำให้ agent ขาดข้อมูลจำเป็น (เช่น port, BASE, scope) → Task 2 มีเทสต์ว่า brief ต้องมีฟิลด์บังคับครบ
2. spec ที่สั้นลงทำให้ dev sonnet เดาเอง → Task 3 มี `spec-lint` ตรวจว่า AC ทุกข้อมีชื่อเทสต์ และ Task 9 เทียบอัตรารอบแก้
3. ข้าม e2e เต็มชุดโดยที่ tree เปลี่ยนไปแล้ว → Task 5 ผูกผล verify กับ tree hash และมีเทสต์กรณี hash ไม่ตรง
4. เอกสารแยกไฟล์แล้ว follow-up เก่าหาย → Task 4 มีเทสต์นับจำนวนรายการก่อนและหลังย้าย
5. การ์ดถูก merge โดยไม่มี qa → Task 6 ให้ `pr-create` ปฏิเสธเมื่อไม่มีไฟล์ verdict ครบ

---

### Task 1: วัดผลอัตโนมัติ (`loop-metrics`)

ทำก่อน เพราะทุก task หลังจากนี้ตัดสินจากตัวเลขนี้

**Files:**
- Create: `scripts/loop-metrics.mjs`, `scripts/loop-metrics-lib.mjs`
- Test: `tests/unit/loop-metrics.test.ts`, `tests/unit/fixtures/loop-metrics/transcript.jsonl`
- Modify: `.claude/skills/loop-ticket/SKILL.md` (Final report: แนบผลของ `loop-metrics <KEY>` ในคอมเมนต์ Jira ตอน Done)

**Interfaces:**
- Produces: `parseTranscript(text: string): AgentRun[]` โดย `AgentRun = { key: string; role: "lead"|"dev"|"reviewer"|"qa"|"perf"|"privacy"; tokens: number; toolUses: number; durationMs: number; startedAt: string }`
- Produces: `summarizeCard(runs: AgentRun[], key: string): { tokens: number; byRole: Record<string, number>; fixRounds: number; agents: number }`
- CLI: `node scripts/loop-metrics.mjs <transcript.jsonl> [MFW-n]` พิมพ์ JSON

- [ ] เขียนเทสต์จาก fixture: lead 263k + dev 223k + reviewer 101k ของ `MFW-60` → `tokens === 587000`, `fixRounds === 1` เมื่อมี "polish round"
- [ ] รันให้ตก: `pnpm test tests/unit/loop-metrics.test.ts`
- [ ] เขียน lib และ CLI (แยก role จาก description ของ Agent call: `Lead|Dev|Review|QA|Perf|Privacy` + `MFW-\d+`)
- [ ] รันให้ผ่าน แล้ว commit `feat(loop): per-card loop metrics MFW-1`

### Task 2: brief จากสคริปต์เดียว และสั้นลง

**Files:**
- Create: `scripts/loop-brief.mjs`, `docs/loop/context.md` (ข้อเท็จจริงของโค้ดและ CI ที่ทุก brief ใช้ร่วมกัน ≤ 60 บรรทัด)
- Test: `tests/unit/loop-brief.test.ts`
- Modify: `.claude/skills/loop-ticket/SKILL.md` §4.1 (เรียกสคริปต์แทนเขียนมือ; ชี้ไป `CLAUDE.md` แทนการคัดลอก invariants)

**Interfaces:**
- CLI: `node scripts/loop-brief.mjs <KEY> --wt <path> --base <sha> --port <n> --qa-port <n> --scratch <dir> [--context-file <path>]` เขียน `<scratch>/<KEY>-brief.md`
- Produces: `buildBrief(get: JiraGet, opts: BriefOpts): string`

- [ ] เทสต์: brief มี WT, branch, BASE, port ทั้งสอง, AC ครบทุกข้อ, path ของ spec และ dev report; ไม่มีข้อความ invariants ซ้ำ; ยาว ≤ 6,000 ตัวอักษรเมื่อไม่มี `--context-file`
- [ ] รันให้ตก → เขียนสคริปต์ → รันให้ผ่าน
- [ ] แก้ §4.1 และรัน `pnpm test tests/unit/loop-skills.test.ts`
- [ ] commit `feat(loop): generated briefs without duplicated invariants MFW-1`

### Task 3: spec ของ lead สั้นลง และมีขั้นประเมินขนาดก่อน

**Files:**
- Modify: `.claude/agents/lead.md`, `.claude/skills/loop-ticket/SKILL.md` §4.2
- Create: `scripts/spec-lint.mjs`
- Test: `tests/unit/spec-lint.test.ts`, `tests/unit/loop-skills.test.ts` (เพิ่มกรณี)

**Interfaces:**
- CLI: `node scripts/spec-lint.mjs <spec.md> --ac <n>` exit 0 เมื่อผ่าน, exit 1 พร้อมรายการที่ขาด
- กติกาที่ตรวจ: มี heading ครบ 7 หัว (`## Goal` … `## Risks`), AC ทุกข้อ 1..n มีชื่อไฟล์เทสต์อย่างน้อยหนึ่งไฟล์,
  ขนาด ≤ 24 KB (= 24,576 ไบต์) สำหรับ S/M และ ≤ 40 KB (= 40,960 ไบต์) สำหรับ L, code block รวมไม่เกิน 30% ของไฟล์

กติกาใหม่ใน `lead.md`:
- ขั้นแรกตอบ "sizing" ไม่เกิน 15 บรรทัด: S/M/L, ไฟล์ร่วมที่จะแตะ (`index.tsx`, config กลาง), และถ้าเป็น L ให้เสนอแบ่งการ์ดก่อนเขียน spec
- spec เขียนเฉพาะสิ่งที่ dev ตัดสินใจเองไม่ได้: path, signature, ค่าคงที่, ชื่อเทสต์กับ assertion; ไม่เขียน body ของฟังก์ชัน เว้นแต่อัลกอริทึมที่ signature กับเทสต์ไม่กำหนด
- เพิ่ม checklist ของ `r3f-perf-reviewer` แบบย่อ (ตัวจับเวลาเดียวต่อ canvas, ไม่ allocate ต่อเฟรม, pool มีเพดาน, ไม่เพิ่ม shader program) ให้ lead ใช้ตอนวางแผนงาน 3D

- [ ] เทสต์ `spec-lint` ด้วย fixture 3 แบบ: ผ่าน, AC ข้อ 3 ไม่มีเทสต์ (ตก), ยาว 60 KB (ตก)
- [ ] รันให้ตก → เขียนสคริปต์ → รันให้ผ่าน
- [ ] แก้ `lead.md` และ §4.2 (ผู้คุมลูปรัน `spec-lint` แทนการอ่าน spec ทั้งไฟล์; ไม่ผ่าน → resume lead หนึ่งครั้ง)
- [ ] commit `feat(loop): sized, capped lead specs with spec-lint MFW-1`

### Task 4: เอกสารแยกไฟล์ต่อการ์ด (ไม่ชนตอน merge)

**Files:**
- Create: `docs/follow-ups/README.md`, `docs/follow-ups/MFW-<n>.md` (ย้ายจาก `docs/follow-ups.md` ตามหัวข้อการ์ด), `scripts/split-follow-ups.mjs` (ใช้ครั้งเดียว)
- Modify: `docs/follow-ups.md` (เหลือสารบัญชี้ไปโฟลเดอร์), `docs/design/loy-krathong-look.md` (เอาเลขหัวข้อออก ใช้ชื่อ + รหัสการ์ด),
  `tests/unit/look-doc.test.ts` (อ้างหัวข้อด้วยชื่อ ไม่อ้างเลข §), คอมเมนต์ในโค้ดที่อ้าง `§1x`, `.claude/agents/dev.md`, `.claude/skills/loop-ticket/SKILL.md`
- Test: `tests/unit/follow-ups-layout.test.ts`

- [ ] เทสต์: ทุกไฟล์ใน `docs/follow-ups/` ชื่อ `MFW-<n>.md`; จำนวน bullet รวมหลังย้ายเท่ากับใน `docs/follow-ups.md` ก่อนย้าย (นับใน fixture snapshot); look doc ไม่มี heading ขึ้นต้นด้วยตัวเลข
- [ ] รันให้ตก → รันสคริปต์ย้าย → แก้ look doc และ `grep -rn "§1[0-9]" src tests` ให้เหลือ 0 → รันให้ผ่าน
- [ ] กติกาใน `dev.md`: เขียน follow-up ลง `docs/follow-ups/<KEY>.md` เท่านั้น
- [ ] commit `refactor(docs): per-card follow-ups and unnumbered look-doc sections MFW-1`

### Task 5: e2e เต็มชุดครั้งเดียวต่อการ์ด

**Files:**
- Create: `scripts/loop-verify.mjs`
- Test: `tests/unit/loop-verify.test.ts`
- Modify: `.claude/agents/dev.md` (dev รัน typecheck, lint, unit และ e2e เฉพาะ spec ที่แตะหรือที่ spec ของ lead ระบุ), `.claude/skills/loop-ticket/SKILL.md` Step 5

**Interfaces:**
- CLI: `node scripts/loop-verify.mjs --wt <path> --port <n> --scratch <dir>` รัน 5 คำสั่งแยกกัน เขียน `<scratch>/<KEY>-verify.json` = `{ tree: string, results: { typecheck, lint, test, build, e2e } }` โดย `tree` คือ `git write-tree` ของ index ชั่วคราวที่รวม working tree
- `--check` exit 0 เมื่อไฟล์ verify มี `tree` ตรงกับ tree ปัจจุบันและทุกคำสั่งผ่าน

- [ ] เทสต์: tree เปลี่ยนหลัง verify → `--check` exit 1; tree เท่าเดิมและผ่านครบ → exit 0; คำสั่งใดตก → exit 1
- [ ] รันให้ตก → เขียนสคริปต์ → รันให้ผ่าน
- [ ] Step 5: รัน `loop-verify` ครั้งเดียวหลัง rebase หรือ merge main ครั้งสุดท้าย; ถ้าต้องแก้อะไรหลังจากนั้น tree จะเปลี่ยนและต้องรันใหม่
- [ ] commit `feat(loop): single full verify bound to the tree hash MFW-1`

### Task 6: ด่านที่ข้ามไม่ได้ (verdict ครบจึงเปิด PR ได้, CI ผ่านจึง merge ได้ในคำสั่งเดียว)

**Files:**
- Modify: `scripts/gh-rest.mjs`, `scripts/gh-rest-lib.mjs`, `.claude/skills/loop-ticket/SKILL.md` Step 6–7
- Test: `tests/unit/gh-rest-cli.test.ts`, `tests/unit/gh-rest-lib.test.ts`

**Interfaces:**
- `pr-create … --verdicts <dir> --key <KEY>`: ปฏิเสธ (exit 1) เมื่อไม่มี `<KEY>-reviewer.md` และ `<KEY>-qa.md` ที่บรรทัดแรกเป็น `VERDICT: PASS`, หรือขาดไฟล์ของ auditor ที่ path ใน diff กำหนด, หรือ `loop-verify --check` ไม่ผ่าน
- `pr-land <pr> --sha <40-hex>`: รอ CI บน SHA นั้น แล้ว merge เฉพาะเมื่อ `GATE: PASS sha=<เดียวกัน>`; ข้อจำกัดเดิมของ `pr-merge` (supabase path, label owner-merge, `--risk`) คงเดิม
- เพิ่มบรรทัดแรก `VERDICT: PASS|FIX FIRST|GOAL NOT MET` ในรูปแบบรายงานของ `reviewer.md`, `qa.md`, `privacy-auditor.md`, `r3f-perf-reviewer.md`

- [ ] เทสต์: ไม่มีไฟล์ qa → ปฏิเสธพร้อมข้อความระบุไฟล์ที่ขาด; diff แตะ `src/components/canvas3d/` แต่ไม่มี verdict ของ perf → ปฏิเสธ; ครบ → ผ่าน; `pr-land` กับ check-run ที่ failure → ไม่เรียก merge
- [ ] รันให้ตก → เขียน → รันให้ผ่าน → commit `feat(loop): verdict-gated PR creation and pr-land MFW-1`

### Task 7: บทเรียนที่พลาดซ้ำ เข้าไปอยู่ใน agent และเทสต์

**Files:**
- Create: `docs/loop/lessons.md` (≤ 60 บรรทัด, รูปแบบ `- <วันที่> <KEY>: <สาเหตุ> → <กติกา>`), `tests/unit/e2e-robustness.test.ts`
- Modify: `.claude/agents/dev.md`, `.claude/agents/reviewer.md`, `.claude/agents/qa.md`, `.claude/skills/loop-ticket/SKILL.md` (Final report: ทุกครั้งที่มีรอบแก้, CI ตก หรือ PARK ให้เพิ่มหนึ่งบรรทัดใน `lessons.md`; บทเรียนที่เกิดซ้ำสองครั้งต้องย้ายเข้านิยาม agent หรือเป็นเทสต์ใน PR ถัดไป)

กติกาที่ย้ายเข้า agent (มาจากเหตุการณ์จริง):
- `dev.md` — e2e 3D: เปิด `E2E_PINNED_TIER_URL`, poll DOM attribute, ไม่รอให้กล้องบินจบ, ไม่คลิกพิกัดตายตัวที่กล้องทำให้เลื่อนได้ (MFW-68, MFW-69)
- `dev.md` — งานภาพ: ถ่ายภาพที่ 390×844 หลัง rebase ล่าสุด ระบุ SHA ของฐาน และรายงานขนาดของสิ่งใหม่เป็น px (MFW-60, MFW-50)
- `reviewer.md` — ตัวเลขใน PR body, doc และคอมเมนต์ต้องชี้ไฟล์ผลวัด; ข้อความ "owner decided" ต้องอ้างคำของ owner; เหตุผลในคอมเมนต์ต้องตรวจได้จากโค้ด (PR #51, MFW-69, MFW-70)
- `qa.md` — การ์ดงานภาพต้องตัดสินจากภาพที่ขนาดมือถือ ทั้ง DAY และ NIGHT

- [ ] เทสต์ `e2e-robustness`: ไฟล์ใน `tests/e2e/*.spec.ts` ไม่มี `waitForTimeout(` (ตอนนี้มี 2 จุด ให้แก้เป็น poll หรือใส่ allowlist พร้อมเหตุผลในไฟล์เทสต์) และ spec ที่ตั้ง tier 3D ต้อง import `E2E_PINNED_TIER_URL`
- [ ] รันให้ตก → แก้ 2 จุดนั้น → รันให้ผ่าน
- [ ] แก้ agent ทั้งสามและ skill → `pnpm test tests/unit/loop-skills.test.ts`
- [ ] commit `feat(loop): recurring lessons become agent rules and tests MFW-1`

### Task 8: reviewer อ่าน diff เป็นหลัก และการ์ดเล็กข้าม lead

**Files:**
- Modify: `.claude/skills/loop-ticket/SKILL.md` §4.0–4.4 และ Step 2, `.claude/agents/reviewer.md`, `.claude/agents/r3f-perf-reviewer.md`, `scripts/jira-lib.mjs` (`sizeHint.skipLead`)
- Test: `tests/unit/jira-lib.test.ts`, `tests/unit/loop-skills.test.ts`

กติกา:
- reviewer ได้ brief + diff + ส่วน `## Acceptance criteria → checks` และ `## Decisions` ของ spec; อ่านส่วนอื่นของ spec เมื่อ diff ไม่ตรงเท่านั้น
- r3f-perf-reviewer และ privacy-auditor ได้ diff + brief (ไม่ได้ spec)
- มี `docs/plans/<KEY>.md` และ `node scripts/spec-lint.mjs docs/plans/<KEY>.md --ac <n>` ผ่าน → ข้าม lead; dev ใช้ไฟล์นั้นเป็น spec
  (`spec-lint` ไม่ผ่าน → lead ตามปกติ โดยได้ไฟล์นั้นเป็นข้อมูลตั้งต้น)
- `sizeHint.skipLead === true` เมื่อ AC ≤ 2, ไม่มี label `privacy`/`db`/`migration`/`dev-opus`/`3d`, และไม่ใช่ระบบใหม่ → dev ทำจาก brief โดยตรง แล้วผ่าน reviewer + qa + CI ครบ

- [ ] เทสต์ `sizeHint.skipLead`: AC 2 ข้อ label `ui` → true; AC 2 ข้อ label `privacy` → false; AC 3 ข้อ → false
- [ ] รันให้ตก → เขียน → รันให้ผ่าน → แก้ skill และ agent → commit `feat(loop): diff-first reviews and lead-less small cards MFW-1`

### Task 9: ทดลองและตัดสินจากตัวเลข

**Files:**
- Create: `docs/loop/optimization-results.md`

- [ ] รัน 5 การ์ดถัดไปด้วยลูปใหม่ แล้วรัน `node scripts/loop-metrics.mjs` ต่อใบ
- [ ] เขียนตารางเทียบเป้าหมายด้านบนลง `optimization-results.md`
- [ ] ถ้าอัตรารอบแก้หรือ CI ผ่านรอบแรกแย่กว่า baseline: ถอย Task 3 (เพดาน spec) ก่อน แล้ว Task 8 (ข้าม lead) และบันทึกเหตุผล

## ลำดับและการพึ่งพา

Task 1 → (Task 2, 4, 5, 6, 7 ทำขนานกันได้ คนละไฟล์ ยกเว้น `loop-ticket/SKILL.md` ที่ต้อง merge ทีละใบ) → Task 3 → Task 8 → Task 9

## การตัดสินใจของ owner (2026-11-26)

1. การ์ดขนาด S ข้าม lead ได้ (Task 8)
2. ไม่ทดลอง lead เป็น sonnet; แทนด้วยกติกา "การ์ดที่มี spec อยู่แล้วให้ implement เลย": ถ้ามี `docs/plans/<KEY>.md`
   และ `spec-lint` ผ่าน ให้ข้าม lead แล้วส่งไฟล์นั้นให้ dev เป็น spec (Task 8)
3. เพดานขนาด spec 24 KB (S/M) และ 40 KB (L) ใช้เป็นค่าเริ่มต้น (Task 3)
4. เริ่มทำแผนนี้หลัง MFW-58 merge

## ยังไม่ได้อยู่ในแผน

- token ของ session หลัก (ผู้คุมลูป) ยังไม่ได้วัด น่าจะมากพอสมควรเพราะบันทึกของ session นี้ยาว 34 MB; Task 1 ควรขยายไปวัดส่วนนี้ก่อนจะเสนอวิธีลด
- เวลาของ CI บน GitHub ยังไม่ได้วัด จึงยังไม่เสนอ cache ของ Playwright หรือการแบ่ง shard
