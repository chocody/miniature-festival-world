// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreationRepositoryError } from "./creationRepository";
import { createCreationRepositoryFromEnv } from "./creationRepositoryFactory";

afterEach(() => {
  vi.unstubAllEnvs();
});

function misconfigured(env: Record<string, string>): CreationRepositoryError {
  try {
    createCreationRepositoryFromEnv(env);
  } catch (err) {
    if (err instanceof CreationRepositoryError) return err;
    throw err;
  }
  throw new Error("expected throw");
}

describe("createCreationRepositoryFromEnv", () => {
  it("uses memory when both are absent or blank", () => {
    expect(createCreationRepositoryFromEnv({}).backend).toBe("memory");
    expect(createCreationRepositoryFromEnv({ SUPABASE_URL: " ", SUPABASE_SERVICE_ROLE_KEY: "" }).backend).toBe(
      "memory",
    );
  });

  it("uses supabase when both are set", () => {
    const repo = createCreationRepositoryFromEnv({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "k-value",
    });
    expect(repo.backend).toBe("supabase");
  });

  it("is misconfigured with exactly one", () => {
    const a = misconfigured({ SUPABASE_URL: "https://example.supabase.co" });
    expect(a.code).toBe("backend_misconfigured");
    expect(a.detail).toBe("SUPABASE_SERVICE_ROLE_KEY");
    expect(a.message).not.toContain("example.supabase.co");
    const b = misconfigured({ SUPABASE_SERVICE_ROLE_KEY: "k-value" });
    expect(b.detail).toBe("SUPABASE_URL");
    expect(b.message).not.toContain("k-value");
  });
});

describe("getCreationRepository", () => {
  it("returns a process singleton (memory without env)", async () => {
    vi.resetModules();
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const mod = await import("./creationRepositoryFactory");
    const first = mod.getCreationRepository();
    expect(first.backend).toBe("memory");
    expect(mod.getCreationRepository()).toBe(first);
  });
});
