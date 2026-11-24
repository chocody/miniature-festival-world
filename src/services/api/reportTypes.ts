/** POST endpoint of the Report button (InspectPopup, MFW-28). */
export const REPORT_ENDPOINT_PATH = "/api/reports";

/** Request body: exactly this one key. Content-Type must be application/json. */
export interface ReportRequestBody {
  readonly creationId: string; // lowercase uuid, as returned by GET /api/creations
}

/** 202 body for every well-formed report, counted or not (no existence / moderation oracle, D10). */
export interface ReportAcceptedBody {
  readonly status: "received";
}

export type ReportErrorBody =
  | { readonly error: "unsupported_media_type" } // 415
  | { readonly error: "payload_too_large" } // 413
  | { readonly error: "invalid_body" } // 400
  | { readonly error: "unavailable" }; // 503
