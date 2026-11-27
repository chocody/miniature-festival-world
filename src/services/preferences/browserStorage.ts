/** Local helper (not the owner-token vault's): LocalStorage when the browser allows it, else null. */
export function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}
