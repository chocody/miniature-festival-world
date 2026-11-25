"use client";

import { isOwnedCreation } from "@/services/auth/ownedCreationHint";
import type { OwnerWishRevealer } from "@/services/api/ownerWishClient";
import { installDeviceOwnedCreationHint } from "./deviceOwnedCreations";
import type { InspectedCreation } from "./inspectedCreation";
import { PrivateWishReveal } from "./PrivateWishReveal";

installDeviceOwnedCreationHint();

/** Offer the reveal only for a krathong with a private wish (no public text) that this device lists as its own. */
export function shouldOfferOwnerWishReveal(
  creation: Pick<InspectedCreation, "id" | "publicWishText">,
  isOwned: (creationId: string) => boolean = isOwnedCreation,
): boolean {
  return creation.publicWishText === null && isOwned(creation.id);
}

export interface OwnerWishSectionProps {
  readonly creation: InspectedCreation;
  readonly isOwned?: (creationId: string) => boolean; // default isOwnedCreation
  readonly revealer?: OwnerWishRevealer;
}

export function OwnerWishSection({ creation, isOwned, revealer }: OwnerWishSectionProps) {
  if (!shouldOfferOwnerWishReveal(creation, isOwned)) return null;
  return <PrivateWishReveal key={creation.id} creationId={creation.id} revealer={revealer} />;
}
