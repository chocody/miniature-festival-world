import { afterEach, describe, expect, it, vi } from "vitest";
import { REPORT_REQUEST_TIMEOUT_MS } from "@/config/inspect.config";
import { DEVICE_OWNER_TOKEN_STORAGE_KEY } from "@/config/ownership.config";
import { createReportSession, type ReportFetch } from "./reportClient";
import { REPORT_ENDPOINT_PATH } from "./reportTypes";

const ID = "950118ce-7d93-4cb6-bd84-44d91c5de9e3";
const respond = (status: number) => vi.fn<ReportFetch>(async () => new Response(null, { status }));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("report client", () => {
  it("posts exactly { creationId } and nothing else", async () => {
    localStorage.setItem(DEVICE_OWNER_TOKEN_STORAGE_KEY, "RAW-TOKEN-VALUE");
    const fetchImpl = respond(202);
    await createReportSession(fetchImpl).submit(ID);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(REPORT_ENDPOINT_PATH);
    expect(url).not.toContain("?");
    expect(url).not.toContain(ID);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(init.cache).toBe("no-store");
    expect(init.credentials).toBe("same-origin");
    expect(Object.keys(JSON.parse(init.body as string))).toEqual(["creationId"]);
    expect(init.body).not.toContain("RAW-TOKEN-VALUE");
  });

  it("maps statuses to outcomes", async () => {
    expect(await createReportSession(respond(202)).submit(ID)).toBe("received");
    for (const status of [200, 400, 415, 503]) expect(await createReportSession(respond(status)).submit(ID)).toBe("failed");
    expect(await createReportSession(vi.fn<ReportFetch>(async () => { throw new Error("net"); })).submit(ID)).toBe("failed");
    const none = respond(202);
    expect(await createReportSession(none).submit("")).toBe("failed");
    expect(none).not.toHaveBeenCalled();
  });

  it("times out", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    const fetchImpl = vi.fn<ReportFetch>((_url, init) => {
      signal = init.signal;
      return new Promise<Response>((_res, rej) => init.signal?.addEventListener("abort", () => rej(new Error("abort"))));
    });
    const pending = createReportSession(fetchImpl).submit(ID);
    await vi.advanceTimersByTimeAsync(REPORT_REQUEST_TIMEOUT_MS);
    expect(await pending).toBe("failed");
    expect(signal?.aborted).toBe(true);
  });

  it("de-duplicates per session and allows retry after a failure", async () => {
    const fetchImpl = respond(202);
    const session = createReportSession(fetchImpl);
    const [a, b] = await Promise.all([session.submit(ID), session.submit(ID)]);
    expect([a, b]).toEqual(["received", "received"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(session.hasReported(ID)).toBe(true);
    expect(await session.submit(ID)).toBe("received");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const failing = respond(503);
    const s2 = createReportSession(failing);
    expect(await s2.submit(ID)).toBe("failed");
    expect(s2.hasReported(ID)).toBe(false);
    await s2.submit(ID);
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it("never persists or logs", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const logs = (["error", "warn", "log"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    await createReportSession(respond(202)).submit(ID);
    await createReportSession(vi.fn<ReportFetch>(async () => { throw new Error("x"); })).submit(ID);
    expect(setItem).not.toHaveBeenCalled();
    for (const l of logs) expect(l).not.toHaveBeenCalled();
  });
});
