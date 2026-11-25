// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { Group } from "three";
import { LOY_KRATHONG_PIER_RELEASE_SPOT } from "@/config/events/loyKrathong.river.config";
import { DEFAULT_KRATHONG_APPEARANCE } from "@/core/customization";
import { RIVER_KRATHONG_SCALE } from "@/config/riverFlow.config";
import { RELEASE_BUMP } from "@/config/ritual.config";
import { createSplinePoseOut, splineCoordToPoseInto } from "@/core/coordinates";
import { buildReleaseCoord } from "@/core/ritual";
import {
  applyRiverItemTransform,
  createRiverFrameScratch,
  getLoyKrathongRiverLanes,
  prepareRiverItems,
} from "@/core/world";
import { createOwnPoseScratch, ritualTouchdownXZ, writeOwnKrathongPose, type OwnPoseFrame } from "./ownKrathongPose";
import { getLoyKrathongRitualSite } from "./ritualSite";

const counter = vi.hoisted(() => ({ vectors: 0 }));
vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class CountingVector3 extends actual.Vector3 {
    constructor(...args: ConstructorParameters<typeof actual.Vector3>) {
      super(...args);
      counter.vectors += 1;
    }
  }
  return { ...actual, Vector3: CountingVector3 };
});

const site = getLoyKrathongRitualSite();
const NOW = 1_700_000_000_000;
const own = prepareRiverItems(
  [{ id: "own", coord: buildReleaseCoord(LOY_KRATHONG_PIER_RELEASE_SPOT), createdAtMs: NOW, appearance: DEFAULT_KRATHONG_APPEARANCE }],
  getLoyKrathongRiverLanes(),
)[0];
const frame = (patch: Partial<OwnPoseFrame>): OwnPoseFrame => ({
  kind: "PIER",
  site,
  dragPoint: null,
  releaseDrop: null,
  own: null,
  lower: 0,
  settle: 0,
  bump: 0,
  nowMs: NOW,
  reducedMotion: false,
  ...patch,
});
const write = (patch: Partial<OwnPoseFrame>) => {
  const g = new Group();
  writeOwnKrathongPose(g, frame(patch), createOwnPoseScratch());
  return g;
};

describe("writeOwnKrathongPose", () => {
  it("ORIGIN", () => {
    const g = write({ kind: "ORIGIN" });
    expect(g.position.toArray()).toEqual([0, 0, 0]);
    expect(g.scale.x).toBe(1);
  });

  it("PIER stands on the tip at river scale facing the flow", () => {
    const g = write({ kind: "PIER" });
    expect(g.position.toArray()).toEqual([site.tip.x, site.tip.y, site.tip.z]);
    expect(g.scale.x).toBe(RIVER_KRATHONG_SCALE);
    expect(g.rotation.y).toBeCloseTo(site.releaseYawRad, 12);
    expect(g.visible).toBe(true);
  });

  it("DRAG follows the point, or the tip without one", () => {
    expect(write({ kind: "DRAG", dragPoint: { x: 1, z: 2 } }).position.toArray()).toEqual([1, site.tip.y, 2]);
    expect(write({ kind: "DRAG" }).position.x).toBe(site.tip.x);
  });

  it("RELEASING lowers from the pier to the release point", () => {
    expect(write({ kind: "RELEASING", lower: 0 }).position.toArray()).toEqual([site.tip.x, site.tip.y, site.tip.z]);
    const end = write({ kind: "RELEASING", lower: 1 }).position;
    expect(end.x).toBeCloseTo(site.releasePoint.x, 12);
    expect(end.y).toBeCloseTo(site.releasePoint.y, 12);
    expect(end.z).toBeCloseTo(site.releasePoint.z, 12);
  });

  it("RELEASING from a drop starts at deck height and lands at the water surface", () => {
    const releaseDrop = { x: 0.5, z: 0.25 };
    expect(write({ kind: "RELEASING", releaseDrop, lower: 0 }).position.toArray()).toEqual([0.5, site.tip.y, 0.25]);
    expect(write({ kind: "RELEASING", releaseDrop, lower: 1 }).position.toArray()).toEqual([0.5, site.waterSurfaceY, 0.25]);
    expect(ritualTouchdownXZ(site, releaseDrop)).toBe(releaseDrop);
    expect(ritualTouchdownXZ(site, null)).toEqual({ x: site.releasePoint.x, z: site.releasePoint.z });
  });

  it("RELEASING settles onto the saved river pose, with the bump hop", () => {
    const pose = splineCoordToPoseInto(own.coord, own.lane, own.createdAtMs, NOW, createSplinePoseOut());
    const g = write({ kind: "RELEASING", own, lower: 1, settle: 1, bump: 1 });
    expect(g.position.x).toBeCloseTo(pose.x, 12);
    expect(g.position.y).toBeCloseTo(pose.y + RELEASE_BUMP.hopHeight, 12);
    expect(g.position.z).toBeCloseTo(pose.z, 12);
    expect(g.rotation.y).toBeCloseTo(pose.yawRad, 12);
  });

  it("RIVER equals the river transform; reduced motion does not bob", () => {
    for (const reducedMotion of [false, true]) {
      const g = write({ kind: "RIVER", own, reducedMotion, nowMs: NOW + 5_000 });
      const ref = new Group();
      applyRiverItemTransform(ref, own, NOW + 5_000, reducedMotion, createRiverFrameScratch());
      expect(g.position.toArray()).toEqual(ref.position.toArray());
      expect(g.rotation.toArray()).toEqual(ref.rotation.toArray());
      expect(g.scale.x).toBe(RIVER_KRATHONG_SCALE);
    }
    const a = write({ kind: "RIVER", own, reducedMotion: true, nowMs: NOW });
    const b = write({ kind: "RIVER", own, reducedMotion: true, nowMs: NOW });
    expect(a.rotation.x).toBe(b.rotation.x);
    expect(a.rotation.x).toBe(0);
  });

  it("RIVER without an own item and HIDDEN are invisible", () => {
    expect(write({ kind: "RIVER", own: null }).visible).toBe(false);
    expect(write({ kind: "HIDDEN" }).visible).toBe(false);
  });

  it("allocates no Vector3 per RIVER write", () => {
    const g = new Group();
    const scratch = createOwnPoseScratch();
    const f = frame({ kind: "RIVER", own });
    writeOwnKrathongPose(g, f, scratch); // warm-up
    counter.vectors = 0;
    for (let i = 0; i < 1000; i++) writeOwnKrathongPose(g, { ...f, nowMs: NOW + i }, scratch);
    expect(counter.vectors).toBe(0);
  });
});
