# 6.4 Loop 4: Loy Krathong Modular Customization & Wish Composer

### Task 4.1: Krathong Modular Assembler & Socket Rules

- สร้างระบบประกอบชิ้นส่วนกระทงแบบ Modular ที่แชร์ Geometry/Material ร่วมกัน:
  - base: ฐานหยวกกล้วย / ฐานกลีบบัว / ฐานขนมปังสไตล์ของเล่น
  - bananaLeaves: รูปแบบการพับกลีบใบตองและสีสัน
  - flowers: ดอกดาวเรือง ดอกกล้วยไม้ ดอกบัว (วางเรียงตาม Socket รอบขอบ)
  - candleAndIncense: เทียนและธูป (บังคับ Constraint ที่ center_socket ให้ตั้งตรงแกน Y เสมอ)

### Task 4.2: Mobile-First Customizer UI

- สร้างแถบเลือกชิ้นส่วนและสีด้านล่างหน้าจอ พร้อมปุ่มหมุนดูรอบด้าน ซูมดูรายละเอียด และแอนิเมชันเด้งเบาๆ ตอนเปลี่ยนชิ้นส่วน

### Task 4.3: Wish / Let-Go Composer Modal

- สร้างหน้าต่างเขียนคำอธิษฐานหรือสิ่งที่อยากปล่อยวาง พร้อมตัวเลือกชัดเจนว่าจะ “เก็บข้อความเป็นส่วนตัว” หรือ “เผยแพร่แบบไม่ระบุตัวตน (Anonymous)”
