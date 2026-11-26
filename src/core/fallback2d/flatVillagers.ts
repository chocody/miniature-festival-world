import type { BankSide } from "@/core/world/riverEnvironment"; // type-only
import type { RiversidePathDefinition } from "@/core/world/riversidePaths"; // type-only
import type { VillagerDefinition } from "@/core/world/villagers"; // type-only
import { createFlatLaneFrameOut, flatLaneFrameInto, type FlatLane } from "./flatLane";

/** Ground point of one standing villager on the 2D map (world xz). Derived at render time, NEVER persisted (invariant A). */
export interface FlatVillager {
  readonly villagerId: number;
  readonly x: number;
  readonly z: number;
  readonly scale: number;
  readonly hat: boolean;
  readonly side: BankSide;
}

/** = STAND_FRACTION in src/core/world/villagers.ts (pinned by flatVillagers.test.ts; a value import would load three). */
export const FLAT_VILLAGER_STAND_FRACTION = 0.5;

/**
 * Three-free twin of the 3D static STAND pose (villagerPoseInto with animated = false, MFW-50) for the first `count` villagers:
 * the watch spot (or mid-segment) of each villager's path, from the same path config and channel as 3D (invariant B). No clock:
 * FALLBACK_2D shows the LOW living world, whose villagers stand still.
 */
export function resolveFlatVillagers(
  channel: FlatLane,
  paths: readonly RiversidePathDefinition[],
  villagers: readonly VillagerDefinition[],
  count: number,
): readonly FlatVillager[] {
  if (!Number.isInteger(count) || count < 0) throw new RangeError("villager count must be an integer >= 0");
  const f = createFlatLaneFrameOut();
  return Object.freeze(
    villagers.slice(0, count).map((v) => {
      const path = paths.find((p) => p.pathId === v.pathId);
      if (!path) throw new RangeError(`villager ${v.villagerId}: unknown pathId ${v.pathId}`);
      const s = v.watch ? v.watch.atFraction : FLAT_VILLAGER_STAND_FRACTION;
      const progress = Math.min(path.toProgress, Math.max(path.fromProgress, v.fromProgress + s * (v.toProgress - v.fromProgress)));
      const across = Math.min(1, Math.max(-1, v.across));
      const offset = path.setback + across * path.halfWidth;
      flatLaneFrameInto(channel, progress, f);
      const d = path.side * (channel.width / 2 + offset);
      return Object.freeze({ villagerId: v.villagerId, x: f.cx + f.rx * d, z: f.cz + f.rz * d, scale: v.scale, hat: v.hat, side: path.side });
    }),
  );
}
