import { cleanup, render } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MeshStandardMaterial } from "three";
import { KrathongAssetsProvider, useKrathongAssets } from "@/components/models/loyKrathong";
import { LIGHT_PRESET_IDS, LIGHT_PRESETS, type LightPresetId } from "@/config/look.config";
import { SceneLighting } from "./SceneLighting";

const r3f = vi.hoisted(() => ({ useFrame: vi.fn(), invalidate: vi.fn() }));
vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: { invalidate: () => void }) => unknown) => selector({ invalidate: r3f.invalidate }),
  useFrame: r3f.useFrame,
}));

const flame = { current: null as MeshStandardMaterial | null };
function FlameProbe() {
  const material = useKrathongAssets().material("flame");
  useLayoutEffect(() => {
    flame.current = material;
  }, [material]);
  return null;
}

function Scene({ preset, shadows = true }: { preset: LightPresetId; shadows?: boolean }) {
  return (
    <KrathongAssetsProvider>
      <SceneLighting preset={preset} shadows={shadows} shadowMapSizePx={512} />
      <FlameProbe />
    </KrathongAssetsProvider>
  );
}

afterEach(() => {
  cleanup();
  r3f.useFrame.mockClear();
  r3f.invalidate.mockClear();
});

describe("SceneLighting (MFW-47)", () => {
  it.each(LIGHT_PRESET_IDS)("%s: hemisphere, ambient and key light from config", (id) => {
    const p = LIGHT_PRESETS[id];
    const { container } = render(<Scene preset={id} />);
    expect(container.querySelector("color")).toHaveAttribute("args", p.background);
    const hemi = container.querySelector("hemisphereLight")!;
    expect(hemi).toHaveAttribute("color", p.hemisphere.skyColor);
    expect(hemi).toHaveAttribute("groundColor", p.hemisphere.groundColor);
    expect(hemi).toHaveAttribute("intensity", String(p.hemisphere.intensity));
    const ambient = container.querySelector("ambientLight")!;
    expect(ambient).toHaveAttribute("color", p.ambient.color);
    expect(ambient).toHaveAttribute("intensity", String(p.ambient.intensity));
    const key = container.querySelector("directionalLight")!;
    expect(key).toHaveAttribute("color", p.key.color);
    expect(key).toHaveAttribute("intensity", String(p.key.intensity));
    expect(key).toHaveAttribute("position", p.key.position.join(","));
    expect(key).toHaveAttribute("shadow-intensity", String(p.key.shadow.intensity));
    expect(key).toHaveAttribute("shadow-radius", String(p.key.shadow.radius));
    expect(key).toHaveAttribute("shadow-mapSize", "512,512");
  });

  it.each(LIGHT_PRESET_IDS)("%s: the flame glows untone-mapped at the preset intensity", (id) => {
    render(<Scene preset={id} />);
    expect(flame.current!.emissiveIntensity).toBe(LIGHT_PRESETS[id].flame.emissiveIntensity);
    expect(flame.current!.toneMapped).toBe(false);
    expect(r3f.invalidate).toHaveBeenCalled();
  });

  it("a DAY → NIGHT switch updates the flame (instant cut, no frame loop)", () => {
    const { rerender } = render(<Scene preset="DAY" />);
    const material = flame.current!;
    rerender(<Scene preset="NIGHT" />);
    expect(flame.current).toBe(material);
    expect(material.emissiveIntensity).toBe(LIGHT_PRESETS.NIGHT.flame.emissiveIntensity);
    expect(r3f.useFrame).not.toHaveBeenCalled();
  });

  it("casts shadows only when the tier has them", () => {
    const { container } = render(<Scene preset="DAY" shadows={false} />);
    expect(container.querySelector("directionalLight")).not.toHaveAttribute("castShadow", "true");
  });
});
