// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeNewCreation } from "@/services/api/__fixtures__/creations";
import { createInMemoryCreationRepository } from "@/services/api/inMemoryCreationRepository";
import { handleListCreations } from "@/services/api/listCreations";
import { handleReportCreation } from "@/services/api/reportHandler";

const T = Date.parse("2026-11-24T12:00:00.000Z");

const postRequest = (id: string) =>
  new Request("http://localhost/api/reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ creationId: id }),
  });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/reports", () => {
  it("real POST without Supabase env", async () => {
    vi.resetModules();
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { POST } = await import("./route");
    const res = await POST(postRequest(globalThis.crypto.randomUUID()));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ status: "received" });
  });

  it("three reports hide the item from GET /api/creations", async () => {
    const repo = createInMemoryCreationRepository({ now: () => T });
    const c = await repo.insertCreation(makeNewCreation());
    const list = async () => {
      const res = await handleListCreations(
        new Request("http://localhost/api/creations?event=loy_krathong&zone=1"),
        () => repo,
      );
      const body = (await res.json()) as { items: Array<{ id: string }> };
      return body.items.map((i) => i.id);
    };
    for (let n = 1; n <= 3; n += 1) {
      const res = await handleReportCreation(postRequest(c.id), () => repo);
      expect(res.status).toBe(202);
      expect(await list()).toEqual(n < 3 ? [c.id] : []);
    }
    expect(repo.getModerationState(c.id)).toEqual({ reportCount: 3, moderationStatus: "flagged" });
  });
});
