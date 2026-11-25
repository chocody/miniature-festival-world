import { LIVING_WORLD_TIERS, type QualityTier, type RenderTier } from "@/config/performance.config";
import type { RiverLane } from "@/core/coordinates";
import { bankSurfaceY, type BankProfilePoint } from "./bankProfile";
import type { BlobShadowFanSpec } from "./blobShadow";
import { buildBlobShadowFan } from "./blobShadow";
import { riverFrameAt } from "./riverEnvironment";
import type { VertexAlphaMeshData } from "./waterHighlights";

/**
 * MFW-50 ambient life (backlog 9.4 AC3): floating light motes and flickering lanterns (foliage sway is MFW-70). Pure functions of config
 * and the wall clock; reduced motion freezes all of them (AC4). Render-time only, nothing persisted (invariant A).
 */

export interface AmbientMoteSpec {
  readonly progressFrom: number;
  readonly progressTo: number;
  readonly setbackMin: number; // world units from the channel edge
  readonly setbackMax: number;
  readonly heightMin: number; // above the bank surface
  readonly heightMax: number;
  readonly driftRadius: number;
  readonly driftPeriodMs: number;
  readonly bobAmplitude: number;
  readonly bobPeriodMs: number;
  readonly pulsePeriodMs: number;
  readonly pulseMinScale: number;
  readonly radius: number; // world units
}
export interface LanternFlickerSpec {
  readonly amplitude: number;
  readonly components: readonly { readonly weight: number; readonly periodMs: number; readonly phaseRad: number }[];
}
export interface MoteAnchor {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly phase: number;
}
/** Render-time only (invariant A). */
export interface MoteFrameOut {
  x: number;
  y: number;
  z: number;
  radius: number;
}
export interface LivingWorldSettings {
  readonly tier: RenderTier;
  readonly villagerCount: number;
  readonly villagersWalk: boolean;
  readonly moteCount: number;
  readonly motesMove: boolean;
  readonly lanternFlicker: boolean;
  readonly idleRedrawIntervalMs: number | null;
}

/** Golden-ratio conjugate: low-discrepancy scatter along the river (the k-th point never clumps with earlier ones). */
const GOLDEN_SCATTER = (Math.sqrt(5) - 1) / 2;
/** Silver-ratio conjugate: an independent low-discrepancy sequence for the second scatter axis. */
const SILVER_SCATTER = Math.SQRT2 - 1;
const FULL_TURN = 2 * Math.PI;
const XYZ = 3;
const RGBA = 4;
/** Planes of the crossed mote fan: xz (as built), xy and yz. */
const CROSSED_PLANES = 3;

const frac = (x: number) => x - Math.floor(x);

/** Tier (FALLBACK_2D never renders 3D: treated as LOW) and reduced motion → what the living world shows and moves. */
export function resolveLivingWorldSettings(qualityTier: QualityTier, reducedMotion: boolean): LivingWorldSettings {
  const tier: RenderTier = qualityTier === "FALLBACK_2D" ? "LOW" : qualityTier;
  const t = LIVING_WORLD_TIERS[tier];
  const villagersWalk = t.villagersWalk && !reducedMotion;
  const motesMove = t.moteCount > 0 && !reducedMotion;
  const lanternFlicker = t.lanternFlicker && !reducedMotion;
  const moving = villagersWalk || motesMove || lanternFlicker; // what actually moves (MFW-70 foliage sway is not a reason)
  return Object.freeze({
    tier,
    villagerCount: t.villagerCount,
    villagersWalk,
    moteCount: t.moteCount,
    motesMove,
    lanternFlicker,
    idleRedrawIntervalMs: moving ? t.idleRedrawIntervalMs : null,
  });
}

/** Deterministic mote anchors over both banks (alternating sides, never over the water). Allocates: prepare time only. */
export function prepareMoteAnchors(
  count: number,
  channel: RiverLane,
  profile: readonly BankProfilePoint[],
  spec: AmbientMoteSpec,
): readonly MoteAnchor[] {
  if (!Number.isInteger(count) || count < 0) throw new RangeError("mote count must be an integer >= 0");
  const anchors: MoteAnchor[] = [];
  for (let k = 0; k < count; k++) {
    const u = frac(k * GOLDEN_SCATTER);
    const v = frac(k * SILVER_SCATTER);
    const w = frac(k * (GOLDEN_SCATTER + SILVER_SCATTER));
    const side = k % 2 === 0 ? -1 : 1;
    const progress = spec.progressFrom + (spec.progressTo - spec.progressFrom) * u;
    const setback = spec.setbackMin + (spec.setbackMax - spec.setbackMin) * v;
    const { centerline, right } = riverFrameAt(channel, progress);
    const d = side * (channel.width / 2 + setback);
    anchors.push(
      Object.freeze({
        x: centerline.x + right.x * d,
        y: bankSurfaceY(profile, setback) + spec.heightMin + (spec.heightMax - spec.heightMin) * w,
        z: centerline.z + right.z * d,
        phase: u,
      }),
    );
  }
  return Object.freeze(anchors);
}

/** Outside the per-frame writers, so their bodies stay allocation-free (the instancing audit greps them). */
function invalidTime(): RangeError {
  return new RangeError("timeMs must be finite");
}

export function createMoteFrameOut(): MoteFrameOut {
  return { x: 0, y: 0, z: 0, radius: 0 };
}

/** Allocation-free: drift circle, bob and a slow size pulse. Not animated = the t = 0 frame. */
export function moteFrameInto(
  anchor: MoteAnchor,
  timeMs: number,
  animated: boolean,
  spec: AmbientMoteSpec,
  out: MoteFrameOut,
): MoteFrameOut {
  if (!Number.isFinite(timeMs)) throw invalidTime();
  const t = animated ? timeMs : 0;
  const a = FULL_TURN * (t / spec.driftPeriodMs + anchor.phase);
  out.x = anchor.x + spec.driftRadius * Math.cos(a);
  out.z = anchor.z + spec.driftRadius * Math.sin(a);
  out.y = anchor.y + spec.bobAmplitude * Math.sin(FULL_TURN * (t / spec.bobPeriodMs + anchor.phase));
  const pulse = (1 + Math.sin(FULL_TURN * (t / spec.pulsePeriodMs + anchor.phase))) / 2;
  out.radius = spec.radius * (spec.pulseMinScale + (1 - spec.pulseMinScale) * pulse);
  return out;
}

/** Lantern emissive multiplier: 1 + amplitude · Σ weight·sin(2π t / period + phase); 1 when not animated. */
export function lanternFlickerFactor(timeMs: number, animated: boolean, spec: LanternFlickerSpec): number {
  if (!animated) return 1;
  let sum = 0;
  for (let i = 0; i < spec.components.length; i++) {
    const c = spec.components[i];
    sum += c.weight * Math.sin((FULL_TURN * timeMs) / c.periodMs + c.phaseRad);
  }
  return 1 + spec.amplitude * sum;
}

/**
 * Soft mote shape (owner, 2026-11-25: tiny soft points, no visible edge): the blob fan (alpha 1 at the centre → 0 at the rim)
 * in three orthogonal planes (xz, xy, yz) through the origin, so it reads as a soft point from every camera yaw without
 * per-frame billboarding. Unit radius; triangles = 3 × the fan's.
 */
export function buildCrossedFanData(spec: BlobShadowFanSpec): VertexAlphaMeshData {
  const fan = buildBlobShadowFan(spec);
  const n = fan.vertexCount;
  const positions = new Float32Array(CROSSED_PLANES * n * XYZ);
  const colors = new Float32Array(CROSSED_PLANES * n * RGBA);
  const indices = new Uint16Array(CROSSED_PLANES * fan.indices.length);
  for (let p = 0; p < CROSSED_PLANES; p++) {
    for (let v = 0; v < n; v++) {
      const a = fan.positions[v * XYZ];
      const b = fan.positions[v * XYZ + 2];
      const o = (p * n + v) * XYZ;
      // plane 0: (a, 0, b) · plane 1: (a, b, 0) · plane 2: (0, a, b)
      positions[o] = p === 2 ? 0 : a;
      positions[o + 1] = p === 0 ? 0 : p === 1 ? b : a;
      positions[o + 2] = p === 1 ? 0 : b;
    }
    colors.set(fan.colors, p * n * RGBA);
    for (let i = 0; i < fan.indices.length; i++) indices[p * fan.indices.length + i] = fan.indices[i] + p * n;
  }
  return { positions, colors, indices, vertexCount: CROSSED_PLANES * n };
}
