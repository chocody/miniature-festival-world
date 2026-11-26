import { MIN_TOUCH_TARGET_WORLD_RADIUS, TAP_PROXY_INRADIUS_RATIO } from "@/config/gimmicks.config";
import type { RIVER_ENVIRONMENT_PARTS } from "@/config/events/loyKrathong.river.config";
import type { ScenePartSpec } from "@/config/scene.config";
import type { WorldVec3 } from "@/core/coordinates";
import {
  bladeTuftExtent,
  type FoliageInstance,
  type FoliageOwnerRef,
  type HouseRoofKind,
  type RiverEnvironmentLayout,
  type RiversideFoliageLayout,
} from "@/core/world";
import { SCENE_OBJECT_NAMES } from "../sceneObjectNames";

/**
 * MFW-60: one invisible tap proxy per house, tree, bush, reed and rock (D3: small objects get a ≥ MIN_TOUCH_TARGET_PX disc). Every
 * value is derived at render time from the resolved layout and existing geometry constants: identified by kind + layout index, never
 * persisted (invariant A). MFW-58 can offset `center` per river stretch.
 */
export interface PropTapTarget {
  readonly kind: "house" | "tree" | "bush" | "reed" | "rock";
  readonly index: number; // layout index: houses[i], foliage.trunks[i] (= trees), bushes[i], foliage.plants[i], rocks[i]
  readonly name: string; // `${SCENE_OBJECT_NAMES.propTapPrefix}${kind}-${index}`
  readonly center: WorldVec3; // body-sphere centre = proxy position (world-view group space)
  readonly bodyRadius: number; // world units
  readonly proxyRadius: number; // circumradius of the unit icosahedron proxy, world units
}

/** Circumradius of an icosahedron proxy whose inscribed sphere covers both the touch target and the body. */
export function propTapProxyRadius(bodyRadius: number): number {
  return Math.max(MIN_TOUCH_TARGET_WORLD_RADIUS, bodyRadius) / TAP_PROXY_INRADIUS_RATIO;
}

type EnvironmentParts = Pick<typeof RIVER_ENVIRONMENT_PARTS, "houseBody" | "houseRoof" | "houseRoofGable" | "rock">;

function partTopY(part: ScenePartSpec): number {
  const g = part.geometry;
  const height = "height" in g ? g.height : 0;
  return part.yOffset + height / 2;
}

function target(kind: PropTapTarget["kind"], index: number, center: WorldVec3, bodyRadius: number): PropTapTarget {
  return Object.freeze({
    kind,
    index,
    name: `${SCENE_OBJECT_NAMES.propTapPrefix}${kind}-${index}`,
    center: Object.freeze(center),
    bodyRadius,
    proxyRadius: propTapProxyRadius(bodyRadius),
  });
}

/** Axis-aligned box over an owner's clumps (sphere radius = clump scale × (1 + lump)) plus an optional base point → centre + largest half-extent. */
export function foliageBody(
  clumps: readonly FoliageInstance[],
  owners: readonly FoliageOwnerRef[],
  kind: "tree" | "bush",
  index: number,
  lumpAmplitude: number,
  base: WorldVec3 | null,
): { center: WorldVec3; radius: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let found = false;
  for (let i = 0; i < clumps.length; i++) {
    if (owners[i]?.kind !== kind || owners[i].index !== index) continue;
    const c = clumps[i];
    const r = c.scale * (1 + lumpAmplitude);
    minX = Math.min(minX, c.position.x - r);
    minY = Math.min(minY, c.position.y - r);
    minZ = Math.min(minZ, c.position.z - r);
    maxX = Math.max(maxX, c.position.x + r);
    maxY = Math.max(maxY, c.position.y + r);
    maxZ = Math.max(maxZ, c.position.z + r);
    found = true;
  }
  if (!found) return null;
  if (base) {
    minX = Math.min(minX, base.x);
    minY = Math.min(minY, base.y);
    minZ = Math.min(minZ, base.z);
    maxX = Math.max(maxX, base.x);
    maxY = Math.max(maxY, base.y);
    maxZ = Math.max(maxZ, base.z);
  }
  return {
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
    radius: Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 2,
  };
}

/**
 * Body spheres (technical, from existing constants only): house = body box + roof top; tree / bush = the box over their FULL clumps
 * (+ the trunk base); reed = the blade tuft extent; rock = the rock radius. Order: houses, trees, bushes, reeds, rocks.
 */
export function buildPropTapTargets(
  layout: Pick<RiverEnvironmentLayout, "houses" | "bushes" | "rocks">,
  foliage: Pick<RiversideFoliageLayout, "trunks" | "clumps" | "clumpOwners" | "plants">,
  houseRoofKinds: readonly HouseRoofKind[],
  parts: EnvironmentParts,
  plantPart: ScenePartSpec,
  clumpLumpAmplitude: number,
): readonly PropTapTarget[] {
  const out: PropTapTarget[] = [];
  const body = parts.houseBody.geometry;
  const halfWidth = "width" in body ? body.width / 2 : 0;
  const halfDepth = "depth" in body ? body.depth / 2 : 0;
  layout.houses.forEach((h, i) => {
    const roofTop = partTopY(houseRoofKinds[i] === "gable" ? parts.houseRoofGable : parts.houseRoof);
    const s = h.scale;
    out.push(
      target("house", i, { x: h.position.x, y: h.position.y + (roofTop / 2) * s, z: h.position.z }, Math.max(halfWidth, halfDepth, roofTop / 2) * s),
    );
  });
  foliage.trunks.forEach((t, i) => {
    const b = foliageBody(foliage.clumps, foliage.clumpOwners, "tree", i, clumpLumpAmplitude, t.position);
    if (b) out.push(target("tree", i, b.center, b.radius));
  });
  layout.bushes.forEach((_, j) => {
    const b = foliageBody(foliage.clumps, foliage.clumpOwners, "bush", j, clumpLumpAmplitude, null);
    if (b) out.push(target("bush", j, b.center, b.radius));
  });
  if (plantPart.geometry.kind === "bladeTuft") {
    const ext = bladeTuftExtent(plantPart.geometry.blades);
    foliage.plants.forEach((p, i) => {
      const s = p.scale;
      out.push(
        target(
          "reed",
          i,
          { x: p.position.x, y: p.position.y + (plantPart.yOffset + ext.topY / 2) * s, z: p.position.z },
          Math.max(ext.footprintRadius, ext.topY / 2) * s,
        ),
      );
    });
  }
  const rockGeometry = parts.rock.geometry;
  const rockRadius = "radius" in rockGeometry ? rockGeometry.radius : 0;
  layout.rocks.forEach((r, i) => {
    out.push(target("rock", i, { x: r.position.x, y: r.position.y + parts.rock.yOffset * r.scale, z: r.position.z }, rockRadius * r.scale));
  });
  return Object.freeze(out);
}
