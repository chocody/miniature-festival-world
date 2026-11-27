// Shared command-line runner of the model colouring packs (krathong MFW-65, Christmas MFW-101; docs/design/models.md).
//
//   node <script> [--design <id>] [--check]
//
// Reads <sourceDir>/<id>.<lod>.glb and writes <publicDir>/<id>.<lod>.glb for every design (or only <id>) and every LOD.
// --check writes nothing and reports every committed output that differs from a fresh build.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

/**
 * @template {{ id: string }} D
 * @param {{ name: string, script: string, designs: readonly D[], lods: readonly string[], sourceDir: string,
 *   publicDir: string, build: (sourceBytes: Uint8Array, design: D, lod: any) => Uint8Array, argv?: string[] }} pack
 * @returns {number} exit code: 0 ok · 1 differs (--check) · 2 usage / missing source
 */
export function runModelPackCli({ name, script, designs, lods, sourceDir, publicDir, build, argv = process.argv.slice(2) }) {
  /** @type {{ design?: string, check?: boolean }} */
  let values;
  try {
    ({ values } = parseArgs({ args: argv, options: { design: { type: "string" }, check: { type: "boolean" } }, strict: true }));
  } catch (error) {
    process.stderr.write(`${/** @type {Error} */ (error).message}\nusage: node ${script} [--design <id>] [--check]\n`);
    return 2;
  }
  const selected = values.design === undefined ? designs : designs.filter((d) => d.id === values.design);
  if (selected.length === 0) {
    process.stderr.write(`unknown design: ${values.design}\n`);
    return 2;
  }
  let differs = 0;
  for (const design of selected) {
    for (const lod of lods) {
      const source = join(sourceDir, `${design.id}.${lod}.glb`);
      if (!existsSync(source)) {
        process.stderr.write(`missing decimated source: ${source}\n`);
        return 2;
      }
      const out = join(publicDir, `${design.id}.${lod}.glb`);
      const bytes = build(new Uint8Array(readFileSync(source)), design, lod);
      if (values.check) {
        const same = existsSync(out) && Buffer.compare(readFileSync(out), Buffer.from(bytes)) === 0;
        if (!same) {
          differs += 1;
          process.stdout.write(`differs: ${out}\n`);
        }
      } else {
        mkdirSync(publicDir, { recursive: true });
        writeFileSync(out, bytes);
        process.stdout.write(`wrote ${out} (${bytes.length} bytes)\n`);
      }
    }
  }
  if (values.check) process.stdout.write(differs === 0 ? `${name}: up to date\n` : `${name}: ${differs} file(s) differ\n`);
  return differs === 0 ? 0 : 1;
}
