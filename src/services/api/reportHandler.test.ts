// @vitest-environment node
import { describe, expect, it } from "vitest";
import { REPORT_REQUEST_MAX_BYTES } from "@/config/moderation.config";
import { OWNER_HASH_FIXTURE, makeNewCreation } from "./__fixtures__/creations";
import { CreationRepositoryError, type CreationRepository, type ReportOutcome } from "./creationRepository";
import { createInMemoryCreationRepository } from "./inMemoryCreationRepository";
import { handleReportCreation } from "./reportHandler";

const T = Date.parse("2026-11-24T12:00:00.000Z");
const JSON_HEADERS = { "content-type": "application/json" };
const PRIVATE_NAMES = [
  "owner_token",
  "ownerToken",
  "owner_token_hash",
  "private_wish_text",
  "privateWish",
  "report_count",
  "reportCount",
  "moderation_status",
  "moderationStatus",
];

async function setup() {
  const repo = createInMemoryCreationRepository({ now: () => T });
  const c = await repo.insertCreation(makeNewCreation());
  const post = (body: string, headers: Record<string, string> = JSON_HEADERS, getRepo: () => CreationRepository = () => repo) =>
    handleReportCreation(new Request("http://localhost/api/reports", { method: "POST", headers, body }), getRepo);
  return { repo, c, post };
}

const bodyOf = (id: string) => JSON.stringify({ creationId: id });

describe("handleReportCreation", () => {
  it("accepts a valid report", async () => {
    const { repo, c, post } = await setup();
    const res = await post(bodyOf(c.id));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ status: "received" });
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(repo.getModerationState(c.id)?.reportCount).toBe(1);
  });

  it("same response for unknown ids", async () => {
    const { repo, c, post } = await setup();
    const res = await post(bodyOf("00000000-0000-4000-8000-000000000009"));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ status: "received" });
    expect(repo.getModerationState(c.id)?.reportCount).toBe(0);
  });

  it("content-type handling", async () => {
    const { repo, c, post } = await setup();
    expect((await post(bodyOf(c.id), { "content-type": "application/json; charset=utf-8" })).status).toBe(202);
    const wrong: Array<Record<string, string>> = [
      { "content-type": "text/plain" },
      {},
      { "content-type": "application/x-www-form-urlencoded" },
    ];
    for (const headers of wrong) {
      const res = await post(bodyOf(c.id), headers);
      expect(res.status).toBe(415);
      expect(await res.json()).toEqual({ error: "unsupported_media_type" });
    }
    expect(repo.getModerationState(c.id)?.reportCount).toBe(1);
  });

  it("rejects malformed bodies with 400", async () => {
    const { repo, c, post } = await setup();
    const bodies = [
      "not json",
      "[]",
      "null",
      "{}",
      '{"creationId": 5}',
      '{"creationId": "nope"}',
      bodyOf(c.id.toUpperCase()),
      // rejects extra keys (ownerToken)
      JSON.stringify({ creationId: c.id, ownerToken: "A".repeat(43) }),
    ];
    for (const b of bodies) {
      const res = await post(b);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_body" });
    }
    expect(repo.getModerationState(c.id)?.reportCount).toBe(0);
  });

  it("rejects too-large bodies with 413", async () => {
    const { repo, c, post } = await setup();
    const big = JSON.stringify({ creationId: c.id, pad: "x".repeat(REPORT_REQUEST_MAX_BYTES) });
    const res = await post(big);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "payload_too_large" });
    const res2 = await post(bodyOf(c.id), { ...JSON_HEADERS, "content-length": String(REPORT_REQUEST_MAX_BYTES + 1) });
    expect(res2.status).toBe(413);
    expect(repo.getModerationState(c.id)?.reportCount).toBe(0);
  });

  it("repository failure returns 503 without details", async () => {
    const { repo, c, post } = await setup();
    const failing: CreationRepository = {
      ...repo,
      reportCreation: () => Promise.reject(new Error("boom " + OWNER_HASH_FIXTURE)),
    };
    const res = await post(bodyOf(c.id), JSON_HEADERS, () => failing);
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: "unavailable" });
    expect(text).not.toContain(OWNER_HASH_FIXTURE);
    const res2 = await post(bodyOf(c.id), JSON_HEADERS, () => {
      throw new CreationRepositoryError("backend_misconfigured", "SUPABASE_URL");
    });
    expect(res2.status).toBe(503);
  });

  it("no private fields in any response", async () => {
    const { c, post } = await setup();
    const unused: ReportOutcome = "ignored";
    void unused;
    const responses = [
      await post(bodyOf(c.id)),
      await post(bodyOf("00000000-0000-4000-8000-000000000009")),
      await post("nope"),
      await post("{}", { "content-type": "text/plain" }),
      await post(JSON.stringify({ creationId: c.id, pad: "x".repeat(REPORT_REQUEST_MAX_BYTES) })),
    ];
    for (const res of responses) {
      const text = await res.text();
      for (const name of PRIVATE_NAMES) expect(text).not.toContain(name);
    }
  });
});
