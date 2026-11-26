// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NO_WEBGL_COPY } from "@/config/noWebgl.config";
import { E2E_NO_WEBGL_COPY } from "../e2e/fixtures/noWebgl";

describe("no-WebGL e2e fixtures (MFW-71)", () => {
  it("E2E_NO_WEBGL_COPY equals NO_WEBGL_COPY", () => {
    expect(E2E_NO_WEBGL_COPY).toEqual(NO_WEBGL_COPY);
  });
});
