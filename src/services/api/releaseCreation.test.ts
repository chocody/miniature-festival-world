import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOY_KRATHONG_PIER_RELEASE_SPOT } from "@/config/events/loyKrathong.river.config";
import { DEFAULT_KRATHONG_APPEARANCE, serializeKrathongAppearance } from "@/core/customization/krathongAppearance";
import { buildReleaseCoord, type ReleaseOrigin, type RitualErrorKind } from "@/core/ritual";
import { useBuilderStore } from "@/store/useBuilderStore";
import { useDeviceStore } from "@/store/useDeviceStore";
import { useUIStore } from "@/store/useUIStore";
import { INITIAL_WORLD_STATE, useWorldStore } from "@/store/useWorldStore";
import { OWNER_TOKEN_FIXTURE } from "./__fixtures__/createCreation";
import { CREATE_CREATION_BODY_KEYS, type CreateCreationRequestBody } from "./createCreationTypes";
import type { CreateCreationResult } from "./createCreationClient";
import type { AppearanceJson, PublicCreation } from "./creationTypes";
import { createReleaseCreation, type ReleaseCreationDeps } from "./releaseCreation";
import { toWishRequestFields } from "./wishPayload";

const WISH = { text: "ขอให้ทุกคนมีความสุข", visibility: "private" } as const;
const PIER: ReleaseOrigin = { kind: "pier" };

function creationFor(body: CreateCreationRequestBody, patch: Partial<PublicCreation> = {}): PublicCreation {
  return {
    id: "0f8b6c1e-3a2d-4c5b-9e7f-1a2b3c4d5e6f",
    eventId: "loy_krathong",
    zoneId: 1,
    appearance: body.appearance,
    coord: body.coord,
    publicWishText: null,
    createdAt: "2026-11-24T12:00:00.000Z",
    expiresAt: "2026-12-24T12:00:00.000Z",
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

const failing = (reason: Extract<CreateCreationResult, { ok: false }>["reason"], moderationBody: unknown = null) =>
  vi.fn(async (): Promise<CreateCreationResult> => ({ ok: false, reason, moderationBody }));

beforeEach(() => {
  useUIStore.setState(useUIStore.getInitialState(), true);
  useBuilderStore.setState(useBuilderStore.getInitialState(), true);
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
  useWorldStore.setState({ ...INITIAL_WORLD_STATE }, true);
  useUIStore.setState({ flowState: "RITUAL_RELEASE", selectedEventId: "loy_krathong" });
  useBuilderStore.setState({ wish: { ...WISH } });
  useDeviceStore.getState().setQualityTier("FALLBACK_2D");
});

describe("release", () => {
  it("builds the request", async () => {
    const { releaser, bodies } = harness();
    expect(await releaser.release(PIER)).toBe("saved");
    const b = bodies[0];
    expect(Object.keys(b)).toEqual([...CREATE_CREATION_BODY_KEYS]);
    expect(b.coord).toEqual(buildReleaseCoord(LOY_KRATHONG_PIER_RELEASE_SPOT));
    expect(b.appearance).toEqual(serializeKrathongAppearance(DEFAULT_KRATHONG_APPEARANCE));
    expect(b).toMatchObject(toWishRequestFields({ ...WISH }));
    expect(b.ownerToken).toBe(OWNER_TOKEN_FIXTURE);
  });

  it("FALLBACK_2D and unprofiled never load the resolver", async () => {
    const loadLandingResolver = vi.fn();
    await harness({ loadLandingResolver }).releaser.release(PIER);
    useUIStore.getState().dispatchRitual({ type: "RESET" });
    useDeviceStore.setState(useDeviceStore.getInitialState(), true);
    useUIStore.setState({ ritual: useUIStore.getInitialState().ritual });
    await harness({ loadLandingResolver }).releaser.release(PIER);
    expect(loadLandingResolver).not.toHaveBeenCalled();
  });

  it("sends the free spot", async () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const L = { laneId: 1, progress: 0.45, lateralOffset: -0.1 };
    const { releaser, bodies } = harness({ loadLandingResolver: async () => () => ({ landing: L, collided: true }) });
    await releaser.release(PIER);
    expect(bodies[0].coord).toEqual(buildReleaseCoord(L));
    expect(useUIStore.getState().ritual.collided).toBe(true);
  });

  it("resolver failure falls back to the candidate", async () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const { releaser, bodies } = harness({ loadLandingResolver: async () => { throw new Error("chunk"); } });
    expect(await releaser.release(PIER)).toBe("saved");
    expect(bodies[0].coord).toEqual(buildReleaseCoord(LOY_KRATHONG_PIER_RELEASE_SPOT));
  });

  it("uses the drop candidate", async () => {
    const candidate = { laneId: 1, progress: 0.3, lateralOffset: 0.05 };
    const { releaser, bodies } = harness();
    await releaser.release({ kind: "drop", candidate });
    expect(bodies[0].coord).toEqual(buildReleaseCoord(candidate));
  });

  it("the server coord is final", async () => {
    const { releaser } = harness({}, (b) => ({ coord: { ...b.coord, lateralOffset: -0.2 } as PublicCreation["coord"] }));
    await releaser.release(PIER);
    const { saved } = useUIStore.getState().ritual;
    expect(saved?.coord).toMatchObject({ lateralOffset: -0.2 });
    expect(saved?.createdAtMs).toBe(Date.parse("2026-11-24T12:00:00.000Z"));
    expect(saved?.movedByServer).toBe(true);
    expect(saved?.serverClockOffsetMs).toBe(Date.parse("2026-11-24T12:00:00.000Z") - (1_000 + 1_100) / 2);
  });

  it("clears the wish after a save, keeps it on failure", async () => {
    await harness().releaser.release(PIER);
    expect(useBuilderStore.getState().wish).toBeNull();
    useUIStore.setState({ ritual: useUIStore.getInitialState().ritual });
    useBuilderStore.setState({ wish: { ...WISH } });
    await harness({ submit: failing("network") }).releaser.release(PIER);
    expect(useBuilderStore.getState().wish).not.toBeNull();
  });

  it("keeps private data out of stores", async () => {
    await harness().releaser.release(PIER);
    const dump = JSON.stringify([
      useUIStore.getState(),
      useBuilderStore.getState(),
      useWorldStore.getState(),
      useDeviceStore.getState(),
    ]);
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

  it("notifies listeners, survives a throwing one, supports unsubscribe", async () => {
    const { releaser } = harness();
    const seen = vi.fn();
    const off = releaser.onCreationSaved(seen);
    releaser.onCreationSaved(() => { throw new Error("boom"); });
    expect(await releaser.release(PIER)).toBe("saved");
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0][0]).toMatchObject({ id: "0f8b6c1e-3a2d-4c5b-9e7f-1a2b3c4d5e6f" });
    off();
    useUIStore.setState({ ritual: useUIStore.getInitialState().ritual });
    useBuilderStore.setState({ wish: { ...WISH } });
    await releaser.release(PIER);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("loads the creation's zone when another zone is visible", async () => {
    useWorldStore.setState({ eventId: "loy_krathong", currentZoneId: 1 });
    const loadZone = vi.fn(async () => "loaded");
    await harness({ loadZone }, () => ({ zoneId: 2 })).releaser.release(PIER);
    expect(loadZone).toHaveBeenCalledWith(2);
    expect(loadZone).toHaveBeenCalledTimes(1);

    useUIStore.setState({ ritual: useUIStore.getInitialState().ritual });
    useBuilderStore.setState({ wish: { ...WISH } });
    const same = vi.fn(async () => "loaded");
    await harness({ loadZone: same }, () => ({ zoneId: 1 })).releaser.release(PIER);
    expect(same).not.toHaveBeenCalled();
  });

  it("moderation-blocked returns to the wish with the reasons", async () => {
    const body = { error: "moderation_blocked", reasons: ["phone"] };
    const { releaser } = harness({ submit: failing("moderation_blocked", body) });
    expect(await releaser.release(PIER)).toBe("revise_wish");
    expect(useBuilderStore.getState().wishServerReasons).toEqual(["phone"]);
    expect(useUIStore.getState().flowState).toBe("WRITE_WISH");
    expect(useUIStore.getState().ritual.phase).toBe("IDLE");
    expect(useUIStore.getState().ritual.error).toBeNull();
  });

  it.each([null, { text: "  ", visibility: "private" as const }])("invalid stored wish %j sends nothing", async (wish) => {
    useBuilderStore.setState({ wish });
    const { releaser, submit } = harness();
    expect(await releaser.release(PIER)).toBe("revise_wish");
    expect(submit).not.toHaveBeenCalled();
    expect(useUIStore.getState().flowState).toBe("WRITE_WISH");
  });

  it.each([
    ["network", "network"],
    ["timeout", "timeout"],
    ["unavailable", "unavailable"],
    ["event_closed", "event_closed"],
    ["rejected", "rejected"],
    ["invalid_response", "invalid_response"],
    ["aborted", "network"],
  ] as const)("failure %s maps to %s", async (reason, kind: RitualErrorKind) => {
    const { releaser } = harness({ submit: failing(reason) });
    expect(await releaser.release(PIER)).toBe("failed");
    const r = useUIStore.getState().ritual;
    expect(r.phase).toBe("IDLE");
    expect(r.error?.kind).toBe(kind);
  });

  it("a throwing token source fails as unexpected", async () => {
    const { releaser, submit } = harness({ getOwnerToken: () => { throw new Error("no random"); } });
    expect(await releaser.release(PIER)).toBe("failed");
    expect(submit).not.toHaveBeenCalled();
    expect(useUIStore.getState().ritual.error?.kind).toBe("unexpected");
  });

  it("clears the wish even when the response arrives stale", async () => {
    let resolve!: (r: CreateCreationResult) => void;
    const submit = vi.fn(() => new Promise<CreateCreationResult>((r) => { resolve = r; }));
    const { releaser } = harness({ submit });
    const first = releaser.release(PIER);
    useUIStore.getState().dispatchRitual({ type: "RESET" });
    resolve({ ok: true, creation: creationFor({ appearance: {} as AppearanceJson, coord: buildReleaseCoord(LOY_KRATHONG_PIER_RELEASE_SPOT) } as CreateCreationRequestBody) });
    expect(await first).toBe("ignored");
    expect(useBuilderStore.getState().wish).toBeNull();
  });

  it("guards: second release, wrong flow state, stale response", async () => {
    let resolve!: (r: CreateCreationResult) => void;
    const submit = vi.fn(() => new Promise<CreateCreationResult>((r) => { resolve = r; }));
    const { releaser } = harness({ submit });
    const first = releaser.release(PIER);
    expect(await releaser.release(PIER)).toBe("ignored");
    expect(submit).toHaveBeenCalledTimes(1);
    useUIStore.getState().dispatchRitual({ type: "RESET" });
    resolve({ ok: true, creation: creationFor({ appearance: {} as AppearanceJson, coord: buildReleaseCoord(LOY_KRATHONG_PIER_RELEASE_SPOT) } as CreateCreationRequestBody) });
    expect(await first).toBe("ignored");
    expect(useUIStore.getState().ritual.saved).toBeNull();

    useUIStore.setState({ flowState: "WRITE_WISH" });
    expect(await harness().releaser.release(PIER)).toBe("ignored");
  });
});
