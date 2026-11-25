"use client";

import { isOwnedCreation } from "@/services/auth/ownedCreationHint";
import type { OwnerWishRevealer } from "@/services/api/ownerWishClient";
import type { WishVisibilitySwitcher } from "@/services/api/wishVisibilityClient";
import { installDeviceOwnedCreationHint } from "./deviceOwnedCreations";
import type { InspectedCreation } from "./inspectedCreation";
import { OwnerWishControls } from "./OwnerWishControls";

installDeviceOwnedCreationHint();

/** Offer the owner controls for every krathong this device lists as its own, open or closed (the switch works both ways). MFW-63. */
export function shouldOfferOwnerControls(
  creation: Pick<InspectedCreation, "id">,
  isOwned: (creationId: string) => boolean = isOwnedCreation,
): boolean {
  return isOwned(creation.id);
}

export interface OwnerWishSectionProps {
  readonly creation: InspectedCreation;
  readonly isOwned?: (creationId: string) => boolean; // default isOwnedCreation
  readonly revealer?: OwnerWishRevealer;
  readonly switcher?: WishVisibilitySwitcher;
}

export function OwnerWishSection({ creation, isOwned, revealer, switcher }: OwnerWishSectionProps) {
  if (!shouldOfferOwnerControls(creation, isOwned)) return null;
  return (
    <OwnerWishControls
      key={creation.id}
      creationId={creation.id}
      knownOpen={creation.publicWishText !== null}
      switcher={switcher}
      revealer={revealer}
    />
  );
}
