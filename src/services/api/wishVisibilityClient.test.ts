import { afterEach, describe, expect, it, vi } from "vitest";
import { DEVICE_OWNER_TOKEN_STORAGE_KEY } from "@/config/ownership.config";
import { WISH_VISIBILITY_TIMEOUT_MS } from "@/config/ownerWish.config";
import { OWNER_TOKEN_FIXTURE } from "./__fixtures__/createCreation";
import { createWishVisibilitySwitcher, parseWishVisibilityAnswer, type WishVisibilitySwitcherDeps } from "./wishVisibilityClient";
import { WISH_VISIBILITY_BODY_KEYS, WISH_VISIBILITY_PATH } from "./wishVisibilityTypes";

const ID = "950118ce-7d93-4cb6-bd84-44d91c5de9e3";
const consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.clearAllMocks();
});

const make = (responses: (() => Promise<Response>)[] = [async () => Response.json({ open: true })], deps: WishVisibilitySwitcherDeps = {}) => {
  let i = 0;
  const fetchMock = vi.fn((input: string, init: RequestInit) => {
    void input;
    void init;
    const next = responses[Math.min(i, responses.length - 1)]!;
    i += 1;
    return next();
  });
  const switcher = createWishVisibilitySwitcher({ fetch: fetchMock, readOwnerToken: () => OWNER_TOKEN_FIXTURE, ...deps });
  return { fetchMock, switcher };
};
const answer = (body: unknown, status = 200) => async () => Response.json(body, { status });

describe("wish visibility client", () => {
  it("posts the token only in the JSON body, with hardened options", async () => {
    const { fetchMock, switcher } = make();
    await switcher.setOpen(ID, true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(WISH_VISIBILITY_PATH);
    expect(url).not.toContain("?");
    expect(url).not.toContain(OWNER_TOKEN_FIXTURE);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.stringify(init.headers)).not.toMatch(/authorization/i);
    expect(init.credentials).toBe("omit");
    expect(init.redirect).toBe("error");
    expect(init.cache).toBe("no-store");
    expect(init.referrerPolicy).toBe("no-referrer");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([...WISH_VISIBILITY_BODY_KEYS].sort());
    expect(body).toEqual({ creationId: ID, ownerToken: OWNER_TOKEN_FIXTURE, open: true });
  });

  it("maps answers", async () => {
    expect(await make([answer({ open: true })]).switcher.setOpen(ID, true)).toEqual({ kind: "switched", open: true });
    expect(await make([answer({ open: false })]).switcher.setOpen(ID, false)).toEqual({ kind: "switched", open: false });
    expect(await make([answer({ open: false })]).switcher.setOpen(ID, true)).toEqual({ kind: "failed" });
    expect(await make([answer({ open: true, x: 1 })]).switcher.setOpen(ID, true)).toEqual({ kind: "failed" });
    expect(await make([answer({ open: "true" })]).switcher.setOpen(ID, true)).toEqual({ kind: "failed" });
    expect(await make([answer({ error: "moderation_blocked", reasons: ["phone"] }, 422)]).switcher.setOpen(ID, true)).toEqual({
      kind: "moderation_blocked",
      reasons: ["phone"],
    });
    expect(await make([answer({}, 422)]).switcher.setOpen(ID, true)).toEqual({ kind: "failed" });
    expect(await make([answer({ error: "hidden" }, 409)]).switcher.setOpen(ID, true)).toEqual({ kind: "hidden" });
    expect(await make([answer({ error: "other" }, 409)]).switcher.setOpen(ID, true)).toEqual({ kind: "failed" });
    expect(await make([answer({ error: "not_found" }, 404)]).switcher.setOpen(ID, true)).toEqual({ kind: "not_found" });
    for (const status of [400, 413, 415, 503]) {
      expect(await make([answer({ error: "x" }, status)]).switcher.setOpen(ID, true)).toEqual({ kind: "failed" });
    }
    expect(await make([async () => new Response("not json", { status: 200 })]).switcher.setOpen(ID, true)).toEqual({ kind: "failed" });
    expect(await make([async () => Promise.reject(new Error("net"))]).switcher.setOpen(ID, true)).toEqual({ kind: "failed" });
    expect(parseWishVisibilityAnswer(409, { error: "conflict" }, true)).toBe("conflict");
    expect(parseWishVisibilityAnswer(200, [], true)).toEqual({ kind: "failed" });
  });

  it("409 conflict resends the same request once", async () => {
    const retried = make([answer({ error: "conflict" }, 409), answer({ open: true })]);
    expect(await retried.switcher.setOpen(ID, true)).toEqual({ kind: "switched", open: true });
    expect(retried.fetchMock).toHaveBeenCalledTimes(2);
    expect(retried.fetchMock.mock.calls[0]![1].body).toBe(retried.fetchMock.mock.calls[1]![1].body);

    const twice = make([answer({ error: "conflict" }, 409), answer({ error: "conflict" }, 409)]);
    expect(await twice.switcher.setOpen(ID, true)).toEqual({ kind: "failed" });
    expect(twice.fetchMock).toHaveBeenCalledTimes(2);

    const none = make([answer({ error: "conflict" }, 409)], { conflictRetries: 0 });
    expect(await none.switcher.setOpen(ID, true)).toEqual({ kind: "failed" });
    expect(none.fetchMock).toHaveBeenCalledTimes(1);
  });

  it("times out", async () => {
    vi.useFakeTimers();
    const switcher = createWishVisibilitySwitcher({
      fetch: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
      readOwnerToken: () => OWNER_TOKEN_FIXTURE,
    });
    const pending = switcher.setOpen(ID, true);
    await vi.advanceTimersByTimeAsync(WISH_VISIBILITY_TIMEOUT_MS);
    expect(await pending).toEqual({ kind: "failed" });
  });

  it("no token, a throwing token read, an empty id or a non-boolean sends nothing", async () => {
    const fetchMock = vi.fn();
    expect(await createWishVisibilitySwitcher({ fetch: fetchMock, readOwnerToken: () => null }).setOpen(ID, true)).toEqual({
      kind: "not_found",
    });
    const throwing = createWishVisibilitySwitcher({
      fetch: fetchMock,
      readOwnerToken: () => {
        throw new Error("server");
      },
    });
    expect(await throwing.setOpen(ID, true)).toEqual({ kind: "failed" });
    const ok = createWishVisibilitySwitcher({ fetch: fetchMock, readOwnerToken: () => OWNER_TOKEN_FIXTURE });
    expect(await ok.setOpen("", true)).toEqual({ kind: "failed" });
    expect(await ok.setOpen(ID, "yes" as unknown as boolean)).toEqual({ kind: "failed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the default token read never creates a token; nothing is stored or logged", async () => {
    window.localStorage.clear();
    const fetchMock = vi.fn();
    expect(await createWishVisibilitySwitcher({ fetch: fetchMock }).setOpen(ID, true)).toEqual({ kind: "not_found" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(DEVICE_OWNER_TOKEN_STORAGE_KEY)).toBeNull();
    const { switcher } = make();
    await switcher.setOpen(ID, true);
    await switcher.setOpen(ID, true);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });
});
