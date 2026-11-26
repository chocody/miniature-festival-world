#!/usr/bin/env node
// Per-card cost of the loop's subagents from a session transcript.
//   node scripts/loop-metrics.mjs <transcript.jsonl> [MFW-n]
// With a key: prints JSON {key, tokens, byRole, fixRounds, agents}; without: one such object per card.
// Token counts are the harness's `subagent_tokens` per agent; the main session (the loop driver) is not included.
import { readFileSync } from "node:fs";
import { parseTranscript, summarizeCard } from "./loop-metrics-lib.mjs";

const [file, key] = process.argv.slice(2);
if (!file || (key !== undefined && !/^MFW-\d+$/.test(key))) {
  process.stderr.write("usage: node scripts/loop-metrics.mjs <transcript.jsonl> [MFW-n]\n");
  process.exit(2);
}
let text;
try {
  text = readFileSync(file, "utf8");
} catch (err) {
  process.stderr.write(`error: cannot read ${file}: ${err.message}\n`);
  process.exit(2);
}
const runs = parseTranscript(text);
const keys = key ? [key] : [...new Set(runs.map((r) => r.key))];
const cards = keys.map((k) => ({ key: k, ...summarizeCard(runs, k) }));
process.stdout.write(JSON.stringify(key ? cards[0] : cards, null, 2) + "\n");
