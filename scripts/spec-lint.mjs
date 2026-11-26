#!/usr/bin/env node
// Mechanical check of a lead spec (loop-ticket §4.2) so the loop driver does not have to read it whole.
//   node scripts/spec-lint.mjs <spec.md> --ac <n> [--size S|M|L]
// Exit 0 = passes · 1 = lists what is missing · 2 = usage. Rules:
//   - the 7 headings of the lead's layout are present;
//   - acceptance criteria 1..n each have a check in `## Acceptance criteria → checks`: a test file name, OR a test ID
//     (e.g. RC9) that another line of the spec defines together with a test file name, OR a verify command
//     (`pnpm typecheck|lint|test|build|e2e`);
//   - size ≤ 24 KB = 24,576 bytes for S/M (default) and ≤ 40 KB = 40,960 bytes for L (owner decision 2026-11-26);
//   - fenced code blocks are at most 30% of the file.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const REQUIRED_HEADINGS = [
  "## Goal",
  "## Acceptance criteria → checks",
  "## Plan",
  "## Decisions",
  "## Open questions",
  "## Out of scope",
  "## Risks",
];
export const MAX_BYTES = { S: 24 * 1024, M: 24 * 1024, L: 40 * 1024 };
export const MAX_CODE_SHARE = 0.3;
const TEST_FILE_RE = /(?<![\w@./[\]-])[\w@./[\]-]+\.(?:test|spec)\.(?:tsx?|mjs|cjs|js)\b/;
const TEST_ID_RE = /\b[A-Z]{1,4}\d{1,3}\b/g;
const VERIFY_CMD_RE = /\bpnpm (?:typecheck|lint|test|build|e2e)\b|\bverify commands?\b/i;
const AC_ITEM_RE = /^(?:[-*]\s+|\|\s*)?(?:\*\*)?(?:AC\s*)?(\d+)(?:\*\*)?\s*(?:[.):|—–-]|\s)/i;

/** Body of a `## ` section (up to the next `## `), or null. @param {string} text @param {string} heading */
export function section(text, heading) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start < 0) return null;
  let end = lines.length;
  let fence = false;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^```/.test(lines[i])) fence = !fence;
    if (!fence && /^## /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n");
}

/** Share of the file inside fenced code blocks (by characters). @param {string} text */
export function codeShare(text) {
  let fence = false;
  let code = 0;
  for (const line of text.split("\n")) {
    const isFence = /^\s*```/.test(line);
    if (isFence || fence) code += line.length + 1;
    if (isFence) fence = !fence;
  }
  return text.length === 0 ? 0 : code / text.length;
}

/**
 * @param {string} text spec markdown
 * @param {{ ac: number, size?: "S"|"M"|"L" }} opts
 * @returns {string[]} problems; empty = pass
 */
export function lintSpec(text, { ac, size = "M" }) {
  /** @type {string[]} */
  const problems = [];
  const headings = new Set(text.split("\n").map((l) => l.trim()));
  for (const h of REQUIRED_HEADINGS) if (!headings.has(h)) problems.push(`missing heading "${h}"`);

  const checks = section(text, "## Acceptance criteria → checks");
  if (checks !== null) {
    // Test IDs the spec defines elsewhere: an ID on a line (outside the checks section) that names a test file.
    const acLines = new Set(checks.split("\n").filter((l) => AC_ITEM_RE.test(l) && !/^\s/.test(l)));
    /** @type {Set<string>} */
    const definedIds = new Set();
    // A line that names a test file also covers the lines after it, up to the next heading (a "`file.test.ts`" label
    // followed by "- RC9 …" case lines is the usual layout).
    let underFile = false;
    for (const line of text.split("\n")) {
      if (acLines.has(line)) continue; // an AC row cannot define its own IDs
      if (/^#{1,6}\s/.test(line)) underFile = false;
      if (TEST_FILE_RE.test(line)) underFile = true;
      if (underFile) for (const id of line.match(TEST_ID_RE) ?? []) definedIds.add(id);
    }
    /** @type {Map<number, string>} */
    const items = new Map();
    let current = null;
    let fence = false;
    for (const line of checks.split("\n")) {
      if (/^\s*```/.test(line)) fence = !fence;
      const m = !fence && AC_ITEM_RE.exec(line);
      if (m && !/^\s/.test(line)) {
        current = Number(m[1]);
        if (!items.has(current)) items.set(current, "");
      }
      if (!fence && /^#{1,6}\s/.test(line)) current = null; // a sub-heading ends the item
      if (current !== null) items.set(current, items.get(current) + line + "\n");
      if (m && /^\s*\|/.test(line)) current = null; // a table row is one line
    }
    for (let n = 1; n <= ac; n++) {
      if (!items.has(n)) problems.push(`AC ${n}: no item in "Acceptance criteria → checks"`);
      else {
        const item = items.get(n) ?? "";
        const ok = TEST_FILE_RE.test(item) || VERIFY_CMD_RE.test(item) || (item.match(TEST_ID_RE) ?? []).some((id) => definedIds.has(id));
        if (!ok) problems.push(`AC ${n}: names no test file, no test ID defined with a file elsewhere in the spec, and no pnpm verify command`);
      }
    }
  }

  const bytes = Buffer.byteLength(text, "utf8");
  const cap = MAX_BYTES[size];
  if (bytes > cap) problems.push(`spec is ${bytes} bytes; the cap for size ${size} is ${cap} bytes (${cap / 1024} KB)`);
  const share = codeShare(text);
  if (share > MAX_CODE_SHARE) problems.push(`code blocks are ${Math.round(share * 100)}% of the file; at most ${MAX_CODE_SHARE * 100}% (specify signatures and tests, not function bodies)`);
  return problems;
}

function main(argv) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { ac: { type: "string" }, size: { type: "string" } } });
  const size = values.size ?? "M";
  const ac = Number(values.ac);
  if (positionals.length !== 1 || !Number.isInteger(ac) || ac < 1 || !["S", "M", "L"].includes(size)) {
    process.stderr.write("usage: node scripts/spec-lint.mjs <spec.md> --ac <n> [--size S|M|L]   (caps: S/M 24 KB = 24,576 bytes, L 40 KB = 40,960 bytes)\n");
    process.exit(2);
  }
  let text;
  try {
    text = readFileSync(positionals[0], "utf8");
  } catch (err) {
    process.stderr.write(`error: cannot read ${positionals[0]}: ${err.message}\n`);
    process.exit(2);
  }
  const problems = lintSpec(text, { ac, size });
  if (problems.length) {
    process.stdout.write(`spec-lint: FAIL (${problems.length})\n${problems.map((p) => `- ${p}`).join("\n")}\n`);
    process.exit(1);
  }
  process.stdout.write(`spec-lint: PASS (${Buffer.byteLength(text, "utf8")} bytes, ${Math.round(codeShare(text) * 100)}% code)\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
