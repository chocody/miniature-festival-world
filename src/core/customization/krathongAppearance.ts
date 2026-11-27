import {
  CANDLE_COLOR_PALETTE,
  DEFAULT_KRATHONG_CHOICES,
  FLOWER_KINDS,
  KRATHONG_BASE_IDS,
  LEAF_COLOR_PALETTE,
  LEAF_FOLD_STYLE_IDS,
  RIM_SOCKET_COUNT,
} from "@/config/events/loyKrathong.config";
import { KRATHONG_DEFAULT_DESIGN, KRATHONG_DESIGN_IDS, type KrathongDesignId } from "@/config/krathongDesigns.config";
import { appearanceToSocketAssignments, validateSocketAssignments } from "./sockets";
import type {
  AppearanceParseResult,
  CandleColor,
  FlowerKind,
  KrathongAppearance,
  KrathongBaseId,
  LeafColor,
  LeafFoldStyleId,
} from "./types";

/** The required keys of every stored appearance (pinned by storedAppearanceCompat.test.ts). */
export const KRATHONG_APPEARANCE_KEYS = ["base", "lotusFold", "leafColor", "flowers", "candleColor"] as const;
/** MFW-78: keys a stored appearance may carry; absent in rows stored before MFW-78. */
export const KRATHONG_APPEARANCE_OPTIONAL_KEYS = ["design"] as const;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const DEFAULT_KRATHONG_APPEARANCE: KrathongAppearance = Object.freeze({
  base: DEFAULT_KRATHONG_CHOICES.base,
  lotusFold: DEFAULT_KRATHONG_CHOICES.lotusFold,
  leafColor: DEFAULT_KRATHONG_CHOICES.leafColor,
  flowers: Object.freeze(
    Array.from({ length: RIM_SOCKET_COUNT }, (): FlowerKind => DEFAULT_KRATHONG_CHOICES.flower),
  ),
  candleColor: DEFAULT_KRATHONG_CHOICES.candleColor,
  design: KRATHONG_DEFAULT_DESIGN, // MFW-78: every new creation stores its design explicitly
});

/**
 * New object, canonical key order, trailing null flowers removed. Does not validate. `design` is emitted only when set: a
 * pre-MFW-78 appearance never gains a `design: undefined` property.
 */
export function canonicalizeKrathongAppearance(a: KrathongAppearance): KrathongAppearance {
  const flowers = [...a.flowers];
  while (flowers.length > 0 && flowers[flowers.length - 1] === null) flowers.pop();
  const canonical: KrathongAppearance = {
    base: a.base,
    lotusFold: a.lotusFold,
    leafColor: a.leafColor,
    flowers,
    candleColor: a.candleColor,
  };
  return a.design !== undefined ? { ...canonical, design: a.design } : canonical;
}

function isPlainObject(input: unknown): input is Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const proto = Object.getPrototypeOf(input);
  return proto === Object.prototype || proto === null;
}

function fail(reason: string): AppearanceParseResult<KrathongAppearance> {
  return { ok: false, reason };
}

function paletteColor<T extends string>(value: unknown, palette: readonly T[]): T | null {
  if (typeof value !== "string" || !HEX_COLOR.test(value)) return null;
  const upper = value.toUpperCase();
  return (palette as readonly string[]).includes(upper) ? (upper as T) : null;
}

/** Write-path gate for creations_public.appearance: returns a fresh canonical copy or a reason. */
export function parseKrathongAppearance(input: unknown): AppearanceParseResult<KrathongAppearance> {
  if (!isPlainObject(input)) return fail("appearance must be a plain object");
  const allowed: readonly string[] = [...KRATHONG_APPEARANCE_KEYS, ...KRATHONG_APPEARANCE_OPTIONAL_KEYS];
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) return fail(`unknown key: ${key}`);
  }
  for (const key of KRATHONG_APPEARANCE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) return fail(`missing key: ${key}`);
  }
  const { base, lotusFold, flowers } = input;
  if (typeof base !== "string" || !(KRATHONG_BASE_IDS as readonly string[]).includes(base)) {
    return fail("base is not a known krathong base");
  }
  if (typeof lotusFold !== "string" || !(LEAF_FOLD_STYLE_IDS as readonly string[]).includes(lotusFold)) {
    return fail("lotusFold is not a known fold style");
  }
  const leafColor = paletteColor(input.leafColor, LEAF_COLOR_PALETTE);
  if (leafColor === null) return fail("leafColor is not in the leaf palette");
  if (!Array.isArray(flowers)) return fail("flowers must be an array");
  if (flowers.length > RIM_SOCKET_COUNT) return fail("flowers exceeds the rim socket count");
  const parsedFlowers: (FlowerKind | null)[] = [];
  for (let i = 0; i < flowers.length; i += 1) {
    const element: unknown = Object.prototype.hasOwnProperty.call(flowers, i) ? flowers[i] : undefined;
    if (element === null) {
      parsedFlowers.push(null);
    } else if (typeof element === "string" && (FLOWER_KINDS as readonly string[]).includes(element)) {
      parsedFlowers.push(element as FlowerKind);
    } else {
      return fail(`flowers[${i}] is not a known flower`);
    }
  }
  const candleColor = paletteColor(input.candleColor, CANDLE_COLOR_PALETTE);
  if (candleColor === null) return fail("candleColor is not in the candle palette");
  let design: KrathongDesignId | undefined;
  if (Object.prototype.hasOwnProperty.call(input, "design")) {
    const value = input.design;
    if (typeof value !== "string" || !(KRATHONG_DESIGN_IDS as readonly string[]).includes(value)) {
      return fail("design is not a known krathong design");
    }
    design = value as KrathongDesignId;
  }

  const canonical = canonicalizeKrathongAppearance({
    base: base as KrathongBaseId,
    lotusFold: lotusFold as LeafFoldStyleId,
    leafColor: leafColor as LeafColor,
    flowers: parsedFlowers,
    candleColor: candleColor as CandleColor,
    ...(design !== undefined ? { design } : {}),
  });
  const check = validateSocketAssignments(appearanceToSocketAssignments(canonical));
  if (!check.ok) return fail(`socket rule: ${check.violation} at ${check.socketId}`);
  return { ok: true, appearance: canonical };
}

/** What the client sends and the server stores in creations_public.appearance. */
export function serializeKrathongAppearance(a: KrathongAppearance): KrathongAppearance {
  return canonicalizeKrathongAppearance(a);
}
