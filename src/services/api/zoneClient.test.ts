import { describe, expect, it, vi } from "vitest";
import { ZONE_ITEM_CAP } from "@/config/world.config";
import { PUBLIC_CREATION_KEYS } from "./creationTypes";
import {
  buildZoneDirectoryUrl,
  buildZoneItemsUrl,
  fetchZoneDirectory,
  fetchZoneItems,
  toClientPublicCreation,
} from "./zoneClient";

const EVENT = "loy_krathong";
const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const rawItem = (i: number, zoneId = 2, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: uuid(i),
  eventId: EVENT,
  zoneId,
  appearance: { base: "banana_trunk_01" },
  coord: { mode: "SPLINE_PATH", laneId: 1, spawnProgress: 0.1, speedFactor: 0.008, lateralOffset: 0 },
  publicWishText: null,
  createdAt: "2026-11-24T12:00:00.000Z",
  expiresAt: "2099-01-01T00:00:00.000Z",
  ...extra,
});
const body = (items: unknown[], extra: Record<string, unknown> = {}) => ({ eventId: EVENT, zoneId: 2, limit: 80, items, ...extra });
const okFetch = (json: unknown) => vi.fn(async () => Response.json(json));

describe("zoneClient", () => {
  it("builds the URLs", () => {
    expect(buildZoneItemsUrl(EVENT, 2)).toBe("/api/creations?event=loy_krathong&zone=2");
    expect(buildZoneDirectoryUrl(EVENT)).toBe("/api/zones?event=loy_krathong");
  });

  it("sends one plain GET without credentials", async () => {
    const f = okFetch(body([]));
    const controller = new AbortController();
    await fetchZoneItems(EVENT, 2, { fetch: f as unknown as typeof fetch, signal: controller.signal });
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/creations?event=loy_krathong&zone=2");
    expect(init.method).toBe("GET");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBe(controller.signal);
    expect(JSON.stringify(init.headers ?? {}).toLowerCase()).not.toContain("authorization");
  });

  it("keeps at most 80 of 85 items", async () => {
    const items = Array.from({ length: 85 }, (_, i) => rawItem(i + 1));
    const r = await fetchZoneItems(EVENT, 2, { fetch: okFetch(body(items)) as unknown as typeof fetch });
    expect(r.ok && r.items.length).toBe(ZONE_ITEM_CAP);
  });

  it("copies only the allowlist (invariant C)", async () => {
    const extra = {
      owner_token: "T1",
      owner_token_hash: "T2",
      private_wish_text: "T3",
      ownerTokenHash: "T4",
      privateWishText: "T5",
      report_count: 9,
      moderation_status: "approved",
    };
    const r = await fetchZoneItems(EVENT, 2, { fetch: okFetch(body([rawItem(1, 2, extra)])) as unknown as typeof fetch });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.items[0]).sort()).toEqual([...PUBLIC_CREATION_KEYS].sort());
    const json = JSON.stringify(r.items);
    for (const name of Object.keys(extra)) expect(json).not.toContain(name);
    expect(Object.isFrozen(r.items)).toBe(true);
  });

  it("drops items with private keys nested in appearance or coord", async () => {
    const items = [
      rawItem(1, 2, { appearance: { base: "x", nested: { owner_token: "t" } } }),
      rawItem(2, 2, { coord: { mode: "SPLINE_PATH", private_wish_text: "w" } }),
      rawItem(3),
    ];
    const r = await fetchZoneItems(EVENT, 2, { fetch: okFetch(body(items)) as unknown as typeof fetch });
    expect(r.ok && r.items.map((i) => i.id)).toEqual([uuid(3)]);
  });

  it("rejects mismatching bodies", async () => {
    for (const json of [body([], { eventId: "christmas" }), body([], { zoneId: 3 }), body([], { items: {} }), null]) {
      const r = await fetchZoneItems(EVENT, 2, { fetch: okFetch(json) as unknown as typeof fetch });
      expect(r).toEqual({ ok: false, reason: "invalid_body" });
    }
  });

  it("drops bad items", async () => {
    const items = [
      rawItem(1, 3),
      rawItem(2, 2, { id: 5 }),
      rawItem(3, 2, { createdAt: "x" }),
      rawItem(4, 2, { publicWishText: 5 }),
      rawItem(5, 2, { coord: [] }),
      rawItem(6),
      rawItem(6),
    ];
    const r = await fetchZoneItems(EVENT, 2, { fetch: okFetch(body(items)) as unknown as typeof fetch });
    expect(r.ok && r.items.map((i) => i.id)).toEqual([uuid(6)]);
    expect(toClientPublicCreation(null, EVENT, 2)).toBeNull();
  });

  it("maps failures", async () => {
    const json = vi.fn();
    const cancel = vi.fn(async () => undefined);
    const failing = vi.fn(async () => ({ ok: false, status: 503, json, body: { cancel } }) as unknown as Response);
    expect(await fetchZoneItems(EVENT, 2, { fetch: failing as unknown as typeof fetch })).toEqual({ ok: false, reason: "http" });
    expect(json).not.toHaveBeenCalled();
    const rejecting = vi.fn(async () => {
      throw new TypeError("net");
    });
    expect(await fetchZoneItems(EVENT, 2, { fetch: rejecting as unknown as typeof fetch })).toEqual({ ok: false, reason: "network" });
    const badJson = vi.fn(async () => new Response("not json"));
    expect(await fetchZoneItems(EVENT, 2, { fetch: badJson as unknown as typeof fetch })).toEqual({ ok: false, reason: "invalid_body" });
    const c = new AbortController();
    c.abort();
    expect(await fetchZoneItems(EVENT, 2, { fetch: rejecting as unknown as typeof fetch, signal: c.signal })).toEqual({
      ok: false,
      reason: "aborted",
    });
  });

  it("reads the directory", async () => {
    const run = (json: unknown) => fetchZoneDirectory(EVENT, { fetch: okFetch(json) as unknown as typeof fetch });
    expect(await run({ eventId: EVENT, zoneCount: 3 })).toEqual({ ok: true, zoneCount: 3 });
    for (const bad of [0, 1.5, "3"]) expect(await run({ eventId: EVENT, zoneCount: bad })).toEqual({ ok: false, reason: "invalid_body" });
    expect(await run({ eventId: "christmas", zoneCount: 3 })).toEqual({ ok: false, reason: "invalid_body" });
  });
});
