import { LIGHT_PRESET_SWITCH_COPY } from "@/config/look.config";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBuilderStore } from "@/store/useBuilderStore";
import { useDeviceStore } from "@/store/useDeviceStore";
import { useUIStore } from "@/store/useUIStore";
import { INITIAL_WORLD_STATE, useWorldStore } from "@/store/useWorldStore";
import { WISH_COPY, WISH_SWITCH_COPY } from "@/config/wish.config";
import { LOY_KRATHONG_PIER_RELEASE_SPOT } from "@/config/events/loyKrathong.river.config";
import { RITUAL_COPY } from "@/config/ritual.config";
import { buildReleaseCoord } from "@/core/ritual";
import { DEVICE_OWNER_TOKEN_STORAGE_KEY, MY_CREATIONS_STORAGE_KEY } from "@/config/ownership.config";
import { MY_CREATION_ENTRY_KEYS, MY_CREATIONS_COPY } from "@/config/myCreations.config";
import { OWNER_WISH_COPY } from "@/config/ownerWish.config";
import { FLOW_STEP_COPY } from "@/config/ui.config";
import { FlowRoot } from "./FlowRoot";
import { OWNERSHIP_LOSS_WARNING } from "./OwnershipNotice";

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

vi.mock("@/components/canvas2d", async () => {
  const React = await import("react");
  return {
    FlatViewport: ({ mode }: { mode: string }) =>
      React.createElement("div", { "data-testid": "flat-viewport", "data-mode": mode }),
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
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
  useBuilderStore.setState(useBuilderStore.getInitialState(), true);
  useWorldStore.setState({ ...INITIAL_WORLD_STATE }, true);
  viewSpies.rotate.mockClear();
  viewSpies.zoom.mockClear();
  for (const fn of Object.values(zones)) fn.mockClear();
});

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
    expect(screen.queryByRole("button")).toBeNull();
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

  it("FALLBACK_2D and unprofiled: bar without view buttons", async () => {
    render(<FlowRoot eventId="loy_krathong" />);
    expect(screen.getByRole("region", { name: "แต่งกระทง" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ซูมเข้า" })).toBeNull();
    act(() => useDeviceStore.getState().setQualityTier("FALLBACK_2D"));
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "ซูมเข้า" })).toBeNull();
    expect(screen.getByRole("region", { name: "แต่งกระทง" })).toBeInTheDocument();
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

  it("never mounts the scene before profiling or on FALLBACK_2D", async () => {
    render(<FlowRoot eventId="loy_krathong" />);
    await act(async () => {});
    expect(screen.queryByTestId("scene-viewport")).toBeNull();

    act(() => useDeviceStore.getState().setQualityTier("FALLBACK_2D"));
    await act(async () => {});
    expect(screen.queryByTestId("scene-viewport")).toBeNull();
  });

  it("FALLBACK_2D mounts the flat viewport per mode (MFW-33)", async () => {
    act(() => useDeviceStore.getState().setQualityTier("FALLBACK_2D"));
    render(<FlowRoot eventId="loy_krathong" />);
    expect(await screen.findByTestId("flat-viewport")).toHaveAttribute("data-mode", "CUSTOMIZE");
    expect(screen.queryByRole("button", { name: "ซูมเข้า" })).toBeNull();
    expect(screen.queryByTestId("scene-viewport")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(screen.queryByTestId("flat-viewport")).toBeNull(); // WRITE_WISH
    completeWish();
    expect(await screen.findByTestId("flat-viewport")).toHaveAttribute("data-mode", "RITUAL_RELEASE");
  });

  it("a 3D tier or an unprofiled device never mounts the flat viewport", async () => {
    render(<FlowRoot eventId="loy_krathong" />);
    await act(async () => {});
    expect(screen.queryByTestId("flat-viewport")).toBeNull();
    act(() => useDeviceStore.getState().setQualityTier("HIGH"));
    await act(async () => {});
    expect(screen.queryByTestId("flat-viewport")).toBeNull();
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
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([MY_CREATIONS_COPY.openButton]);
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

  it("FALLBACK_2D: the wish modal works and no scene mounts", async () => {
    act(() => useDeviceStore.getState().setQualityTier("FALLBACK_2D"));
    const { container } = render(<FlowRoot eventId="loy_krathong" />);
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(stateOf(container)).toBe("WRITE_WISH");
    expect(screen.getByRole("dialog", { name: WISH_COPY.title })).toBeInTheDocument();
    expect(screen.queryByTestId("scene-viewport")).toBeNull();
    completeWish();
    await act(async () => {});
    expect(stateOf(container)).toBe("RITUAL_RELEASE");
    expect(screen.queryByTestId("scene-viewport")).toBeNull();
  });

  const walkToRitual = () => {
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    completeWish();
  };

  it("release finishes the ritual (FALLBACK_2D)", async () => {
    act(() => useDeviceStore.getState().setQualityTier("FALLBACK_2D"));
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

  it("the drawer appears only in SHARED_WORLD_EXPLORE", async () => {
    render(<FlowRoot eventId="loy_krathong" />);
    walkToRitual();
    expect(screen.queryByTestId("my-creations")).toBeNull();
    act(() => {
      useWorldStore.setState({ eventId: "loy_krathong", currentZoneId: 1, zoneCount: 1, zoneStatus: "ready" });
    });
    expect(screen.queryByTestId("my-creations")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ปล่อยกระทง" }));
    const open = await screen.findByRole("button", { name: MY_CREATIONS_COPY.openButton });
    fireEvent.click(open);
    const list = await screen.findByTestId("my-creations-list");
    expect(list).toHaveTextContent("คุ้งน้ำที่ 1");
  });

  it("the drawer entry offers the switch and the private wish reveal", async () => {
    const { container } = render(<FlowRoot eventId="loy_krathong" />);
    walkToRitual();
    act(() => {
      useWorldStore.setState({ eventId: "loy_krathong", currentZoneId: 1, zoneCount: 1, zoneStatus: "ready" });
    });
    fireEvent.click(screen.getByRole("button", { name: "ปล่อยกระทง" }));
    await waitFor(() => expect(stateOf(container)).toBe("SHARED_WORLD_EXPLORE"));
    fireEvent.click(await screen.findByRole("button", { name: MY_CREATIONS_COPY.openButton }));
    const list = await screen.findByTestId("my-creations-list");
    const sw = await within(list).findByRole("switch", { name: WISH_SWITCH_COPY.label });
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(within(list).getByRole("button", { name: OWNER_WISH_COPY.reveal })).toBeInTheDocument();
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
      expect(inSlot(screen.getByTestId("my-creations"), "top")).toBe(true);
      expect(inSlot(screen.getByRole("heading", { name: FLOW_STEP_COPY.SHARED_WORLD_EXPLORE.title }), "panel")).toBe(true);
      expect(stageLayer()).toContainElement(screen.getByTestId("scene-viewport"));
    });

    it("the day/night switch floats over the stage: top-left corner, then in the world's top card (MFW-47)", async () => {
      act(() => useDeviceStore.getState().setQualityTier("HIGH"));
      const { container } = render(<FlowRoot eventId="loy_krathong" />);
      const lightSwitch = () => screen.getByRole("radiogroup", { name: LIGHT_PRESET_SWITCH_COPY.groupLabel });
      expect(inSlot(lightSwitch(), "corner")).toBe(true);
      expect(within(stageLayer()).queryByRole("radiogroup")).toBeNull();
      walkToRitual();
      expect(inSlot(lightSwitch(), "corner")).toBe(true);
      act(() => {
        useWorldStore.setState({ eventId: "loy_krathong", currentZoneId: 1, zoneCount: 1, zoneStatus: "ready" });
      });
      fireEvent.click(screen.getByRole("button", { name: "ปล่อยกระทง" }));
      await waitFor(() => expect(stateOf(container)).toBe("SHARED_WORLD_EXPLORE"));
      expect(screen.getAllByRole("radiogroup", { name: LIGHT_PRESET_SWITCH_COPY.groupLabel })).toHaveLength(1);
      expect(inSlot(lightSwitch(), "top")).toBe(true);
    });

    it("FALLBACK_2D shows no day/night switch (2D day/night is MFW-51)", () => {
      act(() => useDeviceStore.getState().setQualityTier("FALLBACK_2D"));
      render(<FlowRoot eventId="loy_krathong" />);
      expect(screen.queryByRole("radiogroup", { name: LIGHT_PRESET_SWITCH_COPY.groupLabel })).toBeNull();
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

    it("FALLBACK_2D: the flat view sits in the stage layer, controls in the overlay layer", async () => {
      act(() => useDeviceStore.getState().setQualityTier("FALLBACK_2D"));
      const { container } = render(<FlowRoot eventId="loy_krathong" />);
      expect(container.querySelector("[data-flow-state]")).toHaveAttribute("data-stage-layout", "fullscreen");
      expect(stageLayer()).toContainElement(await screen.findByTestId("flat-viewport"));
      expect(overlayLayer()).toContainElement(screen.getByRole("region", { name: "แต่งกระทง" }));
      expect(within(stageLayer()).queryByRole("button")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
      expect(inSlot(screen.getByRole("dialog", { name: WISH_COPY.title }), "dialog")).toBe(true);
      completeWish();
      expect(stageLayer()).toContainElement(await screen.findByTestId("flat-viewport"));
      expect(inSlot(screen.getByTestId("ritual-release-panel"), "panel")).toBe(true);

      act(() => {
        useWorldStore.setState({ eventId: "loy_krathong", currentZoneId: 1, zoneCount: 1, zoneStatus: "ready" });
      });
      fireEvent.click(screen.getByRole("button", { name: "ปล่อยกระทง" }));
      await waitFor(() => expect(stateOf(container)).toBe("SHARED_WORLD_EXPLORE"));
      expect(stageLayer()).toContainElement(screen.getByTestId("flat-viewport"));
      expect(inSlot(screen.getByTestId("zone-navigator"), "top")).toBe(true);
      expect(inSlot(screen.getByTestId("my-creations"), "top")).toBe(true);
      expect(inSlot(screen.getByRole("heading", { name: FLOW_STEP_COPY.SHARED_WORLD_EXPLORE.title }), "panel")).toBe(true);
    });
  });
});

describe("minimal UI (MFW-55)", () => {
  const primaryCount = () => document.querySelectorAll('[data-ui-emphasis="primary"]').length;
  const RAW_STATE_ID = /CUSTOMIZE_OBJECT|WRITE_WISH|RITUAL_RELEASE|SHARED_WORLD_EXPLORE/;

  /** Walks CUSTOMIZE → WISH → RITUAL → WORLD on FALLBACK_2D and calls `check` in each step. */
  async function walkAllSteps(check: (step: string) => void) {
    act(() => useDeviceStore.getState().setQualityTier("FALLBACK_2D"));
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
});
