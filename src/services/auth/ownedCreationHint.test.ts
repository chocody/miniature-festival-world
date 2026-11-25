import { afterEach, describe, expect, it, vi } from "vitest";
import { isOwnedCreation, registerOwnedCreationPredicate } from "./ownedCreationHint";

const unregisters: Array<() => void> = [];
const register = (p: (id: string) => boolean) => {
  const off = registerOwnedCreationPredicate(p);
  unregisters.push(off);
  return off;
};
afterEach(() => {
  while (unregisters.length > 0) unregisters.pop()?.();
});

describe("owned creation hint", () => {
  it("owns nothing by default", () => {
    expect(isOwnedCreation("a")).toBe(false);
  });
  it("follows the registered predicate and unregisters", () => {
    const off = register((id) => id === "a");
    expect(isOwnedCreation("a")).toBe(true);
    expect(isOwnedCreation("b")).toBe(false);
    off();
    expect(isOwnedCreation("a")).toBe(false);
  });
  it("an old unregister keeps a newer predicate", () => {
    const off = register((id) => id === "a");
    register((id) => id === "b");
    off();
    expect(isOwnedCreation("b")).toBe(true);
  });
  it("throwing or non-boolean predicates count as false", () => {
    register(() => {
      throw new Error("x");
    });
    expect(isOwnedCreation("a")).toBe(false);
    register((() => "yes") as unknown as (id: string) => boolean);
    expect(isOwnedCreation("a")).toBe(false);
  });
  it("an empty id is false without calling the predicate", () => {
    const p = vi.fn(() => true);
    register(p);
    expect(isOwnedCreation("")).toBe(false);
    expect(p).not.toHaveBeenCalled();
  });
});
