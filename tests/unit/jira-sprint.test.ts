// @vitest-environment node
import { describe, expect, it } from "vitest";
import { planSprintStart, sprintIssuesNotDone, sprintNameForEpic, SPRINT_NAME_MAX } from "../../scripts/jira-lib.mjs";

describe("sprintNameForEpic", () => {
  it("names loop epics by number and stays within Jira's 30-char limit", () => {
    expect(sprintNameForEpic("L0")).toBe("Sprint 0 (Loop 0)");
    expect(sprintNameForEpic("L12")).toBe("Sprint 12 (Loop 12)");
    expect(sprintNameForEpic("LS")).toBe("Sprint LS");
    expect(sprintNameForEpic("L8").length).toBeLessThanOrEqual(SPRINT_NAME_MAX);
  });
  it("rejects empty or overlong ids", () => {
    expect(() => sprintNameForEpic("")).toThrow();
    expect(() => sprintNameForEpic("X".repeat(40))).toThrow();
  });
});

describe("planSprintStart", () => {
  const name = "Sprint 1 (Loop 1)";
  it("creates when nothing matches and nothing is active", () => {
    expect(planSprintStart([{ id: 3, name: "MFW Sprint 1", state: "future" }], name)).toEqual({ action: "create", sprintId: null });
  });
  it("reuses a future sprint with the same name", () => {
    expect(planSprintStart([{ id: 7, name, state: "future" }], name)).toEqual({ action: "reuse-future", sprintId: 7 });
  });
  it("is idempotent when this epic's sprint is already active", () => {
    expect(planSprintStart([{ id: 7, name, state: "active" }], name)).toEqual({ action: "already-active", sprintId: 7 });
  });
  it("refuses while another epic's sprint is active", () => {
    expect(() => planSprintStart([{ id: 5, name: "Sprint 0 (Loop 0)", state: "active" }], name)).toThrow(/still active/);
  });
});

describe("sprintIssuesNotDone", () => {
  it("lists only issues outside the done status category", () => {
    const issues = [
      { key: "MFW-6", fields: { status: { name: "Done", statusCategory: { key: "done" } } } },
      { key: "MFW-7", fields: { status: { name: "In Review", statusCategory: { key: "indeterminate" } } } },
      { key: "MFW-8", fields: {} },
    ];
    expect(sprintIssuesNotDone(issues)).toEqual([
      { key: "MFW-7", status: "In Review" },
      { key: "MFW-8", status: "" },
    ]);
  });
});
