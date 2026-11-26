import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FLAT_KRATHONG_PREVIEW_VIEW, FLAT_KRATHONG_VIEW_AZIMUTH_RAD, FLAT_KRATHONG_VIEW_ELEVATION_RAD } from "@/config/fallback2d.config";
import { KRATHONG_HERO_LOD } from "@/config/krathongModel.config";
import { LIGHT_PRESETS } from "@/config/look.config";
import { TOY_MATTE_MATERIALS } from "@/config/scene.config";
import { DEFAULT_KRATHONG_APPEARANCE } from "@/core/customization";
import { buildKrathongLayers2D, flatSurfaceColor } from "@/core/fallback2d/flat";
import { useBuilderStore } from "@/store/useBuilderStore";
import { useDeviceStore } from "@/store/useDeviceStore";
import { FlatKrathongPreview } from "./FlatKrathongPreview";

const VIEW = { azimuthRad: FLAT_KRATHONG_VIEW_AZIMUTH_RAD, elevationRad: FLAT_KRATHONG_VIEW_ELEVATION_RAD, modelYawRad: 0 };
/** "#rrggbb" → the rgb() string jsdom serialises a style colour to. */
const rgb = (hex: string) =>
  `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
const litWater = (preset: "DAY" | "NIGHT") =>
  flatSurfaceColor({ albedo: TOY_MATTE_MATERIALS.water.color, normal: [0, 1, 0] }, LIGHT_PRESETS[preset]);

beforeEach(() => {
  useBuilderStore.setState(useBuilderStore.getInitialState(), true);
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
  useDeviceStore.getState().setLightPresetChoice("DAY");
});
afterEach(cleanup);

describe("FlatKrathongPreview", () => {
  it("T51 draws the default appearance as SVG layers at the hero LOD, no canvas", () => {
    const { container, getByTestId } = render(<FlatKrathongPreview />);
    const section = getByTestId("flat-krathong-preview");
    const expected = buildKrathongLayers2D(DEFAULT_KRATHONG_APPEARANCE, VIEW, { lod: KRATHONG_HERO_LOD, preset: "DAY" });
    expect(section).toHaveAttribute("data-krathong-base", "banana_trunk_01");
    expect(section).toHaveAttribute("data-layer-count", String(expected.length));
    expect(container.querySelectorAll("svg [data-layer-id]")).toHaveLength(expected.length);
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("T52 follows every builder appearance change (lotus base outlines)", () => {
    const { container, getByTestId } = render(<FlatKrathongPreview />);
    const lotus = { ...DEFAULT_KRATHONG_APPEARANCE, base: "lotus_petal_01" as const };
    act(() => useBuilderStore.setState({ appearance: lotus }));
    expect(getByTestId("flat-krathong-preview")).toHaveAttribute("data-krathong-base", "lotus_petal_01");
    const expected = buildKrathongLayers2D(lotus, VIEW, { lod: KRATHONG_HERO_LOD, preset: "DAY" }).find((l) => l.role === "base")!;
    const base = container.querySelector('[data-layer-role="base"]')!;
    expect(base.querySelector("path")).toHaveAttribute("fill", expected.shapes[0].fill);
    const veins = expected.shapes.filter((x) => x.vein !== undefined).length;
    expect(base.querySelectorAll("path")).toHaveLength(expected.shapes.length + veins);
  });

  it("T53 follows the day / night preset: lit water backdrop and relit leaves", () => {
    const { container, getByTestId } = render(<FlatKrathongPreview />);
    const section = getByTestId("flat-krathong-preview");
    expect(section).toHaveAttribute("data-light-preset", "DAY");
    expect(section.style.backgroundColor).toBe(rgb(litWater("DAY")));
    const leafFill = () => container.querySelector('[data-layer-role="leaf"] path')!.getAttribute("fill");
    const dayLeaf = leafFill();
    act(() => useDeviceStore.getState().setLightPresetChoice("NIGHT"));
    expect(section).toHaveAttribute("data-light-preset", "NIGHT");
    expect(section.style.backgroundColor).toBe(rgb(litWater("NIGHT")));
    expect(leafFill()).not.toBe(dayLeaf);
  });

  it("T54 uses the configured viewBox and one soft blob shadow", () => {
    const { container } = render(<FlatKrathongPreview />);
    const { halfExtent: h, centerLift: l } = FLAT_KRATHONG_PREVIEW_VIEW;
    expect(container.querySelector("svg")).toHaveAttribute("viewBox", `${-h} ${-l - h} ${2 * h} ${2 * h}`);
    const blobs = container.querySelectorAll("svg > ellipse");
    expect(blobs).toHaveLength(1);
    expect(blobs[0].getAttribute("fill")).toMatch(/^url\(#/);
    expect(container.querySelector(`radialGradient${"#" + CSS.escape(blobs[0].getAttribute("fill")!.slice(5, -1))}`)).not.toBeNull();
  });
});
