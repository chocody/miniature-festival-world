// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  KRATHONG_DESIGN_IDS,
  KRATHONG_DESIGN_THUMBNAIL_MAX_BYTES,
  KRATHONG_DESIGN_THUMBNAIL_PUBLIC_PATH,
  KRATHONG_DESIGN_THUMBNAIL_PX,
  krathongDesignThumbnailUrl,
} from "@/config/krathongDesigns.config";
import { THUMBNAIL_DESIGN_IDS, THUMBNAIL_OUT_DIR, THUMBNAIL_OUT_PX } from "../../scripts/krathong-thumbnails.mjs";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR_WIDTH_OFFSET = 16;
const IHDR_HEIGHT_OFFSET = 20;

/** MFW-78: the committed design picker thumbnails (scripts/krathong-thumbnails.mjs). */
describe("krathong design thumbnails (MFW-78)", () => {
  it("KT1: the script's literals match the app config", () => {
    expect(THUMBNAIL_DESIGN_IDS).toEqual(KRATHONG_DESIGN_IDS);
    expect(THUMBNAIL_OUT_PX).toBe(KRATHONG_DESIGN_THUMBNAIL_PX);
    expect("/" + THUMBNAIL_OUT_DIR.replace(/^public\//, "")).toBe(KRATHONG_DESIGN_THUMBNAIL_PUBLIC_PATH);
  });

  it.each(KRATHONG_DESIGN_IDS)("KT2: %s is a square PNG of the thumbnail size within the byte guard", (id) => {
    const path = join("public", krathongDesignThumbnailUrl(id));
    expect(existsSync(path)).toBe(true);
    const bytes = readFileSync(path);
    expect([...bytes.subarray(0, PNG_SIGNATURE.length)]).toEqual(PNG_SIGNATURE);
    expect(bytes.readUInt32BE(IHDR_WIDTH_OFFSET)).toBe(KRATHONG_DESIGN_THUMBNAIL_PX);
    expect(bytes.readUInt32BE(IHDR_HEIGHT_OFFSET)).toBe(KRATHONG_DESIGN_THUMBNAIL_PX);
    expect(statSync(path).size).toBeLessThanOrEqual(KRATHONG_DESIGN_THUMBNAIL_MAX_BYTES);
  });

  it("KT3: the thumbnail directory holds exactly the five design PNGs", () => {
    expect(readdirSync(join("public", KRATHONG_DESIGN_THUMBNAIL_PUBLIC_PATH)).sort()).toEqual(
      KRATHONG_DESIGN_IDS.map((id) => `${id}.png`).sort(),
    );
  });
});
