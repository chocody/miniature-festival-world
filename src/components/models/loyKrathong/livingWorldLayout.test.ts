// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CAMERA_FLIGHT_OFFSET } from "@/config/camera.config";
import {
  AMBIENT_MOTES,
  LOY_KRATHONG_VILLAGERS,
  VILLAGER_FOOTPRINT_RADIUS,
  VILLAGER_HEIGHT,
  VILLAGER_MOTION,
} from "@/config/events/loyKrathong.life.config";
import { LIVING_WORLD_TIERS } from "@/config/performance.config";
import { locateOnLane } from "@/core/coordinates";
import {
  createMoteFrameOut,
  createVillagerPoseOut,
  getLoyKrathongRiverLanes,
  moteFrameInto,
  prepareMoteAnchors,
  prepareVillagers,
  riverFrameAt,
  villagerPoseInto,
} from "@/core/world";
import { LOY_KRATHONG_RIVER_LAYOUT as layout } from "./riverLayout";

/*
 * AC5 "villagers never cover krathongs on the water" as a layout guarantee (lead decision D6). The camera is orthographic;
 * MFW-57 pans and turns it about +Y only, so its elevation (and the projection direction up to the yaw) is fixed by
 * CAMERA_FLIGHT_OFFSET: a point at height H above the water projects onto the water at most H / tan(elevation) away
 * (horizontally, along the view direction). G1 checks every camera yaw (any allowed camera pose); G2 the default view.
 */
const [OX, OY, OZ] = CAMERA_FLIGHT_OFFSET;
const TAN_ELEVATION = OY / Math.hypot(OX, OZ);
const VIEW_XZ = { x: OX / Math.hypot(OX, OZ), z: OZ / Math.hypot(OX, OZ) };
const LANE_HALF_WIDTH = Math.max(...getLoyKrathongRiverLanes().lanes.map((l) => l.width)) / 2;
const CHANNEL_HALF_WIDTH = layout.channel.width / 2;
const SAMPLE_STEP_MS = 100;
const MOTE_SPAN_MS = 20_000;

interface Silhouette {
  readonly x: number;
  readonly z: number;
  readonly progress: number;
  readonly lateral: number; // world units from the channel centreline, ≥ 0
  readonly side: number; // −1 / 1: which side of the centreline (the lane's right vector)
  readonly inner: number; // lateral of the silhouette edge nearest the water
  readonly height: number; // top above the water surface
}

function silhouetteAt(x: number, z: number, inner: (lateral: number) => number, height: number): Silhouette {
  const loc = locateOnLane(layout.channel, { x, z });
  const lateral = Math.abs(loc.lateralOffset) * layout.channel.width;
  return { x, z, progress: loc.progress, lateral, side: Math.sign(loc.lateralOffset), inner: inner(lateral), height };
}

/** Horizontal reach of the projected silhouette toward the water, for the default camera, on the camera side only. */
function defaultViewReach(s: Silhouette): number | null {
  const { right } = riverFrameAt(layout.channel, Math.min(1, Math.max(0, s.progress)));
  const facing = s.side * (VIEW_XZ.x * right.x + VIEW_XZ.z * right.z);
  return facing > 0 ? (s.height / TAN_ELEVATION) * facing : null;
}

const villagers = prepareVillagers(
  LOY_KRATHONG_VILLAGERS.slice(0, LIVING_WORLD_TIERS.HIGH.villagerCount),
  layout.paths,
  layout.channel,
);
const villagerSamples: { villagerId: number; y: number; s: Silhouette }[] = [];
for (const v of villagers) {
  const out = createVillagerPoseOut();
  const record = (animated: boolean, t: number) => {
    villagerPoseInto(v, layout.channel, layout.bankProfile, VILLAGER_MOTION, t, animated, out);
    const scale = v.def.scale;
    const height = out.y + out.hopY + VILLAGER_HEIGHT * scale - layout.waterSurfaceY;
    const roll = VILLAGER_HEIGHT * scale * Math.abs(Math.sin(out.rollRad));
    villagerSamples.push({
      villagerId: v.def.villagerId,
      y: out.y,
      s: silhouetteAt(out.x, out.z, (lateral) => lateral - VILLAGER_FOOTPRINT_RADIUS * scale - roll, height),
    });
  };
  for (let t = 0; t < v.cycleMs; t += SAMPLE_STEP_MS) record(true, t);
  record(false, 0);
}

const motes = prepareMoteAnchors(LIVING_WORLD_TIERS.HIGH.moteCount, layout.channel, layout.bankProfile, AMBIENT_MOTES);
const moteSamples: Silhouette[] = [];
for (const anchor of motes) {
  const out = createMoteFrameOut();
  for (let t = 0; t <= MOTE_SPAN_MS; t += SAMPLE_STEP_MS) {
    moteFrameInto(anchor, t, true, AMBIENT_MOTES, out);
    const r = out.radius;
    moteSamples.push(silhouetteAt(out.x, out.z, (lateral) => lateral - r, out.y + r - layout.waterSurfaceY));
  }
}

describe("living world never covers krathongs on the water (MFW-50 AC5)", () => {
  it("has samples for every HIGH villager and mote", () => {
    expect(new Set(villagerSamples.map((v) => v.villagerId)).size).toBe(LIVING_WORLD_TIERS.HIGH.villagerCount);
    expect(moteSamples.length).toBeGreaterThan(motes.length);
  });

  it("G1 from any camera yaw, no villager silhouette reaches the krathong lane band", () => {
    for (const { villagerId, s } of villagerSamples) {
      expect(s.inner - s.height / TAN_ELEVATION, String(villagerId)).toBeGreaterThan(LANE_HALF_WIDTH);
    }
  });

  it("G2 default camera: camera-side villagers stay visually on land", () => {
    let checked = 0;
    for (const { villagerId, s } of villagerSamples) {
      const reach = defaultViewReach(s);
      if (reach === null) continue;
      checked++;
      expect(s.inner - reach, String(villagerId)).toBeGreaterThanOrEqual(CHANNEL_HALF_WIDTH);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("G3 positive control: a villager at the water edge fails G2", () => {
    const camSide = villagerSamples.find(({ s }) => defaultViewReach(s) !== null)!.s;
    const lateral = CHANNEL_HALF_WIDTH + 0.05;
    const moved: Silhouette = { ...camSide, lateral, inner: lateral - VILLAGER_FOOTPRINT_RADIUS };
    expect(moved.inner - defaultViewReach(moved)!).toBeLessThan(CHANNEL_HALF_WIDTH);
  });

  it("G4 motes: never over the lane band from any yaw, on land from the default camera", () => {
    let checked = 0;
    for (const s of moteSamples) {
      expect(s.inner - s.height / TAN_ELEVATION).toBeGreaterThan(LANE_HALF_WIDTH);
      const reach = defaultViewReach(s);
      if (reach === null) continue;
      checked++;
      expect(s.inner - reach).toBeGreaterThanOrEqual(CHANNEL_HALF_WIDTH);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("G5 every villager stands on the flat terrace (the blob shadows' surface)", () => {
    for (const { villagerId, y } of villagerSamples) expect(Math.abs(y - layout.bankTopY), String(villagerId)).toBeLessThan(1e-9);
  });
});
