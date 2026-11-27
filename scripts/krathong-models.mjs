#!/usr/bin/env node
// Colours the decimated owner-supplied krathong models (MFW-65, docs/design/models.md).
//
//   node scripts/krathong-models.mjs [--design <id>] [--check]
//
// Reads assets/krathong/decimated/<id>.<lod>.glb and writes public/models/krathong/<id>.<lod>.glb for every design of
// scripts/krathong-models.designs.mjs (or only <id>) and every LOD. --check writes nothing and exits 1 when any committed
// output differs from a fresh build. Exit: 0 ok · 1 differs (--check) · 2 usage error.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { buildDesignLod } from "./krathong-models-lib.mjs";
import { KRATHONG_MODEL_DESIGNS } from "./krathong-models.designs.mjs";

export const LODS = /** @type {const} */ (["full", "medium", "low"]);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SOURCE_DIR = join(ROOT, "assets/krathong/decimated");
export const PUBLIC_DIR = join(ROOT, "public/models/krathong");

function main() {
  /** @type {{ design?: string, check?: boolean }} */
  let values;
  try {
    ({ values } = parseArgs({ options: { design: { type: "string" }, check: { type: "boolean" } }, strict: true }));
  } catch (error) {
    process.stderr.write(`${/** @type {Error} */ (error).message}\nusage: node scripts/krathong-models.mjs [--design <id>] [--check]\n`);
    return 2;
  }
  const designs = values.design === undefined ? KRATHONG_MODEL_DESIGNS : KRATHONG_MODEL_DESIGNS.filter((d) => d.id === values.design);
  if (designs.length === 0) {
    process.stderr.write(`unknown design: ${values.design}\n`);
    return 2;
  }
  let differs = 0;
  for (const design of designs) {
    for (const lod of LODS) {
      const source = join(SOURCE_DIR, `${design.id}.${lod}.glb`);
      if (!existsSync(source)) {
        process.stderr.write(`missing decimated source: ${source}\n`);
        return 2;
      }
      const out = join(PUBLIC_DIR, `${design.id}.${lod}.glb`);
      const bytes = buildDesignLod(new Uint8Array(readFileSync(source)), design, lod);
      if (values.check) {
        const same = existsSync(out) && Buffer.compare(readFileSync(out), Buffer.from(bytes)) === 0;
        if (!same) {
          differs += 1;
          process.stdout.write(`differs: ${out}\n`);
        }
      } else {
        mkdirSync(PUBLIC_DIR, { recursive: true });
        writeFileSync(out, bytes);
        process.stdout.write(`wrote ${out} (${bytes.length} bytes)\n`);
      }
    }
  }
  if (values.check) process.stdout.write(differs === 0 ? "krathong models: up to date\n" : `krathong models: ${differs} file(s) differ\n`);
  return differs === 0 ? 0 : 1;
}

process.exitCode = main();
