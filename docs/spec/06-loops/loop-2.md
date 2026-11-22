# 6.2 Loop 2: Privacy, Security & Anonymous Ownership Vault

### Task 2.1: Client-side Anonymous Ownership Token

- สร้างรหัสสุ่มปลอดภัย (DeviceOwnerToken) เก็บใน LocalStorage พร้อม UI แจ้งเตือนผู้ใช้ว่า “การล้างข้อมูลเบราว์เซอร์หรือเปลี่ยนอุปกรณ์จะทำให้ไม่สามารถค้นคืนรายการผลงานของตัวเองได้”

### Task 2.2: Public/Private Separated API & Database

- สร้าง API สำหรับบันทึกและดึงข้อมูลกระทงรายโซน (`GET /api/creations?event=loy_krathong&zone=1`) โดยตรวจสอบว่าไม่มีการหลุดรอดของ owner_token หรือข้อความส่วนตัวออกมาใน Public Payload

### Task 2.3: PII Guard, Profanity Filter & Report Endpoint

- สร้างตัวกรองดักจับเบอร์โทรศัพท์, อีเมล, Line ID, ชื่อบัญชีโซเชียล และคำไม่เหมาะสมก่อนบันทึก พร้อมแจ้งเตือนผู้ใช้ไม่ให้ใส่ข้อมูลส่วนบุคคล
- สร้างระบบกดปุ่ม “รายงานข้อความ (Report)” สำหรับข้อความสาธารณะ
