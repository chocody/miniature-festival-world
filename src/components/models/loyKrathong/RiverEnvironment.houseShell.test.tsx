// MFW-77: the house bodies draw the tier's shell variant (HOUSE_SHELL_TIERS) on one InstancedMesh; a tier change swaps the geometry only.
import { act, cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Group, Mesh } from "three";
import { SCENE_OBJECT_NAMES } from "@/components/canvas3d/sceneObjectNames";
import { RIVER_HOUSE_BODY_PARTS } from "@/config/events/loyKrathong.river.config";
import type { QualityTier } from "@/config/performance.config";
import type { ScenePartSpec } from "@/config/scene.config";
import { useDeviceStore } from "@/store/useDeviceStore";
import { RiverEnvironment } from "./RiverEnvironment";
import { LOY_KRATHONG_RIVER_LAYOUT as layout, houseBodyForTier } from "./riverLayout";

const recorded = vi.hoisted(() => ({ parts: [] as Record<string, unknown>[] }));
vi.mock("@/components/canvas3d/InstancedPart", () => ({
  InstancedPart: (props: Record<string, unknown>) => {
    recorded.parts.push(props);
    return null;
  },
}));
vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: { invalidate: () => void }) => unknown) => selector({ invalidate: () => {} }),
  useFrame: () => {},
}));

function renderEnvironment() {
  return render(
    <RiverEnvironment
      layout={layout}
      shadows={false}
      waterRef={createRef<Mesh>()}
      onWaterSelected={() => {}}
      lampFocusRef={createRef<Group>()}
      selectedLampIndex={0}
      onLampSelected={() => {}}
      lightPreset="NIGHT"
    />,
  );
}

const houseBodyCalls = () => recorded.parts.filter((p) => p.name === SCENE_OBJECT_NAMES.houseBodies);

beforeEach(() => {
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
  recorded.parts.length = 0;
});
afterEach(cleanup);

describe("RiverEnvironment house shell per tier (MFW-77)", () => {
  it.each(["HIGH", "MEDIUM", "LOW"] as const)("RT1 %s: one house-body mesh with the tier's shell part and every house", (tier: QualityTier) => {
    useDeviceStore.getState().setQualityTier(tier);
    renderEnvironment();
    const calls = houseBodyCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].part).toBe(houseBodyForTier(tier));
    expect(calls[0].transforms).toBe(layout.houses);
  });

  it("RT2: a tier switch HIGH → LOW swaps to the lite shell and keeps the same material object", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    renderEnvironment();
    const high = houseBodyCalls().at(-1)!.part as ScenePartSpec;
    expect(high).toBe(RIVER_HOUSE_BODY_PARTS.FULL);
    act(() => useDeviceStore.getState().setQualityTier("LOW"));
    const low = houseBodyCalls().at(-1)!.part as ScenePartSpec;
    expect(low).toBe(RIVER_HOUSE_BODY_PARTS.LITE);
    expect(low.material).toBe(high.material);
    expect(low.geometry).not.toBe(high.geometry);
  });
});
