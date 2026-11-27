#!/usr/bin/env node
// Colours the decimated owner-supplied krathong models (MFW-65, docs/design/models.md).
//
//   node scripts/krathong-models.mjs [--design <id>] [--check]
//
// Reads assets/krathong/decimated/<id>.<lod>.glb and writes public/models/krathong/<id>.<lod>.glb for every design of
// scripts/krathong-models.designs.mjs (or only <id>) and every LOD. --check writes nothing and exits 1 when any committed
// output differs from a fresh build. Exit: 0 ok · 1 differs (--check) · 2 usage error. Runner: scripts/model-pack-cli.mjs.
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDesignLod } from "./krathong-models-lib.mjs";
import { KRATHONG_MODEL_DESIGNS } from "./krathong-models.designs.mjs";
import { runModelPackCli } from "./model-pack-cli.mjs";

export const LODS = /** @type {const} */ (["full", "medium", "low"]);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SOURCE_DIR = join(ROOT, "assets/krathong/decimated");
export const PUBLIC_DIR = join(ROOT, "public/models/krathong");

process.exitCode = runModelPackCli({
  name: "krathong models",
  script: "scripts/krathong-models.mjs",
  designs: KRATHONG_MODEL_DESIGNS,
  lods: LODS,
  sourceDir: SOURCE_DIR,
  publicDir: PUBLIC_DIR,
  build: buildDesignLod,
});
