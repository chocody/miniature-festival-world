"use client";

import { useId, useState, type FormEvent } from "react";
import { MODERATION_COPY } from "@/config/moderation.config";
import {
  WISH_COPY,
  WISH_TEXT_MAX_LENGTH,
  WISH_TEXTAREA_ROWS,
  WISH_VISIBILITIES,
  type WishVisibility,
} from "@/config/wish.config";
import { evaluateWishDraft } from "@/services/api/wishPayload";
import { describeModerationReasons, type ModerationReason } from "@/services/moderation";
import { useBuilderStore } from "@/store/useBuilderStore";
import { useDeviceStore } from "@/store/useDeviceStore";
import { OwnershipNotice } from "./OwnershipNotice";

export interface WishModalProps {
  /** Called after the composed wish is in useBuilderStore; FlowRoot dispatches SUBMIT_WISH. */
  onSubmitted: () => void;
}

/** Wish / let-go composer (backlog 4.3): text, explicit private vs anonymous-public choice, live 2.3 guard warning. */
export function WishModal({ onSubmitted }: WishModalProps) {
  const ids = useId();
  const storedWish = useBuilderStore((s) => s.wish);
  const storedServerReasons = useBuilderStore((s) => s.wishServerReasons);
  const submitWish = useBuilderStore((s) => s.submitWish);
  const reducedMotion = useDeviceStore((s) => s.reducedMotion);
  // Initial values only: re-opening the step shows the stored wish; later store changes do not overwrite typing.
  const [text, setText] = useState(storedWish?.text ?? "");
  const [visibility, setVisibility] = useState<WishVisibility | null>(storedWish?.visibility ?? null);
  const [serverReasons, setServerReasons] = useState<readonly ModerationReason[] | null>(storedServerReasons);

  const evaluation = evaluateWishDraft({ text, visibility });
  const reasons = serverReasons ?? (evaluation.ok ? [] : evaluation.moderationReasons);
  const warning = reasons.length > 0 ? describeModerationReasons(reasons) : null;
  const firstIssue = evaluation.ok ? undefined : evaluation.issues.find((i) => i !== "moderation_blocked");
  const status = firstIssue === undefined ? null : WISH_COPY.issues[firstIssue];
  const canSubmit = evaluation.ok && serverReasons === null;
  // Invariant F: colour transitions only, and none under reduced motion.
  const transition = reducedMotion ? "" : " transition-colors";

  const titleId = `${ids}-title`;
  const textId = `${ids}-text`;
  const countId = `${ids}-count`;
  const warningId = `${ids}-warning`;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    if (submitWish({ text, visibility }).ok) onSubmitted();
  };

  return (
    <section
      role="dialog"
      aria-labelledby={titleId}
      data-testid="wish-modal"
      data-reduced-motion={reducedMotion ? "true" : "false"}
      className="flex w-full flex-col gap-4 rounded-3xl border border-black/10 bg-white p-4 shadow-lg dark:border-white/15 dark:bg-zinc-900"
    >
      <h2 id={titleId} className="text-xl font-semibold">
        {WISH_COPY.title}
      </h2>
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={textId} className="text-sm font-medium">
            {WISH_COPY.textLabel}
          </label>
          <textarea
            id={textId}
            value={text}
            rows={WISH_TEXTAREA_ROWS}
            maxLength={WISH_TEXT_MAX_LENGTH}
            placeholder={WISH_COPY.textPlaceholder}
            aria-describedby={warning ? `${countId} ${warningId}` : countId}
            aria-invalid={warning ? true : undefined}
            onChange={(e) => {
              setText(e.target.value);
              setServerReasons(null);
            }}
            className="w-full resize-none rounded-2xl border border-black/15 bg-white p-3 text-base dark:border-white/20 dark:bg-zinc-800"
          />
          <p id={countId} className="self-end text-xs text-zinc-600 dark:text-zinc-300">
            {`${text.length}/${WISH_TEXT_MAX_LENGTH}`}
          </p>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">{WISH_COPY.visibilityLegend}</legend>
          {WISH_VISIBILITIES.map((v) => {
            const option = WISH_COPY.options[v];
            const inputId = `${ids}-vis-${v}`;
            return (
              <label
                key={v}
                htmlFor={inputId}
                data-visibility={v}
                className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border p-3${transition} ${
                  visibility === v
                    ? "border-amber-500 bg-amber-50 dark:bg-amber-400/10"
                    : "border-black/10 dark:border-white/15"
                }`}
              >
                <input
                  id={inputId}
                  type="radio"
                  name={`${ids}-visibility`}
                  value={v}
                  checked={visibility === v}
                  aria-labelledby={`${inputId}-label`}
                  aria-describedby={`${inputId}-desc`}
                  onChange={() => {
                    setVisibility(v);
                    setServerReasons(null);
                  }}
                  className="mt-0.5 h-5 w-5 shrink-0"
                />
                <span className="flex flex-col">
                  <span id={`${inputId}-label`} className="font-semibold">
                    {option.label}
                  </span>
                  <span id={`${inputId}-desc`} className="text-sm text-zinc-600 dark:text-zinc-300">
                    {option.description}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
        {visibility === "public" && (
          <p data-testid="wish-public-hint" className="text-sm text-zinc-700 dark:text-zinc-200">
            {MODERATION_COPY.publicHint}
          </p>
        )}
        {warning && (
          <div
            role="alert"
            id={warningId}
            data-testid="wish-moderation-warning"
            className="rounded-2xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100"
          >
            <p className="font-semibold">{warning.title}</p>
            <ul className="list-disc pl-5">
              {warning.messages.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            <p>{warning.hint}</p>
          </div>
        )}
        {status && (
          <p data-testid="wish-status" aria-live="polite" className="text-sm text-zinc-600 dark:text-zinc-300">
            {status}
          </p>
        )}
        <OwnershipNotice />
        <button
          type="submit"
          disabled={!canSubmit}
          className={`min-h-11 min-w-11 self-end rounded-full bg-zinc-900 px-5 text-white${transition} hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300`}
        >
          {WISH_COPY.submit}
        </button>
      </form>
    </section>
  );
}
