// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AUTO_HIDE_REPORT_THRESHOLD } from "@/config/moderation.config";
import {
  KEY_ID_FIXTURE,
  OWNER_HASH_FIXTURE,
  PRIVATE_CIPHERTEXT_FIXTURE,
  makeNewCreation,
  makePrivateWish,
} from "./__fixtures__/creations";
import { CreationRepositoryError, type CreationRepository } from "./creationRepository";
import { createInMemoryCreationRepository } from "./inMemoryCreationRepository";
import { handleZoneDirectory, parseZoneDirectoryQuery } from "./zoneDirectory";

const call = (qs: string, repo: () => CreationRepository) =>
  handleZoneDirectory(new Request(`http://localhost/api/zones?${qs}`), repo);
const q = (s: string) => parseZoneDirectoryQuery(new URLSearchParams(s));

describe("parseZoneDirectoryQuery", () => {
  it("accepts a valid event and ignores zone", () => {
    expect(q("event=loy_krathong")).toEqual({ ok: true, eventId: "loy_krathong" });
    expect(q("event=loy_krathong&zone=9")).toEqual({ ok: true, eventId: "loy_krathong" });
  });
  it("rejects bad events", () => {
    for (const s of ["", "event=", "event=LOY_KRATHONG", "event=nope", "event=loy_krathong&event=christmas"]) {
      expect(q(s)).toEqual({ ok: false, field: "event" });
    }
  });
});

describe("GET /api/zones logic", () => {
  it("an empty repository has one zone", async () => {
    const repo = createInMemoryCreationRepository();
    const res = await call("event=loy_krathong", () => repo);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["eventId", "zoneCount"]);
    expect(body).toEqual({ eventId: "loy_krathong", zoneCount: 1 });
  });
  it("counts the highest visible zone per event", async () => {
    const repo = createInMemoryCreationRepository();
    for (const zoneId of [1, 2, 4]) await repo.insertCreation(makeNewCreation({ zoneId }));
    await repo.insertCreation(makeNewCreation({ eventId: "christmas", zoneId: 9 }));
    expect(await (await call("event=loy_krathong", () => repo)).json()).toEqual({ eventId: "loy_krathong", zoneCount: 4 });
    expect(await (await call("event=christmas", () => repo)).json()).toEqual({ eventId: "christmas", zoneCount: 9 });
  });
  it("does not count hidden or flagged zones", async () => {
    for (const patch of [{ moderationStatus: "hidden" as const }, { reportCount: AUTO_HIDE_REPORT_THRESHOLD }]) {
      const repo = createInMemoryCreationRepository();
      await repo.insertCreation(makeNewCreation({ zoneId: 2 }));
      const top = await repo.insertCreation(makeNewCreation({ zoneId: 4 }));
      repo.setModeration(top.id, patch);
      expect(await (await call("event=loy_krathong", () => repo)).json()).toEqual({ eventId: "loy_krathong", zoneCount: 2 });
    }
  });
  it("400 on a bad query", async () => {
    const res = await call("event=nope", () => createInMemoryCreationRepository());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_query", field: "event" });
  });
  it("503 without details", async () => {
    const failing = { ...createInMemoryCreationRepository(), highestVisibleZoneId: () => Promise.reject(new Error(OWNER_HASH_FIXTURE)) };
    const a = await call("event=loy_krathong", () => failing);
    expect(a.status).toBe(503);
    const text = await a.text();
    expect(JSON.parse(text)).toEqual({ error: "unavailable" });
    expect(text).not.toContain(OWNER_HASH_FIXTURE);
    const b = await call("event=loy_krathong", () => {
      throw new CreationRepositoryError("backend_misconfigured", "SUPABASE_URL");
    });
    expect(b.status).toBe(503);
    const zero = { ...createInMemoryCreationRepository(), highestVisibleZoneId: async () => 0 };
    expect((await call("event=loy_krathong", () => zero)).status).toBe(503);
  });
  it("never leaks private data", async () => {
    const repo = createInMemoryCreationRepository();
    await repo.insertCreation(makeNewCreation({ publicWishText: null, privateWish: makePrivateWish() }));
    const text = await (await call("event=loy_krathong", () => repo)).text();
    for (const s of ["owner_token", "private_wish", "ownerToken", "privateWish", OWNER_HASH_FIXTURE, PRIVATE_CIPHERTEXT_FIXTURE, KEY_ID_FIXTURE]) {
      expect(text).not.toContain(s);
    }
  });
});
