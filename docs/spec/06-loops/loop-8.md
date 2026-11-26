# 6.8 Loop 8: Flat Vector 2D Fallback & Mobile Performance Polish

> Note (owner, 2026-11-26, MFW-71): "เอา 2d ออกไปเลย" — the 2D fallback is removed; only the 3D scene (HIGH | MEDIUM | LOW) remains. See open-questions row 46.

### Task 8.1: Flat Vector 2D Fallback Renderer

- สร้างโหมดสำรอง 2D สำหรับเครื่องที่ไม่รองรับ 3D:
  - หน้าแต่งกระทงแบบซ้อนเลเยอร์ 2D Flat Vector
  - ฉากแม่น้ำ 2D มุมมองกึ่ง Top-down ที่อ่านค่า SplinePathCoord ชุดเดียวกันมาวาดการเคลื่อนที่ของกระทง แตะน้ำเกิดวงน้ำ 2D และกด “ค้นหาของฉัน” เพื่อเลื่อนจอไปหากระทงได้ครบถ้วน
  - เตรียมโมดูลแปลงพิกัด NormalizedCylindricalCoord → 4-Quadrant 2D View ไว้ใน `core/fallback2d/` สำหรับรองรับเทศกาลคริสต์มาสและตรุษจีนในเฟสถัดไป

### Task 8.2: Instanced Rendering & Memory Cleanup Audit

- ใช้ InstancedMesh สำหรับชิ้นส่วนดอกไม้ ใบตอง และต้นไม้ริมฝั่งที่ใช้ซ้ำกัน
- ทดสอบการสลับโซนคุ้งน้ำบนมือถือจริงเพื่อให้มั่นใจว่ามีการคืนหน่วยความจำ (Dispose Geometry/Material) ไม่ให้เว็บค้างหรือเด้งออก
