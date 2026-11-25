"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import {
  MY_CREATIONS_COPY as COPY,
  MY_CREATIONS_TIME_FORMAT,
  MY_CREATIONS_TIME_LOCALE,
} from "@/config/myCreations.config";
import { getFindMyCreation, type FindMyCreation } from "@/services/api/findMyCreation";
import { getMyCreationsVault, type MyCreationEntry, type MyCreationsVault } from "@/services/auth/myCreationsVault";
import { useWorldStore } from "@/store/useWorldStore";

export interface MyCreationsDrawerProps {
  readonly vault?: Pick<MyCreationsVault, "list" | "subscribe">; // default getMyCreationsVault() (resolved in effects/handlers only)
  readonly finder?: Pick<FindMyCreation, "find">; // default getFindMyCreation()
  readonly now?: () => number; // default Date.now
  /** Optional extra control per entry (MFW-31 adds the owner's reader here); FlowRoot passes nothing. */
  readonly renderEntryExtra?: (entry: MyCreationEntry) => ReactNode;
}

export type FindMyStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "searching" }
  | { readonly kind: "found"; readonly zoneId: number }
  | { readonly kind: "not_found" }
  | { readonly kind: "failed" };

/** createdAt to a short device-local Thai date and time, e.g. "25 พ.ย. 13:05". */
export function formatReleaseTime(createdAt: string): string {
  return new Intl.DateTimeFormat(MY_CREATIONS_TIME_LOCALE, MY_CREATIONS_TIME_FORMAT).format(new Date(createdAt));
}

function statusText(status: FindMyStatus): string {
  switch (status.kind) {
    case "searching":
      return COPY.searching;
    case "found":
      return COPY.found(status.zoneId);
    case "not_found":
      return COPY.notFound;
    case "failed":
      return COPY.failed;
    default:
      return "";
  }
}

const NO_ENTRIES: readonly MyCreationEntry[] = Object.freeze([]);
const IDLE: FindMyStatus = Object.freeze({ kind: "idle" });

/** "ค้นหาของฉัน": lists this device's creations and asks Find My to focus one (MFW-30). Never reads the owner token. */
export function MyCreationsDrawer({
  vault,
  finder,
  now = Date.now,
  renderEntryExtra,
}: MyCreationsDrawerProps): ReactElement | null {
  const eventId = useWorldStore((s) => s.eventId);
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<readonly MyCreationEntry[]>(NO_ENTRIES);
  const [status, setStatus] = useState<FindMyStatus>(IDLE);
  const requestRef = useRef(0);
  const listId = useId();

  const refresh = useCallback(() => {
    if (eventId === null) return;
    setEntries((vault ?? getMyCreationsVault()).list(eventId, now()));
  }, [eventId, vault, now]);

  useEffect(() => {
    if (eventId === null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial read of an external (device) store; the list is client-only and cannot be read during render
    refresh();
    const unsubscribe = (vault ?? getMyCreationsVault()).subscribe(refresh);
    return () => {
      unsubscribe();
      requestRef.current += 1; // late results are ignored after unmount
    };
  }, [eventId, vault, refresh]);

  if (eventId === null) return null;

  async function select(entry: MyCreationEntry) {
    const req = ++requestRef.current;
    setStatus({ kind: "searching" });
    let next: FindMyStatus;
    try {
      const outcome = await (finder ?? getFindMyCreation()).find(entry);
      if (req !== requestRef.current) return;
      if (outcome === "focused") {
        next = { kind: "found", zoneId: entry.zoneId };
        setOpen(false);
      } else if (outcome === "not_found") next = { kind: "not_found" };
      else if (outcome === "superseded") next = IDLE;
      else next = { kind: "failed" };
    } catch {
      if (req !== requestRef.current) return;
      next = { kind: "failed" };
    }
    setStatus(next);
  }

  return (
    <div
      data-testid="my-creations"
      data-open={String(open)}
      data-entry-count={entries.length}
      className="mb-4 flex w-full flex-col gap-2 text-sm"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        className="w-full rounded-full border border-amber-300 px-4 py-2 text-left"
        onClick={() => {
          if (!open) refresh();
          setOpen(!open);
        }}
      >
        {COPY.openButton}
      </button>
      {open && (
        <section id={listId} aria-label={COPY.title} data-testid="my-creations-list" className="flex flex-col gap-2">
          <h2 className="font-semibold">{COPY.title}</h2>
          <p>{COPY.deviceOnly}</p>
          {entries.length === 0 ? (
            <p>{COPY.empty}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {entries.map((entry, index) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className="w-full rounded-lg border border-amber-200 px-3 py-2 text-left break-words"
                    onClick={() => void select(entry)}
                  >
                    {COPY.itemLabel(entries.length - index, entry.zoneId, formatReleaseTime(entry.createdAt))}
                  </button>
                  {renderEntryExtra?.(entry)}
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="w-full rounded-full px-4 py-2 text-left underline" onClick={() => setOpen(false)}>
            {COPY.close}
          </button>
        </section>
      )}
      <p role="status" aria-live="polite" data-testid="find-my-status" data-find-my-status={status.kind}>
        {statusText(status)}
      </p>
    </div>
  );
}
