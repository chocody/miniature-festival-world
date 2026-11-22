# 0. บันทึกขอบเขตการพัฒนา (Development Scope & Phasing Note)

- กลยุทธ์การพัฒนา (Hybrid Multi-Event Engine, Loy Krathong First):
  1. ระดับ Core Engine & Data Schema: ออกแบบโครงสร้างพื้นฐาน ระบบกล้อง ระบบพิกัดกลาง 2D/3D (Unified Coordinate System: SplinePathCoord, NormalizedCylindricalCoord, PlanarZoneCoord) และระบบแบ่งโซนให้รองรับทุกเทศกาลตั้งแต่ต้น เพื่อป้องกันการรื้อโค้ดในอนาคต
  2. ระดับ Content, 3D Assets & Gimmick (Phase 1 Target): ลงมือสร้างฉาก โมเดลของตกแต่ง และลูกเล่นใช้งานจริงเฉพาะเทศกาล ลอยกระทง (Loy Krathong — Make & Release) ให้เสร็จสมบูรณ์เป็นเทศกาลแรกก่อน ส่วนเทศกาลถัดไปตามปฏิทินปี 2026–2027 ให้เตรียมไว้เป็น Config Stub และทยอยเปิดตามโรดแมป
