# 2. ภาพรวมสถาปัตยกรรมระบบ (System Architecture Overview)

เพื่อให้รองรับหลายเทศกาลโดยไม่ต้องเขียนโค้ดใหม่ทั้งหมด ระบบจึงถูกออกแบบในลักษณะ Core Multi-Event Engine + Event Configuration Plugins และรองรับการสลับระหว่าง 3D Toy-like View กับ 2D Flat Vector Fallback ด้วยข้อมูลชุดเดียวกัน 100%

## 2.1 Tech Stack ที่แนะนำ

- Frontend Framework: Next.js (App Router) หรือ Vite + React (TypeScript)
- 3D Engine & Rendering: Three.js + React Three Fiber (R3F) + @react-three/drei
- Animation & Effects: GSAP หรือ @react-spring/three (เน้น Procedural Animation สั้นๆ เช่น เด้ง เอียง หมุน ลอย และ glow โดยไม่พึ่งฟิสิกส์สมจริง)
- State Management: Zustand (แยก Store สำหรับ UI State, Customization State, World Scene State, และ Device Performance State)
- 2D Fallback Engine: HTML5 Canvas / SVG Modular Renderer (ใช้พิกัดกลางชุดเดียวกับ 3D)

> Note (owner, 2026-11-26, MFW-71): "เอา 2d ออกไปเลย" — the 2D fallback is removed; only the 3D scene (HIGH | MEDIUM | LOW) remains. See open-questions row 46.
- Backend & Database: Supabase (PostgreSQL) หรือ Node.js + PostgreSQL + Redis (สำหรับจัดการ Spatial Zone & Caching)
- Security & Moderation: LocalStorage Ownership Token Vault + ระบบกรอง PII (ข้อมูลส่วนบุคคล) และคำหยาบ
