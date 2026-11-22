# 5. การออกแบบระบบความเป็นส่วนตัวและฐานข้อมูล (Privacy & Data Separation)

เพื่อปฏิบัติตามกฎ Privacy & Safety อย่างเคร่งครัด ต้องแยกข้อมูลออกเป็น 2 ตาราง:

## 1. ตาราง creations_public (เปิดให้ Client ทุกคนดึงไปแสดงผลได้)

| Column | Type | Notes |
|---|---|---|
| id | UUID | รหัสชิ้นงาน |
| event_id | String | เฟสแรกใช้ ‘loy_krathong’ |
| zone_id | Int | หมายเลขโซนคุ้งน้ำ (จำกัดโซนละไม่เกิน 80–100 ชิ้นเพื่อรักษา FPS บนมือถือ) |
| appearance | JSONB | ข้อมูลชิ้นส่วน Modular เช่น `{ base: “banana_trunk_01”, lotusFold: “style_02”, flowers: [“marigold”, “orchid”], candleColor: “#FFD166” }` |
| coord | JSONB | เก็บโครงสร้างพิกัดกลาง (SplinePathCoord, NormalizedCylindricalCoord, หรือ PlanarZoneCoord) |
| public_wish_text | String \| Nullable | มีข้อความเฉพาะกรณีผู้ใช้เลือก “เผยแพร่แบบไม่ระบุตัวตน (Anonymous)” และผ่านระบบกรอง PII แล้วเท่านั้น (หากเลือกเก็บเป็นส่วนตัว ค่านี้จะเป็น null) |
| created_at & expires_at | Timestamp | กำหนดระยะเวลาจัดเก็บข้อมูลชัดเจน |

## 2. ตาราง creations_private_ownership (ห้ามส่งออกทาง Public API เด็ดขาด)

| Column | Type | Notes |
|---|---|---|
| creation_id | UUID, FK | รหัสอ้างอิงชิ้นงาน |
| owner_token_hash | String | ค่า SHA-256 Hash ของรหัสเจ้าของแบบสุ่มที่เก็บใน LocalStorage ของเครื่องผู้ใช้ |
| private_wish_text | Encrypted String \| Nullable | เก็บข้อความคำอธิษฐานกรณีผู้ใช้เลือกเก็บเป็นส่วนตัว (อ่านได้เฉพาะเจ้าของที่ส่ง owner_token มายืนยัน) |
| report_count & moderation_status | Int & Enum: approved, flagged, hidden | สถานะการตรวจสอบและจำนวนการรายงานความไม่เหมาะสม |
