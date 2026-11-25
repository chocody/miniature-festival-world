import { afterEach, describe, expect, it, vi } from "vitest";
import { DEVICE_OWNER_TOKEN_STORAGE_KEY } from "@/config/ownership.config";
import { OWNER_WISH_REVEAL_TIMEOUT_MS } from "@/config/ownerWish.config";
import { OWNER_TOKEN_FIXTURE } from "./__fixtures__/createCreation";
import { createOwnerWishRevealer, parseOwnerWishRevealResponse } from "./ownerWishClient";
import { OWNER_WISH_REVEAL_PATH } from "./ownerWishRevealTypes";

const ID = "950118ce-7d93-4cb6-bd84-44d91c5de9e3";
const consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
  vi.clearAllMocks();
});

const make = (response: () => Promise<Response> = async () => Response.json({ wishText: "x" })) => {
  const fetchMock = vi.fn((input: string, init: RequestInit) => {
    void input;
    void init;
    return response();
  });
  const revealer = createOwnerWishRevealer({ fetch: fetchMock, readOwnerToken: () => OWNER_TOKEN_FIXTURE });
  return { fetchMock, revealer };
};

describe("owner wish client", () => {
  it("posts the token only in the JSON body, with hardened request options", async () => {
    const { fetchMock, revealer } = make();
    await revealer.reveal(ID);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(OWNER_WISH_REVEAL_PATH);
    expect(url).not.toContain("?");
    expect(url).not.toContain(OWNER_TOKEN_FIXTURE);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(init.credentials).toBe("omit");
    expect(init.redirect).toBe("error");
    expect(init.cache).toBe("no-store");
    expect(init.referrerPolicy).toBe("no-referrer");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init.body))).toEqual({ creationId: ID, ownerToken: OWNER_TOKEN_FIXTURE });
  });

  it("maps answers", async () => {
    expect(await make().revealer.reveal(ID)).toEqual({ kind: "revealed", wishText: "x" });
    expect(await make(async () => Response.json({ wishText: null })).revealer.reveal(ID)).toEqual({ kind: "none" });
    for (const body of [{ wishText: "" }, { wishText: 1 }, { wishText: "x", extra: 1 }, []]) {
      expect(await make(async () => Response.json(body)).revealer.reveal(ID)).toEqual({ kind: "failed" });
    }
    for (const status of [503, 400]) {
      expect(await make(async () => Response.json({ error: "x" }, { status })).revealer.reveal(ID)).toEqual({ kind: "failed" });
    }
    expect(await make(async () => Promise.reject(new Error("net"))).revealer.reveal(ID)).toEqual({ kind: "failed" });
    expect(parseOwnerWishRevealResponse("x")).toEqual({ kind: "failed" });
  });

  it("times out", async () => {
    vi.useFakeTimers();
    const { revealer } = make(() => new Promise<Response>(() => undefined));
    const fetchHanging = createOwnerWishRevealer({
      fetch: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
      readOwnerToken: () => OWNER_TOKEN_FIXTURE,
    });
    void revealer;
    const pending = fetchHanging.reveal(ID);
    await vi.advanceTimersByTimeAsync(OWNER_WISH_REVEAL_TIMEOUT_MS);
    expect(await pending).toEqual({ kind: "failed" });
  });

  it("no token, a throwing token read or an empty id sends nothing", async () => {
    const fetchMock = vi.fn();
    const noToken = createOwnerWishRevealer({ fetch: fetchMock, readOwnerToken: () => null });
    expect(await noToken.reveal(ID)).toEqual({ kind: "none" });
    const throwing = createOwnerWishRevealer({
      fetch: fetchMock,
      readOwnerToken: () => {
        throw new Error("server");
      },
    });
    expect(await throwing.reveal(ID)).toEqual({ kind: "failed" });
    expect(await make().revealer.reveal("")).toEqual({ kind: "failed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the default token read never creates a token", async () => {
    window.localStorage.clear();
    const fetchMock = vi.fn();
    const revealer = createOwnerWishRevealer({ fetch: fetchMock });
    expect(await revealer.reveal(ID)).toEqual({ kind: "none" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(DEVICE_OWNER_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it("does not cache and does not log", async () => {
    const { fetchMock, revealer } = make();
    await revealer.reveal(ID);
    await revealer.reveal(ID);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });
});
