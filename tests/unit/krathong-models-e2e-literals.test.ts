// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SCENE_OBJECT_NAMES } from "@/components/canvas3d/sceneObjectNames";
import { KRATHONG_DEFAULT_DESIGN, krathongDesignUrl } from "@/config/krathongDesigns.config";
import { krathongInstanceBucketIndex } from "@/core/customization";
import { E2E_DESIGN_BODY_NAME, E2E_DESIGN_BUCKET_MESH } from "../e2e/helpers/sceneProbe";
import { E2E_DESIGN_FULL_URL } from "../e2e/fixtures/krathongModels";

describe("krathong-models e2e literals (MFW-65)", () => {
  it("match the app constants", () => {
    expect(E2E_DESIGN_BUCKET_MESH).toBe(SCENE_OBJECT_NAMES.riverBatchMeshPrefix + krathongInstanceBucketIndex("design:banana_leaf_01", "designBody"));
    expect(E2E_DESIGN_BODY_NAME).toBe(SCENE_OBJECT_NAMES.krathongDesignBody);
    expect(E2E_DESIGN_FULL_URL).toBe(krathongDesignUrl(KRATHONG_DEFAULT_DESIGN, "full"));
  });
});
