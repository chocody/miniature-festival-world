// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  LOY_KRATHONG_RIVER_ENVIRONMENT,
  LOY_KRATHONG_RIVER_FOLIAGE_DEFINITION,
  RIVER_ENVIRONMENT_PARTS,
  RIVER_FOLIAGE_PARTS,
} from "@/config/events/loyKrathong.river.config";
import { MIN_TOUCH_TARGET_WORLD_RADIUS, TAP_PROXY_INRADIUS_RATIO } from "@/config/gimmicks.config";
import { bladeTuftExtent } from "@/core/world";
import {
  LOY_KRATHONG_PROP_TAP_TARGETS as targets,
  LOY_KRATHONG_RIVER_FOLIAGE as foliage,
  LOY_KRATHONG_RIVER_LAYOUT as layout,
} from "@/components/models/loyKrathong/riverLayout";
import { SCENE_OBJECT_NAMES } from "../sceneObjectNames";
import { buildPropTapTargets, propTapProxyRadius } from "./propTapTargets";

const of = (kind: string) => targets.filter((t) => t.kind === kind);
const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const EPS = 1e-9;

describe("prop tap targets (MFW-60)", () => {
  it("PT1: one target per house, tree, bush, reed and rock, with layout indices", () => {
    const counts = { house: layout.houses.length, tree: foliage.trunks.length, bush: layout.bushes.length, reed: foliage.plants.length, rock: layout.rocks.length };
    for (const [kind, n] of Object.entries(counts)) {
      expect(of(kind).map((t) => t.index), kind).toEqual(Array.from({ length: n }, (_, i) => i));
    }
    expect(targets).toHaveLength(Object.values(counts).reduce((a, b) => a + b, 0));
  });

  it("PT2: names are unique and use the prefix", () => {
    const names = targets.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of targets) expect(t.name).toBe(`${SCENE_OBJECT_NAMES.propTapPrefix}${t.kind}-${t.index}`);
  });

  it("PT3: every proxy is at least the touch target and covers its body", () => {
    for (const t of targets) {
      expect(t.proxyRadius).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_WORLD_RADIUS / TAP_PROXY_INRADIUS_RATIO - EPS);
      expect(t.proxyRadius).toBeGreaterThanOrEqual(t.bodyRadius / TAP_PROXY_INRADIUS_RATIO - EPS);
      expect(t.proxyRadius).toBe(propTapProxyRadius(t.bodyRadius));
      expect(t.bodyRadius).toBeGreaterThan(0);
    }
  });

  it("PT4: body spheres contain the key points (roof top, clump centres, rock centre, reed top)", () => {
    const roofs = LOY_KRATHONG_RIVER_ENVIRONMENT.houses.map((h) => h.roof);
    of("house").forEach((t) => {
      const h = layout.houses[t.index];
      const part = roofs[t.index] === "gable" ? RIVER_ENVIRONMENT_PARTS.houseRoofGable : RIVER_ENVIRONMENT_PARTS.houseRoof;
      const top = part.yOffset + ("height" in part.geometry ? part.geometry.height : 0) / 2;
      expect(dist(t.center, { ...h.position, y: h.position.y + top * h.scale })).toBeLessThanOrEqual(t.bodyRadius + EPS);
      expect(dist(t.center, h.position)).toBeLessThanOrEqual(t.bodyRadius + EPS);
    });
    for (const kind of ["tree", "bush"] as const) {
      const mine = of(kind);
      foliage.clumps.forEach((c, i) => {
        const owner = foliage.clumpOwners[i];
        if (owner.kind !== kind) return;
        const t = mine[owner.index];
        expect(dist(t.center, c.position), `${kind} ${owner.index}`).toBeLessThanOrEqual(t.bodyRadius + EPS);
      });
    }
    of("tree").forEach((t) => expect(dist(t.center, foliage.trunks[t.index].position)).toBeLessThanOrEqual(t.bodyRadius * Math.sqrt(3) + EPS));
    const plant = RIVER_FOLIAGE_PARTS.FULL.riversidePlant;
    const ext = plant.geometry.kind === "bladeTuft" ? bladeTuftExtent(plant.geometry.blades) : { topY: 0, footprintRadius: 0 };
    of("reed").forEach((t) => {
      const p = foliage.plants[t.index];
      expect(dist(t.center, { ...p.position, y: p.position.y + (plant.yOffset + ext.topY) * p.scale })).toBeLessThanOrEqual(t.bodyRadius + EPS);
    });
    of("rock").forEach((t) => {
      const r = layout.rocks[t.index];
      expect(dist(t.center, { ...r.position, y: r.position.y + RIVER_ENVIRONMENT_PARTS.rock.yOffset * r.scale })).toBeLessThan(EPS);
    });
  });

  it("PT5: centres are derived from the layout (a recomputation is equal; nothing is stored in config)", () => {
    const again = buildPropTapTargets(
      layout,
      foliage,
      LOY_KRATHONG_RIVER_ENVIRONMENT.houses.map((h) => h.roof),
      RIVER_ENVIRONMENT_PARTS,
      RIVER_FOLIAGE_PARTS.FULL.riversidePlant,
      LOY_KRATHONG_RIVER_FOLIAGE_DEFINITION.clumpLumpAmplitude,
    );
    expect(again).toEqual(targets);
    const moved = buildPropTapTargets(
      { ...layout, rocks: layout.rocks.map((r) => ({ ...r, position: { ...r.position, x: r.position.x + 10 } })) },
      foliage,
      LOY_KRATHONG_RIVER_ENVIRONMENT.houses.map((h) => h.roof),
      RIVER_ENVIRONMENT_PARTS,
      RIVER_FOLIAGE_PARTS.FULL.riversidePlant,
      LOY_KRATHONG_RIVER_FOLIAGE_DEFINITION.clumpLumpAmplitude,
    );
    const rock = (list: typeof targets) => list.find((t) => t.kind === "rock")!;
    expect(rock(moved).center.x).toBeCloseTo(rock(targets).center.x + 10, 9);
    expect(Object.isFrozen(targets)).toBe(true);
  });
});
