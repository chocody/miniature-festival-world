import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBuilderStore } from "@/store/useBuilderStore";
import { useDeviceStore } from "@/store/useDeviceStore";
import { useUIStore } from "@/store/useUIStore";
import { INITIAL_WORLD_STATE, useWorldStore } from "@/store/useWorldStore";
import { WISH_COPY } from "@/config/wish.config";
import { LOY_KRATHONG_PIER_RELEASE_SPOT } from "@/config/events/loyKrathong.river.config";
import { RITUAL_COPY } from "@/config/ritual.config";
import { buildReleaseCoord } from "@/core/ritual";
import { DEVICE_OWNER_TOKEN_STORAGE_KEY, MY_CREATIONS_STORAGE_KEY } from "@/config/ownership.config";
import { MY_CREATION_ENTRY_KEYS, MY_CREATIONS_COPY } from "@/config/myCreations.config";
import { OWNER_WISH_COPY } from "@/config/ownerWish.config";
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
      if (init?.method !== "POST") return new Response(JSON.stringify({}), { status: 404 });
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
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
  useBuilderStore.setState(useBuilderStore.getInitialState(), true);
  useWorldStore.setState({ ...INITIAL_WORLD_STATE }, true);
  viewSpies.rotate.mockClear();
  viewSpies.zoom.mockClear();
  for (const fn of Object.values(zones)) fn.mockClear();
});

const completeWish = (text = "ขอให้ทุกคนมีความสุข") => {
  fireEvent.change(screen.getByRole("textbox", { name: WISH_COPY.textLabel }), { target: { value: text } });
  fireEvent.click(screen.getByRole("radio", { name: WISH_COPY.options.private.label }));
  fireEvent.click(screen.getByRole("button", { name: WISH_COPY.submit }));
};

const stateOf = (container: HTMLElement) =>
  container.querySelector("[data-flow-state]")?.getAttribute("data-flow-state");

describe("FlowRoot", () => {
  it("clicks through all 5 states", async () => {
    const { container } = render(<FlowRoot />);
    expect(stateOf(container)).toBe("LANDING_EVENT_SELECT");
    expect(container.querySelector("[data-flow-state]")).not.toHaveAttribute("data-interaction-mode");
    fireEvent.click(screen.getByRole("button", { name: /Loy Krathong/ }));
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
    render(<FlowRoot />);
    expect(screen.queryByRole("note")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Loy Krathong/ }));
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
    render(<FlowRoot />);
    expect(screen.queryByRole("region", { name: "แต่งกระทง" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Loy Krathong/ }));
    expect(screen.getByRole("region", { name: "แต่งกระทง" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(screen.queryByRole("region", { name: "แต่งกระทง" })).toBeNull();
  });

  it("3D tier: the bar's view buttons drive the scene", async () => {
    act(() => useDeviceStore.getState().setQualityTier("HIGH"));
    render(<FlowRoot />);
    fireEvent.click(screen.getByRole("button", { name: /Loy Krathong/ }));
    await screen.findByTestId("scene-viewport");
    fireEvent.click(screen.getByRole("button", { name: "หมุนขวา" }));
    expect(viewSpies.rotate).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "ซูมออก" }));
    expect(viewSpies.zoom).toHaveBeenCalledWith(-1);
  });

  it("FALLBACK_2D and unprofiled: bar without view buttons", async () => {
    render(<FlowRoot />);
    fireEvent.click(screen.getByRole("button", { name: /Loy Krathong/ }));
    expect(screen.getByRole("region", { name: "แต่งกระทง" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ซูมเข้า" })).toBeNull();
    act(() => useDeviceStore.getState().setQualityTier("FALLBACK_2D"));
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "ซูมเข้า" })).toBeNull();
    expect(screen.getByRole("region", { name: "แต่งกระทง" })).toBeInTheDocument();
  });

  it("clicking a Coming Soon festival keeps landing", () => {
    const { container } = render(<FlowRoot />);
    fireEvent.click(screen.getByRole("button", { name: /Christmas/ }));
    expect(stateOf(container)).toBe("LANDING_EVENT_SELECT");
  });

  it("exposes quality tier and reduced motion from the device store", () => {
    const { container } = render(<FlowRoot />);
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
    const { container } = render(<FlowRoot />);
    await act(async () => {});
    expect(screen.queryByTestId("scene-viewport")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Loy Krathong/ }));
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
    render(<FlowRoot />);
    fireEvent.click(screen.getByRole("button", { name: /Loy Krathong/ }));
    await act(async () => {});
    expect(screen.queryByTestId("scene-viewport")).toBeNull();

    act(() => useDeviceStore.getState().setQualityTier("FALLBACK_2D"));
    await act(async () => {});
    expect(screen.queryByTestId("scene-viewport")).toBeNull();
  });

  it("enters the shared world once when the ritual starts and leaves on unmount", async () => {
    const { unmount } = render(<FlowRoot />);
    fireEvent.click(screen.getByRole("button", { name: /Loy Krathong/ }));
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
    render(<FlowRoot />);
    expect(screen.queryByTestId("zone-navigator")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Loy Krathong/ }));
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
    const { container } = render(<FlowRoot />);
    fireEvent.click(screen.getByRole("button", { name: /Loy Krathong/ }));
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
  });

  it("FALLBACK_2D: the wish modal works and no scene mounts", async () => {
    act(() => useDeviceStore.getState().setQualityTier("FALLBACK_2D"));
    const { container } = render(<FlowRoot />);
    fireEvent.click(screen.getByRole("button", { name: /Loy Krathong/ }));
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
    fireEvent.click(screen.getByRole("button", { name: /Loy Krathong/ }));
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    completeWish();
  };

  it("release finishes the ritual (FALLBACK_2D)", async () => {
    act(() => useDeviceStore.getState().setQualityTier("FALLBACK_2D"));
    const { container } = render(<FlowRoot />);
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
    const { container } = render(<FlowRoot />);
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
    const { container } = render(<FlowRoot />);
    walkToRitual();
    fireEvent.click(screen.getByRole("button", { name: "ปล่อยกระทง" }));
    await waitFor(() => expect(stateOf(container)).toBe("WRITE_WISH"));
    expect(useBuilderStore.getState().wishServerReasons).toEqual(["phone"]);
  });

  it("a saved release is recorded in the device's creation list", async () => {
    const { container } = render(<FlowRoot />);
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
    render(<FlowRoot />);
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

  it("the drawer entry offers the private wish reveal (MFW-31)", async () => {
    const { container } = render(<FlowRoot />);
    walkToRitual();
    act(() => {
      useWorldStore.setState({ eventId: "loy_krathong", currentZoneId: 1, zoneCount: 1, zoneStatus: "ready" });
    });
    fireEvent.click(screen.getByRole("button", { name: "ปล่อยกระทง" }));
    await waitFor(() => expect(stateOf(container)).toBe("SHARED_WORLD_EXPLORE"));
    fireEvent.click(await screen.findByRole("button", { name: MY_CREATIONS_COPY.openButton }));
    const list = await screen.findByTestId("my-creations-list");
    expect(within(list).getByRole("button", { name: OWNER_WISH_COPY.reveal })).toBeInTheDocument();
  });
});
