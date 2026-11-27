import type { Page } from "@playwright/test";
import { E2E_DESIGN_USERDATA_KEY } from "../fixtures/krathongModels";
import { E2E_DESIGN_BODY_NAME } from "./sceneProbe";

interface ProbeObject {
  name: string;
  userData?: Record<string, unknown>;
}
interface ProbeWindow {
  __mfwProbe?: { scene: { traverse(visit: (object: ProbeObject) => void): void } | null };
}

/**
 * MFW-78: the design id (`userData[E2E_DESIGN_USERDATA_KEY]`) of every hero design body in the last rendered scene (the customizer
 * hero or the user's own krathong at the pier). Call installSceneProbe before page.goto.
 */
export async function readHeroDesigns(page: Page): Promise<string[]> {
  return page.evaluate(
    ({ name, key }) => {
      const scene = (window as unknown as ProbeWindow).__mfwProbe?.scene;
      if (!scene) return [];
      const found: string[] = [];
      scene.traverse((o) => {
        if (o.name !== name) return;
        const value = o.userData?.[key];
        if (typeof value === "string") found.push(value);
      });
      return found;
    },
    { name: E2E_DESIGN_BODY_NAME, key: E2E_DESIGN_USERDATA_KEY },
  );
}
