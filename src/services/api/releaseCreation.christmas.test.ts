import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHRISTMAS_TREE } from "@/config/events/christmas.tree.config";
import type { ReleaseOrigin } from "@/core/ritual";
import { nearestFreeSlot, slotsOfBand } from "@/core/world/growingTree";
import { useBuilderStore } from "@/store/useBuilderStore";
import { useDeviceStore } from "@/store/useDeviceStore";
import { useUIStore } from "@/store/useUIStore";
import { INITIAL_WORLD_STATE, useWorldStore } from "@/store/useWorldStore";
import { OWNER_TOKEN_FIXTURE } from "./__fixtures__/createCreation";
import { CREATE_CREATION_BODY_KEYS, type CreateCreationRequestBody } from "./createCreationTypes";
import type { CreateCreationResult } from "./createCreationClient";
import type { PublicCreation } from "./creationTypes";
import { createReleaseCreation, type ReleaseCreationDeps } from "./releaseCreation";

const WISH = { text: "ขอให้ทุกคนมีความสุข", visibility: "private" } as const;
const PIER: ReleaseOrigin = { kind: "pier" };
const slot = (b: number, i: number) => slotsOfBand(CHRISTMAS_TREE, b)[i];
const COORD_KEYS = ["angleDeg", "heightRatio", "mode", "tierId"];

function creationFor(body: CreateCreationRequestBody, patch: Partial<PublicCreation> = {}): PublicCreation {
  return {
    id: "0f8b6c1e-3a2d-4c5b-9e7f-1a2b3c4d5e6f",
    eventId: "christmas",
    zoneId: 1,
    appearance: body.appearance,
    coord: body.coord,
    publicWishText: null,
    createdAt: "2026-12-20T12:00:00.000Z",
    expiresAt: "2027-01-20T12:00:00.000Z",
    displayName: null,
    ...patch,
  };
}

function harness(overrides: ReleaseCreationDeps = {}, patch: (b: CreateCreationRequestBody) => Partial<PublicCreation> = () => ({})) {
  const bodies: CreateCreationRequestBody[] = [];
  const clock = [1_000, 1_100, 1_300, 1_400, 1_500, 1_600];
  const submit = vi.fn(async (body: CreateCreationRequestBody): Promise<CreateCreationResult> => {
    bodies.push(body);
    return { ok: true, creation: creationFor(body, patch(body)) };
  });
  const deps: ReleaseCreationDeps = {
    submit,
    getOwnerToken: () => OWNER_TOKEN_FIXTURE,
    now: () => clock.shift() ?? 9_999,
    loadZone: vi.fn(async () => "loaded"),
    ...overrides,
  };
  return { releaser: createReleaseCreation(deps), submit, bodies, deps };
}

beforeEach(() => {
  useUIStore.setState(useUIStore.getInitialState(), true);
  useBuilderStore.setState(useBuilderStore.getInitialState(), true);
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
  useWorldStore.setState({ ...INITIAL_WORLD_STATE }, true);
  useUIStore.setState({ flowState: "RITUAL_RELEASE", selectedEventId: "christmas" });
  useBuilderStore.setState({ wish: { ...WISH } });
  useDeviceStore.getState().setWebglAvailable(false);
  useDeviceStore.getState().setQualityTier("LOW");
});

describe("christmas release", () => {
  it("RC1: the body carries the ornament appearance and only cylindrical keys", async () => {
    useBuilderStore.getState().chooseDesign("christmas", "star_01");
    const { releaser, bodies } = harness();
    expect(await releaser.release(PIER)).toBe("saved");
    const b = bodies[0];
    expect(Object.keys(b)).toEqual([...CREATE_CREATION_BODY_KEYS]);
    expect(b.eventId).toBe("christmas");
    expect(b.appearance).toEqual({ design: "star_01" });
    expect(Object.keys(b.coord).sort()).toEqual(COORD_KEYS);
    expect(b.coord).toEqual(slot(1, 0));
  });

  it("RC2: a hang origin sends its slot", async () => {
    const { releaser, bodies } = harness();
    expect(await releaser.release({ kind: "hang", candidate: slot(2, 3) })).toBe("saved");
    expect(bodies[0].coord).toEqual(slot(2, 3));
    expect(Object.keys(bodies[0].coord).sort()).toEqual(COORD_KEYS);
  });

  it("RC3: a server move is detected", async () => {
    await harness({}, () => ({ coord: slot(1, 1), zoneId: 1 })).releaser.release(PIER);
    let r = useUIStore.getState().ritual;
    expect(r.saved?.movedByServer).toBe(true);
    expect(r.saved?.coord).toEqual(slot(1, 1));

    useUIStore.setState({ ritual: useUIStore.getInitialState().ritual });
    useBuilderStore.setState({ wish: { ...WISH } });
    await harness({}, () => ({ coord: slot(2, 0), zoneId: 2 })).releaser.release(PIER);
    r = useUIStore.getState().ritual;
    expect(r.saved?.movedByServer).toBe(true);

    useUIStore.setState({ ritual: useUIStore.getInitialState().ritual });
    useBuilderStore.setState({ wish: { ...WISH } });
    await harness({}, () => ({ zoneId: 1 })).releaser.release(PIER);
    expect(useUIStore.getState().ritual.saved?.movedByServer).toBe(false);
  });

  it("RC4: a moderation block returns to the wish", async () => {
    const body = { error: "moderation_blocked", reasons: ["phone"] };
    const submit = vi.fn(async (): Promise<CreateCreationResult> => ({ ok: false, reason: "moderation_blocked", moderationBody: body }));
    expect(await harness({ submit }).releaser.release(PIER)).toBe("revise_wish");
    expect(useBuilderStore.getState().wishServerReasons).toEqual(["phone"]);
    expect(useUIStore.getState().flowState).toBe("WRITE_WISH");
    expect(useUIStore.getState().ritual.phase).toBe("IDLE");
    expect(useUIStore.getState().ritual.error).toBeNull();
  });

  it("RC5: private text is cleared and kept out of the stores", async () => {
    useBuilderStore.setState({ wishDisplayName: "น้องมะลิ" });
    await harness().releaser.release(PIER);
    const b = useBuilderStore.getState();
    expect(b.wish).toBeNull();
    expect(b.wishDisplayName).toBeNull();
    expect(b.wishServerReasons).toBeNull();
    const dump = JSON.stringify([useUIStore.getState(), b, useWorldStore.getState(), useDeviceStore.getState()]);
    for (const needle of [OWNER_TOKEN_FIXTURE, "ownerToken", "owner_token", "privateWish", "private_wish", WISH.text]) {
      expect(dump).not.toContain(needle);
    }
    expect(Object.keys(useUIStore.getState().ritual.saved!)).toEqual([
      "id",
      "zoneId",
      "coord",
      "createdAtMs",
      "serverClockOffsetMs",
      "movedByServer",
    ]);
  });

  it("RC6: guards", async () => {
    const { releaser, submit } = harness();
    expect(await releaser.release({ kind: "drop", candidate: { laneId: 1, progress: 0.3, lateralOffset: 0 } })).toBe("ignored");
    useUIStore.setState({ selectedEventId: "new_year" });
    expect(await releaser.release(PIER)).toBe("ignored");
    useUIStore.setState({ selectedEventId: "loy_krathong" });
    expect(await releaser.release({ kind: "hang", candidate: slot(1, 0) })).toBe("ignored");
    expect(submit).not.toHaveBeenCalled();
    expect(useUIStore.getState().ritual.attempt).toBe(0);
  });

  it("RC7: the client pre-check moves a taken slot", async () => {
    useWorldStore.setState({
      eventId: "christmas",
      currentZoneId: 1,
      zoneItems: [creationFor({ coord: slot(1, 0) } as CreateCreationRequestBody)],
    });
    const { releaser, bodies } = harness();
    await releaser.release(PIER);
    expect(bodies[0].coord).toEqual(nearestFreeSlot(CHRISTMAS_TREE, slot(1, 0), [slot(1, 0)], 1));
    expect(useUIStore.getState().ritual.collided).toBe(true);
  });

  it("RC8: loads the creation's zone when the server opens another band", async () => {
    useWorldStore.setState({ eventId: "christmas", currentZoneId: 1 });
    const loadZone = vi.fn(async () => "loaded");
    await harness({ loadZone }, () => ({ zoneId: 2 })).releaser.release(PIER);
    expect(loadZone).toHaveBeenCalledTimes(1);
    expect(loadZone).toHaveBeenCalledWith(2);
  });
});
