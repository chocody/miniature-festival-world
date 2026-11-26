import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FLAT_KRATHONG_VEIN } from "@/config/fallback2d.config";
import type { KrathongLayer2D } from "@/core/fallback2d/flat";
import { FlatKrathongShapes } from "./FlatKrathongShapes";

afterEach(cleanup);

const base: KrathongLayer2D = {
  id: "base",
  role: "base",
  depth: 0,
  shapes: [
    { d: "M 0 0 L 1 0 L 1 1 Z", fill: "#112233" },
    { d: "M 0 0 L 1 0 L 0 1 Z", fill: "#445566" },
  ],
};
const leaf: KrathongLayer2D = {
  id: "leaf-0",
  role: "leaf",
  depth: 1,
  shapes: [{ d: "M 0 0 L 2 0 L 2 2 Z", fill: "#778899", vein: "M 0 0 C 1 1 1 1 2 2", veinStroke: "#596673" }],
};

describe("FlatKrathongShapes (MFW-51)", () => {
  it("T49 one group per part, one path per outline, plus the leaf midrib stroke", () => {
    const { container } = render(
      <svg>
        <FlatKrathongShapes layers={[base, leaf]} />
      </svg>,
    );
    const groups = container.querySelectorAll("g[data-layer-id]");
    expect(groups).toHaveLength(2);
    const baseGroup = container.querySelector('[data-layer-id="base"]')!;
    expect(baseGroup).toHaveAttribute("data-layer-role", "base");
    expect([...baseGroup.querySelectorAll("path")].map((p) => p.getAttribute("fill"))).toEqual(["#112233", "#445566"]);
    const leafGroup = container.querySelector('[data-layer-id="leaf-0"]')!;
    expect(leafGroup).toHaveAttribute("data-layer-role", "leaf");
    const paths = leafGroup.querySelectorAll("path");
    expect(paths).toHaveLength(2);
    expect(paths[0]).toHaveAttribute("fill", "#778899");
    expect(paths[1]).toHaveAttribute("d", leaf.shapes[0].vein);
    expect(paths[1]).toHaveAttribute("fill", "none");
    expect(paths[1]).toHaveAttribute("stroke", "#596673");
    expect(paths[1]).toHaveAttribute("stroke-width", String(FLAT_KRATHONG_VEIN.width));
  });

  it("a single-outline part without a midrib is one path carrying the layer attributes (DOM size)", () => {
    const flame: KrathongLayer2D = { id: "flame", role: "flame", depth: 2, shapes: [{ d: "M 0 0 L 1 0 L 0 1 Z", fill: "#ffffe4" }] };
    const { container } = render(
      <svg>
        <FlatKrathongShapes layers={[flame]} />
      </svg>,
    );
    const el = container.querySelector('[data-layer-id="flame"]')!;
    expect(el.tagName.toLowerCase()).toBe("path");
    expect(el).toHaveAttribute("data-layer-role", "flame");
    expect(el).toHaveAttribute("fill", "#ffffe4");
    expect(container.querySelectorAll("svg > g > *")).toHaveLength(1);
  });

  it("T50 never takes pointer events", () => {
    const { container } = render(
      <svg>
        <FlatKrathongShapes layers={[base]} />
      </svg>,
    );
    expect(container.querySelector("svg > g")).toHaveAttribute("pointer-events", "none");
  });
});
