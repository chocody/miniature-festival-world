"use client";

import { useEffect, useRef, useState } from "react";
import { OWNER_WISH_COPY } from "@/config/ownerWish.config";
import { getOwnerWishRevealer, type OwnerWishRevealer } from "@/services/api/ownerWishClient";

export interface PrivateWishRevealProps {
  readonly creationId: string;
  /** Default getOwnerWishRevealer(). Injectable for tests. */
  readonly revealer?: OwnerWishRevealer;
}

type RevealUiState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "revealed"; readonly wishText: string }
  | { readonly kind: "none" }
  | { readonly kind: "failed" };

const BUTTON_CLASS = "min-h-11 min-w-11 rounded-full border border-current px-3";

/** The owner's own private wish, fetched only on tap and kept only in this component's state (never a store, never storage). */
export function PrivateWishReveal({ creationId, revealer }: PrivateWishRevealProps) {
  const [state, setState] = useState<RevealUiState>({ kind: "idle" });
  const requestSeq = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestSeq.current += 1; // drop a late answer after unmount
    };
  }, []);
  const copy = OWNER_WISH_COPY;

  const reveal = () => {
    if (state.kind === "loading") return;
    requestSeq.current += 1;
    const seq = requestSeq.current;
    setState({ kind: "loading" });
    void (revealer ?? getOwnerWishRevealer()).reveal(creationId).then((outcome) => {
      if (!mounted.current || seq !== requestSeq.current) return;
      setState(outcome.kind === "revealed" ? { kind: "revealed", wishText: outcome.wishText } : { kind: outcome.kind });
    });
  };
  const hide = () => {
    requestSeq.current += 1;
    setState({ kind: "idle" });
  };
  const status = state.kind === "none" ? copy.none : state.kind === "failed" ? copy.failed : "";

  return (
    <div className="mt-2" data-owner-wish-state={state.kind}>
      <h3 className="font-semibold">{copy.heading}</h3>
      <p className="text-xs opacity-75">{copy.deviceOnlyNote}</p>
      {state.kind === "revealed" && (
        <>
          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words">{state.wishText}</p>
          <button type="button" className={BUTTON_CLASS} onClick={hide}>{copy.hide}</button>
        </>
      )}
      {state.kind === "idle" && <button type="button" className={BUTTON_CLASS} onClick={reveal}>{copy.reveal}</button>}
      {state.kind === "loading" && <button type="button" className={BUTTON_CLASS} disabled>{copy.revealing}</button>}
      {state.kind === "failed" && <button type="button" className={BUTTON_CLASS} onClick={reveal}>{copy.retry}</button>}
      <p aria-live="polite">{status}</p>
    </div>
  );
}
