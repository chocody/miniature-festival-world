// A fake `gh` for spawn tests (scripts/gh-rest.mjs, scripts/wait-ci.sh).
// Rules come from the JSON file at $FAKE_GH_RULES:
//   [{ "match": string[], "stdout"?: string, "stderr"?: string, "code"?: number, "times"?: number }]
// A rule matches when every `match` string is a substring of the joined arguments; the first matching rule
// with remaining `times` (default unlimited) wins. Every call is appended to $FAKE_GH_LOG as one JSON line.
// The GH_TOKEN value itself is never written.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const token = process.env.GH_TOKEN;
appendFileSync(
  process.env.FAKE_GH_LOG,
  JSON.stringify({
    args,
    ghToken: token ? "set" : "unset",
    ghTokenValue: token === "proxy-injected" ? "placeholder" : token ? "other" : "none",
  }) + "\n",
);

const rules = JSON.parse(readFileSync(process.env.FAKE_GH_RULES, "utf8"));
const joined = args.join(" ");
const rule = rules.find((r) => r.match.every((m) => joined.includes(m)) && (r.times === undefined || r.times > 0));
if (!rule) {
  process.stderr.write(`fake gh: no rule for ${joined}\n`);
  process.exit(99);
}
if (rule.times !== undefined) {
  rule.times -= 1;
  writeFileSync(process.env.FAKE_GH_RULES, JSON.stringify(rules));
}
if (rule.stdout) process.stdout.write(rule.stdout);
if (rule.stderr) process.stderr.write(rule.stderr);
process.exit(rule.code ?? 0);
