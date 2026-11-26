// @vitest-environment node
import { describe, expect, it } from "vitest";
import { OrthographicCamera, Vector3 } from "three";
import { createPartGeometry, countTriangles } from "@/components/canvas3d/geometry";
import { CAMERA_FLIGHT_OFFSET, SCENE_CAMERA_FAR, SCENE_CAMERA_NEAR, SCENE_CAMERA_ZOOM } from "@/config/camera.config";
import {
  HOUSE_FACADE,
  LOY_KRATHONG_BUSH_CLUMPS,
  LOY_KRATHONG_RIVER_ENVIRONMENT,
  LOY_KRATHONG_RIVER_LANE_WIDTH,
  LOY_KRATHONG_RIVER_LANES,
  LOY_KRATHONG_RIVERSIDE_PLANTS,
  LOY_KRATHONG_TREE_SHAPES,
  LOY_KRATHONG_TREES,
  RIVER_BANK_PROFILE,
  RIVER_FOLIAGE_PARTS,
  RIVER_FOLIAGE_SWAY,
  PIER_DECK_MATERIAL,
  PIER_PILE_MATERIAL,
  RIVER_BANK_MATERIAL,
  RIVER_ENVIRONMENT_PARTS,
  LOY_KRATHONG_PIER,
} from "@/config/events/loyKrathong.river.config";
import { PINCH_ZOOM_MIN } from "@/config/interaction.config";
import { KRATHONG_FLAME_MODEL } from "@/config/krathongModel.config";
import {
  LIGHT_PRESET_IDS,
  LIGHT_PRESETS,
  LOOK_MIN_ALBEDO_LUMINANCE,
  LOOK_MIN_LIT_LUMINANCE,
  VILLAGE_LIGHTS,
  type LightPresetId,
} from "@/config/look.config";
import {
  ENVIRONMENT_PART_MAX_TRIANGLES,
  TOY_MATTE_MATERIALS,
  type MatteMaterialSpec,
  type PartGeometrySpec,
  type ScenePartSpec,
} from "@/config/scene.config";
import { acrossOf, createEndlessRiverFrame, createRiverLane, locateOnEndlessLane, locateOnLane, splineProgressToWorld, type WorldVec3 } from "@/core/coordinates";
import { getFramedCameraZoom } from "@/core/camera";
import { relativeLuminance } from "@/core/math/relativeLuminance";
import { FOLIAGE_TIERS, type RenderTier } from "@/config/performance.config";
import {
  TREE_SHAPE_IDS,
  bankSurfaceY,
  bladeTuftExtent,
  estimateLitLuminance,
  foliageClumpsExtent,
  type InstanceTransform,
  type Vec3Tuple,
} from "@/core/world";
import { LOY_KRATHONG_RIVER_FOLIAGE as foliage, LOY_KRATHONG_RIVER_LAYOUT as layout, foliageForTier } from "./riverLayout";

const parts = RIVER_ENVIRONMENT_PARTS;
const lanes = LOY_KRATHONG_RIVER_LANES.map((def) => createRiverLane(def));
const HALF = 0.5;
const SAMPLES = 64;
/** Leaf clump lump amplitude: a clump instance reaches scale × (1 + A) from its centre (MFW-70). */
const A = parts.leafClump.geometry.lumpAmplitude;
const tuft = bladeTuftExtent(parts.riversidePlant.geometry.blades);

function footprintRadius(g: PartGeometrySpec): number {
  switch (g.kind) {
    case "box": return Math.hypot(g.width, g.depth) / 2;
    case "roundedBox": return Math.hypot(g.width, g.depth) / 2;
    case "cone": return g.radius;
    case "cylinder": return Math.max(g.radiusTop, g.radiusBottom);
    case "icosahedron": return g.radius;
    case "gable": return Math.hypot(g.width, g.depth) / 2;
    case "leafClump": return 1 + g.lumpAmplitude;
    case "trunk": return g.radiusBottom;
    case "bladeTuft": return bladeTuftExtent(g.blades).footprintRadius;
  }
}
function topY(part: ScenePartSpec): number {
  const g = part.geometry;
  switch (g.kind) {
    case "icosahedron": return part.yOffset + g.radius * (g.scaleY ?? 1);
    case "leafClump": return part.yOffset + 1 + g.lumpAmplitude;
    case "trunk": return part.yOffset + g.height;
    case "bladeTuft": return part.yOffset + bladeTuftExtent(g.blades).topY;
    default: return part.yOffset + g.height / 2;
  }
}
const at = (t: InstanceTransform, height: number): WorldVec3 => ({
  x: t.position.x,
  y: t.position.y + height * t.scale,
  z: t.position.z,
});

function makeCamera(width: number, height: number, factor: number, zoom: number = SCENE_CAMERA_ZOOM): OrthographicCamera {
  const camera = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, SCENE_CAMERA_NEAR, SCENE_CAMERA_FAR);
  camera.zoom = zoom * factor;
  camera.position.set(...CAMERA_FLIGHT_OFFSET);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return camera;
}
const ndc = (camera: OrthographicCamera, p: WorldVec3) => new Vector3(p.x, p.y, p.z).project(camera);
const onScreen = (v: Vector3) => Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
/** MFW-58: the endless stretch frame (the ground strips' straight outer edge is at ±outerAcross from its axis). */
const STRETCH_FRAME = createEndlessRiverFrame(LOY_KRATHONG_RIVER_ENVIRONMENT.channel.controlPoints);
/** Inner edge of the ground strips (lateral from the centreline): the banks' outer edge pulled in by holeMargin. */
const GROUND_INNER_LATERAL =
  layout.channel.width / 2 + LOY_KRATHONG_RIVER_ENVIRONMENT.bankWidth - LOY_KRATHONG_RIVER_ENVIRONMENT.ground.holeMargin;

describe("river layout", () => {
  it("has houses, trees, lamps and a pier", () => {
    expect(layout.houses.length).toBeGreaterThanOrEqual(1);
    expect(layout.trees.length).toBeGreaterThanOrEqual(1);
    expect(layout.lamps.length).toBeGreaterThanOrEqual(1);
    expect(layout.pier.piles).toHaveLength(2 * LOY_KRATHONG_PIER.pileAlongFractions.length);
    expect(parts.pierPile.geometry.height).toBeCloseTo(layout.pier.pileHeight);
  });

  it("lanes stay inside the channel", () => {
    for (const lane of lanes) {
      for (let i = 0; i <= SAMPLES; i++) {
        const p = splineProgressToWorld(lane, i / SAMPLES, 0);
        for (const sign of [-1, 1]) {
          const d = (sign * lane.width) / 2;
          const edge = { x: p.centerline.x + p.right.x * d, z: p.centerline.z + p.right.z * d };
          expect(Math.abs(locateOnLane(layout.channel, edge).lateralOffset)).toBeLessThanOrEqual(HALF + 1e-9);
        }
      }
    }
  });

  it("pier stops before the lanes", () => {
    for (const lane of lanes) {
      expect(Math.abs(locateOnLane(lane, layout.pier.tip).lateralOffset) * lane.width).toBeGreaterThanOrEqual(lane.width / 2);
    }
  });

  it("release point is on a lane", () => {
    const hit = lanes.some((lane) => {
      const loc = locateOnLane(lane, layout.pier.releasePoint);
      return Math.abs(loc.lateralOffset) <= HALF && loc.progress > 0 && loc.progress < 1;
    });
    expect(hit).toBe(true);
  });

  it("props stay on the banks", () => {
    const groups = [
      { list: layout.houses, part: parts.houseBody },
      { list: layout.housesByRoof.gable, part: parts.houseRoofGable },
      { list: layout.rocks, part: parts.rock },
      { list: layout.lamps, part: parts.lampPost },
    ];
    for (const { list, part } of groups) {
      for (const t of list) {
        const lat = Math.abs(locateOnLane(layout.channel, t.position).lateralOffset) * layout.channel.width;
        expect(lat).toBeGreaterThanOrEqual(layout.channel.width / 2 + footprintRadius(part.geometry) * t.scale);
      }
    }
    // MFW-70: every leaf clump (tree crowns and bushes) stays over the bank.
    for (const c of foliage.clumps) {
      const lat = Math.abs(locateOnLane(layout.channel, c.position).lateralOffset) * layout.channel.width;
      expect(lat - c.scale * (1 + A)).toBeGreaterThanOrEqual(layout.channel.width / 2);
    }
    // Reeds may lean over the water edge, but never over the krathong lane.
    for (const p of foliage.plants) {
      const lat = Math.abs(locateOnLane(layout.channel, p.position).lateralOffset) * layout.channel.width;
      expect(lat - tuft.footprintRadius * p.scale).toBeGreaterThanOrEqual(LOY_KRATHONG_RIVER_LANE_WIDTH / 2);
    }
  });

  it("solid props never hide a lane in the default view", () => {
    const f = new Vector3(...CAMERA_FLIGHT_OFFSET).negate().normalize();
    const solids = [
      ...layout.housesByRoof.pyramid.map((t) => ({ t, top: topY(parts.houseRoof), r: footprintRadius(parts.houseBody.geometry) })),
      ...layout.housesByRoof.gable.map((t) => ({
        t,
        top: topY(parts.houseRoofGable),
        r: footprintRadius(parts.houseRoofGable.geometry),
      })),
      // MFW-70: each leaf clump (top = centre + scale·(1 + A)) and each reed / grass tuft.
      ...foliage.clumps.map((t) => ({ t, top: 1 + A, r: 1 + A })),
      ...foliage.plants.map((t) => ({ t, top: topY(parts.riversidePlant), r: tuft.footprintRadius })),
      ...layout.rocks.map((t) => ({ t, top: topY(parts.rock), r: footprintRadius(parts.rock.geometry) })),
    ];
    for (const { t, top, r } of solids) {
      const tip = at(t, top);
      const step = (tip.y - layout.waterSurfaceY) / -f.y;
      const hit = { x: tip.x + f.x * step, z: tip.z + f.z * step };
      for (const lane of lanes) {
        const lat = Math.abs(locateOnLane(lane, hit).lateralOffset) * lane.width;
        expect(lat - lane.width / 2).toBeGreaterThanOrEqual(r * t.scale);
      }
    }
  });

  it("default mobile view shows each prop kind", () => {
    const camera = makeCamera(320, 256, 1);
    const visible = (list: readonly InstanceTransform[], part: ScenePartSpec) =>
      list.some((t) => onScreen(ndc(camera, at(t, part.yOffset))));
    expect(visible(layout.houses, parts.houseBody)).toBe(true);
    expect(foliage.clumps.some((c) => onScreen(ndc(camera, c.position)))).toBe(true); // MFW-70: trees = leaf clumps
    expect(foliage.plants.some((p) => onScreen(ndc(camera, p.position)))).toBe(true);
    expect(visible(layout.lamps, parts.lampHead)).toBe(true);
    expect(onScreen(ndc(camera, layout.pier.tip))).toBe(true);
  });

  it("visible props are inside the near/far planes", () => {
    for (const [w, h] of [[320, 256], [704, 256]]) {
      for (const factor of [1, PINCH_ZOOM_MIN]) {
        const camera = makeCamera(w, h, factor);
        const points: WorldVec3[] = [layout.pier.tip, layout.pier.deckCenter, layout.pier.releasePoint];
        const groups: [readonly InstanceTransform[], ScenePartSpec][] = [
          [layout.houses, parts.houseRoof],
          [layout.lamps, parts.lampHead],
        ];
        for (const [list, part] of groups) {
          for (const t of list) points.push(at(t, 0), at(t, topY(part)));
        }
        for (const c of foliage.clumps) points.push(at(c, -(1 + A)), at(c, 1 + A)); // MFW-70 tree crowns
        for (const p of points) {
          const v = ndc(camera, p);
          if (onScreen(v)) {
            expect(v.z).toBeGreaterThanOrEqual(-1);
            expect(v.z).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it("every part is low-poly", () => {
    for (const part of Object.values(parts)) {
      expect(countTriangles(createPartGeometry(part.geometry))).toBeLessThanOrEqual(ENVIRONMENT_PART_MAX_TRIANGLES);
    }
  });

  const environmentMaterials = (): Pick<MatteMaterialSpec, "color" | "emissive" | "emissiveIntensity">[] => [
    ...Object.values(parts).map((p) => p.material),
    RIVER_BANK_MATERIAL,
    PIER_DECK_MATERIAL,
    PIER_PILE_MATERIAL,
    TOY_MATTE_MATERIALS.water,
  ];
  const UP: Vec3Tuple = [0, 1, 0];
  const sideLength = Math.hypot(CAMERA_FLIGHT_OFFSET[0], CAMERA_FLIGHT_OFFSET[2]);
  const SIDE: Vec3Tuple = [CAMERA_FLIGHT_OFFSET[0] / sideLength, 0, CAMERA_FLIGHT_OFFSET[2] / sideLength];

  it("environment is readable in both presets (AC3)", () => {
    for (const id of LIGHT_PRESET_IDS) {
      for (const m of environmentMaterials()) {
        for (const normal of [UP, SIDE]) {
          expect(estimateLitLuminance(m.color, LIGHT_PRESETS[id], normal), `${id} ${m.color} ${normal}`).toBeGreaterThanOrEqual(
            LOOK_MIN_LIT_LUMINANCE,
          );
        }
      }
    }
    // Positive control: the MFW-27 night house under the MFW-27 rig fails the guard.
    const oldRig = {
      hemisphere: { skyColor: "#000000", groundColor: "#000000", intensity: 0 },
      ambient: { color: "#8499c5", intensity: 0.75 },
      key: { ...LIGHT_PRESETS.NIGHT.key, color: "#bdceff", intensity: 1.15, position: [-4, 7, 3] as [number, number, number] },
    };
    for (const normal of [UP, SIDE]) {
      expect(estimateLitLuminance("#4a3628", oldRig, normal)).toBeLessThan(LOOK_MIN_LIT_LUMINANCE);
    }
  });

  /** Runtime emissive intensity per preset: village windows and lanterns follow VILLAGE_LIGHTS (MFW-49), others their spec. */
  const runtimeEmissive = (m: Pick<MatteMaterialSpec, "emissiveIntensity">, id: LightPresetId): number => {
    if (m === parts.houseWindow.material) return VILLAGE_LIGHTS[id].windowEmissiveIntensity;
    if (m === parts.lampHead.material) return VILLAGE_LIGHTS[id].lanternEmissiveIntensity;
    return m.emissiveIntensity ?? 1;
  };

  it("krathong flame is the brightest surface in both presets", () => {
    for (const id of LIGHT_PRESET_IDS) {
      const flame = relativeLuminance(KRATHONG_FLAME_MODEL.emissive) * LIGHT_PRESETS[id].flame.emissiveIntensity;
      const brightest = Math.max(
        ...environmentMaterials().map(
          (m) =>
            estimateLitLuminance(m.color, LIGHT_PRESETS[id], UP) +
            (m.emissive ? relativeLuminance(m.emissive) * runtimeEmissive(m, id) : 0),
        ),
      );
      expect(flame, id).toBeGreaterThan(brightest);
    }
  });

  it("pastel albedo: no near-black environment colour", () => {
    for (const m of environmentMaterials()) {
      expect(relativeLuminance(m.color), m.color).toBeGreaterThanOrEqual(LOOK_MIN_ALBEDO_LUMINANCE);
    }
  });

  it("rounded clay rule: bevelled house bodies, smooth-shaded curved parts", () => {
    const body = parts.houseBody.geometry;
    expect(body.kind).toBe("roundedBox");
    if (body.kind === "roundedBox") expect(body.radius).toBeGreaterThan(0);
    const all: ScenePartSpec[] = Object.values(parts);
    for (const part of all) {
      const g = part.geometry;
      const curved =
        g.kind === "cylinder" ||
        g.kind === "roundedBox" ||
        g.kind === "leafClump" ||
        g.kind === "trunk" ||
        g.kind === "bladeTuft" ||
        (g.kind === "icosahedron" && (g.detail ?? 0) >= 1);
      if (curved) expect(part.material.flatShading, JSON.stringify(g)).toBe(false);
    }
  });

  it("materials are matte", () => {
    const materials = [...Object.values(parts).map((p) => p.material), RIVER_BANK_MATERIAL, PIER_DECK_MATERIAL, PIER_PILE_MATERIAL];
    for (const m of materials) {
      expect(m.roughness).toBe(1);
      expect(m.metalness).toBe(0);
    }
  });

  // ---- MFW-49 riverside v2 ----

  it("R1: the ground covers every on-screen ground point", () => {
    const views: [number, number, number][] = [
      [320, 256, SCENE_CAMERA_ZOOM],
      [704, 256, SCENE_CAMERA_ZOOM],
      [390, 844, getFramedCameraZoom({ width: 390, height: 844 })], // MFW-54 full-screen framed zoom
      [1440, 900, getFramedCameraZoom({ width: 1440, height: 900 })],
      [360, 640, getFramedCameraZoom({ width: 360, height: 640 })],
    ];
    const GRID = 5;
    for (const [w, h, zoom] of views) {
      for (const factor of [1, PINCH_ZOOM_MIN]) {
        const camera = makeCamera(w, h, factor, zoom);
        const ndcs: [number, number][] = [];
        for (let i = 0; i < GRID; i++) {
          for (let j = 0; j < GRID; j++) ndcs.push([-1 + (2 * i) / (GRID - 1), -1 + (2 * j) / (GRID - 1)]);
        }
        for (const [x, y] of ndcs) {
          const near = new Vector3(x, y, -1).unproject(camera);
          const far = new Vector3(x, y, 1).unproject(camera);
          const dir = far.clone().sub(near);
          const t = (layout.ground.y - near.y) / dir.y;
          const hit = near.clone().addScaledVector(dir, t);
          const depth = hit.clone().applyMatrix4(camera.matrixWorldInverse).z * -1;
          if (depth < SCENE_CAMERA_NEAR) continue;
          // MFW-58: inside the ground band of the endless river (the strips of this stretch or a neighbour copy, which join).
          const across = Math.abs(acrossOf(STRETCH_FRAME, hit.x, hit.z));
          expect(across, `${w}x${h} ${factor} ${x},${y}`).toBeLessThanOrEqual(layout.ground.outerAcross);
          // Between the strips (the hole under the river) the point is under the water or a bank (MFW-49 hole design).
          const lateral = Math.abs(locateOnEndlessLane(layout.channel, STRETCH_FRAME, hit).lateralOffset) * layout.channel.width;
          if (lateral < GROUND_INNER_LATERAL) {
            expect(lateral).toBeLessThanOrEqual(layout.channel.width / 2 + LOY_KRATHONG_RIVER_ENVIRONMENT.bankWidth);
          }
        }
      }
    }
  });

  it("R2: the ground lies below the water", () => {
    expect(layout.ground.y).toBeLessThan(layout.waterSurfaceY);
  });

  it("R2b: the hole between the ground strips stays under the water and banks, deep enough that no gap shows under a bank edge", () => {
    const def = LOY_KRATHONG_RIVER_ENVIRONMENT;
    // A camera ray can pass under the highest bank edge by at most (edge height − ground y) / tan(camera elevation).
    const elevation = Math.atan2(CAMERA_FLIGHT_OFFSET[1], Math.hypot(CAMERA_FLIGHT_OFFSET[0], CAMERA_FLIGHT_OFFSET[2]));
    const step = Math.max(...def.bankProfile.map((p) => p.y)) - layout.ground.y;
    expect(def.ground.holeMargin).toBeGreaterThanOrEqual(step / Math.tan(elevation));
    // MFW-58: the strips' inner vertices (the hole edge) lie under the banks, holeMargin inside their outer edge.
    const strips = layout.ground.strips;
    const n = layout.ribbonSegments;
    const innerVertices = [...Array.from({ length: n + 1 }, (_, i) => 2 * i + 1), ...Array.from({ length: n + 1 }, (_, i) => 2 * (n + 1) + 2 * i)];
    for (const k of innerVertices) {
      const p = { x: strips.positions[k * 3], z: strips.positions[k * 3 + 2] };
      const lateral = Math.abs(locateOnLane(layout.channel, p).lateralOffset) * layout.channel.width;
      expect(lateral + def.ground.holeMargin).toBeLessThanOrEqual(layout.channel.width / 2 + def.bankWidth + 1e-4);
      expect(Math.abs(acrossOf(STRETCH_FRAME, p.x, p.z))).toBeLessThan(layout.ground.outerAcross);
    }
  });

  it("R3: every prop base sits on the bank profile", () => {
    const def = LOY_KRATHONG_RIVER_ENVIRONMENT;
    const lists: [readonly { readonly setback: number }[], readonly InstanceTransform[]][] = [
      [def.houses, layout.houses],
      [def.trees, layout.trees],
      [def.bushes, layout.bushes],
      [def.rocks, layout.rocks],
      [def.lamps, layout.lamps],
    ];
    for (const [placements, transforms] of lists) {
      placements.forEach((p, i) => expect(transforms[i].position.y).toBeCloseTo(bankSurfaceY(layout.bankProfile, p.setback), 9));
    }
  });

  it("R4: several houses with both roof kinds in different colours", () => {
    expect(layout.houses.length).toBeGreaterThanOrEqual(5);
    expect(layout.housesByRoof.pyramid.length).toBeGreaterThan(0);
    expect(layout.housesByRoof.gable.length).toBeGreaterThan(0);
    expect(parts.houseRoof.material.color).not.toBe(parts.houseRoofGable.material.color);
  });

  it("R5: one door and two windows on each house's front face", () => {
    expect(layout.houseDoors).toHaveLength(layout.houses.length);
    expect(layout.houseWindows).toHaveLength(HOUSE_FACADE.windows.length * layout.houses.length);
    expect(HOUSE_FACADE.windows).toHaveLength(2);
    layout.houses.forEach((house, h) => {
      HOUSE_FACADE.windows.forEach((w, k) => {
        const win = layout.houseWindows[h * HOUSE_FACADE.windows.length + k];
        const dx = win.position.x - house.position.x;
        const dz = win.position.z - house.position.z;
        // Un-rotate by the house yaw: local z = dx sin θ + dz cos θ.
        const localZ = dx * Math.sin(house.yawRad) + dz * Math.cos(house.yawRad);
        const localX = dx * Math.cos(house.yawRad) - dz * Math.sin(house.yawRad);
        expect(localZ).toBeCloseTo(w.z * house.scale, 9);
        expect(localX).toBeCloseTo(w.x * house.scale, 9);
        // The front face of the body is at local z = depth / 2.
        const body = parts.houseBody.geometry;
        if (body.kind === "roundedBox") expect(w.z).toBeGreaterThanOrEqual(body.depth / 2);
      });
    });
  });

  it("R6: the walking paths are clear of every prop and of the pier", () => {
    const def = LOY_KRATHONG_RIVER_ENVIRONMENT;
    const lampHead = parts.lampHead.geometry;
    const lampR = lampHead.kind === "icosahedron" ? lampHead.radius : 0;
    const props: { readonly side: number; readonly setback: number; readonly r: number }[] = [
      ...def.houses.map((p) => ({ ...p, r: footprintRadius(parts.houseBody.geometry) * p.scale })),
      ...LOY_KRATHONG_TREES.map((p) => ({
        ...p,
        r: foliageClumpsExtent(LOY_KRATHONG_TREE_SHAPES[p.shape].clumps, A).footprintRadius * p.scale,
      })),
      ...def.bushes.map((p) => ({ ...p, r: foliageClumpsExtent(LOY_KRATHONG_BUSH_CLUMPS, A).footprintRadius * p.scale })),
      ...LOY_KRATHONG_RIVERSIDE_PLANTS.map((p) => ({ ...p, r: tuft.footprintRadius * p.scale })), // FULL blades
      ...def.rocks.map((p) => ({ ...p, r: footprintRadius(parts.rock.geometry) * p.scale })),
      ...def.lamps.map((p) => ({ ...p, r: lampR * p.scale })),
    ];
    expect(layout.paths.length).toBeGreaterThanOrEqual(2);
    expect(new Set(layout.paths.map((p) => p.side))).toEqual(new Set([-1, 1]));
    for (const path of layout.paths) {
      const lo = path.setback - path.halfWidth;
      const hi = path.setback + path.halfWidth;
      for (const p of props.filter((q) => q.side === path.side)) {
        const overlaps = p.setback + p.r > lo && p.setback - p.r < hi;
        expect(overlaps, `path ${path.pathId} vs prop at setback ${p.setback}`).toBe(false);
      }
      if (path.side === LOY_KRATHONG_PIER.side) expect(LOY_KRATHONG_PIER.onBankLength).toBeLessThan(lo);
    }
  });

  it("R7: canopies are leaf-clump clusters on bent, tapered, branched trunks (MFW-70 AC1)", () => {
    expect(new Set(LOY_KRATHONG_TREES.map((t) => t.shape))).toEqual(new Set(TREE_SHAPE_IDS));
    expect(LOY_KRATHONG_RIVER_ENVIRONMENT.trees).toBe(LOY_KRATHONG_TREES);
    for (const id of TREE_SHAPE_IDS) {
      const { clumps } = LOY_KRATHONG_TREE_SHAPES[id];
      expect(clumps.length, id).toBeGreaterThanOrEqual(3);
      expect(new Set(clumps.map((c) => c.radius)).size, id).toBeGreaterThanOrEqual(2);
      expect(clumps.some((c) => Math.hypot(c.x, c.z) > 0), id).toBe(true); // broken silhouette
      clumps.forEach((c, i) => {
        const overlaps = clumps.some(
          (o, j) => j !== i && Math.hypot(c.x - o.x, c.y - o.y, c.z - o.z) < c.radius + o.radius,
        );
        expect(overlaps, `${id} clump ${i}`).toBe(true);
      });
    }
    const ratio = (id: "round" | "tall") => {
      const e = foliageClumpsExtent(LOY_KRATHONG_TREE_SHAPES[id].clumps, A);
      return e.topY / e.footprintRadius;
    };
    expect(ratio("tall")).toBeGreaterThan(ratio("round"));
    const full = RIVER_FOLIAGE_PARTS.FULL.treeTrunk.geometry;
    const light = RIVER_FOLIAGE_PARTS.LIGHT.treeTrunk.geometry;
    if (full.kind !== "trunk" || light.kind !== "trunk") throw new Error("tree trunks are expected to be trunk geometry");
    expect(full.radiusTop).toBeLessThan(full.radiusBottom);
    expect(full.bend).toBeGreaterThan(0);
    expect(full.branches.length).toBeGreaterThanOrEqual(1);
    expect(full.branches.length).toBeLessThanOrEqual(2);
    expect(light.branches.length).toBeGreaterThanOrEqual(1);
    expect(foliage.clumpsLow.length).toBeLessThan(foliage.clumps.length);
    for (const id of TREE_SHAPE_IDS) expect(LOY_KRATHONG_TREE_SHAPES[id].clumps.some((c) => c.keepOnLow), id).toBe(true);
    expect(LOY_KRATHONG_BUSH_CLUMPS.some((c) => c.keepOnLow)).toBe(true);
    expect(layout.bushes.length).toBeGreaterThan(0);
    expect(layout.rocks.length).toBeGreaterThan(0);
  });

  it("R8: every new part is low-poly", () => {
    for (const part of [
      parts.houseRoofGable,
      parts.houseDoor,
      parts.houseWindow,
      parts.leafClump,
      parts.riversidePlant,
      parts.treeTrunk,
      parts.rock,
    ]) {
      expect(countTriangles(createPartGeometry(part.geometry))).toBeLessThanOrEqual(ENVIRONMENT_PART_MAX_TRIANGLES);
    }
  });

  it("R9: the village is lit at NIGHT and off at DAY", () => {
    expect(VILLAGE_LIGHTS.DAY).toEqual({ windowEmissiveIntensity: 0, lanternEmissiveIntensity: 0 });
    expect(VILLAGE_LIGHTS.NIGHT.windowEmissiveIntensity).toBeGreaterThan(0);
    expect(VILLAGE_LIGHTS.NIGHT.lanternEmissiveIntensity).toBeGreaterThan(0);
  });

  it("R10: riverside plants sit at the water edge, off the lane and off the pier (MFW-70 AC2)", () => {
    for (const side of [-1, 1]) {
      expect(
        LOY_KRATHONG_RIVERSIDE_PLANTS.some((p) => p.side === side && p.setback < RIVER_BANK_PROFILE[2].offset),
        `side ${side}`,
      ).toBe(true);
    }
    const { deckCenter, yawRad, width, length } = layout.pier;
    foliage.plants.forEach((p, i) => {
      const r = tuft.footprintRadius * p.scale;
      const dx = p.position.x - deckCenter.x;
      const dz = p.position.z - deckCenter.z;
      const lz = dx * Math.sin(yawRad) + dz * Math.cos(yawRad);
      const lx = dx * Math.cos(yawRad) - dz * Math.sin(yawRad);
      expect(Math.abs(lx) >= width / 2 + r || Math.abs(lz) >= length / 2 + r, `plant ${i}`).toBe(true);
    });
  });

  it("R11: the foliage sway parameters are sane (MFW-70 AC4)", () => {
    for (const sway of [RIVER_FOLIAGE_SWAY.leafClump, RIVER_FOLIAGE_SWAY.riversidePlant]) {
      expect(Number.isFinite(sway.shear)).toBe(true);
      expect(sway.shear).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(sway.periodMs)).toBe(true);
      expect(sway.periodMs).toBeGreaterThan(0);
      expect(Math.hypot(sway.windDirX, sway.windDirZ)).toBeCloseTo(1, 9);
    }
    expect(Number.isFinite(RIVER_FOLIAGE_SWAY.phaseStepRad)).toBe(true);
  });
});

describe("MFW-70 foliage", () => {
  const TIERS: readonly RenderTier[] = ["HIGH", "MEDIUM", "LOW"];

  it.each(TIERS)("%s: foliageForTier picks the tier's variant, clumps and sway", (tier) => {
    const view = foliageForTier(foliage, tier);
    const { variant, sway } = FOLIAGE_TIERS[tier];
    expect(view.parts).toBe(RIVER_FOLIAGE_PARTS[variant]);
    expect(view.clumps).toBe(variant === "FULL" ? foliage.clumps : foliage.clumpsLow);
    expect(view.trunks).toBe(foliage.trunks);
    expect(view.plants).toBe(foliage.plants);
    expect(view.sway).toBe(sway);
  });

  it("HIGH and MEDIUM draw the FULL variant and sway; LOW draws the LIGHT variant, static", () => {
    expect(foliageForTier(foliage, "HIGH").parts).toBe(RIVER_FOLIAGE_PARTS.FULL);
    expect(foliageForTier(foliage, "MEDIUM").clumps).toBe(foliage.clumps);
    expect(foliageForTier(foliage, "LOW").parts).toBe(RIVER_FOLIAGE_PARTS.LIGHT);
    expect(foliageForTier(foliage, "LOW").clumps).toBe(foliage.clumpsLow);
    expect(foliageForTier(foliage, "LOW").sway).toBe(false);
    expect(foliageForTier(foliage, "HIGH").sway).toBe(true);
  });
});

describe("MFW-58 stretch extent and scenery top", () => {
  it("the prop margin is at least every prop's footprint radius", async () => {
    const { RIVER_STRETCH_PROP_MARGIN } = await import("./riverLayout");
    const { LOY_KRATHONG_TREE_SHAPES, LOY_KRATHONG_BUSH_CLUMPS, LOY_KRATHONG_RIVER_FOLIAGE_DEFINITION } = await import(
      "@/config/events/loyKrathong.river.config"
    );
    const { TREE_SHAPE_IDS, foliageClumpsExtent } = await import("@/core/world");
    const { VILLAGER_FOOTPRINT_RADIUS } = await import("@/config/events/loyKrathong.life.config");
    const def = LOY_KRATHONG_RIVER_ENVIRONMENT;
    const maxScale = Math.max(...[def.houses, def.trees, def.bushes, def.rocks, def.lamps].flatMap((l) => l.map((p) => p.scale)));
    const gable = parts.houseRoofGable.geometry as { width: number; depth: number };
    const body = parts.houseBody.geometry as { width: number; depth: number };
    const footprints = [
      Math.hypot(gable.width / 2, gable.depth / 2) * maxScale,
      Math.hypot(body.width / 2, body.depth / 2) * maxScale,
      ...TREE_SHAPE_IDS.map(
        (id) => foliageClumpsExtent(LOY_KRATHONG_TREE_SHAPES[id].clumps, LOY_KRATHONG_RIVER_FOLIAGE_DEFINITION.clumpLumpAmplitude).footprintRadius * maxScale,
      ),
      foliageClumpsExtent(LOY_KRATHONG_BUSH_CLUMPS, LOY_KRATHONG_RIVER_FOLIAGE_DEFINITION.clumpLumpAmplitude).footprintRadius * maxScale,
      VILLAGER_FOOTPRINT_RADIUS * 2,
    ];
    for (const f of footprints) expect(f).toBeLessThanOrEqual(RIVER_STRETCH_PROP_MARGIN);
  });

  it("getRiverSceneryTopY is above the banks and the villagers' heads, and cached", async () => {
    const { getRiverSceneryTopY } = await import("./riverLayout");
    const { VILLAGER_HEIGHT } = await import("@/config/events/loyKrathong.life.config");
    expect(getRiverSceneryTopY()).toBe(getRiverSceneryTopY());
    expect(getRiverSceneryTopY()).toBeGreaterThan(layout.bankTopY + VILLAGER_HEIGHT);
  });
});
