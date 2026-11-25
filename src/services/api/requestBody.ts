export type RequestTextResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: "too_large" | "unreadable" };

/**
 * Reads the body as UTF-8 and stops as soon as more than `maxBytes` arrived (the stream is cancelled; nothing more is buffered).
 * No body → ok with "". Invalid UTF-8 or a stream error → unreadable. Never throws.
 */
export async function readRequestTextWithLimit(request: Request, maxBytes: number): Promise<RequestTextResult> {
  const stream = request.body;
  if (stream === null) return { ok: true, text: "" };
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}
