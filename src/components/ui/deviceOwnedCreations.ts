import { FESTIVAL_EVENT_IDS } from "@/config/events/types";
import { getMyCreationsVault, type MyCreationsVault } from "@/services/auth/myCreationsVault";
import { registerOwnedCreationPredicate } from "@/services/auth/ownedCreationHint";

/** true when this device's creation list (owner decision 12) holds `creationId` for any event. Never throws. */
export function deviceListsCreation(
  creationId: string,
  vault: Pick<MyCreationsVault, "list"> | null = null,
  nowMs: number = Date.now(),
): boolean {
  try {
    const source = vault ?? getMyCreationsVault(); // lazy: getMyCreationsVault throws on the server
    return FESTIVAL_EVENT_IDS.some((eventId) => source.list(eventId, nowMs).some((entry) => entry.id === creationId));
  } catch {
    return false;
  }
}

let installed = false;
/** Registers deviceListsCreation as the owned-creation hint once per page. Safe on the server (the predicate is lazy). */
export function installDeviceOwnedCreationHint(): void {
  if (installed) return;
  installed = true;
  registerOwnedCreationPredicate((creationId) => deviceListsCreation(creationId));
}
