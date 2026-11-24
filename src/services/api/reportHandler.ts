import { REPORT_REQUEST_MAX_BYTES } from "@/config/moderation.config";
import { UUID_PATTERN } from "@/config/database.config";
import type { CreationRepository } from "./creationRepository";
import { isPlainObject } from "./json";
import type { ReportAcceptedBody, ReportErrorBody, ReportRequestBody } from "./reportTypes";

const HTTP_ACCEPTED = 202;
const HTTP_BAD_REQUEST = 400;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;
const HTTP_SERVICE_UNAVAILABLE = 503;
const NO_STORE = { "Cache-Control": "no-store" } as const;
/** application/json, optionally followed by parameters ("; charset=utf-8"). */
const JSON_CONTENT_TYPE = /^application\/json\s*(?:;|$)/i;
const REPORT_BODY_KEYS = Object.freeze(["creationId"] as const);

const respond = (status: number, body: ReportAcceptedBody | ReportErrorBody): Response =>
  Response.json(body, { status, headers: NO_STORE });

/** Exactly { creationId: <lowercase uuid> }; anything else (any extra key, wrong types) → null. */
export function parseReportRequest(value: unknown): ReportRequestBody | null {
  if (!isPlainObject(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== REPORT_BODY_KEYS.length || keys[0] !== REPORT_BODY_KEYS[0]) return null;
  const { creationId } = value;
  if (typeof creationId !== "string" || !UUID_PATTERN.test(creationId)) return null;
  return { creationId };
}

/** POST /api/reports logic. `getRepository` may throw (misconfigured env) → 503. Never logs. */
export async function handleReportCreation(request: Request, getRepository: () => CreationRepository): Promise<Response> {
  if (!JSON_CONTENT_TYPE.test(request.headers.get("content-type") ?? "")) {
    return respond(HTTP_UNSUPPORTED_MEDIA_TYPE, { error: "unsupported_media_type" });
  }
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > REPORT_REQUEST_MAX_BYTES) {
    return respond(HTTP_PAYLOAD_TOO_LARGE, { error: "payload_too_large" });
  }
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return respond(HTTP_BAD_REQUEST, { error: "invalid_body" });
  }
  if (new TextEncoder().encode(raw).byteLength > REPORT_REQUEST_MAX_BYTES) {
    return respond(HTTP_PAYLOAD_TOO_LARGE, { error: "payload_too_large" });
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return respond(HTTP_BAD_REQUEST, { error: "invalid_body" });
  }
  const parsed = parseReportRequest(parsedJson);
  if (parsed === null) return respond(HTTP_BAD_REQUEST, { error: "invalid_body" });
  try {
    await getRepository().reportCreation(parsed.creationId);
  } catch {
    return respond(HTTP_SERVICE_UNAVAILABLE, { error: "unavailable" });
  }
  return respond(HTTP_ACCEPTED, { status: "received" });
}
