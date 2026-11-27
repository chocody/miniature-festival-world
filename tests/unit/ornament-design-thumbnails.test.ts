// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LIGHT_PRESETS, LOOK_RENDERER } from "@/config/look.config";
import {
  ORNAMENT_DESIGN_BODY_MATERIAL,
  ORNAMENT_DESIGN_THUMBNAIL_MAX_BYTES,
  ORNAMENT_DESIGN_THUMBNAIL_PUBLIC_PATH,
  ORNAMENT_DESIGN_THUMBNAIL_PX,
  ORNAMENT_GLB_DESIGN_IDS,
  ornamentDesignThumbnailUrl,
} from "@/config/ornamentModels.config";
import {
  SHOT_DESIGN_IDS,
  SHOT_LIGHTS,
  SHOT_MATERIAL,
  SHOT_TONE_MAPPING,
  shotPath,
  THUMBNAIL_OUT_DIR,
  THUMBNAIL_OUT_PX,
} from "../../scripts/christmas-model-shots.mjs";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR_WIDTH_OFFSET = 16;
const IHDR_HEIGHT_OFFSET = 20;
const PRESETS = ["DAY", "NIGHT"] as const;

/** MFW-101: the committed ornament picker thumbnails and hero renders (scripts/christmas-model-shots.mjs). */
describe("ornament design thumbnails and hero renders (MFW-101)", () => {
  it("OT1: the script's literals match the app config", () => {
    expect([...SHOT_DESIGN_IDS]).toEqual([...ORNAMENT_GLB_DESIGN_IDS]);
    expect(THUMBNAIL_OUT_PX).toBe(ORNAMENT_DESIGN_THUMBNAIL_PX);
    expect("/" + THUMBNAIL_OUT_DIR.replace(/^public\//, "")).toBe(ORNAMENT_DESIGN_THUMBNAIL_PUBLIC_PATH);
  });

  it.each(ORNAMENT_GLB_DESIGN_IDS)("OT2: %s is a square PNG of the thumbnail size within the byte guard", (id) => {
    const path = join("public", ornamentDesignThumbnailUrl(id));
    expect(existsSync(path)).toBe(true);
    const bytes = readFileSync(path);
    expect([...bytes.subarray(0, PNG_SIGNATURE.length)]).toEqual(PNG_SIGNATURE);
    expect(bytes.readUInt32BE(IHDR_WIDTH_OFFSET)).toBe(ORNAMENT_DESIGN_THUMBNAIL_PX);
    expect(bytes.readUInt32BE(IHDR_HEIGHT_OFFSET)).toBe(ORNAMENT_DESIGN_THUMBNAIL_PX);
    expect(statSync(path).size).toBeLessThanOrEqual(ORNAMENT_DESIGN_THUMBNAIL_MAX_BYTES);
  });

  it("OT3: the thumbnail directory holds exactly the three design PNGs", () => {
    expect(readdirSync(join("public", ORNAMENT_DESIGN_THUMBNAIL_PUBLIC_PATH)).sort()).toEqual(
      ORNAMENT_GLB_DESIGN_IDS.map((id) => `${id}.png`).sort(),
    );
  });

  it("OT4: the harness lights, tone mapping and material copy the app config", () => {
    for (const preset of PRESETS) {
      const app = LIGHT_PRESETS[preset];
      expect(SHOT_LIGHTS[preset]).toEqual({
        background: app.background,
        hemisphere: { ...app.hemisphere },
        ambient: { ...app.ambient },
        key: { color: app.key.color, intensity: app.key.intensity, position: [...app.key.position] },
      });
    }
    expect(SHOT_TONE_MAPPING).toEqual({ ...LOOK_RENDERER });
    expect(SHOT_MATERIAL).toEqual({ roughness: ORNAMENT_DESIGN_BODY_MATERIAL.roughness, metalness: ORNAMENT_DESIGN_BODY_MATERIAL.metalness });
  });

  it.each(ORNAMENT_GLB_DESIGN_IDS)("OT5: %s has DAY and NIGHT hero renders", (id) => {
    for (const preset of PRESETS) expect(existsSync(shotPath(id, preset)), shotPath(id, preset)).toBe(true);
  });
});
