// @vitest-environment node
import { describe, expect, it } from "vitest";
import { pathViolations, secretViolations } from "../../scripts/precommit-guard.mjs";

describe("pathViolations", () => {
  it("refuses secret and generated files in any directory", () => {
    const bad = [
      ".env",
      ".env.local",
      "apps/web/.env.production",
      "config/prod.env",
      "config/prod.env.bak",
      "ops/jira.env",
      "certs/server.pem",
      "keys/deploy.key",
      "home/.ssh/id_ed25519",
      "home/.ssh/id_rsa.pub",
      "gcp-credentials.json",
      "secrets/credentials-prod.json",
      "tsconfig.tsbuildinfo",
      ".next/server/app.js",
      "packages/x/node_modules/y/index.js",
      "test-results/a.png",
      "playwright-report/index.html",
      ".vercel/project.json",
    ];
    expect(pathViolations(bad).map((v) => v.path)).toEqual(bad);
  });

  it("allows ordinary source, docs and test files", () => {
    const ok = [
      "src/core/coordinates/SplinePathCoord.ts",
      "src/lib/id_generator.ts",
      "docs/environment.md",
      "scripts/jira.mjs",
      "tests/unit/keyboard.test.ts",
      "src/config/moderation.config.ts",
    ];
    expect(pathViolations(ok)).toEqual([]);
  });
});

describe("secretViolations", () => {
  const diff = (file: string, ...added: string[]) =>
    [`diff --git a/${file} b/${file}`, `--- a/${file}`, `+++ b/${file}`, "@@ -0,0 +1 @@", ...added.map((l) => `+${l}`)].join("\n");

  // Fake secrets are assembled at runtime so this file itself never contains a literal that the
  // guard (run on staged diffs before every commit) would flag.
  const J = ["JIRA", "API", "TOKEN"].join("_");
  const AT = ["AT", "ATT"].join("");
  const PK = ["-----BEGIN", "OPENSSH", "PRIVATE", "KEY-----"].join(" ");

  it("flags token values in added lines, without echoing them", () => {
    const fake = "ghp_" + "a".repeat(36);
    const res = secretViolations(
      diff("a.ts", `const t = "${fake}";`) +
        "\n" +
        diff("b.env.md", `${J}=${AT}3xFfGF0abcdefghijklmnopqrstuvwxyz`) +
        "\n" +
        diff("c.pem.txt", PK),
    );
    expect(res).toEqual([
      { file: "a.ts", why: "GitHub personal access token" },
      { file: "b.env.md", why: "JIRA_API_TOKEN value" },
      { file: "b.env.md", why: "Atlassian API token" },
      { file: "c.pem.txt", why: "private key block" },
    ]);
    expect(JSON.stringify(res)).not.toContain(fake);
  });

  it("allows placeholders and ignores removed lines", () => {
    const text = [
      diff("SKILL.md", "  JIRA_API_TOKEN=<API token>", 'JIRA_API_TOKEN="$TOKEN"', "JIRA_API_TOKEN="),
      `-${J}=realvalue123456`,
    ].join("\n");
    expect(secretViolations(text)).toEqual([]);
  });
});
