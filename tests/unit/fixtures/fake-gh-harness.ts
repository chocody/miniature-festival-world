import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";

export type FakeRule = { match: string[]; stdout?: string; stderr?: string; code?: number; times?: number };
export type FakeCall = { args: string[]; ghToken: string; ghTokenValue: string };

const FAKE = resolve(__dirname, "fake-gh.mjs");

/** A temp dir with an executable `gh` on PATH that replays `rules` and logs every call. */
export function makeFakeGh(rules: FakeRule[]) {
  const dir = mkdtempSync(join(tmpdir(), "fake-gh-"));
  const rulesFile = join(dir, "rules.json");
  const logFile = join(dir, "calls.log");
  writeFileSync(rulesFile, JSON.stringify(rules));
  writeFileSync(logFile, "");
  writeFileSync(join(dir, "gh"), `#!/bin/sh\nexec node "${FAKE}" "$@"\n`);
  chmodSync(join(dir, "gh"), 0o755);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${dir}${delimiter}${process.env.PATH ?? ""}`,
    FAKE_GH_RULES: rulesFile,
    FAKE_GH_LOG: logFile,
  };
  return {
    dir,
    env,
    calls(): FakeCall[] {
      return readFileSync(logFile, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l));
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
