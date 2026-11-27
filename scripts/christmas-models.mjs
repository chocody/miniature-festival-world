#!/usr/bin/env node
// Colours the decimated owner-made Christmas ornament models (MFW-101, docs/design/models.md §12).
//
//   node scripts/christmas-models.mjs [--design <id>] [--check]
//
// Reads assets/christmas/decimated/<id>.<lod>.glb and writes public/models/christmas/<id>.<lod>.glb for every design of
// scripts/christmas-models.designs.mjs (or only <id>) and every LOD. --check writes nothing and exits 1 when any committed
// output differs from a fresh build. Exit: 0 ok · 1 differs (--check) · 2 usage error / missing source.
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOrnamentLod } from "./christmas-models-lib.mjs";
import { CHRISTMAS_MODEL_DESIGNS } from "./christmas-models.designs.mjs";
import { runModelPackCli } from "./model-pack-cli.mjs";

export const LODS = /** @type {const} */ (["full", "medium", "low"]);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SOURCE_DIR = join(ROOT, "assets/christmas/decimated");
export const PUBLIC_DIR = join(ROOT, "public/models/christmas");

process.exitCode = runModelPackCli({
  name: "christmas models",
  script: "scripts/christmas-models.mjs",
  designs: CHRISTMAS_MODEL_DESIGNS,
  lods: LODS,
  sourceDir: SOURCE_DIR,
  publicDir: PUBLIC_DIR,
  build: buildOrnamentLod,
});
