import { createChristmasReleaseAdapter } from "./christmasReleaseAdapter";
import { createLoyReleaseAdapter, type LoyReleaseAdapterDeps } from "./loyReleaseAdapter";
import type { ReleaseAdapterRegistry } from "./releaseAdapter";

/** The registry: a new event adds one adapter file and one entry here. */
export function createDefaultReleaseAdapters(deps?: LoyReleaseAdapterDeps): ReleaseAdapterRegistry {
  return new Map([
    ["loy_krathong", createLoyReleaseAdapter(deps)],
    ["christmas", createChristmasReleaseAdapter()],
  ]);
}
