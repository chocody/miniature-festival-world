"use client";

import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import {
  getOwnedWishStateReader,
  syncWorldAfterSwitch,
  type OwnedWishStateReader,
  type OwnedWishZone,
} from "@/services/api/ownedWishState";
import type { OwnerWishRevealer } from "@/services/api/ownerWishClient";
import { getWishVisibilitySwitcher, type WishVisibilitySwitcher } from "@/services/api/wishVisibilityClient";
import { describeModerationReasons, type ModerationReason } from "@/services/moderation";
import { PrivateWishReveal } from "./PrivateWishReveal";
import { useEventCopy } from "./EventCopyContext";
import { UI_CLASSES } from "./uiClasses";
import { WishVisibilitySwitch } from "./WishVisibilitySwitch";

export interface OwnerWishControlsProps {
  readonly creationId: string;
  /** State from the public row (inspect popup). When undefined, it is read from `zone` with `stateReader` (My Creations). */
  readonly knownOpen?: boolean;
  readonly zone?: OwnedWishZone; // a MyCreationEntry fits structurally
  readonly switcher?: WishVisibilitySwitcher; // default getWishVisibilitySwitcher()
  readonly stateReader?: OwnedWishStateReader; // default getOwnedWishStateReader()
  readonly revealer?: OwnerWishRevealer; // passed to PrivateWishReveal
  readonly onSwitched?: (creationId: string, open: boolean) => void; // default (id, o) => void syncWorldAfterSwitch(id, o)
}

type ControlsMessage = null | "switchedOn" | "switchedOff" | "hidden" | "notFound" | "failed" | "blocked";
interface ControlsState {
  readonly view: "loading" | "unknown" | "ready";
  readonly open: boolean;
  readonly pending: boolean;
  readonly locked: boolean; // true after hidden / not_found (owner decision 36: a hidden wish cannot be opened again)
  readonly message: ControlsMessage;
  readonly reasons: readonly ModerationReason[];
}

const NO_REASONS: readonly ModerationReason[] = Object.freeze([]);
const defaultOnSwitched = (creationId: string, open: boolean): void => {
  void syncWorldAfterSwitch(creationId, open);
};

function initialState(knownOpen: boolean | undefined, hasZone: boolean): ControlsState {
  const view = knownOpen !== undefined ? "ready" : hasZone ? "loading" : "unknown";
  return { view, open: knownOpen ?? false, pending: false, locked: false, message: null, reasons: NO_REASONS };
}

/**
 * Owner-only "เปิดให้ทุกคนเห็น" switch (backlog 12.2) for My Creations and the inspect popup owner section, plus the private
 * wish reveal while the switch is off. Holds no name or wish text and touches no device storage; the token is read by the
 * switch client at request time. Static UI (no motion classes).
 */
export function OwnerWishControls({
  creationId,
  knownOpen,
  zone,
  switcher,
  stateReader,
  revealer,
  onSwitched = defaultOnSwitched,
}: OwnerWishControlsProps): ReactElement {
  const copy = useEventCopy().ownerSwitch;
  const statusId = useId();
  const [state, setState] = useState<ControlsState>(() => initialState(knownOpen, zone !== undefined));
  // The drawer reads the state once per mount; the popup gets it from the public row.
  const [readsFromZone] = useState(() => knownOpen === undefined && zone !== undefined);
  const [seenKnownOpen, setSeenKnownOpen] = useState(knownOpen);
  const latestKnownOpen = useRef(knownOpen);
  const requestSeq = useRef(0);
  const mounted = useRef(false);
  const pendingRef = useRef(false);

  useEffect(() => {
    latestKnownOpen.current = knownOpen;
  }, [knownOpen]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestSeq.current += 1; // drop a late answer after unmount
    };
  }, []);

  // A newer public row (e.g. after a zone refresh) while idle: adopt it.
  if (knownOpen !== seenKnownOpen && !state.pending) {
    setSeenKnownOpen(knownOpen);
    if (knownOpen !== undefined) setState({ ...state, view: "ready", open: knownOpen });
  }

  const zoneEventId = zone?.eventId;
  const zoneId = zone?.zoneId;
  const [readTick, setReadTick] = useState(0); // bumped by "retry"
  useEffect(() => {
    if (!readsFromZone || zoneEventId === undefined || zoneId === undefined) return;
    requestSeq.current += 1;
    const seq = requestSeq.current;
    void (stateReader ?? getOwnedWishStateReader())
      .read(creationId, { eventId: zoneEventId, zoneId })
      .then((result) => {
        if (!mounted.current || seq !== requestSeq.current) return;
        setState((s) =>
          result === "unknown" ? { ...s, view: "unknown" } : { ...s, view: "ready", open: result === "open" },
        );
      });
  }, [readsFromZone, creationId, zoneEventId, zoneId, stateReader, readTick]);

  const retry = () => {
    if (state.view !== "unknown") return;
    setState((s) => ({ ...s, view: "loading" }));
    setReadTick((t) => t + 1);
  };

  const toggle = () => {
    if (state.view !== "ready" || state.pending || state.locked || pendingRef.current) return;
    const next = !state.open;
    pendingRef.current = true;
    requestSeq.current += 1;
    const seq = requestSeq.current;
    setState((s) => ({ ...s, pending: true, message: null, reasons: NO_REASONS }));
    void (switcher ?? getWishVisibilitySwitcher()).setOpen(creationId, next).then((outcome) => {
      if (!mounted.current || seq !== requestSeq.current) return;
      pendingRef.current = false;
      // The server answer is newer than any public row seen while it was pending.
      setSeenKnownOpen(latestKnownOpen.current);
      switch (outcome.kind) {
        case "switched":
          setState((s) => ({
            ...s,
            pending: false,
            open: outcome.open,
            message: outcome.open ? "switchedOn" : "switchedOff",
          }));
          try {
            onSwitched(creationId, outcome.open);
          } catch {
            /* the control already shows the answer */
          }
          return;
        case "moderation_blocked":
          setState((s) => ({ ...s, pending: false, open: false, message: "blocked", reasons: outcome.reasons }));
          return;
        case "hidden":
          setState((s) => ({ ...s, pending: false, open: false, locked: true, message: "hidden" }));
          return;
        case "not_found":
          setState((s) => ({ ...s, pending: false, locked: true, message: "notFound" }));
          return;
        default:
          setState((s) => ({ ...s, pending: false, message: "failed" }));
      }
    });
  };

  const warning = state.message === "blocked" ? describeModerationReasons(state.reasons) : null;
  const statusText =
    state.view === "loading"
      ? copy.loading
      : state.view === "unknown"
        ? copy.loadFailed
        : state.pending
          ? copy.saving
          : state.message === null || state.message === "blocked"
            ? ""
            : copy[state.message];

  return (
    <div
      className={`mt-3 flex flex-col gap-2 ${UI_CLASSES.inset}`}
      data-testid="owner-wish-controls"
      data-wish-open={state.view === "ready" ? String(state.open) : "unknown"}
      data-switch-pending={state.pending ? "true" : "false"}
    >
      <h3 className={UI_CLASSES.subheading}>{copy.heading}</h3>
      {state.view === "ready" && (
        <WishVisibilitySwitch
          checked={state.open}
          onToggle={toggle}
          disabled={state.locked}
          busy={state.pending}
          animate={false}
          describedBy={statusId}
        />
      )}
      {state.view === "unknown" && zone && (
        <button type="button" className={UI_CLASSES.secondaryButton} onClick={retry}>
          {copy.retryLoad}
        </button>
      )}
      {warning && (
        <div role="alert" className={UI_CLASSES.alert}>
          <p className="font-semibold">{warning.title}</p>
          <ul className="list-disc pl-5">
            {warning.messages.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <p>{copy.stayedPrivate}</p>
        </div>
      )}
      <p id={statusId} aria-live="polite" className={UI_CLASSES.caption}>
        {statusText}
      </p>
      {state.view === "ready" && !state.open && <PrivateWishReveal creationId={creationId} revealer={revealer} />}
    </div>
  );
}
