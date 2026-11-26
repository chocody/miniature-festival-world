# 3. โครงสร้างโฟลเดอร์โปรเจกต์ (Project Directory Structure)

```text
src/
├── app/                        # Routing & Pages (Landing, Event World)
├── config/
│   ├── events/                 # Event-specific Configs (JSON/TS)
│   │   ├── loyKrathong.config.ts   # [PHASE 1 - ACTIVE] กติกาการวาง, ชิ้นส่วนกระทง, โซนแม่น้ำ
│   │   ├── christmas.config.ts     # [STUB/FUTURE] กติกาต้นไม้เติบโต, พิกัดทรงกรวย
│   │   ├── newYear.config.ts       # [STUB/FUTURE] จุดยิงพลุ, ป้ายคำอวยพร, ท้องฟ้า
│   │   └── songkran.config.ts      # [STUB/FUTURE] ขันน้ำ, พวงมาลัย, กติกาการพรมน้ำ
│   ├── performance.config.ts   # Tier settings (High, Medium, Low, Fallback 2D)
│   └── moderation.config.ts    # กฎการกรอง PII และคำต้องห้าม
├── core/                       # Core Engine (ใช้ร่วมกันทุกเทศกาล)
│   ├── coordinates/            # Unified 2D/3D Coordinate Converters
│   │   ├── SplinePathCoord.ts      # สำหรับวัตถุเคลื่อนที่ตามเส้นทาง (เช่น กระทงในแม่น้ำ)
│   │   ├── CylindricalCoord.ts     # สำหรับแปะของรอบวัตถุ 360 องศา (เช่น ต้นคริสต์มาส, ต้นส้มตรุษจีน)
│   │   └── PlanarGridCoord.ts      # สำหรับวางบนลาน/ท้องฟ้า/สวน (เช่น ปีใหม่, สงกรานต์)
│   ├── camera/                 # CameraController (Orbit, Zoom, FocusMyItem)
│   ├── customization/          # Modular Builder, Slot/Socket Validator
│   ├── world/                  # ZoneManager, GrowingWorldScaler, Spawner
│   ├── ritual/                 # RitualStateMachine (Drag-to-release, Tap-to-hang, Swipe-to-splash)
│   ├── interaction/            # RaycastManager, InputSeparator (แยกหมุนกล้อง vs วางของ)
│   ├── effects/                # ObjectPoolManager (Ripples, Fireworks, Confetti, Glow)
│   └── fallback2d/             # 2D Flat Vector Renderer (แปลงพิกัดกลางเป็น 2D View)
├── components/
│   ├── canvas3d/               # R3F Canvas, Lights, Stylized Matte Materials, InstancedMeshes
│   ├── canvas2d/               # 2D Fallback Viewport (River 2D Map, 4-Quadrant Tree View)
│   ├── models/
│   │   └── loyKrathong/        # [PHASE 1] โมเดลฐานกระทง ใบตอง ดอกไม้ เทียน บ้านริมน้ำ
│   └── ui/                     # Mobile-first Overlay UI
│       ├── NoActiveEventScreen.tsx # หน้าจอเมื่อไม่มีเทศกาลที่เปิดอยู่ (MFW-53: ไม่มีหน้าเลือกเทศกาล, open questions 26/33)
│       ├── CustomizerPanel.tsx     # แผงเลือกชิ้นส่วน สี ลวดลาย
│       ├── WishModal.tsx           # หน้าต่างเขียนคำอวยพร + Toggle Public/Private + PII Warning
│       ├── MyCreationsDrawer.tsx   # ปุ่มและรายการ "ค้นหาของฉัน"
│       └── InspectPopup.tsx        # ดูคำอวยพรคนอื่นแบบ Anonymous + ปุ่ม Report
├── services/
│   ├── api/                    # Fetch/Submit Creations, Zone Pagination
│   ├── auth/                   # Anonymous Ownership Token Generator & Local Vault
│   └── moderation/             # PII Detector (เบอร์โทร, อีเมล, Line ID) & Profanity Filter
└── store/
    ├── useWorldStore.ts        # เก็บสถานะโซนปัจจุบัน, จำนวนผู้เล่น, ระดับการเติบโตของโลก
    ├── useBuilderStore.ts      # เก็บข้อมูลชิ้นงานที่กำลังแต่ง
    └── useDeviceStore.ts       # เก็บสถานะ FPS, Quality Tier, Reduced Motion, IsFallback2D
```

> Note (owner, 2026-11-26, MFW-71): "เอา 2d ออกไปเลย" — the 2D fallback is removed; only the 3D scene (HIGH | MEDIUM | LOW) remains. See open-questions row 46.
