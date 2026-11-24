// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/zones", () => {
  it("real GET without Supabase env", async () => {
    vi.resetModules();
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const mod = await import("./route");
    expect(Object.keys(mod)).toEqual(["GET"]);
    const res = await mod.GET(new Request("http://localhost/api/zones?event=loy_krathong"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ eventId: "loy_krathong", zoneCount: 1 });
  });
});
