import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BufferGeometry, InstancedMesh, Material, Matrix4 } from "three";
import { LOY_KRATHONG_RIVER_LAYOUT as layout } from "@/components/models/loyKrathong/riverLayout";
import { LOY_KRATHONG_VILLAGERS } from "@/config/events/loyKrathong.life.config";
import { LIVING_WORLD_TIERS, type RenderTier } from "@/config/performance.config";
import { planVillagerInstances, prepareVillagers } from "@/core/world";
import { useDeviceStore } from "@/store/useDeviceStore";
import { EFFECT_POOL_CAPS } from "@/config/performance.config";
import { VILLAGER_TAP_HOP } from "@/config/gimmicks.config";
import { createObjectPoolManager, releaseExpiredNudges, startNudge, type NudgeSource } from "@/core/effects";
import { NO_RAYCAST } from "./blobShadowMeshes";
import { SCENE_OBJECT_NAMES } from "./sceneObjectNames";
import { Villagers } from "./Villagers";
import { createVillagerMeshes, createVillagerWriteScratch, writeVillagerInstances, type VillagerMeshes } from "./villagerMeshes";

const r3f = vi.hoisted(() => ({ frames: [] as (() => void)[], invalidate: vi.fn() }));
vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: { invalidate: () => void }) => unknown) => selector({ invalidate: r3f.invalidate }),
  useFrame: (cb: () => void) => {
    r3f.frames.push(cb);
  },
}));

const recorded = vi.hoisted(() => ({ meshes: [] as import("./villagerMeshes").VillagerMeshes[], creations: 0 }));
vi.mock("./villagerMeshes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./villagerMeshes")>();
  return {
    ...actual,
    createVillagerMeshes: (...args: Parameters<typeof actual.createVillagerMeshes>) => {
      const meshes = actual.createVillagerMeshes(...args);
      recorded.meshes.push(meshes);
      recorded.creations += 1;
      return meshes;
    },
  };
});

const lastFrame = () => r3f.frames.at(-1)!;
const latest = (): VillagerMeshes => recorded.meshes.at(-1)!;
let NOW = 1_700_000_000_000;
const now = () => NOW;
const matrices = (mesh: InstancedMesh) => Array.from(mesh.instanceMatrix.array);

/** The STAND pose (not animated) for `tier`, written by the real writer into fresh meshes. */
function standPose(tier: RenderTier): VillagerMeshes {
  const v = prepareVillagers(LOY_KRATHONG_VILLAGERS.slice(0, LIVING_WORLD_TIERS[tier].villagerCount), layout.paths, layout.channel);
  const plan = planVillagerInstances(v.map((x) => x.def));
  const meshes = latest();
  const copy: VillagerMeshes = createVillagerMeshes(
    { bodyGeometry: meshes.body.geometry, headGeometry: meshes.head.geometry, hatGeometry: meshes.hat!.geometry, material: meshes.body.material as never },
    plan,
  );
  writeVillagerInstances(copy, plan, v, layout, 0, false, createVillagerWriteScratch(), null);
  return copy;
}

beforeEach(() => {
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
  r3f.frames.length = 0;
  r3f.invalidate.mockClear();
  recorded.meshes.length = 0;
  recorded.creations = 0;
  NOW = 1_700_000_000_000;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Villagers (MFW-50)", () => {
  it.each(["HIGH", "MEDIUM", "LOW"] as const)("VC1 %s: villager count from LIVING_WORLD_TIERS; one primitive per mesh + one blob mesh", (tier) => {
    useDeviceStore.getState().setQualityTier(tier);
    const { container } = render(<Villagers layout={layout} now={now} />);
    const meshes = latest();
    expect(meshes.head.count).toBe(LIVING_WORLD_TIERS[tier].villagerCount);
    expect(meshes.body.count).toBe(LIVING_WORLD_TIERS[tier].villagerCount);
    expect(container.querySelectorAll(`[name="${SCENE_OBJECT_NAMES.villagers}"]`)).toHaveLength(1);
    expect(container.querySelectorAll("primitive")).toHaveLength(meshes.all.length + 1);
    expect(container.querySelectorAll(`[name="${SCENE_OBJECT_NAMES.villagerBlobShadows}"]`)).toHaveLength(1);
  });

  it("VC2 every villager mesh shares the one silhouette material", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    render(<Villagers layout={layout} now={now} />);
    const { all } = latest();
    for (const mesh of all) expect(mesh.material).toBe(all[0].material);
  });

  it("VC3 HIGH, motion on: frames move the villagers", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    render(<Villagers layout={layout} now={now} />);
    const head = latest().head;
    NOW = 1000;
    lastFrame()();
    const a = matrices(head);
    const version = head.instanceMatrix.version;
    NOW = 4000;
    lastFrame()();
    expect(matrices(head)).not.toEqual(a);
    expect(head.instanceMatrix.version).toBeGreaterThan(version);
  });

  it.each([
    ["reduced motion", "HIGH", true],
    ["LOW", "LOW", false],
  ] as const)("VC4 %s: villagers stand still in the STAND pose; frames write nothing", (_label, tier, reduced) => {
    useDeviceStore.getState().setQualityTier(tier);
    useDeviceStore.getState().setReducedMotion(reduced);
    render(<Villagers layout={layout} now={now} />);
    const meshes = latest();
    const version = meshes.head.instanceMatrix.version;
    const before = matrices(meshes.head);
    NOW += 7_000;
    lastFrame()();
    expect(meshes.head.instanceMatrix.version).toBe(version);
    expect(matrices(meshes.head)).toEqual(before);
    const stand = standPose(tier);
    expect(matrices(meshes.head)).toEqual(matrices(stand.head));
    expect(matrices(meshes.body)).toEqual(matrices(stand.body));
  });

  it("VC4 turning reduced motion on mid-walk re-writes the STAND pose once", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    render(<Villagers layout={layout} now={now} />);
    const meshes = latest();
    NOW = 3_000;
    lastFrame()();
    act(() => useDeviceStore.getState().setReducedMotion(true));
    expect(latest()).toBe(meshes); // nothing re-created
    expect(matrices(meshes.head)).toEqual(matrices(standPose("HIGH").head));
    const version = meshes.head.instanceMatrix.version;
    NOW += 5_000;
    lastFrame()();
    expect(meshes.head.instanceMatrix.version).toBe(version);
  });

  it("VC5 villager meshes never raycast; without onVillagerTapped there are no handlers (taps go through the MFW-60 proxies)", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const { container } = render(<Villagers layout={layout} now={now} />);
    for (const el of container.querySelectorAll("*")) expect(el.getAttribute("onclick")).toBeNull();
    for (const mesh of latest().all) expect(mesh.raycast).toBe(NO_RAYCAST);
  });

  it("VC6 a tier change disposes the old meshes; unmount disposes the meshes and the assets", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const view = render(<Villagers layout={layout} now={now} />);
    const first = latest();
    const meshDispose = vi.spyOn(InstancedMesh.prototype, "dispose");
    act(() => useDeviceStore.getState().setQualityTier("MEDIUM"));
    expect(meshDispose.mock.contexts).toEqual(expect.arrayContaining([first.body, first.head, first.hat]));
    expect(latest().head.count).toBe(LIVING_WORLD_TIERS.MEDIUM.villagerCount);
    const geometryDispose = vi.spyOn(BufferGeometry.prototype, "dispose");
    const materialDispose = vi.spyOn(Material.prototype, "dispose");
    const second = latest();
    view.unmount();
    expect(meshDispose.mock.contexts).toEqual(expect.arrayContaining([second.body, second.head]));
    expect(geometryDispose.mock.contexts).toEqual(expect.arrayContaining([second.body.geometry, second.head.geometry]));
    expect(materialDispose.mock.contexts).toContain(second.body.material);
  });

  it("VC7 frames re-create nothing", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    render(<Villagers layout={layout} now={now} />);
    const meshes = latest();
    const all = [...meshes.all];
    for (let i = 0; i < 3; i++) {
      NOW += 500;
      lastFrame()();
    }
    expect(latest()).toBe(meshes);
    meshes.all.forEach((m, i) => expect(m).toBe(all[i]));
    expect(recorded.creations).toBe(1);
    const m = new Matrix4();
    meshes.head.getMatrixAt(0, m);
    expect(m.equals(new Matrix4())).toBe(false);
  });
});

describe("Villagers tap hop (MFW-60)", () => {
  const source = (): NudgeSource => ({ pool: createObjectPoolManager(EFFECT_POOL_CAPS.HIGH).nudge, now });

  it("VL-a: with onVillagerTapped one named proxy per villager reports its villagerId; without it there are none", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const onTap = vi.fn();
    const { container } = render(<Villagers layout={layout} now={now} nudges={source()} onVillagerTapped={onTap} />);
    const ids = LOY_KRATHONG_VILLAGERS.slice(0, LIVING_WORLD_TIERS.HIGH.villagerCount).map((v) => v.villagerId);
    const proxies = container.querySelectorAll(`[name^="${SCENE_OBJECT_NAMES.propTapPrefix}villager-"]`);
    expect([...proxies].map((p) => p.getAttribute("name"))).toEqual(ids.map((id) => `${SCENE_OBJECT_NAMES.propTapPrefix}villager-${id}`));
    fireEvent.click(proxies[1]);
    expect(onTap).toHaveBeenCalledWith(ids[1]);
    for (const mesh of latest().all) expect(mesh.raycast).toBe(NO_RAYCAST);
    cleanup();
    const plain = render(<Villagers layout={layout} now={now} nudges={source()} />);
    expect(plain.container.querySelectorAll(`[name^="${SCENE_OBJECT_NAMES.propTapPrefix}"]`)).toHaveLength(0);
  });

  it("VL-b: a static (LOW) villager is re-written while nudged plus one tail frame, then not again", () => {
    useDeviceStore.getState().setQualityTier("LOW");
    const nudges = source();
    render(<Villagers layout={layout} now={now} nudges={nudges} onVillagerTapped={vi.fn()} />);
    const head = latest().head;
    const v0 = head.instanceMatrix.version;
    lastFrame()();
    expect(head.instanceMatrix.version).toBe(v0); // idle
    startNudge(nudges.pool, "villager", LOY_KRATHONG_VILLAGERS[0].villagerId, NOW);
    NOW += VILLAGER_TAP_HOP.durationMs / 2;
    const before = matrices(head);
    lastFrame()();
    expect(matrices(head)).not.toEqual(before);
    NOW += VILLAGER_TAP_HOP.durationMs;
    releaseExpiredNudges(nudges.pool, NOW, false);
    const v1 = head.instanceMatrix.version;
    lastFrame()(); // tail: the rest pose
    expect(head.instanceMatrix.version).toBeGreaterThan(v1);
    expect(matrices(head)).toEqual(before);
    const v2 = head.instanceMatrix.version;
    lastFrame()();
    expect(head.instanceMatrix.version).toBe(v2);
  });
});

describe("Villagers per stretch (MFW-58)", () => {
  it("a villager nudge tagged stretch 1 moves only the villagers of stretch 1", () => {
    useDeviceStore.getState().setQualityTier("LOW"); // static pose: only a nudge writes
    const pool = createObjectPoolManager(EFFECT_POOL_CAPS.HIGH).nudge;
    render(<Villagers layout={layout} now={now} nudges={{ pool, now, stretchIndex: 0 }} />);
    const head0 = latest().head;
    const frame0 = lastFrame();
    render(<Villagers layout={layout} now={now} nudges={{ pool, now, stretchIndex: 1 }} />);
    const head1 = latest().head;
    const frame1 = lastFrame();
    startNudge(pool, "villager", LOY_KRATHONG_VILLAGERS[0].villagerId, NOW, 1);
    NOW += VILLAGER_TAP_HOP.durationMs / 2;
    const before0 = matrices(head0);
    const before1 = matrices(head1);
    frame0();
    frame1();
    expect(matrices(head0)).toEqual(before0);
    expect(matrices(head1)).not.toEqual(before1);
  });
});
