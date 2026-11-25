import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FLAT_KRATHONG_PREVIEW_VIEW, FLAT_KRATHONG_VIEW_AZIMUTH_RAD, FLAT_KRATHONG_VIEW_ELEVATION_RAD } from "@/config/fallback2d.config";
import { KRATHONG_BASE_MODELS } from "@/config/krathongModel.config";
import { DEFAULT_KRATHONG_APPEARANCE } from "@/core/customization";
import { buildKrathongLayers2D } from "@/core/fallback2d/flat";
import { useBuilderStore } from "@/store/useBuilderStore";
import { FlatKrathongPreview } from "./FlatKrathongPreview";

beforeEach(() => useBuilderStore.setState(useBuilderStore.getInitialState(), true));
afterEach(cleanup);

describe("FlatKrathongPreview", () => {
  it("draws the default appearance as SVG layers, no canvas", () => {
    const { container, getByTestId } = render(<FlatKrathongPreview />);
    const section = getByTestId("flat-krathong-preview");
    const expected = buildKrathongLayers2D(DEFAULT_KRATHONG_APPEARANCE, {
      azimuthRad: FLAT_KRATHONG_VIEW_AZIMUTH_RAD,
      elevationRad: FLAT_KRATHONG_VIEW_ELEVATION_RAD,
      modelYawRad: 0,
    });
    expect(section).toHaveAttribute("data-krathong-base", "banana_trunk_01");
    expect(section).toHaveAttribute("data-layer-count", String(expected.length));
    expect(container.querySelectorAll("svg [data-layer-id]")).toHaveLength(expected.length);
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("follows every builder appearance change", () => {
    const { container, getByTestId } = render(<FlatKrathongPreview />);
    act(() => useBuilderStore.setState({ appearance: { ...DEFAULT_KRATHONG_APPEARANCE, base: "lotus_petal_01" } }));
    expect(getByTestId("flat-krathong-preview")).toHaveAttribute("data-krathong-base", "lotus_petal_01");
    const base = container.querySelector('[data-layer-role="base"]')!;
    const fills = [...base.querySelectorAll("ellipse")].map((e) => e.getAttribute("fill"));
    expect(fills).toContain(KRATHONG_BASE_MODELS.lotus_petal_01.color);
  });

  it("uses the configured viewBox", () => {
    const { container } = render(<FlatKrathongPreview />);
    const { halfExtent: h, centerLift: l } = FLAT_KRATHONG_PREVIEW_VIEW;
    expect(container.querySelector("svg")).toHaveAttribute("viewBox", `${-h} ${-l - h} ${2 * h} ${2 * h}`);
  });
});
