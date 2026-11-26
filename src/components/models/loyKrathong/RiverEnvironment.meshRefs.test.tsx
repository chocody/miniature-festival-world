import { cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Group, InstancedMesh, Mesh } from "three";
import { SCENE_OBJECT_NAMES } from "@/components/canvas3d/sceneObjectNames";
import { RiverEnvironment } from "./RiverEnvironment";
import { LOY_KRATHONG_RIVER_LAYOUT } from "./riverLayout";

vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: { invalidate: () => void }) => unknown) => selector({ invalidate: () => {} }),
  useFrame: () => {},
}));

/** Records each InstancedPart's props (the DOM stub cannot mount a real InstancedMesh). */
const parts = vi.hoisted(() => new Map<string, { meshRef?: unknown }>());
vi.mock("@/components/canvas3d/InstancedPart", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/canvas3d/InstancedPart")>();
  return {
    ...actual,
    InstancedPart: (props: Parameters<typeof actual.InstancedPart>[0]) => {
      parts.set(props.name, props);
      return actual.InstancedPart(props);
    },
  };
});

const baseProps = {
  layout: LOY_KRATHONG_RIVER_LAYOUT,
  shadows: false,
  onWaterSelected: () => {},
  selectedLampIndex: 0,
  onLampSelected: () => {},
  lightPreset: "NIGHT" as const,
};

beforeEach(() => parts.clear());
afterEach(cleanup);

describe("RiverEnvironment lamp-head ref (MFW-50 lantern flicker)", () => {
  it("passes lampHeadMeshRef as the lamp-head InstancedPart's meshRef, and to no other part", () => {
    const lampHeadMeshRef = createRef<InstancedMesh>();
    render(
      <RiverEnvironment {...baseProps} waterRef={createRef<Mesh>()} lampFocusRef={createRef<Group>()} lampHeadMeshRef={lampHeadMeshRef} />,
    );
    expect(parts.get(SCENE_OBJECT_NAMES.lampHeads)?.meshRef).toBe(lampHeadMeshRef);
    const others = [...parts.entries()].filter(([name]) => name !== SCENE_OBJECT_NAMES.lampHeads);
    expect(others.length).toBeGreaterThan(0);
    for (const [name, props] of others) expect(props.meshRef, name).not.toBe(lampHeadMeshRef);
  });

  it("without the prop the lamp heads get no external ref", () => {
    render(<RiverEnvironment {...baseProps} waterRef={createRef<Mesh>()} lampFocusRef={createRef<Group>()} />);
    expect(parts.get(SCENE_OBJECT_NAMES.lampHeads)?.meshRef).toBeUndefined();
  });
});
