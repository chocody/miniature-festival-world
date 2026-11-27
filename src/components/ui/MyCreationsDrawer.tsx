"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { MY_CREATIONS_COPY as COPY, MY_CREATIONS_MONTHS } from "@/config/myCreations.config";
import { getFindMyCreation, type FindMyCreation } from "@/services/api/findMyCreation";
import { getMyCreationsVault, type MyCreationEntry, type MyCreationsVault } from "@/services/auth/myCreationsVault";
import { useWorldStore } from "@/store/useWorldStore";
import { KrathongIcon, SearchIcon } from "./hudIcons";
import { UI_CLASSES } from "./uiClasses";

/** HUD button recipe (MFW-74): round, 44 px, on the translucent veil; the day/night toggle and rotate use the same recipe. */
const HUD_BUTTON_CLASSES = `${UI_CLASSES.iconButton.replace("bg-paper", "bg-veil")} shadow-float`;

export interface MyCreationsDrawerProps {
  readonly vault?: Pick<MyCreationsVault, "list" | "subscribe">; // default getMyCreationsVault() (resolved in effects/handlers only)
  readonly finder?: Pick<FindMyCreation, "find">; // default getFindMyCreation()
  readonly now?: () => number; // default Date.now
}

export type FindMyStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "searching" }
  | { readonly kind: "found"; readonly zoneId: number }
  | { readonly kind: "not_found" }
  | { readonly kind: "failed" };

const pad2 = (n: number) => String(n).padStart(2, "0");

/** createdAt to an English device-local date, e.g. "26 NOV 2026" (owner decision 2026-11-26; explicit month table, no Intl). */
export function formatPickerDate(createdAt: string): string {
  const d = new Date(createdAt);
  return `${d.getDate()} ${MY_CREATIONS_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** createdAt to a device-local 24-hour time, e.g. "21:05". */
export function formatPickerTime(createdAt: string): string {
  const d = new Date(createdAt);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
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

/**
 * Find My (MFW-30, compact since MFW-74): one round search button. One creation on this device: the button goes straight to it;
 * two or more: it opens a small picker (thumbnail, date, time) beside the button. Hidden without creations. Never reads the owner token.
 */
export function MyCreationsDrawer({
  vault,
  finder,
  now = Date.now,
}: MyCreationsDrawerProps): ReactElement | null {
  const eventId = useWorldStore((s) => s.eventId);
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<readonly MyCreationEntry[]>(NO_ENTRIES);
  const [status, setStatus] = useState<FindMyStatus>(IDLE);
  const requestRef = useRef(0);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

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

  const pickerOpenNow = open && entries.length > 1;
  useEffect(() => {
    if (!pickerOpenNow) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return; // already handled elsewhere
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pickerOpenNow]);

  if (eventId === null || entries.length === 0) return null;

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

  const many = entries.length > 1;
  const pickerOpen = many && open;

  return (
    <div data-testid="my-creations" data-open={String(pickerOpen)} data-entry-count={entries.length} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={COPY.openButton}
        aria-expanded={many ? pickerOpen : undefined}
        className={HUD_BUTTON_CLASSES}
        onClick={() => {
          if (!many) {
            void select(entries[0]);
            return;
          }
          if (!open) refresh();
          setOpen(!open);
        }}
      >
        <SearchIcon />
      </button>
      {pickerOpen && (
        <ul
          aria-label={COPY.title}
          data-testid="my-creations-list"
          className={`${UI_CLASSES.floating} absolute top-0 left-full ml-2 flex max-h-[60dvh] w-max flex-col gap-1 overflow-y-auto p-2`}
        >
          {entries.map((entry) => (
            <li key={entry.id}>
              <button type="button" className={`${UI_CLASSES.listRow} flex items-center gap-2`} onClick={() => void select(entry)}>
                <KrathongIcon className="h-8 w-8" />
                <span>{formatPickerDate(entry.createdAt)}</span>{" "}
                <span>{formatPickerTime(entry.createdAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p role="status" aria-live="polite" data-testid="find-my-status" data-find-my-status={status.kind} className="sr-only">
        {statusText(status)}
      </p>
    </div>
  );
}
