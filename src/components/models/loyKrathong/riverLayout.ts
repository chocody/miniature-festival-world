import { LOY_KRATHONG_RIVER_ENVIRONMENT } from "@/config/events/loyKrathong.river.config";
import { resolveRiverEnvironment, type InstanceTransform, type RiverEnvironmentLayout } from "@/core/world";

/** Resolved once when the lazy scene chunk loads (deterministic, no I/O). */
export const LOY_KRATHONG_RIVER_LAYOUT: RiverEnvironmentLayout = resolveRiverEnvironment(LOY_KRATHONG_RIVER_ENVIRONMENT);

/** World position of a lamp's head (centre of the glow shell and of the tap proxy). Render-time only. */
export function lampHeadPosition(lamp: InstanceTransform, headYOffset: number): readonly [number, number, number] {
  return [lamp.position.x, lamp.position.y + headYOffset * lamp.scale, lamp.position.z];
}

/** R3F gives `instanceId` for InstancedMesh hits; anything else (or out of range) falls back to lamp 0. */
export function lampIndexFromInstanceId(instanceId: number | undefined, lampCount: number): number {
  return instanceId !== undefined && Number.isInteger(instanceId) && instanceId >= 0 && instanceId < lampCount
    ? instanceId
    : 0;
}
