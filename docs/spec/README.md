# Shared Miniature Festival World — Technical Spec | v3.0

เอกสารสถาปัตยกรรมระบบ แผนการพัฒนา และโรดแมปเทศกาล (System Architecture, Task Plan & 2026–2027 Roadmap — v3.0)

โครงการ: Shared Miniature Festival World (โลกเทศกาลจิ๋วส่วนรวม)

| Field | Value |
|---|---|
| Status | Active Blueprint & Specification (Phase 1: Loy Krathong Focus) |
| Author | System Architecture & Loop Engineering Team |
| Date | 2026–2027 Festival Cycle |
| Version | v3.0 |

วัตถุประสงค์เอกสาร: สำหรับใช้เป็นพิมพ์เขียว (Blueprint), ปฏิทินวางแผนเทศกาลปี 2026–2027 และแตก Sub-task เพื่อเข้าสู่กระบวนการ Loop Engineering (Spec → Prompt → Code → Test → Refine)

## สารบัญ (Table of Contents)

- [00-scope.md](00-scope.md) — 0. บันทึกขอบเขตการพัฒนา (Development Scope & Phasing Note)
- [01-roadmap.md](01-roadmap.md) — 1. โรดแมปปฏิทินเทศกาลและรายละเอียดฟีเจอร์ (Festival Roadmap: พ.ย. 2026 – พ.ย. 2027), 1.1 รายละเอียด Feature, Ritual และ Gimmick ของแต่ละเทศกาลใน Roadmap
- [02-architecture.md](02-architecture.md) — 2. ภาพรวมสถาปัตยกรรมระบบ (System Architecture Overview), 2.1 Tech Stack ที่แนะนำ
- [03-structure.md](03-structure.md) — 3. โครงสร้างโฟลเดอร์โปรเจกต์ (Project Directory Structure)
- [04-coordinates.md](04-coordinates.md) — 4. การออกแบบระบบพิกัดกลาง 2D/3D (Unified 2D/3D Coordinate Architecture)
- [05-privacy-db.md](05-privacy-db.md) — 5. การออกแบบระบบความเป็นส่วนตัวและฐานข้อมูล (Privacy & Data Separation)
- 6. แผนงานละเอียดสำหรับทำ Loop Engineering (8 Loops — โฟกัส Loy Krathong ก่อน)
  - [06-loops/loop-1.md](06-loops/loop-1.md) — 6.1 Loop 1: Project Foundation, Config Schema & Adaptive Performance Engine
  - [06-loops/loop-2.md](06-loops/loop-2.md) — 6.2 Loop 2: Privacy, Security & Anonymous Ownership Vault
  - [06-loops/loop-3.md](06-loops/loop-3.md) — 6.3 Loop 3: Minimal Toy-like 3D Viewport & Mobile Input Separation
  - [06-loops/loop-4.md](06-loops/loop-4.md) — 6.4 Loop 4: Loy Krathong Modular Customization & Wish Composer
  - [06-loops/loop-5.md](06-loops/loop-5.md) — 6.5 Loop 5: Loy Krathong Ritual, River Spline Movement & Growing River Zones
  - [06-loops/loop-6.md](06-loops/loop-6.md) — 6.6 Loop 6: Loy Krathong Scene Environment & Interactive Gimmicks
  - [06-loops/loop-7.md](06-loops/loop-7.md) — 6.7 Loop 7: “ค้นหาของฉัน” (Find My Krathong) & Cross-Zone Tracking
  - [06-loops/loop-8.md](06-loops/loop-8.md) — 6.8 Loop 8: Flat Vector 2D Fallback & Mobile Performance Polish
