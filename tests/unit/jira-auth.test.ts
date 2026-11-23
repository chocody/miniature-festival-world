// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  JiraAuthError,
  SITE,
  authFailureMessage,
  checkMyself,
  createJiraClient,
  jiraAuthMode,
  needsProxyReexec,
  resolveJiraAuth,
  verifyJiraAuth,
} from "../../scripts/jira-lib.mjs";

const PROXY = { HTTPS_PROXY: "http://127.0.0.1:1" };
const ENV_FILE = "~/.config/mfw/jira.env";

describe("jiraAuthMode", () => {
  it("honours an explicit JIRA_AUTH (case-insensitive) and rejects other values", () => {
    expect(jiraAuthMode({ JIRA_AUTH: "proxy" }, null)).toBe("proxy");
    expect(jiraAuthMode({ JIRA_AUTH: " BASIC ", ...PROXY }, null)).toBe("basic");
    expect(() => jiraAuthMode({ JIRA_AUTH: "oauth" }, null)).toThrow(JiraAuthError);
  });

  it("auto-selects proxy only with a proxy and no email/token anywhere", () => {
    expect(jiraAuthMode(PROXY, null)).toBe("proxy");
    expect(jiraAuthMode({ https_proxy: "http://127.0.0.1:1" }, null)).toBe("proxy");
    expect(jiraAuthMode(PROXY, { JIRA_API_TOKEN: "t" })).toBe("basic");
    expect(jiraAuthMode({ ...PROXY, JIRA_EMAIL: "a@b.c" }, null)).toBe("basic");
    expect(jiraAuthMode({}, null)).toBe("basic");
  });
});

describe("resolveJiraAuth", () => {
  it("proxy mode needs only HTTPS_PROXY and uses placeholder credentials", () => {
    const r = resolveJiraAuth(PROXY, null);
    expect(r).toEqual({
      ok: true,
      mode: "proxy",
      creds: { baseUrl: SITE, email: "proxy-injected", token: "proxy-injected" },
    });
  });

  it("proxy mode still refuses another Jira site", () => {
    const r = resolveJiraAuth({ ...PROXY, JIRA_BASE_URL: "https://other.atlassian.net" }, null);
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ error: expect.stringMatching(/Refusing/) });
  });

  it("JIRA_AUTH=proxy without a proxy is an error", () => {
    const r = resolveJiraAuth({ JIRA_AUTH: "proxy" }, null);
    expect(r).toMatchObject({ ok: false, mode: "proxy", error: expect.stringMatching(/needs HTTPS_PROXY/) });
  });

  it("basic mode delegates to resolveCredentials", () => {
    expect(resolveJiraAuth({}, null)).toEqual({
      ok: false,
      mode: "basic",
      missing: ["JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN"],
    });
    const ok = resolveJiraAuth({ JIRA_BASE_URL: SITE, JIRA_EMAIL: "a@b.c", JIRA_API_TOKEN: "t" }, null);
    expect(ok).toMatchObject({ ok: true, mode: "basic", creds: { email: "a@b.c", token: "t" } });
  });

  it("reports an invalid JIRA_AUTH", () => {
    expect(resolveJiraAuth({ JIRA_AUTH: "x" }, null)).toMatchObject({ ok: false, error: expect.stringContaining("JIRA_AUTH") });
  });
});

describe("needsProxyReexec", () => {
  it("is true only when a proxy is set and NODE_USE_ENV_PROXY is not 1", () => {
    expect(needsProxyReexec({ HTTPS_PROXY: "http://p:1" })).toBe(true);
    expect(needsProxyReexec({ https_proxy: "http://p:1" })).toBe(true);
    expect(needsProxyReexec({ HTTPS_PROXY: "http://p:1", NODE_USE_ENV_PROXY: "1" })).toBe(false);
    expect(needsProxyReexec({})).toBe(false);
    expect(needsProxyReexec({ HTTPS_PROXY: "", https_proxy: " " })).toBe(false);
  });
});

describe("checkMyself", () => {
  it("accepts an authenticated reply and rejects anonymous ones", () => {
    expect(checkMyself({ accountId: "abc", displayName: "Me" })).toEqual({ ok: true, accountId: "abc", displayName: "Me" });
    expect(checkMyself({})).toMatchObject({ ok: false });
    expect(checkMyself(null)).toMatchObject({ ok: false });
    expect(checkMyself({ accountId: "x", accountType: "anonymous" })).toMatchObject({ ok: false });
  });
});

function jsonResponse(status: number, body: unknown) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": typeof body === "string" ? "text/plain" : "application/json" },
  });
}

function clientWith(fetchImpl: typeof fetch, token = "proxy-injected") {
  return createJiraClient({ baseUrl: SITE, email: "proxy-injected", token, fetchImpl, sleep: async () => {} });
}

describe("verifyJiraAuth", () => {
  it("turns a 401 into a JiraAuthError with the proxy hint", async () => {
    const client = clientWith(async () => jsonResponse(401, "Client must be authenticated"));
    const err = await verifyJiraAuth(client, "proxy", ENV_FILE).catch((e) => e);
    expect(err).toBeInstanceOf(JiraAuthError);
    expect(err.message).toContain("HTTP 401");
    expect(err.message).toContain("network secret");
  });

  it("explains the Connect Session 403 as a wrong auth type", async () => {
    const client = clientWith(async () => jsonResponse(403, "Failed to parse Connect Session Auth Token"));
    const err = await verifyJiraAuth(client, "proxy", ENV_FILE).catch((e) => e);
    expect(err).toBeInstanceOf(JiraAuthError);
    expect(err.message).toContain("Basic");
    expect(err.message).toContain("Bearer");
  });

  it("treats a 200 without accountId as anonymous (revoked token)", async () => {
    const client = clientWith(async () => jsonResponse(200, {}));
    const err = await verifyJiraAuth(client, "proxy", ENV_FILE).catch((e) => e);
    expect(err).toBeInstanceOf(JiraAuthError);
    expect(err.message).toContain("anonymous");
  });

  it("returns the account on success", async () => {
    const client = clientWith(async () => jsonResponse(200, { accountId: "a1", displayName: "Owner" }));
    await expect(verifyJiraAuth(client, "proxy", ENV_FILE)).resolves.toEqual({ accountId: "a1", displayName: "Owner" });
  });

  it("reports an unreachable Jira", async () => {
    const client = clientWith(async () => {
      throw new Error("connect ECONNREFUSED");
    });
    const err = await verifyJiraAuth(client, "proxy", ENV_FILE).catch((e) => e);
    expect(err).toBeInstanceOf(JiraAuthError);
    expect(err.message).toContain("unreachable");
    expect(err.message).toContain("allowed host");
  });

  it("rethrows other Jira errors unchanged", async () => {
    const client = clientWith(async () => jsonResponse(404, "nope"));
    const err = await verifyJiraAuth(client, "basic", ENV_FILE).catch((e) => e);
    expect(err).not.toBeInstanceOf(JiraAuthError);
  });

  it("basic mode points at the env file and never leaks the token", async () => {
    const client = clientWith(async () => jsonResponse(401, "Client must be authenticated"), "secret-token");
    const err = await verifyJiraAuth(client, "basic", ENV_FILE).catch((e) => e);
    expect(err.message).toContain(ENV_FILE);
    expect(err.message).not.toContain("secret-token");
    expect(authFailureMessage("basic", 401, "x", ENV_FILE)).not.toContain("network secret");
  });
});
