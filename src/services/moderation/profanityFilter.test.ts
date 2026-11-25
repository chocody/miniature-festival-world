import { describe, expect, it } from "vitest";
import { containsProfanity } from "./profanityFilter";

describe("containsProfanity", () => {
  it.each([
    "ไอ้เหี้ย",
    "ควย",
    "ขอให้มันฉิบหาย",
    "ระยำ",
    "ไอ้สัส",
    "เ ห ี้ ย",
    "fuck you",
    "FUCK",
    "ＦＵＣＫ",
    "motherfucker",
    "sh1t happens",
    "Bitch!",
  ])("blocks: %s", (text) => {
    expect(containsProfanity(text)).toBe(true);
  });

  it.each([
    "ขอให้ทุกคนมีความสุข",
    "ล่องเรือในแควยาวไกล",
    "ทำความสะอาดเกลี้ยงเหี้ยน",
    "สัดส่วนที่ดี",
    "ขอให้แม่งานสบายดี",
    "ขอให้ปีเสือกระโดดไกล",
    "Good luck in class",
    "I love Dickens novels",
    "Scunthorpe United",
    "shiitake soup",
    "Happy Loy Krathong 2026!",
    "",
  ])("allows: %s", (text) => {
    expect(containsProfanity(text)).toBe(false);
  });
});
