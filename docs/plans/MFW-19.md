# MFW-19 [4.1] Krathong modular assembler & socket rules — implementation spec

> Hand-off spec for one card. Source of truth for the implementer and the reviewer. If this file and
> `docs/backlog.json` / `docs/spec/open-questions.md` disagree, those files win; say so in the PR.
> Branch: `feat/MFW-19-krathong-modular-assembler-socket-rules` · Jira: MFW-19 · Epic: MFW-18 (Loop 4)
> Labels: `loy-krathong`, `customization` · Extra reviewer: `r3f-perf-reviewer` (diff touches `src/components/models/**` and `src/components/canvas3d/**`).

## Summary

This card builds the Loy Krathong "modular builder": a typed part catalogue (3 bases, banana-leaf fold styles and
colours, 3 flower kinds, candle and incense), a socket layout (one `center_socket` plus N rim sockets) with a
pure socket validator, and a strict parser/serializer for the `appearance` JSONB column of `creations_public`
(spec §5). A pure assembler turns an appearance into a list of part descriptors (geometry key, material key,
local transform); a small R3F model renders those descriptors with **one shared geometry and one shared material
per key**, and keeps the candle and incense world-upright on the Y axis even when the krathong is tilted. The
placeholder island/pebbles in the 3D scene are replaced by this krathong. The appearance parser is pure (no
three.js) so the server create API (2.4, "MFW-45") can validate client input with the same function.

## Prerequisites

All merged on `main` (35057a8):

| Card | What this card uses |
|---|---|
| MFW-15 [3.1] | `src/components/canvas3d/index.tsx`: `SceneViewport`, `ToyNightScene` (internal), `TOY_MATTE_MATERIALS` (matte rule: `roughness: 1, metalness: 0`), `getSceneRenderSettings(tier).shadows` |
| MFW-16 [3.2], MFW-17 [3.3], MFW-44 [3.4] | Same file: the krathong `<group ref={krathongTargetRef} onClick=…>` stays the click/fly-to target; the lazy-loaded scene chunk (three must stay out of the landing JS) |
| MFW-7 [1.1] | `src/store/useBuilderStore.ts` (`appearance` field), `FestivalEventId` from `src/config/events/types.ts` |
| MFW-9 [1.3] | `useDeviceStore` (`qualityTier`, `profiled`) — read only through the existing `SceneViewport` |

No unmerged prerequisite, so there is no ASSUMED INTERFACE in this card.

## Acceptance criteria → checks

AC text is verbatim from `docs/backlog.json` story 4.1.

1. **"Parts: base (banana trunk / lotus petal / toy bread), bananaLeaves fold styles & colors, flowers (marigold,
   orchid, lotus) on rim sockets, candleAndIncense"**
   - Catalogue constants exist with exactly these ids (`KRATHONG_BASE_IDS`, `LEAF_FOLD_STYLE_IDS`,
     `LEAF_COLOR_PALETTE`, `FLOWER_KINDS`, `CANDLE_COLOR_PALETTE`) → `src/core/customization/krathongAppearance.test.ts` ("catalogue").
   - Every base / fold / leaf colour / flower kind parses → same file (`it.each`).
   - Flowers are placed only on rim sockets at the socket angle → `src/core/customization/krathongAssembler.test.ts`.
   - The model renders base + leaves + flowers + candle + flame + incense → `src/components/models/loyKrathong/KrathongModel.test.tsx`.
2. **"candleAndIncense constrained to center_socket and always upright on the Y axis"**
   - `validateSocketPlacement` rejects `candleAndIncense` on any rim socket and accepts it only on `center_socket`;
     `validateSocketAssignments` requires exactly one candle → `src/core/customization/sockets.test.ts`.
   - `placeInSocket` refuses to put the candle on a rim socket; `clearSocket("center_socket")` is refused →
     `src/core/customization/krathongBuilder.test.ts`.
   - Assembler: candle, flame and incense live in `centerAnchor` at `(0, topY, 0)` with `rotationY === 0`; descriptors
     have no pitch/roll field at all → `krathongAssembler.test.ts`.
   - `computeUprightLocalQuaternion` keeps the child's world up vector at `(0, 1, 0)` for tilted parents →
     `src/core/customization/uprightConstraint.test.ts`.
   - The model renders candle/flame/incense inside the `UprightAnchor` group named `center_socket` → `KrathongModel.test.tsx`.
3. **"Parts share geometry/material; appearance serializes to the appearance JSONB shape in spec §5"**
   - One `KrathongAssets` instance returns the identical object (`toBe`) for the same key; two different krathongs
     resolve their parts to at most `KRATHONG_GEOMETRY_KEYS.length` geometries and `KRATHONG_MATERIAL_KEYS.length`
     materials in total; disposal disposes each shared object exactly once →
     `src/components/models/loyKrathong/krathongAssets.test.ts`.
   - Provider creates assets once and disposes them on unmount → `KrathongModel.test.tsx`.
   - `serializeKrathongAppearance` output has exactly the keys `base, lotusFold, leafColor, flowers, candleColor`
     (spec §5 keys + `leafColor`), JSON round-trips through `parseKrathongAppearance`, and the spec §5 example
     (plus `leafColor`) parses → `krathongAppearance.test.ts`.
   - The server-usable modules import no three.js → `src/core/customization/purity.test.ts`.
4. **"Unit tests for socket validator"** → `src/core/customization/sockets.test.ts` (full case list under Tests).

## Owner decisions that apply

Quoted from `docs/spec/open-questions.md`; do not reopen them.

- **Row 16 (MFW-36):** "build the engine loops (L2 privacy/API, L3 viewport, L4 customization, world/zones,
  find-mine, 2D fallback) generically; finish Loy Krathong only as far as the private test needs; then Christmas".
  → The socket validator, parser registry and asset sharing are generic in shape (`parseEventAppearance(eventId, …)`);
  only the Loy Krathong catalogue is filled in. No Christmas parts.
- **Row 18 (MFW-36):** "wipe all private-test data before the Christmas launch". → The appearance JSON needs no
  schema-version key or migration path for Loy Krathong 2026 test rows (see Decisions D3).
- **Row 5 (MFW-9):** per-tier budgets "shadows on/off/off" live in `TIER_BUDGETS`. → The model takes `shadows`
  from the existing `getSceneRenderSettings(tier)`; no new tier numbers.
- **Row 4 (MFW-25):** "80 items per zone". → Not enforced here (zones are MFW-25), but the shared-asset design is
  what keeps 80 krathongs to a fixed number of geometries/materials.
- **Row 11 (MFW-15):** "@react-spring/three". → Not used in this card (no animation here; the part-change bounce is MFW-20).

## Files

| Path | New/modify | Purpose |
|---|---|---|
| `src/config/events/loyKrathong.config.ts` | modify | Part catalogue ids, palettes, socket count/ids, default choices (server-safe data) |
| `src/config/krathongModel.config.ts` | new | Art numbers for the low-poly model: primitive specs, sizes, colours, leaf/incense counts |
| `src/core/customization/types.ts` | new | `KrathongAppearance`, socket and descriptor types, key types |
| `src/core/customization/sockets.ts` | new | Socket layout + socket validator |
| `src/core/customization/krathongAppearance.ts` | new | Default appearance, canonicalize, strict parse, serialize |
| `src/core/customization/krathongBuilder.ts` | new | `placeInSocket`, `clearSocket` (rule-enforcing builder ops) |
| `src/core/customization/krathongAssetKeys.ts` | new | Geometry/material key lists and key → spec lookups |
| `src/core/customization/krathongAssembler.ts` | new | Appearance → part descriptors (derived local transforms) |
| `src/core/customization/appearanceRegistry.ts` | new | `parseEventAppearance(eventId, input)` for the server write path |
| `src/core/customization/uprightConstraint.ts` | new | Quaternion math for the world-upright candle (imports three; NOT in the barrel) |
| `src/core/customization/index.ts` | modify | Barrel of the pure modules only |
| `src/core/customization/*.test.ts` | new | `sockets`, `krathongAppearance`, `krathongBuilder`, `krathongAssetKeys`, `krathongAssembler`, `appearanceRegistry`, `uprightConstraint`, `purity` |
| `src/components/models/loyKrathong/krathongAssets.ts` | new | `createKrathongAssets()` — one three geometry/material per key, `dispose()` |
| `src/components/models/loyKrathong/KrathongAssetsProvider.tsx` | new | React context that owns one `KrathongAssets` per canvas and disposes it on unmount |
| `src/components/models/loyKrathong/UprightAnchor.tsx` | new | Group that keeps its children world-upright every frame |
| `src/components/models/loyKrathong/KrathongModel.tsx` | new | Renders one krathong from an appearance using shared assets |
| `src/components/models/loyKrathong/index.ts` | modify | Barrel |
| `src/components/models/loyKrathong/krathongAssets.test.ts`, `KrathongModel.test.tsx` | new | Sharing, dispose, structure |
| `src/store/useBuilderStore.ts` | modify | Type `appearance` as `EventAppearance \| null` (type-only change) |
| `src/components/canvas3d/index.tsx` | modify | Provider inside `<Canvas>`, krathong placeholder → `<KrathongModel>`, `name` props on water/lamp |
| `src/components/canvas3d/index.test.tsx` | modify | Name-based mesh selectors; one new test for the builder appearance |

## Implementation steps

Conventions for every new file: TypeScript strict, English comments, no `any`, named constants only (no inline
numbers in components or core logic except `0`, `1`, `2`, `Math.PI` in formulas written below). Freeze exported
constant objects/arrays with `Object.freeze` like the existing configs do.

### Step 1 — `src/config/events/loyKrathong.config.ts` (modify)

Keep `loyKrathongConfig` exactly as is (it uses `satisfies FestivalEventConfig`, which rejects extra keys). Add
separate named exports below it. This file must not import three, React or anything from `src/core` at runtime.

```ts
/** Spec §6.4 Task 4.1 bases; id format follows the §5 example "banana_trunk_01". */
export const KRATHONG_BASE_IDS = ["banana_trunk_01", "lotus_petal_01", "toy_bread_01"] as const;
export type KrathongBaseId = (typeof KRATHONG_BASE_IDS)[number];

/** Banana-leaf fold styles (§5 key `lotusFold`, example "style_02"). Count PLACEHOLDER (spec silent). */
export const LEAF_FOLD_STYLE_IDS = ["style_01", "style_02"] as const;
export type LeafFoldStyleId = (typeof LEAF_FOLD_STYLE_IDS)[number];

/** Banana-leaf colours, canonical uppercase #RRGGBB. PLACEHOLDER values (spec silent). */
export const LEAF_COLOR_PALETTE = ["#5E8C3A", "#8DB255", "#3F6B4A"] as const;
export type LeafColor = (typeof LEAF_COLOR_PALETTE)[number];

/** Spec §6.4 Task 4.1 flowers. */
export const FLOWER_KINDS = ["marigold", "orchid", "lotus"] as const;
export type FlowerKind = (typeof FLOWER_KINDS)[number];

/** Candle colours, canonical uppercase. "#FFD166" is the §5 example; the other two are PLACEHOLDER (spec silent). */
export const CANDLE_COLOR_PALETTE = ["#FFD166", "#FFF1D6", "#FF9F6B"] as const;
export type CandleColor = (typeof CANDLE_COLOR_PALETTE)[number];

/** Spec §6.4: candleAndIncense is constrained to this socket. */
export const CENTER_SOCKET_ID = "center_socket" as const;
/** Rim socket ids are `${RIM_SOCKET_ID_PREFIX}${index}`, index 0..RIM_SOCKET_COUNT-1. */
export const RIM_SOCKET_ID_PREFIX = "rim_socket_" as const;
/** Number of flower sockets around the rim. PLACEHOLDER (spec silent). */
export const RIM_SOCKET_COUNT = 8;

/** Choices for the first krathong a user sees. PLACEHOLDER (spec silent). `flower` fills every rim socket. */
export const DEFAULT_KRATHONG_CHOICES = Object.freeze({
  base: "banana_trunk_01",
  lotusFold: "style_01",
  leafColor: "#5E8C3A",
  flower: "marigold",
  candleColor: "#FFD166",
} as const satisfies {
  base: KrathongBaseId;
  lotusFold: LeafFoldStyleId;
  leafColor: LeafColor;
  flower: FlowerKind;
  candleColor: CandleColor;
});
```

### Step 2 — `src/config/krathongModel.config.ts` (new)

Pure data (no three import). All values are art numbers, **PLACEHOLDER (spec silent)**, sized so the krathong
fits inside the existing `HIGHLIGHT_RING_SIZES.krathong.innerRadius` (1.35) and replaces the old island
(radius 1.18–1.32). Units are model-local world units, y-up.

```ts
import type { FlowerKind, KrathongBaseId, LeafFoldStyleId } from "@/config/events/loyKrathong.config";

export type Vec3Tuple = readonly [number, number, number];

export type PrimitiveGeometrySpec =
  | { readonly type: "cylinder"; readonly radiusTop: number; readonly radiusBottom: number; readonly height: number; readonly radialSegments: number }
  | { readonly type: "sphere"; readonly radius: number; readonly widthSegments: number; readonly heightSegments: number }
  | { readonly type: "cone"; readonly radius: number; readonly height: number; readonly radialSegments: number };

export interface MatteMaterialSpec {
  readonly color: string;
  readonly roughness: number;
  readonly metalness: number;
  readonly emissive?: string;
  readonly emissiveIntensity?: number;
}

/** Matte, non-glossy (backlog 3.1 AC2); same values as TOY_MATTE_MATERIALS. */
export const KRATHONG_MATTE_SURFACE = Object.freeze({ roughness: 1, metalness: 0 });

export interface BaseModelSpec {
  readonly geometry: PrimitiveGeometrySpec;
  readonly scale: Vec3Tuple;
  /** y of the base mesh centre. */
  readonly localY: number;
  /** y of the socket plane (top of the base). */
  readonly topY: number;
  /** Radius of the rim-socket circle and of the leaf ring. */
  readonly rimRadius: number;
  readonly color: string;
}
export interface PartModelSpec {
  readonly geometry: PrimitiveGeometrySpec;
  readonly scale: Vec3Tuple;
  /** y offset above the base's topY (body parts) or above the center anchor (upright parts). */
  readonly localY: number;
}
export interface ColoredPartModelSpec extends PartModelSpec {
  readonly color: string;
}
```

Constants (exact values to use; every one PLACEHOLDER):

| Constant | Value |
|---|---|
| `KRATHONG_BASE_MODELS: Readonly<Record<KrathongBaseId, BaseModelSpec>>` | `banana_trunk_01`: cylinder `{radiusTop 1.1, radiusBottom 1.2, height 0.36, radialSegments 16}`, scale `[1,1,1]`, localY `0`, topY `0.18`, rimRadius `0.95`, color `"#C9D98F"` · `lotus_petal_01`: cylinder `{1.2, 0.9, 0.4, 8}`, scale `[1,1,1]`, localY `0.02`, topY `0.22`, rimRadius `1.0`, color `"#E9A6B8"` · `toy_bread_01`: sphere `{radius 1.1, widthSegments 16, heightSegments 10}`, scale `[1, 0.32, 1]`, localY `0.02`, topY `0.34`, rimRadius `0.9`, color `"#D9A066"` |
| `KRATHONG_LEAF_MODELS: Readonly<Record<LeafFoldStyleId, PartModelSpec>>` | `style_01`: cone `{radius 0.28, height 0.55, radialSegments 4}`, scale `[1,1,1]`, localY `0.2` · `style_02`: sphere `{0.26, 8, 6}`, scale `[1, 1.4, 0.6]`, localY `0.18` |
| `KRATHONG_LEAF_COUNT` | `8` (decorative leaf ring; NOT sockets) |
| `KRATHONG_FLOWER_MODELS: Readonly<Record<FlowerKind, ColoredPartModelSpec>>` | `marigold`: sphere `{0.16, 10, 8}`, scale `[1, 0.8, 1]`, localY `0.38`, color `"#F4A300"` · `orchid`: cone `{0.16, 0.22, 5}`, scale `[1,1,1]`, localY `0.38`, color `"#B36BD6"` · `lotus`: cone `{0.18, 0.26, 8}`, scale `[1,1,1]`, localY `0.4`, color `"#F4A6C0"` |
| `KRATHONG_CANDLE_MODEL: PartModelSpec` | cylinder `{0.12, 0.12, 0.5, 12}`, scale `[1,1,1]`, localY `0.25` (candle colour comes from the appearance) |
| `KRATHONG_FLAME_MODEL: ColoredPartModelSpec & { emissive: string; emissiveIntensity: number }` | cone `{0.06, 0.14, 8}`, scale `[1,1,1]`, localY `0.57`, color `"#FFD9A0"`, emissive `"#FFB35C"`, emissiveIntensity `1` |
| `KRATHONG_INCENSE_MODEL: ColoredPartModelSpec & { count: number; ringRadius: number }` | cylinder `{0.015, 0.015, 0.7, 4}`, scale `[1,1,1]`, localY `0.35`, color `"#8A3B2E"`, count `3`, ringRadius `0.22` |

Freeze every object (nested too).

### Step 3 — `src/core/customization/types.ts` (new)

```ts
import type {
  CandleColor, FlowerKind, KrathongBaseId, LeafColor, LeafFoldStyleId,
  CENTER_SOCKET_ID, RIM_SOCKET_ID_PREFIX,
} from "@/config/events/loyKrathong.config";
export type { CandleColor, FlowerKind, KrathongBaseId, LeafColor, LeafFoldStyleId };

/** Stored in creations_public.appearance (spec §5). Index i of `flowers` is rim socket i; null = empty socket. */
export interface KrathongAppearance {
  readonly base: KrathongBaseId;
  readonly lotusFold: LeafFoldStyleId;
  readonly leafColor: LeafColor;
  readonly flowers: readonly (FlowerKind | null)[];
  readonly candleColor: CandleColor;
}
/** Union of every event's appearance. Only Loy Krathong exists in Phase 1. */
export type EventAppearance = KrathongAppearance;

export type CenterSocketId = typeof CENTER_SOCKET_ID;
export type RimSocketId = `${typeof RIM_SOCKET_ID_PREFIX}${number}`;
export type KrathongSocketId = CenterSocketId | RimSocketId;
export type SocketPartKind = "flower" | "candleAndIncense";

export interface KrathongSocketDef {
  readonly id: KrathongSocketId;
  readonly kind: "center" | "rim";
  /** The only part kind this socket accepts. */
  readonly accepts: SocketPartKind;
  /** "upright": world +Y always (candle). "outward": yaw faces away from the centre. */
  readonly orientation: "upright" | "outward";
  /** Rim: index × 360 / RIM_SOCKET_COUNT. Center: null. Parametric — 3D and 2D derive positions from it. */
  readonly angleDeg: number | null;
  readonly rimIndex: number | null;
}

export interface SocketAssignment {
  readonly part: SocketPartKind;
  readonly socketId: string;
}
export type SocketRuleViolation = "UNKNOWN_SOCKET" | "PART_NOT_ALLOWED_IN_SOCKET" | "SOCKET_OCCUPIED" | "CANDLE_REQUIRED";
export type SocketCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly violation: SocketRuleViolation; readonly socketId: string };

export type AppearanceParseResult<T = EventAppearance> =
  | { readonly ok: true; readonly appearance: T }
  | { readonly ok: false; readonly reason: string };

export type KrathongGeometryKey =
  | `base:${KrathongBaseId}` | `leaf:${LeafFoldStyleId}` | `flower:${FlowerKind}` | "candle" | "flame" | "incense";
export type KrathongMaterialKey =
  | `base:${KrathongBaseId}` | `leaf:${LeafColor}` | `flower:${FlowerKind}` | `candle:${CandleColor}` | "flame" | "incense";

export type KrathongPartRole = "base" | "leaf" | "flower" | "candle" | "flame" | "incense";

/** Derived at render time from an appearance. NEVER persisted or sent (invariant A). */
export interface KrathongPartInstance {
  /** Unique within one krathong; used as React key and Object3D name. */
  readonly id: string;
  readonly role: KrathongPartRole;
  readonly socketId: KrathongSocketId | null;
  readonly geometryKey: KrathongGeometryKey;
  readonly materialKey: KrathongMaterialKey;
  readonly localPosition: readonly [number, number, number];
  /** Yaw in radians. There is deliberately no pitch/roll field. */
  readonly rotationY: number;
  readonly scale: readonly [number, number, number];
}
export interface KrathongAssembly {
  /** Base, leaves, flowers — in model-local space. */
  readonly body: readonly KrathongPartInstance[];
  /** Candle, flame, incense — positions relative to the anchor; the anchor is kept world-upright. */
  readonly centerAnchor: {
    readonly socketId: CenterSocketId;
    readonly localPosition: readonly [number, number, number];
    readonly parts: readonly KrathongPartInstance[];
  };
}
```

Note: `CENTER_SOCKET_ID` / `RIM_SOCKET_ID_PREFIX` are values; use `import type` + `typeof` as shown (TS allows
`typeof` on a type-only imported const).

### Step 4 — `src/core/customization/sockets.ts` (new) — the socket validator

```ts
export function rimSocketId(index: number): RimSocketId;            // throws RangeError unless integer 0..RIM_SOCKET_COUNT-1
export const KRATHONG_SOCKETS: readonly KrathongSocketDef[];         // [center, rim_socket_0 … rim_socket_{N-1}]
export function getKrathongSocket(id: unknown): KrathongSocketDef | undefined;
export function validateSocketPlacement(assignment: SocketAssignment): SocketCheck;
export function validateSocketAssignments(assignments: readonly SocketAssignment[]): SocketCheck;
export function appearanceToSocketAssignments(appearance: KrathongAppearance): SocketAssignment[];
```

Behaviour:
- `KRATHONG_SOCKETS[0] = { id: "center_socket", kind: "center", accepts: "candleAndIncense", orientation: "upright", angleDeg: null, rimIndex: null }`;
  `KRATHONG_SOCKETS[1 + i] = { id: rimSocketId(i), kind: "rim", accepts: "flower", orientation: "outward", angleDeg: (i * 360) / RIM_SOCKET_COUNT, rimIndex: i }`.
  Declare `rimSocketId` as a `function` declaration so it is usable during module init. Freeze array and entries.
- Lookup uses a module-level `Map<string, KrathongSocketDef>` built from `KRATHONG_SOCKETS` — never an object index,
  so `"__proto__"`, `"toString"`, `"rim_socket_01"`, `"rim_socket_-1"`, `"rim_socket_8"` (with N = 8) are all unknown.
  `getKrathongSocket` returns `undefined` for non-strings.
- `validateSocketPlacement`: unknown id → `{ ok: false, violation: "UNKNOWN_SOCKET", socketId: String(assignment.socketId) }`;
  `socket.accepts !== assignment.part` → `PART_NOT_ALLOWED_IN_SOCKET`; else `{ ok: true }`.
- `validateSocketAssignments`: iterate in order; first failing `validateSocketPlacement` is returned; a socket id seen
  twice → `SOCKET_OCCUPIED` with that id (a second candle therefore fails as `SOCKET_OCCUPIED` on `center_socket`);
  after the loop, no `candleAndIncense` seen → `CANDLE_REQUIRED` with `socketId: "center_socket"`. Else ok.
- `appearanceToSocketAssignments`: `[{ part: "candleAndIncense", socketId: "center_socket" }]` followed by
  `{ part: "flower", socketId: rimSocketId(i) }` for every non-null `flowers[i]`. Precondition: `flowers.length <= RIM_SOCKET_COUNT`
  (callers pass parsed appearances; if violated `rimSocketId` throws — acceptable programming error).

### Step 5 — `src/core/customization/krathongAppearance.ts` (new) — parse / serialize

```ts
export const KRATHONG_APPEARANCE_KEYS = ["base", "lotusFold", "leafColor", "flowers", "candleColor"] as const;
export const DEFAULT_KRATHONG_APPEARANCE: KrathongAppearance;  // frozen, flowers frozen
export function canonicalizeKrathongAppearance(a: KrathongAppearance): KrathongAppearance;
export function parseKrathongAppearance(input: unknown): AppearanceParseResult<KrathongAppearance>;
export function serializeKrathongAppearance(a: KrathongAppearance): KrathongAppearance;
```

- `DEFAULT_KRATHONG_APPEARANCE` = `{ base, lotusFold, leafColor, candleColor }` from `DEFAULT_KRATHONG_CHOICES` and
  `flowers: Array.from({ length: RIM_SOCKET_COUNT }, () => DEFAULT_KRATHONG_CHOICES.flower)`, in the key order of
  `KRATHONG_APPEARANCE_KEYS`.
- `canonicalizeKrathongAppearance`: returns a **new** object with keys in `KRATHONG_APPEARANCE_KEYS` order, a new
  `flowers` array with trailing `null`s removed (inner nulls kept). Does not validate.
- `parseKrathongAppearance` (write-path gate, mirrors `parsePersistableCoord` in `src/core/coordinates/validateCoord.ts`;
  copy its private `isPlainObject` helper locally — do not edit `validateCoord.ts`). Checks in this order, returning
  `{ ok: false, reason }` with these **exact** reason strings:
  1. not a plain object (null, array, string, `Date`, object with a non-Object prototype) → `"appearance must be a plain object"`
  2. any own key not in `KRATHONG_APPEARANCE_KEYS` (iterate `Object.keys`) → `` `unknown key: ${key}` ``
     (so `"__proto__"` from `JSON.parse`, `"position"`, `"x"` are rejected — invariant A)
  3. any key of `KRATHONG_APPEARANCE_KEYS` missing (`Object.prototype.hasOwnProperty.call`) → `` `missing key: ${key}` ``
  4. `base` not in `KRATHONG_BASE_IDS` → `"base is not a known krathong base"`
  5. `lotusFold` not in `LEAF_FOLD_STYLE_IDS` → `"lotusFold is not a known fold style"`
  6. `leafColor`: must be a string matching `/^#[0-9a-fA-F]{6}$/` whose `toUpperCase()` is in `LEAF_COLOR_PALETTE`,
     else `"leafColor is not in the leaf palette"`
  7. `flowers` not an array (`Array.isArray`) → `"flowers must be an array"`; `length > RIM_SOCKET_COUNT` →
     `"flowers exceeds the rim socket count"` (checked before iterating); element `i` not `null` and not in
     `FLOWER_KINDS` → `` `flowers[${i}] is not a known flower` `` (holes in sparse arrays count as not-null-not-kind → rejected)
  8. `candleColor`: same rule as 6 with `CANDLE_COLOR_PALETTE` → `"candleColor is not in the candle palette"`
  9. build the canonical object (colours uppercased), run `validateSocketAssignments(appearanceToSocketAssignments(c))`;
     on failure → `` `socket rule: ${violation} at ${socketId}` `` (defensive; unreachable after 7)
  10. `{ ok: true, appearance: canonical }` — always a fresh object; never return or keep a reference to `input`.
- `serializeKrathongAppearance(a)` = `canonicalizeKrathongAppearance(a)`. This is what the client sends and what
  the server stores in `creations_public.appearance`.

Example stored/sent JSON (spec §5 shape; `leafColor` added, see Decisions D2):

```json
{ "base": "banana_trunk_01", "lotusFold": "style_02", "leafColor": "#5E8C3A",
  "flowers": ["marigold", "orchid", null, "lotus"], "candleColor": "#FFD166" }
```

### Step 6 — `src/core/customization/krathongBuilder.ts` (new) — rule-enforcing builder ops

```ts
export type SocketPlacement =
  | { readonly part: "flower"; readonly kind: FlowerKind; readonly socketId: string }
  | { readonly part: "candleAndIncense"; readonly socketId: string };
export type BuilderResult =
  | { readonly ok: true; readonly appearance: KrathongAppearance }
  | { readonly ok: false; readonly violation: SocketRuleViolation; readonly socketId: string };
export function placeInSocket(appearance: KrathongAppearance, placement: SocketPlacement): BuilderResult;
export function clearSocket(appearance: KrathongAppearance, socketId: string): BuilderResult;
```

- Never mutate the input. Successful results are passed through `canonicalizeKrathongAppearance`.
- `placeInSocket`: run `validateSocketPlacement({ part, socketId })`; on failure return it as `{ ok: false, violation, socketId }`.
  `candleAndIncense` on `center_socket` → ok with an unchanged (canonical copy) appearance (the candle always exists).
  `flower` on rim socket `i`: copy `flowers`, pad with `null` up to index `i`, set `flowers[i] = kind`. Replacing an
  existing flower is allowed (it is the same part kind in the same socket, not an occupancy conflict).
- `clearSocket`: unknown id → `UNKNOWN_SOCKET`; `center_socket` → `{ ok: false, violation: "CANDLE_REQUIRED", socketId: "center_socket" }`;
  rim socket `i` → set `flowers[i] = null` if `i < flowers.length`, then canonicalize (trailing nulls trimmed).

### Step 7 — `src/core/customization/krathongAssetKeys.ts` (new)

```ts
export const KRATHONG_GEOMETRY_KEYS: readonly KrathongGeometryKey[];   // 3 base + 2 leaf + 3 flower + candle, flame, incense = 11
export const KRATHONG_MATERIAL_KEYS: readonly KrathongMaterialKey[];   // 3 base + 3 leaf colours + 3 flower + 3 candle colours + flame, incense = 14
export function geometrySpecFor(key: KrathongGeometryKey): PrimitiveGeometrySpec;  // throws Error(`unknown krathong geometry key: ${key}`)
export function materialSpecFor(key: KrathongMaterialKey): MatteMaterialSpec;      // throws Error(`unknown krathong material key: ${key}`)
```

Build both key lists from the config tuples (`KRATHONG_BASE_IDS.map(id => \`base:${id}\` as const)` etc.), order:
base, leaf, flower, candle (colours), flame, incense. Spec lookups:
- geometry `base:<id>` → `KRATHONG_BASE_MODELS[id].geometry`; `leaf:<fold>` → `KRATHONG_LEAF_MODELS[fold].geometry`;
  `flower:<kind>` → `KRATHONG_FLOWER_MODELS[kind].geometry`; `candle` / `flame` / `incense` → the matching model's geometry.
- material: every spec is `{ ...KRATHONG_MATTE_SURFACE, color }` where color = base model colour / the leaf hex /
  flower colour / the candle hex / `KRATHONG_INCENSE_MODEL.color`; `flame` additionally gets `emissive` and
  `emissiveIntensity` from `KRATHONG_FLAME_MODEL`.
- Parse the key with `key.split(":")`; validate the suffix against the config tuple; anything else throws.

### Step 8 — `src/core/customization/krathongAssembler.ts` (new)

```ts
export function assembleKrathong(appearance: KrathongAppearance): KrathongAssembly;
```

Input is a parsed appearance. Let `B = KRATHONG_BASE_MODELS[appearance.base]`, `r = B.rimRadius`, `top = B.topY`.
Model-local angle convention (three.js): an angle θ (radians) maps to `x = r·sin θ`, `z = r·cos θ`, and
`rotationY = θ` turns the part's +Z to face outward. Write it once as a local helper `ringPoint(radius, theta, y)`.

- `body[0]`: `{ id: "base", role: "base", socketId: null, geometryKey: \`base:${base}\`, materialKey: \`base:${base}\`, localPosition: [0, B.localY, 0], rotationY: 0, scale: B.scale }`.
- Leaves, `j = 0 … KRATHONG_LEAF_COUNT-1`: `θ = ((j + 0.5) * 2 * Math.PI) / KRATHONG_LEAF_COUNT` (half-step offset
  so leaves sit between flower sockets); `{ id: \`leaf_${j}\`, role: "leaf", socketId: null, geometryKey: \`leaf:${lotusFold}\`, materialKey: \`leaf:${leafColor}\`, localPosition: ringPoint(r, θ, top + L.localY), rotationY: θ, scale: L.scale }` with `L = KRATHONG_LEAF_MODELS[lotusFold]`.
- Flowers: for each `i` with `flowers[i] !== null`: `socket = KRATHONG_SOCKETS[1 + i]`, `θ = socket.angleDeg * Math.PI / 180`,
  `F = KRATHONG_FLOWER_MODELS[kind]`; `{ id: \`flower_${socket.id}\`, role: "flower", socketId: socket.id, geometryKey: \`flower:${kind}\`, materialKey: \`flower:${kind}\`, localPosition: ringPoint(r, θ, top + F.localY), rotationY: θ, scale: F.scale }`.
  The angle comes from the socket definition — one source for validator, 3D and the later 2D view.
- `centerAnchor`: `{ socketId: "center_socket", localPosition: [0, top, 0], parts }` where parts, all `rotationY: 0`,
  all `socketId: "center_socket"`:
  `candle` (`geometryKey "candle"`, `materialKey \`candle:${candleColor}\``, position `[0, KRATHONG_CANDLE_MODEL.localY, 0]`),
  `flame` (`"flame"`/`"flame"`, `[0, KRATHONG_FLAME_MODEL.localY, 0]`),
  `incense_${k}` for `k = 0 … count-1`: `φ = (k * 2 * Math.PI) / count`, position `ringPoint(ringRadius, φ, KRATHONG_INCENSE_MODEL.localY)`, keys `"incense"`/`"incense"`.
- Return a frozen result. Pure: same input → deep-equal output.

### Step 9 — `src/core/customization/appearanceRegistry.ts` (new)

```ts
export function parseEventAppearance(eventId: FestivalEventId, input: unknown): AppearanceParseResult<EventAppearance>;
```

A module-level `ReadonlyMap<FestivalEventId, (input: unknown) => AppearanceParseResult<EventAppearance>>` with one entry
`["loy_krathong", parseKrathongAppearance]`. Unknown/stub event → `{ ok: false, reason: \`no appearance schema for event: ${eventId}\` }`.
This is the function the create API (backlog 2.4) calls; it never throws for any `input`.

### Step 10 — `src/core/customization/uprightConstraint.ts` (new; imports three; NOT exported from the barrel)

```ts
import { Quaternion } from "three";
/** Below this |(q.y, q.w)| the parent is ~180° tilted and has no defined yaw; use identity yaw. Lead decision. */
export const UPRIGHT_TWIST_EPSILON = 1e-9;
/**
 * Writes into `out` the local rotation that makes a child's WORLD rotation a pure yaw (world +Y stays up),
 * given the parent's world quaternion. Keeps the parent's yaw (twist about Y). No allocation.
 */
export function computeUprightLocalQuaternion(parentWorld: Quaternion, out: Quaternion): Quaternion;
```

Algorithm: `len = Math.hypot(parentWorld.y, parentWorld.w)`; twist `t = len < UPRIGHT_TWIST_EPSILON ? (0,0,0,1) : (0, y/len, 0, w/len)`;
`out.copy(parentWorld).invert().multiply(t)` — use a module-level scratch `Quaternion` for `t` (no per-call allocation).
Then child world = parentWorld × out = t (pure yaw). Return `out`.

### Step 11 — `src/core/customization/index.ts` (modify)

Replace `export {};` with (keep the existing doc comment line):

```ts
export * from "./types";
export * from "./sockets";
export * from "./krathongAppearance";
export * from "./krathongBuilder";
export * from "./krathongAssetKeys";
export * from "./krathongAssembler";
export * from "./appearanceRegistry";
// uprightConstraint.ts imports three and is imported by path only, so server code can import this barrel.
```

### Step 12 — `src/components/models/loyKrathong/krathongAssets.ts` (new)

```ts
import { BufferGeometry, ConeGeometry, CylinderGeometry, MeshStandardMaterial, SphereGeometry } from "three";
export interface KrathongAssets {
  geometry(key: KrathongGeometryKey): BufferGeometry;      // same object for the same key, every call
  material(key: KrathongMaterialKey): MeshStandardMaterial;
  listGeometries(): readonly BufferGeometry[];
  listMaterials(): readonly MeshStandardMaterial[];
  dispose(): void;                                          // disposes every geometry and material once; idempotent
}
export function createKrathongAssets(): KrathongAssets;
```

- Eagerly build one object per key of `KRATHONG_GEOMETRY_KEYS` / `KRATHONG_MATERIAL_KEYS` into two `Map`s.
  cylinder → `new CylinderGeometry(radiusTop, radiusBottom, height, radialSegments)`; sphere →
  `new SphereGeometry(radius, widthSegments, heightSegments)`; cone → `new ConeGeometry(radius, height, radialSegments)`.
  Material → `new MeshStandardMaterial({ color, roughness, metalness, ...(emissive ? { emissive, emissiveIntensity } : {}) })`.
- `geometry(key)` / `material(key)` throw `Error(\`unknown krathong asset key: ${key}\`)` for a missing key.
- `dispose()`: a `disposed` flag; first call disposes every object; later calls do nothing. Objects stay in the maps
  (three re-uploads a disposed geometry if it is rendered again, which keeps React Strict Mode's double effect safe).

### Step 13 — `src/components/models/loyKrathong/KrathongAssetsProvider.tsx` (new)

```tsx
"use client";
export function KrathongAssetsProvider({ children }: { children: ReactNode }): JSX.Element;
export function useKrathongAssets(): KrathongAssets;   // throws Error("useKrathongAssets must be used inside <KrathongAssetsProvider>")
```

`const [assets] = useState(createKrathongAssets);` · `useEffect(() => () => assets.dispose(), [assets]);` ·
`<KrathongAssetsContext value={assets}>{children}</KrathongAssetsContext>` (React 19 context-as-provider; a
`createContext<KrathongAssets | null>(null)`). One provider per `<Canvas>`; every `KrathongModel` under it shares it.

### Step 14 — `src/components/models/loyKrathong/UprightAnchor.tsx` (new)

```tsx
"use client";
export function UprightAnchor(props: { name: string; position: readonly [number, number, number]; children: ReactNode }): JSX.Element;
```

`const ref = useRef<Group>(null); const parentWorld = useRef(new Quaternion());`
`useFrame(() => { const g = ref.current; if (!g?.parent) return; g.parent.getWorldQuaternion(parentWorld.current); computeUprightLocalQuaternion(parentWorld.current, g.quaternion); });`
Render `<group ref={ref} name={props.name} position={props.position}>{props.children}</group>`.
No allocation inside the frame callback; no React state. Import `computeUprightLocalQuaternion` from
`@/core/customization/uprightConstraint` (by path).

### Step 15 — `src/components/models/loyKrathong/KrathongModel.tsx` (new)

```tsx
"use client";
export interface KrathongModelProps { appearance: KrathongAppearance; shadows: boolean; }
export const KrathongModel: MemoExoticComponent<(props: KrathongModelProps) => JSX.Element>; // React.memo
```

```tsx
function KrathongModelImpl({ appearance, shadows }: KrathongModelProps) {
  const assets = useKrathongAssets();
  const assembly = useMemo(() => assembleKrathong(appearance), [appearance]);
  const renderPart = (part: KrathongPartInstance) => (
    <mesh key={part.id} name={part.id}
      geometry={assets.geometry(part.geometryKey)} material={assets.material(part.materialKey)}
      position={part.localPosition} rotation={[0, part.rotationY, 0]} scale={part.scale}
      castShadow={shadows} receiveShadow={shadows && part.role === "base"} />
  );
  return (
    <group name="krathong-model">
      {assembly.body.map(renderPart)}
      <UprightAnchor name={assembly.centerAnchor.socketId} position={assembly.centerAnchor.localPosition}>
        {assembly.centerAnchor.parts.map(renderPart)}
      </UprightAnchor>
    </group>
  );
}
export const KrathongModel = memo(KrathongModelImpl);
```

Readonly tuples are accepted by R3F 9.8 prop types (checked). Shared geometry/material passed as props are not
disposed by R3F on unmount (three r187 `Object3D.dispose()` does not touch geometry/material; R3F only disposes the
instance it created) — only the provider disposes them. Do not use `<cylinderGeometry>`-style JSX children for
krathong parts (that would create one geometry per mesh). No animation in this component (part-change bounce is
MFW-20), so there is no reduced-motion branch here.

### Step 16 — `src/components/models/loyKrathong/index.ts` (modify)

Keep the doc comment; replace `export {};` with exports of `KrathongModel`, `KrathongModelProps`,
`KrathongAssetsProvider`, `useKrathongAssets`, `UprightAnchor`, `createKrathongAssets`, `KrathongAssets`.

### Step 17 — `src/store/useBuilderStore.ts` (modify)

`import type { EventAppearance } from "@/core/customization";` and `appearance: EventAppearance | null;`
Initial state stays `{ appearance: null }`; add no actions (MFW-20 adds them). `import type` keeps the landing
bundle free of new runtime code.

### Step 18 — `src/components/canvas3d/index.tsx` (modify)

1. Imports: `KrathongAssetsProvider`, `KrathongModel` from `@/components/models/loyKrathong`;
   `DEFAULT_KRATHONG_APPEARANCE`, `type KrathongAppearance` from `@/core/customization`; `useBuilderStore`.
2. `ToyNightSceneProps` gains `appearance: KrathongAppearance`.
3. Inside the krathong `<group ref={krathongTargetRef} …>` replace the four placeholder meshes (island cylinder +
   three pebble spheres) with `<KrathongModel appearance={appearance} shadows={shadows} />`. Keep the group's
   `ref`, `rotation` and `onClick` exactly as they are.
4. Add `name="scene-water"` to the water mesh and `name="scene-lamp"` to the lamp mesh (test selectors).
5. Remove the now unused `island` and `pebble` entries from `TOY_MATTE_MATERIALS` (keep `water`, `moon`).
6. In `SceneViewport`: `const builderAppearance = useBuilderStore((s) => s.appearance);`
   `const appearance = builderAppearance ?? DEFAULT_KRATHONG_APPEARANCE;` and pass it to `ToyNightScene`.
7. Wrap everything inside `<Canvas>` in `<KrathongAssetsProvider>…</KrathongAssetsProvider>`.
8. Change nothing else (lights, camera, pan, ring colour, the "กระทง" DOM chip, drag clamps are MFW-27's work).

### Decisions (technical, lead)

- **D1 — `flowers` is an index-mapped array with `null` for empty sockets.** Keeps the §5 shape
  (`flowers: ["marigold", "orchid"]` still means sockets 0 and 1) and lets a flower be removed without shifting the
  others. Trailing nulls are trimmed so equal krathongs serialize identically.
- **D2 — keep the §5 key `lotusFold` for the banana-leaf fold style and add one key, `leafColor`.** The AC requires leaf
  colours and the §5 example (written with "เช่น") has no field for them; renaming `lotusFold` would break the
  documented shape.
- **D3 — no schema-version key in `appearance`.** Every write goes through `parseEventAppearance` keyed by
  `event_id`, and owner decision 18 wipes Loy Krathong test rows before Christmas, so there is no old data to migrate.
- **D4 — colours are a closed palette, not any hex.** The server validator then accepts a finite set of values
  (smaller attack surface, no free-form strings in a public column) and the material count stays fixed. The palette
  values are an open question.
- **D5 — the candle and incense are one part that is always present.** Backlog 5.1 needs a candle that brightens, and
  §5 has a single `candleColor`. The appearance cannot hold a candle position or rotation, so the
  `center_socket` + upright rule is enforced by the data shape, the validator and the renderer together.
- **D6 — "upright" means world-upright.** `UprightAnchor` cancels the parent's tilt every frame (swing-twist) so the
  bobbing from MFW-24 cannot tip the candle; yaw follows the krathong.
- **D7 — eager shared assets per canvas via a provider; no instancing in this card.** 11 geometries + 14 materials
  are cheap to create. They are disposed when the provider unmounts. Instancing is MFW-34 (backlog 8.2 AC1). The
  descriptors already carry `geometryKey`/`materialKey`, so batching can be added later without changing the
  assembler.
- **D8 — catalogue (server-safe) and art numbers (render-only) live in separate config files.** The validator never
  depends on art. `uprightConstraint.ts` (three) is kept out of the barrel so `src/services/**` and `src/app/api/**`
  can import `@/core/customization` without pulling three into a server bundle.
- **D9 — no new e2e.** The user flow does not change. The existing `tests/e2e/scene-gating.spec.ts` already mounts
  the scene in CUSTOMIZE and SHARED_WORLD_EXPLORE on real WebGL (SwiftShader) and taps the krathong/water area,
  so a render error in the new model would fail it.

No row of `docs/spec/open-questions.md` names MFW-19, so nothing is appended there.

### Risks

- `r3f-perf-reviewer` may flag "N separate meshes per repeated part" (8 leaves + up to 8 flowers per krathong).
  Mitigation: at most one krathong is rendered in this card, and D7 plus backlog 8.2 put instancing in MFW-34. Say
  this in the PR body.
- The placeholder art numbers may look wrong next to the existing scene. They are all in
  `src/config/krathongModel.config.ts`, so changing them touches only that file.
- In React Strict Mode (dev), the provider's effect cleanup disposes the assets once while they are still in use.
  three re-uploads disposed geometry/material on the next render, so the result is correct; it only costs one
  extra upload in dev.
- The existing canvas test selects meshes by DOM index. Step 18.4 and the test edits switch it to `name`
  selectors. Keep the water mesh first in the tree anyway.

## Tests

All vitest; no network, no DB. Use `toBeCloseTo(value, 9)` for floating-point positions.

### `src/core/customization/sockets.test.ts` (AC2, AC4)
- `KRATHONG_SOCKETS.length === 1 + RIM_SOCKET_COUNT`; ids are `["center_socket", "rim_socket_0", …, "rim_socket_7"]`;
  rim `angleDeg` equals `i * 360 / RIM_SOCKET_COUNT`; center `orientation === "upright"`, accepts `candleAndIncense`;
  every rim socket accepts `flower`, `orientation === "outward"`.
- `rimSocketId(0) === "rim_socket_0"`; `rimSocketId(RIM_SOCKET_COUNT)`, `rimSocketId(-1)`, `rimSocketId(1.5)` throw `RangeError`.
- `validateSocketPlacement({ part: "candleAndIncense", socketId: "center_socket" })` → `{ ok: true }`.
- `it.each` over every rim id: candle there → `{ ok: false, violation: "PART_NOT_ALLOWED_IN_SOCKET", socketId: <id> }`.
- flower on `center_socket` → `PART_NOT_ALLOWED_IN_SOCKET`; flower on `rim_socket_7` → ok.
- `it.each(["rim_socket_8", "rim_socket_-1", "rim_socket_01", "", "__proto__", "toString", "CENTER_SOCKET"])` →
  `UNKNOWN_SOCKET` for both part kinds.
- `validateSocketAssignments([])` → `{ ok: false, violation: "CANDLE_REQUIRED", socketId: "center_socket" }`.
- `[candle@center]` → ok; `[candle@center, flower@rim_socket_0 × 8 distinct sockets]` → ok.
- `[candle@center, flower@rim_socket_2, flower@rim_socket_2]` → `SOCKET_OCCUPIED` at `rim_socket_2`.
- `[candle@center, candle@center]` → `SOCKET_OCCUPIED` at `center_socket`.
- `[flower@rim_socket_0]` (no candle) → `CANDLE_REQUIRED`; `[candle@rim_socket_0]` → `PART_NOT_ALLOWED_IN_SOCKET` (first failure wins).
- `appearanceToSocketAssignments({ …DEFAULT, flowers: ["orchid", null, "lotus"] })` →
  `[candle@center_socket, flower@rim_socket_0, flower@rim_socket_2]`.

### `src/core/customization/krathongAppearance.test.ts` (AC1, AC3)
- "catalogue": `KRATHONG_BASE_IDS` equals `["banana_trunk_01", "lotus_petal_01", "toy_bread_01"]`; `FLOWER_KINDS` equals
  `["marigold", "orchid", "lotus"]`; `LEAF_FOLD_STYLE_IDS.length >= 2`; `LEAF_COLOR_PALETTE.length >= 2`;
  `CANDLE_COLOR_PALETTE` contains `"#FFD166"`; all palette entries match `/^#[0-9A-F]{6}$/`.
- `parseKrathongAppearance(DEFAULT_KRATHONG_APPEARANCE)` → ok, `toEqual(DEFAULT_KRATHONG_APPEARANCE)`, not the same reference;
  default has `RIM_SOCKET_COUNT` flowers; `Object.isFrozen(DEFAULT_KRATHONG_APPEARANCE)` and its `flowers`.
- spec §5 example plus leaf colour: `{ base: "banana_trunk_01", lotusFold: "style_02", leafColor: LEAF_COLOR_PALETTE[0], flowers: ["marigold", "orchid"], candleColor: "#FFD166" }` → ok.
- `it.each` each base id, each fold id, each leaf colour, each candle colour, each flower kind (as `flowers: [kind]`) → ok.
- lowercase `"#ffd166"` → ok with `candleColor === "#FFD166"`.
- `flowers: ["marigold", null, null]` → `["marigold"]`; `["marigold", null, "orchid"]` kept; `[]` ok; `[null]` → `[]`.
- rejections (exact reason strings from Step 5): `null`, `[]`, `"x"`, `42`, `new Date()`, `Object.create({ base: "banana_trunk_01" })`
  → plain-object reason; `JSON.parse('{"__proto__":{},"base":…all valid keys…}')` → `"unknown key: __proto__"`; extra
  `position: [0,0,0]` → `"unknown key: position"`; extra `x: 1` → `"unknown key: x"`; each key removed in turn →
  `` `missing key: ${k}` ``; `base: "banana_trunk_02"`; `lotusFold: "style_99"`; `leafColor: "#000000"`, `"green"`, `123`;
  `candleColor: "#FFD16"`; `flowers: "marigold"`; `flowers` of length `RIM_SOCKET_COUNT + 1`; `flowers: ["rose"]` →
  `"flowers[0] is not a known flower"`; `flowers: ["marigold", 7]` → `"flowers[1] is not a known flower"`; sparse
  `[ , "marigold"]` → `"flowers[0] is not a known flower"`.
- serialize: `Object.keys(serializeKrathongAppearance(a))` equals `["base", "lotusFold", "leafColor", "flowers", "candleColor"]`;
  `parseKrathongAppearance(JSON.parse(JSON.stringify(serializeKrathongAppearance(a))))` → ok and `toEqual` the serialized value;
  mutating the input's `flowers` after serialize does not change the output; serialized JSON text contains none of
  `"position"`, `"rotation"`, `"x"`, `"y"`, `"z"` as keys (invariant A).

### `src/core/customization/krathongBuilder.test.ts` (AC2)
- `placeInSocket({ …DEFAULT, flowers: [] }, { part: "flower", kind: "orchid", socketId: "rim_socket_3" })` → ok,
  `flowers` equals `[null, null, null, "orchid"]`; the input still has `flowers: []`.
- Replace: flower `lotus` on `rim_socket_0` of the default → `flowers[0] === "lotus"`, length unchanged.
- `placeInSocket(DEFAULT, { part: "candleAndIncense", socketId: "rim_socket_0" })` →
  `{ ok: false, violation: "PART_NOT_ALLOWED_IN_SOCKET", socketId: "rim_socket_0" }`.
- Candle on `center_socket` → ok, `toEqual(DEFAULT)`.
- Flower on `center_socket` → `PART_NOT_ALLOWED_IN_SOCKET`; flower on `rim_socket_99` → `UNKNOWN_SOCKET`.
- `clearSocket({ …, flowers: [null, null, null, "orchid"] }, "rim_socket_3")` → `flowers: []`; `clearSocket(DEFAULT, "rim_socket_0")`
  → `flowers[0] === null`, length `RIM_SOCKET_COUNT`; `clearSocket(DEFAULT, "center_socket")` → `CANDLE_REQUIRED`;
  `clearSocket(DEFAULT, "nope")` → `UNKNOWN_SOCKET`.
- Every ok result passes `parseKrathongAppearance`.

### `src/core/customization/krathongAssetKeys.test.ts` (AC3)
- `KRATHONG_GEOMETRY_KEYS.length === 11`, `KRATHONG_MATERIAL_KEYS.length === 14`, both without duplicates
  (compute expected lengths from the config tuple lengths, not hard-coded, e.g. `KRATHONG_BASE_IDS.length + LEAF_FOLD_STYLE_IDS.length + FLOWER_KINDS.length + 3`).
- Every key resolves through `geometrySpecFor` / `materialSpecFor`; every material spec has `roughness === 1`, `metalness === 0`.
- `materialSpecFor("candle:#FFD166").color === "#FFD166"`; `materialSpecFor("flame").emissive` is defined.
- Unknown keys (`"base:nope"`, `"candle:#000000"`, `"leaf"`) throw (cast with `as never`).

### `src/core/customization/krathongAssembler.test.ts` (AC1, AC2)
- Default: `body.length === 1 + KRATHONG_LEAF_COUNT + RIM_SOCKET_COUNT`; `centerAnchor.parts.length === 2 + KRATHONG_INCENSE_MODEL.count`;
  part ids unique across body and anchor.
- Flower on rim socket `i` (`it.each` i = 0, 3, 7 with a single-flower appearance at that socket via `placeInSocket`):
  `socketId === rimSocketId(i)`, `θ = i * 2π / RIM_SOCKET_COUNT`, `localPosition ≈ [r·sin θ, topY + F.localY, r·cos θ]`, `rotationY ≈ θ`.
- `null` sockets produce no flower part; `flowers: []` → no flower parts.
- `it.each(KRATHONG_BASE_IDS)`: `centerAnchor.socketId === "center_socket"`, `localPosition` equals `[0, topY, 0]` of that base;
  every anchor part has `rotationY === 0` and `socketId === "center_socket"`; the candle part is at `x = 0, z = 0`;
  no descriptor has keys other than the `KrathongPartInstance` fields (no `rotationX`/`rotationZ`).
- Keys: base part keys `base:<id>`; leaf `leaf:<fold>` / `leaf:<leafColor>`; candle `candle:<candleColor>`; every
  part's keys are members of `KRATHONG_GEOMETRY_KEYS` / `KRATHONG_MATERIAL_KEYS`.
- Determinism: `assembleKrathong(a)` deep-equals a second call.

### `src/core/customization/uprightConstraint.test.ts` (AC2)
- Helper: parent `Group` with given Euler rotation, child `Group` added to it; `parent.updateMatrixWorld(true)`;
  `computeUprightLocalQuaternion(parent.getWorldQuaternion(new Quaternion()), child.quaternion)`;
  `child.updateMatrixWorld(true)`; `up = new Vector3(0, 1, 0).applyQuaternion(child.getWorldQuaternion(new Quaternion()))`.
- `it.each` parent rotations `[0,0,0]`, `[0, 1.2, 0]`, `[0.4, 1.1, -0.3]`, `[-0.7, 0, 0.5]`, `[Math.PI, 0, 0]`
  (degenerate) → `up` ≈ `(0, 1, 0)` within `1e-9`.
- Pure-yaw parent `[0, 1.2, 0]` → `child.quaternion` ≈ identity.
- Nested: grandparent tilted, parent yawed → still upright.
- Returns `out` (same reference).

### `src/core/customization/appearanceRegistry.test.ts`
- `parseEventAppearance("loy_krathong", DEFAULT_KRATHONG_APPEARANCE)` → ok.
- `parseEventAppearance("loy_krathong", { base: "x" })` → `ok: false` (reason equals `parseKrathongAppearance`'s).
- `parseEventAppearance("christmas", {})` → `{ ok: false, reason: "no appearance schema for event: christmas" }`.
- Never throws for `undefined`, `null`, a function, `Symbol()`.

### `src/core/customization/purity.test.ts` (first line `// @vitest-environment node`)
- Read the text of `src/core/customization/{types,sockets,krathongAppearance,krathongBuilder,krathongAssetKeys,krathongAssembler,appearanceRegistry,index}.ts`,
  `src/config/events/loyKrathong.config.ts` and `src/config/krathongModel.config.ts`: none matches
  `/from\s+["'](three|@react-three\/[^"']+|react)["']/`; `index.ts` does not contain `uprightConstraint`.

### `src/components/models/loyKrathong/krathongAssets.test.ts` (AC3)
- `assets.geometry("candle")` `toBe` a second call; `material("leaf:#5E8C3A")` likewise; `geometry("base:banana_trunk_01")`
  `not.toBe` `geometry("base:toy_bread_01")`.
- `listGeometries().length === KRATHONG_GEOMETRY_KEYS.length`, `listMaterials().length === KRATHONG_MATERIAL_KEYS.length`.
- Sharing across krathongs: assemble A = default and B = `{ toy_bread_01, style_02, other leaf colour, flowers: ["orchid","lotus","orchid"], other candle colour }`;
  map every part of both to `assets.geometry/material`; `new Set(geometries).size <= KRATHONG_GEOMETRY_KEYS.length`;
  all 8 default flowers share one geometry and one material (`toBe`); A's candle geometry `toBe` B's candle geometry.
- Material types: every material `instanceof MeshStandardMaterial`, `roughness === 1`, `metalness === 0`.
- `dispose()`: `vi.spyOn(obj, "dispose")` on every listed object, call `assets.dispose()` twice → each spy called exactly once.
- Unknown key throws.

### `src/components/models/loyKrathong/KrathongModel.test.tsx` (AC1, AC2, AC3)
- `vi.mock("@react-three/fiber", () => ({ useFrame: () => {} }))` (the intrinsic `<mesh>`/`<group>` then render as
  unknown DOM elements, as in `src/components/canvas3d/index.test.tsx`).
- Render `<KrathongAssetsProvider><KrathongModel appearance={DEFAULT_KRATHONG_APPEARANCE} shadows={false} /></KrathongAssetsProvider>`:
  `[name="krathong-model"]` exists; `mesh[name="base"]` count 1; `mesh[name^="leaf_"]` count `KRATHONG_LEAF_COUNT`;
  `mesh[name^="flower_"]` count `RIM_SOCKET_COUNT`; `[name="center_socket"] mesh[name="candle"]`,
  `[name="center_socket"] mesh[name="flame"]` exist; `[name="center_socket"] mesh[name^="incense_"]` count
  `KRATHONG_INCENSE_MODEL.count`; no candle mesh outside `[name="center_socket"]`.
- Appearance with `flowers: ["orchid", null, "lotus"]` → exactly `mesh[name="flower_rim_socket_0"]` and `mesh[name="flower_rim_socket_2"]`.
- Rendering `KrathongModel` without the provider throws the documented error (wrap in `expect(() => render(…)).toThrow(…)`;
  silence `console.error` with a spy for that case).
- Provider lifecycle: a probe child captures `useKrathongAssets()`; two `KrathongModel`s under one provider see the
  same assets object; spy on every listed geometry/material `dispose`; `unmount()` → each spy called once.

### `src/components/canvas3d/index.test.tsx` (modify)
- Change selectors: `waterMesh = c => c.querySelector('mesh[name="scene-water"]')!`,
  `lampMesh = c => c.querySelector('mesh[name="scene-lamp"]')!`,
  `krathongMesh = c => c.querySelector('[name="krathong-model"] mesh[name="base"]')!`. All existing cases keep their assertions.
- New case "renders the builder appearance, default when null": `setQualityTier("HIGH")`, render `<SceneViewport mode="CUSTOMIZE" />`
  → `mesh[name^="flower_"]` count `RIM_SOCKET_COUNT`; then `act(() => useBuilderStore.setState({ appearance: { …DEFAULT_KRATHONG_APPEARANCE, flowers: ["lotus"] } }))`
  → count 1. Reset `useBuilderStore` to its initial state in `beforeEach`.
- The existing "uses flat matte material settings" case still passes with `island`/`pebble` removed.

Unchanged and must still pass: `src/store/stores.test.ts` (initial shape `{ appearance: null }`), `tests/unit/structure.test.ts`,
`tests/unit/no-raw-xyz-persistence.test.ts`, all e2e.

## Do NOT

- Do not build the customizer UI, bottom bar, part buttons, rotate/zoom controls or the part-change bounce (MFW-20),
  the wish modal (MFW-21), the create API / any `src/app/api/**` route or `src/services/**` code (backlog 2.4), river
  lanes / bobbing (MFW-24), zones (MFW-25), InstancedMesh batching or memory audit (MFW-34), the 2D krathong (MFW-33),
  or any Christmas/other-festival parts.
- Do not change lights, camera numbers, pan behaviour, the highlight ring, the "กระทง" DOM chip or drag clamps in
  `src/components/canvas3d/index.tsx` (MFW-27). Only make the Step 18 edits.
- Do not add builder store actions, persist the appearance to `localStorage`, or send it anywhere.
- Never put a world position, rotation or `Vector3` into `appearance` or any persisted/sent object (invariant A).
  `localPosition` exists only on derived descriptors.
- Do not import `uprightConstraint.ts`, three, `@react-three/*` or React from the pure customization modules or the two config files.
- Do not create geometries/materials inside `KrathongModel`, inside `useFrame`, or per mesh; do not allocate in `useFrame`.
- Do not add dependencies (no drei, no test renderer); do not change `package.json`, the lockfile, `tsconfig.json`,
  `eslint.config.mjs`, `vitest.config.mts`, `playwright.config.ts`.
- Do not touch `.claude/**`, `scripts/**`, `.github/**`, `CLAUDE.md`, `AGENTS.md`, `docs/spec/**`,
  `docs/backlog*.json`, `docs/plans/**`, `src/core/coordinates/validateCoord.ts`.
- Do not weaken or delete existing tests; only the selector changes listed above.

## Definition of done

- Run each command separately, all green: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`,
  `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell pnpm e2e` (that browser path is for this cloud
  container; locally plain `pnpm e2e`).
- Every AC above has its listed tests.
- Delete `playwright-report/` and `test-results/` before committing; never commit `.next/`, `*.tsbuildinfo`.
- Branch `feat/MFW-19-krathong-modular-assembler-socket-rules` from the latest `main`. Conventional commit(s) with the key
  in the subject, e.g. `feat(customization): krathong modular assembler and socket rules MFW-19`.
- Ready PR against `main`, English title = commit subject. The body links MFW-19 and lists each AC with the file/test that
  proves it, the Decisions D1–D9, every PLACEHOLDER constant (Steps 1–2), the Open questions below, the test plan with the
  five command results, and a note that instancing is deliberately left to MFW-34. Leave the PR open for review
  (reviewer + qa + r3f-perf-reviewer); do not merge. Not a privacy/db card.

## Interfaces this card provides

From `@/core/customization` (pure, server-safe; no three):
- Types: `KrathongAppearance`, `EventAppearance`, `KrathongSocketId`, `RimSocketId`, `KrathongSocketDef`, `SocketPartKind`,
  `SocketAssignment`, `SocketRuleViolation`, `SocketCheck`, `AppearanceParseResult<T>`, `KrathongGeometryKey`,
  `KrathongMaterialKey`, `KrathongPartInstance`, `KrathongAssembly`, plus re-exported `KrathongBaseId`, `LeafFoldStyleId`,
  `LeafColor`, `FlowerKind`, `CandleColor`.
- `parseEventAppearance(eventId: FestivalEventId, input: unknown): AppearanceParseResult<EventAppearance>` — the create API
  (2.4) validator; persist only `result.appearance`, never the raw input.
- `parseKrathongAppearance(input: unknown)`, `serializeKrathongAppearance(a)`, `canonicalizeKrathongAppearance(a)`,
  `DEFAULT_KRATHONG_APPEARANCE`, `KRATHONG_APPEARANCE_KEYS`.
- `KRATHONG_SOCKETS`, `rimSocketId(i)`, `getKrathongSocket(id)`, `validateSocketPlacement`, `validateSocketAssignments`,
  `appearanceToSocketAssignments` — MFW-20 (UI) and MFW-33 (2D krathong uses `angleDeg`).
- `placeInSocket(appearance, placement): BuilderResult`, `clearSocket(appearance, socketId): BuilderResult` — MFW-20.
- `assembleKrathong(appearance): KrathongAssembly`, `KRATHONG_GEOMETRY_KEYS`, `KRATHONG_MATERIAL_KEYS`,
  `geometrySpecFor`, `materialSpecFor` — MFW-34 batches by these keys.

From `@/core/customization/uprightConstraint` (three): `computeUprightLocalQuaternion(parentWorld, out)`, `UPRIGHT_TWIST_EPSILON`.

From `@/components/models/loyKrathong` (client, inside `<Canvas>` only): `KrathongAssetsProvider`, `useKrathongAssets()`,
`KrathongModel({ appearance, shadows })`, `UprightAnchor({ name, position, children })`, `createKrathongAssets(): KrathongAssets`.
MFW-23/24/25 render many krathongs as `<KrathongModel>` under one provider; MFW-28 InspectPopup reads `appearance`.

Config: `src/config/events/loyKrathong.config.ts` (`KRATHONG_BASE_IDS`, `LEAF_FOLD_STYLE_IDS`, `LEAF_COLOR_PALETTE`,
`FLOWER_KINDS`, `CANDLE_COLOR_PALETTE`, `CENTER_SOCKET_ID`, `RIM_SOCKET_ID_PREFIX`, `RIM_SOCKET_COUNT`,
`DEFAULT_KRATHONG_CHOICES`); `src/config/krathongModel.config.ts` (art specs).

Store: `useBuilderStore` state `appearance: EventAppearance | null` (no actions yet).

## Open questions

Owner decisions only. The plan uses the PLACEHOLDER shown so the card can be built now; the owner confirms or replaces it.

1. **Palettes.** Banana-leaf colours (`#5E8C3A`, `#8DB255`, `#3F6B4A`) and candle colours other than the spec's `#FFD166`
   (`#FFF1D6`, `#FF9F6B`). Options: accept them / give a palette / allow a free colour picker (which would change D4).
2. **How many rim (flower) sockets?** PLACEHOLDER 8. Options: 6 / 8 / 12, or a different count per base.
3. **How many banana-leaf fold styles, and what they look like?** PLACEHOLDER 2 (`style_01` pointed, `style_02` rounded).
4. **Default krathong (the first one a user sees).** PLACEHOLDER banana trunk, `style_01`, first leaf colour, a marigold in every
   rim socket, `#FFD166` candle. Options: accept / another combination / random among the catalogue.
5. **Is the candle and incense always present?** The plan assumes always (D5, needed by 5.1 "candle brightens"). Options:
   always / optional (then `appearance` needs a flag and 5.1 needs a case without a candle).
6. **Art look and size of every part** (shapes, dimensions, base/flower colours, 8 leaves, 3 incense sticks) —
   PLACEHOLDER values in `src/config/krathongModel.config.ts`. Options: accept for the private test / provide art direction.

## Out of scope

Customizer UI and store actions (MFW-20), wish composer (MFW-21), create API and its persistence (2.4), river movement and
bobbing (MFW-24), zones (MFW-25), environment and scene-art cleanup (MFW-27), InstancedMesh and memory audit (MFW-34), 2D
krathong (MFW-33), any other festival's parts.
