#!/usr/bin/env node
// Builds the riverside house mesh from the owner-supplied house model (MFW-66, docs/design/models.md §10). Run once; only the
// output is committed (the owner GLB stays outside the repo).
//
//   node scripts/house-model.mjs --source <file> [--check]
//
// Writes src/config/events/loyKrathong.houseModel.ts. --check writes nothing and exits 1 when the committed module differs
// from a fresh build. Exit: 0 ok · 1 differs (--check) · 2 usage / missing source / parse error.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { buildHouseModel, readGlbPrimitives, renderHouseModelModule } from "./house-model-lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const HOUSE_MODEL_MODULE = join(ROOT, "src/config/events/loyKrathong.houseModel.ts");
const USAGE = "usage: node scripts/house-model.mjs --source <file> [--check]\n";

function main() {
  /** @type {{ source?: string, check?: boolean }} */
  let values;
  try {
    ({ values } = parseArgs({ options: { source: { type: "string" }, check: { type: "boolean" } }, strict: true }));
  } catch (error) {
    process.stderr.write(`${/** @type {Error} */ (error).message}\n${USAGE}`);
    return 2;
  }
  if (values.source === undefined) {
    process.stderr.write(USAGE);
    return 2;
  }
  if (!existsSync(values.source)) {
    process.stderr.write(`missing source: ${values.source}\n`);
    return 2;
  }
  const bytes = readFileSync(values.source);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  let build;
  try {
    build = buildHouseModel(readGlbPrimitives(new Uint8Array(bytes)));
  } catch (error) {
    process.stderr.write(`${/** @type {Error} */ (error).message}\n`);
    return 2;
  }
  const out = renderHouseModelModule(build, { file: basename(values.source), sha256 });

  const report = {
    sha256,
    stats: build.stats,
    triangles: { shell: build.shell.indices.length / 3, roof: build.roof.indices.length / 3 },
    vertices: { shell: build.shell.positions.length / 3, roof: build.roof.positions.length / 3 },
    scale: build.scale,
    halfExtents: { shell: build.shell.halfExtents, roof: build.roof.halfExtents },
    centerY: { shell: build.shell.centerY, roof: build.roof.centerY },
    windows: build.windows,
    glass: build.glass,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (values.check) {
    const same = existsSync(HOUSE_MODEL_MODULE) && readFileSync(HOUSE_MODEL_MODULE, "utf8") === out;
    process.stdout.write(same ? "house model: up to date\n" : `house model: differs: ${HOUSE_MODEL_MODULE}\n`);
    return same ? 0 : 1;
  }
  writeFileSync(HOUSE_MODEL_MODULE, out);
  process.stdout.write(`wrote ${HOUSE_MODEL_MODULE} (${Buffer.byteLength(out)} bytes)\n`);
  return 0;
}

process.exitCode = main();
