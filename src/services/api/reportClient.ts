import { REPORT_REQUEST_TIMEOUT_MS } from "@/config/inspect.config";
import { REPORT_ENDPOINT_PATH, type ReportRequestBody } from "./reportTypes";

export type ReportSubmitOutcome = "received" | "failed";
export type ReportFetch = (input: string, init: RequestInit) => Promise<Response>;

/** In-memory, per page session. NEVER persisted (no LocalStorage): which wishes a device reported is not stored (plan §11 Q2). */
export interface ReportSession {
  hasReported(creationId: string): boolean;
  /** Already received → "received" without a request; concurrent calls for one id share one request; "failed" may be retried. */
  submit(creationId: string): Promise<ReportSubmitOutcome>;
}

const HTTP_ACCEPTED = 202;
const defaultFetch: ReportFetch = (input, init) => fetch(input, init); // looks up the global at call time

async function postReport(creationId: string, fetchImpl: ReportFetch, timeoutMs: number): Promise<ReportSubmitOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body: ReportRequestBody = { creationId };
    const response = await fetchImpl(REPORT_ENDPOINT_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
    return response.status === HTTP_ACCEPTED ? "received" : "failed";
  } catch {
    return "failed"; // never log: the id and the error stay out of the console
  } finally {
    clearTimeout(timer);
  }
}

export function createReportSession(
  fetchImpl: ReportFetch = defaultFetch,
  timeoutMs: number = REPORT_REQUEST_TIMEOUT_MS,
): ReportSession {
  const received = new Set<string>();
  const inFlight = new Map<string, Promise<ReportSubmitOutcome>>();
  return {
    hasReported: (creationId) => received.has(creationId),
    submit(creationId) {
      if (creationId === "") return Promise.resolve("failed");
      if (received.has(creationId)) return Promise.resolve("received");
      const pending = inFlight.get(creationId);
      if (pending) return pending;
      const started = postReport(creationId, fetchImpl, timeoutMs).then((outcome) => {
        inFlight.delete(creationId);
        if (outcome === "received") received.add(creationId);
        return outcome;
      });
      inFlight.set(creationId, started);
      return started;
    },
  };
}

let sharedSession: ReportSession | null = null;
/** Lazy singleton used by the InspectPopup. */
export function getReportSession(): ReportSession {
  sharedSession ??= createReportSession();
  return sharedSession;
}
