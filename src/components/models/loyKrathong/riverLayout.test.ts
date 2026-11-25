// @vitest-environment node
import { describe, expect, it } from "vitest";
import { OrthographicCamera, Vector3 } from "three";
import { createPartGeometry, countTriangles } from "@/components/canvas3d/geometry";
import { CAMERA_FLIGHT_OFFSET, SCENE_CAMERA_FAR, SCENE_CAMERA_NEAR, SCENE_CAMERA_ZOOM } from "@/config/camera.config";
import {
  LOY_KRATHONG_RIVER_LANES,
  PIER_DECK_MATERIAL,
  PIER_PILE_MATERIAL,
  RIVER_BANK_MATERIAL,
  RIVER_ENVIRONMENT_PARTS,
  LOY_KRATHONG_PIER,
} from "@/config/events/loyKrathong.river.config";
import { PINCH_ZOOM_MIN } from "@/config/interaction.config";
import { KRATHONG_FLAME_MODEL } from "@/config/krathongModel.config";
import { LIGHT_PRESET_IDS, LIGHT_PRESETS, LOOK_MIN_ALBEDO_LUMINANCE, LOOK_MIN_LIT_LUMINANCE } from "@/config/look.config";
import {
  ENVIRONMENT_PART_MAX_TRIANGLES,
  TOY_MATTE_MATERIALS,
  type MatteMaterialSpec,
  type PartGeometrySpec,
  type ScenePartSpec,
} from "@/config/scene.config";
import { createRiverLane, locateOnLane, splineProgressToWorld, type WorldVec3 } from "@/core/coordinates";
import { relativeLuminance } from "@/core/math/relativeLuminance";
import { estimateLitLuminance, type InstanceTransform, type Vec3Tuple } from "@/core/world";
import { LOY_KRATHONG_RIVER_LAYOUT as layout } from "./riverLayout";

const parts = RIVER_ENVIRONMENT_PARTS;
const lanes = LOY_KRATHONG_RIVER_LANES.map((def) => createRiverLane(def));
const HALF = 0.5;
const SAMPLES = 64;

function footprintRadius(g: PartGeometrySpec): number {
  switch (g.kind) {
    case "box": return Math.hypot(g.width, g.depth) / 2;
    case "roundedBox": return Math.hypot(g.width, g.depth) / 2;
    case "cone": return g.radius;
    case "cylinder": return Math.max(g.radiusTop, g.radiusBottom);
    case "icosahedron": return g.radius;
  }
}
function topY(part: ScenePartSpec): number {
  const g = part.geometry;
  if (g.kind === "icosahedron") return part.yOffset + g.radius;
  return part.yOffset + g.height / 2;
}
const at = (t: InstanceTransform, height: number): WorldVec3 => ({
  x: t.position.x,
  y: t.position.y + height * t.scale,
  z: t.position.z,
});

function makeCamera(width: number, height: number, factor: number): OrthographicCamera {
  const camera = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, SCENE_CAMERA_NEAR, SCENE_CAMERA_FAR);
  camera.zoom = SCENE_CAMERA_ZOOM * factor;
  camera.position.set(...CAMERA_FLIGHT_OFFSET);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return camera;
}
const ndc = (camera: OrthographicCamera, p: WorldVec3) => new Vector3(p.x, p.y, p.z).project(camera);
const onScreen = (v: Vector3) => Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;

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
      { list: layout.trees, part: parts.treeCanopy },
      { list: layout.lamps, part: parts.lampPost },
    ];
    for (const { list, part } of groups) {
      for (const t of list) {
        const lat = Math.abs(locateOnLane(layout.channel, t.position).lateralOffset) * layout.channel.width;
        expect(lat).toBeGreaterThanOrEqual(layout.channel.width / 2 + footprintRadius(part.geometry) * t.scale);
      }
    }
  });

  it("solid props never hide a lane in the default view", () => {
    const f = new Vector3(...CAMERA_FLIGHT_OFFSET).negate().normalize();
    const solids = [
      ...layout.houses.map((t) => ({ t, top: topY(parts.houseRoof), r: footprintRadius(parts.houseBody.geometry) })),
      ...layout.trees.map((t) => ({ t, top: topY(parts.treeCanopy), r: footprintRadius(parts.treeCanopy.geometry) })),
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
    expect(visible(layout.trees, parts.treeCanopy)).toBe(true);
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
          [layout.trees, parts.treeCanopy],
          [layout.lamps, parts.lampHead],
        ];
        for (const [list, part] of groups) {
          for (const t of list) points.push(at(t, 0), at(t, topY(part)));
        }
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

  it("krathong flame is the brightest surface in both presets", () => {
    for (const id of LIGHT_PRESET_IDS) {
      const flame = relativeLuminance(KRATHONG_FLAME_MODEL.emissive) * LIGHT_PRESETS[id].flame.emissiveIntensity;
      const brightest = Math.max(
        ...environmentMaterials().map(
          (m) =>
            estimateLitLuminance(m.color, LIGHT_PRESETS[id], UP) +
            (m.emissive ? relativeLuminance(m.emissive) * (m.emissiveIntensity ?? 1) : 0),
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
      const curved = g.kind === "cylinder" || g.kind === "roundedBox" || (g.kind === "icosahedron" && (g.detail ?? 0) >= 1);
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
});
