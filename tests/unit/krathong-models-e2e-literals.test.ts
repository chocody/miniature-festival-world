// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SCENE_OBJECT_NAMES } from "@/components/canvas3d/sceneObjectNames";
import { KRATHONG_DEFAULT_DESIGN, KRATHONG_DESIGN_IDS, krathongDesignUrl } from "@/config/krathongDesigns.config";
import { CUSTOMIZER_COPY, KRATHONG_DESIGN_LABELS } from "@/config/customizer.config";
import { KRATHONG_DESIGN_USERDATA_KEY } from "@/components/models/loyKrathong/designHeroMesh";
import { krathongInstanceBucketIndex } from "@/core/customization";
import { E2E_APPEARANCE } from "../e2e/fixtures/zoneFixtures";
import { E2E_DESIGN_BODY_NAME, E2E_DESIGN_BUCKET_MESH } from "../e2e/helpers/sceneProbe";
import {
  E2E_DEFAULT_DESIGN,
  E2E_DESIGN_BUCKET_MESH_BY_ID,
  E2E_DESIGN_FULL_URL,
  E2E_DESIGN_GROUP_LABEL,
  E2E_DESIGN_LABELS,
  E2E_DESIGN_USERDATA_KEY,
  e2eAppearanceWithDesign,
} from "../e2e/fixtures/krathongModels";

describe("krathong-models e2e literals (MFW-65)", () => {
  it("match the app constants", () => {
    expect(E2E_DESIGN_BUCKET_MESH).toBe(SCENE_OBJECT_NAMES.riverBatchMeshPrefix + krathongInstanceBucketIndex("design:banana_leaf_01", "designBody"));
    expect(E2E_DESIGN_BODY_NAME).toBe(SCENE_OBJECT_NAMES.krathongDesignBody);
    expect(E2E_DESIGN_FULL_URL).toBe(krathongDesignUrl(KRATHONG_DEFAULT_DESIGN, "full"));
  });

  it("EL1 (MFW-78): design picker literals match the app constants", () => {
    expect(E2E_DESIGN_GROUP_LABEL).toBe(CUSTOMIZER_COPY.designGroupLabel);
    expect(E2E_DESIGN_LABELS).toEqual(KRATHONG_DESIGN_LABELS);
    expect(Object.keys(E2E_DESIGN_LABELS)).toEqual([...KRATHONG_DESIGN_IDS]);
    expect(E2E_DESIGN_USERDATA_KEY).toBe(KRATHONG_DESIGN_USERDATA_KEY);
    expect(Object.keys(E2E_DESIGN_BUCKET_MESH_BY_ID)).toEqual([...KRATHONG_DESIGN_IDS]);
    for (const id of KRATHONG_DESIGN_IDS) {
      expect(E2E_DESIGN_BUCKET_MESH_BY_ID[id]).toBe(SCENE_OBJECT_NAMES.riverBatchMeshPrefix + krathongInstanceBucketIndex(`design:${id}`, "designBody"));
      expect(e2eAppearanceWithDesign(id)).toEqual({ ...E2E_APPEARANCE, design: id });
    }
  });

  it("EL2 (MFW-81): the default design literal matches the app constant", () => {
    expect(E2E_DEFAULT_DESIGN).toBe(KRATHONG_DEFAULT_DESIGN);
  });
});
