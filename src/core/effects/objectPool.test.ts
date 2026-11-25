// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createObjectPool } from "./objectPool";

describe("createObjectPool", () => {
  it.each([0, -1, 1.5, Number.NaN])("rejects capacity %s", (cap) => {
    expect(() => createObjectPool(cap, () => ({}))).toThrow(RangeError);
  });

  it("creates state exactly once per slot", () => {
    const createState = vi.fn((slot: number) => ({ slot }));
    createObjectPool(3, createState);
    expect(createState).toHaveBeenCalledTimes(3);
    expect(createState.mock.calls.map((c) => c[0])).toEqual([0, 1, 2]);
  });

  it("recycles the oldest entry when full", () => {
    const createState = vi.fn(() => ({}));
    const pool = createObjectPool(3, createState);
    const got = [10, 20, 30].map((t) => pool.acquire(t));
    expect(got.map((e) => e.slot)).toEqual([0, 1, 2]);
    expect(pool.activeCount).toBe(3);
    const fourth = pool.acquire(40);
    expect(fourth.slot).toBe(0);
    expect(fourth.startedAtMs).toBe(40);
    expect(pool.activeCount).toBe(3);
    expect(pool.acquire(50).slot).toBe(1);
    expect(createState).toHaveBeenCalledTimes(3);
    for (const e of [...got, fourth]) expect(e).toBe(pool.entryAt(e.slot));
  });

  it("recycles the lower slot on a tie", () => {
    const pool = createObjectPool(2, () => ({}));
    pool.acquire(5);
    pool.acquire(5);
    expect(pool.acquire(9).slot).toBe(0);
  });

  it("release frees an entry and is idempotent", () => {
    const pool = createObjectPool(2, () => ({}));
    const a = pool.acquire(1);
    pool.acquire(2);
    pool.release(a);
    expect(pool.activeCount).toBe(1);
    pool.release(a);
    expect(pool.activeCount).toBe(1);
    expect(pool.acquire(3)).toBe(a);
  });

  it("ignores an entry of another pool", () => {
    const pool = createObjectPool(2, () => ({}));
    const other = createObjectPool(2, () => ({}));
    pool.acquire(1);
    const foreign = other.acquire(1);
    pool.release(foreign);
    expect(pool.activeCount).toBe(1);
    expect(other.activeCount).toBe(1);
  });

  it("releaseAll, entryAt range and non-finite time", () => {
    const pool = createObjectPool(3, () => ({}));
    pool.acquire(1);
    pool.acquire(2);
    pool.releaseAll();
    expect(pool.activeCount).toBe(0);
    expect(() => pool.entryAt(3)).toThrow(RangeError);
    expect(() => pool.entryAt(-1)).toThrow(RangeError);
    expect(pool.acquire(Number.NaN).startedAtMs).toBe(0);
  });
});
