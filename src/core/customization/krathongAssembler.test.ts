import { describe, expect, it } from "vitest";
import { KRATHONG_BASE_IDS, RIM_SOCKET_COUNT } from "@/config/events/loyKrathong.config";
import {
  KRATHONG_BASE_MODELS,
  KRATHONG_FLOWER_MODELS,
  KRATHONG_INCENSE_MODEL,
  KRATHONG_LEAF_COUNT,
  KRATHONG_LEAF_MODELS,
  KRATHONG_LEAF_VARIATION,
} from "@/config/krathongModel.config";
import { assembleKrathong } from "./krathongAssembler";
import { KRATHONG_GEOMETRY_KEYS, KRATHONG_MATERIAL_KEYS } from "./krathongAssetKeys";
import { DEFAULT_KRATHONG_APPEARANCE } from "./krathongAppearance";
import { placeInSocket } from "./krathongBuilder";
import { rimSocketId } from "./sockets";
import type { KrathongAppearance } from "./types";

const D = DEFAULT_KRATHONG_APPEARANCE;
const PART_KEYS = ["geometryKey", "id", "localPosition", "materialKey", "role", "rotationY", "scale", "socketId"];

describe("assembleKrathong", () => {
  it("builds the default part counts with unique ids", () => {
    const a = assembleKrathong(D);
    // MFW-48: every flower brings its own flowerCentre part.
    expect(a.body).toHaveLength(1 + KRATHONG_LEAF_COUNT + 2 * RIM_SOCKET_COUNT);
    expect(a.centerAnchor.parts).toHaveLength(2 + KRATHONG_INCENSE_MODEL.count);
    const ids = [...a.body, ...a.centerAnchor.parts].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each([0, 3, 7])("places a flower only at rim socket %i", (i) => {
    const placed = placeInSocket({ ...D, flowers: [] }, { part: "flower", kind: "orchid", socketId: rimSocketId(i) });
    if (!placed.ok) throw new Error("placement failed");
    const flowers = assembleKrathong(placed.appearance).body.filter((p) => p.role === "flower");
    expect(flowers).toHaveLength(1);
    const base = KRATHONG_BASE_MODELS[D.base];
    const theta = (i * 2 * Math.PI) / RIM_SOCKET_COUNT;
    const [x, y, z] = flowers[0].localPosition;
    expect(flowers[0].socketId).toBe(rimSocketId(i));
    expect(x).toBeCloseTo(base.rimRadius * Math.sin(theta), 9);
    expect(y).toBeCloseTo(base.rimY + KRATHONG_FLOWER_MODELS.orchid.localY, 9); // MFW-48: flowers sit on the rim surface
    expect(z).toBeCloseTo(base.rimRadius * Math.cos(theta), 9);
    expect(flowers[0].rotationY).toBeCloseTo(theta, 9);
  });

  it("MFW-48: leaves sit on the rim with the hand-made yaw / scale variation", () => {
    for (const base of KRATHONG_BASE_IDS) {
      const a = assembleKrathong({ ...D, base });
      const leaves = a.body.filter((p) => p.role === "leaf");
      expect(leaves).toHaveLength(KRATHONG_LEAF_COUNT);
      leaves.forEach((leaf, j) => {
        const v = KRATHONG_LEAF_VARIATION[j];
        const theta = ((j + 0.5) * 2 * Math.PI) / KRATHONG_LEAF_COUNT;
        const model = KRATHONG_LEAF_MODELS[D.lotusFold];
        expect(leaf.rotationY).toBeCloseTo(theta + v.yawRad, 9);
        expect(leaf.localPosition[1]).toBeCloseTo(KRATHONG_BASE_MODELS[base].rimY + model.localY, 9);
        leaf.scale.forEach((c, k) => expect(c).toBeCloseTo(model.scale[k] * v.scale, 9));
      });
    }
  });

  it("makes no flower for null sockets or an empty list", () => {
    const some = assembleKrathong({ ...D, flowers: ["orchid", null, "lotus"] });
    expect(some.body.filter((p) => p.role === "flower").map((p) => p.id)).toEqual([
      "flower_rim_socket_0",
      "flower_rim_socket_2",
    ]);
    expect(assembleKrathong({ ...D, flowers: [] }).body.some((p) => p.role === "flower")).toBe(false);
  });

  it.each(KRATHONG_BASE_IDS)("keeps candle, flame and incense upright on center_socket (%s)", (baseId) => {
    const a = assembleKrathong({ ...D, base: baseId });
    expect(a.centerAnchor.socketId).toBe("center_socket");
    expect(a.centerAnchor.localPosition).toEqual([0, KRATHONG_BASE_MODELS[baseId].topY, 0]);
    for (const part of a.centerAnchor.parts) {
      expect(part.rotationY).toBe(0);
      expect(part.socketId).toBe("center_socket");
    }
    const candle = a.centerAnchor.parts.find((p) => p.role === "candle")!;
    expect(candle.localPosition[0]).toBe(0);
    expect(candle.localPosition[2]).toBe(0);
    for (const part of [...a.body, ...a.centerAnchor.parts]) {
      expect(Object.keys(part).sort()).toEqual(PART_KEYS);
    }
  });

  it("uses catalogue keys only", () => {
    const appearance: KrathongAppearance = { ...D, base: "toy_bread_01", lotusFold: "style_02", leafColor: "#8DB255", candleColor: "#FF9F6B" };
    const a = assembleKrathong(appearance);
    expect(a.body[0].geometryKey).toBe("base:toy_bread_01");
    expect(a.body[1].geometryKey).toBe("leaf:style_02");
    expect(a.body[1].materialKey).toBe("leaf:#8DB255");
    expect(a.centerAnchor.parts[0].materialKey).toBe("candle:#FF9F6B");
    for (const part of [...a.body, ...a.centerAnchor.parts]) {
      expect(KRATHONG_GEOMETRY_KEYS).toContain(part.geometryKey);
      expect(KRATHONG_MATERIAL_KEYS).toContain(part.materialKey);
    }
  });

  it("is deterministic", () => {
    expect(assembleKrathong(D)).toEqual(assembleKrathong(D));
  });
});
