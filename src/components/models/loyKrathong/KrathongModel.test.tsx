import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RIM_SOCKET_COUNT } from "@/config/events/loyKrathong.config";
import { KRATHONG_INCENSE_MODEL, KRATHONG_LEAF_COUNT } from "@/config/krathongModel.config";
import { DEFAULT_KRATHONG_APPEARANCE } from "@/core/customization";
import { KrathongAssetsProvider, useKrathongAssets } from "./KrathongAssetsProvider";
import type { KrathongAssets } from "./krathongAssets";
import { KrathongModel } from "./KrathongModel";

vi.mock("@react-three/fiber", () => ({ useFrame: () => {} }));

afterEach(cleanup);

const count = (c: HTMLElement, selector: string) => c.querySelectorAll(selector).length;

describe("KrathongModel", () => {
  it("renders every part, with candle parts inside the center_socket anchor", () => {
    const { container } = render(
      <KrathongAssetsProvider>
        <KrathongModel appearance={DEFAULT_KRATHONG_APPEARANCE} shadows={false} />
      </KrathongAssetsProvider>,
    );
    expect(count(container, '[name="krathong-model"]')).toBe(1);
    expect(count(container, 'mesh[name="base"]')).toBe(1);
    expect(count(container, 'mesh[name^="leaf_"]')).toBe(KRATHONG_LEAF_COUNT);
    expect(count(container, 'mesh[name^="flower_"]')).toBe(RIM_SOCKET_COUNT);
    expect(count(container, '[name="center_socket"] mesh[name="candle"]')).toBe(1);
    expect(count(container, '[name="center_socket"] mesh[name="flame"]')).toBe(1);
    expect(count(container, '[name="center_socket"] mesh[name^="incense_"]')).toBe(KRATHONG_INCENSE_MODEL.count);
    expect(count(container, 'mesh[name="candle"]')).toBe(1);
  });

  it("renders only the chosen flowers", () => {
    const { container } = render(
      <KrathongAssetsProvider>
        <KrathongModel appearance={{ ...DEFAULT_KRATHONG_APPEARANCE, flowers: ["orchid", null, "lotus"] }} shadows={false} />
      </KrathongAssetsProvider>,
    );
    const names = [...container.querySelectorAll('mesh[name^="flower_"]')].map((m) => m.getAttribute("name"));
    expect(names).toEqual(["flower_rim_socket_0", "flower_rim_socket_2"]);
  });

  it("throws without the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(<KrathongModel appearance={DEFAULT_KRATHONG_APPEARANCE} shadows={false} />),
    ).toThrow("useKrathongAssets must be used inside <KrathongAssetsProvider>");
    spy.mockRestore();
  });

  it("shares one assets object per provider and disposes it on unmount", () => {
    const seen: KrathongAssets[] = [];
    function Probe() {
      seen.push(useKrathongAssets());
      return null;
    }
    const { unmount } = render(
      <KrathongAssetsProvider>
        <Probe />
        <KrathongModel appearance={DEFAULT_KRATHONG_APPEARANCE} shadows={false} />
        <KrathongModel appearance={DEFAULT_KRATHONG_APPEARANCE} shadows={false} />
      </KrathongAssetsProvider>,
    );
    const assets = seen[0];
    expect(seen.every((s) => s === assets)).toBe(true);
    const spies = [...assets.listGeometries(), ...assets.listMaterials()].map((o) => vi.spyOn(o, "dispose"));
    unmount();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });
});
