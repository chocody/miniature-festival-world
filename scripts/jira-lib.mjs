// Pure logic for scripts/jira.mjs: no network, no filesystem, no process access.
// Everything here is unit-tested in tests/unit/jira-lib.test.ts.

// ---------------------------------------------------------------------------
// Site facts (MFW on chocody.atlassian.net, team-managed Scrum)
// ---------------------------------------------------------------------------

export const SITE = "https://chocody.atlassian.net";
export const PROJECT_KEY = "MFW";

/** @type {Record<string, string>} */
export const ISSUE_TYPE_IDS = {
  Epic: "10006",
  Subtask: "10007",
  Task: "10008",
  Story: "10009",
  Bug: "10011",
};

/** Transition ids are the same for every issue type on this site. */
export const TRANSITIONS = {
  todo: { id: "11", status: "To Do" },
  "in-progress": { id: "21", status: "In Progress" },
  "in-review": { id: "31", status: "In Review" },
  done: { id: "41", status: "Done" },
};

export const LINK_TYPE = "Blocks";
export const LABEL_NEEDS_HUMAN = "needs-human";
export const LABEL_STUB = "stub";
export const LABEL_OWNER_MERGE = "owner-merge";
/** Every comment written by the automation starts with this marker, so human comments can be told apart. */
export const BOT_PREFIX = "[mfw-loop]";
export const RISK_LABELS = ["privacy", "db", "migration"];

const KEY_RE = /^MFW-\d+$/;

/** @param {unknown} key */
export function isValidKey(key) {
  return typeof key === "string" && KEY_RE.test(key);
}

/** Jira labels cannot contain whitespace. @param {unknown} label */
export function isValidLabel(label) {
  return typeof label === "string" && label.length > 0 && label.length <= 255 && !/\s/.test(label);
}

/** @param {string} id */
export const epicLabel = (id) => `spec-epic-${id}`;
/** @param {string} id */
export const taskLabel = (id) => `spec-task-${id}`;

/**
 * @param {string[] | undefined} labels
 * @returns {{ kind: "epic" | "task", id: string } | null}
 */
export function specIdFromLabels(labels) {
  for (const label of labels ?? []) {
    const epic = /^spec-epic-(.+)$/.exec(label);
    if (epic) return { kind: "epic", id: epic[1] };
    const task = /^spec-task-(.+)$/.exec(label);
    if (task) return { kind: "task", id: task[1] };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sprints: one sprint per epic (Jira Free allows one active sprint at a time)
// ---------------------------------------------------------------------------

/** Jira rejects sprint names longer than 30 characters. */
export const SPRINT_NAME_MAX = 30;

/**
 * Deterministic sprint name for an epic's spec id: L1 → "Sprint 1 (Loop 1)", LS → "Sprint LS".
 * @param {string} epicSpecId
 */
export function sprintNameForEpic(epicSpecId) {
  const loop = /^L(\d+)$/.exec(epicSpecId ?? "");
  const name = loop ? `Sprint ${loop[1]} (Loop ${loop[1]})` : `Sprint ${epicSpecId}`;
  if (!epicSpecId || name.length > SPRINT_NAME_MAX) throw new Error(`cannot derive a sprint name from ${JSON.stringify(epicSpecId)}`);
  return name;
}

/**
 * Decide what sprint-start must do, given the board's active/future sprints.
 * @param {{ id: number, name: string, state: string }[]} sprints
 * @param {string} name
 * @returns {{ action: "create" | "reuse-future" | "already-active", sprintId: number | null }}
 */
export function planSprintStart(sprints, name) {
  const active = sprints.filter((s) => s.state === "active");
  const mine = active.find((s) => s.name === name);
  if (mine) return { action: "already-active", sprintId: mine.id };
  if (active.length) {
    throw new Error(`sprint ${JSON.stringify(active[0].name)} is still active — complete it before starting ${JSON.stringify(name)}`);
  }
  const future = sprints.find((s) => s.state === "future" && s.name === name);
  return future ? { action: "reuse-future", sprintId: future.id } : { action: "create", sprintId: null };
}

/**
 * Issues in a sprint whose status category is not "done" (they block completing the sprint).
 * @param {{ key: string, fields?: { status?: { name?: string, statusCategory?: { key?: string } } } }[]} issues
 */
export function sprintIssuesNotDone(issues) {
  return (issues ?? [])
    .filter((i) => i?.fields?.status?.statusCategory?.key !== "done")
    .map((i) => ({ key: i.key, status: String(i?.fields?.status?.name ?? "") }));
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

export const CREDENTIAL_KEYS = ["JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN"];

/**
 * Parse KEY=VALUE lines. Ignores blank lines and # comments, accepts an optional `export ` prefix
 * and single/double quotes around the value.
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseEnvFile(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.endsWith(value[0])) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

/**
 * Environment variables win; the env file fills whatever is missing.
 * @param {Record<string, string | undefined>} env
 * @param {Record<string, string> | null} fileValues
 * @returns {{ ok: true, creds: { baseUrl: string, email: string, token: string } } | { ok: false, missing: string[], error?: string }}
 */
export function resolveCredentials(env, fileValues) {
  /** @type {Record<string, string>} */
  const merged = {};
  for (const k of CREDENTIAL_KEYS) {
    const v = (env[k] ?? "").trim() || (fileValues?.[k] ?? "").trim();
    if (v) merged[k] = v;
  }
  const missing = CREDENTIAL_KEYS.filter((k) => !merged[k]);
  if (missing.length) return { ok: false, missing };
  const baseUrl = merged.JIRA_BASE_URL.replace(/\/+$/, "");
  if (baseUrl !== SITE) {
    return {
      ok: false,
      missing: [],
      error: `JIRA_BASE_URL is "${baseUrl}" but MFW lives on ${SITE}. Refusing to talk to another Jira site.`,
    };
  }
  return { ok: true, creds: { baseUrl, email: merged.JIRA_EMAIL, token: merged.JIRA_API_TOKEN } };
}

/** @param {string} envFilePath @param {string[]} missing */
export function missingCredentialsMessage(envFilePath, missing) {
  return [
    `Jira credentials not found (missing: ${missing.join(", ")}).`,
    "",
    `Create ${envFilePath} (outside the repo, never commit it) with:`,
    "",
    `  JIRA_BASE_URL=${SITE}`,
    "  JIRA_EMAIL=<the Atlassian account email that owns the token>",
    "  JIRA_API_TOKEN=<API token>",
    "",
    "Create the token at https://id.atlassian.com/manage-profile/security/api-tokens",
    `then restrict the file: chmod 600 ${envFilePath}`,
    "Alternatively export the three variables in the environment.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Auth mode (local jira.env vs. credential injected by a network proxy) and the mandatory auth check
// ---------------------------------------------------------------------------

/** Placeholder sent in proxy mode; the network proxy overwrites the Authorization header. */
export const JIRA_PROXY_PLACEHOLDER = "proxy-injected";

/** Thrown when Jira auth is missing, rejected, anonymous or unreachable. jira.mjs maps it to exit 2. */
export class JiraAuthError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "JiraAuthError";
  }
}

/** @param {Record<string, string | undefined>} env */
function proxyUrl(env) {
  return (env.HTTPS_PROXY || env.https_proxy || "").trim();
}

/**
 * "proxy" = the network proxy injects the Jira credential (Claude Code cloud sessions);
 * "basic" = JIRA_EMAIL / JIRA_API_TOKEN from the environment or the env file.
 * `JIRA_AUTH=proxy|basic` forces it; otherwise proxy iff HTTPS_PROXY is set and no email/token exists anywhere.
 * @param {Record<string, string | undefined>} env
 * @param {Record<string, string> | null} fileValues
 * @returns {"proxy" | "basic"}
 */
export function jiraAuthMode(env, fileValues) {
  const forced = (env.JIRA_AUTH ?? "").trim().toLowerCase();
  if (forced === "proxy" || forced === "basic") return forced;
  if (forced) throw new JiraAuthError('JIRA_AUTH must be "proxy" or "basic"');
  const hasSecret = ["JIRA_EMAIL", "JIRA_API_TOKEN"].some(
    (k) => (env[k] ?? "").trim() || (fileValues?.[k] ?? "").trim(),
  );
  return proxyUrl(env) && !hasSecret ? "proxy" : "basic";
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {Record<string, string> | null} fileValues
 * @returns {{ ok: true, mode: "proxy" | "basic", creds: { baseUrl: string, email: string, token: string } }
 *   | { ok: false, mode: "proxy" | "basic", missing: string[], error?: string }}
 */
export function resolveJiraAuth(env, fileValues) {
  /** @type {"proxy" | "basic"} */
  let mode;
  try {
    mode = jiraAuthMode(env, fileValues);
  } catch (err) {
    return { ok: false, mode: "basic", missing: [], error: err instanceof Error ? err.message : String(err) };
  }
  if (mode === "basic") return { mode, ...resolveCredentials(env, fileValues) };
  if (!proxyUrl(env)) {
    return {
      ok: false,
      mode,
      missing: [],
      error: "JIRA_AUTH=proxy needs HTTPS_PROXY: the Jira credential is injected by the session's network proxy",
    };
  }
  const baseUrl = (env.JIRA_BASE_URL || fileValues?.JIRA_BASE_URL || SITE).trim().replace(/\/+$/, "");
  if (baseUrl !== SITE) {
    return {
      ok: false,
      mode,
      missing: [],
      error: `JIRA_BASE_URL is "${baseUrl}" but MFW lives on ${SITE}. Refusing to talk to another Jira site.`,
    };
  }
  return { ok: true, mode, creds: { baseUrl, email: JIRA_PROXY_PLACEHOLDER, token: JIRA_PROXY_PLACEHOLDER } };
}

/**
 * Node's built-in fetch only honours HTTPS_PROXY when the process starts with NODE_USE_ENV_PROXY=1.
 * @param {Record<string, string | undefined>} env
 */
export function needsProxyReexec(env) {
  return Boolean(proxyUrl(env)) && env.NODE_USE_ENV_PROXY !== "1";
}

/**
 * @param {any} body GET /rest/api/3/myself
 * @returns {{ ok: true, accountId: string, displayName: string } | { ok: false, reason: string }}
 */
export function checkMyself(body) {
  const accountId = typeof body?.accountId === "string" ? body.accountId.trim() : "";
  if (!accountId) return { ok: false, reason: "no accountId in the /myself reply" };
  if (body.accountType === "anonymous") return { ok: false, reason: "accountType is anonymous" };
  return { ok: true, accountId, displayName: String(body.displayName ?? "") };
}

/**
 * @param {"proxy" | "basic"} mode
 * @param {number} status 0 = unreachable; 200 with `anonymous` = Jira answered without authenticating
 * @param {string} detail
 * @param {string} envFileDisplay
 * @param {{ anonymous?: boolean }} [opts]
 */
export function authFailureMessage(mode, status, detail, envFileDisplay, opts = {}) {
  const first = opts.anonymous
    ? "Jira answered as an anonymous user (HTTP 200, no accountId)"
    : status === 0
      ? `Jira is unreachable: ${detail}`
      : `Jira authentication failed (HTTP ${status}): ${detail}`;
  /** @type {string[]} */
  const lines = [first];
  if (mode === "proxy") {
    if (status === 0 && !opts.anonymous) {
      lines.push("In proxy mode check that chocody.atlassian.net is an allowed host in the cloud environment's network settings.");
    } else {
      lines.push(
        "This session's Jira credential is injected by the network proxy. Check the network secret for chocody.atlassian.net in the cloud environment's settings: it must be Basic (Atlassian account email + API token) and the token must not be revoked.",
      );
      if (/Connect Session/i.test(detail)) {
        lines.push(
          "HTTP 403 'Failed to parse Connect Session Auth Token' means the secret was sent with the wrong auth type (e.g. Bearer); it must be Basic.",
        );
      }
    }
  } else if (status !== 0 || opts.anonymous) {
    lines.push(
      `Check JIRA_EMAIL / JIRA_API_TOKEN in the environment or ${envFileDisplay}; create a new token at https://id.atlassian.com/manage-profile/security/api-tokens if it was revoked.`,
    );
  }
  return lines.join("\n");
}

/**
 * Mandatory before any command: a revoked token makes Jira answer as an anonymous user (empty search
 * results, no error), which would otherwise look like "nothing exists yet".
 * @param {{ request: Function }} client
 * @param {"proxy" | "basic"} mode
 * @param {string} envFileDisplay
 * @returns {Promise<{ accountId: string, displayName: string }>}
 */
export async function verifyJiraAuth(client, mode, envFileDisplay) {
  let body;
  try {
    body = await client.request("GET", "/rest/api/3/myself");
  } catch (err) {
    if (err instanceof JiraError && (err.status === 401 || err.status === 403 || err.status === 0)) {
      throw new JiraAuthError(authFailureMessage(mode, err.status, err.message, envFileDisplay));
    }
    throw err;
  }
  const me = checkMyself(body);
  if (!me.ok) throw new JiraAuthError(authFailureMessage(mode, 200, me.reason, envFileDisplay, { anonymous: true }));
  return { accountId: me.accountId, displayName: me.displayName };
}

// ---------------------------------------------------------------------------
// Atlassian Document Format (ADF)
// ---------------------------------------------------------------------------

/** @typedef {{ type: string, text?: string, attrs?: Record<string, any>, marks?: { type: string, attrs?: Record<string, any> }[], content?: AdfNode[] }} AdfNode */

const INLINE_RE = /(`[^`\n]+`)|(https?:\/\/[^\s<>()`]+[^\s<>()`.,;:!?'"])/g;

/**
 * Plain text → inline ADF nodes. `code` spans get a code mark, http(s) URLs a link mark.
 * @param {string} text
 * @returns {AdfNode[]}
 */
export function inlineNodes(text) {
  /** @type {AdfNode[]} */
  const nodes = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) nodes.push({ type: "text", text: text.slice(last, idx) });
    if (m[1]) {
      nodes.push({ type: "text", text: m[1].slice(1, -1), marks: [{ type: "code" }] });
    } else {
      nodes.push({ type: "text", text: m[2], marks: [{ type: "link", attrs: { href: m[2] } }] });
    }
    last = idx + m[0].length;
  }
  if (last < text.length) nodes.push({ type: "text", text: text.slice(last) });
  return nodes;
}

/** @param {string} line @returns {AdfNode[]} inline nodes with hardBreaks between lines */
function inlineWithBreaks(line) {
  /** @type {AdfNode[]} */
  const out = [];
  line.split("\n").forEach((part, i) => {
    if (i > 0) out.push({ type: "hardBreak" });
    out.push(...inlineNodes(part));
  });
  return out;
}

/** @param {string} text @returns {AdfNode} */
export function paragraph(text) {
  return { type: "paragraph", content: inlineWithBreaks(text) };
}

/** @param {number} level @param {string} text @returns {AdfNode} */
export function heading(level, text) {
  return { type: "heading", attrs: { level }, content: inlineNodes(text) };
}

/** @param {string[]} items @returns {AdfNode} */
export function bulletList(items) {
  return {
    type: "bulletList",
    content: items.map((item) => ({ type: "listItem", content: [paragraph(item)] })),
  };
}

/**
 * Plain text → ADF doc. Blank lines separate paragraphs; single newlines become hard breaks;
 * consecutive lines starting with "- " or "* " become a bullet list; "# ", "## ", "### " lines become headings.
 * @param {string} text
 * @returns {{ type: "doc", version: 1, content: AdfNode[] }}
 */
export function textToAdf(text) {
  /** @type {AdfNode[]} */
  const blocks = [];
  /** @type {string[]} */
  let para = [];
  /** @type {string[]} */
  let bullets = [];
  const flushPara = () => {
    if (para.length) blocks.push(paragraph(para.join("\n")));
    para = [];
  };
  const flushBullets = () => {
    if (bullets.length) blocks.push(bulletList(bullets));
    bullets = [];
  };
  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.replace(/\s+$/, "");
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const head = /^(#{1,3})\s+(.*)$/.exec(line);
    if (!line.trim()) {
      flushPara();
      flushBullets();
    } else if (bullet) {
      flushPara();
      bullets.push(bullet[1]);
    } else if (head) {
      flushPara();
      flushBullets();
      blocks.push(heading(head[1].length, head[2]));
    } else {
      flushBullets();
      para.push(line);
    }
  }
  flushPara();
  flushBullets();
  if (!blocks.length) blocks.push({ type: "paragraph", content: [] });
  return { type: "doc", version: 1, content: blocks };
}

/**
 * Put the automation marker on a comment so `get` can tell it from human comments.
 * @param {string} text
 */
export function withBotPrefix(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith(BOT_PREFIX)) return trimmed;
  const firstLine = trimmed.split("\n", 1)[0] ?? "";
  if (!firstLine || /^\s*([-*]\s|#{1,3}\s)/.test(firstLine)) return `${BOT_PREFIX}\n\n${trimmed}`;
  return `${BOT_PREFIX} ${trimmed}`;
}

/** @param {AdfNode | undefined} node @returns {string} */
function inlineText(node) {
  if (!node) return "";
  switch (node.type) {
    case "text":
      return node.text ?? "";
    case "hardBreak":
      return "\n";
    case "mention":
      return String(node.attrs?.text ?? "@user");
    case "emoji":
      return String(node.attrs?.text ?? node.attrs?.shortName ?? "");
    case "inlineCard":
      return String(node.attrs?.url ?? "");
    case "status":
      return String(node.attrs?.text ?? "");
    case "date": {
      const ts = Number(node.attrs?.timestamp);
      return Number.isFinite(ts) ? new Date(ts).toISOString().slice(0, 10) : "";
    }
    default:
      return (node.content ?? []).map(inlineText).join("");
  }
}

/** @param {AdfNode} node @param {string} indent @returns {string[]} */
function blockLines(node, indent) {
  switch (node.type) {
    case "doc":
      return (node.content ?? []).flatMap((c) => blockLines(c, indent));
    case "paragraph":
    case "heading":
      return inlineText(node)
        .split("\n")
        .map((l) => indent + l);
    case "codeBlock":
      return inlineText(node)
        .split("\n")
        .map((l) => indent + l);
    case "bulletList":
    case "orderedList": {
      const start = Number(node.attrs?.order ?? 1);
      return (node.content ?? []).flatMap((item, i) => {
        const marker = node.type === "bulletList" ? "- " : `${start + i}. `;
        const lines = (item.content ?? []).flatMap((c) => blockLines(c, ""));
        if (!lines.length) return [indent + marker.trimEnd()];
        return lines.map((l, j) => (j === 0 ? indent + marker + l : indent + "  " + l));
      });
    }
    case "blockquote":
      return (node.content ?? []).flatMap((c) => blockLines(c, "")).map((l) => `${indent}> ${l}`);
    case "rule":
      return [indent + "---"];
    case "table":
      return (node.content ?? []).map(
        (row) =>
          indent +
          (row.content ?? [])
            .map((cell) => (cell.content ?? []).flatMap((c) => blockLines(c, "")).join(" "))
            .join(" | "),
      );
    case "expand":
    case "nestedExpand":
      return [
        ...(node.attrs?.title ? [indent + String(node.attrs.title)] : []),
        ...(node.content ?? []).flatMap((c) => blockLines(c, indent)),
      ];
    case "mediaSingle":
    case "mediaGroup":
    case "media":
      return [indent + "[attachment]"];
    case "blockCard":
    case "embedCard":
      return [indent + String(node.attrs?.url ?? "")];
    default:
      if (node.content) return node.content.flatMap((c) => blockLines(c, indent));
      return [indent + inlineText(node)];
  }
}

/**
 * Flatten ADF (or a legacy plain-string description) to plain text.
 * @param {AdfNode | string | null | undefined} doc
 */
export function adfToText(doc) {
  if (doc == null) return "";
  if (typeof doc === "string") return doc;
  return blockLines(doc, "").join("\n");
}

/** Whitespace-insensitive form used to compare descriptions. @param {string} text */
export function normalizeText(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Issues, blockers and readiness
// ---------------------------------------------------------------------------

/** @param {any} status */
export function isDoneStatus(status) {
  return status?.statusCategory?.key === "done" || status?.name === TRANSITIONS.done.status;
}

/**
 * Link direction on this site (verified):
 *  - reading issue K: an issuelinks entry of type Blocks with `inwardIssue: X` means "K is blocked by X";
 *    one with `outwardIssue: Y` means "K blocks Y".
 *  - creating "BLOCKER blocks BLOCKED": POST /issueLink with inwardIssue = BLOCKER, outwardIssue = BLOCKED.
 * @param {any[] | undefined} issuelinks
 * @returns {{ key: string, summary: string, status: string, done: boolean }[]}
 */
export function blockersFromIssueLinks(issuelinks) {
  return (issuelinks ?? [])
    .filter((l) => l?.type?.name === LINK_TYPE && l.inwardIssue?.key)
    .map((l) => ({
      key: String(l.inwardIssue.key),
      summary: String(l.inwardIssue.fields?.summary ?? ""),
      status: String(l.inwardIssue.fields?.status?.name ?? "unknown"),
      done: isDoneStatus(l.inwardIssue.fields?.status),
    }));
}

/** @param {any[] | undefined} issuelinks @returns {string[]} keys this issue blocks */
export function blockedByThis(issuelinks) {
  return (issuelinks ?? [])
    .filter((l) => l?.type?.name === LINK_TYPE && l.outwardIssue?.key)
    .map((l) => String(l.outwardIssue.key));
}

/**
 * @param {string} blockerKey
 * @param {string} blockedKey
 */
export function blocksLinkPayload(blockerKey, blockedKey) {
  return {
    type: { name: LINK_TYPE },
    inwardIssue: { key: blockerKey },
    outwardIssue: { key: blockedKey },
  };
}

/**
 * @typedef {{
 *   key: string, summary: string, status: string, statusDone: boolean, type: string, labels: string[],
 *   epic: { key: string, summary: string } | null, parentKey: string | null, specId: string | null,
 *   blockers: { key: string, summary: string, status: string, done: boolean }[]
 * }} Issue
 */

/** @param {any} raw Jira issue as returned by search or GET issue @returns {Issue} */
export function normalizeIssue(raw) {
  const f = raw?.fields ?? {};
  const parent = f.parent ?? null;
  const parentType = parent?.fields?.issuetype?.name;
  const spec = specIdFromLabels(f.labels);
  return {
    key: String(raw?.key ?? ""),
    summary: String(f.summary ?? ""),
    status: String(f.status?.name ?? "unknown"),
    statusDone: isDoneStatus(f.status),
    type: String(f.issuetype?.name ?? "unknown"),
    labels: Array.isArray(f.labels) ? f.labels.map(String) : [],
    epic:
      parent && (parentType === undefined || parentType === "Epic")
        ? { key: String(parent.key), summary: String(parent.fields?.summary ?? "") }
        : null,
    parentKey: parent ? String(parent.key) : null,
    specId: spec?.id ?? null,
    blockers: blockersFromIssueLinks(f.issuelinks),
  };
}

/**
 * Why a ticket may (not) be picked up by loop-ticket.
 * @param {Issue} issue
 * @returns {{ ready: boolean, reasons: string[] }}
 */
export function evaluateReadiness(issue) {
  const reasons = [];
  if (issue.status !== TRANSITIONS.todo.status) reasons.push(`status is "${issue.status}", not "To Do"`);
  if (issue.type === "Epic") reasons.push("is an Epic");
  if (issue.type === "Subtask" || issue.type === "Sub-task") reasons.push("is a Subtask");
  if (issue.labels.includes(LABEL_NEEDS_HUMAN)) reasons.push(`labelled ${LABEL_NEEDS_HUMAN}`);
  if (issue.labels.includes(LABEL_STUB)) reasons.push(`labelled ${LABEL_STUB}`);
  for (const b of issue.blockers) {
    if (!b.done) reasons.push(`blocked by ${b.key} (${b.status})`);
  }
  return { ready: reasons.length === 0, reasons };
}

/**
 * AC6: privacy/db/migration tickets get a green PR but are never auto-merged; the owner merges.
 * @param {string[]} labels
 * @returns {{ required: boolean, reasons: string[] }}
 */
export function requiresOwnerMerge(labels) {
  const reasons = RISK_LABELS.filter((l) => labels.includes(l)).map((l) => `label ${l}`);
  return { required: reasons.length > 0, reasons };
}

/**
 * Tickets someone (probably a crashed run) is already working on: In Progress / In Review and not
 * parked with needs-human. loop-ticket refuses to start a new ticket while any exist, except keys the
 * current run claimed itself (parallel lanes). Tickets labelled owner-merge are In Review waiting for the
 * owner to merge their green PR: no run owns them, so they are not in flight.
 * @param {Issue[]} issues
 */
export function inFlight(issues) {
  return issues
    .filter(
      (i) =>
        i.type !== "Epic" &&
        (i.status === TRANSITIONS["in-progress"].status || i.status === TRANSITIONS["in-review"].status) &&
        !i.labels.includes(LABEL_NEEDS_HUMAN) &&
        !i.labels.includes(LABEL_OWNER_MERGE),
    )
    .map((i) => ({ key: i.key, status: i.status, summary: i.summary }));
}

/**
 * In Review tickets waiting for the owner to merge their green PR.
 * @param {Issue[]} issues
 */
export function awaitingOwner(issues) {
  return issues
    .filter((i) => i.type !== "Epic" && i.status === TRANSITIONS["in-review"].status && i.labels.includes(LABEL_OWNER_MERGE))
    .map((i) => ({ key: i.key, status: i.status, summary: i.summary }));
}

/**
 * Pick the next ticket. `issues` must already be in Jira rank order (JQL `ORDER BY Rank ASC, key ASC`);
 * the order is preserved.
 * @param {Issue[]} issues
 * @param {{ epicKey?: string | null }} [opts]
 */
export function pickNext(issues, opts = {}) {
  const epicKey = opts.epicKey ?? null;
  const pool = epicKey ? issues.filter((i) => i.epic?.key === epicKey) : issues;
  const flying = inFlight(issues);
  /** @type {{ key: string, reasons: string[] }[]} */
  const skipped = [];
  for (const issue of pool) {
    const { ready, reasons } = evaluateReadiness(issue);
    if (ready) {
      return {
        key: issue.key,
        summary: issue.summary,
        labels: issue.labels,
        epic: issue.epic,
        specId: issue.specId,
        inFlight: flying,
      };
    }
    if (issue.status === TRANSITIONS.todo.status && issue.type !== "Epic") skipped.push({ key: issue.key, reasons });
  }
  const scope = epicKey ? ` in epic ${epicKey}` : "";
  const reason = skipped.length
    ? `no ready ticket${scope}: ${skipped.length} To Do ticket(s) are blocked, stubs or need a human`
    : `no To Do ticket${scope}`;
  return { key: null, reason, skipped, inFlight: flying };
}

/**
 * Every ready ticket in rank order (for parallel lanes). Same readiness rules and reason text as pickNext.
 * @param {Issue[]} issues
 * @param {{ epicKey?: string | null }} [opts]
 */
export function listReady(issues, opts = {}) {
  const epicKey = opts.epicKey ?? null;
  const pool = epicKey ? issues.filter((i) => i.epic?.key === epicKey) : issues;
  /** @type {{ key: string, summary: string, labels: string[], epic: Issue["epic"], specId: Issue["specId"] }[]} */
  const ready = [];
  /** @type {{ key: string, reasons: string[] }[]} */
  const skipped = [];
  for (const issue of pool) {
    const r = evaluateReadiness(issue);
    if (r.ready) {
      ready.push({ key: issue.key, summary: issue.summary, labels: issue.labels, epic: issue.epic, specId: issue.specId });
    } else if (issue.status === TRANSITIONS.todo.status && issue.type !== "Epic") {
      skipped.push({ key: issue.key, reasons: r.reasons });
    }
  }
  const scope = epicKey ? ` in epic ${epicKey}` : "";
  const reason = ready.length
    ? null
    : skipped.length
      ? `no ready ticket${scope}: ${skipped.length} To Do ticket(s) are blocked, stubs or need a human`
      : `no To Do ticket${scope}`;
  return { ready, skipped, inFlight: inFlight(issues), awaitingOwner: awaitingOwner(issues), reason };
}

/**
 * Parse the machine-readable outcome line loop-ticket writes on merge or park, e.g.
 * "Outcome: size=M dev=sonnet fixRounds=1 ciRuns=1 files=7 lines=+210/-12 result=merged".
 * Also picks up the first GitHub PR URL in the same comment.
 * @param {string} text
 * @returns {{ size?: string, dev?: string, fixRounds?: number, ciRuns?: number, files?: number, lines?: string, result?: string, prUrl: string | null } | null}
 */
export function parseOutcome(text) {
  const m = /Outcome:\s*([^\n]+)/.exec(text);
  if (!m) return null;
  /** @type {Record<string, string>} */
  const kv = {};
  for (const pair of m[1].trim().split(/\s+/)) {
    const i = pair.indexOf("=");
    if (i > 0) kv[pair.slice(0, i)] = pair.slice(i + 1);
  }
  /** @param {string | undefined} v */
  const num = (v) => (v !== undefined && /^\d+$/.test(v) ? Number(v) : undefined);
  const pr = /https:\/\/github\.com\/[^\s]+\/pull\/\d+/.exec(text);
  return {
    size: kv.size,
    dev: kv.dev,
    fixRounds: num(kv.fixRounds),
    ciRuns: num(kv.ciRuns),
    files: num(kv.files),
    lines: kv.lines,
    result: kv.result,
    prUrl: pr ? pr[0] : null,
  };
}

/**
 * Epic status for loop-epic: children (rank order), their latest recorded outcome, and whether the epic
 * may be closed (it has children and every child is Done).
 * @param {Issue[]} children
 * @param {Record<string, ReturnType<typeof parseOutcome>>} outcomes latest outcome per child key
 */
export function summarizeEpic(children, outcomes = {}) {
  const rows = children.map((c) => {
    const r = evaluateReadiness(c);
    return {
      key: c.key,
      summary: c.summary,
      status: c.status,
      done: c.statusDone,
      labels: c.labels,
      specId: c.specId,
      ready: r.ready,
      notReadyReasons: r.reasons,
      outcome: outcomes[c.key] ?? null,
    };
  });
  return {
    children: rows,
    counts: {
      total: rows.length,
      done: rows.filter((r) => r.done).length,
      ready: rows.filter((r) => r.ready).length,
      needsHuman: rows.filter((r) => r.labels.includes(LABEL_NEEDS_HUMAN)).length,
    },
    needsHuman: rows.filter((r) => r.labels.includes(LABEL_NEEDS_HUMAN)).map((r) => ({ key: r.key, status: r.status, summary: r.summary })),
    awaitingOwner: rows
      .filter((r) => r.labels.includes(LABEL_OWNER_MERGE) && !r.done)
      .map((r) => ({ key: r.key, status: r.status, summary: r.summary })),
    allDone: rows.length > 0 && rows.every((r) => r.done),
  };
}

/**
 * Acceptance criteria listed in a (flattened) Jira description under a heading/line named
 * "Acceptance criteria": the list items ("- x", "* x", "1. x") directly following it.
 * @param {string} text
 * @returns {string[]}
 */
export function acFromDescription(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^\s*#*\s*acceptance criteria\s*:?\s*$/i.test(l));
  if (start < 0) return [];
  /** @type {string[]} */
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim()) continue;
    const m = /^\s*(?:[-*]|\d+[.)])\s+(.*\S)\s*$/.exec(line);
    if (!m) break;
    out.push(m[1]);
  }
  return out;
}

/**
 * A ticket is only workable when its acceptance criteria are known: from its docs/backlog.json entry
 * (found through the spec-task label), or — failing that — from an explicit "Acceptance criteria"
 * section in the Jira description.
 * @param {{ ac?: string[] } | null} spec
 * @param {string} descriptionText
 * @returns {{ ok: boolean, source: "backlog" | "description" | null, ac: string[], reason: string | null }}
 */
export function acceptanceCriteriaSource(spec, descriptionText) {
  if (spec && (spec.ac ?? []).length) return { ok: true, source: "backlog", ac: spec.ac ?? [], reason: null };
  const fromDescription = acFromDescription(descriptionText);
  if (fromDescription.length) return { ok: true, source: "description", ac: fromDescription, reason: null };
  return {
    ok: false,
    source: null,
    ac: [],
    reason: spec
      ? "spec entry in docs/backlog.json has no acceptance criteria"
      : "no spec entry in docs/backlog.json (no spec-task-<id> label) and no \"Acceptance criteria\" section in the Jira description",
  };
}

// ---------------------------------------------------------------------------
// Size estimate and open questions
// ---------------------------------------------------------------------------

const SIZES = ["S", "M", "L"];

/**
 * Mechanical baseline for the S/M/L estimate. The skill may only raise it (cross-cutting work or a
 * new subsystem → L); it never goes below the risk floor. `devModel` is `sonnet` for every size (owner rule
 * 2026-11-23: dev runs on sonnet when the lead's spec is file-level; the skill switches to opus only if it is not).
 * @param {{ acCount: number, labels: string[] }} input
 */
export function suggestSize({ acCount, labels }) {
  const reasons = [];
  let size = acCount <= 2 ? "S" : acCount <= 4 ? "M" : "L";
  reasons.push(`${acCount} acceptance criteria → ${size}`);
  const risky = labels.filter((l) => RISK_LABELS.includes(l));
  const floor = risky.length ? "M" : "S";
  if (risky.length) {
    reasons.push(`risk label(s) ${risky.join(", ")} → at least M`);
    if (SIZES.indexOf(size) < SIZES.indexOf(floor)) size = floor;
  }
  return { size, floor, reasons, devModel: "sonnet" };
}

/** The only marker that closes an open question: `Decided in MFW-<n>` (optionally followed by `: <decision>`). */
export const DECIDED_MARKER_RE = /\bDecided in MFW-\d+\b/i;

/**
 * @param {string[]} cells
 * @param {number} iQ question column
 * @param {number} iDecide "Decide in" column
 * @param {number} iStatus optional status/decision column (-1 when absent)
 */
function isResolvedRow(cells, iQ, iDecide, iStatus) {
  if (DECIDED_MARKER_RE.test(cells[iDecide] ?? "")) return true;
  if (iStatus >= 0 && DECIDED_MARKER_RE.test(cells[iStatus] ?? "")) return true;
  return /^~~[\s\S]*~~$/.test((cells[iQ] ?? "").trim());
}

/**
 * Rows of docs/spec/open-questions.md whose "Decide in" column names this ticket key.
 * A row is resolved ONLY when its "Decide in" cell (or a "Status"/"Decision" column, if the table has one)
 * contains `Decided in MFW-<n>`, or its question cell is struck through (`~~ … ~~`). The word "decided"
 * anywhere else in the row means nothing (e.g. "Who decided the cap?" is still open).
 * @param {string} markdown
 * @param {string} key e.g. "MFW-8"
 */
export function openQuestionsFor(markdown, key) {
  const lines = markdown.split("\n").filter((l) => l.trim().startsWith("|"));
  if (lines.length < 2) return [];
  /** @param {string} l */
  const cells = (l) =>
    l
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
  const header = cells(lines[0]).map((h) => h.toLowerCase());
  const col = (/** @type {string} */ name, /** @type {number} */ fallback) => {
    const i = header.findIndex((h) => h.includes(name));
    return i >= 0 ? i : fallback;
  };
  const iNum = col("#", 0);
  const iQ = col("question", 1);
  const iRef = col("spec", 2);
  const iDecide = col("decide", header.length - 1);
  const iStatus = header.findIndex((h) => h.includes("status") || h.includes("decision"));
  const keyRe = new RegExp(`(^|[^A-Za-z0-9-])${key.replace(/[-]/g, "\\-")}(?![0-9])`);
  return lines
    .slice(1)
    .filter((l) => !/^\|?\s*:?-{3,}/.test(l.trim()))
    .map(cells)
    .filter((c) => keyRe.test(c[iDecide] ?? ""))
    .map((c) => ({
      number: c[iNum] ?? "",
      question: c[iQ] ?? "",
      specRef: c[iRef] ?? "",
      decideIn: c[iDecide] ?? "",
      resolved: isResolvedRow(c, iQ, iDecide, iStatus),
    }));
}

// ---------------------------------------------------------------------------
// Backlog → Jira sync planning
// ---------------------------------------------------------------------------

/**
 * @typedef {{ id: string, type?: string, summary: string, goal?: string, ac?: string[], labels?: string[], blockedBy?: string[] }} BacklogStory
 * @typedef {{ id: string, summary: string, description?: string, labels?: string[], stories: BacklogStory[] }} BacklogEpic
 * @typedef {{ epics: BacklogEpic[] }} Backlog
 */

/**
 * Structural checks on docs/backlog.json. Returns a list of problems (empty = valid).
 * @param {Backlog} backlog
 */
export function validateBacklog(backlog) {
  const errors = [];
  if (!backlog || !Array.isArray(backlog.epics)) return ["backlog.epics must be an array"];
  const ids = new Set();
  /** @type {Map<string, string[]>} */
  const deps = new Map();
  for (const epic of backlog.epics) {
    if (!epic.id || !epic.summary) errors.push(`epic ${JSON.stringify(epic.id)} needs id and summary`);
    if (ids.has(epic.id)) errors.push(`duplicate id ${epic.id}`);
    ids.add(epic.id);
    if (!Array.isArray(epic.stories)) {
      errors.push(`epic ${epic.id} has no stories array`);
      continue;
    }
    for (const s of epic.stories) {
      if (!s.id || !s.summary) errors.push(`story ${JSON.stringify(s.id)} in ${epic.id} needs id and summary`);
      if (ids.has(s.id)) errors.push(`duplicate id ${s.id}`);
      ids.add(s.id);
      if (s.type && !ISSUE_TYPE_IDS[s.type]) errors.push(`story ${s.id} has unknown type ${s.type}`);
      if (s.type === "Epic") errors.push(`story ${s.id} cannot be of type Epic`);
      for (const l of s.labels ?? []) if (!isValidLabel(l)) errors.push(`story ${s.id} has invalid label ${JSON.stringify(l)}`);
      const blockedBy = s.blockedBy ?? [];
      if (!Array.isArray(blockedBy)) errors.push(`story ${s.id}: blockedBy must be an array`);
      else {
        const dup = blockedBy.filter((b, i) => blockedBy.indexOf(b) !== i);
        if (dup.length) errors.push(`story ${s.id} lists blocker(s) more than once: ${[...new Set(dup)].join(", ")}`);
      }
      deps.set(s.id, Array.isArray(blockedBy) ? blockedBy : []);
    }
    for (const l of epic.labels ?? []) if (!isValidLabel(l)) errors.push(`epic ${epic.id} has invalid label ${JSON.stringify(l)}`);
  }
  for (const [id, blockers] of deps) {
    for (const b of blockers) {
      if (b === id) errors.push(`story ${id} blocks itself`);
      else if (!deps.has(b)) errors.push(`story ${id} is blocked by unknown story ${b}`);
    }
  }
  // Cycle detection (DFS) — a cycle would deadlock `next`.
  /** @type {Map<string, number>} */
  const state = new Map();
  /** @param {string} id @param {string[]} path */
  const visit = (id, path) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) {
      errors.push(`dependency cycle: ${[...path.slice(path.indexOf(id)), id].join(" → ")}`);
      return;
    }
    state.set(id, 1);
    for (const b of deps.get(id) ?? []) if (deps.has(b)) visit(b, [...path, id]);
    state.set(id, 2);
  };
  for (const id of deps.keys()) visit(id, []);
  return errors;
}

const SOURCE_NOTE = "source: docs/backlog.json (edit there, then run /spec-to-jira)";

/** @param {BacklogEpic} epic */
export function epicDescriptionAdf(epic) {
  return {
    type: "doc",
    version: 1,
    content: [...(epic.description ? [paragraph(epic.description)] : []), paragraph(`Spec id: ${epic.id} — ${SOURCE_NOTE}`)],
  };
}

/** @param {BacklogStory} story */
export function storyDescriptionAdf(story) {
  /** @type {AdfNode[]} */
  const content = [];
  if (story.goal) content.push(heading(3, "Goal"), paragraph(story.goal));
  if (story.ac?.length) content.push(heading(3, "Acceptance criteria"), bulletList(story.ac));
  if (story.blockedBy?.length) content.push(paragraph(`Blocked by (spec ids): ${story.blockedBy.join(", ")}`));
  content.push(paragraph(`Spec id: ${story.id} — ${SOURCE_NOTE}`));
  return { type: "doc", version: 1, content };
}

/**
 * @typedef {{
 *   specId: string, kind: "epic" | "task", specLabel: string, typeName: string, typeId: string,
 *   summary: string, description: AdfNode, labels: string[], parentSpecId: string | null, blockedBy: string[]
 * }} DesiredIssue
 */

/** @param {Backlog} backlog @returns {DesiredIssue[]} in backlog order (each epic, then its stories) */
export function desiredIssues(backlog) {
  /** @type {DesiredIssue[]} */
  const out = [];
  for (const epic of backlog.epics) {
    const specLabel = epicLabel(epic.id);
    out.push({
      specId: epic.id,
      kind: "epic",
      specLabel,
      typeName: "Epic",
      typeId: ISSUE_TYPE_IDS.Epic,
      summary: epic.summary.trim(),
      description: epicDescriptionAdf(epic),
      labels: uniq([...(epic.labels ?? []), specLabel]),
      parentSpecId: null,
      blockedBy: [],
    });
    for (const s of epic.stories) {
      const typeName = s.type ?? "Story";
      const label = taskLabel(s.id);
      out.push({
        specId: s.id,
        kind: "task",
        specLabel: label,
        typeName,
        typeId: ISSUE_TYPE_IDS[typeName],
        // Story summaries carry their spec id ("[1.2] …") so the board reads in spec order.
        summary: `[${s.id}] ${s.summary.trim()}`,
        description: storyDescriptionAdf(s),
        labels: uniq([...(s.labels ?? []), label]),
        parentSpecId: epic.id,
        blockedBy: s.blockedBy ?? [],
      });
    }
  }
  return out;
}

/** @template T @param {T[]} xs @returns {T[]} */
function uniq(xs) {
  return [...new Set(xs)];
}

/** @param {string} a @param {string} b first differing line of two normalized texts */
function firstDifference(a, b) {
  const la = a.split("\n");
  const lb = b.split("\n");
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) return { line: i + 1, from: la[i] ?? "", to: lb[i] ?? "" };
  }
  return null;
}

/**
 * Compute what sync-backlog must do. Pure: takes the backlog, the raw Jira issues of the project and the
 * current backlog-keys.json; returns a plan. Never plans a deletion or a label removal.
 *
 * Matching: by spec label (spec-epic-<id> / spec-task-<id>). If no issue carries the label but
 * backlog-keys.json names an existing issue that no other spec id claims, that issue is reused and the
 * label is added (protects against duplicates when a label was removed by hand).
 *
 * @param {{ backlog: Backlog, issues: any[], keys?: Record<string, string> }} input
 */
export function planSync({ backlog, issues, keys = {} }) {
  const errors = validateBacklog(backlog);
  /** @type {string[]} */
  const warnings = [];
  const desired = errors.length ? [] : desiredIssues(backlog);
  const desiredIds = new Set(desired.map((d) => d.specId));

  /** @type {Map<string, any>} */
  const byKey = new Map(issues.map((i) => [String(i.key), i]));
  /** @type {Map<string, any[]>} label → issues */
  const byLabel = new Map();
  for (const raw of issues) {
    for (const label of raw.fields?.labels ?? []) {
      if (!/^spec-(epic|task)-/.test(label)) continue;
      byLabel.set(label, [...(byLabel.get(label) ?? []), raw]);
    }
  }
  for (const [label, list] of byLabel) {
    if (list.length > 1) {
      errors.push(`label ${label} is on ${list.length} issues (${list.map((i) => i.key).join(", ")}); fix by hand, sync aborted`);
    }
  }

  /** @type {Map<string, string>} specId → existing key */
  const matched = new Map();
  /** @type {Set<string>} */
  const claimed = new Set();
  for (const d of desired) {
    const hit = byLabel.get(d.specLabel);
    if (hit?.length === 1) {
      matched.set(d.specId, String(hit[0].key));
      claimed.add(String(hit[0].key));
      if (keys[d.specId] && keys[d.specId] !== hit[0].key) {
        warnings.push(`${d.specId}: backlog-keys.json says ${keys[d.specId]} but ${hit[0].key} carries ${d.specLabel}; using ${hit[0].key}`);
      }
    }
  }
  for (const d of desired) {
    if (matched.has(d.specId) || byLabel.get(d.specLabel)?.length) continue;
    const k = keys[d.specId];
    if (!k) continue;
    if (!byKey.has(k)) {
      warnings.push(`${d.specId}: backlog-keys.json says ${k} but it was not found in Jira; it will be created`);
    } else if (claimed.has(k)) {
      warnings.push(`${d.specId}: backlog-keys.json says ${k} but that issue already belongs to another spec id; it will be created`);
    } else {
      warnings.push(`${d.specId}: ${k} has no ${d.specLabel} label; reusing it via backlog-keys.json and adding the label`);
      matched.set(d.specId, k);
      claimed.add(k);
    }
  }
  for (const id of Object.keys(keys)) {
    if (!desiredIds.has(id) && desired.length) warnings.push(`${id} (${keys[id]}) is in backlog-keys.json but not in backlog.json; left untouched`);
  }

  /** @type {{ specId: string, kind: string, typeName: string, typeId: string, summary: string, description: AdfNode, labels: string[], parentSpecId: string | null }[]} */
  const creates = [];
  /** @type {{ specId: string, key: string, summary?: { from: string, to: string }, description?: { line: number, from: string, to: string } | null, descriptionAdf?: AdfNode, labelsAdd?: string[], parent?: { from: string | null, toSpecId: string } }[]} */
  const updates = [];
  /** @type {{ specId: string, key: string }[]} */
  const unchanged = [];

  for (const d of desired) {
    const key = matched.get(d.specId);
    if (!key) {
      creates.push({
        specId: d.specId,
        kind: d.kind,
        typeName: d.typeName,
        typeId: d.typeId,
        summary: d.summary,
        description: d.description,
        labels: d.labels,
        parentSpecId: d.parentSpecId,
      });
      continue;
    }
    const raw = byKey.get(key);
    const f = raw?.fields ?? {};
    const actualType = String(f.issuetype?.name ?? "unknown");
    if (actualType !== d.typeName) {
      const msg = `${d.specId} (${key}) is a ${actualType} in Jira but ${d.typeName} in backlog.json; issue type is not changed`;
      if (d.kind === "epic" || actualType === "Epic") errors.push(msg);
      else warnings.push(msg);
    }
    /** @type {(typeof updates)[number]} */
    const change = { specId: d.specId, key };
    const summary = String(f.summary ?? "").trim();
    if (summary !== d.summary) change.summary = { from: summary, to: d.summary };
    const have = normalizeText(adfToText(f.description));
    const want = normalizeText(adfToText(d.description));
    if (have !== want) {
      change.description = firstDifference(have, want);
      change.descriptionAdf = d.description;
    }
    const existingLabels = new Set((f.labels ?? []).map(String));
    const labelsAdd = d.labels.filter((l) => !existingLabels.has(l));
    if (labelsAdd.length) change.labelsAdd = labelsAdd;
    if (d.parentSpecId) {
      const wantParent = matched.get(d.parentSpecId) ?? null;
      const haveParent = f.parent?.key ? String(f.parent.key) : null;
      if (!wantParent || haveParent !== wantParent) change.parent = { from: haveParent, toSpecId: d.parentSpecId };
    }
    if (Object.keys(change).length > 2) updates.push(change);
    else unchanged.push({ specId: d.specId, key });
  }

  /** @type {{ blockerSpecId: string, blockedSpecId: string, blockerKey: string | null, blockedKey: string | null }[]} */
  const links = [];
  let linksExisting = 0;
  for (const d of desired) {
    for (const b of d.blockedBy) {
      const blockerKey = matched.get(b) ?? null;
      const blockedKey = matched.get(d.specId) ?? null;
      if (blockerKey && blockedKey) {
        const blockedRaw = byKey.get(blockedKey);
        const blockerRaw = byKey.get(blockerKey);
        const already = blockersFromIssueLinks(blockedRaw?.fields?.issuelinks).some((x) => x.key === blockerKey);
        const reversed = blockersFromIssueLinks(blockerRaw?.fields?.issuelinks).some((x) => x.key === blockedKey);
        if (reversed) {
          warnings.push(`${blockedKey} blocks ${blockerKey} in Jira, but backlog says ${b} (${blockerKey}) blocks ${d.specId} (${blockedKey}); delete the reversed link by hand`);
        }
        if (already) {
          linksExisting++;
          continue;
        }
      }
      links.push({ blockerSpecId: b, blockedSpecId: d.specId, blockerKey, blockedKey });
    }
  }

  return { errors, warnings, creates, updates, unchanged, links, linksExisting };
}

/**
 * backlog-keys.json content: backlog order (epic, then its stories), followed by any older entries
 * that are no longer in the backlog (never dropped).
 * @param {Backlog} backlog
 * @param {Record<string, string>} keyBySpecId
 * @param {Record<string, string>} [previous]
 */
export function buildKeysFile(backlog, keyBySpecId, previous = {}) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const epic of backlog.epics) {
    if (keyBySpecId[epic.id]) out[epic.id] = keyBySpecId[epic.id];
    for (const s of epic.stories) if (keyBySpecId[s.id]) out[s.id] = keyBySpecId[s.id];
  }
  for (const [id, key] of Object.entries(previous)) if (!(id in out)) out[id] = key;
  return out;
}

// ---------------------------------------------------------------------------
// HTTP client (fetch is injected so the retry rules are testable without network)
// ---------------------------------------------------------------------------

export class JiraError extends Error {
  /** @param {string} message @param {number} status */
  constructor(message, status) {
    super(message);
    this.name = "JiraError";
    this.status = status;
  }
}

/** @param {unknown} body */
function summarizeErrorBody(body) {
  if (body && typeof body === "object") {
    const b = /** @type {any} */ (body);
    const parts = [...(Array.isArray(b.errorMessages) ? b.errorMessages : [])];
    if (b.errors && typeof b.errors === "object") {
      for (const [k, v] of Object.entries(b.errors)) parts.push(`${k}: ${v}`);
    }
    if (parts.length) return parts.join("; ").slice(0, 500);
  }
  return String(body ?? "").slice(0, 300);
}

/** @param {number} status */
function statusHint(status) {
  if (status === 401) return " — authentication failed: check JIRA_EMAIL / JIRA_API_TOKEN (token expired or revoked?)";
  if (status === 403) return " — the account lacks permission for this operation";
  if (status === 404) return " — not found (wrong key, or no permission to see it)";
  return "";
}

/**
 * @param {{
 *   baseUrl: string, email: string, token: string,
 *   fetchImpl?: typeof fetch, sleep?: (ms: number) => Promise<void>, timeoutMs?: number
 * }} opts
 */
export function createJiraClient({ baseUrl, email, token, fetchImpl = fetch, sleep, timeoutMs = 30000 }) {
  const auth = "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
  const wait = sleep ?? ((/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms)));

  /**
   * GET is retried on network errors and 502/503/504. Every method is retried on 429 (the request was
   * not processed). Writes are never retried on 5xx or network errors: they may have been applied.
   * @param {"GET" | "POST" | "PUT"} method
   * @param {string} path e.g. /rest/api/3/issue/MFW-1
   * @param {{ query?: Record<string, string | number | undefined>, body?: unknown }} [opts]
   */
  async function request(method, path, opts = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) qs.set(k, String(v));
    const url = baseUrl + path + (qs.size ? `?${qs}` : "");
    const maxAttempts = 4;
    for (let attempt = 1; ; attempt++) {
      /** @type {Response} */
      let res;
      try {
        res = await fetchImpl(url, {
          method,
          headers: {
            Authorization: auth,
            Accept: "application/json",
            ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (method === "GET" && attempt < maxAttempts) {
          await wait(1000 * 2 ** (attempt - 1));
          continue;
        }
        throw new JiraError(
          `${method} ${path} failed: ${msg}` +
            (method === "GET" ? "" : " (the write may or may not have been applied; check Jira before retrying)"),
          0,
        );
      }
      if (res.status === 429 && attempt < maxAttempts) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await wait(Math.min(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * attempt, 30000));
        continue;
      }
      if (method === "GET" && [502, 503, 504].includes(res.status) && attempt < maxAttempts) {
        await wait(1000 * 2 ** (attempt - 1));
        continue;
      }
      const text = res.status === 204 ? "" : await res.text();
      /** @type {any} */
      let body = text;
      if (text && (res.headers.get("content-type") ?? "").includes("json")) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }
      if (!res.ok) {
        throw new JiraError(`${method} ${path} → HTTP ${res.status}${statusHint(res.status)}: ${summarizeErrorBody(body)}`, res.status);
      }
      return text ? body : null;
    }
  }

  /**
   * Enhanced JQL search with nextPageToken paging.
   * @param {string} jql
   * @param {string[]} fields
   */
  async function search(jql, fields) {
    /** @type {any[]} */
    const issues = [];
    /** @type {string | undefined} */
    let nextPageToken;
    for (let page = 0; page < 100; page++) {
      const res = await request("GET", "/rest/api/3/search/jql", {
        query: { jql, fields: fields.join(","), maxResults: 100, nextPageToken },
      });
      issues.push(...(res?.issues ?? []));
      nextPageToken = res?.nextPageToken;
      if (!nextPageToken || res?.isLast === true) return issues;
    }
    throw new JiraError("search paging did not terminate after 100 pages", 0);
  }

  return { request, search };
}
