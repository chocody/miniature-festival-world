// Fixtures shaped like Jira Cloud REST v3 responses (trimmed to the fields scripts/jira.mjs requests).

const status = (name: string, category: "new" | "indeterminate" | "done") => ({
  name,
  statusCategory: { key: category },
});

export const STATUS = {
  todo: status("To Do", "new"),
  inProgress: status("In Progress", "indeterminate"),
  inReview: status("In Review", "indeterminate"),
  done: status("Done", "done"),
};

const linked = (key: string, s: ReturnType<typeof status>) => ({
  key,
  fields: { summary: `summary of ${key}`, status: s, issuetype: { name: "Story" } },
});

/** "issue is blocked by <key>" as it appears on the blocked issue. */
export const blockedByLink = (key: string, s: ReturnType<typeof status>) => ({
  id: `link-${key}`,
  type: { name: "Blocks", inward: "is blocked by", outward: "blocks" },
  inwardIssue: linked(key, s),
});

/** "issue blocks <key>" as it appears on the blocking issue. */
export const blocksLink = (key: string, s: ReturnType<typeof status>) => ({
  id: `link-out-${key}`,
  type: { name: "Blocks", inward: "is blocked by", outward: "blocks" },
  outwardIssue: linked(key, s),
});

export const relatesLink = (key: string) => ({
  id: `rel-${key}`,
  type: { name: "Relates", inward: "relates to", outward: "relates to" },
  inwardIssue: linked(key, STATUS.todo),
});

export interface RawIssueInput {
  key: string;
  summary?: string;
  status?: ReturnType<typeof status>;
  type?: string;
  labels?: string[];
  parent?: { key: string; summary?: string } | null;
  issuelinks?: unknown[];
  description?: unknown;
}

export function rawIssue(i: RawIssueInput) {
  return {
    id: i.key.replace("MFW-", "100"),
    key: i.key,
    fields: {
      summary: i.summary ?? `summary of ${i.key}`,
      status: i.status ?? STATUS.todo,
      issuetype: { name: i.type ?? "Story" },
      labels: i.labels ?? [],
      parent: i.parent
        ? {
            key: i.parent.key,
            fields: { summary: i.parent.summary ?? "epic", issuetype: { name: "Epic" } },
          }
        : null,
      issuelinks: i.issuelinks ?? [],
      description: i.description ?? null,
    },
  };
}

/** A description written by hand in the Jira editor: headings, nested lists, mention, code, link, table. */
export const HAND_WRITTEN_ADF = {
  type: "doc",
  version: 1,
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Context" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Ask " },
        { type: "mention", attrs: { id: "abc", text: "@Santi" } },
        { type: "text", text: " about " },
        { type: "text", text: "pnpm e2e", marks: [{ type: "code" }] },
        { type: "hardBreak" },
        { type: "text", text: "see ", marks: [] },
        { type: "inlineCard", attrs: { url: "https://example.com/x" } },
      ],
    },
    {
      type: "orderedList",
      attrs: { order: 1 },
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "first" }] }] },
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "second" }] },
            {
              type: "bulletList",
              content: [
                { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "nested" }] }] },
              ],
            },
          ],
        },
      ],
    },
    { type: "codeBlock", attrs: { language: "bash" }, content: [{ type: "text", text: "pnpm test\npnpm lint" }] },
    { type: "rule" },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }] },
            { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "b" }] }] },
          ],
        },
      ],
    },
    { type: "mediaSingle", content: [{ type: "media", attrs: { id: "m1", type: "file" } }] },
    { type: "someFutureNode", content: [{ type: "paragraph", content: [{ type: "text", text: "kept" }] }] },
  ],
};

export const HAND_WRITTEN_TEXT = [
  "Context",
  "Ask @Santi about pnpm e2e",
  "see https://example.com/x",
  "1. first",
  "2. second",
  "  - nested",
  "pnpm test",
  "pnpm lint",
  "---",
  "a | b",
  "[attachment]",
  "kept",
].join("\n");

export const OPEN_QUESTIONS_MD = `# Open questions

| # | Question | Spec reference | Decide in |
|---|---|---|---|
| 1 | How does an owner prove ownership? | §5, backlog 2.1 | MFW-12 (2.2), MFW-31 (7.2) |
| 6 | Units of \`speedFactor\` | §4.1 | MFW-8 (1.2) |
| 7 | PlanarZoneCoord has no mode — **Decided** in MFW-8: add \`mode: "PLANAR_ZONE"\` | §4.3 | MFW-8 (1.2) |
| 9 | ~~No 2D formula~~ | §4.1 | MFW-8 (1.2), MFW-33 (8.1) |
| 10 | Retention period | §5 | MFW-1 |
`;
