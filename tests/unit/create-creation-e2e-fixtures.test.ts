// @vitest-environment node
import { describe, expect, it } from "vitest";
import { LOY_KRATHONG_RIVER_LANE_ID } from "@/config/events/loyKrathong.river.config";
import { RIVER_DRIFT_SPEED_FACTOR } from "@/config/riverFlow.config";
import { parsePersistableCoord } from "@/core/coordinates/validateCoord";
import { parseEventAppearance } from "@/core/customization/appearanceRegistry";
import { isDeviceOwnerToken } from "@/services/auth";
import { parseCreateCreationRequest } from "@/services/api/createCreationRequest";
import { getCreationPlacementStrategy } from "@/services/api/creationPlacement";
import { E2E_DRIFT_SPEED_FACTOR, E2E_RIVER_LANE_ID, e2eCreateBody, e2eOwnerToken } from "../e2e/fixtures/createCreationFixtures";

describe("create-creation e2e fixtures", () => {
  it("pass the real validators", () => {
    const body = e2eCreateBody();
    expect(parseCreateCreationRequest(body).ok).toBe(true);
    expect(parseEventAppearance("loy_krathong", body.appearance).ok).toBe(true);
    const coord = parsePersistableCoord(body.coord);
    expect(coord.ok && getCreationPlacementStrategy("loy_krathong")!.acceptsCoord(coord.coord)).toBe(true);
    expect(E2E_RIVER_LANE_ID).toBe(LOY_KRATHONG_RIVER_LANE_ID);
    expect(E2E_DRIFT_SPEED_FACTOR).toBe(RIVER_DRIFT_SPEED_FACTOR);
    expect(isDeviceOwnerToken(e2eOwnerToken())).toBe(true);
  });
});
