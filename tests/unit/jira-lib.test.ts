// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import backlogJson from "../../docs/backlog.json";
import keysJson from "../../docs/backlog-keys.json";
import {
  BOT_PREFIX,
  SITE,
  adfToText,
  blockersFromIssueLinks,
  blocksLinkPayload,
  buildKeysFile,
  createJiraClient,
  desiredIssues,
  evaluateReadiness,
  inlineNodes,
  isValidKey,
  isValidLabel,
  missingCredentialsMessage,
  normalizeIssue,
  normalizeText,
  openQuestionsFor,
  parseEnvFile,
  parseOutcome,
  pickNext,
  planSync,
  resolveCredentials,
  specIdFromLabels,
  storyDescriptionAdf,
  suggestSize,
  summarizeEpic,
  textToAdf,
  validateBacklog,
  withBotPrefix,
} from "../../scripts/jira-lib.mjs";
import {
  HAND_WRITTEN_ADF,
  HAND_WRITTEN_TEXT,
  OPEN_QUESTIONS_MD,
  STATUS,
  blockedByLink,
  blocksLink,
  rawIssue,
  relatesLink,
} from "./fixtures/jira";

type Backlog = Parameters<typeof planSync>[0]["backlog"];
const backlog = backlogJson as unknown as Backlog;
const keys = keysJson as Record<string, string>;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** Raw Jira issues exactly matching the backlog, keyed per docs/backlog-keys.json. */
function inSyncIssues() {
  const desired = desiredIssues(backlog);
  const keyOf = (id: string) => keys[id];
  return desired.map((d) => {
    const links = [
      ...d.blockedBy.map((b) => blockedByLink(keyOf(b), STATUS.todo)),
      ...desired.filter((o) => o.blockedBy.includes(d.specId)).map((o) => blocksLink(keyOf(o.specId), STATUS.todo)),
    ];
    return rawIssue({
      key: keyOf(d.specId),
      summary: d.summary,
      type: d.typeName,
      labels: d.labels,
      parent: d.parentSpecId ? { key: keyOf(d.parentSpecId) } : null,
      issuelinks: links,
      description: d.description,
    });
  });
}

describe("keys, labels, spec ids", () => {
  it("validates issue keys strictly (no JQL injection through --epic / KEY args)", () => {
    expect(isValidKey("MFW-12")).toBe(true);
    for (const bad of ["mfw-12", "MFW-", "MFW-1 OR project = X", "ABC-1", "", undefined, 12]) {
      expect(isValidKey(bad)).toBe(false);
    }
  });

  it("rejects labels with whitespace", () => {
    expect(isValidLabel("needs-human")).toBe(true);
    expect(isValidLabel("needs human")).toBe(false);
    expect(isValidLabel("")).toBe(false);
  });

  it("reads spec ids from idempotency labels", () => {
    expect(specIdFromLabels(["core", "spec-task-1.2"])).toEqual({ kind: "task", id: "1.2" });
    expect(specIdFromLabels(["spec-epic-L1"])).toEqual({ kind: "epic", id: "L1" });
    expect(specIdFromLabels(["core"])).toBeNull();
    expect(specIdFromLabels(undefined)).toBeNull();
  });
});

describe("credentials", () => {
  it("parses KEY=VALUE files with comments, export and quotes", () => {
    const parsed = parseEnvFile(
      ["# comment", "", "export JIRA_BASE_URL=https://chocody.atlassian.net/", 'JIRA_EMAIL="a@b.c"', "JIRA_API_TOKEN='t=k'", "garbage line"].join("\n"),
    );
    expect(parsed).toEqual({ JIRA_BASE_URL: "https://chocody.atlassian.net/", JIRA_EMAIL: "a@b.c", JIRA_API_TOKEN: "t=k" });
  });

  it("lets env win and fills the rest from the file", () => {
    const r = resolveCredentials(
      { JIRA_EMAIL: "env@x.y" },
      { JIRA_BASE_URL: `${SITE}/`, JIRA_EMAIL: "file@x.y", JIRA_API_TOKEN: "tok" },
    );
    expect(r).toEqual({ ok: true, creds: { baseUrl: SITE, email: "env@x.y", token: "tok" } });
  });

  it("reports every missing key and never includes values in the message", () => {
    const r = resolveCredentials({ JIRA_API_TOKEN: "  " }, null);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.missing).toEqual(["JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN"]);
    const msg = missingCredentialsMessage("~/.config/mfw/jira.env", r.missing);
    expect(msg).toContain("https://id.atlassian.com/manage-profile/security/api-tokens");
    expect(msg).toContain("~/.config/mfw/jira.env");
    expect(msg).toContain("chmod 600");
  });

  it("refuses any Jira site other than chocody.atlassian.net", () => {
    const r = resolveCredentials({ JIRA_BASE_URL: "https://other.atlassian.net", JIRA_EMAIL: "a", JIRA_API_TOKEN: "b" }, null);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/Refusing/);
  });
});

describe("ADF", () => {
  it("flattens hand-written ADF (lists, mentions, cards, tables, unknown nodes) to plain text", () => {
    expect(adfToText(HAND_WRITTEN_ADF)).toBe(HAND_WRITTEN_TEXT);
  });

  it("handles empty and legacy string descriptions", () => {
    expect(adfToText(null)).toBe("");
    expect(adfToText(undefined)).toBe("");
    expect(adfToText("plain v2 text")).toBe("plain v2 text");
  });

  it("builds paragraphs, hard breaks, bullets and headings from plain text", () => {
    const doc = textToAdf("## Report\nline one\nline two\n\n- a\n- b `code`\n\nafter");
    expect(doc.content.map((n) => n.type)).toEqual(["heading", "paragraph", "bulletList", "paragraph"]);
    expect(doc.content[1].content?.map((n) => n.type)).toEqual(["text", "hardBreak", "text"]);
    expect(adfToText(doc)).toBe("Report\nline one\nline two\n- a\n- b code\nafter");
  });

  it("never produces an empty doc", () => {
    expect(textToAdf("   ")).toEqual({ type: "doc", version: 1, content: [{ type: "paragraph", content: [] }] });
  });

  it("marks inline code and links, and keeps trailing punctuation out of URLs", () => {
    expect(inlineNodes("PR https://github.com/o/r/pull/7. Run `pnpm test`")).toEqual([
      { type: "text", text: "PR " },
      { type: "text", text: "https://github.com/o/r/pull/7", marks: [{ type: "link", attrs: { href: "https://github.com/o/r/pull/7" } }] },
      { type: "text", text: ". Run " },
      { type: "text", text: "pnpm test", marks: [{ type: "code" }] },
    ]);
  });

  it("round-trips a story description through ADF without losing AC text", () => {
    const story = backlog.epics[1].stories[1];
    const text = adfToText(storyDescriptionAdf(story));
    for (const ac of story.ac ?? []) expect(text).toContain(ac.replace(/`/g, ""));
    expect(text).toContain(`Spec id: ${story.id}`);
  });

  it("normalizes whitespace for comparison", () => {
    expect(normalizeText("  a   b \n\n\tc  \n")).toBe("a b\nc");
  });

  it("prefixes automation comments exactly once", () => {
    expect(withBotPrefix("Started")).toBe(`${BOT_PREFIX} Started`);
    expect(withBotPrefix(`${BOT_PREFIX} Started`)).toBe(`${BOT_PREFIX} Started`);
    expect(withBotPrefix("- item")).toBe(`${BOT_PREFIX}\n\n- item`);
    expect(adfToText(textToAdf(withBotPrefix("## Epic report\n- a"))).startsWith(BOT_PREFIX)).toBe(true);
  });
});

describe("link direction", () => {
  it("reads 'is blocked by' from inwardIssue entries only, ignoring other link types", () => {
    const blockers = blockersFromIssueLinks([
      blockedByLink("MFW-7", STATUS.done),
      blockedByLink("MFW-9", STATUS.inReview),
      blocksLink("MFW-20", STATUS.todo),
      relatesLink("MFW-30"),
    ]);
    expect(blockers).toEqual([
      { key: "MFW-7", summary: "summary of MFW-7", status: "Done", done: true },
      { key: "MFW-9", summary: "summary of MFW-9", status: "In Review", done: false },
    ]);
  });

  it("creates 'BLOCKER blocks BLOCKED' with inwardIssue = blocker (site quirk)", () => {
    expect(blocksLinkPayload("MFW-7", "MFW-8")).toEqual({
      type: { name: "Blocks" },
      inwardIssue: { key: "MFW-7" },
      outwardIssue: { key: "MFW-8" },
    });
  });
});

describe("readiness and next", () => {
  const epic = { key: "MFW-6", summary: "Loop 1" };
  const issues = [
    rawIssue({ key: "MFW-2", status: STATUS.done, labels: ["spec-task-0.1"] }),
    rawIssue({ key: "MFW-7", parent: epic, labels: ["core", "spec-task-1.1"], issuelinks: [blockedByLink("MFW-5", STATUS.inProgress)] }),
    rawIssue({ key: "MFW-36", labels: ["stub", "spec-task-S.1"] }),
    rawIssue({ key: "MFW-8", parent: epic, labels: ["needs-human", "spec-task-1.2"] }),
    rawIssue({ key: "MFW-6", type: "Epic", labels: ["spec-epic-L1"] }),
    rawIssue({ key: "MFW-50", type: "Subtask" }),
    rawIssue({ key: "MFW-9", parent: epic, labels: ["core", "perf", "spec-task-1.3"], issuelinks: [blockedByLink("MFW-2", STATUS.done), blocksLink("MFW-15", STATUS.todo)] }),
    rawIssue({ key: "MFW-4", status: STATUS.inProgress, labels: ["spec-task-0.3"] }),
    rawIssue({ key: "MFW-3", status: STATUS.inReview, labels: ["needs-human"] }),
  ].map(normalizeIssue);

  it("normalizes parent epic and spec id", () => {
    const i = issues.find((x) => x.key === "MFW-9")!;
    expect(i.epic).toEqual({ key: "MFW-6", summary: "Loop 1" });
    expect(i.specId).toBe("1.3");
    expect(i.blockers).toHaveLength(1);
  });

  it("explains every reason a ticket is not ready", () => {
    const byKey = Object.fromEntries(issues.map((i) => [i.key, evaluateReadiness(i)]));
    expect(byKey["MFW-2"].reasons).toEqual(['status is "Done", not "To Do"']);
    expect(byKey["MFW-7"].reasons).toEqual(["blocked by MFW-5 (In Progress)"]);
    expect(byKey["MFW-36"].reasons).toEqual(["labelled stub"]);
    expect(byKey["MFW-8"].reasons).toEqual(["labelled needs-human"]);
    expect(byKey["MFW-6"].reasons).toEqual(["is an Epic"]);
    expect(byKey["MFW-50"].reasons).toEqual(["is a Subtask"]);
    expect(byKey["MFW-9"]).toEqual({ ready: true, reasons: [] });
  });

  it("picks the first ready ticket in rank order and reports in-flight tickets", () => {
    expect(pickNext(issues)).toEqual({
      key: "MFW-9",
      summary: "summary of MFW-9",
      labels: ["core", "perf", "spec-task-1.3"],
      epic: { key: "MFW-6", summary: "Loop 1" },
      specId: "1.3",
      inFlight: [{ key: "MFW-4", status: "In Progress", summary: "summary of MFW-4" }],
    });
  });

  it("respects rank order rather than key order", () => {
    const a = normalizeIssue(rawIssue({ key: "MFW-30" }));
    const b = normalizeIssue(rawIssue({ key: "MFW-11" }));
    expect(pickNext([a, b]).key).toBe("MFW-30");
  });

  it("limits to one epic and explains why nothing is ready", () => {
    const res = pickNext(issues.filter((i) => i.key !== "MFW-9"), { epicKey: "MFW-6" });
    expect(res.key).toBeNull();
    expect(res).toMatchObject({ reason: expect.stringContaining("in epic MFW-6") });
    expect((res.skipped ?? []).map((s) => s.key)).toEqual(["MFW-7", "MFW-8"]);
    expect(pickNext([], { epicKey: "MFW-99" })).toMatchObject({ key: null, reason: "no To Do ticket in epic MFW-99" });
  });
});

describe("size estimate", () => {
  it("maps AC count to S/M/L and picks the dev model", () => {
    expect(suggestSize({ acCount: 2, labels: [] })).toMatchObject({ size: "S", devModel: "sonnet" });
    expect(suggestSize({ acCount: 4, labels: [] })).toMatchObject({ size: "M", devModel: "sonnet" });
    expect(suggestSize({ acCount: 5, labels: [] })).toMatchObject({ size: "L", devModel: "opus" });
  });

  it("puts privacy/db/migration work at M or above", () => {
    expect(suggestSize({ acCount: 1, labels: ["privacy"] })).toMatchObject({ size: "M", floor: "M" });
    expect(suggestSize({ acCount: 6, labels: ["db"] })).toMatchObject({ size: "L", floor: "M" });
  });
});

describe("epic outcomes", () => {
  it("parses the outcome line loop-ticket writes", () => {
    const text = `${BOT_PREFIX} Merged https://github.com/chocody/miniature-festival-world/pull/12 as abc123. Outcome: size=M dev=sonnet fixRounds=1 ciRuns=2 files=7 lines=+210/-12 result=merged`;
    expect(parseOutcome(text)).toEqual({
      size: "M",
      dev: "sonnet",
      fixRounds: 1,
      ciRuns: 2,
      files: 7,
      lines: "+210/-12",
      result: "merged",
      prUrl: "https://github.com/chocody/miniature-festival-world/pull/12",
    });
    expect(parseOutcome("Estimate: M")).toBeNull();
  });

  it("closes an epic only when it has children and all are Done", () => {
    const done = normalizeIssue(rawIssue({ key: "MFW-7", status: STATUS.done }));
    const parked = normalizeIssue(rawIssue({ key: "MFW-8", status: STATUS.inReview, labels: ["needs-human"] }));
    expect(summarizeEpic([done]).allDone).toBe(true);
    expect(summarizeEpic([]).allDone).toBe(false);
    const s = summarizeEpic([done, parked], { "MFW-7": parseOutcome("Outcome: size=S result=merged") });
    expect(s.allDone).toBe(false);
    expect(s.counts).toEqual({ total: 2, done: 1, ready: 0, needsHuman: 1 });
    expect(s.needsHuman).toEqual([{ key: "MFW-8", status: "In Review", summary: "summary of MFW-8" }]);
    expect(s.children[0].outcome).toMatchObject({ size: "S", result: "merged" });
  });
});

describe("open questions", () => {
  it("returns only rows whose 'Decide in' names the ticket, with resolution state", () => {
    const qs = openQuestionsFor(OPEN_QUESTIONS_MD, "MFW-8");
    expect(qs.map((q) => [q.number, q.resolved])).toEqual([
      ["6", false],
      ["7", true],
      ["9", true],
    ]);
  });

  it("does not confuse MFW-1 with MFW-12 / MFW-31", () => {
    expect(openQuestionsFor(OPEN_QUESTIONS_MD, "MFW-1").map((q) => q.number)).toEqual(["10"]);
    expect(openQuestionsFor(OPEN_QUESTIONS_MD, "MFW-31").map((q) => q.number)).toEqual(["1"]);
    expect(openQuestionsFor("no table here", "MFW-1")).toEqual([]);
  });
});

describe("backlog validation", () => {
  it("accepts the real docs/backlog.json (no unknown blockers, no cycles)", () => {
    expect(validateBacklog(backlog)).toEqual([]);
  });

  it("rejects duplicates, unknown blockers, self-blocks and cycles", () => {
    const bad = clone(backlog);
    bad.epics[1].stories[0].blockedBy = ["1.2"]; // 1.1 ← 1.2 ← 1.1
    bad.epics[1].stories[2].blockedBy = ["9.9"];
    bad.epics[2].stories[0].id = "1.2";
    bad.epics[3].stories[0].blockedBy = [bad.epics[3].stories[0].id];
    const errors = validateBacklog(bad);
    expect(errors.some((e) => e.startsWith("duplicate id 1.2"))).toBe(true);
    expect(errors.some((e) => e.includes("unknown story 9.9"))).toBe(true);
    expect(errors.some((e) => e.includes("blocks itself"))).toBe(true);
    expect(errors.some((e) => e.startsWith("dependency cycle"))).toBe(true);
  });

  it("defaults story type to Story and adds the spec label", () => {
    const d = desiredIssues(backlog);
    const s11 = d.find((x) => x.specId === "1.1")!;
    expect(s11).toMatchObject({ typeName: "Story", typeId: "10009", parentSpecId: "L1" });
    expect(s11.labels).toEqual(["core", "spec-task-1.1"]);
    expect(d.find((x) => x.specId === "0.3")).toMatchObject({ typeName: "Task", typeId: "10008" });
    expect(d.find((x) => x.specId === "L0")).toMatchObject({ typeName: "Epic", typeId: "10006", labels: ["infra", "loop-0", "spec-epic-L0"] });
  });
});

describe("planSync", () => {
  const totalIssues = desiredIssues(backlog).length;
  const totalLinks = desiredIssues(backlog).reduce((n, d) => n + d.blockedBy.length, 0);

  it("plans everything as unchanged when Jira already matches (idempotent)", () => {
    const plan = planSync({ backlog, issues: inSyncIssues(), keys });
    expect(plan.errors).toEqual([]);
    expect(plan.warnings).toEqual([]);
    expect(plan.creates).toEqual([]);
    expect(plan.updates).toEqual([]);
    expect(plan.links).toEqual([]);
    expect(plan.unchanged).toHaveLength(totalIssues);
    expect(plan.linksExisting).toBe(totalLinks);
  });

  it("plans every issue and link on an empty project, epics before their stories", () => {
    const plan = planSync({ backlog, issues: [], keys: {} });
    expect(plan.creates).toHaveLength(totalIssues);
    expect(plan.links).toHaveLength(totalLinks);
    const order = plan.creates.map((c) => c.specId);
    for (const c of plan.creates) {
      if (c.parentSpecId) expect(order.indexOf(c.parentSpecId)).toBeLessThan(order.indexOf(c.specId));
    }
    expect(plan.links.every((l) => l.blockerKey === null && l.blockedKey === null)).toBe(true);
  });

  it("detects summary/description/label/parent drift and only ever adds labels", () => {
    const issues = inSyncIssues();
    const s12 = issues.find((i) => i.key === keys["1.2"])!;
    s12.fields.summary = "old summary";
    s12.fields.description = textToAdf("hand edited");
    s12.fields.labels = ["needs-human", "spec-task-1.2"]; // "core", "coordinates" missing; needs-human kept
    s12.fields.parent = null;
    const plan = planSync({ backlog, issues, keys });
    expect(plan.updates).toHaveLength(1);
    const u = plan.updates[0];
    expect(u).toMatchObject({
      specId: "1.2",
      key: keys["1.2"],
      summary: { from: "old summary", to: backlog.epics[1].stories[1].summary },
      labelsAdd: ["core", "coordinates"],
      parent: { from: null, toSpecId: "L1" },
    });
    expect(u.description).toMatchObject({ line: 1, from: "hand edited" });
    expect(u.descriptionAdf).toEqual(storyDescriptionAdf(backlog.epics[1].stories[1]));
  });

  it("ignores formatting-only description differences", () => {
    const issues = inSyncIssues();
    const s = issues.find((i) => i.key === keys["0.1"])!;
    const text = adfToText(s.fields.description as Parameters<typeof adfToText>[0]);
    s.fields.description = textToAdf(text.replace(/\n/g, "\n\n  ")); // re-flowed, extra blank lines/indent
    expect(planSync({ backlog, issues, keys }).updates).toEqual([]);
  });

  it("creates only the missing link, in blocker → blocked direction", () => {
    const issues = inSyncIssues();
    const blocked = issues.find((i) => i.key === keys["1.2"])!;
    blocked.fields.issuelinks = [];
    const plan = planSync({ backlog, issues, keys });
    expect(plan.links).toEqual([{ blockerSpecId: "1.1", blockedSpecId: "1.2", blockerKey: keys["1.1"], blockedKey: keys["1.2"] }]);
  });

  it("warns about a reversed link but still plans the correct one (never deletes)", () => {
    const issues = inSyncIssues();
    const blocked = issues.find((i) => i.key === keys["1.2"])!;
    const blocker = issues.find((i) => i.key === keys["1.1"])!;
    blocked.fields.issuelinks = [blocksLink(keys["1.1"], STATUS.todo)];
    blocker.fields.issuelinks = [blockedByLink(keys["1.2"], STATUS.todo), ...(blocker.fields.issuelinks as unknown[]).filter((l) => (l as { inwardIssue?: unknown }).inwardIssue)];
    const plan = planSync({ backlog, issues, keys });
    expect(plan.links.map((l) => [l.blockerKey, l.blockedKey])).toEqual([[keys["1.1"], keys["1.2"]]]);
    expect(plan.warnings.some((w) => w.includes("reversed link"))).toBe(true);
  });

  it("aborts on duplicate spec labels", () => {
    const issues = inSyncIssues();
    issues.push(rawIssue({ key: "MFW-99", labels: ["spec-task-1.1"] }));
    const plan = planSync({ backlog, issues, keys });
    expect(plan.errors.some((e) => e.includes("spec-task-1.1") && e.includes("MFW-99"))).toBe(true);
  });

  it("reuses an issue named in backlog-keys.json whose spec label was removed, instead of duplicating it", () => {
    const issues = inSyncIssues();
    const s = issues.find((i) => i.key === keys["2.1"])!;
    s.fields.labels = ["privacy", "auth"];
    const plan = planSync({ backlog, issues, keys });
    expect(plan.creates).toEqual([]);
    expect(plan.updates).toEqual([expect.objectContaining({ specId: "2.1", key: keys["2.1"], labelsAdd: ["spec-task-2.1"] })]);
    expect(plan.warnings.some((w) => w.includes("reusing it via backlog-keys.json"))).toBe(true);
  });

  it("errors when a spec epic matches a non-Epic issue", () => {
    const issues = inSyncIssues();
    issues.find((i) => i.key === keys["L2"])!.fields.issuetype = { name: "Task" };
    expect(planSync({ backlog, issues, keys }).errors.some((e) => e.includes("L2"))).toBe(true);
  });

  it("refuses to plan anything for an invalid backlog", () => {
    const bad = clone(backlog);
    bad.epics[1].stories[0].blockedBy = ["nope"];
    const plan = planSync({ backlog: bad, issues: [], keys: {} });
    expect(plan.errors.length).toBeGreaterThan(0);
    expect(plan.creates).toEqual([]);
  });
});

describe("buildKeysFile", () => {
  it("reproduces docs/backlog-keys.json exactly, in the same order", () => {
    const out = buildKeysFile(backlog, keys);
    expect(JSON.stringify(out, null, 2)).toBe(JSON.stringify(keys, null, 2));
  });

  it("keeps entries that left the backlog", () => {
    expect(buildKeysFile({ epics: [] }, {}, { "9.9": "MFW-99" })).toEqual({ "9.9": "MFW-99" });
  });
});

describe("createJiraClient", () => {
  const creds = { baseUrl: SITE, email: "a@b.c", token: "secret-token" };
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

  it("sends Basic auth and JSON, and pages search with nextPageToken", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(200, { issues: [{ key: "MFW-1" }], nextPageToken: "p2" }))
      .mockResolvedValueOnce(json(200, { issues: [{ key: "MFW-2" }], isLast: true }));
    const client = createJiraClient({ ...creds, fetchImpl, sleep: async () => {} });
    const issues = await client.search("project = MFW", ["summary"]);
    expect(issues.map((i: { key: string }) => i.key)).toEqual(["MFW-1", "MFW-2"]);
    const [url1, init1] = fetchImpl.mock.calls[0];
    expect(url1).toContain("/rest/api/3/search/jql?");
    expect(url1).toContain("maxResults=100");
    expect(url1).not.toContain("nextPageToken");
    expect(fetchImpl.mock.calls[1][0]).toContain("nextPageToken=p2");
    expect(init1.headers.Authorization).toBe("Basic " + Buffer.from("a@b.c:secret-token").toString("base64"));
  });

  it("retries 429 for writes but never retries a write on 5xx", async () => {
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(429, {}, { "retry-after": "1" }))
      .mockResolvedValueOnce(json(500, { errorMessages: ["boom"] }));
    const client = createJiraClient({ ...creds, fetchImpl, sleep });
    await expect(client.request("POST", "/rest/api/3/issue", { body: {} })).rejects.toThrow(/HTTP 500.*boom/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("retries GET on 503 and network errors", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(json(503, {}))
      .mockResolvedValueOnce(json(200, { key: "MFW-1" }));
    const client = createJiraClient({ ...creds, fetchImpl, sleep: async () => {} });
    await expect(client.request("GET", "/rest/api/3/issue/MFW-1")).resolves.toEqual({ key: "MFW-1" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry a write after a network error and says it may have been applied", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("socket hang up"));
    const client = createJiraClient({ ...creds, fetchImpl, sleep: async () => {} });
    await expect(client.request("POST", "/rest/api/3/issueLink", { body: {} })).rejects.toThrow(/may or may not have been applied/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("explains 401 without echoing the token, and treats 204 as success", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(401, { errorMessages: ["Client must be authenticated"] }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = createJiraClient({ ...creds, fetchImpl, sleep: async () => {} });
    const err = await client.request("GET", "/rest/api/3/myself").catch((e: Error) => e);
    expect(String(err)).toMatch(/authentication failed/);
    expect(String(err)).not.toContain("secret-token");
    await expect(client.request("PUT", "/rest/api/3/issue/MFW-1", { body: {} })).resolves.toBeNull();
  });
});
