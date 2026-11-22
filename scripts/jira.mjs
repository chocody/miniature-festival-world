#!/usr/bin/env node
// Jira CLI for the MFW loop skills (.claude/skills/{spec-to-jira,loop-ticket,loop-epic}).
// Dependency-free, Node >= 22 (global fetch). JSON on stdout; errors on stderr with a non-zero exit:
//   1 = usage / API / data error, 2 = credentials missing or pointing at the wrong site.
// Pure logic lives in ./jira-lib.mjs (unit-tested); this file only does I/O.

import { readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  PROJECT_KEY,
  SITE,
  TRANSITIONS,
  adfToText,
  blockedByThis,
  blocksLinkPayload,
  buildKeysFile,
  createJiraClient,
  evaluateReadiness,
  isValidKey,
  isValidLabel,
  missingCredentialsMessage,
  normalizeIssue,
  openQuestionsFor,
  parseEnvFile,
  parseOutcome,
  pickNext,
  planSync,
  resolveCredentials,
  suggestSize,
  summarizeEpic,
  textToAdf,
  withBotPrefix,
  BOT_PREFIX,
} from "./jira-lib.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKLOG_PATH = path.join(REPO, "docs/backlog.json");
const KEYS_PATH = path.join(REPO, "docs/backlog-keys.json");
const OPEN_QUESTIONS_PATH = path.join(REPO, "docs/spec/open-questions.md");
const DEFAULT_ENV_FILE = path.join(homedir(), ".config/mfw/jira.env");
const ENV_FILE = process.env.MFW_JIRA_ENV_FILE || DEFAULT_ENV_FILE;
const ENV_FILE_DISPLAY = ENV_FILE === DEFAULT_ENV_FILE ? "~/.config/mfw/jira.env" : ENV_FILE;

const ISSUE_FIELDS = ["summary", "status", "labels", "issuetype", "parent", "issuelinks"];

const USAGE = `Usage: node scripts/jira.mjs <command>

  next [--epic <MFW-n | L1>]                 next ready ticket (To Do, unblocked, not needs-human/stub/Epic)
  get <MFW-n>                                ticket details, blockers, readiness, spec AC, open questions, comments
  epic <MFW-n | L1>                          epic children in rank order, readiness, recorded outcomes, allDone
  transition <MFW-n> <todo|in-progress|in-review|done>
  comment <MFW-n> <text | ->                 "-" reads the text from stdin; prefixed with ${BOT_PREFIX}
  label <MFW-n> <add|remove> <label>
  sync-backlog [--dry-run]                   docs/backlog.json → Jira (create/update, never delete)

Credentials: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN from the environment, else ${ENV_FILE_DISPLAY}.`;

class UsageError extends Error {}
class ConfigError extends Error {}

// ---------------------------------------------------------------------------
// I/O helpers
// ---------------------------------------------------------------------------

async function loadCredentials() {
  const envComplete = ["JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN"].every((k) => (process.env[k] ?? "").trim());
  let fileValues = null;
  if (!envComplete) {
    try {
      fileValues = parseEnvFile(await readFile(ENV_FILE, "utf8"));
      const st = await stat(ENV_FILE);
      if (st.mode & 0o077) {
        process.stderr.write(`warning: ${ENV_FILE_DISPLAY} is readable by other users; run chmod 600 ${ENV_FILE_DISPLAY}\n`);
      }
    } catch (err) {
      if (err?.code !== "ENOENT") throw new ConfigError(`cannot read ${ENV_FILE_DISPLAY}: ${err?.code ?? err}`);
    }
  }
  const r = resolveCredentials(process.env, fileValues);
  if (!r.ok) throw new ConfigError(r.error ?? missingCredentialsMessage(ENV_FILE_DISPLAY, r.missing));
  return r.creds;
}

async function jira() {
  return createJiraClient(await loadCredentials());
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    if (err?.code === "ENOENT" && fallback !== undefined) return fallback;
    throw new Error(`cannot read ${path.relative(REPO, file)}: ${err?.message ?? err}`);
  }
}

async function readStdin() {
  let text = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

/** Write only when the content changed; atomic rename; keep the file's trailing-newline style. */
async function writeKeysFile(obj) {
  let before = "";
  try {
    before = await readFile(KEYS_PATH, "utf8");
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
  }
  const next = JSON.stringify(obj, null, 2) + (before === "" || before.endsWith("\n") ? "\n" : "");
  if (next === before) return false;
  const tmp = `${KEYS_PATH}.tmp-${process.pid}`;
  await writeFile(tmp, next, "utf8");
  await rename(tmp, KEYS_PATH);
  return true;
}

function requireKey(key) {
  if (!isValidKey(key)) throw new UsageError(`expected an issue key like ${PROJECT_KEY}-12, got ${JSON.stringify(key)}`);
  return key;
}

async function resolveEpicKey(client, arg) {
  let key = arg;
  if (!isValidKey(arg)) {
    const keys = await readJson(KEYS_PATH, {});
    if (!/^L[A-Za-z0-9]+$/.test(arg ?? "") || !keys[arg]) {
      throw new UsageError(`--epic needs an epic key (MFW-6) or a loop id from docs/backlog-keys.json (L1), got ${JSON.stringify(arg)}`);
    }
    key = keys[arg];
  }
  const raw = await client.request("GET", `/rest/api/3/issue/${key}`, { query: { fields: "issuetype,summary" } });
  if (raw?.fields?.issuetype?.name !== "Epic") throw new Error(`${key} is a ${raw?.fields?.issuetype?.name}, not an Epic`);
  return key;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdNext(args) {
  const { values } = parseArgs({ args, options: { epic: { type: "string" } }, allowPositionals: false });
  const client = await jira();
  const epicKey = values.epic ? await resolveEpicKey(client, values.epic) : null;
  // Fetch the whole active set project-wide: candidates come from To Do, and In Progress / In Review
  // tickets are reported as inFlight (loop-ticket refuses to start while one exists).
  const jql = `project = ${PROJECT_KEY} AND issuetype != Epic AND status in ("To Do", "In Progress", "In Review") ORDER BY Rank ASC, key ASC`;
  const issues = (await client.search(jql, ISSUE_FIELDS)).map(normalizeIssue);
  return pickNext(issues, { epicKey });
}

async function cmdGet(args) {
  const key = requireKey(args[0]);
  const client = await jira();
  const raw = await client.request("GET", `/rest/api/3/issue/${key}`, {
    query: { fields: [...ISSUE_FIELDS, "description"].join(",") },
  });
  const issue = normalizeIssue(raw);
  const readiness = evaluateReadiness(issue);
  const commentsRes = await client.request("GET", `/rest/api/3/issue/${key}/comment`, {
    query: { orderBy: "-created", maxResults: 20 },
  });
  const comments = (commentsRes?.comments ?? [])
    .map((c) => {
      const text = adfToText(c.body);
      return {
        author: String(c.author?.displayName ?? "unknown"),
        created: String(c.created ?? ""),
        automated: text.trimStart().startsWith(BOT_PREFIX),
        text,
      };
    })
    .reverse();

  const backlog = await readJson(BACKLOG_PATH);
  let spec = null;
  for (const epic of backlog.epics ?? []) {
    for (const s of epic.stories ?? []) {
      if (s.id === issue.specId) spec = { epicId: epic.id, ...s };
    }
  }
  let openQuestions = [];
  try {
    openQuestions = openQuestionsFor(await readFile(OPEN_QUESTIONS_PATH, "utf8"), key);
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
  }
  return {
    key: issue.key,
    url: `${SITE}/browse/${issue.key}`,
    summary: issue.summary,
    status: issue.status,
    type: issue.type,
    labels: issue.labels,
    epic: issue.epic,
    specId: issue.specId,
    ready: readiness.ready,
    notReadyReasons: readiness.reasons,
    blockers: issue.blockers,
    blocks: blockedByThis(raw?.fields?.issuelinks),
    spec,
    sizeHint: spec ? suggestSize({ acCount: (spec.ac ?? []).length, labels: issue.labels }) : null,
    openQuestions,
    description: adfToText(raw?.fields?.description),
    comments,
  };
}

async function cmdEpic(args) {
  if (args.length !== 1) throw new UsageError("epic <MFW-n | L1>");
  const client = await jira();
  const epicKey = await resolveEpicKey(client, args[0]);
  const epicRaw = await client.request("GET", `/rest/api/3/issue/${epicKey}`, { query: { fields: "summary,status,labels" } });
  const children = (await client.search(`parent = ${epicKey} ORDER BY Rank ASC, key ASC`, ISSUE_FIELDS))
    .map(normalizeIssue)
    .filter((c) => c.parentKey === epicKey);
  /** @type {Record<string, ReturnType<typeof parseOutcome>>} */
  const outcomes = {};
  for (const c of children) {
    const res = await client.request("GET", `/rest/api/3/issue/${c.key}/comment`, { query: { orderBy: "-created", maxResults: 50 } });
    for (const comment of res?.comments ?? []) {
      const text = adfToText(comment.body);
      if (!text.trimStart().startsWith(BOT_PREFIX)) continue;
      const outcome = parseOutcome(text);
      if (outcome) {
        outcomes[c.key] = outcome; // newest first, so the first hit is the latest
        break;
      }
    }
  }
  return {
    epic: {
      key: epicKey,
      url: `${SITE}/browse/${epicKey}`,
      summary: String(epicRaw?.fields?.summary ?? ""),
      status: String(epicRaw?.fields?.status?.name ?? ""),
    },
    ...summarizeEpic(children, outcomes),
  };
}

async function cmdTransition(args) {
  const key = requireKey(args[0]);
  const target = TRANSITIONS[args[1]];
  if (!target || args.length !== 2) throw new UsageError(`transition <KEY> <${Object.keys(TRANSITIONS).join("|")}>`);
  const client = await jira();
  const statusOf = async () =>
    String((await client.request("GET", `/rest/api/3/issue/${key}`, { query: { fields: "status" } }))?.fields?.status?.name ?? "");
  const before = await statusOf();
  if (before === target.status) return { key, status: before, changed: false };
  await client.request("POST", `/rest/api/3/issue/${key}/transitions`, { body: { transition: { id: target.id } } });
  const after = await statusOf();
  if (after !== target.status) {
    throw new Error(`${key}: transition ${target.id} was accepted but status is "${after}", expected "${target.status}"`);
  }
  return { key, from: before, status: after, changed: true };
}

async function cmdComment(args) {
  const key = requireKey(args[0]);
  let text = args.slice(1).join(" ");
  if (text === "-") text = await readStdin();
  if (!text.trim()) throw new UsageError("comment <KEY> <text | ->: text is empty");
  const body = withBotPrefix(text);
  if (body.length > 32000) throw new UsageError(`comment is ${body.length} characters; Jira allows ~32k`);
  const client = await jira();
  const res = await client.request("POST", `/rest/api/3/issue/${key}/comment`, { body: { body: textToAdf(body) } });
  return { key, commentId: res?.id ?? null };
}

async function cmdLabel(args) {
  const [rawKey, op, label] = args;
  const key = requireKey(rawKey);
  if ((op !== "add" && op !== "remove") || args.length !== 3) throw new UsageError("label <KEY> <add|remove> <label>");
  if (!isValidLabel(label)) throw new UsageError(`invalid label ${JSON.stringify(label)} (no whitespace)`);
  const client = await jira();
  await client.request("PUT", `/rest/api/3/issue/${key}`, { body: { update: { labels: [{ [op]: label }] } } });
  const after = await client.request("GET", `/rest/api/3/issue/${key}`, { query: { fields: "labels" } });
  return { key, labels: after?.fields?.labels ?? [] };
}

function describePlan(plan) {
  const ref = (key, specId) => key ?? `(new ${specId})`;
  return {
    counts: {
      create: plan.creates.length,
      update: plan.updates.length,
      unchanged: plan.unchanged.length,
      linksToCreate: plan.links.length,
      linksExisting: plan.linksExisting,
    },
    creates: plan.creates.map((c) => ({ specId: c.specId, type: c.typeName, summary: c.summary, labels: c.labels, parentSpecId: c.parentSpecId })),
    updates: plan.updates.map((u) => {
      const view = { ...u };
      delete view.descriptionAdf;
      return view;
    }),
    links: plan.links.map((l) => `${ref(l.blockerKey, l.blockerSpecId)} blocks ${ref(l.blockedKey, l.blockedSpecId)}`),
    warnings: plan.warnings,
    errors: plan.errors,
  };
}

async function cmdSyncBacklog(args) {
  const { values } = parseArgs({ args, options: { "dry-run": { type: "boolean" } }, allowPositionals: false });
  const dryRun = Boolean(values["dry-run"]);
  const backlog = await readJson(BACKLOG_PATH);
  const keys = await readJson(KEYS_PATH, {});
  const client = await jira();
  const fields = [...ISSUE_FIELDS, "description"];
  const issues = await client.search(`project = ${PROJECT_KEY} ORDER BY key ASC`, fields);
  // The search index can lag behind just-created issues (e.g. a re-run right after a crash).
  // Fetch every key recorded in backlog-keys.json that search did not return, so it is matched, not duplicated.
  const seen = new Set(issues.map((i) => i.key));
  for (const k of Object.values(keys)) {
    if (!isValidKey(k) || seen.has(k)) continue;
    try {
      issues.push(await client.request("GET", `/rest/api/3/issue/${k}`, { query: { fields: fields.join(",") } }));
      seen.add(k);
    } catch (err) {
      if (err?.status !== 404) throw err;
    }
  }

  const plan = planSync({ backlog, issues, keys });
  if (plan.errors.length) {
    process.stdout.write(JSON.stringify({ dryRun, ...describePlan(plan) }, null, 2) + "\n");
    throw new Error(`sync-backlog aborted before any write: ${plan.errors.length} error(s):\n- ${plan.errors.join("\n- ")}`);
  }
  if (dryRun) return { dryRun: true, ...describePlan(plan) };

  /** @type {Map<string, string>} */
  const keyBySpec = new Map();
  for (const u of plan.updates) keyBySpec.set(u.specId, u.key);
  for (const u of plan.unchanged) keyBySpec.set(u.specId, u.key);
  const result = { dryRun: false, created: [], updated: [], unchanged: plan.unchanged.length, linksCreated: [], linksExisting: plan.linksExisting, warnings: plan.warnings, keysFileChanged: false };
  const saveKeys = async () => {
    const changed = await writeKeysFile(buildKeysFile(backlog, Object.fromEntries(keyBySpec), keys));
    result.keysFileChanged ||= changed;
  };
  const keyFor = (specId) => {
    const k = keyBySpec.get(specId);
    if (!k) throw new Error(`internal: no Jira key for spec id ${specId}`);
    return k;
  };

  try {
    // Creates are in backlog order, so an epic is always created before its stories.
    for (const c of plan.creates) {
      const fieldsBody = {
        project: { key: PROJECT_KEY },
        issuetype: { id: c.typeId },
        summary: c.summary,
        description: c.description,
        labels: c.labels,
        ...(c.parentSpecId ? { parent: { key: keyFor(c.parentSpecId) } } : {}),
      };
      const res = await client.request("POST", "/rest/api/3/issue", { body: { fields: fieldsBody } });
      if (!isValidKey(res?.key)) throw new Error(`create ${c.specId}: unexpected response ${JSON.stringify(res)}`);
      keyBySpec.set(c.specId, res.key);
      result.created.push({ specId: c.specId, key: res.key });
      await saveKeys(); // persist after every create so a crash can never lead to a duplicate on re-run
    }
    for (const u of plan.updates) {
      const fieldsBody = {};
      if (u.summary) fieldsBody.summary = u.summary.to;
      if (u.descriptionAdf) fieldsBody.description = u.descriptionAdf;
      if (u.parent) fieldsBody.parent = { key: keyFor(u.parent.toSpecId) };
      const body = { fields: fieldsBody };
      if (u.labelsAdd?.length) body.update = { labels: u.labelsAdd.map((l) => ({ add: l })) };
      await client.request("PUT", `/rest/api/3/issue/${u.key}`, { body });
      result.updated.push({ specId: u.specId, key: u.key, changed: Object.keys(fieldsBody).concat(u.labelsAdd?.length ? ["labels"] : []) });
    }
    for (const l of plan.links) {
      const blocker = l.blockerKey ?? keyFor(l.blockerSpecId);
      const blocked = l.blockedKey ?? keyFor(l.blockedSpecId);
      await client.request("POST", "/rest/api/3/issueLink", { body: blocksLinkPayload(blocker, blocked) });
      result.linksCreated.push(`${blocker} blocks ${blocked}`);
    }
  } catch (err) {
    await saveKeys().catch(() => {});
    process.stdout.write(JSON.stringify({ partial: true, ...result }, null, 2) + "\n");
    throw new Error(`sync-backlog stopped part-way (re-running is safe: issues are matched by spec label): ${err?.message ?? err}`);
  }
  await saveKeys();
  return {
    counts: {
      created: result.created.length,
      updated: result.updated.length,
      unchanged: result.unchanged,
      linksCreated: result.linksCreated.length,
      linksExisting: result.linksExisting,
    },
    ...result,
  };
}

// ---------------------------------------------------------------------------

const COMMANDS = {
  next: cmdNext,
  get: cmdGet,
  epic: cmdEpic,
  transition: cmdTransition,
  comment: cmdComment,
  label: cmdLabel,
  "sync-backlog": cmdSyncBacklog,
};

async function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === "--help" || cmd === "-h" || cmd === "help") {
    process.stdout.write(USAGE + "\n");
    return undefined;
  }
  const fn = COMMANDS[cmd];
  if (!fn) throw new UsageError(cmd ? `unknown command ${JSON.stringify(cmd)}` : "missing command");
  return fn(rest);
}

main(process.argv.slice(2)).then(
  (out) => {
    if (out !== undefined) process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  },
  (err) => {
    if (err instanceof ConfigError) {
      process.stderr.write(`${err.message}\n`);
      process.exitCode = 2;
      return;
    }
    if (err instanceof UsageError || err?.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION" || err?.code === "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL") {
      process.stderr.write(`error: ${err.message}\n\n${USAGE}\n`);
      process.exitCode = 1;
      return;
    }
    process.stderr.write(`error: ${err?.message ?? err}\n`);
    process.exitCode = 1;
  },
);
