import { describe, expect, it } from "vitest";
import type { PiiReason } from "@/config/moderation.config";
import { detectPii, isPhoneDigitRun } from "./piiDetector";

const PHONE_POSITIVES: readonly string[] = [
  "081\u2013234\u20135678",
  "โทร 081-234-5678", "0812345678", "081 234 5678", "๐๘๑๒๓๔๕๖๗๘", "+66 81 234 5678", "+66812345678", "02-123-4567", "(02) 123 4567", "0 8 1 2 3 4 5 6 7 8", "call me 089.123.4567", "０８１２３４５６７８", "ปี 2569 โทร 0812345678", "2569 081 234 5678", "081 - 234 - 5678", "053-123456", "Tel. 0-2123-4567",
];

const EMAIL_POSITIVES: readonly string[] = [
  "john @ gmail.com",
  "john@gmail . com",
  "somchai@gmail.com", "SOMCHAI.J@Hotmail.co.th", "somchai [at] gmail [dot] com", "somchai แอท gmail ดอท com", "somchai at gmail dot com", "ｓｏｍｃｈａｉ＠ｇｍａｉｌ．ｃｏｍ", "ติดต่อsomchai@gmail.comนะ", "so\\u200Bmchai@gmail.com",
];

const LINE_ID_POSITIVES: readonly string[] = [
  "line somchai99",
  "add my line somchai_99",
  "line: somchai99", "Line ID somchai_99", "LINE id: @shop123", "lineid: somchai", "id line abc.def", "ไลน์ somchai99", "ไลน์: abc123", "ไอดีไลน์: somchai", "ไลน์ไอดี somchai", "แอดไลน์ @abc123",
];

const SOCIAL_HANDLE_POSITIVES: readonly string[] = [
  "my ig is somchai99",
  "ig is somchai99",
  "ig: somchai.j", "IG @somchai", "@somchai_j", "ติดตามที่ @abc123 นะ", "fb: somchai", "facebook.com/somchai.j", "https://www.instagram.com/somchai/", "tiktok.com/@somchai", "line.me/ti/p/~somchai", "ไอจี somchai99", "เฟส: somchai.j", "เฟสบุ๊ค somchai.j", "john@gmail",
];

const POSITIVES: ReadonlyArray<readonly [PiiReason, readonly string[]]> = [
  ["phone", PHONE_POSITIVES],
  ["email", EMAIL_POSITIVES],
  ["line_id", LINE_ID_POSITIVES],
  ["social_handle", SOCIAL_HANDLE_POSITIVES],
];

const NEGATIVES: readonly string[] = [
  "ลอยกระทง 08.11.2569 19.30 น.",
  "วันที่ 08.11.2569 19.30",
  "เวลา 08.30 09.45 10.00",
  "ขอให้มีเพื่อนในไลน์ 100 คน",
  "ขอให้เฟส 2569 สดใส",
  "ขอให้ยูทูบ 1000000 ซับ",
  "ขอให้ไอจี 10k followers",
  "online",
  "deadline",
  "line up",
  "a line of krathongs",
  "line 1",
  "ขอให้ทุกคนมีความสุข", "ขอให้ครอบครัวแข็งแรง ปี 2569 ปังๆ", "ขอให้น้องหายป่วย ๒๕๖๙", "ปี 2568 2569 2570", "สุขสันต์วันลอยกระทง 24/11/2569", "ครบรอบ 10 ปี 25 พ.ย.", "ขอให้ถูกหวยเลข 123456", "ขอให้ธุรกิจเติบโต 100,000,000 บาท", "ราคา 1 500 000 บาท", "ไปเที่ยว 19.00-21.00 น.", "เวลา 05.30 07.45", "ขอให้ได้เกรด 4.00", "ซื้อ 2 ชิ้น @100 บาท", "สวัสดีครับ @ทุกคน", "ขอบคุณเพื่อนในไลน์กลุ่มทุกคน", "ขอให้ได้งานที่ Google", "Happy Loy Krathong 2026!", "Year 2026, 2027 and 2028", "May all my wishes come true", "a line of lanterns on the river", "deadline: tomorrow", "online: hello world", "See you at 7.30 pm", "the time is 10:30", "email me later", "love you @ 100%", "IG is fun", "my fb friends",
];

describe("detectPii positives (Thai + English)", () => {
  for (const [reason, inputs] of POSITIVES) {
    it.each(inputs)(`${reason}: %s`, (input) => {
      expect(detectPii(input)).toContain(reason);
    });
  }
});

describe("detectPii exact results", () => {
  it("masks matches so reasons stay clean", () => {
    expect(detectPii("line: 0812345678")).toEqual(["phone"]);
    expect(detectPii("ไลน์ 0812345678")).toEqual(["phone"]);
    expect(detectPii("x@gmail.com")).toEqual(["email"]);
    expect(detectPii("โทร 0812345678 หรือ line: abc123 อีเมล a@b.co ig: somchai")).toEqual([
      "phone",
      "email",
      "line_id",
      "social_handle",
    ]);
  });
});

describe("detectPii negatives (normal wishes)", () => {
  it.each(NEGATIVES)("%s", (input) => {
    expect(detectPii(input)).toEqual([]);
  });
});

describe("isPhoneDigitRun", () => {
  it.each([
    ["081 234 5678", true],
    ["2569 081 234 5678", true],
    ["66 81 234 5678", true],
    ["2569", false],
    ["123456", false],
    ["0812345", false],
    ["08123456789012", false],
  ])("%s -> %s", (run, expected) => {
    expect(isPhoneDigitRun(run)).toBe(expected);
  });
});

describe("detectPii robustness", () => {
  it("handles empty and very long adversarial input", () => {
    expect(detectPii("")).toEqual([]);
    expect(detectPii("a".repeat(50_000) + "@" + "b".repeat(50_000))).toContain("social_handle");
    expect(detectPii("0 ".repeat(30_000) + "line ".repeat(20_000))).toBeDefined();
  });

  it.each(["line", "id line", "ไลน์", "ไอจี", "ig", "line id", "ไอดี ไลน์", "เฟส", "line:", "fb is"])(
    "stays fast on a long whitespace run after %s",
    (prefix) => {
      for (const filler of [" ", "\t", "\u3000"]) {
        const started = performance.now();
        detectPii(prefix + filler.repeat(100_000) + "x");
        expect(performance.now() - started).toBeLessThan(1_000);
      }
    },
  );
});
