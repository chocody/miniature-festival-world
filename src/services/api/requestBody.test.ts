// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readRequestTextWithLimit } from "./requestBody";

const URL_ = "http://localhost/x";
const post = (body: BodyInit | null) => new Request(URL_, { method: "POST", body });

describe("readRequestTextWithLimit", () => {
  it("reads a small body, an empty body and Thai text", async () => {
    expect(await readRequestTextWithLimit(post("hello"), 100)).toEqual({ ok: true, text: "hello" });
    expect(await readRequestTextWithLimit(new Request(URL_, { method: "POST" }), 100)).toEqual({ ok: true, text: "" });
    expect(await readRequestTextWithLimit(post("สวัสดี"), 100)).toEqual({ ok: true, text: "สวัสดี" });
  });
  it("allows exactly maxBytes and rejects one more", async () => {
    expect(await readRequestTextWithLimit(post("a".repeat(10)), 10)).toMatchObject({ ok: true });
    expect(await readRequestTextWithLimit(post("a".repeat(11)), 10)).toEqual({ ok: false, reason: "too_large" });
  });
  it("stops pulling past the cap", async () => {
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(4));
      },
    }, { highWaterMark: 0 });
    const req = new Request(URL_, { method: "POST", body: stream, duplex: "half" } as RequestInit);
    expect(await readRequestTextWithLimit(req, 10)).toEqual({ ok: false, reason: "too_large" });
    const seen = pulls;
    await new Promise((r) => setTimeout(r, 20));
    expect(pulls).toBe(seen);
    expect(seen).toBeLessThanOrEqual(4);
  });
  it("invalid UTF-8 and stream errors are unreadable", async () => {
    expect(await readRequestTextWithLimit(post(new Uint8Array([0xff])), 10)).toEqual({ ok: false, reason: "unreadable" });
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error("boom"));
      },
    });
    const req = new Request(URL_, { method: "POST", body: stream, duplex: "half" } as RequestInit);
    expect(await readRequestTextWithLimit(req, 10)).toEqual({ ok: false, reason: "unreadable" });
  });
});
