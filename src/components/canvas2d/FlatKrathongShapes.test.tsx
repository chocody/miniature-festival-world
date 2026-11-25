import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { trianglePoints, type KrathongLayer2D } from "@/core/fallback2d/flat";
import { FlatKrathongShapes } from "./FlatKrathongShapes";

afterEach(cleanup);

const puck: KrathongLayer2D = {
  kind: "puck", id: "base", role: "base", depth: 0, fill: "#112233", sideFill: "#445566",
  cx: 0, topY: -1, bottomY: 1, topRx: 2, topRy: 1, bottomRx: 3, bottomRy: 1,
};
const tri: KrathongLayer2D = { kind: "triangle", id: "leaf-0", role: "leaf", depth: 1, fill: "#778899", points: [0, 1, 2, 3, 4, 5] };

describe("FlatKrathongShapes", () => {
  it("draws a puck as a side path plus a top ellipse and a triangle as a polygon", () => {
    const { container } = render(
      <svg>
        <FlatKrathongShapes layers={[puck, tri]} />
      </svg>,
    );
    const group = container.querySelector("svg > g")!;
    expect(group).toHaveAttribute("pointer-events", "none");
    const puckGroup = container.querySelector('[data-layer-id="base"]')!;
    expect(puckGroup).toHaveAttribute("data-layer-role", "base");
    expect(puckGroup.querySelectorAll("path")).toHaveLength(1);
    expect(puckGroup.querySelector("path")).toHaveAttribute("fill", "#445566");
    expect(puckGroup.querySelectorAll("ellipse")).toHaveLength(1);
    expect(puckGroup.querySelector("ellipse")).toHaveAttribute("fill", "#112233");
    const polygon = container.querySelector("polygon")!;
    expect(polygon).toHaveAttribute("points", trianglePoints(tri as Extract<KrathongLayer2D, { kind: "triangle" }>));
    expect(polygon).toHaveAttribute("data-layer-role", "leaf");
  });
});
