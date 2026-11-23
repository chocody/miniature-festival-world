export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export interface NavigatorHints {
  readonly deviceMemory?: unknown;
  readonly hardwareConcurrency?: unknown;
}
export interface CanvasLike {
  getContext(contextId: string): unknown;
}
export interface MediaQueryListLike {
  readonly matches: boolean;
  addEventListener?(type: "change", listener: (e: { matches: boolean }) => void): void;
  removeEventListener?(type: "change", listener: (e: { matches: boolean }) => void): void;
  /** Safari < 14. */
  addListener?(listener: (e: { matches: boolean }) => void): void;
  removeListener?(listener: (e: { matches: boolean }) => void): void;
}
export type MatchMediaLike = (query: string) => MediaQueryListLike;

export interface CapabilityEnv {
  navigator?: NavigatorHints;
  createCanvas?: () => CanvasLike;
  matchMedia?: MatchMediaLike;
}
export interface DeviceCapabilities {
  webgl: boolean;
  /** null = unknown */
  deviceMemoryGb: number | null;
  /** null = unknown */
  hardwareConcurrency: number | null;
  reducedMotion: boolean;
}

/** Returns the value only if it is a finite number greater than 0; otherwise null (unknown). */
export function readPositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

interface LoseContextExt {
  loseContext?: () => void;
}
interface ReleasableContext {
  getExtension?: (name: string) => unknown;
}
function isReleasable(ctx: unknown): ctx is ReleasableContext {
  return typeof ctx === "object" && ctx !== null;
}

/** Tries webgl2 then webgl; releases the probe context. Software GL still counts as WebGL. */
export function detectWebGL(createCanvas?: () => CanvasLike): boolean {
  if (!createCanvas) return false;
  try {
    const canvas = createCanvas();
    const ctx = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!ctx) return false;
    if (isReleasable(ctx)) {
      const ext = ctx.getExtension?.("WEBGL_lose_context") as LoseContextExt | null | undefined;
      ext?.loseContext?.();
    }
    return true;
  } catch {
    return false;
  }
}

/** Reads prefers-reduced-motion; false (no preference) when matchMedia is unavailable. */
export function readReducedMotion(matchMedia?: MatchMediaLike): boolean {
  if (!matchMedia) return false;
  try {
    return matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
}

/** Calls onChange when the preference changes; returns an unsubscribe function. */
export function subscribeReducedMotion(
  matchMedia: MatchMediaLike | undefined,
  onChange: (reduced: boolean) => void,
): () => void {
  if (!matchMedia) return () => {};
  let mql: MediaQueryListLike;
  try {
    mql = matchMedia(REDUCED_MOTION_QUERY);
  } catch {
    return () => {};
  }
  const fn = (e: { matches: boolean }) => onChange(e.matches);
  if (mql.addEventListener) {
    mql.addEventListener("change", fn);
    return () => mql.removeEventListener?.("change", fn);
  }
  if (mql.addListener) {
    mql.addListener(fn);
    return () => mql.removeListener?.(fn);
  }
  return () => {};
}

export function detectDeviceCapabilities(env: CapabilityEnv): DeviceCapabilities {
  return {
    webgl: detectWebGL(env.createCanvas),
    deviceMemoryGb: readPositiveNumber(env.navigator?.deviceMemory),
    hardwareConcurrency: readPositiveNumber(env.navigator?.hardwareConcurrency),
    reducedMotion: readReducedMotion(env.matchMedia),
  };
}
