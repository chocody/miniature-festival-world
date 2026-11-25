// @vitest-environment node
// Client ↔ real handler (MFW-62), no network.
import { describe, expect, it } from "vitest";
import { CREATE_NOW_MS } from "./__fixtures__/createCreation";
import { makeNewCreation } from "./__fixtures__/creations";
import { DAY_MS, OTHER_OWNER_TOKEN_FIXTURE, OWNER_TOKEN_FIXTURE, seedWishSwitchRepository } from "./__fixtures__/wishVisibility";
import { createWishVisibilitySwitcher } from "./wishVisibilityClient";
import { handleWishVisibilitySwitch } from "./wishVisibilitySwitch";

async function setup(token: string = OWNER_TOKEN_FIXTURE) {
  const seeded = await seedWishSwitchRepository();
  const switcher = createWishVisibilitySwitcher({
    fetch: (url, init) => handleWishVisibilitySwitch(new Request("http://localhost" + url, init), seeded.deps),
    readOwnerToken: () => token as never,
  });
  return { seeded, switcher };
}

async function publicTextOf(seeded: Awaited<ReturnType<typeof seedWishSwitchRepository>>, id: string) {
  const zone = await seeded.repo.listPublicZone({ eventId: "loy_krathong", zoneId: 1 } as never);
  return zone.find((c) => c.id === id)?.publicWishText ?? null;
}

describe("wish visibility client ↔ handler", () => {
  it("opens, closes and reopens with the owner token", async () => {
    const { seeded, switcher } = await setup();
    const id = seeded.privateNamedId;
    expect(await switcher.setOpen(id, true)).toEqual({ kind: "switched", open: true });
    expect(await publicTextOf(seeded, id)).not.toBeNull();
    expect(await switcher.setOpen(id, false)).toEqual({ kind: "switched", open: false });
    expect(await publicTextOf(seeded, id)).toBeNull();
    expect(await switcher.setOpen(id, true)).toEqual({ kind: "switched", open: true });
  });

  it("another device's token gets not_found", async () => {
    const { seeded, switcher } = await setup(OTHER_OWNER_TOKEN_FIXTURE);
    expect(await switcher.setOpen(seeded.privateNamedId, true)).toEqual({ kind: "not_found" });
  });

  it("a private wish with a phone number is blocked and stays private", async () => {
    const { seeded, switcher } = await setup();
    const row = await seeded.repo.insertCreation(
      makeNewCreation({
        publicWishText: null,
        ownerTokenHash: seeded.ownerHash,
        privateWish: await seeded.cipher.encrypt("โทร 0812345678", seeded.ownerHash),
        expiresAt: new Date(CREATE_NOW_MS + DAY_MS),
      }),
    );
    expect(await switcher.setOpen(row.id, true)).toEqual({ kind: "moderation_blocked", reasons: ["phone"] });
    expect(await publicTextOf(seeded, row.id)).toBeNull();
  });
});
