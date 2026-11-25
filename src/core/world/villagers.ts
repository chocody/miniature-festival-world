import { MS_PER_SECOND } from "@/config/gimmicks.config";
import type { RiverLane, SplinePoseOut } from "@/core/coordinates";
import type { BankProfilePoint } from "./bankProfile";
import { riversidePathPoseInto, type RiversidePathDefinition } from "./riversidePaths";

/**
 * MFW-50 villagers (backlog 9.4 AC1): small silhouettes strolling along the MFW-49 riverside paths. Every pose is a pure
 * function of (config, path, wall clock): no physics, no randomness, no stored state, nothing persisted (invariant A).
 */

export interface VillagerWatchStop {
  readonly atFraction: number; // (0, 1) of the walk segment
  readonly durationMs: number; // > 0, on each leg
}

export interface VillagerDefinition {
  readonly villagerId: number; // integer ≥ 1, unique; stable (MFW-60 tap hook), never persisted
  readonly pathId: number; // a RiversidePathDefinition.pathId
  readonly fromProgress: number; // walk segment on the path: path.fromProgress ≤ from < to ≤ path.toProgress
  readonly toProgress: number;
  readonly across: number; // [-1, 1] across the strip; fixed per villager
  readonly phase: number; // [0, 1) offset into the cycle
  readonly speed: number; // world units / s along the channel centreline arc length, finite > 0
  readonly watch: VillagerWatchStop | null; // stops to watch the river on each leg
  readonly hat: boolean;
  readonly scale: number; // finite > 0
}

export interface VillagerMotionSpec {
  readonly stepLength: number; // world units per step (one hop + one waddle)
  readonly hopHeight: number; // × villager scale
  readonly waddleRad: number;
}

export interface PreparedVillager {
  readonly def: VillagerDefinition;
  readonly path: RiversidePathDefinition;
  readonly legLength: number; // (to − from) × channel arc length
  readonly legMs: number; // legLength / speed × MS_PER_SECOND
  readonly stopMs: number; // watch?.durationMs ?? 0
  readonly cycleMs: number; // 2 × (legMs + stopMs)
}

export type VillagerActivity = "WALK" | "WATCH" | "STAND";

/** Render-time only (invariant A). Extends SplinePoseOut so riversidePathPoseInto can write into it. */
export interface VillagerPoseOut extends SplinePoseOut {
  hopY: number;
  rollRad: number;
  progress: number;
  activity: VillagerActivity;
}

/** Fraction of the segment where a villager without a watch stop stands (reduced motion, LOW). */
const STAND_FRACTION = 0.5;
const HALF_TURN = Math.PI;
const QUARTER_TURN = Math.PI / 2;

/** Outside the per-frame writers, so their bodies stay allocation-free (the instancing audit greps them). */
function invalidTime(): RangeError {
  return new RangeError("timeMs must be finite");
}

export function createVillagerPoseOut(): VillagerPoseOut {
  return { x: 0, y: 0, z: 0, yawRad: 0, hopY: 0, rollRad: 0, progress: 0, activity: "STAND" };
}

function finite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`villager ${name} must be finite`);
}

/** Throws RangeError unless the definition is valid on `path` (see VillagerDefinition). */
export function assertVillagerDefinition(def: VillagerDefinition, path: RiversidePathDefinition | undefined): void {
  if (!path) throw new RangeError(`villager ${def.villagerId}: unknown pathId ${def.pathId}`);
  if (!Number.isInteger(def.villagerId) || def.villagerId < 1) throw new RangeError("villagerId must be an integer >= 1");
  finite(def.fromProgress, "fromProgress");
  finite(def.toProgress, "toProgress");
  finite(def.across, "across");
  finite(def.phase, "phase");
  finite(def.speed, "speed");
  finite(def.scale, "scale");
  if (!(path.fromProgress <= def.fromProgress && def.fromProgress < def.toProgress && def.toProgress <= path.toProgress)) {
    throw new RangeError("villager segment must satisfy path.fromProgress <= fromProgress < toProgress <= path.toProgress");
  }
  if (Math.abs(def.across) > 1) throw new RangeError("villager across must be in [-1, 1]");
  if (!(def.phase >= 0 && def.phase < 1)) throw new RangeError("villager phase must be in [0, 1)");
  if (!(def.speed > 0)) throw new RangeError("villager speed must be > 0");
  if (!(def.scale > 0)) throw new RangeError("villager scale must be > 0");
  if (def.watch !== null) {
    finite(def.watch.atFraction, "watch.atFraction");
    finite(def.watch.durationMs, "watch.durationMs");
    if (!(def.watch.atFraction > 0 && def.watch.atFraction < 1)) throw new RangeError("villager watch.atFraction must be in (0, 1)");
    if (!(def.watch.durationMs > 0)) throw new RangeError("villager watch.durationMs must be > 0");
  }
}

/** Validates and precomputes the cycle of every villager (input order). Allocates: call it from a memo, never per frame. */
export function prepareVillagers(
  defs: readonly VillagerDefinition[],
  paths: readonly RiversidePathDefinition[],
  channel: RiverLane,
): readonly PreparedVillager[] {
  if (defs.length === 0) return Object.freeze([]);
  const arc = channel.curve.getLength();
  const ids = new Set<number>();
  return Object.freeze(
    defs.map((def) => {
      const path = paths.find((p) => p.pathId === def.pathId);
      assertVillagerDefinition(def, path);
      if (ids.has(def.villagerId)) throw new RangeError(`duplicate villagerId ${def.villagerId}`);
      ids.add(def.villagerId);
      const legLength = (def.toProgress - def.fromProgress) * arc;
      const legMs = (legLength / def.speed) * MS_PER_SECOND;
      const stopMs = def.watch?.durationMs ?? 0;
      return Object.freeze({ def, path: path as RiversidePathDefinition, legLength, legMs, stopMs, cycleMs: 2 * (legMs + stopMs) });
    }),
  );
}

function posMod(a: number, m: number): number {
  return ((a % m) + m) % m;
}

/**
 * Allocation-free pose of one villager at `timeMs` (wall clock). Not animated (reduced motion, LOW): the time-independent STAND
 * pose at the watch spot (or mid-segment), facing the water. Animated: a ping-pong walk over the segment with an optional
 * watch stop on each leg (facing the water); hop and waddle come from the distance walked. Local +Z = (sin yaw, cos yaw).
 */
export function villagerPoseInto(
  v: PreparedVillager,
  channel: RiverLane,
  profile: readonly BankProfilePoint[],
  motion: VillagerMotionSpec,
  timeMs: number,
  animated: boolean,
  out: VillagerPoseOut,
): VillagerPoseOut {
  if (!Number.isFinite(timeMs)) throw invalidTime();
  const { def, path } = v;
  const span = def.toProgress - def.fromProgress;
  const side = path.side;
  if (!animated) {
    const s = def.watch ? def.watch.atFraction : STAND_FRACTION;
    const progress = def.fromProgress + s * span;
    riversidePathPoseInto(channel, path, profile, progress, def.across, out);
    out.yawRad += side * QUARTER_TURN; // faces the water
    out.hopY = 0;
    out.rollRad = 0;
    out.progress = progress;
    out.activity = "STAND";
    return out;
  }
  const tau = posMod(timeMs + def.phase * v.cycleMs, v.cycleMs);
  const half = v.cycleMs / 2;
  const leg = tau < half ? 0 : 1;
  const legTime = tau - leg * half;
  const stopStart = def.watch ? def.watch.atFraction * v.legMs : Infinity;
  let s: number;
  let watching = false;
  if (legTime < stopStart) {
    s = legTime / v.legMs;
  } else if (legTime < stopStart + v.stopMs) {
    s = def.watch ? def.watch.atFraction : 0;
    watching = true;
  } else {
    s = (legTime - v.stopMs) / v.legMs;
  }
  s = Math.min(1, Math.max(0, s));
  const progress = leg === 0 ? def.fromProgress + s * span : def.toProgress - s * span;
  riversidePathPoseInto(channel, path, profile, progress, def.across, out);
  if (watching) {
    out.yawRad += side * QUARTER_TURN;
    out.hopY = 0;
    out.rollRad = 0;
    out.activity = "WATCH";
  } else {
    out.yawRad += leg === 1 ? HALF_TURN : 0;
    const k = (Math.PI * s * v.legLength) / motion.stepLength;
    const wave = Math.sin(k);
    out.hopY = motion.hopHeight * def.scale * Math.abs(wave);
    out.rollRad = motion.waddleRad * wave;
    out.activity = "WALK";
  }
  out.progress = progress;
  return out;
}

/**
 * Instance slots of the villager meshes (one shared silhouette material, owner 2026-11-25): body and head instance i =
 * villager i; hats only for villagers with `hat`. The id arrays are the MFW-60 tap hook (instanceId → villagerId).
 */
export interface VillagerInstancePlan {
  readonly villagerIds: readonly number[]; // body and head instance i → villagerId
  readonly hatSlotOf: readonly number[]; // villager i → hat instance index, −1 = no hat
  readonly hatVillagerIds: readonly number[]; // hat instance → villagerId
}

export function planVillagerInstances(villagers: readonly VillagerDefinition[]): VillagerInstancePlan {
  const hatVillagerIds: number[] = [];
  const hatSlotOf = villagers.map((v) => {
    if (!v.hat) return -1;
    hatVillagerIds.push(v.villagerId);
    return hatVillagerIds.length - 1;
  });
  return Object.freeze({
    villagerIds: Object.freeze(villagers.map((v) => v.villagerId)),
    hatSlotOf: Object.freeze(hatSlotOf),
    hatVillagerIds: Object.freeze(hatVillagerIds),
  });
}
