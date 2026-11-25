/**
 * Device-local hint "this creation was made on this device" (owner decision 12: MFW-30 keeps the ids in LocalStorage).
 * Only decides whether the UI OFFERS the private-wish reveal; the server alone decides ownership (owner proof, open question 1).
 * Creation ids are public, so this module holds no secret. Not reactive: read at render time.
 */
export type OwnedCreationPredicate = (creationId: string) => boolean;

const NOTHING_OWNED: OwnedCreationPredicate = () => false;
let current: OwnedCreationPredicate = NOTHING_OWNED;

/** MFW-30 registers its device creation-id list here. Returns an unregister function (no-op if another predicate replaced it). */
export function registerOwnedCreationPredicate(predicate: OwnedCreationPredicate): () => void {
  current = predicate;
  return () => {
    if (current === predicate) current = NOTHING_OWNED;
  };
}

/** false for "" and non-strings; a throwing or non-boolean predicate counts as false. */
export function isOwnedCreation(creationId: string): boolean {
  if (typeof creationId !== "string" || creationId === "") return false;
  try {
    return current(creationId) === true;
  } catch {
    return false;
  }
}
