import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBuilderStore } from "@/store/useBuilderStore";
import { useDeviceStore } from "@/store/useDeviceStore";
import { useUIStore } from "@/store/useUIStore";
import { INITIAL_WORLD_STATE, useWorldStore } from "@/store/useWorldStore";
import { DAY_NIGHT_HOURS, LIGHT_PRESET_TOGGLE_COPY } from "@/config/look.config";
import { SKY_LAUNCH_DEFAULT_KIND, SKY_LAUNCH_SWITCH_COPY } from "@/config/gimmicks.config";
import { WISH_COPY } from "@/config/wish.config";
import { LOY_KRATHONG_PIER_RELEASE_SPOT } from "@/config/events/loyKrathong.river.config";
import { RITUAL_COPY } from "@/config/ritual.config";
import { buildReleaseCoord } from "@/core/ritual";
import { DEVICE_OWNER_TOKEN_STORAGE_KEY, MY_CREATIONS_STORAGE_KEY } from "@/config/ownership.config";
import { MY_CREATION_ENTRY_KEYS, MY_CREATIONS_COPY } from "@/config/myCreations.config";
import { WORLD_VIEW_ROTATE_BUTTON_COPY } from "@/config/interaction.config";
import { FLOW_STEP_COPY } from "@/config/ui.config";
import { FlowRoot } from "./FlowRoot";
import { OWNERSHIP_LOSS_WARNING } from "./OwnershipNotice";
import { CHRISTMAS_COPY } from "@/config/events/christmas.copy";

const zones = vi.hoisted(() => ({
  enterWorld: vi.fn(async () => "loaded"),
  leaveWorld: vi.fn(),
  loadZone: vi.fn(async () => "loaded"),
  retry: vi.fn(async () => "loaded"),
}));
vi.mock("@/services/api/zonePagination", () => ({ getZonePagination: () => zones, loadZone: zones.loadZone }));

/** Answers POST /api/creations like the server: 201 with the sent coord (or the status/body the test sets). */
const api = vi.hoisted(() => ({
  status: 201,
  body: null as unknown,
  posts: [] as { url: string; body: Record<string, unknown> }[],
}));
function stubCreationsApi() {
  api.status = 201;
  api.body = null;
  api.posts.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method !== "POST") {
        // Zone GET (the owner switch reads its state from the public list, MFW-63): an empty zone.
        if (url.startsWith("/api/creations?")) {
          const zoneId = Number(new URL(url, "http://localhost").searchParams.get("zone"));
          return new Response(JSON.stringify({ eventId: "loy_krathong", zoneId, limit: 80, items: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 404 });
      }
      const sent = JSON.parse(init.body as string) as Record<string, unknown>;
      api.posts.push({ url, body: sent });
      if (api.status !== 201) return new Response(JSON.stringify(api.body ?? {}), { status: api.status });
      return new Response(
        JSON.stringify({
          creation: {
            id: "0f8b6c1e-3a2d-4c5b-9e7f-1a2b3c4d5e6f",
            eventId: sent.eventId,
            zoneId: 1,
            appearance: sent.appearance,
            coord: sent.coord,
            publicWishText: null,
            createdAt: new Date().toISOString(),
            expiresAt: "2099-01-01T00:00:00.000Z",
          },
        }),
        { status: 201 },
      );
    }),
  );
}

const viewSpies = vi.hoisted(() => ({ rotate: vi.fn(), zoom: vi.fn() }));

vi.mock("@/components/canvas3d", async () => {
  const React = await import("react");
  const { useUIStore } = await import("@/store/useUIStore");
  return {
    SceneViewport: ({
      mode,
      onReleaseDrop,
      viewControlRef,
    }: {
      mode: string | null;
      onReleaseDrop?: (candidate: typeof LOY_KRATHONG_PIER_RELEASE_SPOT) => void;
      viewControlRef?: React.Ref<{ rotate: (d: -1 | 1) => void; zoom: (d: -1 | 1) => void }>;
    }) => {
      React.useImperativeHandle(viewControlRef, () => ({ rotate: viewSpies.rotate, zoom: viewSpies.zoom }));
      // Stands in for the scene's animation: touches down at once and settles when saved.
      const ritual = useUIStore((s) => s.ritual);
      React.useEffect(() => {
        const { dispatchRitual } = useUIStore.getState();
        if (ritual.phase !== "RELEASING") return;
        dispatchRitual({ type: "TOUCHED_DOWN", attempt: ritual.attempt });
        if (ritual.saved) dispatchRitual({ type: "SETTLED", attempt: ritual.attempt });
      }, [ritual]);
      return React.createElement("div", {
        "data-testid": "scene-viewport",
        "data-mode": mode ?? "",
        onClick: () => onReleaseDrop?.(LOY_KRATHONG_PIER_RELEASE_SPOT),
      });
    },
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  window.localStorage.clear();
  stubCreationsApi();
  useUIStore.setState(useUIStore.getInitialState(), true);
  // Overlays wait for the profiler (MFW-71 fix round), so tests start profiled on a 3D tier; unprofiled cases reset it.
  useDeviceStore.setState({ ...useDeviceStore.getInitialState(), profiled: true, qualityTier: "HIGH" }, true);
  useBuilderStore.setState(useBuilderStore.getInitialState(), true);
  useWorldStore.setState({ ...INITIAL_WORLD_STATE }, true);
  viewSpies.rotate.mockClear();
  viewSpies.zoom.mockClear();
  for (const fn of Object.values(zones)) fn.mockClear();
});

/** The preset the toggle shows with the AUTO choice (device-local clock). */
const expectedShown = () => (new Date().getHours() >= DAY_NIGHT_HOURS.dayStartHour && new Date().getHours() < DAY_NIGHT_HOURS.nightStartHour ? "DAY" : "NIGHT");

const completeWish = (text = "ขอให้ทุกคนมีความสุข") => {
  fireEvent.change(screen.getByRole("textbox", { name: WISH_COPY.textLabel }), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: WISH_COPY.submit }));
};

const stateOf = (container: HTMLElement) =>
  container.querySelector("[data-flow-state]")?.getAttribute("data-flow-state");

describe("FlowRoot", () => {
  it("clicks through all 4 states", async () => {
    const { container } = render(<FlowRoot eventId="loy_krathong" />);
    expect(stateOf(container)).toBe("CUSTOMIZE_OBJECT");
    expect(container.querySelector("[data-flow-state]")).toHaveAttribute("data-interaction-mode", "CUSTOMIZE");
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(stateOf(container)).toBe("WRITE_WISH");
    completeWish();
    expect(stateOf(container)).toBe("RITUAL_RELEASE");
    expect(container.querySelector("[data-flow-state]")).toHaveAttribute("data-interaction-mode", "RITUAL_RELEASE");
    fireEvent.click(screen.getByRole("button", { name: "ปล่อยกระทง" }));
    await waitFor(() => expect(stateOf(container)).toBe("SHARED_WORLD_EXPLORE"));
    expect(container.querySelector("[data-flow-state]")).toHaveAttribute("data-interaction-mode", "WORLD_EXPLORE");
    // MFW-74: only the HUD column buttons (day/night toggle, rotate); no Find My without a world or a stored krathong.
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      LIGHT_PRESET_TOGGLE_COPY[expectedShown()],
      WORLD_VIEW_ROTATE_BUTTON_COPY.ariaLabel,
      SKY_LAUNCH_SWITCH_COPY[SKY_LAUNCH_DEFAULT_KIND],
    ]);
  });

  it("shows the ownership notice only in WRITE_WISH", async () => {
    render(<FlowRoot eventId="loy_krathong" />);
    expect(screen.queryByRole("note")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(screen.getByRole("note")).toHaveTextContent(OWNERSHIP_LOSS_WARNING);
    completeWish();
    expect(screen.queryByRole("note")).toBeNull();
    // MFW-23 is the first vault caller: the token is created by the release, not before.
    expect(window.localStorage.getItem(DEVICE_OWNER_TOKEN_STORAGE_KEY)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ปล่อยกระทง" }));
    await waitFor(() => expect(window.localStorage.getItem(DEVICE_OWNER_TOKEN_STORAGE_KEY)).not.toBeNull());
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("CUSTOMIZE_OBJECT shows the customizer panel only in that step", () => {
    render(<FlowRoot eventId="loy_krathong" />);
    expect(screen.getByRole("region", { name: "แต่งกระทง" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(screen.queryByRole("region", { name: "แต่งกระทง" })).toBeNull();
  });

  it("3D tier: the bar's view buttons drive the scene", async () => {
    act(() => useDeviceStore.getState().setQualityTier("HIGH"));
    render(<FlowRoot eventId="loy_krathong" />);
    await screen.findByTestId("scene-viewport");
    fireEvent.click(screen.getByRole("button", { name: "หมุนขวา" }));
    expect(viewSpies.rotate).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "ซูมออก" }));
    expect(viewSpies.zoom).toHaveBeenCalledWith(-1);
  });

  it("F3 unprofiled: no overlay, no notice and no scene until the profiler has decided", async () => {
    useDeviceStore.setState(useDeviceStore.getInitialState(), true);
    render(<FlowRoot eventId="loy_krathong" />);
    await act(async () => {});
    expect(screen.getByTestId("overlay-layer")).toBeEmptyDOMElement();
    expect(screen.queryByRole("region", { name: "แต่งกระทง" })).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByTestId("no-webgl-notice")).toBeNull();
    expect(screen.queryByTestId("scene-viewport")).toBeNull();
  });

  it("opens straight into the active event: no selector, festival list or Coming Soon", () => {
    const { container } = render(<FlowRoot eventId="loy_krathong" />);
    expect(stateOf(container)).toBe("CUSTOMIZE_OBJECT");
    expect(container.querySelector("[data-flow-state]")).toHaveAttribute("data-active-event", "loy_krathong");
    expect(useUIStore.getState().selectedEventId).toBe("loy_krathong");
    expect(screen.queryByText("Coming Soon")).toBeNull();
    expect(screen.queryByText("เลือกเทศกาล")).toBeNull();
    expect(container.querySelector("[data-event-id]")).toBeNull();
    expect(screen.queryByRole("button", { name: /Christmas|New Year|Songkran|Halloween/ })).toBeNull();
  });

  it("exposes quality tier and reduced motion from the device store", () => {
    useDeviceStore.setState(useDeviceStore.getInitialState(), true);
    const { container } = render(<FlowRoot eventId="loy_krathong" />);
    const root = container.querySelector("[data-flow-state]")!;
    expect(root).toHaveAttribute("data-quality-tier", "MEDIUM");
    expect(root).toHaveAttribute("data-reduced-motion", "false");
    act(() => {
      useDeviceStore.getState().setQualityTier("LOW");
      useDeviceStore.getState().setReducedMotion(true);
    });
    expect(root).toHaveAttribute("data-quality-tier", "LOW");
    expect(root).toHaveAttribute("data-reduced-motion", "true");
  });

  it("mounts the lazy scene only in canvas modes on a profiled 3D tier", async () => {
    act(() => useDeviceStore.getState().setQualityTier("HIGH"));
    const { container } = render(<FlowRoot eventId="loy_krathong" />);
    expect(await screen.findByTestId("scene-viewport")).toHaveAttribute("data-mode", "CUSTOMIZE");

    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(screen.queryByTestId("scene-viewport")).toBeNull();

    completeWish();
    const marker = await screen.findByTestId("scene-viewport");
    expect(marker).toHaveAttribute("data-mode", "RITUAL_RELEASE");

    fireEvent.click(marker);
    await waitFor(() => expect(screen.getByTestId("scene-viewport")).toHaveAttribute("data-mode", "WORLD_EXPLORE"));
    expect(stateOf(container)).toBe("SHARED_WORLD_EXPLORE");
  });

  it("never mounts the scene before profiling or without WebGL", async () => {
    useDeviceStore.setState(useDeviceStore.getInitialState(), true);
    render(<FlowRoot eventId="loy_krathong" />);
    await act(async () => {});
    expect(screen.queryByTestId("scene-viewport")).toBeNull();

    act(() => {
      useDeviceStore.getState().setWebglAvailable(false);
      useDeviceStore.getState().setQualityTier("LOW");
    });
    await act(async () => {});
    expect(screen.queryByTestId("scene-viewport")).toBeNull();
  });

  it("F1 no WebGL: notice instead of the scene, no overlay", async () => {
    act(() => {
      useDeviceStore.getState().setWebglAvailable(false);
      useDeviceStore.getState().setQualityTier("LOW");
    });
    const { container } = render(<FlowRoot eventId="loy_krathong" />);
    await act(async () => {});
    expect(within(screen.getByTestId("stage-layer")).getByTestId("no-webgl-notice")).toBeInTheDocument();
    expect(screen.queryByTestId("scene-viewport")).toBeNull();
    expect(screen.getByTestId("overlay-layer")).toBeEmptyDOMElement();
    expect(screen.queryByRole("button")).toBeNull();
    const root = container.querySelector("[data-flow-state]")!;
    expect(root).toHaveAttribute("data-quality-tier", "LOW");
    expect(root).toHaveAttribute("data-flow-state", "CUSTOMIZE_OBJECT");
  });

  it("F2 no notice while unprofiled nor once the scene can mount (customizer appears with the profile)", async () => {
    useDeviceStore.setState(useDeviceStore.getInitialState(), true);
    render(<FlowRoot eventId="loy_krathong" />);
    expect(screen.queryByTestId("no-webgl-notice")).toBeNull();
    expect(screen.queryByRole("region", { name: "แต่งกระทง" })).toBeNull();
    act(() => useDeviceStore.getState().setQualityTier("HIGH"));
    expect(await screen.findByRole("region", { name: "แต่งกระทง" })).toBeInTheDocument();
    expect(await screen.findByTestId("scene-viewport")).toBeInTheDocument();
    expect(screen.queryByTestId("no-webgl-notice")).toBeNull();
  });

  it("enters the shared world once when the ritual starts and leaves on unmount", async () => {
    const { unmount } = render(<FlowRoot eventId="loy_krathong" />);
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    completeWish();
    expect(zones.enterWorld).toHaveBeenCalledTimes(1);
    expect(zones.enterWorld).toHaveBeenCalledWith("loy_krathong");
    fireEvent.click(screen.getByRole("button", { name: "ปล่อยกระทง" }));
    await waitFor(() => expect(screen.queryByTestId("ritual-release-panel")).toBeNull());
    expect(zones.enterWorld).toHaveBeenCalledTimes(1);
    expect(zones.leaveWorld).not.toHaveBeenCalled();
    unmount();
    expect(zones.leaveWorld).toHaveBeenCalledTimes(1);
  });

  it("shows the zone navigator only at SHARED_WORLD_EXPLORE, without buttons in a 1-zone world", async () => {
    render(<FlowRoot eventId="loy_krathong" />);
    expect(screen.queryByTestId("zone-navigator")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    completeWish();
    expect(screen.queryByTestId("zone-navigator")).toBeNull();
    act(() => {
      useWorldStore.setState({ eventId: "loy_krathong", currentZoneId: 1, zoneCount: 1, zoneStatus: "ready" });
    });
    fireEvent.click(screen.getByRole("button", { name: "ปล่อยกระทง" }));
    await waitFor(() => expect(screen.getByTestId("zone-navigator")).toBeInTheDocument());
    act(() => {
      useWorldStore.setState({ eventId: "loy_krathong", currentZoneId: 1, zoneCount: 1, zoneStatus: "ready" });
    });
    expect(screen.getByTestId("zone-navigator")).toBeInTheDocument();
    expect(within(screen.getByTestId("zone-navigator")).queryAllByRole("button")).toHaveLength(0);
  });

  it("WRITE_WISH renders the wish modal; SUBMIT_WISH needs a valid wish", () => {
    const { container } = render(<FlowRoot eventId="loy_krathong" />);
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(stateOf(container)).toBe("WRITE_WISH");
    expect(screen.getByRole("dialog", { name: WISH_COPY.title })).toBeInTheDocument();
    const next = screen.getByRole("button", { name: WISH_COPY.submit });
    expect(next).toBeDisabled();
    fireEvent.click(next);
    expect(stateOf(container)).toBe("WRITE_WISH");
    completeWish();
    expect(stateOf(container)).toBe("RITUAL_RELEASE");
    expect(screen.queryByRole("dialog", { name: WISH_COPY.title })).toBeNull();
    expect(useBuilderStore.getState().wish).toEqual({ text: "ขอให้ทุกคนมีความสุข", visibility: "private" });
    expect(useBuilderStore.getState().wishDisplayName).toBeNull();
  });

  it("the wish modal shows no scene in WRITE_WISH", async () => {
    const { container } = render(<FlowRoot eventId="loy_krathong" />);
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(stateOf(container)).toBe("WRITE_WISH");
    expect(screen.getByRole("dialog", { name: WISH_COPY.title })).toBeInTheDocument();
    expect(screen.queryByTestId("scene-viewport")).toBeNull();
    completeWish();
    await act(async () => {});
    expect(stateOf(container)).toBe("RITUAL_RELEASE");
  });

  const walkToRitual = () => {
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    completeWish();
  };

  it("release finishes the ritual (no scene mounted)", async () => {
    const { container } = render(<FlowRoot eventId="loy_krathong" />);
    walkToRitual();
    fireEvent.click(screen.getByRole("button", { name: "ปล่อยกระทง" }));
    await waitFor(() => expect(stateOf(container)).toBe("SHARED_WORLD_EXPLORE"));
    const root = container.querySelector("[data-flow-state]")!;
    expect(root).toHaveAttribute("data-own-krathong", "released");
    expect(api.posts).toHaveLength(1);
    expect(api.posts[0].url).toBe("/api/creations");
    expect(api.posts[0].body.coord).toEqual(buildReleaseCoord(LOY_KRATHONG_PIER_RELEASE_SPOT));
    expect(useBuilderStore.getState().wish).toBeNull();
  });

  it("a failed save stays in the ritual", async () => {
    api.status = 503;
    api.body = { error: "unavailable" };
    const { container } = render(<FlowRoot eventId="loy_krathong" />);
    walkToRitual();
    fireEvent.click(screen.getByRole("button", { name: "ปล่อยกระทง" }));
    await waitFor(() => expect(container.querySelector("[data-flow-state]")).toHaveAttribute("data-ritual-error", "unavailable"));
    expect(stateOf(container)).toBe("RITUAL_RELEASE");
    expect(screen.getByRole("button", { name: "ปล่อยกระทง" })).toBeEnabled();
    expect(screen.getByTestId("ritual-status")).toHaveTextContent(RITUAL_COPY.errors.unavailable);
  });

  it("moderation-blocked returns to the wish", async () => {
    api.status = 422;
    api.body = { error: "moderation_blocked", reasons: ["phone"] };
    const { container } = render(<FlowRoot eventId="loy_krathong" />);
    walkToRitual();
    fireEvent.click(screen.getByRole("button", { name: "ปล่อยกระทง" }));
    await waitFor(() => expect(stateOf(container)).toBe("WRITE_WISH"));
    expect(useBuilderStore.getState().wishServerReasons).toEqual(["phone"]);
  });

  it("a saved release is recorded in the device's creation list", async () => {
    const { container } = render(<FlowRoot eventId="loy_krathong" />);
    walkToRitual();
    fireEvent.click(screen.getByRole("button", { name: "ปล่อยกระทง" }));
    await waitFor(() => expect(stateOf(container)).toBe("SHARED_WORLD_EXPLORE"));
    const raw = window.localStorage.getItem(MY_CREATIONS_STORAGE_KEY)!;
    const list = JSON.parse(raw) as Record<string, unknown>[];
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("0f8b6c1e-3a2d-4c5b-9e7f-1a2b3c4d5e6f");
    expect(list[0].zoneId).toBe(1);
    expect(Object.keys(list[0])).toEqual([...MY_CREATION_ENTRY_KEYS]);
    expect(raw).not.toContain(window.localStorage.getItem(DEVICE_OWNER_TOKEN_STORAGE_KEY)!);
    expect(raw.toLowerCase()).not.toContain("wish");
    expect(raw).not.toContain("ownerToken");
    expect(raw).not.toContain("coord");
  });

  it("the Find My button appears only in SHARED_WORLD_EXPLORE, once this device holds a krathong", async () => {
    render(<FlowRoot eventId="loy_krathong" />);
    walkToRitual();
    expect(screen.queryByTestId("my-creations")).toBeNull();
    act(() => {
      useWorldStore.setState({ eventId: "loy_krathong", currentZoneId: 1, zoneCount: 1, zoneStatus: "ready" });
    });
    expect(screen.queryByTestId("my-creations")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ปล่อยกระทง" }));
    const open = await screen.findByRole("button", { name: MY_CREATIONS_COPY.openButton });
    expect(open.closest('[data-overlay-slot="corner"]')).not.toBeNull();
    expect(screen.queryByTestId("my-creations-list")).toBeNull(); // one krathong: the button goes straight to it
  });

  it("F1 the world HUD column: Find My, day/night toggle, rotate in the corner; the top card holds only the zone navigator", async () => {
    const { container } = render(<FlowRoot eventId="loy_krathong" />);
    walkToRitual();
    act(() => {
      useWorldStore.setState({ eventId: "loy_krathong", currentZoneId: 1, zoneCount: 1, zoneStatus: "ready" });
    });
    fireEvent.click(screen.getByRole("button", { name: "ปล่อยกระทง" }));
    await waitFor(() => expect(stateOf(container)).toBe("SHARED_WORLD_EXPLORE"));
    await screen.findByRole("button", { name: MY_CREATIONS_COPY.openButton });
    const corner = container.querySelector('[data-overlay-slot="corner"]')!;
    const labels = within(corner as HTMLElement)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual([MY_CREATIONS_COPY.openButton, LIGHT_PRESET_TOGGLE_COPY[expectedShown()], WORLD_VIEW_ROTATE_BUTTON_COPY.ariaLabel, SKY_LAUNCH_SWITCH_COPY[SKY_LAUNCH_DEFAULT_KIND]]);
    const top = container.querySelector('[data-overlay-slot="top"]') as HTMLElement;
    expect(within(top).getByTestId("zone-navigator")).toBeInTheDocument();
    expect(within(top).queryByTestId("day-night-toggle")).toBeNull();
    expect(within(top).queryByTestId("my-creations")).toBeNull();
    expect(within(top).queryByRole("button", { name: WORLD_VIEW_ROTATE_BUTTON_COPY.ariaLabel })).toBeNull();
  });

  it("a name typed in the wish step is sent as displayName and not kept after the save (MFW-63)", async () => {
    const { container } = render(<FlowRoot eventId="loy_krathong" />);
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    fireEvent.change(screen.getByRole("textbox", { name: WISH_COPY.nameLabel }), { target: { value: " น้องมะลิ " } });
    completeWish();
    expect(useBuilderStore.getState().wishDisplayName).toBe("น้องมะลิ");
    fireEvent.click(screen.getByRole("button", { name: "ปล่อยกระทง" }));
    await waitFor(() => expect(stateOf(container)).toBe("SHARED_WORLD_EXPLORE"));
    expect(api.posts).toHaveLength(1);
    expect(api.posts[0].body.displayName).toBe("น้องมะลิ");
    expect(api.posts[0].body.wishVisibility).toBe("private");
    expect(useBuilderStore.getState().wishDisplayName).toBeNull();
    expect(useBuilderStore.getState().wish).toBeNull();
    expect(JSON.stringify({ ...window.localStorage })).not.toContain("น้องมะลิ");
  });

  describe("full-screen stage (MFW-54, backlog 10.2)", () => {
    const inSlot = (el: Element, slot: string) => el.closest(`[data-overlay-slot="${slot}"]`) !== null;
    const stageLayer = () => screen.getByTestId("stage-layer");
    const overlayLayer = () => screen.getByTestId("overlay-layer");

    it("full-screen stage: scene in the stage layer, controls in the overlay layer", async () => {
      act(() => useDeviceStore.getState().setQualityTier("HIGH"));
      const { container } = render(<FlowRoot eventId="loy_krathong" />);
      expect(container.querySelector("[data-flow-state]")).toHaveAttribute("data-stage-layout", "fullscreen");

      const scene = await screen.findByTestId("scene-viewport");
      expect(stageLayer()).toContainElement(scene);
      expect(overlayLayer()).toContainElement(screen.getByRole("region", { name: "แต่งกระทง" }));
      expect(within(stageLayer()).queryByRole("button")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
      expect(inSlot(screen.getByRole("dialog", { name: WISH_COPY.title }), "dialog")).toBe(true);

      act(() => {
        useWorldStore.setState({ eventId: "loy_krathong", currentZoneId: 1, zoneCount: 1, zoneStatus: "ready" });
      });
      completeWish();
      expect(inSlot(screen.getByTestId("ritual-release-panel"), "panel")).toBe(true);
      expect(stageLayer()).toContainElement(await screen.findByTestId("scene-viewport"));

      fireEvent.click(screen.getByRole("button", { name: "ปล่อยกระทง" }));
      await waitFor(() => expect(stateOf(container)).toBe("SHARED_WORLD_EXPLORE"));
      expect(inSlot(await screen.findByTestId("zone-navigator"), "top")).toBe(true);
      expect(inSlot(await screen.findByTestId("my-creations"), "corner")).toBe(true);
      expect(inSlot(screen.getByRole("heading", { name: FLOW_STEP_COPY.SHARED_WORLD_EXPLORE.title }), "panel")).toBe(true);
      expect(stageLayer()).toContainElement(screen.getByTestId("scene-viewport"));
    });

    it("F2 CUSTOMIZE_OBJECT: the corner holds only the day/night toggle (MFW-74)", () => {
      const { container } = render(<FlowRoot eventId="loy_krathong" />);
      const corner = container.querySelector('[data-overlay-slot="corner"]') as HTMLElement;
      expect(within(corner).getAllByRole("button")).toHaveLength(1);
      expect(within(corner).getByTestId("day-night-toggle")).toBeInTheDocument();
      expect(screen.getAllByTestId("day-night-toggle")).toHaveLength(1);
    });

    it("F3 the rotate button asks the scene to turn the view (viewRotateRequestId + 1)", async () => {
      const { container } = render(<FlowRoot eventId="loy_krathong" />);
      walkToRitual();
      act(() => {
        useWorldStore.setState({ eventId: "loy_krathong", currentZoneId: 1, zoneCount: 1, zoneStatus: "ready" });
      });
      fireEvent.click(screen.getByRole("button", { name: "ปล่อยกระทง" }));
      await waitFor(() => expect(stateOf(container)).toBe("SHARED_WORLD_EXPLORE"));
      const before = useUIStore.getState().viewRotateRequestId;
      fireEvent.click(screen.getByRole("button", { name: WORLD_VIEW_ROTATE_BUTTON_COPY.ariaLabel }));
      expect(useUIStore.getState().viewRotateRequestId).toBe(before + 1);
    });

    it("the scene element survives RITUAL → WORLD", async () => {
      act(() => useDeviceStore.getState().setQualityTier("HIGH"));
      const { container } = render(<FlowRoot eventId="loy_krathong" />);
      walkToRitual();
      const before = await screen.findByTestId("scene-viewport");
      fireEvent.click(screen.getByRole("button", { name: "ปล่อยกระทง" }));
      await waitFor(() => expect(stateOf(container)).toBe("SHARED_WORLD_EXPLORE"));
      expect(screen.getByTestId("scene-viewport")).toBe(before);
    });
  });
});

describe("minimal UI (MFW-55)", () => {
  const primaryCount = () => document.querySelectorAll('[data-ui-emphasis="primary"]').length;
  const RAW_STATE_ID = /CUSTOMIZE_OBJECT|WRITE_WISH|RITUAL_RELEASE|SHARED_WORLD_EXPLORE/;

  /** Walks CUSTOMIZE → WISH → RITUAL → WORLD without a scene and calls `check` in each step. */
  async function walkAllSteps(check: (step: string) => void) {
    const { container } = render(<FlowRoot eventId="loy_krathong" />);
    expect(stateOf(container)).toBe("CUSTOMIZE_OBJECT");
    check("CUSTOMIZE_OBJECT");
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(stateOf(container)).toBe("WRITE_WISH");
    check("WRITE_WISH");
    completeWish();
    expect(stateOf(container)).toBe("RITUAL_RELEASE");
    check("RITUAL_RELEASE");
    act(() => {
      useWorldStore.setState({ eventId: "loy_krathong", currentZoneId: 1, zoneCount: 1, zoneStatus: "ready" });
    });
    fireEvent.click(screen.getByRole("button", { name: "ปล่อยกระทง" }));
    await waitFor(() => expect(stateOf(container)).toBe("SHARED_WORLD_EXPLORE"));
    check("SHARED_WORLD_EXPLORE");
  }

  it("at most one primary action per step (MFW-55 AC3)", async () => {
    const counts: Record<string, number> = {};
    await walkAllSteps((step) => {
      counts[step] = primaryCount();
    });
    expect(counts).toEqual({ CUSTOMIZE_OBJECT: 1, WRITE_WISH: 1, RITUAL_RELEASE: 1, SHARED_WORLD_EXPLORE: 0 });
  });

  it("no raw flow-state id is shown in any step", async () => {
    const seen: string[] = [];
    await walkAllSteps((step) => {
      seen.push(step);
      expect(document.body.textContent).not.toMatch(RAW_STATE_ID);
    });
    expect(seen).toHaveLength(4);
  });

  it("FR1 (MFW-91): the christmas entry never says กระทง, สายน้ำ, คุ้งน้ำ or ลอย in the first three steps", () => {
    const FORBIDDEN = ["กระทง", "สายน้ำ", "คุ้งน้ำ", "ลอย"];
    const assertClean = () => {
      const attrs = Array.from(document.querySelectorAll("[aria-label],[placeholder],[title]")).flatMap((el) =>
        ["aria-label", "placeholder", "title"].flatMap((a) => el.getAttribute(a) ?? []),
      );
      const all = [document.body.textContent ?? "", ...attrs].join("\n");
      for (const w of FORBIDDEN) expect(all, w).not.toContain(w);
    };
    const { container } = render(<FlowRoot eventId="christmas" />);
    expect(stateOf(container)).toBe("CUSTOMIZE_OBJECT");
    expect(screen.getByRole("region", { name: CHRISTMAS_COPY.customizer.panelLabel })).toBeInTheDocument();
    assertClean();
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(stateOf(container)).toBe("WRITE_WISH");
    assertClean();
    fireEvent.change(screen.getByRole("textbox", { name: CHRISTMAS_COPY.wish.textLabel }), { target: { value: "ขอให้ทุกคนมีความสุข" } });
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(stateOf(container)).toBe("RITUAL_RELEASE");
    expect(screen.getByRole("button", { name: CHRISTMAS_COPY.ritual.releaseButton })).toBeInTheDocument();
    assertClean();
  });
});
