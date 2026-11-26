// Pure logic for scripts/loop-metrics.mjs: per-card cost of the loop's subagents, read from a Claude Code
// session transcript (JSONL). Unit-tested in tests/unit/loop-metrics.test.ts.
//
// An agent completion shows up as user-message text:
//   <summary>Agent "<description>" <status></summary> … <usage><subagent_tokens>N</subagent_tokens>
//   <tool_uses>N</tool_uses><duration_ms>N</duration_ms>
// The same agent can notify more than once (it was resumed): the largest token count per description wins.

/** @typedef {"lead"|"dev"|"reviewer"|"qa"|"perf"|"privacy"} Role */
/** @typedef {{ key: string, role: Role, description: string, tokens: number, toolUses: number, durationMs: number, startedAt: string }} AgentRun */

const COMPLETION_RE =
  /<summary>Agent "([^"]*)" ([^<]*)<\/summary>[\s\S]*?<usage><subagent_tokens>(\d+)<\/subagent_tokens><tool_uses>(\d+)<\/tool_uses><duration_ms>(\d+)/g;

/** A description that names a fix round of the dev (the loop allows at most one). */
export const FIX_ROUND_RE = /polish round|fix round|repair/i;

/**
 * Role from an Agent call description (`Lead|Dev|Review|QA|Perf|Privacy` + `MFW-<n>`); null when it is none of the loop's.
 * @param {string} description
 * @returns {Role | null}
 */
export function roleOf(description) {
  const d = String(description);
  if (!/MFW-\d+/.test(d)) return null;
  if (/perf/i.test(d)) return "perf";
  if (/privacy/i.test(d)) return "privacy";
  if (/^\s*lead\b/i.test(d)) return "lead";
  if (/^\s*dev\b/i.test(d)) return "dev";
  if (/^\s*(re-?)?review/i.test(d)) return "reviewer";
  if (/^\s*qa\b/i.test(d)) return "qa";
  return null;
}

/** @param {string} description @returns {string | null} */
export function keyOf(description) {
  return /MFW-\d+/.exec(String(description))?.[0] ?? null;
}

/**
 * @param {string} text JSONL transcript
 * @returns {AgentRun[]} one run per Agent description, in first-seen order
 */
export function parseTranscript(text) {
  /** @type {Map<string, { tokens: number, toolUses: number, durationMs: number, startedAt: string }>} */
  const seen = new Map();
  /** @param {string} s @param {string} ts */
  const scan = (s, ts) => {
    COMPLETION_RE.lastIndex = 0;
    let m;
    while ((m = COMPLETION_RE.exec(s))) {
      const v = { tokens: Number(m[3]), toolUses: Number(m[4]), durationMs: Number(m[5]), startedAt: ts };
      const prev = seen.get(m[1]);
      if (!prev) seen.set(m[1], v);
      else if (v.tokens > prev.tokens) seen.set(m[1], { ...v, startedAt: prev.startedAt });
    }
  };
  /** @param {unknown} o @param {string} ts */
  const walk = (o, ts) => {
    if (typeof o === "string") {
      if (o.includes("subagent_tokens")) scan(o, ts);
    } else if (Array.isArray(o)) o.forEach((x) => walk(x, ts));
    else if (o && typeof o === "object") Object.values(o).forEach((x) => walk(x, ts));
  };
  for (const line of String(text).split("\n")) {
    if (!line || !line.includes("subagent_tokens")) continue;
    /** @type {any} */
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e?.isSidechain) continue;
    walk(e, String(e?.timestamp ?? ""));
  }
  /** @type {AgentRun[]} */
  const runs = [];
  for (const [description, v] of seen) {
    const role = roleOf(description);
    const key = keyOf(description);
    if (role && key) runs.push({ key, role, description, ...v });
  }
  return runs;
}

/**
 * @param {AgentRun[]} runs
 * @param {string} key e.g. "MFW-60"
 */
export function summarizeCard(runs, key) {
  const mine = runs.filter((r) => r.key === key);
  /** @type {Record<string, number>} */
  const byRole = {};
  for (const r of mine) byRole[r.role] = (byRole[r.role] ?? 0) + r.tokens;
  return {
    tokens: mine.reduce((s, r) => s + r.tokens, 0),
    byRole,
    fixRounds: mine.filter((r) => FIX_ROUND_RE.test(r.description)).length,
    agents: mine.length,
  };
}
