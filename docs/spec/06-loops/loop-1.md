# 6. แผนงานละเอียดสำหรับทำ Loop Engineering (8 Loops — โฟกัส Loy Krathong ก่อน)

แผนงานนี้ปรับให้ วางโครง Engine รองรับอนาคต แต่ลงมือทำจริงเฉพาะเทศกาลลอยกระทง (Loy Krathong) ในเฟสแรก เพื่อให้นำไปรัน Loop Engineering ได้อย่างรวดเร็วและไม่หลงทาง

## 6.1 Loop 1: Project Foundation, Config Schema & Adaptive Performance Engine

### Task 1.1: Setup Core Project & Flow State Machine

- ตั้งค่า React/Next.js + TypeScript + Tailwind + Zustand
- สร้าง Flow State Machine: LANDING_EVENT_SELECT → CUSTOMIZE_OBJECT → WRITE_WISH → RITUAL_RELEASE → SHARED_WORLD_EXPLORE
- ในหน้าเลือกเทศกาล ให้เปิดใช้งาน Loy Krathong เป็นหลัก (ส่วนเทศกาลอื่นใน Roadmap แสดงสถานะ Coming Soon หรือควบคุมด้วย Feature Flag)

### Task 1.2: Unified Coordinate Converter Module

- เขียนโมดูล SplinePathCoord (สำหรับลอยกระทง) และโครง Interface ของ NormalizedCylindricalCoord และ PlanarZoneCoord พร้อม Unit Test ทดสอบการแปลงพิกัดไป–กลับระหว่าง Parametric Coord ↔ 3D World Position ↔ 2D Canvas Position

### Task 1.3: Mobile Hardware Profiler & Quality Tier Switcher

- สร้างตัววัด FPS และตรวจจับสเปคเครื่อง + prefers-reduced-motion
- ตั้งค่าระดับกราฟิกอัตโนมัติ: HIGH, MEDIUM, LOW, และสลับเข้า FALLBACK_2D เมื่อ WebGL ไม่รองรับหรือ FPS ต่ำกว่าเกณฑ์
