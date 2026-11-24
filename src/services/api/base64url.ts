/** base64url without padding (RFC 4648 §5). */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function binaryToBytes(binary: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** Strict inverse: only [A-Za-z0-9_-], no padding, length % 4 !== 1, and canonical (re-encoding gives the input). Else null. */
export function base64UrlToBytes(text: string): Uint8Array<ArrayBuffer> | null {
  if (typeof text !== "string" || !/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const padded = text.padEnd(text.length + ((4 - (text.length % 4)) % 4), "=");
  let binary: string;
  try {
    binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return null;
  }
  const out = binaryToBytes(binary);
  return bytesToBase64Url(out) === text ? out : null;
}

/** Standard base64 WITH padding; null unless `text` matches `pattern` and decodes. Used for the key env value. */
export function base64ToBytes(text: string, pattern: RegExp): Uint8Array<ArrayBuffer> | null {
  if (typeof text !== "string" || !pattern.test(text)) return null;
  try {
    return binaryToBytes(atob(text));
  } catch {
    return null;
  }
}
